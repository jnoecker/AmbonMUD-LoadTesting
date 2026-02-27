import { LatencyTracker } from './LatencyTracker.ts';
import type { Bot } from '../bot/Bot.ts';
import type {
  BotSnapshot,
  LatencyMetrics,
  RampPoint,
  SwarmMetrics,
  SwarmState,
} from '../config/schema.ts';

export class MetricsStore {
  private bots = new Map<string, Bot>();
  private latency = new LatencyTracker();
  private rampHistory: RampPoint[] = [];
  private _state: SwarmState = 'idle';

  get state(): SwarmState { return this._state; }
  setState(s: SwarmState): void { this._state = s; }

  registerBot(bot: Bot): void {
    this.bots.set(bot.id, bot);

    bot.on('latency', (ms: number) => {
      this.latency.record(ms);
    });

  }

  unregisterBot(botId: string): void {
    this.bots.delete(botId);
  }

  getBot(botId: string): Bot | undefined {
    return this.bots.get(botId);
  }

  activeBotCount(): number {
    return [...this.bots.values()].filter(
      b => b.state === 'running' || b.state === 'logging-in'
    ).length;
  }

  addRampPoint(target: number, actual = this.activeBotCount()): void {
    this.rampHistory.push({ ts: Date.now(), target, actual });
    // Keep last 300 points (5 min at 1s intervals)
    if (this.rampHistory.length > 300) {
      this.rampHistory.shift();
    }
  }

  snapshots(): BotSnapshot[] {
    return [...this.bots.values()].map(b => b.snapshot());
  }

  latencyMetrics(): LatencyMetrics {
    return {
      p50: this.latency.p50(),
      p95: this.latency.p95(),
      p99: this.latency.p99(),
    };
  }

  swarmMetrics(): Omit<SwarmMetrics, 'pools'> {
    return {
      state: this._state,
      bots: this.snapshots(),
      metrics: this.latencyMetrics(),
      rampHistory: [...this.rampHistory],
      errorCount: [...this.bots.values()].filter(b => b.state === 'error').length,
    };
  }

  reset(): void {
    this.bots.clear();
    this.latency.reset();
    this.rampHistory = [];
  }
}
