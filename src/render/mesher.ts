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
 * imports, so this can move to a Worker wholesale if measurement says it must.
 */

import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import type { ChunkInfo } from '../world/chunks';
import { treeTangentFrame, type Trees } from '../world/trees';
import type { CellDamageProvider } from '../sim/mining';
import { PLANET_RADIUS } from '../world/layers';
import { materialColor, TRUNK_COLOR, LEAF_COLOR } from './palette';

export interface ChunkMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** f64 world anchor; vertex positions are relative to it */
  anchor: [number, number, number];
  triangles: number;
}

class Sink {
  pos: Float32Array = new Float32Array(65536 * 3);
  nrm: Float32Array = new Float32Array(65536 * 3);
  col: Float32Array = new Float32Array(65536 * 3);
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
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number, g: number, b: number): void {
    const i = this.n * 3;
    this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z;
    this.nrm[i] = nx; this.nrm[i + 1] = ny; this.nrm[i + 2] = nz;
    this.col[i] = r; this.col[i + 1] = g; this.col[i + 2] = b;
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
  cellDamage?: CellDamageProvider,
): ChunkMeshData | null {
  sink.reset();
  const ax = chunk.cx * PLANET_RADIUS, ay = chunk.cy * PLANET_RADIUS, az = chunk.cz * PLANET_RADIUS;
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

    // scan window: from the highest possibly-solid layer of this tile down to where
    // this tile and all neighbors are permanently solid (default columns below their tops).
    let kMin = edit ? 0 : top;
    let kMax = edit ? L - 1 : columns.naturalScanMax(id); // deepest layer at which a wall could still be exposed
    for (let e = 0; e < deg; e++) {
      const n = geo.nbrs[id * 6 + e];
      if (columns.editOf(n)) { kMax = L - 1; break; }
      const nMax = columns.naturalScanMax(n);
      if (nMax > kMax) kMax = nMax;
    }
    if (edit) kMax = L - 1;
    if (kMin < 0) kMin = 0;

    const tcx = cen[id * 3], tcy = cen[id * 3 + 1], tcz = cen[id * 3 + 2];

    // --- caps ---
    for (let k = kMin; k <= Math.min(kMax, L - 1); k++) {
      const s = solidHere(k);
      if (!s) continue;
      const above = solidHere(k - 1);
      const below = solidHere(k + 1) || k === L - 1;
      if (above && below) continue;
      if (!above) {
        // top cap at bounds[k]
        emitCap(deg, bounds[k], tcx, tcy, tcz, ax, ay, az, false, columns.materialAt(id, k), id, isPent, cellDamage?.damageOf(id, k) ?? 0);
      }
      if (!below && k < L - 1) {
        // bottom cap (cave ceiling) at bounds[k+1]
        emitCap(deg, bounds[k + 1], tcx, tcy, tcz, ax, ay, az, true, columns.materialAt(id, k), id, isPent, cellDamage?.damageOf(id, k) ?? 0);
      }
    }

    // --- walls ---
    for (let e = 0; e < deg; e++) {
      const n = geo.nbrs[id * 6 + e];
      const ca = ((e - 1) + deg) % deg; // corner between neighbor e-1 and e
      const cAx = cornerScratch[ca * 3], cAy = cornerScratch[ca * 3 + 1], cAz = cornerScratch[ca * 3 + 2];
      const cBx = cornerScratch[e * 3], cBy = cornerScratch[e * 3 + 1], cBz = cornerScratch[e * 3 + 2];
      let bandStart = -1;
      let bandMat = -1;
      for (let k = kMin; k <= kMax + 1; k++) {
        const exposed = k <= kMax && k < L && solidHere(k) && !columns.solidAt(n, k);
        const mat = exposed ? columns.materialAt(id, k) : -1;
        if (exposed && bandStart === -1) { bandStart = k; bandMat = mat; }
        else if (bandStart !== -1 && (!exposed || mat !== bandMat)) {
          emitWall(cAx, cAy, cAz, cBx, cBy, cBz, bounds[bandStart], bounds[k], tcx, tcy, tcz, ax, ay, az, bandMat, id, isPent, cellDamage?.damageOf(id, bandStart) ?? 0);
          bandStart = exposed ? k : -1;
          bandMat = mat;
        }
      }
    }
  }

  // --- trees (into the same buffers: they stream, release, and rebuild with the chunk) ---
  if (trees) {
    for (const id of chunk.tiles) {
      if (!trees.hasTree(id)) continue;
      const rG = layers.topRadius(columns.topLayerOf(id));
      emitTree(cen[id * 3], cen[id * 3 + 1], cen[id * 3 + 2], rG, trees.paramsFor(id), ax, ay, az, trees.damageOf(id));
    }
  }

  if (sink.n === 0) return null;
  return {
    positions: sink.pos.slice(0, sink.n * 3),
    normals: sink.nrm.slice(0, sink.n * 3),
    colors: sink.col.slice(0, sink.n * 3),
    anchor: [ax, ay, az],
    triangles: sink.n / 3,
  };
}

