import { describe, expect, it } from 'vitest';
import { FrameStats } from '../src/demo/frameStats';

describe('frame timing diagnostics', () => {
  it('retains stalls that an average hides, then expires them from the bounded window', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 98; i++) stats.frame(16);
    stats.frame(100); stats.frame(240);
    expect(stats.snapshot().frameMs).toMatchObject({ count: 100, p50: 16, p95: 16, p99: 100, max: 240, over50: 2 });
    for (let i = 0; i < 600; i++) stats.frame(16);
    expect(stats.snapshot().frameMs).toMatchObject({ count: 600, max: 16, over50: 0 });
  });

  it('separates CPU phases from wall-clock frame intervals', () => {
    const stats = new FrameStats();
    stats.begin(100);
    stats.mark('streaming', 103);
    stats.mark('renderSubmit', 108);
    stats.frame(20);
    expect(stats.snapshot().cpuMs.streaming.max).toBe(3);
    expect(stats.snapshot().cpuMs.renderSubmit.max).toBe(5);
    for (let i = 0; i < 610; i++) { stats.begin(200); stats.mark('renderSubmit', 201); }
    expect(stats.snapshot().cpuMs.renderSubmit.max).toBe(1);
    expect(stats.snapshot().cpuWorstMs.renderSubmit).toBe(5);
    expect(stats.snapshot().frameMs.max).toBe(20);
  });
});
