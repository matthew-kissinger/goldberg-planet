import type { NaturalVoidKind } from '../world/caves';
import { normalizePentagonList } from './landmarks';
import { hashString } from '../util/prng';

export type CaveResonanceKind = 'rootHarmonic' | 'tideHarmonic' | 'stoneHarmonic' | 'skyHarmonic';

export interface CaveResonanceSite {
  id: number;
  tile: number;
  layer: number;
  caveKind: Exclude<NaturalVoidKind, 'arch'>;
  kind: CaveResonanceKind;
  label: string;
  detail: string;
  note: string;
  hint: string;
  reward: { item: 'glowCrystal'; count: number; label: string };
  observed: boolean;
}

export interface CaveResonanceObserveResult {
  ok: boolean;
  site: CaveResonanceSite;
  firstObservation: boolean;
  message: string;
}

interface CaveResonanceProfile {
  kind: CaveResonanceKind;
  label: string;
  detail: string;
  note: string;
  hint: string;
}

const RESONANCE_PROFILES: CaveResonanceProfile[] = [
  {
    kind: 'rootHarmonic',
    label: 'root-hum chamber',
    detail: 'low root notes tremble through the dry wall',
    note: 'the cave is carrying tree roots toward rooms you have not opened',
    hint: 'read it with an echo lantern before mining the next wall',
  },
  {
    kind: 'tideHarmonic',
    label: 'tide-glass hollow',
    detail: 'salt water answers the lantern from behind the stone',
    note: 'the sea is touching this cave through a narrow hidden throat',
    hint: 'bring light and mark the dry ledges before the water path deepens',
  },
  {
    kind: 'stoneHarmonic',
    label: 'stone-bell seam',
    detail: 'a bell tone repeats from one hex face to the next',
    note: 'some rocks ring as if they were placed around an older passage',
    hint: 'listen for the repeated face before digging sideways',
  },
  {
    kind: 'skyHarmonic',
    label: 'sky-echo pocket',
    detail: 'the lantern catches a pale sky note under the ceiling',
    note: 'a cave roof can remember the open air long after it closes',
    hint: 'look for ceilings that glow before they crack open',
  },
];

const CAVE_RESONANCE_LAYER_BITS = 9;
const CAVE_RESONANCE_KIND_BITS = 1;
const CAVE_RESONANCE_KIND_MASK = (1 << CAVE_RESONANCE_KIND_BITS) - 1;
const CAVE_RESONANCE_LAYER_MASK = (1 << CAVE_RESONANCE_LAYER_BITS) - 1;

function caveKindIndex(caveKind: Exclude<NaturalVoidKind, 'arch'>): number {
  return caveKind === 'seaCave' ? 1 : 0;
}

function caveKindFromIndex(index: number): Exclude<NaturalVoidKind, 'arch'> {
  return (index & CAVE_RESONANCE_KIND_MASK) === 1 ? 'seaCave' : 'dryCave';
}

function caveResonanceId(tile: number, layer: number, caveKind: Exclude<NaturalVoidKind, 'arch'>): number {
  return (Math.max(0, Math.trunc(tile)) << (CAVE_RESONANCE_LAYER_BITS + CAVE_RESONANCE_KIND_BITS))
    + ((Math.max(0, Math.trunc(layer)) & CAVE_RESONANCE_LAYER_MASK) << CAVE_RESONANCE_KIND_BITS)
    + caveKindIndex(caveKind);
}

function decodeCaveResonanceId(id: number): { tile: number; layer: number; caveKind: Exclude<NaturalVoidKind, 'arch'> } {
  const safe = Math.max(0, Math.trunc(Number.isFinite(id) ? id : 0));
  return {
    tile: safe >>> (CAVE_RESONANCE_LAYER_BITS + CAVE_RESONANCE_KIND_BITS),
    layer: (safe >>> CAVE_RESONANCE_KIND_BITS) & CAVE_RESONANCE_LAYER_MASK,
    caveKind: caveKindFromIndex(safe),
  };
}

function profileFor(hash: number, caveKind: Exclude<NaturalVoidKind, 'arch'>): CaveResonanceProfile {
  if (caveKind === 'seaCave') {
    return RESONANCE_PROFILES[(hash & 1) === 0 ? 1 : 2];
  }
  return RESONANCE_PROFILES[(hash >>> 3) % RESONANCE_PROFILES.length];
}

export function normalizeCaveResonanceObservations(raw: unknown): number[] {
  return normalizePentagonList(raw);
}

export function caveResonanceSite(
  seed: string,
  tile: number,
  layer: number,
  caveKind: NaturalVoidKind,
  observed: ReadonlySet<number> = new Set(),
): CaveResonanceSite | null {
  if (caveKind === 'arch') return null;
  const safeTile = Math.max(0, Math.trunc(Number.isFinite(tile) ? tile : 0));
  const safeLayer = Math.max(0, Math.trunc(Number.isFinite(layer) ? layer : 0));
  const hash = hashString(`${seed}:cave-resonance:${safeTile}:${safeLayer}:${caveKind}`);
  const id = caveResonanceId(safeTile, safeLayer, caveKind);
  const profile = profileFor(hash, caveKind);
  const deepBonus = safeLayer <= 18 ? 1 : 0;
  const rewardCount = caveKind === 'dryCave' ? 2 + deepBonus : 1 + deepBonus;
  return {
    id,
    tile: safeTile,
    layer: safeLayer,
    caveKind,
    kind: profile.kind,
    label: profile.label,
    detail: profile.detail,
    note: profile.note,
    hint: profile.hint,
    reward: { item: 'glowCrystal', count: rewardCount, label: 'glow crystal' },
    observed: observed.has(id),
  };
}

export function observeCaveResonance(
  observed: Set<number>,
  site: CaveResonanceSite,
): CaveResonanceObserveResult {
  if (site.observed || observed.has(site.id)) {
    return { ok: false, site: { ...site, observed: true }, firstObservation: false, message: `${site.label} already in the Hearth Journal` };
  }
  observed.add(site.id);
  const noted = { ...site, observed: true };
  return {
    ok: true,
    site: noted,
    firstObservation: true,
    message: `read ${site.label} · ${site.note}`,
  };
}

export function caveResonanceNotebook(
  seed: string,
  observed: ReadonlySet<number> | readonly number[],
): CaveResonanceSite[] {
  const ids = observed instanceof Set ? [...observed] : normalizeCaveResonanceObservations(observed);
  const idSet = new Set(ids);
  return ids
    .sort((a, b) => a - b)
    .map((id) => {
      const decoded = decodeCaveResonanceId(id);
      return caveResonanceSite(seed, decoded.tile, decoded.layer, decoded.caveKind, idSet)!;
    });
}
