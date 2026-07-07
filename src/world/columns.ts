/**
 * Volumetric storage: one radial column per tile on the shared layer grid.
 *
 * - Unedited columns store nothing but a lazily-filled surface layer index (2 bytes/tile)
 *   plus a cached height (4 bytes/tile): O(surface tiles) total, independent of planet volume.
 * - Edited columns get a sparse 96-bit solid mask + 96-bit "player placed" mask, only for
 *   tiles actually touched. Arbitrary solid/empty runs per column: tunnels and overhangs work.
 * - Everything is derived deterministically from the seed; a released region regenerates
 *   identically (edits persist independently of residency).
 */

import type { Goldberg } from '../geo/goldberg';
import type { Layers } from './layers';
import { PLANET_RADIUS } from './layers';
import { MAT, type MaterialId, Terrain } from './terrain';
import { NATURAL_VOID_SCAN_LAYERS, NaturalCaves, type NaturalVoidKind, type NaturalVoidSample } from './caves';

export interface ColumnEdit {
  solid: Uint32Array;
  placed: Uint32Array;
  /** material id per placed cell; allocated on first place (0/absent = legacy BUILT) */
  mat?: Uint8Array;
}

const TOP_SENTINEL = -32768;
const VOID_FLAG_UNKNOWN = -1;
const VOID_FLAG_NONE = 0;
const VOID_FLAG_HAS = 1;

export interface NaturalFeature {
  tile: number;
  layer: number;
  layerEnd: number;
  kind: NaturalVoidKind;
  depth: number;
  flooded: boolean;
  spring?: boolean;
  clearance: number;
}

export class Columns {
  readonly geo: Goldberg;
  readonly layers: Layers;
  readonly terrain: Terrain;
  readonly words: number;
  /** lazily generated surface layer per tile (the on-demand "generation" index) */
  private readonly tops: Int16Array;
  private readonly heights: Float32Array;
  private readonly naturalVoidFlags: Int8Array;
  private readonly caves: NaturalCaves;
  /** sparse: only edited tiles */
  readonly edits = new Map<number, ColumnEdit>();
  generatedCount = 0;

  constructor(geo: Goldberg, layers: Layers, terrain: Terrain) {
    this.geo = geo;
    this.layers = layers;
    this.terrain = terrain;
    this.words = Math.ceil(layers.L / 32);
    this.tops = new Int16Array(geo.count).fill(TOP_SENTINEL);
    this.heights = new Float32Array(geo.count).fill(NaN);
    this.naturalVoidFlags = new Int8Array(geo.count).fill(VOID_FLAG_UNKNOWN);
    this.caves = new NaturalCaves(terrain.seed);
  }

  /** surface height (m, relative to planet radius) — generates on demand, deterministic. */
  heightOf(id: number): number {
    let h = this.heights[id];
    if (Number.isNaN(h)) {
      const c = this.geo.centers;
      h = this.terrain.heightAt(c[id * 3], c[id * 3 + 1], c[id * 3 + 2]);
      this.heights[id] = h;
      this.tops[id] = this.layers.layerOfRadius(PLANET_RADIUS + h);
      this.generatedCount++;
    }
    return h;
  }

  /** default (pre-edit) surface layer of the column */
  topLayerOf(id: number): number {
    if (this.tops[id] === TOP_SENTINEL) this.heightOf(id);
    return this.tops[id];
  }

  editOf(id: number): ColumnEdit | undefined {
    return this.edits.get(id);
  }

  naturalVoidAt(id: number, k: number): NaturalVoidSample | null {
    if (k < 0 || k >= this.layers.L - 1) return null;
    const top = this.topLayerOf(id);
    if (k <= top || k > top + NATURAL_VOID_SCAN_LAYERS) return null;
    const c = this.geo.centers;
    const h = this.heightOf(id);
    return this.caves.sample(
      c[id * 3],
      c[id * 3 + 1],
      c[id * 3 + 2],
      h,
      this.layers.topRadius(top),
      this.layers.topRadius(k),
      this.layers.bottomRadius(k),
    );
  }

  hasNaturalVoids(id: number): boolean {
    let flag = this.naturalVoidFlags[id];
    if (flag !== VOID_FLAG_UNKNOWN) return flag === VOID_FLAG_HAS;
    const top = this.topLayerOf(id);
    const max = Math.min(this.layers.L - 2, top + NATURAL_VOID_SCAN_LAYERS);
    flag = VOID_FLAG_NONE;
    for (let k = top + 1; k <= max; k++) {
      if (this.naturalVoidAt(id, k)) {
        flag = VOID_FLAG_HAS;
        break;
      }
    }
    this.naturalVoidFlags[id] = flag;
    return flag === VOID_FLAG_HAS;
  }

  naturalScanMax(id: number): number {
    return this.hasNaturalVoids(id)
      ? Math.min(this.layers.L - 1, this.topLayerOf(id) + NATURAL_VOID_SCAN_LAYERS)
      : this.topLayerOf(id);
  }

