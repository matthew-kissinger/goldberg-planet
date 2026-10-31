/**
 * Chunk mesher: turns tile columns into a watertight prism mesh.
 *
 * Per solid run of each owned tile:
 *  - a top cap at the run's top radius, a bottom cap (cave ceiling) at its bottom,
 *  - wall quads along each tile edge for every layer band where this tile is solid
 *    and the neighbor across that edge is not. Faces are emitted only from the solid
 *    side, so interior faces are culled and nothing is drawn twice.
 *
 * Pure data in, typed arrays out (positions relative to a f64 anchor) — no three.js
 * imports, so this runs cleanly inside a Web Worker or on the main thread.
 */

import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import type { ChunkInfo } from '../world/chunks';
import { treeTangentFrame, type TreeParams, type Trees } from '../world/trees';
import { MAT } from '../world/terrain';
import {
  BROADLEAF_COLOR,
  CACTUS_COLOR,
  CRYSTAL_FLORA_COLOR,
  FUNGAL_CAP_COLOR,
  FUNGAL_STEM_COLOR,
  LEAF_COLOR,
  materialColor,
  TRUNK_COLOR,
} from './palette';

export interface ChunkMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /**
   * 4-byte per-vertex packed material metadata (lossless 23-bit uint stored in f32
   * for TSL `unpack4xU8(uint(attribute('packedMat', 'float')))`):
   *  - byte 0: materialId (0..15)
   *  - byte 1: flags (bit 0 = wall, bit 1 = pentagon, bit 2 = flora, bits 3..7 = moisture 0..31)
   *  - byte 2: emissive/specularity hint (0..127)
   */
  packedMat: Float32Array;
  /** f64 world anchor; vertex positions are relative to it */
  anchor: [number, number, number];
  triangles: number;
}

/**
 * Pack 3 bytes (b0: 0..255, b1: 0..255, b2: 0..127) into an exact integer <= 8,388,607
 * so it survives IEEE-754 float32 storage with zero bit loss and unpacks via TSL `unpack4xU8`.
 */
export function encodePackedMat(matId: number, isWall: boolean, isPent: boolean, isFlora: boolean, moisture01 = 0.5): number {
  const b0 = matId & 0xff;
  const moist5 = Math.max(0, Math.min(31, Math.round(moisture01 * 31)));
  const b1 = (isWall ? 1 : 0) | (isPent ? 2 : 0) | (isFlora ? 4 : 0) | (moist5 << 3);
  let b2 = 16;
  if (matId === MAT.MAGMA) b2 = 120;
  else if (matId === MAT.CRYSTAL || matId === MAT.MYCELIUM) b2 = 96;
  else if (matId === MAT.ICE || matId === MAT.SNOW) b2 = 72;
  return (b0 | (b1 << 8) | ((b2 & 0x7f) << 16)) >>> 0;
}

class Sink {
  pos: Float32Array = new Float32Array(65536 * 3);
  nrm: Float32Array = new Float32Array(65536 * 3);
  col: Float32Array = new Float32Array(65536 * 3);
  pmat: Float32Array = new Float32Array(65536);
  n = 0;

  reset(): void { this.n = 0; }

  ensure(extraVerts: number): void {
    const need = (this.n + extraVerts) * 3;
    if (need <= this.pos.length) return;
    let cap = this.pos.length;
    while (cap < need) cap *= 2;
    const np = new Float32Array(cap); np.set(this.pos.subarray(0, this.n * 3)); this.pos = np;
    const nn = new Float32Array(cap); nn.set(this.nrm.subarray(0, this.n * 3)); this.nrm = nn;
    const nc = new Float32Array(cap); nc.set(this.col.subarray(0, this.n * 3)); this.col = nc;
    const nm = new Float32Array(cap / 3); nm.set(this.pmat.subarray(0, this.n)); this.pmat = nm;
  }

  vert(
    x: number, y: number, z: number,
    nx: number, ny: number, nz: number,
    r: number, g: number, b: number,
    packed = 0,
  ): void {
    const i = this.n * 3;
    this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z;
    this.nrm[i] = nx; this.nrm[i + 1] = ny; this.nrm[i + 2] = nz;
    this.col[i] = r; this.col[i + 1] = g; this.col[i + 2] = b;
    this.pmat[this.n] = packed;
    this.n++;
  }
}

const sink = new Sink();
const cornerScratch = new Float64Array(18);
const colorScratch = new Float32Array(3);
const frameScratch = new Float64Array(6);

