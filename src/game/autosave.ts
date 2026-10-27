/**
 * localStorage autosave: writes soon after something changes (throttled), every few
 * seconds regardless, and on tab hide / unload.
 */

import { storeWorldSave, type WorldSave } from '../sim/save';

const MIN_GAP_MS = 900;
const HEARTBEAT_S = 6;

export class Autosave {
  private dirty: boolean;
  private timer = 0;
  private lastMs = 0;

  constructor(
    private readonly key: string,
    readonly enabled: boolean,
    private readonly capture: () => WorldSave,
    startDirty: boolean,
  ) {
    this.dirty = enabled && startDirty;
    if (!enabled) return;
    window.addEventListener('beforeunload', () => this.write(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.write(true);
    });
  }

  markDirty(): void {
    if (this.enabled) this.dirty = true;
  }

  tick(dt: number): void {
    if (!this.enabled) return;
    this.timer += dt;
    const heartbeat = this.timer >= HEARTBEAT_S;
    if ((this.dirty || heartbeat) && performance.now() - this.lastMs > MIN_GAP_MS) {
      this.write(heartbeat);
      this.timer = 0;
    }
  }

  write(force = false): boolean {
    if (!this.enabled || (!force && !this.dirty)) return false;
    const ok = storeWorldSave(this.key, this.capture());
    if (ok) {
      this.dirty = false;
      this.lastMs = performance.now();
    }
    return ok;
  }
}
