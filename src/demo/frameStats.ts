/** Smoothed frame time and fps for the vitals line and F3 diagnostics. */
export class FrameStats {
  fpsEma = 60;
  frameMsEma = 16;

  frame(dtMs: number): void {
    const a = Math.min(1, dtMs / 500);
    this.frameMsEma += (dtMs - this.frameMsEma) * a;
    this.fpsEma = 1000 / this.frameMsEma;
  }
}