  naturalFeature(kind?: NaturalVoidKind, startTile = 0, springOnly = false): NaturalFeature | null {
    const n = this.geo.count;
    const start = Math.max(0, Math.min(n - 1, Math.trunc(startTile)));
    for (let pass = 0; pass < 2; pass++) {
      const from = pass === 0 ? start : 0;
      const to = pass === 0 ? n : start;
      for (let id = from; id < to; id++) {
        if (!this.hasNaturalVoids(id)) continue;
        const top = this.topLayerOf(id);
        const max = Math.min(this.layers.L - 2, top + NATURAL_VOID_SCAN_LAYERS);
        for (let k = top + 1; k <= max; k++) {
          const sample = this.naturalVoidAt(id, k);
          if (!sample || (kind && sample.kind !== kind)) continue;
          if (springOnly && !sample.spring) continue;
          let end = k;
          while (end + 1 <= max && this.naturalVoidAt(id, end + 1)?.kind === sample.kind) end++;
          const floorLayer = end + 1;
          const clearance = this.layers.topRadius(k) - this.layers.topRadius(floorLayer);
          if (clearance >= 2.35) {
            return {
              tile: id,
              layer: k,
              layerEnd: end,
              kind: sample.kind,
              depth: sample.depth,
              flooded: sample.flooded,
              spring: sample.spring === true,
              clearance,
            };
          }
          k = end;
        }
      }
    }
    return null;
  }

  private defaultSolidAt(id: number, k: number): boolean {
    return k >= this.topLayerOf(id) && !this.naturalVoidAt(id, k);
  }

  solidAt(id: number, k: number): boolean {
    if (k < 0 || k >= this.layers.L) return false;
    const e = this.edits.get(id);
    if (e) return (e.solid[k >> 5] & (1 << (k & 31))) !== 0;
    return this.defaultSolidAt(id, k);
  }

  /** materialize the default mask for a tile (solid from topLayer down) */
  private materialize(id: number): ColumnEdit {
    let e = this.edits.get(id);
    if (e) return e;
    const top = this.topLayerOf(id);
    const solid = new Uint32Array(this.words);
    for (let k = Math.max(0, top); k < this.layers.L; k++) {
      if (this.defaultSolidAt(id, k)) solid[k >> 5] |= 1 << (k & 31);
    }
    e = { solid, placed: new Uint32Array(this.words) };
    this.edits.set(id, e);
    return e;
  }

  /** remove one cell. Returns false if not solid / bedrock / out of range. */
  mine(id: number, k: number): boolean {
    if (k < 0 || k >= this.layers.L - 1) return false; // bedrock layer immutable
    if (!this.solidAt(id, k)) return false;
    const e = this.materialize(id);
    e.solid[k >> 5] &= ~(1 << (k & 31));
    e.placed[k >> 5] &= ~(1 << (k & 31));
    if (e.mat) e.mat[k] = 0;
    return true;
  }

  /** add one cell (player-built, with a material). Returns false if already solid / out of range. */
  place(id: number, k: number, mat: MaterialId = MAT.BUILT): boolean {
    if (k < 0 || k >= this.layers.L - 1) return false;
    if (this.solidAt(id, k)) return false;
    const e = this.materialize(id);
    e.solid[k >> 5] |= 1 << (k & 31);
    e.placed[k >> 5] |= 1 << (k & 31);
    if (!e.mat) e.mat = new Uint8Array(this.layers.L);
    e.mat[k] = mat;
    return true;
  }

  placedAt(id: number, k: number): boolean {
    const e = this.edits.get(id);
    if (!e) return false;
    return (e.placed[k >> 5] & (1 << (k & 31))) !== 0;
  }

  materialAt(id: number, k: number): MaterialId {
    if (this.placedAt(id, k)) {
      const m = this.edits.get(id)?.mat?.[k];
      return (m || MAT.BUILT) as MaterialId;
    }
    if (k >= this.layers.L - 1) return MAT.BEDROCK;
    const top = this.topLayerOf(id);
    const h = this.heightOf(id);
    const depth = k - top;
    if (depth <= 0) return this.terrain.surfaceMaterial(h);
    const surf = this.terrain.surfaceMaterial(h);
    if (depth <= 3 && (surf === MAT.GRASS || surf === MAT.SAND)) return MAT.DIRT;
    if (depth <= 2 && surf === MAT.SEABED) return MAT.SEABED;
    return MAT.ROCK;
  }

  /**
   * Ground under radius r in this column: smallest k >= layerOf(r) that is solid.
   * Returns the layer index, or L (core) if the column is empty below (cannot happen: bedrock).
   */
  groundLayerBelow(id: number, r: number): number {
    let k = this.layers.layerOfRadius(r);
    if (k < 0) k = 0;
    for (; k < this.layers.L; k++) {
      if (this.solidAt(id, k)) return k;
    }
    return this.layers.L - 1;
  }

  /** Ceiling above radius r: largest k < layerOf(r) that is solid, or -1 if open sky. */
  ceilingLayerAbove(id: number, r: number): number {
    let k = this.layers.layerOfRadius(r);
    if (k < 0) return -1;
    for (k = k - 1; k >= 0; k--) {
      if (this.solidAt(id, k)) return k;
    }
    return -1;
  }

  /** rough storage accounting for measurements/tests */
  storageBytes(): { indexBytes: number; editBytes: number; editedTiles: number } {
    let matBytes = 0;
    for (const e of this.edits.values()) if (e.mat) matBytes += e.mat.byteLength;
    return {
      indexBytes: this.tops.byteLength + this.heights.byteLength,
      editBytes: this.edits.size * (this.words * 4 * 2 + 16) + matBytes,
      editedTiles: this.edits.size,
    };
  }
}
