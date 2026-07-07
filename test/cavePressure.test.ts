import { describe, expect, it } from 'vitest';
import { cavePressureAt } from '../src/sim/cavePressure';
import { updateSurvival, type SurvivalState } from '../src/sim/survival';

const clear = { kind: 'clear' as const, label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 };

describe('Hearth and Horizon cave pressure', () => {
  it('keeps arches open while dry caves become pressure spaces', () => {
    expect(cavePressureAt({ caveKind: 'arch' })).toMatchObject({ active: false, light: 'daylight' });
    expect(cavePressureAt({ caveKind: 'dryCave' })).toMatchObject({
      active: true,
      label: 'dark dry cave',
      light: 'dark',
    });
  });

  it('uses lanterns and echo lanterns to reduce cave exposure', () => {
    const dark = cavePressureAt({ caveKind: 'seaCave', flooded: true });
    const lantern = cavePressureAt({ caveKind: 'seaCave', flooded: true, hasLantern: true });
    const echo = cavePressureAt({ caveKind: 'seaCave', flooded: true, hasEchoLantern: true });

    expect(dark.exposureRate).toBeGreaterThan(lantern.exposureRate);
    expect(lantern.exposureRate).toBeGreaterThan(echo.exposureRate);
    expect(echo.label).toBe('echo-lit sea cave');
  });

  it('surfaces blink focus as cave-pressure readback without double-applying exposure math', () => {
    const dark = cavePressureAt({ caveKind: 'dryCave' });
    const focused = cavePressureAt({ caveKind: 'dryCave', trailFocus: 91.8 });

    expect(focused.label).toBe('dark dry cave · blink focus');
    expect(focused.message).toContain('blink focus softens the air');
    expect(focused.focus).toEqual({ active: true, minutes: 91, exposureMultiplier: 0.55, label: 'blink focus' });
    expect(focused.exposureRate).toBe(dark.exposureRate);
  });

  it('makes dark cave expeditions harsher than lit ones in survival updates', () => {
    const darkState: SurvivalState = { stamina: 60, exposure: 10, mealsEaten: 0 };
    const litState: SurvivalState = { stamina: 60, exposure: 10, mealsEaten: 0 };

    updateSurvival(darkState, {
      dt: 5,
      moving: true,
      sprinting: false,
      swimming: false,
      sheltered: false,
      functionalShelter: false,
      nearWarmth: false,
      weather: clear,
      cavePressure: cavePressureAt({ caveKind: 'dryCave' }),
    });
    updateSurvival(litState, {
      dt: 5,
      moving: true,
      sprinting: false,
      swimming: false,
      sheltered: false,
      functionalShelter: false,
      nearWarmth: false,
      weather: clear,
      cavePressure: cavePressureAt({ caveKind: 'dryCave', hasEchoLantern: true }),
    });

    expect(darkState.exposure).toBeGreaterThan(litState.exposure + 3);
    expect(darkState.stamina).toBeLessThan(litState.stamina);
  });
});
