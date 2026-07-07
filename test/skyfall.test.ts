import { describe, expect, it } from 'vitest';
import {
  harvestSkyfall,
  nearestSkyfallSite,
  normalizeSkyfallHarvests,
  skyfallKindLabel,
  skyfallSites,
} from '../src/sim/skyfall';

describe('Hearth and Horizon skyfall events', () => {
  it('creates a deterministic active impact site for each day window', () => {
    const harvested = new Set<number>();
    const morning = skyfallSites('sky-seed', 2, 120, 1000, harvested)[0];
    const repeat = skyfallSites('sky-seed', 2, 120, 1000, harvested)[0];
    const afternoon = skyfallSites('sky-seed', 2, 500, 1000, harvested)[0];

    expect(morning).toEqual(repeat);
    expect(morning).toMatchObject({
      id: 8,
      day: 2,
      window: 0,
      active: true,
      harvested: false,
    });
    expect(morning.tile).toBeGreaterThanOrEqual(0);
    expect(morning.tile).toBeLessThan(1000);
    expect(morning.minutesRemaining).toBe(240);
    expect(morning.omen).toMatchObject({
      label: expect.stringMatching(/line|halo|veil/),
      detail: expect.stringContaining('above'),
    });
    expect(afternoon.id).toBe(9);
    expect(afternoon.tile).not.toBe(morning.tile);
    expect(skyfallKindLabel(morning.kind)).toMatch(/fall|rain|bloom/);
  });

  it('finds and harvests only local unclaimed skyfall sites', () => {
    const harvested = new Set<number>();
    const site = skyfallSites('harvest-sky', 0, 45, 400, harvested)[0];

    expect(nearestSkyfallSite([site.tile + 1, site.tile], [site])?.id).toBe(site.id);
    const result = harvestSkyfall(harvested, site);
    expect(result.ok).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(harvested.has(site.id)).toBe(true);

    const refreshed = skyfallSites('harvest-sky', 0, 45, 400, harvested)[0];
    expect(refreshed.harvested).toBe(true);
    expect(nearestSkyfallSite([site.tile], [refreshed])).toBeNull();
    expect(harvestSkyfall(harvested, refreshed).message).toContain('already gathered');
  });

  it('normalizes saved skyfall harvest ids', () => {
    expect(normalizeSkyfallHarvests([5, 1, 5, -2, 2.8, Number.NaN])).toEqual([1, 2, 5]);
  });
});
