/** Material palette in linear color space (three-free so the mesher stays worker-portable). */

import { MAT } from '../world/terrain';
import { hashInt01 } from '../util/prng';

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function lin(hex: number): [number, number, number] {
  return [
    srgbToLinear(((hex >> 16) & 255) / 255),
    srgbToLinear(((hex >> 8) & 255) / 255),
    srgbToLinear((hex & 255) / 255),
  ];
}

const COLORS: Record<number, [number, number, number]> = {
  [MAT.GRASS]: lin(0x6fae4e),
  [MAT.DIRT]: lin(0x8a6242),
  [MAT.ROCK]: lin(0x7d7f85),
  [MAT.SAND]: lin(0xd8c48a),
  [MAT.SNOW]: lin(0xeef2f5),
  [MAT.BEDROCK]: lin(0x32323a),
  [MAT.BUILT]: lin(0x9aa7b8),
  [MAT.SEABED]: lin(0x6e6a4e),
  [MAT.WOOD]: lin(0xa8763f),
};

/** tree part colors (linear), tinted per tree by the mesher */
export const TRUNK_COLOR = lin(0x5d4128);
export const LEAF_COLOR = lin(0x3d7a33);

/**
 * Material color with a deterministic per-tile tint so the tile pattern reads,
 * and a gentle warm boost on pentagons so the twelve of them are spottable.
 */
export function materialColor(mat: number, tileId: number, isPentagon: boolean, out: Float32Array | number[], o = 0): void {
  const base = COLORS[mat] ?? COLORS[MAT.ROCK];
  const tint = 0.92 + 0.16 * hashInt01(tileId);
  let r = base[0] * tint, g = base[1] * tint, b = base[2] * tint;
  if (isPentagon) { r = Math.min(1, r * 1.25 + 0.02); g = Math.min(1, g * 1.08); }
  out[o] = r; out[o + 1] = g; out[o + 2] = b;
}
