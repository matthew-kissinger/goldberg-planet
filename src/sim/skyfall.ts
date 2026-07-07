import type { ItemId } from './crafting';
import { normalizePentagonList } from './landmarks';
import { hashString } from '../util/prng';

export type SkyfallKind = 'emberFall' | 'glassRain' | 'starBloom';

export interface SkyfallReward {
  item: ItemId;
  count: number;
  label: string;
}

export interface SkyfallOmen {
  label: string;
  detail: string;
  routeCue: string;
}

export interface SkyfallProfile {
  kind: SkyfallKind;
  label: string;
  dormantLabel: string;
  detail: string;
  omen: SkyfallOmen;
  reward: SkyfallReward;
}

export interface SkyfallSite {
  id: number;
  day: number;
  window: number;
  tile: number;
  kind: SkyfallKind;
  label: string;
  dormantLabel: string;
  detail: string;
  omen: SkyfallOmen;
  reward: SkyfallReward;
  active: boolean;
  harvested: boolean;
  minutesRemaining: number;
  hint: string;
}

export interface SkyfallHarvestResult {
  ok: boolean;
  site: SkyfallSite;
  item?: ItemId;
  count?: number;
  message: string;
}

export const SKYFALL_WINDOW_MINUTES = 360;

const SKYFALL_KINDS: SkyfallKind[] = ['emberFall', 'glassRain', 'starBloom'];

const PROFILE_BY_KIND: Record<SkyfallKind, SkyfallProfile> = {
  emberFall: {
    kind: 'emberFall',
    label: 'emberfall crater',
    dormantLabel: 'cool black crater',
    detail: 'fresh star-slag still ticking with orange heat',
    omen: {
      label: 'orange fall line',
      detail: 'a warm ember tail hangs high above the impact tile',
      routeCue: 'follow the orange fall line before it gutters out',
    },
    reward: { item: 'glowCrystal', count: 1, label: 'glow crystal' },
  },
  glassRain: {
    kind: 'glassRain',
    label: 'glass-rain shoal',
    dormantLabel: 'dull glass spray',
    detail: 'sand fused into pale window-glass ribs',
    omen: {
      label: 'pale shard halo',
      detail: 'a thin ring of sky-glass glints above the fall',
      routeCue: 'walk under the pale shard halo before it clears',
    },
    reward: { item: 'sand', count: 6, label: 'sand' },
  },
  starBloom: {
    kind: 'starBloom',
    label: 'starbloom fall',
    dormantLabel: 'closed starbloom',
    detail: 'fallen seed-stars rooting before dawn forgets them',
    omen: {
      label: 'seed-star veil',
      detail: 'soft seed sparks drift above the landing bloom',
      routeCue: 'track the seed-star veil before it folds back into the sky',
    },
    reward: { item: 'seeds', count: 2, label: 'berry seeds' },
  },
};

function normalizedMinute(minute: number): number {
  const m = Number.isFinite(minute) ? minute : 0;
  return ((m % 1440) + 1440) % 1440;
}

export function normalizeSkyfallHarvests(raw: unknown): number[] {
  return normalizePentagonList(raw);
}

export function skyfallProfile(kind: SkyfallKind): SkyfallProfile {
  return PROFILE_BY_KIND[kind];
}

export function skyfallKindLabel(kind: SkyfallKind): string {
  return kind === 'emberFall'
    ? 'ember fall'
    : kind === 'glassRain'
    ? 'glass rain'
    : 'star bloom';
}

export function skyfallSites(
  seed: string,
  day: number,
  minute: number,
  tileCount: number,
  harvested: ReadonlySet<number>,
): SkyfallSite[] {
  const count = Math.max(0, Math.trunc(tileCount));
  if (count <= 0) return [];
  const safeDay = Math.max(0, Math.trunc(Number.isFinite(day) ? day : 0));
  const minuteOfDay = normalizedMinute(minute);
  const window = Math.max(0, Math.min(3, Math.floor(minuteOfDay / SKYFALL_WINDOW_MINUTES)));
  const id = safeDay * 4 + window;
  const hash = hashString(`${seed}:skyfall:${safeDay}:${window}`);
  const kind = SKYFALL_KINDS[(hash >>> 8) % SKYFALL_KINDS.length];
  const profile = skyfallProfile(kind);
  const minutesRemaining = Math.max(1, Math.ceil((window + 1) * SKYFALL_WINDOW_MINUTES - minuteOfDay));
  return [{
    id,
    day: safeDay,
    window,
    tile: hash % count,
    kind,
    label: profile.label,
    dormantLabel: profile.dormantLabel,
    detail: profile.detail,
    omen: profile.omen,
    reward: profile.reward,
    active: true,
    harvested: harvested.has(id),
    minutesRemaining,
    hint: 'follow the route slate before the crater cools',
  }];
}

export function nearestSkyfallSite(
  tiles: readonly number[],
  sites: readonly SkyfallSite[],
): SkyfallSite | null {
  const tileOrder = new Map<number, number>();
  tiles.forEach((tile, index) => {
    if (!tileOrder.has(tile)) tileOrder.set(tile, index);
  });
  let best: SkyfallSite | null = null;
  let bestOrder = Infinity;
  for (const site of sites) {
    if (!site.active || site.harvested) continue;
    const order = tileOrder.get(site.tile);
    if (order === undefined) continue;
    if (!best || order < bestOrder || (order === bestOrder && site.id < best.id)) {
      best = site;
      bestOrder = order;
    }
  }
  return best;
}

export function harvestSkyfall(harvested: Set<number>, site: SkyfallSite): SkyfallHarvestResult {
  if (!site.active) {
    return { ok: false, site, message: `${site.dormantLabel} has gone quiet` };
  }
  if (site.harvested || harvested.has(site.id)) {
    return { ok: false, site, message: `${site.label} already gathered` };
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
