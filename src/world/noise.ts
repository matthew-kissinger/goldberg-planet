/**
 * Composable 3D Spherical Noise & Geological Operators.
 *
 * All operators evaluate deterministically on 3D coordinates (typically unit sphere
 * directions (x, y, z) scaled by frequency) with zero heap allocations on the hot path.
 * Because sampling happens in 3D Euclidean space around the sphere, there are zero
 * polar pinch points, zero longitude seams, and zero icosahedral face boundaries.
 */

import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { hashString, mulberry32 } from '../util/prng';

export type { NoiseFunction3D };

/** Create a deterministic 3D simplex noise function from a string seed and salt. */
export function makeSeededNoise3D(seed: string, salt: string): NoiseFunction3D {
  return createNoise3D(mulberry32(hashString(`${seed}:${salt}`)));
}

/**
 * Standard 3D fractional Brownian motion (fBm), normalized to approximately [-1, 1].
 */
export function fbm3D(
  noise: NoiseFunction3D,
  x: number,
  y: number,
  z: number,
  octaves: number,
  lacunarity = 2.03,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Ridged multifractal 3D noise in [0, 1].
 * Produces knife-edge mountain spines, canyon rims, and crystalline ice spires.
 * Higher `sharpness` (e.g. 2.0 - 3.5) narrows the ridge crests.
 */
export function ridgedFbm3D(
  noise: NoiseFunction3D,
  x: number,
  y: number,
  z: number,
  octaves: number,
  lacunarity = 2.07,
  gain = 0.5,
  sharpness = 2.0,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  let weight = 1;
  for (let o = 0; o < octaves; o++) {
    const raw = 1 - Math.abs(noise(x * freq, y * freq, z * freq));
    const ridge = Math.pow(Math.max(0, raw), sharpness) * weight;
    weight = Math.min(1, Math.max(0.15, ridge * 1.6));
    sum += amp * ridge;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Billow 3D noise in [0, 1].
 * Produces rounded sand dune swells, pillow lava, and glacial snow domes.
 */
export function billowFbm3D(
  noise: NoiseFunction3D,
  x: number,
  y: number,
  z: number,
  octaves: number,
  lacunarity = 2.02,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const b = Math.abs(noise(x * freq, y * freq, z * freq));
    sum += amp * b;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * 3D Domain Warping: warps input coordinates (x, y, z) using three decorrelated noise fields
 * and writes the warped coordinates into `out[0..2]` with zero heap allocation.
 */
export function domainWarp3D(
  noiseX: NoiseFunction3D,
  noiseY: NoiseFunction3D,
  noiseZ: NoiseFunction3D,
  x: number,
  y: number,
  z: number,
  freq: number,
  amp: number,
  out: Float64Array,
): void {
  const sx = x * freq;
  const sy = y * freq;
  const sz = z * freq;
  out[0] = x + amp * noiseX(sx, sy, sz);
  out[1] = y + amp * noiseY(sx + 17.3, sy - 9.1, sz + 4.7);
  out[2] = z + amp * noiseZ(sx - 11.8, sy + 23.4, sz - 6.2);
}

/**
 * Smooth-stepped terrace quantizer.
 * Turns continuous elevation `val` into stepped plateaus/mesas of step height `stepSize`.
 * `sharpness` in [0, 1] controls how steep the cliff riser is between flat benches:
 *   0.0 = unmodified linear slope, 0.85 = crisp mesa steps with slight bevel.
 */
export function terrace(val: number, stepSize: number, sharpness: number): number {
  if (stepSize <= 0 || sharpness <= 0) return val;
  const scaled = val / stepSize;
  const base = Math.floor(scaled);
  const frac = scaled - base;
  // Smoothstep blend tightened by sharpness
  const k = Math.max(0.02, 1 - Math.min(0.98, sharpness));
  let t: number;
  if (frac < 0.5 - 0.5 * k) {
    t = 0;
  } else if (frac > 0.5 + 0.5 * k) {
    t = 1;
  } else {
    const u = (frac - (0.5 - 0.5 * k)) / k;
    t = u * u * (3 - 2 * u);
  }
  const stepped = (base + t) * stepSize;
  return val * (1 - sharpness) + stepped * sharpness;
}

/** Fast integer lattice hash for 3D Worley/Voronoi cellular noise. */
function hashLattice3D(ix: number, iy: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647) + seed) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * 3D Worley / Voronoi Cellular Noise on scaled coordinates (x * scale, y * scale, z * scale).
 * Writes into `out`:
 *  - `out[0]` = `d1` (distance to closest feature point, in [0, ~1.2])
 *  - `out[1]` = `d2` (distance to second-closest feature point; `d2 - d1` is 0 on cell borders)
 *  - `out[2]` = `cellHash` (deterministic hash in [0, 1) of the closest cell)
 */
export function voronoiSphere3D(
  seedHash: number,
  x: number,
  y: number,
  z: number,
  scale: number,
  out: Float64Array,
  jitter = 0.82,
): void {
  const px = x * scale;
  const py = y * scale;
  const pz = z * scale;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const iz = Math.floor(pz);

  let d1Sq = 1e9;
  let d2Sq = 1e9;
  let bestHash = 0;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;
        const h0 = hashLattice3D(cx, cy, cz, seedHash);
        const h1 = hashLattice3D(cx, cy, cz, (seedHash + 0x9e3779b9) | 0);
        const h2 = hashLattice3D(cx, cy, cz, (seedHash + 0x7f4a7c15) | 0);

        const ox = 0.5 + ((h0 / 4294967296) - 0.5) * jitter;
        const oy = 0.5 + ((h1 / 4294967296) - 0.5) * jitter;
        const oz = 0.5 + ((h2 / 4294967296) - 0.5) * jitter;

        const rx = cx + ox - px;
        const ry = cy + oy - py;
        const rz = cz + oz - pz;
        const distSq = rx * rx + ry * ry + rz * rz;

        if (distSq < d1Sq) {
          d2Sq = d1Sq;
          d1Sq = distSq;
          bestHash = h0 / 4294967296;
        } else if (distSq < d2Sq) {
          d2Sq = distSq;
        }
      }
    }
  }

  out[0] = Math.sqrt(d1Sq);
  out[1] = Math.sqrt(d2Sq);
  out[2] = bestHash;
}

/**
 * Evaluates a physical impact crater profile from Voronoi cell distance `d1`.
 * Returns a signed elevation delta (negative inside the bowl, positive on the raised rim,
 * decaying smoothly to 0 outside `radius + rimWidth`).
 */
export function craterProfile(
  d1: number,
  radius: number,
  rimWidth: number,
  depth: number,
  rimHeight: number,
): number {
  if (d1 >= radius + rimWidth || radius <= 0) return 0;
  if (d1 < radius) {
    const rNorm = d1 / radius;
    // Parabolic bowl from -depth at center to +rimHeight at rNorm = 1
    const bowl = rNorm * rNorm;
    return -depth * (1 - bowl) + rimHeight * bowl;
  }
  const u = (d1 - radius) / Math.max(1e-4, rimWidth);
  const falloff = 1 - u * u * (3 - 2 * u);
  return rimHeight * falloff;
}
