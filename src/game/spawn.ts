import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Trees } from '../world/trees';

/**
 * Spawn on land near tile 0 (a pentagon): BFS outward for comfortable grass altitude,
 * preferring a treeless clearing at the edge of a wood so chop -> craft is in view.
 */
export function findSpawnTile(geo: Goldberg, columns: Columns, trees: Trees): number {
  const seen = new Set<number>([0]);
  const queue = [0];
  let fallback = -1;
  while (queue.length > 0 && seen.size <= 40000) {
    const t = queue.shift()!;
    const h = columns.heightOf(t);
    if (h > 4 && h < 30) {
      if (fallback < 0) fallback = t;
      if (!trees.hasTree(t) && treesNear(geo, trees, t) >= 2) return t;
    }
    for (let k = 0; k < geo.degreeOf(t); k++) {
      const n = geo.neighbor(t, k);
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  return fallback >= 0 ? fallback : 0;
}

/** trees within two rings of `t`, counted up to 2 (neighbor-of-neighbor scan, may double count) */
function treesNear(geo: Goldberg, trees: Trees, t: number): number {
  let near = 0;
  for (let k = 0; k < geo.degreeOf(t); k++) {
    const nb = geo.neighbor(t, k);
    for (let q = 0; q < geo.degreeOf(nb); q++) {
      if (trees.hasTree(geo.neighbor(nb, q)) && ++near >= 2) return near;
    }
  }
  return near;
}
