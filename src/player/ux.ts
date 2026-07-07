export type UxDeviceClass = 'phone' | 'tablet' | 'laptop' | 'desktop';
export type UxInputMode = 'keyboard-mouse' | 'touch' | 'gamepad' | 'hybrid';
export type UxOrientation = 'portrait' | 'landscape';
export type UxPanelMode = 'corner' | 'split' | 'bottom-sheet';

export interface UxClassifyInput {
  width: number;
  height: number;
  coarse: boolean;
  hasTouch: boolean;
  touchEnabled: boolean;
  gamepadActive: boolean;
}

export interface UxProfile extends UxClassifyInput {
  device: UxDeviceClass;
  inputMode: UxInputMode;
  orientation: UxOrientation;
  compact: boolean;
  panelMode: UxPanelMode;
  touchTargetPx: number;
  summary: string;
}

const DEVICE_CLASSES: UxDeviceClass[] = ['phone', 'tablet', 'laptop', 'desktop'];
const INPUT_CLASSES: UxInputMode[] = ['keyboard-mouse', 'touch', 'gamepad', 'hybrid'];
const ORIENT_CLASSES: UxOrientation[] = ['portrait', 'landscape'];
const PANEL_CLASSES: UxPanelMode[] = ['corner', 'split', 'bottom-sheet'];

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function classifyUx(input: UxClassifyInput): UxProfile {
  const width = Math.round(finitePositive(input.width, 1280));
  const height = Math.round(finitePositive(input.height, 720));
  const shortest = Math.min(width, height);
  const longest = Math.max(width, height);
  const orientation: UxOrientation = height > width ? 'portrait' : 'landscape';
  const coarse = !!input.coarse;
  const hasTouch = !!input.hasTouch;
  const touchEnabled = !!input.touchEnabled;
  const gamepadActive = !!input.gamepadActive;

  let device: UxDeviceClass;
  if (shortest <= 560 || (coarse && longest <= 940)) device = 'phone';
  else if (coarse || hasTouch) device = 'tablet';
  else if (width <= 1366 || height <= 760) device = 'laptop';
  else device = 'desktop';

  let inputMode: UxInputMode = 'keyboard-mouse';
  if (gamepadActive && touchEnabled) inputMode = 'hybrid';
  else if (gamepadActive) inputMode = 'gamepad';
  else if (touchEnabled) inputMode = 'touch';

  const compact = device === 'phone' || width <= 760 || height <= 640;
  const panelMode: UxPanelMode = device === 'phone' || (device === 'tablet' && orientation === 'portrait')
    ? 'bottom-sheet'
    : device === 'tablet' || compact
      ? 'split'
      : 'corner';
  const touchTargetPx = device === 'phone' ? 58 : device === 'tablet' ? 64 : 44;
  const summary = `${device} ${orientation} · ${inputMode}${compact ? ' · compact' : ''} · ${panelMode}`;

  return { width, height, coarse, hasTouch, touchEnabled, gamepadActive, device, inputMode, orientation, compact, panelMode, touchTargetPx, summary };
}

function classNames(prefix: string, values: readonly string[]): string[] {
  return values.map((v) => `${prefix}-${v}`);
}

export class UxManager {
  private profile: UxProfile = classifyUx({
    width: 1280,
    height: 720,
    coarse: false,
    hasTouch: false,
    touchEnabled: false,
    gamepadActive: false,
  });
  private key = '';

  update(input: Pick<UxClassifyInput, 'touchEnabled' | 'gamepadActive'>): UxProfile {
    const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
    const hasTouch = typeof navigator !== 'undefined'
      ? ((navigator.maxTouchPoints ?? 0) > 0)
      : false;
    const profile = classifyUx({
      width: typeof window !== 'undefined' ? window.innerWidth : this.profile.width,
      height: typeof window !== 'undefined' ? window.innerHeight : this.profile.height,
      coarse,
      hasTouch,
      touchEnabled: input.touchEnabled,
      gamepadActive: input.gamepadActive,
    });
    this.profile = profile;
    this.apply(profile);
    return profile;
  }

  snapshot(): UxProfile {
    return this.profile;
  }

  private apply(profile: UxProfile): void {
    if (typeof document === 'undefined') return;
    const nextKey = `${profile.device}|${profile.inputMode}|${profile.orientation}|${profile.compact}|${profile.panelMode}|${profile.touchTargetPx}`;
    if (nextKey === this.key) return;
    this.key = nextKey;
    const body = document.body;
    body.classList.remove(
      ...classNames('ux', DEVICE_CLASSES),
      ...classNames('ux', INPUT_CLASSES),
      ...classNames('ux', ORIENT_CLASSES),
      ...classNames('ux-panel', PANEL_CLASSES),
      'ux-compact',
    );
    body.classList.add(
      `ux-${profile.device}`,
      `ux-${profile.inputMode}`,
      `ux-${profile.orientation}`,
      `ux-panel-${profile.panelMode}`,
    );
    body.classList.toggle('ux-compact', profile.compact);
    body.dataset.device = profile.device;
    body.dataset.input = profile.inputMode;
    body.dataset.panel = profile.panelMode;
    document.documentElement.style.setProperty('--ux-touch-target', `${profile.touchTargetPx}px`);
  }
}
