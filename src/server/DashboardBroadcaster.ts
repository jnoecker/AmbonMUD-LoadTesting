import type { ServerWebSocket } from 'bun';
import type { MetricsStore } from '../metrics/MetricsStore.ts';
import type { PoolSnapshot } from '../config/schema.ts';

export class DashboardBroadcaster {
  private clients = new Set<ServerWebSocket<unknown>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private selectedBots = new Map<ServerWebSocket<unknown>, string>();

  constructor(
    private metrics: MetricsStore,
    private getPools: () => PoolSnapshot[],
  ) {}

  addClient(ws: ServerWebSocket<unknown>): void {
    this.clients.add(ws);
    // Send immediate snapshot
    this.sendSnapshot(ws);
  }

  removeClient(ws: ServerWebSocket<unknown>): void {
    this.clients.delete(ws);
    this.selectedBots.delete(ws);
  }

  handleClientMessage(ws: ServerWebSocket<unknown>, raw: string): void {
    try {
      const msg = JSON.parse(raw) as { type: string; botId?: string };
      if (msg.type === 'SELECT_BOT' && msg.botId) {
        this.selectedBots.set(ws, msg.botId);
        this.sendBotLog(ws, msg.botId);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  start(): void {
    this.timer = setInterval(() => {
      for (const ws of this.clients) {
        try {
          this.sendSnapshot(ws);
          // Send bot log if a bot is selected
          const botId = this.selectedBots.get(ws);
          if (botId) this.sendBotLog(ws, botId);
        } catch {
          // Client disconnected — remove so it stops being iterated
          this.removeClient(ws);
        }
      }
    }, 500);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private sendSnapshot(ws: ServerWebSocket<unknown>): void {
    const data = this.metrics.swarmMetrics();
    ws.send(JSON.stringify({ type: 'SNAPSHOT', ...data, pools: this.getPools() }));
  }

  private sendBotLog(ws: ServerWebSocket<unknown>, botId: string): void {
    const bot = this.metrics.getBot(botId);
    if (!bot) return;
    ws.send(JSON.stringify({
      type: 'BOT_LOG',
      botId,
      entries: bot.getLogs(),
    }));
  }
}