export function buildChunkMesh(
  chunk: ChunkInfo,
  geo: Goldberg,
  layers: Layers,
  columns: Columns,
  trees?: Trees,
): ChunkMeshData | null {
  sink.reset();
  const planetRadius = layers.planetRadius;
  const ax = chunk.cx * planetRadius, ay = chunk.cy * planetRadius, az = chunk.cz * planetRadius;
  const bounds = layers.bounds;
  const L = layers.L;
  const cen = geo.centers;

  for (const id of chunk.tiles) {
    const deg = geo.corners(id, cornerScratch);
    const isPent = deg === 5;
    const edit = columns.editOf(id);
    const top = columns.topLayerOf(id);
    const solidHere = (k: number): boolean => {
      if (k < 0 || k >= L) return false;
      return columns.solidAt(id, k);
    };

    const sky = columns.skyIslandRange(id);
    let kMin = edit ? 0 : (sky ? Math.min(top, sky.topK) : top);
    let kMax = edit ? L - 1 : columns.naturalScanMax(id);
    for (let e = 0; e < deg; e++) {
      const n = geo.nbrs[id * 6 + e];
      if (columns.editOf(n)) { kMax = L - 1; break; }
      const nSky = columns.skyIslandRange(n);
      if (nSky && nSky.topK < kMin) kMin = nSky.topK;
      const nMax = columns.naturalScanMax(n);
      if (nMax > kMax) kMax = nMax;
    }
    if (edit) kMax = L - 1;
    if (kMin < 0) kMin = 0;

    const tcx = cen[id * 3], tcy = cen[id * 3 + 1], tcz = cen[id * 3 + 2];
    const moist = columns.terrain.moistureAt(tcx, tcy, tcz);

    // --- caps ---
    for (let k = kMin; k <= Math.min(kMax, L - 1); k++) {
      const s = solidHere(k);
      if (!s) continue;
      const above = solidHere(k - 1);
      const below = solidHere(k + 1) || k === L - 1;
      if (above && below) continue;
      if (!above) {
        emitCap(deg, bounds[k], tcx, tcy, tcz, ax, ay, az, false, columns.materialAt(id, k), id, isPent, moist);
      }
      if (!below && k < L - 1) {
        emitCap(deg, bounds[k + 1], tcx, tcy, tcz, ax, ay, az, true, columns.materialAt(id, k), id, isPent, moist);
      }
    }

    // --- walls ---
    for (let e = 0; e < deg; e++) {
      const n = geo.nbrs[id * 6 + e];
      const ca = ((e - 1) + deg) % deg;
      const cAx = cornerScratch[ca * 3], cAy = cornerScratch[ca * 3 + 1], cAz = cornerScratch[ca * 3 + 2];
      const cBx = cornerScratch[e * 3], cBy = cornerScratch[e * 3 + 1], cBz = cornerScratch[e * 3 + 2];
      let bandStart = -1;
      let bandMat = -1;
      for (let k = kMin; k <= kMax + 1; k++) {
        const exposed = k <= kMax && k < L && solidHere(k) && !columns.solidAt(n, k);
        const mat = exposed ? columns.materialAt(id, k) : -1;
        if (exposed && bandStart === -1) { bandStart = k; bandMat = mat; }
        else if (bandStart !== -1 && (!exposed || mat !== bandMat)) {
          emitWall(cAx, cAy, cAz, cBx, cBy, cBz, bounds[bandStart], bounds[k], tcx, tcy, tcz, ax, ay, az, bandMat, id, isPent, moist);
          bandStart = exposed ? k : -1;
          bandMat = mat;
        }
      }
    }
  }

  // --- flora / trees (into the same buffers: they stream, release, and rebuild with the chunk) ---
  if (trees) {
    for (const id of chunk.tiles) {
      if (trees.hasTree(id)) {
        const rG = layers.topRadius(columns.topLayerOf(id));
        const dmg = trees.damageOf(id);
        const grove = typeof trees.groveTreesFor === 'function' ? trees.groveTreesFor(id) : [trees.paramsFor(id)];
        for (const treeParams of grove) {
          emitTree(cen[id * 3], cen[id * 3 + 1], cen[id * 3 + 2], rG, treeParams, ax, ay, az, dmg);
        }
      }
      // Lush Sky-Groves on the flat top of Floating Sky-Islands
      const sky = columns.skyIslandRange(id);
      if (sky && !sky.isRim && !trees.chopped.has(id) && (id % 2 === 0)) {
        const rSky = layers.topRadius(sky.topK);
        const skyTree = trees.paramsFor(id);
        emitTree(cen[id * 3], cen[id * 3 + 1], cen[id * 3 + 2], rSky, skyTree, ax, ay, az, 0);
      }
    }
  }

  if (sink.n === 0) return null;
  return {
    positions: sink.pos.slice(0, sink.n * 3),
    normals: sink.nrm.slice(0, sink.n * 3),
    colors: sink.col.slice(0, sink.n * 3),
    packedMat: sink.pmat.slice(0, sink.n),
    anchor: [ax, ay, az],
    triangles: sink.n / 3,
  };
}

