/**
 * Gradually adds bots up to `targetCount` over `rampUpSeconds`.
 * Calls `addOne` once per interval until target is reached.
 */
export class RampScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private targetCount: number;
  private rampUpSeconds: number;

  constructor(
    targetCount: number,
    rampUpSeconds: number,
    private getCurrentCount: () => number,
    private addOne: () => Promise<void>,
  ) {
    this.targetCount = targetCount;
    this.rampUpSeconds = rampUpSeconds;
  }

  start(): void {
    if (this.timer || this.targetCount === 0) return;

    if (this.rampUpSeconds <= 0) {
      void this.drainImmediately();
      return;
    }

    this.timer = setInterval(() => {
      if (this.getCurrentCount() >= this.targetCount) {
        this.stop();
        return;
      }

      void this.addOne().catch((err) => {
        console.error('[RampScheduler] addOne error:', err);
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  updateTarget(targetCount: number, rampUpSeconds = this.rampUpSeconds): void {
    this.targetCount = targetCount;
    this.rampUpSeconds = rampUpSeconds;

    if (this.getCurrentCount() >= this.targetCount) {
      this.stop();
      return;
    }

    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  get target(): number {
    return this.targetCount;
  }

  get isRunning(): boolean { return this.timer !== null; }

  private get intervalMs(): number {
    return Math.max(100, (this.rampUpSeconds * 1000) / Math.max(1, this.targetCount));
  }

  private async drainImmediately(): Promise<void> {
    while (this.getCurrentCount() < this.targetCount) {
      try {
        await this.addOne();
      } catch (err) {
        console.error('[RampScheduler] addOne error:', err);
        // Don't break — keep ramping remaining bots even if one fails
        continue;
      }
    }
  }
}
