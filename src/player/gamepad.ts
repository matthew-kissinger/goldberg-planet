const AXIS_DEADZONE = 0.18;
const TRIGGER_THRESHOLD = 0.35;
const BUTTON_THRESHOLD = 0.55;
const LOOK_UNITS_PER_SECOND = 1080;
const GAMEPAD_ACTIVE_MS = 4000;

export interface GamepadButtonLike {
  pressed?: boolean;
  value?: number;
}

export interface GamepadLike {
  id?: string;
  mapping?: string;
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
  connected?: boolean;
}

export interface GamepadFrame {
  active: boolean;
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  zoom: number;
  sprint: boolean;
  jump: boolean;
  down: boolean;
  plane: boolean;
  use: boolean;
  pack: boolean;
  craft: boolean;
  eat: boolean;
  pin: boolean;
  clearPin: boolean;
  relocate: boolean;
  menuUp: boolean;
  menuDown: boolean;
  menuLeft: boolean;
  menuRight: boolean;
  confirm: boolean;
  cancel: boolean;
  mute: boolean;
  help: boolean;
  diag: boolean;
  mine: boolean;
  minePressed: boolean;
  place: boolean;
  placePressed: boolean;
  slotDelta: number;
}

export interface GamepadSnapshot {
  connected: boolean;
  active: boolean;
  id: string;
  mapping: string;
  axes: number[];
  buttonsDown: number[];
  lastActiveMs: number;
}

const EMPTY_FRAME: GamepadFrame = {
  active: false,
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  zoom: 0,
  sprint: false,
  jump: false,
  down: false,
  plane: false,
  use: false,
  pack: false,
  craft: false,
  eat: false,
  pin: false,
  clearPin: false,
  relocate: false,
  menuUp: false,
  menuDown: false,
  menuLeft: false,
  menuRight: false,
  confirm: false,
  cancel: false,
  mute: false,
  help: false,
  diag: false,
  mine: false,
  minePressed: false,
  place: false,
  placePressed: false,
  slotDelta: 0,
};

const EDGE_FIELDS: (keyof Pick<GamepadFrame,
  'plane' | 'use' | 'pack' | 'craft' | 'eat' | 'pin' | 'clearPin' |
  'relocate' | 'menuUp' | 'menuDown' | 'menuLeft' | 'menuRight' | 'confirm' | 'cancel' |
  'mute' | 'help' | 'diag' | 'minePressed' | 'placePressed' | 'slotDelta'
>)[] = [
  'plane',
  'use',
  'pack',
  'craft',
  'eat',
  'pin',
  'clearPin',
  'relocate',
  'menuUp',
  'menuDown',
  'menuLeft',
  'menuRight',
  'confirm',
  'cancel',
  'mute',
  'help',
  'diag',
  'minePressed',
  'placePressed',
  'slotDelta',
];

