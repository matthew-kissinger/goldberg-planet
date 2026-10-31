/**
 * Trees & Planetary Flora: a deterministic decoration field over the tile set, same contract as terrain.
 *
 * Supports 5 flora archetypes ('conifer', 'broadleaf', 'cactus', 'fungal', 'crystal_spire')
 * across the 6 planetary archetypes, plus player-seeded cross-planet Ecosystem Oases
 * (`columns.seededEcoTiles`).
 *
 * The only state is the sparse `chopped` set (chopped trees stay gone, independent of
 * residency, like column edits) — and any column edit removes the tile's tree, so mining
 * the ground out from under a trunk never leaves it floating.
 */

import type { Goldberg } from '../geo/goldberg';
import type { Columns } from './columns';
import type { Terrain } from './terrain';
import { MAT } from './terrain';
import type { FloraArchetype } from './planetConfig';
import { hashString } from '../util/prng';

export interface TreeParams {
  /** flora silhouette archetype */
  kind: FloraArchetype;
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

export interface TreeStrikeResult {
  hit: boolean;
  felled: boolean;
  progress: number;
  needed: number;
  remaining: number;
}

export const TREE_CHOP_STAGES = 4;
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
  readonly chopProgress = new Map<number, number>();
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
    // Player-seeded cross-planet ecosystem oasis grows lush flora on any land tile
    if (this.columns.seededEcoTiles.has(id)) {
      const h = this.columns.heightOf(id);
      return h > -1.0 && this.hash01(id, 1) < 0.65;
    }

    const h = this.columns.heightOf(id);
    const c = this.geo.centers;
    const cx = c[id * 3], cy = c[id * 3 + 1], cz = c[id * 3 + 2];
    const arch = this.terrain.archetype;

    if (arch === 'terran') {
      if (this.terrain.surfaceMaterial(h) !== MAT.GRASS) return false;
      if (h < 3.2) return false; // keep beaches open
      const forest = this.terrain.forestAt(cx, cy, cz);
      if (forest < FOREST_MIN) return false;
      const density = 0.08 + 0.36 * (forest - FOREST_MIN) / (1 - FOREST_MIN);
      return this.hash01(id, 1) < density;
    }

    // Keep Pentagon Wonder center tiles clear for monoliths/geysers
    if (id >= 0 && id < 12) return false;

    const mat = this.terrain.surfaceMaterial(h, cx, cy, cz);
    const forest = this.terrain.forestAt(cx, cy, cz);
    const densityScale = this.terrain.config.floraDensity;

