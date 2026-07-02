/**
 * Trees: a deterministic decoration field over the tile set, same contract as terrain.
 *
 * A tile has a tree iff (a) its surface is grass, (b) the forest noise field clears a
 * cluster threshold, (c) a per-tile seed hash clears the local density — all pure
 * functions of (seed, tile id), so trees regenerate identically after a region is
 * released, on any machine, without storing anything per tile.
 *
 * The only state is the sparse `chopped` set (chopped trees stay gone, independent of
 * residency, like column edits) — and any column edit removes the tile's tree, so mining
 * the ground out from under a trunk never leaves it floating.
 */

import type { Goldberg } from '../geo/goldberg';
import type { Columns } from './columns';
import type { Terrain } from './terrain';
import { MAT } from './terrain';
import { hashString } from '../util/prng';

export interface TreeParams {
  /** trunk height (m) */
  trunk: number;
  /** canopy height above the trunk top (m) */
  canopy: number;
  /** canopy base radius (m) */
  spread: number;
  /** trunk radius (m) */
  girth: number;
  /** deterministic tangent offset from the tile center, meters */
  offA: number;
  offB: number;
  /** color jitter in [0.8, 1.2] */
  tint: number;
}

const FOREST_MIN = 0.33;

/**
 * Deterministic tangent frame used to place a tree on its tile — shared by the mesher
 * (drawing) and the picker (chopping) so the hit cylinder is exactly where the tree is.
 * Writes t1 (xyz) then t2 (xyz) into out.
 */
export function treeTangentFrame(ux: number, uy: number, uz: number, out: Float64Array): void {
  const pickX = Math.abs(ux) < 0.9;
  let t1x = pickX ? 0 : -uz, t1y = pickX ? uz : 0, t1z = pickX ? -uy : ux;
  const l = Math.hypot(t1x, t1y, t1z) || 1;
  t1x /= l; t1y /= l; t1z /= l;
  out[0] = t1x; out[1] = t1y; out[2] = t1z;
  out[3] = uy * t1z - uz * t1y;
  out[4] = uz * t1x - ux * t1z;
  out[5] = ux * t1y - uy * t1x;
}

export class Trees {
  readonly chopped = new Set<number>();
  private readonly seedHash: number;

  constructor(
    private readonly geo: Goldberg,
    private readonly columns: Columns,
    private readonly terrain: Terrain,
    seed: string,
  ) {
    this.seedHash = hashString(seed + ':trees');
  }

  private hash01(id: number, salt: number): number {
    let h = (Math.imul(id + 0x9e37, 0x85ebca6b) ^ this.seedHash ^ Math.imul(salt, 0xc2b2ae35)) | 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  /** would this tile grow a tree from seed? (ignores chopping/edits) */
  private seededTree(id: number): boolean {
    const h = this.columns.heightOf(id);
    if (this.terrain.surfaceMaterial(h) !== MAT.GRASS) return false;
    if (h < 3.2) return false; // keep beaches open
    const c = this.geo.centers;
    const forest = this.terrain.forestAt(c[id * 3], c[id * 3 + 1], c[id * 3 + 2]);
    if (forest < FOREST_MIN) return false;
    const density = 0.08 + 0.36 * (forest - FOREST_MIN) / (1 - FOREST_MIN);
    return this.hash01(id, 1) < density;
  }

  /** live tree on this tile right now (seeded, not chopped, column untouched) */
  hasTree(id: number): boolean {
    if (this.chopped.has(id)) return false;
    if (this.columns.editOf(id)) return false;
    return this.seededTree(id);
  }

  /** chop it down. Returns false if there is no live tree here. */
  chop(id: number): boolean {
    if (!this.hasTree(id)) return false;
    this.chopped.add(id);
    return true;
  }

  paramsFor(id: number): TreeParams {
    const size = 0.75 + this.hash01(id, 2) * 0.6;
    return {
      trunk: 2.1 * size + this.hash01(id, 3) * 0.9,
      canopy: 3.4 * size,
      spread: 1.5 * size,
      girth: 0.16 + 0.10 * size,
      offA: (this.hash01(id, 4) - 0.5) * 2.4,
      offB: (this.hash01(id, 5) - 0.5) * 2.4,
      tint: 0.8 + this.hash01(id, 6) * 0.4,
    };
  }
}