enum Btn {
  A = 0,
  B = 1,
  X = 2,
  Y = 3,
  LB = 4,
  RB = 5,
  LT = 6,
  RT = 7,
  Back = 8,
  Start = 9,
  L3 = 10,
  R3 = 11,
  DpadUp = 12,
  DpadDown = 13,
  DpadLeft = 14,
  DpadRight = 15,
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function applyAxisDeadzone(value: number, deadzone = AXIS_DEADZONE): number {
  const v = clampUnit(value);
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  return Math.sign(v) * ((a - deadzone) / (1 - deadzone));
}

export function applyRadialDeadzone(x: number, y: number, deadzone = AXIS_DEADZONE): { x: number; y: number; magnitude: number } {
  const cx = clampUnit(x);
  const cy = clampUnit(y);
  const mag = Math.min(1, Math.hypot(cx, cy));
  if (mag <= deadzone) return { x: 0, y: 0, magnitude: 0 };
  const scaled = (mag - deadzone) / (1 - deadzone);
  const nx = mag > 0 ? cx / mag : 0;
  const ny = mag > 0 ? cy / mag : 0;
  return { x: nx * scaled, y: ny * scaled, magnitude: scaled };
}

export function gamepadButtonDown(buttons: readonly GamepadButtonLike[], index: number, threshold = BUTTON_THRESHOLD): boolean {
  const b = buttons[index];
  return !!b && (b.pressed === true || (b.value ?? 0) >= threshold);
}

function analogButtonDown(buttons: readonly GamepadButtonLike[], index: number): boolean {
  return gamepadButtonDown(buttons, index, TRIGGER_THRESHOLD);
}

function buttonEdges(buttons: readonly GamepadButtonLike[], previous: readonly boolean[]): boolean[] {
  return buttons.map((_, i) => gamepadButtonDown(buttons, i) && !previous[i]);
}

export function gamepadFrameFromState(gamepad: GamepadLike | null, previous: readonly boolean[] = [], dt = 1 / 60): GamepadFrame {
  if (!gamepad || gamepad.connected === false) return { ...EMPTY_FRAME };
  const buttons = gamepad.buttons;
  const axes = gamepad.axes;
  const left = applyRadialDeadzone(axes[0] ?? 0, axes[1] ?? 0);
  const right = applyRadialDeadzone(axes[2] ?? 0, axes[3] ?? 0);
  const edges = buttonEdges(buttons, previous);
  const down = (i: number): boolean => gamepadButtonDown(buttons, i);
  const trigger = (i: number): boolean => analogButtonDown(buttons, i);
  const edge = (i: number): boolean => !!edges[i];
  const lb = down(Btn.LB);
  const rt = trigger(Btn.RT);
  const lt = trigger(Btn.LT);
  const lookScale = LOOK_UNITS_PER_SECOND * Math.max(0, Math.min(0.05, dt));
  const anyButton = buttons.some((_, i) => down(i));
  const active = left.magnitude > 0 || right.magnitude > 0 || anyButton || rt || lt;

  return {
    active,
    moveX: left.x,
    moveY: -left.y,
    lookX: lb ? 0 : right.x * lookScale,
    lookY: lb ? 0 : right.y * lookScale,
    zoom: lb ? right.y : 0,
    sprint: left.magnitude > 0.92 || down(Btn.RB) || down(Btn.L3),
    jump: down(Btn.A),
    down: lt,
    plane: edge(Btn.Start),
    use: edge(Btn.B) && !lb,
    pack: edge(Btn.B) && lb,
    craft: edge(Btn.Y),
    eat: edge(Btn.DpadUp) && !lb,
    pin: edge(Btn.DpadRight) && lb,
    clearPin: edge(Btn.DpadLeft) && lb,
    relocate: edge(Btn.RT) && lb,
    menuUp: edge(Btn.DpadUp),
    menuDown: edge(Btn.DpadDown),
    menuLeft: edge(Btn.DpadLeft),
    menuRight: edge(Btn.DpadRight),
    confirm: edge(Btn.A),
    cancel: edge(Btn.B),
    mute: edge(Btn.Back) && lb,
    help: edge(Btn.R3) && !lb,
    diag: edge(Btn.R3) && lb,
    mine: down(Btn.X),
    minePressed: edge(Btn.X),
    place: rt && !lb,
    placePressed: edge(Btn.RT) && !lb,
    slotDelta: lb ? 0 : (edge(Btn.DpadRight) ? 1 : 0) + (edge(Btn.DpadLeft) ? -1 : 0),
  };
}

function mergeFrames(a: GamepadFrame, b: GamepadFrame): GamepadFrame {
  return {
    active: a.active || b.active,
    moveX: clampUnit(a.moveX + b.moveX),
    moveY: clampUnit(a.moveY + b.moveY),
    lookX: a.lookX + b.lookX,
    lookY: a.lookY + b.lookY,
    zoom: clampUnit(a.zoom + b.zoom),
    sprint: a.sprint || b.sprint,
    jump: a.jump || b.jump,
    down: a.down || b.down,
    plane: a.plane || b.plane,
    use: a.use || b.use,
    pack: a.pack || b.pack,
    craft: a.craft || b.craft,
    eat: a.eat || b.eat,
    pin: a.pin || b.pin,
    clearPin: a.clearPin || b.clearPin,
    relocate: a.relocate || b.relocate,
    menuUp: a.menuUp || b.menuUp,
    menuDown: a.menuDown || b.menuDown,
    menuLeft: a.menuLeft || b.menuLeft,
    menuRight: a.menuRight || b.menuRight,
    confirm: a.confirm || b.confirm,
    cancel: a.cancel || b.cancel,
    mute: a.mute || b.mute,
    help: a.help || b.help,
    diag: a.diag || b.diag,
    mine: a.mine || b.mine,
    minePressed: a.minePressed || b.minePressed,
    place: a.place || b.place,
    placePressed: a.placePressed || b.placePressed,
    slotDelta: a.slotDelta + b.slotDelta,
  };
}

function stripEdgeFields(frame: GamepadFrame): GamepadFrame {
  const out = { ...frame };
  for (const key of EDGE_FIELDS) {
    if (key === 'slotDelta') out.slotDelta = 0;
    else out[key] = false;
  }
  return out;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class GamepadControls {
  private previousButtons: boolean[] = [];
  private lastFrame: GamepadFrame = { ...EMPTY_FRAME };
  private lastPad: GamepadLike | null = null;
  private lastActiveAt = -Infinity;
  private notice: string | null = null;
  private injected: { frame: GamepadFrame; frames: number } | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', (e) => {
      this.notice = e.gamepad?.id || 'gamepad connected';
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.lastPad?.id === e.gamepad?.id) this.lastPad = null;
      this.notice = 'gamepad disconnected';
    });
  }

  frame(dt = 1 / 60): GamepadFrame {
    const pad = this.primaryPad();
    const live = gamepadFrameFromState(pad, this.previousButtons, dt);
    if (pad) {
      this.lastPad = pad;
      this.previousButtons = pad.buttons.map((_, i) => gamepadButtonDown(pad.buttons, i));
    } else {
      this.previousButtons = [];
    }
    let out = live;
    if (this.injected) {
      out = mergeFrames(out, this.injected.frame);
      this.injected.frames--;
      if (this.injected.frames <= 0) this.injected = null;
      else this.injected.frame = stripEdgeFields(this.injected.frame);
    }
    if (out.active) this.lastActiveAt = nowMs();
    this.lastFrame = out;
    return out;
  }

  active(): boolean {
    return nowMs() - this.lastActiveAt <= GAMEPAD_ACTIVE_MS;
  }

  connected(): boolean {
    return this.primaryPad() !== null || this.lastPad !== null;
  }

  consumeNotice(): string | null {
    const n = this.notice;
    this.notice = null;
    return n;
  }

  inject(frame: Partial<GamepadFrame>, frames = 2): void {
    this.injected = {
      frame: { ...EMPTY_FRAME, ...frame, active: frame.active ?? true },
      frames: Math.max(1, Math.floor(frames)),
    };
  }

  snapshot(): GamepadSnapshot {
    const pad = this.primaryPad() ?? this.lastPad;
    const buttonsDown = pad ? pad.buttons
      .map((_, i) => gamepadButtonDown(pad.buttons, i) ? i : -1)
      .filter((i) => i >= 0) : [];
    return {
      connected: !!pad,
      active: this.active(),
      id: pad?.id ?? '',
      mapping: pad?.mapping ?? '',
      axes: pad?.axes?.slice(0, 4).map((v) => Number(v.toFixed(2))) ?? [],
      buttonsDown,
      lastActiveMs: Number.isFinite(this.lastActiveAt) ? Math.max(0, nowMs() - this.lastActiveAt) : Infinity,
    };
  }

  private primaryPad(): GamepadLike | null {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const pads = Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => !!pad && pad.connected !== false);
    return pads.find((pad) => pad.mapping === 'standard') ?? pads[0] ?? null;
  }
}