    switch (arch) {
      case 'canyon': {
        if (mat !== MAT.SAND && mat !== MAT.GRASS && mat !== MAT.TERRACOTTA) return false;
        if (h < -15 || h > 55) return false;
        const thresh = mat === MAT.GRASS ? 0.22 : 0.42;
        if (forest < thresh) return false;
        return this.hash01(id, 1) < (0.06 + 0.25 * densityScale);
      }
      case 'volcanic': {
        if (mat !== MAT.BASALT && mat !== MAT.CRYSTAL) return false;
        if (h < 4.0 || forest < 0.45) return false;
        return this.hash01(id, 1) < (0.05 + 0.22 * densityScale);
      }
      case 'cryo': {
        if (mat !== MAT.SNOW && mat !== MAT.ICE && mat !== MAT.CRYSTAL) return false;
        if (h < 3.5 || forest < 0.36) return false;
        return this.hash01(id, 1) < (0.07 + 0.28 * densityScale);
      }
      case 'biolum': {
        if (mat !== MAT.MYCELIUM && mat !== MAT.CRYSTAL) return false;
        if (h < 2.6 || forest < 0.28) return false;
        return this.hash01(id, 1) < (0.12 + 0.38 * densityScale);
      }
      case 'shattered': {
        if (mat !== MAT.CRYSTAL && mat !== MAT.BASALT) return false;
        if (forest < 0.48) return false;
        return this.hash01(id, 1) < (0.05 + 0.20 * densityScale);
      }
      default:
        return false;
    }
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
    this.chopProgress.delete(id);
    return true;
  }

  /** staged chop hit. Returns a progress payload; fells the tree once enough work lands. */
  strike(id: number, power = 1, needed = TREE_CHOP_STAGES): TreeStrikeResult {
    const required = Math.max(1, Number.isFinite(needed) ? needed : TREE_CHOP_STAGES);
    if (!this.hasTree(id)) {
      return { hit: false, felled: false, progress: 0, needed: required, remaining: required };
    }
    const next = Math.min(required, Math.max(0, this.chopProgress.get(id) ?? 0) + Math.max(0.1, Number.isFinite(power) ? power : 1));
    if (next >= required) {
      this.chopped.add(id);
      this.chopProgress.delete(id);
      return { hit: true, felled: true, progress: required, needed: required, remaining: 0 };
    }
    this.chopProgress.set(id, next);
    return { hit: true, felled: false, progress: next, needed: required, remaining: required - next };
  }

  damageOf(id: number, needed = TREE_CHOP_STAGES): number {
    if (!this.hasTree(id)) return 0;
    const required = Math.max(1, Number.isFinite(needed) ? needed : TREE_CHOP_STAGES);
    return Math.max(0, Math.min(0.98, (this.chopProgress.get(id) ?? 0) / required));
  }

  paramsFor(id: number): TreeParams {
    const size = 0.75 + this.hash01(id, 2) * 0.6;
    let kind: FloraArchetype = 'conifer';

    if (this.columns.seededEcoTiles.has(id)) {
      kind = this.hash01(id, 7) < 0.5 ? 'fungal' : 'broadleaf';
    } else if (this.terrain.archetype !== 'terran') {
      const cfg = this.terrain.config;
      kind = this.hash01(id, 7) < 0.68 ? cfg.primaryFlora : cfg.secondaryFlora;
    } else if (this.terrain.config.hasFloatingIslands) {
      const h = this.columns.heightOf(id);
      const r = this.hash01(id, 7);
      if (h < 6.5) {
        kind = r < 0.55 ? 'palm' : 'weeping_willow';
      } else if (h < 22) {
        kind = r < 0.42 ? 'broadleaf' : r < 0.78 ? 'conifer' : 'weeping_willow';
      } else {
        kind = 'conifer';
      }
    }

    return {
      kind,
      trunk: 2.1 * size + this.hash01(id, 3) * 0.9,
      canopy: 3.4 * size,
      spread: 1.5 * size,
      girth: 0.16 + 0.10 * size,
      offA: (this.hash01(id, 4) - 0.5) * 2.4,
      offB: (this.hash01(id, 5) - 0.5) * 2.4,
      tint: 0.8 + this.hash01(id, 6) * 0.4,
    };
  }

  /**
   * Returns 1–3 trees per wooded hex (`groveTreesFor(id)[0]` is always `paramsFor(id)`),
   * arranged on sub-slots inside the hex inradius so forests form lush multi-tree groves.
   */
  groveTreesFor(id: number): TreeParams[] {
    const primary = this.paramsFor(id);
    const roll = this.hash01(id, 11);
    const count = roll < 0.28 ? 1 : roll < 0.72 ? 2 : 3;
    if (count === 1) return [primary];

    const out: TreeParams[] = [primary];
    const baseAngle = this.hash01(id, 12) * Math.PI * 2;
    for (let i = 1; i < count; i++) {
      const ang = baseAngle + i * 2.15 + (this.hash01(id, 13 + i) - 0.5) * 0.45;
      const rad = 1.25 + this.hash01(id, 16 + i) * 0.55;
      const scale = 0.66 + this.hash01(id, 19 + i) * 0.28;
      // Offset relative to hex center, keeping inside 1.85m so canopies stay well within the 5.6m hex
      const offA = Math.max(-1.85, Math.min(1.85, Math.cos(ang) * rad));
      const offB = Math.max(-1.85, Math.min(1.85, Math.sin(ang) * rad));
      out.push({
        kind: primary.kind,
        trunk: primary.trunk * scale,
        canopy: primary.canopy * scale,
        spread: primary.spread * (0.72 + 0.2 * scale),
        girth: primary.girth * scale,
        offA,
        offB,
        tint: Math.max(0.75, Math.min(1.25, primary.tint + (this.hash01(id, 22 + i) - 0.5) * 0.18)),
      });
    }
    return out;
  }
}
