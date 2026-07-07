import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import {
  completePentagonSiteWork,
  discoverPentagon,
  evaluatePentagonSiteWork,
  nearestPentagonOnTiles,
  nearestThresholdChamberSite,
  normalizePentagonDiscoveries,
  normalizePentagonList,
  normalizePentagonSiteCompletions,
  normalizeThresholdChamberObservations,
  observeThresholdChamber,
  pentagonDomainAt,
  pentagonExpeditionSiteAt,
  pentagonExpeditionSiteForIndex,
  pentagonExpeditionSites,
  pentagonInsightReport,
  pentagonInsightRewardText,
  pentagonLandmark,
  pentagonLandscapeProfileForIndex,
  pentagonLandscapeProfiles,
  pentagonProgress,
  pentagonSiteThreshold,
  pentagonSiteThresholdEffect,
  pentagonSiteThresholdProfile,
  pentagonSiteThresholdTerrainSpec,
  pentagonSiteThresholds,
  pentagonSiteWorkPlan,
  pentagonThresholdChambers,
  pentagonTileIds,
} from '../src/sim/landmarks';
import type { StructureSave } from '../src/sim/structures';

describe('Hearth and Horizon pentagon landmarks', () => {
  const geo = new Goldberg(8);
  const pentagons = pentagonTileIds(geo);

  it('finds the twelve Goldberg pentagons as stable landmark ids', () => {
    expect(pentagons).toHaveLength(12);
    expect(pentagons).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(pentagonLandmark(0, pentagons, new Set())).toMatchObject({
      index: 0,
      tile: 0,
      name: 'First Hearth',
      insight: { label: 'Hearth Memory', effect: 'hearth' },
      discovered: false,
    });
  });

  it('normalizes saved discoveries against valid pentagon tiles', () => {
    expect(normalizePentagonList([5, 2, 5, -1, 3.8, Number.NaN, '7'])).toEqual([2, 3, 5]);
    expect(normalizePentagonDiscoveries([7, 22, 1, 1, 0], pentagons)).toEqual([0, 1, 7]);
    expect(normalizePentagonSiteCompletions([10, 2, 10, 999, -1], pentagons)).toEqual([2, 10]);
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

  it('assigns each pentagon a stable insight and practical reward', () => {
    const salt = pentagonLandmark(2, pentagons, new Set());
    expect(salt?.insight).toMatchObject({
      id: 'saltTide',
      label: 'Salt Tide',
      effect: 'tide',
      reward: [{ item: 'bait', count: 3, label: 'bait' }],
    });
    expect(pentagonInsightRewardText(salt?.insight)).toBe('+3 bait');

    const deep = pentagonLandmark(10, pentagons, new Set());
    expect(deep?.insight).toMatchObject({
      label: 'Deep Bell',
      effect: 'cave',
      reward: [{ item: 'glowCrystal', count: 2, label: 'glow crystals' }],
    });
  });

  it('assigns each pentagon a distinct landscape geometry profile', () => {
    const profiles = pentagonLandscapeProfiles(pentagons);
    expect(profiles).toHaveLength(12);
    expect(new Set(profiles.map((profile) => profile.silhouette)).size).toBe(12);
    expect(profiles[0]).toMatchObject({
      index: 0,
      effect: 'hearth',
      label: 'hearthstone apron',
      silhouette: 'hearth-ring',
      ribCount: 5,
      markerCount: 5,
    });
    expect(profiles[11]).toMatchObject({
      effect: 'horizon',
      silhouette: 'horizon-vanes',
      ribCount: 9,
    });
    for (const profile of profiles) {
      expect(profile.markerHeight).toBeGreaterThan(0.5);
      expect(profile.terrainCue.length).toBeGreaterThan(24);
    }
    expect(pentagonLandscapeProfileForIndex(Number.NaN)).toMatchObject({ index: 0, effect: 'hearth' });
  });

  it('turns each pentagon landscape into a distinct expedition site contract', () => {
    const sites = pentagonExpeditionSites(pentagons, new Set([0, 10]));
    expect(sites).toHaveLength(12);
    expect(new Set(sites.map((site) => site.kind)).size).toBe(12);
    expect(sites[0]).toMatchObject({
      discovered: true,
      label: 'First Hearth hearth niche',
      siteLabel: 'hearth niche',
      kind: 'hearthNiche',
      buildHint: 'build bedroll + lit campfire + chest inside the apron',
    });
    expect(sites[1]).toMatchObject({
      discovered: false,
      label: 'rain-reading blind',
      routeHint: 'awaken Rainward Gate to read the rain-reading blind',
    });

    const quietTide = pentagonExpeditionSiteAt(2, geo, pentagons, new Set(), 2);
    expect(quietTide).toMatchObject({
      tile: 2,
      ring: 0,
      discovered: false,
      kind: 'tideDock',
      label: 'salt dock cut',
    });
    expect(quietTide?.routeHint).toContain('awaken Salt Mirror');

    const knownBell = pentagonExpeditionSiteAt(10, geo, pentagons, new Set([10]), 2);
    expect(knownBell).toMatchObject({
      discovered: true,
      label: 'Deep Bell deep-bell throat',
      kind: 'bellCave',
      opportunity: 'a cave-reading station for echo lanterns, anchors, and glow crystals',
    });
    expect(pentagonExpeditionSiteForIndex(Number.NaN)).toMatchObject({ kind: 'hearthNiche', discovered: true });
  });

  it('evaluates and completes physical site-work contracts', () => {
    const site = pentagonExpeditionSiteForIndex(0);
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: site.tile, layer: 4, yaw: 0, state: { home: true } },
      { id: 2, item: 'campfire', tile: site.tile + 1, layer: 4, yaw: 0, state: { lit: true } },
      { id: 3, item: 'chest', tile: site.tile + 2, layer: 4, yaw: 0 },
    ];
    const completed = new Set<number>();

    const status = evaluatePentagonSiteWork(site, structures, {}, completed);
    expect(pentagonSiteWorkPlan(site.kind)).toMatchObject({ completion: 'hearth niche complete' });
    expect(status.ready).toBe(true);
    expect(status.completed).toBe(false);
    expect(status.missing).toEqual([]);

    const result = completePentagonSiteWork(completed, site, structures, {});
    expect(result).toMatchObject({
      ok: true,
      alreadyComplete: false,
      reward: { item: 'expeditionStew', count: 1 },
    });
    expect(completed.has(site.tile)).toBe(true);

    const repeat = completePentagonSiteWork(completed, site, structures, {});
    expect(repeat).toMatchObject({ ok: true, alreadyComplete: true });
  });

  it('keeps site work incomplete until required structure states and carried kit match', () => {
    const hearth = pentagonExpeditionSiteForIndex(0);
    const notLit: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: hearth.tile, layer: 4, yaw: 0, state: { home: true } },
      { id: 2, item: 'campfire', tile: hearth.tile + 1, layer: 4, yaw: 0, state: { lit: false } },
      { id: 3, item: 'chest', tile: hearth.tile + 2, layer: 4, yaw: 0 },
    ];
    const hearthStatus = evaluatePentagonSiteWork(hearth, notLit, {}, new Set());
    expect(hearthStatus.ready).toBe(false);
    expect(hearthStatus.missing.map((req) => req.label)).toEqual(['lit campfire']);

    const bell = pentagonExpeditionSiteForIndex(10);
    const anchored: StructureSave[] = [
      { id: 10, item: 'caveAnchor', tile: bell.tile, layer: 4, yaw: 0, state: { anchorKind: 'dryCave', anchorTile: 200 } },
    ];
    expect(evaluatePentagonSiteWork(bell, anchored, {}, new Set()).missing.map((req) => req.label)).toEqual(['echo lantern carried']);
    expect(evaluatePentagonSiteWork(bell, anchored, { echoLantern: 1 }, new Set()).ready).toBe(true);

    const scree = pentagonExpeditionSiteForIndex(5);
    const marked: StructureSave[] = [
      { id: 20, item: 'waystone', tile: scree.tile, layer: 4, yaw: 0, state: { waystone: 'survey' } },
    ];
    expect(evaluatePentagonSiteWork(scree, marked, { echoPick: 1 }, new Set()).ready).toBe(true);
  });

  it('derives distinct threshold landforms from expedition sites and opens them after completion', () => {
    const sites = pentagonExpeditionSites(pentagons, new Set([0, 10]));
    const thresholds = pentagonSiteThresholds(pentagons, new Set([0, 10]), new Set([0]));
    expect(thresholds).toHaveLength(12);
    expect(new Set(thresholds.map((threshold) => threshold.shape)).size).toBe(12);

    const hearth = pentagonSiteThreshold(sites[0], new Set([0]));
    expect(hearth).toMatchObject({
      open: true,
      completed: true,
      label: 'hearth arch',
      traversal: 'walk-under home arch',
      shape: 'lowArch',
    });
    expect(hearth.detail).toContain('doorway home');

    const bell = pentagonSiteThreshold(sites[10], new Set());
    expect(bell).toMatchObject({
      open: false,
      discovered: true,
      label: 'silent bell chamber',
      kind: 'sealedChamber',
      shape: 'bellChamber',
    });
    expect(bell.detail).toContain('complete the deep-bell throat');
    expect(pentagonSiteThresholdProfile('reedSpring')).toMatchObject({
      openLabel: 'reed spring mouth',
      kind: 'springMouth',
    });

    const effect = pentagonSiteThresholdEffect(hearth);
    expect(effect).toMatchObject({
      kind: 'homewardWarmth',
      routePrep: 'home',
      survival: { staminaRegenBonus: 0.18, exposureRateDelta: -0.18 },
    });
    expect(pentagonSiteThresholdTerrainSpec(hearth)).toMatchObject({
      role: 'underpass',
      label: 'hearth arch mouth',
      carveDepthCells: 4,
      tileSpan: 3,
    });
    expect(pentagonSiteThresholdEffect(bell)).toBeNull();
    expect(pentagonSiteThresholdTerrainSpec(bell)).toBeNull();
    expect(pentagonSiteThresholdTerrainSpec(pentagonSiteThreshold(sites[10], new Set([10])))).toMatchObject({
      role: 'chamber',
      carveDepthCells: 5,
      tileSpan: 2,
    });
  });

  it('opens one-time threshold chamber readings after site completion', () => {
    const chambers = pentagonThresholdChambers(pentagons, geo, new Set([0, 10]), new Set([0]), new Set());
    expect(chambers).toHaveLength(12);
    expect(normalizeThresholdChamberObservations([2, 2, -1, 0.9, Number.NaN])).toEqual([0, 2]);

    const hearth = chambers[0];
    expect(hearth).toMatchObject({
      id: 0,
      open: true,
      observed: false,
      label: 'hearth ember alcove',
      thresholdLabel: 'hearth arch',
      role: 'underpass',
      reward: { item: 'trailRation', count: 1 },
    });
    expect(hearth.tile).toBe(geo.neighbor(hearth.landmarkTile, 2));
    expect(nearestThresholdChamberSite([99, hearth.tile], chambers)?.id).toBe(0);

    const closedBell = chambers[10];
    expect(closedBell).toMatchObject({ open: false, label: 'deep-bell throat' });
    expect(nearestThresholdChamberSite([closedBell.tile], chambers)).toBeNull();

    const observed = new Set<number>();
    const read = observeThresholdChamber(observed, hearth);
    expect(read).toMatchObject({
      ok: true,
      firstObservation: true,
      item: 'trailRation',
      count: 1,
    });
    expect(read.message).toContain('the first return');
    expect(observed.has(0)).toBe(true);
    expect(observeThresholdChamber(observed, { ...hearth, observed: true })).toMatchObject({ ok: false, firstObservation: false });

    const openBell = pentagonThresholdChambers(pentagons, geo, new Set([10]), new Set([10]), new Set())[10];
    expect(openBell).toMatchObject({
      open: true,
      role: 'chamber',
      label: 'deep-bell throat',
      reward: { item: 'glowCrystal', count: 2 },
    });
  });

  it('derives an insight report from saved pentagon discoveries', () => {
    const report = pentagonInsightReport(pentagons, new Set([0, 2, 10]));
    expect(report).toMatchObject({
      count: 3,
      total: 12,
      label: 'insights 3/12',
      prepLabel: 'Hearth Memory + Salt Tide + Deep Bell',
    });
    expect(report.labels).toEqual(['Hearth Memory', 'Salt Tide', 'Deep Bell']);
    expect(report.effects).toEqual(['hearth', 'tide', 'cave']);
    expect(report.ids).toEqual(['hearthMemory', 'saltTide', 'deepBell']);
  });

  it('reports local pentagon domains before and after discovery', () => {
    const quiet = pentagonDomainAt(2, geo, pentagons, new Set(), 2);
    expect(quiet).toMatchObject({
      tile: 2,
      ring: 0,
      effect: 'tide',
      discovered: false,
      label: 'salt-tide shore',
      domainLabel: 'salt-tide shore',
    });
    expect(quiet?.routeHint).toContain('awaken Salt Mirror');

    const known = pentagonDomainAt(2, geo, pentagons, new Set([2]), 2);
    expect(known).toMatchObject({
      label: 'Salt Mirror domain',
      discovered: true,
      boon: 'fish schools and bait runs become easier to find',
    });

    expect(pentagonDomainAt(42, geo, pentagons, new Set(), 0)).toBeNull();
  });
});
