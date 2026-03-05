import logger from '../../logger';

type RuntimeMetricsSnapshot = {
  running: boolean;
  tickMs: number;
  eventLoopLagMs: number;
  eventLoopLagP95Ms: number;
  maxEventLoopLagMs: number;
};

class RuntimeMetricsMonitor {
  private readonly tickMs = 1000;
  private timer: NodeJS.Timeout | null = null;
  private lastLagMs = 0;
  private maxLagMs = 0;
  private lagSamples: number[] = [];

  start(): void {
    if (this.timer) return;

    let expected = Date.now() + this.tickMs;
    this.timer = setInterval(() => {
      const now = Date.now();
      const lag = Math.max(0, now - expected);
      expected = now + this.tickMs;

      this.lastLagMs = lag;
      this.maxLagMs = Math.max(this.maxLagMs, lag);
      this.lagSamples.push(lag);
      if (this.lagSamples.length > 300) this.lagSamples.shift();
    }, this.tickMs);

    logger.info('[RUNTIME_METRICS] monitor started', { tickMs: this.tickMs });
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info('[RUNTIME_METRICS] monitor stopped');
  }

  getSnapshot(): RuntimeMetricsSnapshot {
    return {
      running: Boolean(this.timer),
      tickMs: this.tickMs,
      eventLoopLagMs: this.lastLagMs,
      eventLoopLagP95Ms: this.computeP95(this.lagSamples),
      maxEventLoopLagMs: this.maxLagMs,
    };
  }

  private computeP95(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return sorted[index] ?? 0;
  }
}

export const runtimeMetricsMonitor = new RuntimeMetricsMonitor();
