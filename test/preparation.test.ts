import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareInSlices, PREPARATION_BUDGET_MS } from '../src/world/preparation';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('incremental destination preparation', () => {
  it('yields before doing work and splits sampling at the CPU budget', async () => {
    vi.useFakeTimers();
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const visited: number[] = [], slices: number[] = [], progress: number[] = [];
    const pending = prepareInSlices(160, index => { visited.push(index); clock += 1 / 32; }, {
      onSlice: ms => slices.push(ms), onProgress: fraction => progress.push(fraction),
    });
    expect(visited).toEqual([]);
    await vi.runAllTimersAsync();
    await pending;
    expect(visited).toEqual(Array.from({ length: 160 }, (_, i) => i));
    expect(slices).toEqual([2, 2, 1]);
    expect(slices.every(ms => ms <= PREPARATION_BUDGET_MS)).toBe(true);
    expect(progress.at(-1)).toBe(1);
  });

  it('checks cancellation before resuming a queued slice', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const sample = vi.fn();
    const pending = prepareInSlices(100, sample, { signal: controller.signal }).catch(error => error);
    controller.abort();
    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(DOMException);
    expect(sample).not.toHaveBeenCalled();
  });
});