function emitCap(
  deg: number, r: number,
  ncx: number, ncy: number, ncz: number,
  ax: number, ay: number, az: number,
  flip: boolean, mat: number, tileId: number, isPent: boolean, damage = 0,
): void {
  materialColor(mat, tileId, isPent, colorScratch);
  const dmg = Math.max(0, Math.min(0.98, damage));
  const cr = colorScratch[0], cg = colorScratch[1], cb = colorScratch[2];
  const shade = 1 - dmg * 0.2;
  const crackTriangles = Math.ceil(dmg * Math.max(1, deg - 2));
  const nx = flip ? -ncx : ncx, ny = flip ? -ncy : ncy, nz = flip ? -ncz : ncz;
  sink.ensure((deg - 2) * 3);
  const c = cornerScratch;
  const x0 = c[0] * r - ax, y0 = c[1] * r - ay, z0 = c[2] * r - az;
  for (let t = 1; t < deg - 1; t++) {
    const i1 = flip ? t + 1 : t;
    const i2 = flip ? t : t + 1;
    const crack = dmg > 0.01 && t <= crackTriangles;
    const dark = crack ? 0.34 : shade;
    sink.vert(x0, y0, z0, nx, ny, nz, cr * dark, cg * dark, cb * dark);
    sink.vert(c[i1 * 3] * r - ax, c[i1 * 3 + 1] * r - ay, c[i1 * 3 + 2] * r - az, nx, ny, nz, cr * dark, cg * dark, cb * dark);
    sink.vert(c[i2 * 3] * r - ax, c[i2 * 3 + 1] * r - ay, c[i2 * 3 + 2] * r - az, nx, ny, nz, cr * dark, cg * dark, cb * dark);
  }
}

