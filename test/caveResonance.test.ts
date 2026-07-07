import { describe, expect, it } from 'vitest';
import {
  caveResonanceNotebook,
  caveResonanceSite,
  normalizeCaveResonanceObservations,
  observeCaveResonance,
} from '../src/sim/caveResonance';

describe('Hearth and Horizon cave resonance rules', () => {
  it('creates deterministic real-cave resonance sites and ignores arches', () => {
    const dry = caveResonanceSite('resonance-seed', 42, 12, 'dryCave');
    const again = caveResonanceSite('resonance-seed', 42, 12, 'dryCave');
    const sea = caveResonanceSite('resonance-seed', 42, 12, 'seaCave');

    expect(caveResonanceSite('resonance-seed', 42, 12, 'arch')).toBeNull();
    expect(dry).toEqual(again);
    expect(dry).toMatchObject({
      tile: 42,
      layer: 12,
      caveKind: 'dryCave',
      reward: { item: 'glowCrystal', count: 3, label: 'glow crystal' },
      observed: false,
    });
    expect(sea?.id).not.toBe(dry?.id);
    expect(sea?.reward.count).toBe(2);
  });

  it('observes each cave resonance once and rebuilds notes from saved ids', () => {
    const observed = new Set<number>();
    const site = caveResonanceSite('notebook-seed', 77, 18, 'dryCave', observed)!;
    const result = observeCaveResonance(observed, site);

    expect(result.ok).toBe(true);
    expect(result.firstObservation).toBe(true);
    expect(observed.has(site.id)).toBe(true);
    expect(observeCaveResonance(observed, caveResonanceSite('notebook-seed', 77, 18, 'dryCave', observed)!).ok).toBe(false);

    const notes = caveResonanceNotebook('notebook-seed', observed);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id: site.id,
      tile: 77,
      layer: 18,
      label: site.label,
      observed: true,
    });
  });

  it('normalizes saved observation ids like other Hearth and Horizon progression lists', () => {
    expect(normalizeCaveResonanceObservations([9.9, 3, 9, -2, 3])).toEqual([3, 9]);
    expect(normalizeCaveResonanceObservations('nope')).toEqual([]);
  });
});
