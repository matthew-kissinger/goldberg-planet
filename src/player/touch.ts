/**
 * Touch controls, Minecraft-PE style:
 *  - a floating joystick spawns where the left thumb lands (bottom-left region); pushing
 *    it to the rim sprints. In plane mode forward/back on the stick works the throttle.
 *  - dragging anywhere else looks around; a second finger pinches to zoom.
 *  - a quick tap mines/chops at the tapped point; holding ~0.4 s places the selected
 *    block there and keeps placing while held (drag to paint a wall).
 *  - round buttons: jump/climb, descend (fly + plane), and craft/board/stow plane.
 *
 * Everything routes through the existing Input accumulators (mouseDX/DY, wheel), so the
 * player/camera code doesn't know touch exists. Enabled for coarse-pointer devices, on
 * the first real touch on a hybrid, or forced with ?touch=1. While enabled, Input's own
 * mouse handlers stand down and pointer lock is never requested.
 */

import type { Input } from './input';

const KNOB_MAX = 46;      // knob travel radius (px)
const TAP_SLOP = 14;      // movement (px) before a press becomes a look drag
const TAP_MS = 320;       // max press duration that still counts as a tap
const HOLD_MS = 400;      // press-and-hold this long (still) = place a block
const PLACE_REPEAT_MS = 300;
const LOOK_SCALE = 2.6;   // touch look sensitivity (relative to mouse deltas)
const PINCH_TO_WHEEL = 4.2;

export interface TouchFrame {
  moveX: number;
  moveY: number;
  sprint: boolean;
  jump: boolean;
  down: boolean;
  /** plane button edge (craft/board/stow) */
  plane: boolean;
  /** use/interact button edge */
  use: boolean;
  /** long-press use button edge for packing a nearby placed prop */
  pack: boolean;
  /** taps to mine/chop at, in client px */
  mines: { x: number; y: number }[];
  /** long-press placements at, in client px */
  places: { x: number; y: number }[];
}

export type PlaneButtonState = 'hidden' | 'craft' | 'fly' | 'flying';

export class TouchControls {
  enabled = false;
  private moveX = 0;
  private moveY = 0;
  private sprint = false;
  private jumpHeld = false;
  private downHeld = false;
  private planeTap = false;
  private useTap = false;
  private packTap = false;
  private usePackedDuringPress = false;
  private useDownAt = 0;
  private useHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private mines: { x: number; y: number }[] = [];
  private places: { x: number; y: number }[] = [];

  private joyId = -1;
  private joyX = 0;
  private joyY = 0;
  private lookId = -1;
  private lookX = 0;
  private lookY = 0;
  private lookStartX = 0;
  private lookStartY = 0;
  private lookMoved = 0;
  private lookT0 = 0;
  private pinched = false;
  private placing = false;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private placeTimer: ReturnType<typeof setInterval> | null = null;
  private pinchId = -1;
  private pinchX = 0;
  private pinchY = 0;
  private pinchDist = 0;

  private joyEl = document.getElementById('joy')!;
  private knobEl = document.getElementById('joyknob')!;
  private btnJump = document.getElementById('btn-jump')!;
  private btnDown = document.getElementById('btn-down')!;
  private btnPlane = document.getElementById('btn-plane')!;
  private btnUse = document.getElementById('btn-use')!;
  private planeState: PlaneButtonState = 'hidden';
  private planeLabel = '';