function emitCap(
  deg: number, r: number,
  ncx: number, ncy: number, ncz: number,
  ax: number, ay: number, az: number,
  flip: boolean, mat: number, tileId: number, isPent: boolean,
  moist: number,
): void {
  materialColor(mat, tileId, isPent, colorScratch);
  const cr = colorScratch[0], cg = colorScratch[1], cb = colorScratch[2];
  const nx = flip ? -ncx : ncx, ny = flip ? -ncy : ncy, nz = flip ? -ncz : ncz;
  const packed = encodePackedMat(mat, false, isPent, false, moist);
  sink.ensure((deg - 2) * 3);
  const c = cornerScratch;
  const x0 = c[0] * r - ax, y0 = c[1] * r - ay, z0 = c[2] * r - az;
  for (let t = 1; t < deg - 1; t++) {
    const i1 = flip ? t + 1 : t;
    const i2 = flip ? t : t + 1;
    sink.vert(x0, y0, z0, nx, ny, nz, cr, cg, cb, packed);
    sink.vert(c[i1 * 3] * r - ax, c[i1 * 3 + 1] * r - ay, c[i1 * 3 + 2] * r - az, nx, ny, nz, cr, cg, cb, packed);
    sink.vert(c[i2 * 3] * r - ax, c[i2 * 3 + 1] * r - ay, c[i2 * 3 + 2] * r - az, nx, ny, nz, cr, cg, cb, packed);
  }
}

/**
 * Multi-archetype procedural flora emitter:
 *  - 'conifer': 5-sided trunk + 6-sided cone canopy with underside skirt
 *  - 'broadleaf': trunk + two-tier fuller dome crown
 *  - 'cactus': ribbed green desert saguaro column + side arm
 *  - 'fungal': glowing bioluminescent stem + wide mushroom umbrella cap
 *  - 'crystal_spire': faceted hexagonal crystal obelisk cluster
 */
