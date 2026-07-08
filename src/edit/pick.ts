/**
 * Cell picking by ray-marching the column field: step the ray, look up (tile, layer),
 * test solidity, then bisect to the surface. O(steps) column lookups, no triangle
 * intersection or acceleration structure needed — and it works through mined tunnels,
 * because it samples the same volume the mesh was built from.
 */

import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import { treeTangentFrame, type Trees } from '../world/trees';

export interface PickResult {
  hitTile: number;
  hitLayer: number;
  /** last empty cell before the hit — the placement target (-1 if ray started inside solid) */
  prevTile: number;
  prevLayer: number;
  dist: number;
}

const STEP = 0.4;

export interface TreePick {
  tile: number;
  dist: number;
}

const treeFrame = new Float64Array(6);

/**
 * Ray test against live trees: march the ray to discover candidate tiles (sample tile +
 * neighbors), then test each candidate tree ONCE with an exact ray-vs-axis closest-approach
 * — so thin trunks can't be tunneled past and canopies hit from any angle. Uses the same
 * deterministic placement as the mesher, so what you see is what you chop.
 */
export function pickTree(
  geo: Goldberg, layers: Layers, columns: Columns, trees: Trees,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
): TreePick | null {
  const c = geo.centers;
  const tested = new Set<number>();
  let best: TreePick | null = null;
  for (let t = 0; t <= maxDist; t += 0.55) {
    const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
    const r = Math.hypot(px, py, pz);
    if (r < layers.bounds[layers.L] || r > layers.bounds[0] + 12) continue;
    const tile = geo.tileOf(px, py, pz);
    const deg = geo.degreeOf(tile);
    for (let k = -1; k < deg; k++) {
      const id = k < 0 ? tile : geo.neighbor(tile, k);
      if (tested.has(id)) continue;
      tested.add(id);
      if (!trees.hasTree(id)) continue;
      const p = trees.paramsFor(id);
      const ux = c[id * 3], uy = c[id * 3 + 1], uz = c[id * 3 + 2];
      const rG = layers.topRadius(columns.topLayerOf(id));
      treeTangentFrame(ux, uy, uz, treeFrame);
      const bx = ux * (rG - 0.2) + treeFrame[0] * p.offA + treeFrame[3] * p.offB;
      const by = uy * (rG - 0.2) + treeFrame[1] * p.offA + treeFrame[4] * p.offB;
      const bz = uz * (rG - 0.2) + treeFrame[2] * p.offA + treeFrame[5] * p.offB;
      const trunkTop = 0.2 + p.trunk;
      const apexH = trunkTop + p.canopy;
      // closest approach between the ray (o + d·tt) and the tree axis (b + u·s)
      const w0x = ox - bx, w0y = oy - by, w0z = oz - bz;
      const bdot = dx * ux + dy * uy + dz * uz;
      const d0 = dx * w0x + dy * w0y + dz * w0z;
      const e = ux * w0x + uy * w0y + uz * w0z;
      const denom = 1 - bdot * bdot;
      let s = denom > 1e-6 ? e + bdot * ((bdot * e - d0) / denom) : -e;
      s = Math.max(-0.3, Math.min(apexH, s));
      let tt = bdot * s - d0;
      tt = Math.max(0, Math.min(maxDist, tt));
      const qx = ox + dx * tt - bx, qy = oy + dy * tt - by, qz = oz + dz * tt - bz;
      const along = qx * ux + qy * uy + qz * uz;
      if (along < -0.5 || along > apexH + 0.3) continue;
      const offx = qx - ux * along, offy = qy - uy * along, offz = qz - uz * along;
      const rad = Math.hypot(offx, offy, offz);
      const allowed = along <= trunkTop
        ? p.girth + 0.35
        : p.spread * (1 - (along - trunkTop) / Math.max(0.001, p.canopy)) + 0.3;
      if (rad <= allowed && (!best || tt < best.dist)) best = { tile: id, dist: tt };
    }
  }
  return best;
}

export function pick(
  geo: Goldberg, layers: Layers, columns: Columns,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
): PickResult | null {
  const Ro = layers.bounds[0] + 0.75;
  const core = layers.bounds[layers.L];

  // fast-forward to the outer shell if starting outside it
  let t = 0;
  const oo = ox * ox + oy * oy + oz * oz;
  if (oo > Ro * Ro) {
    const b = ox * dx + oy * dy + oz * dz;
    const disc = b * b - (oo - Ro * Ro);
    if (disc < 0) return null;
    const tEnter = -b - Math.sqrt(disc);
    if (tEnter > maxDist || tEnter < 0) return null;
    t = Math.max(0, tEnter);
  }

  let prevTile = -1, prevLayer = -1;
  let solid = false;
  let px = 0, py = 0, pz = 0, r = 0;

  const sample = (tt: number): { tile: number; k: number; solid: boolean } => {
    px = ox + dx * tt; py = oy + dy * tt; pz = oz + dz * tt;
    r = Math.hypot(px, py, pz);
    if (r >= Ro || r <= core) return { tile: -1, k: -1, solid: false };
    const k = layers.layerOfRadius(r);
    if (k < 0) return { tile: -1, k: -1, solid: false };
    const tile = geo.tileOf(px, py, pz);
    return { tile, k, solid: columns.solidAt(tile, k) };
  };

  for (; t <= maxDist; t += STEP) {
    const s = sample(t);
    if (s.tile === -1) {
      // outside shell — bail if we're heading further out
      if (r > Ro && px * dx + py * dy + pz * dz > 0) return null;
      prevTile = -1; prevLayer = -1;
      continue;
    }
    if (!s.solid) {
      prevTile = s.tile; prevLayer = s.k;
      solid = false;
      continue;
    }
    // hit: bisect [t-STEP, t] to sharpen prev/hit cells
    let lo = Math.max(0, t - STEP), hi = t;
    let hitTile = s.tile, hitLayer = s.k;
    for (let it = 0; it < 10; it++) {
      const mid = (lo + hi) / 2;
      const sm = sample(mid);
      if (sm.solid) {
        hi = mid; hitTile = sm.tile; hitLayer = sm.k;
      } else {
        lo = mid;
        if (sm.tile >= 0) { prevTile = sm.tile; prevLayer = sm.k; }
      }
    }
    return { hitTile, hitLayer, prevTile, prevLayer, dist: hi };
  }
  return null;
}
