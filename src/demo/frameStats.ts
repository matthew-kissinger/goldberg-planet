const WINDOW = 600;

class Samples {
  private readonly values = new Float32Array(WINDOW);
  private cursor = 0;
  private count = 0;

  add(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.values[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % WINDOW;
    this.count = Math.min(WINDOW, this.count + 1);
  }

  snapshot(): { count: number; p50: number; p95: number; p99: number; max: number; over50: number } {
    const sorted = this.values.slice(0, this.count).sort();
    const at = (p: number): number => sorted[Math.max(0, Math.ceil(this.count * p) - 1)] ?? 0;
    return { count: this.count, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1), over50: sorted.filter((v) => v > 50).length };
  }
}

/** Frame intervals and CPU phase timings. Render submission time is not GPU time. */
export class FrameStats {
  fpsEma = 60;
  frameMsEma = 16;
  private readonly intervals = new Samples();
  private readonly phases = new Map<string, Samples>();
  private readonly worstPhases = new Map<string, number>();
  private phaseStart = 0;

  begin(now: number): void { this.phaseStart = now; }

  mark(name: string, now = performance.now()): void {
    let samples = this.phases.get(name);
    if (!samples) { samples = new Samples(); this.phases.set(name, samples); }
    samples.add(now - this.phaseStart);
    this.worstPhases.set(name, Math.max(this.worstPhases.get(name) ?? 0, now - this.phaseStart));
    this.phaseStart = now;
  }

  frame(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs < 0) return;
    this.intervals.add(dtMs);
    const a = Math.min(1, dtMs / 500);
    this.frameMsEma += (dtMs - this.frameMsEma) * a;
    this.fpsEma = 1000 / this.frameMsEma;
  }

  snapshot() {
    return {
      windowFrames: WINDOW,
      frameMs: this.intervals.snapshot(),
      cpuMs: Object.fromEntries([...this.phases].map(([name, samples]) => [name, samples.snapshot()])),
      cpuWorstMs: Object.fromEntries(this.worstPhases),
    };
  }
}
