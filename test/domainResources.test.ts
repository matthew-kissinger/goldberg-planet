import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { pentagonTileIds } from '../src/sim/landmarks';
import {
  domainResourceProfile,
  domainResourceSites,
  harvestDomainResource,
  nearestDomainResourceSite,
  normalizeDomainHarvests,
} from '../src/sim/domainResources';

describe('Hearth and Horizon pentagon domain resources', () => {
  const geo = new Goldberg(8);
  const pentagons = pentagonTileIds(geo);

  it('creates three deterministic resource sites around every pentagon', () => {
    const sites = domainResourceSites(pentagons, geo, new Set([pentagons[0]]), new Set([1]));
    expect(pentagons).toHaveLength(12);
    expect(sites).toHaveLength(36);
    expect(sites.slice(0, 3).map((site) => site.id)).toEqual([0, 1, 2]);
    expect(sites[0]).toMatchObject({
      tile: pentagons[0],
      ring: 0,
      discovered: true,
      harvested: false,
      effect: 'hearth',
      kind: 'hearthCoal',
      reward: { item: 'campfire', count: 1 },
    });
    expect(sites[1]).toMatchObject({ discovered: true, harvested: true });
    expect(sites[3]).toMatchObject({ id: 10, discovered: false, harvested: false });
    expect(domainResourceProfile('tide').reward).toMatchObject({ item: 'bait', count: 2 });
  });

  it('finds the nearest unharvested site from local tiles', () => {
    const sites = domainResourceSites(pentagons, geo, new Set([pentagons[0]]), new Set([0]));
    const firstOpen = sites.find((site) => site.id === 1)!;
    const fartherOpen = sites.find((site) => site.id === 2)!;

    expect(nearestDomainResourceSite([firstOpen.tile, fartherOpen.tile], sites)?.id).toBe(1);
    expect(nearestDomainResourceSite([sites[0].tile, fartherOpen.tile], sites)?.id).toBe(2);
    expect(nearestDomainResourceSite([999999], sites)).toBeNull();
  });

  it('requires the matching pentagon to be awakened before harvest', () => {
    const hiddenSites = domainResourceSites(pentagons, geo, new Set(), new Set());
    const hidden = hiddenSites[0];
    const harvested = new Set<number>();

    const quiet = harvestDomainResource(harvested, hidden);
    expect(quiet.ok).toBe(false);
    expect(quiet.message).toContain('is quiet');
    expect(harvested.size).toBe(0);

    const openSites = domainResourceSites(pentagons, geo, new Set([hidden.landmarkTile]), harvested);
    const open = openSites[0];
    const result = harvestDomainResource(harvested, open);
    expect(result).toMatchObject({ ok: true, item: 'campfire', count: 1 });
    expect(harvested.has(open.id)).toBe(true);

    const duplicate = harvestDomainResource(harvested, open);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.message).toContain('already gathered');
    expect(normalizeDomainHarvests([open.id, open.id, -3, 1.8, Number.NaN])).toEqual([1, open.id].sort((a, b) => a - b));
  });
});
