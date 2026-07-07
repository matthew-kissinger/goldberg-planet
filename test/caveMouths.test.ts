import { describe, expect, it } from 'vitest';
import { caveMouthSignals, nearestCaveMouthSignal, type CaveMouthColumns } from '../src/sim/caveMouths';
import type { NaturalVoidKind } from '../src/world/caves';

function columnsWith(samples: Record<number, { kind: NaturalVoidKind; start: number; end: number; depth: number; flooded?: boolean; spring?: boolean }>): CaveMouthColumns {
  return {
    topLayerOf: () => 4,
    naturalVoidAt: (tile, layer) => {
      const sample = samples[tile];
      if (!sample || layer < sample.start || layer > sample.end) return null;
      return {
        kind: sample.kind,
        depth: sample.depth,
        flooded: sample.flooded === true,
        spring: sample.spring === true,
      };
    },
  };
}

describe('Hearth and Horizon cave mouth signals', () => {
  it('turns real natural void clearance into routeable cave mouth signals', () => {
    const signals = caveMouthSignals(columnsWith({
      2: { kind: 'arch', start: 7, end: 9, depth: 3.4 },
      3: { kind: 'dryCave', start: 8, end: 12, depth: 13.2 },
      4: { kind: 'seaCave', start: 6, end: 8, depth: 5.1, flooded: true },
    }), [
      { tile: 2, ring: 1 },
      { tile: 3, ring: 1 },
      { tile: 4, ring: 2 },
    ]);

    expect(signals.map((signal) => signal.label)).toEqual(['dry cave mouth', 'land arch', 'sea-cave mouth']);
    expect(signals[0]).toMatchObject({
      tile: 3,
      kind: 'dryCave',
      ring: 1,
      clearance: 5,
      ready: true,
      routeHint: 'dry cave entrance for crystals, mushrooms, and darkness pressure',
    });
    expect(signals[2].detail).toContain('flooded');
  });

  it('surfaces sealed spring pockets as distinct dry cave route hints', () => {
    const signals = caveMouthSignals(columnsWith({
      7: { kind: 'dryCave', start: 8, end: 11, depth: 14.4, spring: true },
    }), [{ tile: 7, ring: 0 }]);

    expect(signals[0]).toMatchObject({
      tile: 7,
      kind: 'dryCave',
      label: 'spring cave mouth',
      spring: true,
      routeHint: 'sealed freshwater seep for inland cisterns and cave camps',
    });
    expect(signals[0].detail).toContain('spring seep');
  });

  it('ignores tiny cracks and returns the nearest ranked mouth', () => {
    const signals = caveMouthSignals(columnsWith({
      5: { kind: 'dryCave', start: 6, end: 6, depth: 14 },
      6: { kind: 'seaCave', start: 8, end: 10, depth: 7, flooded: true },
    }), [
      { tile: 5, ring: 0 },
      { tile: 6, ring: 2 },
    ]);

    expect(signals).toHaveLength(1);
    expect(nearestCaveMouthSignal(signals)).toMatchObject({ tile: 6, label: 'sea-cave mouth' });
    expect(nearestCaveMouthSignal([])).toBeNull();
  });
});
