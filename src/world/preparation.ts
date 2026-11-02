/** Incremental preparation only writes detached arrays; callers commit after completion. */
export interface PreparationOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  onSlice?: (milliseconds: number) => void;
}

export const PREPARATION_BUDGET_MS = 2;
const CHECK_INTERVAL = 32;

export function checkPreparation(options: PreparationOptions): void {
  if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Preparation cancelled', 'AbortError');
}

/** Yield before the first sample, then check the budget every small group of vertices. */
export async function prepareInSlices(
  count: number,
  sample: (index: number) => void,
  options: PreparationOptions = {},
): Promise<void> {
  let next = 0;
  while (next < count) {
    checkPreparation(options);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkPreparation(options);
    const start = performance.now();
    do {
      const end = Math.min(count, next + CHECK_INTERVAL);
      for (; next < end; next++) sample(next);
    } while (next < count && performance.now() - start < PREPARATION_BUDGET_MS);
    options.onSlice?.(performance.now() - start);
    options.onProgress?.(next / count);
  }
  checkPreparation(options);
}
