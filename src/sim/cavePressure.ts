import type { NaturalVoidKind } from '../world/caves';
import type { CavePressureReport } from './survival';

export interface CavePressureContext {
  caveKind?: NaturalVoidKind | null;
  flooded?: boolean;
  hasLantern?: boolean;
  hasEchoLantern?: boolean;
  nearWarmth?: boolean;
  trailFocus?: number;
}

function focusMinutes(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

export function cavePressureAt(ctx: CavePressureContext): CavePressureReport {
  if (!ctx.caveKind || ctx.caveKind === 'arch') {
    return {
      active: false,
      label: 'open air',
      exposureRate: 0,
      staminaRegen: 1,
      light: 'daylight',
      message: 'open air',
    };
  }

  const light: CavePressureReport['light'] = ctx.hasEchoLantern
    ? 'echoLantern'
    : ctx.hasLantern
    ? 'lantern'
    : ctx.nearWarmth
    ? 'warmth'
    : 'dark';
  const sea = ctx.caveKind === 'seaCave' || ctx.flooded === true;
  const lit = light !== 'dark';
  const exposureRate = lit
    ? light === 'echoLantern'
      ? sea ? 0.12 : 0.04
      : sea ? 0.28 : 0.16
    : sea ? 1.55 : 0.92;
  const staminaRegen = lit
    ? light === 'echoLantern'
      ? sea ? 0.9 : 1
      : sea ? 0.78 : 0.88
    : sea ? 0.5 : 0.68;
  const place = sea ? 'sea cave' : 'dry cave';
  const label = lit
    ? `${light === 'echoLantern' ? 'echo-lit' : light === 'lantern' ? 'lantern-lit' : 'warm'} ${place}`
    : `dark ${place}`;
  const focus = focusMinutes(ctx.trailFocus);
  const focusLabel = focus > 0 ? 'blink focus' : '';
  return {
    active: true,
    label: focus > 0 ? `${label} · ${focusLabel}` : label,
    exposureRate,
    staminaRegen,
    light,
    message: focus > 0
      ? `${label} · ${focusLabel} softens the air`
      : lit ? `${label} · cave pressure held` : `${label} · bring light`,
    focus: focus > 0 ? { active: true, minutes: focus, exposureMultiplier: 0.55, label: focusLabel } : undefined,
  };
}
