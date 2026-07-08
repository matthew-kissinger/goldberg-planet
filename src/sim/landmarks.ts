export interface GoldbergTopology {
  count: number;
  degreeOf(id: number): number;
}

export interface PentagonLandmark {
  index: number;
  tile: number;
  name: string;
  clue: string;
  discovered: boolean;
}

export interface PentagonDiscoveryResult {
  ok: boolean;
  alreadyKnown: boolean;
  landmark?: PentagonLandmark;
  discovered: number[];
  count: number;
  total: number;
  message: string;
}

export interface PentagonProgress {
  discovered: number[];
  count: number;
  total: number;
  label: string;
  complete: boolean;
}

const NAMES = [
  'First Hearth',
  'Rainward Gate',
  'Salt Mirror',
  'High Lantern',
  'Root Vault',
  'Red Cairn',
  'Snow Dial',
  'Glass Shoal',
  'Storm Seat',
  'Reed Crown',
  'Deep Bell',
  'Last Horizon',
] as const;

const CLUES = [
  'The warm way home is also the first bearing.',
  'Clouds bend before the second point answers.',
  'Where salt reflects the sky, the shore remembers.',
  'A high light can be seen before it is understood.',
  'Roots find rooms the rain never reaches.',
  'The red stone listens for tools, not words.',
  'Snow keeps time differently on the small world.',
  'Glass begins as sand, then becomes a window outward.',
  'Storms do not wander randomly around a sphere.',
  'Reeds mark water that travels below the land.',
  'A bell under stone is quieter than a footprint.',
  'The last horizon is only first from another side.',
] as const;

/** Every degree-5 tile in the Goldberg mesh is a fixed pentagon waypoint. */
export function pentagonTileIds(geo: GoldbergTopology): number[] {
  const out: number[] = [];
  for (let id = 0; id < geo.count; id++) {
    if (geo.degreeOf(id) === 5) out.push(id);
  }
  return out.sort((a, b) => a - b);
}

export function normalizePentagonList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const id = Math.trunc(value);
    if (id >= 0) seen.add(id);
  }
  return [...seen].sort((a, b) => a - b);
}

export function normalizePentagonDiscoveries(raw: unknown, pentagonTiles: readonly number[]): number[] {
  const valid = new Set(pentagonTiles);
  return normalizePentagonList(raw).filter((tile) => valid.has(tile));
}

export function pentagonLandmark(tile: number, pentagonTiles: readonly number[], discovered: ReadonlySet<number>): PentagonLandmark | null {
  const index = pentagonTiles.indexOf(tile);
  if (index < 0) return null;
  return {
    index,
    tile,
    name: NAMES[index] ?? `Pentagon ${index + 1}`,
    clue: CLUES[index] ?? 'Something here is waiting to be named.',
    discovered: discovered.has(tile),
  };
}

export function allPentagonLandmarks(pentagonTiles: readonly number[], discovered: ReadonlySet<number>): PentagonLandmark[] {
  return pentagonTiles.map((tile) => pentagonLandmark(tile, pentagonTiles, discovered)!).filter(Boolean);
}

export function pentagonProgress(discovered: ReadonlySet<number>, pentagonTiles: readonly number[]): PentagonProgress {
  const normalized = normalizePentagonDiscoveries([...discovered], pentagonTiles);
  const count = normalized.length;
  const total = pentagonTiles.length;
  return {
    discovered: normalized,
    count,
    total,
    label: count === total && total > 0 ? 'all pentagons awake' : count > 0 ? `pentagons ${count}/${total}` : 'pentagons quiet',
    complete: total > 0 && count === total,
  };
}

/** Marks a pentagon waypoint discovered. Bare waypoints carry no reward or site logic. */
export function discoverPentagon(
  discovered: Set<number>,
  tile: number,
  pentagonTiles: readonly number[],
): PentagonDiscoveryResult {
  const landmark = pentagonLandmark(tile, pentagonTiles, discovered);
  if (!landmark) {
    const progress = pentagonProgress(discovered, pentagonTiles);
    return {
      ok: false,
      alreadyKnown: false,
      discovered: progress.discovered,
      count: progress.count,
      total: progress.total,
      message: 'no pentagon landmark nearby',
    };
  }
  const alreadyKnown = discovered.has(tile);
  if (!alreadyKnown) discovered.add(tile);
  const next = pentagonLandmark(tile, pentagonTiles, discovered)!;
  const progress = pentagonProgress(discovered, pentagonTiles);
  return {
    ok: true,
    alreadyKnown,
    landmark: next,
    discovered: progress.discovered,
    count: progress.count,
    total: progress.total,
    message: alreadyKnown
      ? `${next.name}: ${next.clue}`
      : `${next.name} awakened ${progress.count}/${progress.total} - ${next.clue}`,
  };
}

export function nearestPentagonOnTiles(tiles: readonly number[], pentagonTiles: readonly number[]): number | null {
  const candidates = new Set(pentagonTiles);
  for (const tile of tiles) if (candidates.has(tile)) return tile;
  return null;
}
