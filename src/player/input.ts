/**
 * Keyboard/mouse state. Pointer lock when the environment allows it; otherwise a
 * drag-to-look fallback (embedded webviews and preview panels often deny pointer lock):
 *  - drag any mouse button to look (deltas from clientX/Y, so it works without lock)
 *  - a press-release without movement counts as a click: LMB mines, RMB places
 * Wheel controls the ground-to-orbit zoom axis in both modes.
 */

const DRAG_CLICK_SLOP = 5;

export class Input {
  keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  wheelTouched = false;
  mineHeld = false;
  placeHeld = false;
  minePressed = false;
  placePressed = false;
  keyEdges = new Set<string>();
  locked = false;
  lockUnavailable = false;
  /** touch controls own the pointer: mouse handlers stand down, no pointer lock */
  touchMode = false;
  private dragButton = -1;
  private dragMoved = 0;
  private lastX = 0;
  private lastY = 0;
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    el.tabIndex = 0;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'F5') return;
      if (!this.keys.has(e.code)) this.keyEdges.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ControlLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'F3'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.keyEdges.clear();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) this.keys.clear();
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockUnavailable = true;
      this.locked = false;
    });

    window.addEventListener('mousedown', (e) => {
      if (this.touchMode) return;
      // UI elements handle their own pointers
      if (e.target instanceof HTMLElement && e.target.closest('#hotbar, #crafting, #journal, .tbtn')) return;
      el.focus();
      if (!this.locked && !this.lockUnavailable) {
        // attempt pointer lock; a denial (embedded preview) flips us to drag-look
        try {
          const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
          if (p && typeof p.catch === 'function') p.catch(() => { this.lockUnavailable = true; });
        } catch {
          this.lockUnavailable = true;
        }
      }
      if (this.locked) {
        if (e.button === 0) { this.mineHeld = true; this.minePressed = true; }
        if (e.button === 2) { this.placeHeld = true; this.placePressed = true; }
      } else {
        this.dragButton = e.button;
        this.dragMoved = 0;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.touchMode) return;
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.dragButton >= 0) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.mouseDX += dx * 1.6;
        this.mouseDY += dy * 1.6;
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (this.touchMode) return;
      if (this.locked) {
        if (e.button === 0) this.mineHeld = false;
        if (e.button === 2) this.placeHeld = false;
        return;
      }
      if (this.dragButton === e.button) {
        if (this.dragMoved < DRAG_CLICK_SLOP) {
          if (e.button === 0) this.minePressed = true;
          if (e.button === 2) this.placePressed = true;
        }
        this.dragButton = -1;
      }
    });
    window.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      this.wheelTouched = true;
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** true when look/move input is live (locked, drag-look fallback, or touch) */
  active(): boolean {
    return this.locked || this.lockUnavailable || this.touchMode;
  }

  /** consume per-frame deltas */
  drain(): { dx: number; dy: number; wheel: number; mine: boolean; place: boolean; wheelTouched: boolean } {
    const out = {
      dx: this.mouseDX, dy: this.mouseDY, wheel: this.wheel,
      mine: this.minePressed, place: this.placePressed,
      wheelTouched: this.wheelTouched,
    };
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.minePressed = false; this.placePressed = false;
    this.wheelTouched = false;
    return out;
  }

  down(code: string): boolean { return this.keys.has(code); }

  pressed(code: string): boolean {
    const hit = this.keyEdges.has(code);
    this.keyEdges.delete(code);
    return hit;
  }
}
