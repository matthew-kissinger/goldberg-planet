import type { ItemId } from './crafting';
import { normalizePentagonList, pentagonLandmark, type PentagonDomainTopology, type PentagonInsightEffect } from './landmarks';

export type DomainResourceKind =
  | 'hearthCoal'
  | 'rainReed'
  | 'saltShell'
  | 'lanternShard'
  | 'rootPod'
  | 'redNodule'
  | 'snowBloom'
  | 'glassShard'
  | 'stormAmber'
  | 'reedKelp'
  | 'bellCrystal'
  | 'horizonShard';

export interface DomainResourceReward {
  item: ItemId;
  count: number;
  label: string;
}

export interface DomainResourceProfile {
  kind: DomainResourceKind;
  label: string;
  dormantLabel: string;
  detail: string;
  reward: DomainResourceReward;
}

export interface DomainResourceSite {
  id: number;
  slot: number;
  tile: number;
  ring: number;
  landmarkTile: number;
  landmarkIndex: number;
  landmarkName: string;
  effect: PentagonInsightEffect;
  kind: DomainResourceKind;
  label: string;
  dormantLabel: string;
  detail: string;
  reward: DomainResourceReward;
  discovered: boolean;
  harvested: boolean;
  hint: string;
}

export interface DomainHarvestResult {
  ok: boolean;
  site: DomainResourceSite;
  item?: ItemId;
  count?: number;
  message: string;
}

const PROFILE_BY_EFFECT: Record<PentagonInsightEffect, DomainResourceProfile> = {
  hearth: {
    kind: 'hearthCoal',
    label: 'hearth coal',
    dormantLabel: 'warm black stone',
    detail: 'a coal-dark ember that keeps home warmth in its cracks',
    reward: { item: 'campfire', count: 1, label: 'campfire kit' },
  },
  weather: {
    kind: 'rainReed',
    label: 'rain reed bundle',
    dormantLabel: 'rain-bent reeds',
    detail: 'reed ribs that twitch before rain reaches the ground',
    reward: { item: 'roofBundle', count: 1, label: 'roof bundle' },
  },
  tide: {
    kind: 'saltShell',
    label: 'salt shell cache',
    dormantLabel: 'white shell glint',
    detail: 'shells and salt scraps that pull fish toward shore',
    reward: { item: 'bait', count: 2, label: 'bait' },
  },
  light: {
    kind: 'lanternShard',
    label: 'lantern shard',
    dormantLabel: 'high glass glint',
    detail: 'a bright shard that remembers the line between cave light and starlight',
    reward: { item: 'glowCrystal', count: 1, label: 'glow crystal' },
  },
  root: {
    kind: 'rootPod',
    label: 'root-vault pods',
    dormantLabel: 'knotted root pod',
    detail: 'seed pods tucked where roots find hidden rooms',
    reward: { item: 'seeds', count: 2, label: 'berry seeds' },
  },
  stone: {
    kind: 'redNodule',
    label: 'red stone nodule',
    dormantLabel: 'red stone nodule',
    detail: 'a tool-colored nodule that flakes cleanly from the scree',
    reward: { item: 'rock', count: 6, label: 'rock' },
  },
  cold: {
    kind: 'snowBloom',
    label: 'snow-dial bloom',
    dormantLabel: 'pale snow bloom',
    detail: 'a cold herb bloom that opens according to ridge weather',
    reward: { item: 'snowHerb', count: 2, label: 'snow herbs' },
  },
  glass: {
    kind: 'glassShard',
    label: 'glass shoal shard',
    dormantLabel: 'sand-glass glint',
    detail: 'a sand-sharp glint useful for windows and route sightlines',
    reward: { item: 'sand', count: 6, label: 'sand' },
  },
  storm: {
    kind: 'stormAmber',
    label: 'storm amber',
    dormantLabel: 'charged amber fleck',
    detail: 'amber that hums when storm routes are about to turn',
    reward: { item: 'campMeal', count: 1, label: 'camp meal' },
  },
  water: {
    kind: 'reedKelp',
    label: 'reed-water kelp',
    dormantLabel: 'reed-water tangle',
    detail: 'kelp caught in reeds that hint at water below the land',
    reward: { item: 'kelp', count: 2, label: 'kelp' },
  },
  cave: {
    kind: 'bellCrystal',
    label: 'deep-bell crystal',
    dormantLabel: 'quiet blue crystal',
    detail: 'a crystal chip that rings softly near cave pressure',
    reward: { item: 'glowCrystal', count: 2, label: 'glow crystals' },
  },
  horizon: {
    kind: 'horizonShard',
    label: 'horizon shard',
    dormantLabel: 'flat horizon shard',
    detail: 'a marker-stone that points two ways around the curve',
    reward: { item: 'waystone', count: 1, label: 'waystone' },
  },
};

