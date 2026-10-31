/**
 * One per-frame intent from keyboard/mouse, touch and gamepad, so the game loop never
 * asks which device a verb came from. While a panel is open, world input (look, move,
 * chop, zoom) is zeroed and the pointer is released; panel verbs still come through.
 */

import { Input } from '../player/input';
import { TouchControls } from '../player/touch';
import { GamepadControls } from '../player/gamepad';

export interface FrameIntent {
  lookX: number;
  lookY: number;
  /** look input is live (pointer locked, drag-look, touch, or gamepad) */
  aiming: boolean;
  wheel: number;
  wheelTouched: boolean;
  forward: number;
  strafe: number;
  jump: boolean;
  down: boolean;
  sprint: boolean;
  /** chop once now (click, X/RT edge) */
  chop: boolean;
  /** chop is held (repeats on the strike cooldown) */
  chopHeld: boolean;
  /** touch taps to chop at, client px */
  chopTaps: { x: number; y: number }[];
  /** E / plane button / Start: craft-and-board, board, or stow */
  plane: boolean;
  /** B / craft button / Y */
  toggleCrafting: boolean;
  /** Escape / gamepad B while a panel is open */
  closePanel: boolean;
  /** gamepad A while the crafting panel is open */
  confirmCraft: boolean;
  toggleFly: boolean;
  mute: boolean;
  diag: boolean;
  help: boolean;
  /** V: mine terrain voxel cell */
  mineCell: boolean;
  /** Q: place selected out-of-core structure */
  placeStructure: boolean;
  /** Z / X: cycle selected structure blueprint */
  cycleStructurePrev: boolean;
  cycleStructureNext: boolean;
  /** R: rotate structure yaw (60 deg) */
  rotateStructure: boolean;
  /** G: deploy Ecosystem Seed Pod */
  deployEcoPod: boolean;
  /** C / T: eat cooked meat to restore Hunger & trigger Health regen */
  eatFood: boolean;
  /** 1..6: quick interplanetary warp / nav target (0..5, or -1 if none) */
  warpPlanetIndex: number;
}

const EDGE_KEYS = [
  'KeyE', 'KeyB', 'KeyF', 'KeyN', 'KeyH', 'KeyM', 'F3', 'Escape',
  'KeyV', 'KeyQ', 'KeyZ', 'KeyX', 'KeyR', 'KeyG', 'KeyC', 'KeyT',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
] as const;
type EdgeKey = typeof EDGE_KEYS[number];

export class Controls {
  readonly input: Input;
  readonly touch: TouchControls;
  readonly gamepad = new GamepadControls();
  private readonly held = new Set<EdgeKey>();

  constructor(canvas: HTMLElement, app: HTMLElement, forceTouch: boolean) {
    this.input = new Input(canvas);
    this.touch = new TouchControls(this.input, app, forceTouch);
  }

  /** keyboard edge that survives a press+release inside one frame */
  private edge(code: EdgeKey): boolean {
    const down = this.input.down(code);
    const hit = this.input.pressed(code) || (down && !this.held.has(code));
    if (down) this.held.add(code);
    else this.held.delete(code);
    return hit;
  }

  read(dt: number, panelOpen: boolean): FrameIntent {
    const input = this.input;
    const mouse = input.drain();
    const tf = this.touch.frame();
    const gp = this.gamepad.frame(dt);
    const keys = Object.fromEntries(EDGE_KEYS.map((code) => [code, this.edge(code)])) as Record<EdgeKey, boolean>;
    const warpPlanetIndex =
      keys.Digit1 ? 0
      : keys.Digit2 ? 1
      : keys.Digit3 ? 2
      : keys.Digit4 ? 3
      : keys.Digit5 ? 4
      : keys.Digit6 ? 5
      : -1;
    const panelVerbs = {
      plane: keys.KeyE || tf.plane || gp.plane,
      toggleCrafting: keys.KeyB || tf.craft || gp.craft,
      closePanel: panelOpen && (keys.Escape || gp.cancel),
      confirmCraft: panelOpen && gp.confirm,
      toggleFly: keys.KeyF,
      mute: keys.KeyN || gp.mute,
      diag: keys.F3 || gp.diag,
      help: keys.KeyH || keys.KeyM || gp.help,
      mineCell: keys.KeyV,
      placeStructure: keys.KeyQ,
      cycleStructurePrev: keys.KeyZ,
      cycleStructureNext: keys.KeyX,
      rotateStructure: keys.KeyR,
      deployEcoPod: keys.KeyG,
      eatFood: keys.KeyT || keys.KeyC,
      warpPlanetIndex,
    };
    if (panelOpen) {
      input.cancelWorldInput();
      this.touch.cancelWorldInput();
      return {
        ...panelVerbs,
        plane: false,
        toggleFly: false,
        mineCell: false,
        placeStructure: false,
        lookX: 0, lookY: 0, aiming: false, wheel: 0, wheelTouched: false,
        forward: 0, strafe: 0, jump: false, down: false, sprint: false,
        chop: false, chopHeld: false, chopTaps: [],
      };
    }
    const axis = (pos: string, neg: string, extra: number): number =>
      Math.max(-1, Math.min(1, (input.down(pos) ? 1 : 0) - (input.down(neg) ? 1 : 0) + extra));
    const gamepadAiming = gp.active || this.gamepad.active();
    const zoomWheel = Math.abs(gp.zoom) > 0.01 ? gp.zoom * 1300 * dt : 0;
    return {
      ...panelVerbs,
      lookX: mouse.dx + gp.lookX,
      lookY: mouse.dy + gp.lookY,
      aiming: input.active() || gamepadAiming,
      wheel: mouse.wheel + zoomWheel,
      wheelTouched: mouse.wheelTouched || zoomWheel !== 0,
      forward: axis('KeyW', 'KeyS', tf.moveY + gp.moveY),
      strafe: axis('KeyD', 'KeyA', tf.moveX + gp.moveX),
      jump: input.down('Space') || tf.jump || gp.jump,
      down: input.down('ControlLeft') || input.down('KeyC') || tf.down || gp.down,
      sprint: input.down('ShiftLeft') || tf.sprint || gp.sprint,
      chop: mouse.chop || gp.chopPressed,
      chopHeld: input.chopHeld || gp.chop,
      chopTaps: tf.chops,
    };
  }

  /** which device family drives on-screen labels right now */
  gamepadActive(): boolean {
    return this.gamepad.active();
  }
}
