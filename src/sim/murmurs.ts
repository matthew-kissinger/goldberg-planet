import { normalizePentagonList } from './landmarks';
import { hashString } from '../util/prng';

export type MurmurKind = 'windThread' | 'tideBell' | 'rootWhisper' | 'caveBreath' | 'starGlass';

export interface MurmurProfile {
  kind: MurmurKind;
  label: string;
  detail: string;
  note: string;
  hint: string;
}

export interface MurmurSite {
  id: number;
  day: number;
  window: number;
  slot: number;
  tile: number;
  kind: MurmurKind;
  label: string;
  detail: string;
  note: string;
  hint: string;
  active: boolean;
  observed: boolean;
  minutesRemaining: number;
}

export interface MurmurObserveResult {
  ok: boolean;
  site: MurmurSite;
  message: string;
  firstObservation: boolean;
}

export const MURMUR_WINDOW_MINUTES = 480;
export const MURMUR_SITES_PER_WINDOW = 3;

const MURMUR_KINDS: MurmurKind[] = ['windThread', 'tideBell', 'rootWhisper', 'caveBreath', 'starGlass'];

const PROFILE_BY_KIND: Record<MurmurKind, MurmurProfile> = {
  windThread: {
    kind: 'windThread',
    label: 'wind-thread shimmer',
    detail: 'thin air lines comb across the hexes without touching them',
    note: 'the wind bends around something you cannot see yet',
    hint: 'stand close and listen before the thread pulls apart',
  },
  tideBell: {
    kind: 'tideBell',
    label: 'tide-bell hush',
    detail: 'a low glass bell answers from under soil and water',
    note: 'water seems to remember a path below the ground',
    hint: 'listen near the ringing ground before the tide turns',
  },
  rootWhisper: {
    kind: 'rootWhisper',
    label: 'root-whisper knot',
    detail: 'small motes orbit a root mark that was not planted',
    note: 'roots are finding rooms long before you dig them open',
    hint: 'watch the motes and mark what they circle',
  },
  caveBreath: {
    kind: 'caveBreath',
    label: 'cave-breath seam',
    detail: 'cold breath rises from a hairline in the stone',
    note: 'some caves announce themselves before they have a doorway',
    hint: 'listen for the returning breath before moving on',
  },
  starGlass: {
    kind: 'starGlass',
    label: 'star-glass glimmer',
    detail: 'a faint shard reflection appears only when you move',
    note: 'the sky leaves fingerprints even where nothing has fallen',
    hint: 'walk around the glimmer and listen for the angle',
  },
};

function normalizedMinute(minute: number): number {
  const m = Number.isFinite(minute) ? minute : 0;
  return ((m % 1440) + 1440) % 1440;
}

export function normalizeMurmurObservations(raw: unknown): number[] {
  return normalizePentagonList(raw);
}

export function murmurProfile(kind: MurmurKind): MurmurProfile {
  return PROFILE_BY_KIND[kind];
}

export function murmurKindLabel(kind: MurmurKind): string {
  return kind === 'windThread'
    ? 'wind thread'
    : kind === 'tideBell'
    ? 'tide bell'
    : kind === 'rootWhisper'
    ? 'root whisper'
    : kind === 'caveBreath'
    ? 'cave breath'
    : 'star glass';
}

export function murmurSites(
  seed: string,
  day: number,
  minute: number,
  tileCount: number,
  observed: ReadonlySet<number>,
): MurmurSite[] {
  const count = Math.max(0, Math.trunc(tileCount));
  if (count <= 0) return [];
  const safeDay = Math.max(0, Math.trunc(Number.isFinite(day) ? day : 0));
  const minuteOfDay = normalizedMinute(minute);
  const window = Math.max(0, Math.min(2, Math.floor(minuteOfDay / MURMUR_WINDOW_MINUTES)));
  const minutesRemaining = Math.max(1, Math.ceil((window + 1) * MURMUR_WINDOW_MINUTES - minuteOfDay));
  const sites: MurmurSite[] = [];
  for (let slot = 0; slot < MURMUR_SITES_PER_WINDOW; slot++) {
    const id = safeDay * 30 + window * 10 + slot;
    const hash = hashString(`${seed}:murmur:${safeDay}:${window}:${slot}`);
    const kind = MURMUR_KINDS[(hash >>> (slot + 3)) % MURMUR_KINDS.length];
    const profile = murmurProfile(kind);
    sites.push({
      id,
      day: safeDay,
      window,
      slot,
      tile: hash % count,
      kind,
      label: profile.label,
      detail: profile.detail,
      note: profile.note,
      hint: profile.hint,
      active: true,
      observed: observed.has(id),
      minutesRemaining,
    });
  }
  return sites.sort((a, b) => a.id - b.id);
}

export function nearestMurmurSite(
  tiles: readonly number[],
  sites: readonly MurmurSite[],
): MurmurSite | null {
  const tileOrder = new Map<number, number>();
  tiles.forEach((tile, index) => {
    if (!tileOrder.has(tile)) tileOrder.set(tile, index);
  });
  let best: MurmurSite | null = null;
  let bestOrder = Infinity;
  for (const site of sites) {
    if (!site.active || site.observed) continue;
    const order = tileOrder.get(site.tile);
    if (order === undefined) continue;
    if (!best || order < bestOrder || (order === bestOrder && site.id < best.id)) {
      best = site;
      bestOrder = order;
    }
  }
  return best;
}

export function observeMurmur(observed: Set<number>, site: MurmurSite): MurmurObserveResult {
  if (!site.active) {
    return { ok: false, site, firstObservation: false, message: `${site.label} has gone quiet` };
  }
  if (site.observed || observed.has(site.id)) {
    return { ok: false, site, firstObservation: false, message: `${site.label} already noted` };
  }
  observed.add(site.id);
  return {
    ok: true,
    site,
    firstObservation: true,
    message: `listened to ${site.label} · ${site.note}`,
  };
}

export function murmurNotebook(
  seed: string,
  tileCount: number,
  observed: ReadonlySet<number> | readonly number[],
): MurmurSite[] {
  const ids = observed instanceof Set ? [...observed] : normalizeMurmurObservations(observed);
  const idSet = new Set(ids);
  return ids
    .sort((a, b) => a - b)
    .map((id) => {
      const day = Math.max(0, Math.floor(id / 30));
      const rest = id - day * 30;
      const window = Math.max(0, Math.min(2, Math.floor(rest / 10)));
      return murmurSites(seed, day, window * MURMUR_WINDOW_MINUTES, tileCount, idSet)
        .find((site) => site.id === id) ?? null;
    })
    .filter((site): site is MurmurSite => site !== null);
}
