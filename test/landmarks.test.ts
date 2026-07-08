import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import {
  allPentagonLandmarks,
  discoverPentagon,
  nearestPentagonOnTiles,
  normalizePentagonDiscoveries,
  normalizePentagonList,
  pentagonLandmark,
  pentagonProgress,
  pentagonTileIds,
} from '../src/sim/landmarks';

describe('Hearth and Horizon pentagon waypoints', () => {
  const geo = new Goldberg(8);
  const pentagons = pentagonTileIds(geo);

  it('finds the twelve Goldberg pentagons as stable landmark ids', () => {
    expect(pentagons).toHaveLength(12);
    expect(pentagons).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(pentagonLandmark(0, pentagons, new Set())).toMatchObject({
      index: 0,
      tile: 0,
      name: 'First Hearth',
      discovered: false,
    });
    expect(pentagonLandmark(99, pentagons, new Set())).toBeNull();
  });

  it('normalizes saved discoveries against valid pentagon tiles', () => {
    expect(normalizePentagonList([5, 2, 5, -1, 3.8, Number.NaN, '7'])).toEqual([2, 3, 5]);
    expect(normalizePentagonDiscoveries([7, 22, 1, 1, 0], pentagons)).toEqual([0, 1, 7]);
  });

  it('discovers nearby pentagon landmarks once and tracks progress', () => {
    const discovered = new Set<number>();
    expect(nearestPentagonOnTiles([99, 42, 6], pentagons)).toBe(6);
    expect(pentagonProgress(discovered, pentagons)).toMatchObject({ count: 0, total: 12, complete: false });

    const first = discoverPentagon(discovered, 6, pentagons);
    expect(first).toMatchObject({ ok: true, alreadyKnown: false, count: 1, total: 12 });
    expect(first.message).toContain('awakened 1/12');
    expect(discovered.has(6)).toBe(true);

    const repeat = discoverPentagon(discovered, 6, pentagons);
    expect(repeat).toMatchObject({ ok: true, alreadyKnown: true, count: 1, total: 12 });
    expect(repeat.message).not.toContain('awakened 2/12');

    const miss = discoverPentagon(discovered, 99, pentagons);
    expect(miss).toMatchObject({ ok: false, count: 1, total: 12 });
  });

  it('gives every landmark a stable name and clue with no reward or insight payload', () => {
    const landmarks = allPentagonLandmarks(pentagons, new Set([2, 10]));
    expect(landmarks).toHaveLength(12);
    expect(new Set(landmarks.map((l) => l.name)).size).toBe(12);
    expect(landmarks[2]).toMatchObject({ index: 2, tile: 2, name: 'Salt Mirror', discovered: true });
    expect(landmarks[10]).toMatchObject({ index: 10, tile: 10, name: 'Deep Bell', discovered: true });
    expect(landmarks[1]).toMatchObject({ index: 1, discovered: false });
    for (const landmark of landmarks) {
      expect(landmark).not.toHaveProperty('insight');
      expect(landmark.clue.length).toBeGreaterThan(10);
    }
  });

  it('reports completion once every pentagon is awakened', () => {
    const discovered = new Set<number>(pentagons);
    expect(pentagonProgress(discovered, pentagons)).toMatchObject({ count: 12, total: 12, complete: true, label: 'all pentagons awake' });
  });
});