function emitTree(
  ux: number, uy: number, uz: number, rG: number,
  p: TreeParams,
  ax: number, ay: number, az: number,
  damage = 0,
): void {
  treeTangentFrame(ux, uy, uz, frameScratch);
  const t1x = frameScratch[0], t1y = frameScratch[1], t1z = frameScratch[2];
  const t2x = frameScratch[3], t2y = frameScratch[4], t2z = frameScratch[5];
  const tint = p.tint;
  const phase = tint * 7.3;

  const bx = ux * (rG - 0.2) + t1x * p.offA + t2x * p.offB;
  const by = uy * (rG - 0.2) + t1y * p.offA + t2y * p.offB;
  const bz = uz * (rG - 0.2) + t1z * p.offA + t2z * p.offB;
  const trunkTop = 0.2 + p.trunk;

  const kind = p.kind ?? 'conifer';
  const trunkBaseColor: readonly [number, number, number] =
    kind === 'cactus'
      ? CACTUS_COLOR
      : kind === 'fungal' || kind === 'spore_bulb'
        ? FUNGAL_STEM_COLOR
        : kind === 'crystal_spire' || kind === 'ice_willow'
          ? CRYSTAL_FLORA_COLOR
          : TRUNK_COLOR;
  const canopyBaseColor: readonly [number, number, number] =
    kind === 'broadleaf'
      ? BROADLEAF_COLOR
      : kind === 'palm'
        ? [0.36, 0.74, 0.24]
        : kind === 'weeping_willow'
          ? [0.28, 0.72, 0.42]
          : kind === 'cactus'
            ? CACTUS_COLOR
            : kind === 'fungal'
              ? FUNGAL_CAP_COLOR
              : kind === 'spore_bulb'
                ? [0.92, 0.36, 0.78]
                : kind === 'ice_willow'
                  ? [0.58, 0.90, 0.98]
                  : kind === 'crystal_spire'
                    ? CRYSTAL_FLORA_COLOR
                    : LEAF_COLOR;

  const tr = Math.min(1, trunkBaseColor[0] * tint);
  const tg = Math.min(1, trunkBaseColor[1] * tint);
  const tb = Math.min(1, trunkBaseColor[2] * tint);
  const leafT = 0.75 + tint * 0.35;
  const lr = Math.min(1, canopyBaseColor[0] * leafT);
  const lg = Math.min(1, canopyBaseColor[1] * leafT);
  const lb = Math.min(1, canopyBaseColor[2] * leafT);

  const trunkMatId = kind === 'crystal_spire' ? MAT.CRYSTAL : kind === 'fungal' ? MAT.MYCELIUM : MAT.WOOD;
  const canopyMatId = kind === 'crystal_spire' ? MAT.CRYSTAL : kind === 'fungal' ? MAT.MYCELIUM : MAT.GRASS;
  const packedTrunk = encodePackedMat(trunkMatId, false, false, true, 0.5);
  const packedCanopy = encodePackedMat(canopyMatId, false, false, true, 0.7);

  sink.ensure(5 * 6 + 6 * 6);

  const girthScale = kind === 'cactus' ? 1.45 : kind === 'crystal_spire' ? 1.8 : 1.0;

  // trunk / primary column: 5 quads
  for (let s = 0; s < 5; s++) {
    const a0 = phase + (s / 5) * Math.PI * 2;
    const a1 = phase + ((s + 1) / 5) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const d0x = t1x * c0 + t2x * s0, d0y = t1y * c0 + t2y * s0, d0z = t1z * c0 + t2z * s0;
    const d1x = t1x * c1 + t2x * s1, d1y = t1y * c1 + t2y * s1, d1z = t1z * c1 + t2z * s1;
    const g = p.girth * girthScale;
    const v0x = bx + d0x * g - ax, v0y = by + d0y * g - ay, v0z = bz + d0z * g - az;
    const v1x = bx + d1x * g - ax, v1y = by + d1y * g - ay, v1z = bz + d1z * g - az;
    const v2x = v1x + ux * trunkTop, v2y = v1y + uy * trunkTop, v2z = v1z + uz * trunkTop;
    const v3x = v0x + ux * trunkTop, v3y = v0y + uy * trunkTop, v3z = v0z + uz * trunkTop;
    const nx = (d0x + d1x) / 2, ny = (d0y + d1y) / 2, nz = (d0z + d1z) / 2;
    const crack = damage > 0.01 && s < Math.ceil(damage * 4.6);
    const cr = crack ? tr * 0.34 : tr;
    const cg = crack ? tg * 0.28 : tg;
    const cb = crack ? tb * 0.24 : tb;
    sink.vert(v0x, v0y, v0z, nx, ny, nz, cr, cg, cb, packedTrunk);
    sink.vert(v1x, v1y, v1z, nx, ny, nz, cr, cg, cb, packedTrunk);
    sink.vert(v2x, v2y, v2z, nx, ny, nz, cr, cg, cb, packedTrunk);
    sink.vert(v0x, v0y, v0z, nx, ny, nz, cr, cg, cb, packedTrunk);
    sink.vert(v2x, v2y, v2z, nx, ny, nz, cr, cg, cb, packedTrunk);
    sink.vert(v3x, v3y, v3z, nx, ny, nz, cr, cg, cb, packedTrunk);
  }

  // canopy / crown: 6-sided cone/umbrella/crystal tip
  const ringR =
    kind === 'cactus'
      ? p.spread * 0.42
      : kind === 'fungal' || kind === 'palm'
        ? p.spread * 1.42
        : kind === 'weeping_willow' || kind === 'ice_willow'
          ? p.spread * 1.32
          : kind === 'spore_bulb'
            ? p.spread * 1.15
            : kind === 'crystal_spire'
              ? p.spread * 0.65
              : p.spread;
  const ringH = trunkTop - (kind === 'fungal' || kind === 'palm' ? 0.05 : kind === 'weeping_willow' || kind === 'ice_willow' ? 0.55 : 0.15);
  const canopyHeight =
    kind === 'fungal'
      ? p.canopy * 0.38
      : kind === 'palm'
        ? p.canopy * 0.32
        : kind === 'spore_bulb'
          ? p.canopy * 0.72
          : kind === 'cactus'
            ? p.canopy * 0.45
            : p.canopy;
  const apexH = trunkTop + canopyHeight;
  const apX = bx + ux * apexH - ax, apY = by + uy * apexH - ay, apZ = bz + uz * apexH - az;
  const ctrX = bx + ux * (ringH - 0.4) - ax, ctrY = by + uy * (ringH - 0.4) - ay, ctrZ = bz + uz * (ringH - 0.4) - az;

  for (let s = 0; s < 6; s++) {
    const a0 = phase + (s / 6) * Math.PI * 2;
    const a1 = phase + ((s + 1) / 6) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const d0x = t1x * c0 + t2x * s0, d0y = t1y * c0 + t2y * s0, d0z = t1z * c0 + t2z * s0;
    const d1x = t1x * c1 + t2x * s1, d1y = t1y * c1 + t2y * s1, d1z = t1z * c1 + t2z * s1;
    const r0x = bx + d0x * ringR + ux * ringH - ax, r0y = by + d0y * ringR + uy * ringH - ay, r0z = bz + d0z * ringR + uz * ringH - az;
    const r1x = bx + d1x * ringR + ux * ringH - ax, r1y = by + d1y * ringR + uy * ringH - ay, r1z = bz + d1z * ringR + uz * ringH - az;

    let nx = (d0x + d1x) * 0.5 + ux * 0.55, ny = (d0y + d1y) * 0.5 + uy * 0.55, nz = (d0z + d1z) * 0.5 + uz * 0.55;
    let nl = Math.hypot(nx, ny, nz) || 1;
    const leafDrop = 1 - damage * 0.18;
    sink.vert(r0x, r0y, r0z, nx / nl, ny / nl, nz / nl, lr * leafDrop, lg * leafDrop, lb * leafDrop, packedCanopy);
    sink.vert(r1x, r1y, r1z, nx / nl, ny / nl, nz / nl, lr * leafDrop, lg * leafDrop, lb * leafDrop, packedCanopy);
    sink.vert(apX, apY, apZ, nx / nl, ny / nl, nz / nl, lr * leafDrop, lg * leafDrop, lb * leafDrop, packedCanopy);

    nx = (d0x + d1x) * 0.5 - ux * 0.6; ny = (d0y + d1y) * 0.5 - uy * 0.6; nz = (d0z + d1z) * 0.5 - uz * 0.6;
    nl = Math.hypot(nx, ny, nz) || 1;
    sink.vert(r1x, r1y, r1z, nx / nl, ny / nl, nz / nl, lr * 0.75, lg * 0.75, lb * 0.75, packedCanopy);
    sink.vert(r0x, r0y, r0z, nx / nl, ny / nl, nz / nl, lr * 0.75, lg * 0.75, lb * 0.75, packedCanopy);
    sink.vert(ctrX, ctrY, ctrZ, nx / nl, ny / nl, nz / nl, lr * 0.75, lg * 0.75, lb * 0.75, packedCanopy);
  }
}

