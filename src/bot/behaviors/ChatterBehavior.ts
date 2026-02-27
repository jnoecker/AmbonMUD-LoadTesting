import type { Bot } from '../Bot.ts';
import type { ChatterBehaviorConfig } from '../../config/schema.ts';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Chatter: sends random messages on configured channels at a set interval.
 */
export class ChatterBehavior {
  constructor(private cfg: ChatterBehaviorConfig) {}

  async run(bot: Bot, signal: AbortSignal): Promise<void> {
    const channels = this.cfg.channels.length > 0 ? this.cfg.channels : ['gossip'];
    const messages = this.cfg.messages.length > 0 ? this.cfg.messages : ['Hello!'];

    try {
      while (!signal.aborted) {
        const channel = pick(channels);
        const message = pick(messages);
        bot.sendText(`${channel} ${message}\r\n`);
        await sleep(this.cfg.messageIntervalMs, signal);
      }
    } catch {
      // Aborted
    }
  }
}