/** low-poly conifer: 5-sided trunk + 6-sided canopy cone with an underside skirt (~28 tris) */
function emitTree(
  ux: number, uy: number, uz: number, rG: number,
  p: { trunk: number; canopy: number; spread: number; girth: number; offA: number; offB: number; tint: number },
  ax: number, ay: number, az: number,
  damage = 0,
): void {
  // tangent frame at the tile (shared with the picker)
  treeTangentFrame(ux, uy, uz, frameScratch);
  const t1x = frameScratch[0], t1y = frameScratch[1], t1z = frameScratch[2];
  const t2x = frameScratch[3], t2y = frameScratch[4], t2z = frameScratch[5];
  const tint = p.tint;
  const phase = tint * 7.3;

  // base sits a touch below the surface so it roots into the terrain step — fixed in
  // place regardless of chop damage (matches pickTree's un-shifted trunk axis; damage
  // reads only through the crack darkening below, not a positional shift)
  const bx = ux * (rG - 0.2) + t1x * p.offA + t2x * p.offB;
  const by = uy * (rG - 0.2) + t1y * p.offA + t2y * p.offB;
  const bz = uz * (rG - 0.2) + t1z * p.offA + t2z * p.offB;
  const trunkTop = 0.2 + p.trunk;

  const tr = TRUNK_COLOR[0] * tint, tg = TRUNK_COLOR[1] * tint, tb = TRUNK_COLOR[2] * tint;
  const leafT = 0.75 + tint * 0.35;
  const lr = Math.min(1, LEAF_COLOR[0] * leafT), lg = Math.min(1, LEAF_COLOR[1] * leafT), lb = Math.min(1, LEAF_COLOR[2] * leafT);

  sink.ensure(5 * 6 + 6 * 6);

  // trunk: 5 quads
  for (let s = 0; s < 5; s++) {
    const a0 = phase + (s / 5) * Math.PI * 2;
    const a1 = phase + ((s + 1) / 5) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const d0x = t1x * c0 + t2x * s0, d0y = t1y * c0 + t2y * s0, d0z = t1z * c0 + t2z * s0;
    const d1x = t1x * c1 + t2x * s1, d1y = t1y * c1 + t2y * s1, d1z = t1z * c1 + t2z * s1;
    const g = p.girth;
    // corners: bottom0, bottom1, top1, top0
    const v0x = bx + d0x * g - ax, v0y = by + d0y * g - ay, v0z = bz + d0z * g - az;
    const v1x = bx + d1x * g - ax, v1y = by + d1y * g - ay, v1z = bz + d1z * g - az;
    const v2x = v1x + ux * trunkTop, v2y = v1y + uy * trunkTop, v2z = v1z + uz * trunkTop;
    const v3x = v0x + ux * trunkTop, v3y = v0y + uy * trunkTop, v3z = v0z + uz * trunkTop;
    const nx = (d0x + d1x) / 2, ny = (d0y + d1y) / 2, nz = (d0z + d1z) / 2;
    const crack = damage > 0.01 && s < Math.ceil(damage * 4.6);
    const cr = crack ? tr * 0.34 : tr;
    const cg = crack ? tg * 0.28 : tg;
    const cb = crack ? tb * 0.24 : tb;
    sink.vert(v0x, v0y, v0z, nx, ny, nz, cr, cg, cb);
    sink.vert(v1x, v1y, v1z, nx, ny, nz, cr, cg, cb);
    sink.vert(v2x, v2y, v2z, nx, ny, nz, cr, cg, cb);
    sink.vert(v0x, v0y, v0z, nx, ny, nz, cr, cg, cb);
    sink.vert(v2x, v2y, v2z, nx, ny, nz, cr, cg, cb);
    sink.vert(v3x, v3y, v3z, nx, ny, nz, cr, cg, cb);
  }

  // canopy: 6-sided cone from a ring at the trunk top to an apex, plus an underside skirt
  const ringR = p.spread;
  const ringH = trunkTop - 0.15;
  const apexH = trunkTop + p.canopy;
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
    // upper cone face (outward+up normal)
    let nx = (d0x + d1x) * 0.5 + ux * 0.55, ny = (d0y + d1y) * 0.5 + uy * 0.55, nz = (d0z + d1z) * 0.5 + uz * 0.55;
    let nl = Math.hypot(nx, ny, nz) || 1;
    const leafDrop = 1 - damage * 0.18;
    sink.vert(r0x, r0y, r0z, nx / nl, ny / nl, nz / nl, lr * leafDrop, lg * leafDrop, lb * leafDrop);
    sink.vert(r1x, r1y, r1z, nx / nl, ny / nl, nz / nl, lr * leafDrop, lg * leafDrop, lb * leafDrop);
    sink.vert(apX, apY, apZ, nx / nl, ny / nl, nz / nl, lr * leafDrop, lg * leafDrop, lb * leafDrop);
    // skirt face (outward+down normal), wound to face outward from below
    nx = (d0x + d1x) * 0.5 - ux * 0.6; ny = (d0y + d1y) * 0.5 - uy * 0.6; nz = (d0z + d1z) * 0.5 - uz * 0.6;
    nl = Math.hypot(nx, ny, nz) || 1;
    sink.vert(r1x, r1y, r1z, nx / nl, ny / nl, nz / nl, lr * 0.75, lg * 0.75, lb * 0.75);
    sink.vert(r0x, r0y, r0z, nx / nl, ny / nl, nz / nl, lr * 0.75, lg * 0.75, lb * 0.75);
    sink.vert(ctrX, ctrY, ctrZ, nx / nl, ny / nl, nz / nl, lr * 0.75, lg * 0.75, lb * 0.75);
  }
}

function emitWall(
  cAx: number, cAy: number, cAz: number,
  cBx: number, cBy: number, cBz: number,
  rTop: number, rBot: number,
  tcx: number, tcy: number, tcz: number,
  ax: number, ay: number, az: number,
  mat: number, tileId: number, isPent: boolean, damage = 0,
): void {
  materialColor(mat, tileId, isPent, colorScratch);
  const dmg = Math.max(0, Math.min(0.98, damage));
  const dark = dmg > 0.01 ? 1 - dmg * 0.28 : 1;
  const cr = colorScratch[0] * dark, cg = colorScratch[1] * dark, cb = colorScratch[2] * dark;
  // quad corners (world, then relative to anchor)
  const v0x = cAx * rTop, v0y = cAy * rTop, v0z = cAz * rTop;
  const v1x = cBx * rTop, v1y = cBy * rTop, v1z = cBz * rTop;
  const v2x = cBx * rBot, v2y = cBy * rBot, v2z = cBz * rBot;
  const v3x = cAx * rBot, v3y = cAy * rBot, v3z = cAz * rBot;
  // face normal, oriented away from the tile center
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
    sink.vert(q[idx * 3], q[idx * 3 + 1], q[idx * 3 + 2], nx, ny, nz, cr, cg, cb);
  }
}
