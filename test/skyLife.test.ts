import { describe, expect, it } from 'vitest';
import { skyLifeSitesAround, type SkyLifeCandidate } from '../src/sim/skyLife';

const candidates: SkyLifeCandidate[] = [
  { tile: 10, ring: 0, height: 4, nearWater: false, nearTrees: false },
  { tile: 11, ring: 1, height: 1, nearWater: true, nearTrees: false },
  { tile: 12, ring: 1, height: 9, nearWater: false, nearTrees: true },
  { tile: 13, ring: 2, height: 14, nearWater: false, nearTrees: false },
];

describe('sky-life site selection', () => {
  it('chooses weather, shore, forest, and high-sky sites from nearby hex cues', () => {
    const sites = skyLifeSitesAround({
      centerTile: 10,
      day: 2,
      minute: 700,
      weatherKind: 'storm',
      weatherLabel: 'storm front',
      weatherIntensity: 0.88,
      domainEffect: 'storm',
      domainIntensity: 0.7,
      candidates,
      maxSites: 4,
    });

    expect(sites.map((site) => site.kind)).toEqual(['storm', 'shore', 'forest', 'sky']);
    expect(new Set(sites.map((site) => site.tile)).size).toBe(sites.length);
    expect(sites[0]).toMatchObject({
      kind: 'storm',
      weatherKind: 'storm',
      weatherLabel: 'storm front',
    });
  });

  it('always keeps a stable high-sky fallback when biome cues are quiet', () => {
    const first = skyLifeSitesAround({
      centerTile: 10,
      day: 0,
      minute: 90,
      weatherKind: 'clear',
      weatherLabel: 'clear',
      weatherIntensity: 0.2,
      candidates: [candidates[0]],
    });
    const second = skyLifeSitesAround({
      centerTile: 10,
      day: 0,
      minute: 100,
      weatherKind: 'clear',
      weatherLabel: 'clear',
      weatherIntensity: 0.2,
      candidates: [candidates[0]],
    });

    expect(first).toHaveLength(1);
    expect(first[0].kind).toBe('sky');
    expect(second[0].id).toBe(first[0].id);
  });
});