  constructor(private readonly input: Input, private readonly el: HTMLElement, force: boolean) {
    if (force || window.matchMedia('(pointer: coarse)').matches) this.enable();
    // hybrid devices: light up on the first real touch
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.enable();
    }, { capture: true, passive: true });
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.input.touchMode = true;
    document.body.classList.add('touch');

    this.el.addEventListener('pointerdown', this.onDown, { passive: false });
    this.el.addEventListener('pointermove', this.onMove, { passive: false });
    this.el.addEventListener('pointerup', this.onUp, { passive: false });
    this.el.addEventListener('pointercancel', this.onUp, { passive: false });
    this.el.addEventListener('lostpointercapture', this.onLostPointer, { passive: false });
    window.addEventListener('blur', this.resetHeldState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.resetHeldState();
    });

    const bindHold = (el: HTMLElement, set: (v: boolean) => void): void => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try {
          el.setPointerCapture(e.pointerId);
        } catch { /* synthetic pointer */ }
        el.classList.add('press');
        set(true);
      });
      const off = (): void => {
        el.classList.remove('press');
        set(false);
      };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
    };
    bindHold(this.btnJump, (v) => { this.jumpHeld = v; });
    bindHold(this.btnDown, (v) => { this.downHeld = v; });
    this.btnPlane.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.btnPlane.classList.add('press');
      this.planeTap = true;
    });
    this.btnPlane.addEventListener('pointerup', () => this.btnPlane.classList.remove('press'));
    this.btnPlane.addEventListener('pointercancel', () => this.btnPlane.classList.remove('press'));
    this.btnPlane.addEventListener('lostpointercapture', () => this.btnPlane.classList.remove('press'));
    this.btnUse.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        this.btnUse.setPointerCapture(e.pointerId);
      } catch { /* synthetic pointer */ }
      this.btnUse.classList.add('press');
      this.usePackedDuringPress = false;
      this.useDownAt = performance.now();
      if (this.useHoldTimer !== null) clearTimeout(this.useHoldTimer);
      this.useHoldTimer = setTimeout(() => {
        this.packTap = true;
        this.usePackedDuringPress = true;
        navigator.vibrate?.(16);
      }, HOLD_MS);
    });
    this.btnUse.addEventListener('pointerup', () => {
      if (this.useHoldTimer !== null) {
        clearTimeout(this.useHoldTimer);
        this.useHoldTimer = null;
      }
      this.btnUse.classList.remove('press');
      const heldMs = performance.now() - this.useDownAt;
      if (!this.usePackedDuringPress && heldMs >= HOLD_MS) {
        this.packTap = true;
        this.usePackedDuringPress = true;
      }
      if (!this.usePackedDuringPress) this.useTap = true;
      this.usePackedDuringPress = false;
      this.useDownAt = 0;
    });
    this.btnUse.addEventListener('pointercancel', () => {
      if (this.useHoldTimer !== null) {
        clearTimeout(this.useHoldTimer);
        this.useHoldTimer = null;
      }
      this.btnUse.classList.remove('press');
      this.usePackedDuringPress = false;
      this.useDownAt = 0;
    });
    this.btnUse.addEventListener('lostpointercapture', this.cancelUseButton);
  }

  private capture(id: number): void {
    try {
      this.el.setPointerCapture(id);
    } catch { /* synthetic or already-gone pointer */ }
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    if (this.joyId < 0 && x < window.innerWidth * 0.42 && y > window.innerHeight * 0.38) {
      this.joyId = e.pointerId;
      this.joyX = x;
      this.joyY = y;
      this.capture(e.pointerId);
      this.joyEl.style.display = 'block';
      this.joyEl.style.left = `${x - 64}px`;
      this.joyEl.style.top = `${y - 64}px`;
      this.setKnob(0, 0);
      return;
    }
    if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.lookX = this.lookStartX = x;
      this.lookY = this.lookStartY = y;
      this.lookMoved = 0;
      this.lookT0 = performance.now();
      this.pinched = false;
      this.placing = false;
      this.capture(e.pointerId);
      this.holdTimer = setTimeout(() => {
        if (this.lookId < 0 || this.pinched || this.lookMoved >= TAP_SLOP) return;
        this.placing = true;
        this.places.push({ x: this.lookX, y: this.lookY });
        navigator.vibrate?.(12);
        this.placeTimer = setInterval(() => {
          if (this.placing) this.places.push({ x: this.lookX, y: this.lookY });
        }, PLACE_REPEAT_MS);
      }, HOLD_MS);
      return;
    }
    if (this.pinchId < 0) {
      // second finger: pinch-zoom; the pending tap/hold is off
      this.pinchId = e.pointerId;
      this.pinchX = x;
      this.pinchY = y;
      this.pinched = true;
      this.clearHold();
      this.capture(e.pointerId);
      this.pinchDist = Math.hypot(x - this.lookX, y - this.lookY);
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId === this.joyId) {
      let dx = e.clientX - this.joyX;
      let dy = e.clientY - this.joyY;
      const l = Math.hypot(dx, dy);
      if (l > KNOB_MAX) {
        dx *= KNOB_MAX / l;
        dy *= KNOB_MAX / l;
      }
      this.setKnob(dx, dy);
      this.moveX = dx / KNOB_MAX;
      this.moveY = -dy / KNOB_MAX;
      this.sprint = l >= KNOB_MAX * 1.35; // pushed well past the rim
      return;
    }
    if (e.pointerId === this.lookId) {
      const dx = e.clientX - this.lookX;
      const dy = e.clientY - this.lookY;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      if (this.pinchId >= 0) {
        this.pinch();
        return;
      }
      this.lookMoved += Math.abs(dx) + Math.abs(dy);
      if (this.lookMoved >= TAP_SLOP && !this.placing) this.clearHold();
      if (!this.placing) {
        this.input.mouseDX += dx * LOOK_SCALE;
        this.input.mouseDY += dy * LOOK_SCALE;
      }
      return;
    }
    if (e.pointerId === this.pinchId) {
      this.pinchX = e.clientX;
      this.pinchY = e.clientY;
      this.pinch();
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.joyId) {
      this.joyId = -1;
      this.moveX = 0;
      this.moveY = 0;
      this.sprint = false;
      this.joyEl.style.display = 'none';
      return;
    }
    if (e.pointerId === this.lookId) {
      const wasTap = !this.pinched && !this.placing && this.lookMoved < TAP_SLOP
        && performance.now() - this.lookT0 < TAP_MS;
      if (wasTap) {
        this.mines.push({ x: this.lookStartX, y: this.lookStartY });
        navigator.vibrate?.(8);
      }
      this.clearHold();
      this.placing = false;
      this.lookId = -1;
      return;
    }
    if (e.pointerId === this.pinchId) {
      this.pinchId = -1;
      // the remaining finger goes back to looking, but can't become a tap anymore
    }
  };

  private onLostPointer = (e: PointerEvent): void => {
    if (e.pointerId === this.joyId || e.pointerId === this.lookId || e.pointerId === this.pinchId) {
      this.resetHeldState();
    }
  };

  private cancelUseButton = (): void => {
    if (this.useHoldTimer !== null) {
      clearTimeout(this.useHoldTimer);
      this.useHoldTimer = null;
    }
    this.btnUse.classList.remove('press');
    this.usePackedDuringPress = false;
    this.useDownAt = 0;
  };

  private resetHeldState = (): void => {
    this.moveX = 0;
    this.moveY = 0;
    this.sprint = false;
    this.jumpHeld = false;
    this.downHeld = false;
    this.planeTap = false;
    this.useTap = false;
    this.packTap = false;
    this.usePackedDuringPress = false;
    this.useDownAt = 0;
    if (this.useHoldTimer !== null) {
      clearTimeout(this.useHoldTimer);
      this.useHoldTimer = null;
    }
    this.mines = [];
    this.places = [];
    this.joyId = -1;
    this.lookId = -1;
    this.pinchId = -1;
    this.pinched = false;
    this.placing = false;
    this.clearHold();
    this.joyEl.style.display = 'none';
    this.setKnob(0, 0);
    this.btnJump.classList.remove('press');
    this.btnDown.classList.remove('press');
    this.btnPlane.classList.remove('press');
    this.btnUse.classList.remove('press');
  };

  private pinch(): void {
    const d = Math.hypot(this.pinchX - this.lookX, this.pinchY - this.lookY);
    this.input.wheel -= (d - this.pinchDist) * PINCH_TO_WHEEL;
    this.input.wheelTouched = true;
    this.pinchDist = d;
  }

  private clearHold(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.placeTimer !== null) {
      clearInterval(this.placeTimer);
      this.placeTimer = null;
    }
  }

  private setKnob(dx: number, dy: number): void {
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** per-frame snapshot; edge lists drain */
  frame(): TouchFrame {
    const out: TouchFrame = {
      moveX: this.moveX,
      moveY: this.moveY,
      sprint: this.sprint,
      jump: this.jumpHeld,
      down: this.downHeld,
      plane: this.planeTap,
      use: this.useTap,
      pack: this.packTap,
      mines: this.mines,
      places: this.places,
    };
    this.planeTap = false;
    this.useTap = false;
    this.packTap = false;
    this.mines = [];
    this.places = [];
    return out;
  }

  setPlaneButton(state: PlaneButtonState, label = ''): void {
    if (state === this.planeState && label === this.planeLabel) return;
    this.planeState = state;
    this.planeLabel = label;
    this.btnPlane.classList.toggle('show', state !== 'hidden');
    this.btnPlane.classList.toggle('ready', state === 'fly' || state === 'flying');
    this.btnPlane.innerHTML = state === 'flying' ? '<span>✕</span><span class="sub">stow</span>'
      : label ? `<span>✈</span><span class="sub">${label}</span>` : '<span>✈</span>';
  }

  setDownVisible(v: boolean): void {
    this.btnDown.classList.toggle('show', v);
  }

  setUseVisible(v: boolean): void {
    this.btnUse.classList.toggle('show', v);
  }
}