function emitWall(
  cAx: number, cAy: number, cAz: number,
  cBx: number, cBy: number, cBz: number,
  rTop: number, rBot: number,
  tcx: number, tcy: number, tcz: number,
  ax: number, ay: number, az: number,
  mat: number, tileId: number, isPent: boolean,
  moist: number,
): void {
  materialColor(mat, tileId, isPent, colorScratch);
  const cr = colorScratch[0], cg = colorScratch[1], cb = colorScratch[2];
  const packed = encodePackedMat(mat, true, isPent, false, moist);
  const v0x = cAx * rTop, v0y = cAy * rTop, v0z = cAz * rTop;
  const v1x = cBx * rTop, v1y = cBy * rTop, v1z = cBz * rTop;
  const v2x = cBx * rBot, v2y = cBy * rBot, v2z = cBz * rBot;
  const v3x = cAx * rBot, v3y = cAy * rBot, v3z = cAz * rBot;
  let nx = (v1y - v0y) * (v3z - v0z) - (v1z - v0z) * (v3y - v0y);
  let ny = (v1z - v0z) * (v3x - v0x) - (v1x - v0x) * (v3z - v0z);
  let nz = (v1x - v0x) * (v3y - v0y) - (v1y - v0y) * (v3x - v0x);
  const midx = (v0x + v1x) * 0.5 - tcx * rTop, midy = (v0y + v1y) * 0.5 - tcy * rTop, midz = (v0z + v1z) * 0.5 - tcz * rTop;
  let flip = false;
  if (nx * midx + ny * midy + nz * midz < 0) { nx = -nx; ny = -ny; nz = -nz; flip = true; }
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  sink.ensure(6);
  const q = [
    v0x - ax, v0y - ay, v0z - az,
    v1x - ax, v1y - ay, v1z - az,
    v2x - ax, v2y - ay, v2z - az,
    v3x - ax, v3y - ay, v3z - az,
  ];
  const order = flip ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3];
  for (const idx of order) {
    sink.vert(q[idx * 3], q[idx * 3 + 1], q[idx * 3 + 2], nx, ny, nz, cr, cg, cb, packed);
  }
}
