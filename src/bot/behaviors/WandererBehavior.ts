import type { Bot } from '../Bot.ts';
import type { WandererBehaviorConfig } from '../../config/schema.ts';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

const DIRECTION_COMMANDS: Record<string, string> = {
  north: 'n', south: 's', east: 'e', west: 'w',
  up: 'u', down: 'd',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
};

/**
 * Wanderer: navigates randomly by picking exits from Room.Info GMCP.
 */
export class WandererBehavior {
  private exits: string[] = [];

  constructor(private cfg: WandererBehaviorConfig) {}

  async run(bot: Bot, signal: AbortSignal): Promise<void> {
    // Listen for Room.Info to update our exit list
    const roomHandler = (_pkg: string, data: unknown) => {
      const pkg = _pkg;
      if (pkg === 'Room.Info') {
        const info = data as { exits?: Record<string, string> };
        this.exits = Object.keys(info.exits ?? {});
      }
    };
    bot.on('gmcp', roomHandler);

    try {
      while (!signal.aborted) {
        if (this.exits.length > 0) {
          const dir = this.exits[Math.floor(Math.random() * this.exits.length)];
          const cmd = DIRECTION_COMMANDS[dir] ?? dir;
          bot.sendText(`${cmd}\r\n`);
        }
        await sleep(this.cfg.moveIntervalMs, signal);
      }
    } catch {
      // Aborted
    } finally {
      bot.off('gmcp', roomHandler);
    }
  }
}
