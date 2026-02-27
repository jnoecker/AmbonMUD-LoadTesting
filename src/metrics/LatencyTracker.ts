const RING_SIZE = 1000;

/**
 * Ring-buffer latency tracker that computes p50/p95/p99 from the last N samples.
 */
export class LatencyTracker {
  private ring: number[] = [];
  private head = 0;
  private count = 0;

  record(ms: number): void {
    if (this.ring.length < RING_SIZE) {
      this.ring.push(ms);
    } else {
      this.ring[this.head] = ms;
    }
    this.head = (this.head + 1) % RING_SIZE;
    this.count = Math.min(this.count + 1, RING_SIZE);
  }

  percentile(p: number): number | null {
    if (this.count === 0) return null;
    const sorted = this.ring.slice(0, this.count).sort((a, b) => a - b);
    // Nearest-rank method: ceil((p/100) * N) - 1. Math.max guards the p=0 edge case.
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  p50(): number | null { return this.percentile(50); }
  p95(): number | null { return this.percentile(95); }
  p99(): number | null { return this.percentile(99); }

  reset(): void {
    this.ring = [];
    this.head = 0;
    this.count = 0;
  }
}
