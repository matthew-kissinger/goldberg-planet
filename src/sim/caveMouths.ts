import { NATURAL_VOID_SCAN_LAYERS, type NaturalVoidKind, type NaturalVoidSample } from '../world/caves';

export interface CaveMouthColumns {
  topLayerOf(tile: number): number;
  naturalVoidAt(tile: number, layer: number): NaturalVoidSample | null;
}

export interface CaveMouthTile {
  tile: number;
  ring: number;
}

export interface CaveMouthSignal {
  id: number;
  tile: number;
  ring: number;
  layer: number;
  layerEnd: number;
  floorLayer: number;
  kind: NaturalVoidKind;
  depth: number;
  flooded: boolean;
  spring?: boolean;
  clearance: number;
  label: string;
  detail: string;
  routeHint: string;
  ready: boolean;
}

function caveMouthLabel(kind: NaturalVoidKind, spring = false): string {
  if (kind === 'dryCave' && spring) return 'spring cave mouth';
  return kind === 'dryCave' ? 'dry cave mouth' : kind === 'seaCave' ? 'sea-cave mouth' : 'land arch';
}

function caveMouthRouteHint(kind: NaturalVoidKind, flooded: boolean, spring = false): string {
  if (kind === 'arch') return 'surface shortcut under the terrain';
  if (flooded || kind === 'seaCave') return 'flooded cave edge for kelp, fish, and crystals';
  if (spring) return 'sealed freshwater seep for inland cisterns and cave camps';
  return 'dry cave entrance for crystals, mushrooms, and darkness pressure';
}

function signalForTile(columns: CaveMouthColumns, tile: number, ring: number): CaveMouthSignal | null {
  const top = columns.topLayerOf(tile);
  const max = Math.min(top + NATURAL_VOID_SCAN_LAYERS, top + 28);
  let best: CaveMouthSignal | null = null;
  for (let layer = top + 1; layer <= max; layer++) {
    const sample = columns.naturalVoidAt(tile, layer);
    if (!sample) continue;
    let end = layer;
    while (end + 1 <= max && columns.naturalVoidAt(tile, end + 1)?.kind === sample.kind) end++;
    const floorLayer = end + 1;
    const clearance = Math.max(0, floorLayer - layer);
    if (clearance >= 2) {
      const spring = sample.spring === true;
      const label = caveMouthLabel(sample.kind, spring);
      const detail = `${ring === 0 ? 'here' : `${ring} ring${ring === 1 ? '' : 's'}`} · depth ${sample.depth.toFixed(1)} m · clearance ${clearance} cells${sample.flooded ? ' · flooded' : ''}${spring ? ' · spring seep' : ''}`;
      const signal: CaveMouthSignal = {
        id: tile * 100 + layer,
        tile,
        ring,
        layer,
        layerEnd: end,
        floorLayer,
        kind: sample.kind,
        depth: sample.depth,
        flooded: sample.flooded,
        spring,
        clearance,
        label,
        detail,
        routeHint: caveMouthRouteHint(sample.kind, sample.flooded, spring),
        ready: sample.kind !== 'arch',
      };
      const score = ring * 100
        + (sample.kind === 'dryCave' ? 0 : sample.kind === 'seaCave' ? 8 : 22)
        - sample.depth * 0.12
        - clearance * 0.5;
      const bestScore = best
        ? best.ring * 100
          + (best.kind === 'dryCave' ? 0 : best.kind === 'seaCave' ? 8 : 22)
          - best.depth * 0.12
          - best.clearance * 0.5
        : Infinity;
      if (score < bestScore) best = signal;
    }
    layer = end;
  }
  return best;
}

export function caveMouthSignals(
  columns: CaveMouthColumns,
  tiles: readonly CaveMouthTile[],
  limit = 8,
): CaveMouthSignal[] {
  const seen = new Set<number>();
  const signals: CaveMouthSignal[] = [];
  for (const entry of tiles) {
    const tile = Math.max(0, Math.trunc(entry.tile));
    if (seen.has(tile)) continue;
    seen.add(tile);
    const signal = signalForTile(columns, tile, Math.max(0, Math.trunc(entry.ring)));
    if (signal) signals.push(signal);
  }
  return signals
    .sort((a, b) =>
      a.ring - b.ring
      || (a.kind === 'dryCave' ? 0 : a.kind === 'seaCave' ? 1 : 2) - (b.kind === 'dryCave' ? 0 : b.kind === 'seaCave' ? 1 : 2)
      || b.clearance - a.clearance
      || b.depth - a.depth
      || a.tile - b.tile)
    .slice(0, Math.max(1, Math.trunc(limit)));
}

export function nearestCaveMouthSignal(signals: readonly CaveMouthSignal[]): CaveMouthSignal | null {
  return signals[0] ?? null;
}