export function normalizeDomainHarvests(raw: unknown): number[] {
  return normalizePentagonList(raw);
}

export function domainResourceProfile(effect: PentagonInsightEffect): DomainResourceProfile {
  return PROFILE_BY_EFFECT[effect];
}

function ringTiles(origin: number, topology: PentagonDomainTopology, maxRing: number): { tile: number; ring: number }[] {
  const out: { tile: number; ring: number }[] = [{ tile: origin, ring: 0 }];
  const visited = new Set<number>([origin]);
  let frontier = [origin];
  for (let ring = 1; ring <= maxRing; ring++) {
    const next: number[] = [];
    for (const tile of frontier) {
      const degree = Math.max(0, Math.trunc(topology.degreeOf(tile)));
      for (let edge = 0; edge < degree; edge++) {
        const n = topology.neighbor(tile, edge);
        if (n < 0 || visited.has(n)) continue;
        visited.add(n);
        next.push(n);
      }
    }
    next.sort((a, b) => a - b);
    for (const tile of next) out.push({ tile, ring });
    frontier = next;
  }
  return out;
}

export function domainResourceSites(
  pentagonTiles: readonly number[],
  topology: PentagonDomainTopology,
  discovered: ReadonlySet<number>,
  harvested: ReadonlySet<number>,
): DomainResourceSite[] {
  const sites: DomainResourceSite[] = [];
  for (let index = 0; index < pentagonTiles.length; index++) {
    const landmarkTile = pentagonTiles[index];
    const landmark = pentagonLandmark(landmarkTile, pentagonTiles, discovered);
    if (!landmark?.insight) continue;
    const profile = domainResourceProfile(landmark.insight.effect);
    const candidates = ringTiles(landmarkTile, topology, 2);
    const slots = [
      candidates[0],
      candidates.find((entry) => entry.ring === 1) ?? candidates[0],
      candidates.filter((entry) => entry.ring === 2)[(index * 3) % Math.max(1, candidates.filter((entry) => entry.ring === 2).length)] ?? candidates[candidates.length - 1],
    ];
    for (let slot = 0; slot < slots.length; slot++) {
      const entry = slots[slot];
      const id = index * 10 + slot;
      sites.push({
        id,
        slot,
        tile: entry.tile,
        ring: entry.ring,
        landmarkTile,
        landmarkIndex: index,
        landmarkName: landmark.name,
        effect: landmark.insight.effect,
        kind: profile.kind,
        label: slot === 0 ? profile.label : `${profile.label} ${slot + 1}`,
        dormantLabel: profile.dormantLabel,
        detail: profile.detail,
        reward: profile.reward,
        discovered: discovered.has(landmarkTile),
        harvested: harvested.has(id),
        hint: `awaken ${landmark.name} to gather ${profile.label}`,
      });
    }
  }
  return sites.sort((a, b) => a.id - b.id);
}

export function nearestDomainResourceSite(
  tiles: readonly number[],
  sites: readonly DomainResourceSite[],
): DomainResourceSite | null {
  const tileOrder = new Map<number, number>();
  tiles.forEach((tile, index) => {
    if (!tileOrder.has(tile)) tileOrder.set(tile, index);
  });
  let best: DomainResourceSite | null = null;
  let bestOrder = Infinity;
  for (const site of sites) {
    if (site.harvested) continue;
    const order = tileOrder.get(site.tile);
    if (order === undefined) continue;
    if (!best || order < bestOrder || (order === bestOrder && site.id < best.id)) {
      best = site;
      bestOrder = order;
    }
  }
  return best;
}

export function harvestDomainResource(harvested: Set<number>, site: DomainResourceSite): DomainHarvestResult {
  if (site.harvested || harvested.has(site.id)) {
    return { ok: false, site, message: `${site.label} already gathered` };
  }
  if (!site.discovered) {
    return { ok: false, site, message: `${site.dormantLabel} is quiet - ${site.hint}` };
  }
  harvested.add(site.id);
  return {
    ok: true,
    site,
    item: site.reward.item,
    count: site.reward.count,
    message: `gathered ${site.label} · +${site.reward.count} ${site.reward.label}`,
  };
}
