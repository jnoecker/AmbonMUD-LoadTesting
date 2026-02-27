import type { Bot } from '../Bot.ts';
import type { IdlerBehaviorConfig } from '../../config/schema.ts';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

/**
 * Idler: periodically sends Core.Ping and measures RTT.
 */
export class IdlerBehavior {
  constructor(private cfg: IdlerBehaviorConfig) {}

  async run(bot: Bot, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.ping(bot, signal);
      try {
        await sleep(this.cfg.pingIntervalMs, signal);
      } catch {
        break;
      }
    }
  }

  private ping(bot: Bot, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      if (signal.aborted) { resolve(); return; }
      const sentAt = Date.now();
      bot.sendGmcp('Core.Ping', {});

      const handler = (pkg: string) => {
        if (pkg === 'Core.Ping') {
          const rtt = Date.now() - sentAt;
          bot.updateLatency(rtt);
          bot.emit('latency', rtt);
          bot.off('gmcp', handler);
          resolve();
        }
      };
      bot.on('gmcp', handler);

      // Timeout ping after 10s — record the max value so slow servers show in metrics
      const t = setTimeout(() => {
        bot.off('gmcp', handler);
        bot.updateLatency(10_000);
        bot.emit('latency', 10_000);
        resolve();
      }, 10_000);
      signal.addEventListener('abort', () => { clearTimeout(t); bot.off('gmcp', handler); resolve(); }, { once: true });
    });
  }
}
