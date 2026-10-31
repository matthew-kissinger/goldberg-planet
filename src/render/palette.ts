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
  [MAT.ICE]: lin(0x7cd4f0),
  [MAT.TERRACOTTA]: lin(0xc86442),
  [MAT.BASALT]: lin(0x383a42),
  [MAT.CRYSTAL]: lin(0x6ce8e0),
  [MAT.MAGMA]: lin(0xff5a18),
  [MAT.MYCELIUM]: lin(0x28b89a),
};

const VARIANT_RAMPS: Record<number, readonly [number, number, number][]> = {
  [MAT.GRASS]: [lin(0x5f9e48), lin(0x79b85a), lin(0x8aa85d), lin(0x4f8a56)],
  [MAT.DIRT]: [lin(0x765037), lin(0x9a6b45), lin(0x6b5a3e), lin(0xa07150)],
  [MAT.ROCK]: [lin(0x686f77), lin(0x85878d), lin(0x77756c), lin(0x8f8b80)],
  [MAT.SAND]: [lin(0xd1bb78), lin(0xe2cf9a), lin(0xcbb083), lin(0xd9c88e)],
  [MAT.SNOW]: [lin(0xe8f0f4), lin(0xf4f7f6), lin(0xdce8ee), lin(0xf0eee4)],
  [MAT.BEDROCK]: [lin(0x2a2b32), lin(0x383844), lin(0x242832)],
  [MAT.BUILT]: [lin(0x8f9baa), lin(0xa7b2bf), lin(0x9fa88f), lin(0x8d9999)],
  [MAT.SEABED]: [lin(0x5f6348), lin(0x777053), lin(0x596b60), lin(0x74684d)],
  [MAT.WOOD]: [lin(0x8f6135), lin(0xb17b44), lin(0x7c5c38), lin(0xaa7048)],
  [MAT.ICE]: [lin(0x66c8ea), lin(0x88def6), lin(0x54b4dc), lin(0xa2ecfc)],
  [MAT.TERRACOTTA]: [lin(0xb85234), lin(0xd4714a), lin(0xa2462e), lin(0xe0885a)],
  [MAT.BASALT]: [lin(0x2e3038), lin(0x3f424c), lin(0x35363d), lin(0x484b56)],
  [MAT.CRYSTAL]: [lin(0x54e2dc), lin(0x88f4ff), lin(0x7898ff), lin(0x60f8d0)],
  [MAT.MAGMA]: [lin(0xff4810), lin(0xff781c), lin(0xd82c08), lin(0xffa428)],
  [MAT.MYCELIUM]: [lin(0x22a88c), lin(0x34c8a8), lin(0x4298b8), lin(0x2ad89e)],
};

/** tree & flora part colors (linear), tinted per tree by the mesher */
export const TRUNK_COLOR = lin(0x5d4128);
export const LEAF_COLOR = lin(0x3d7a33);
export const BROADLEAF_COLOR = lin(0x56983c);
export const CACTUS_COLOR = lin(0x4b8b3b);
export const FUNGAL_STEM_COLOR = lin(0x88b8c6);
export const FUNGAL_CAP_COLOR = lin(0x28e2c4);
export const CRYSTAL_FLORA_COLOR = lin(0x6cf0ff);

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function mixColor(a: readonly number[], b: readonly number[], t: number, out: [number, number, number]): [number, number, number] {
  const u = clamp01(t);
  out[0] = a[0] * (1 - u) + b[0] * u;
  out[1] = a[1] * (1 - u) + b[1] * u;
  out[2] = a[2] * (1 - u) + b[2] * u;
  return out;
}

/**
 * Material color with deterministic per-tile swatches so each hex material has
 * texture-like variation without adding texture maps, material splits, or draw calls.
 * Pentagons retain a gentle warm/harmonic boost so the twelve of them are spottable.
 */
export function materialColor(mat: number, tileId: number, isPentagon: boolean, out: Float32Array | number[], o = 0): void {
  const ramp = VARIANT_RAMPS[mat] ?? [COLORS[mat] ?? COLORS[MAT.ROCK]];
  const pick = hashInt01(tileId * 1664525 + mat * 1013904223);
  const blend = hashInt01(tileId * 1103515245 + mat * 12345);
  const tintSeed = hashInt01(tileId * 374761393 + mat * 668265263);
  const index = Math.min(ramp.length - 1, Math.floor(pick * ramp.length));
  const base = mixColor(ramp[index], ramp[(index + 1) % ramp.length], blend * 0.22, [0, 0, 0]);
  const tint = 0.9 + 0.2 * tintSeed;
  let r = base[0] * tint, g = base[1] * tint, b = base[2] * tint;
  if (isPentagon) {
    r = Math.min(1, r * 1.25 + 0.02);
    g = Math.min(1, g * 1.08);
  }
  out[o] = clamp01(r); out[o + 1] = clamp01(g); out[o + 2] = clamp01(b);
}
