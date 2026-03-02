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

const OPPOSITE: Record<string, string> = {
  north: 'south', south: 'north',
  east: 'west',   west: 'east',
  up: 'down',     down: 'up',
  northeast: 'southwest', southwest: 'northeast',
  northwest: 'southeast', southeast: 'northwest',
};

/** How many room IDs to remember when preferring unvisited exits. */
const VISITED_CAP = 20;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Wanderer: navigates the labyrinth by:
 *  1. Preferring exits whose destination rooms have not been recently visited
 *  2. Avoiding immediate backtracking (not reversing the last direction taken)
 *  3. Falling back gracefully when the above constraints can't all be satisfied
 */
export class WandererBehavior {
  /** Full exits map from the most recent Room.Info: direction → dest room ID */
  private exits: Record<string, string> = {};
  /** Direction of the last successful move, used to avoid immediate reversal */
  private lastDir: string | null = null;
  /** Ring buffer of recently visited room IDs */
  private visited: string[] = [];

  constructor(private cfg: WandererBehaviorConfig) {}

  async run(bot: Bot, signal: AbortSignal): Promise<void> {
    const roomHandler = (pkg: string, data: unknown) => {
      if (pkg === 'Room.Info') {
        const info = data as { id?: string; exits?: Record<string, string> };
        this.exits = info.exits ?? {};
        if (info.id) {
          this.visited.push(info.id);
          if (this.visited.length > VISITED_CAP) this.visited.shift();
        }
      }
    };
    bot.on('gmcp', roomHandler);
    // Bootstrap: the initial Room.Info was emitted before this behavior started.
    // Re-request it so we get exits before the first move attempt.
    bot.sendText('look\r\n');

    try {
      while (!signal.aborted) {
        const dir = this.pickDirection();
        if (dir) {
          this.lastDir = dir;
          bot.sendText(`${DIRECTION_COMMANDS[dir] ?? dir}\r\n`);
        }
        await sleep(this.cfg.moveIntervalMs, signal);
      }
    } catch {
      // Aborted
    } finally {
      bot.off('gmcp', roomHandler);
    }
  }

  private pickDirection(): string | null {
    const dirs = Object.keys(this.exits);
    if (dirs.length === 0) return null;

    const backDir = this.lastDir ? OPPOSITE[this.lastDir] : null;
    // The last N destinations we've been to — avoid going back to them.
    const recentDests = new Set(this.visited.slice(-10));

    // Tier 1: not recently visited AND not doubling back
    let cands = dirs.filter(d => d !== backDir && !recentDests.has(this.exits[d]));
    if (cands.length > 0) return pick(cands);

    // Tier 2: allow revisiting a known room, but still no immediate backtrack
    cands = dirs.filter(d => d !== backDir);
    if (cands.length > 0) return pick(cands);

    // Tier 3: dead end — only exit is back the way we came; allow it
    return pick(dirs);
  }
}
