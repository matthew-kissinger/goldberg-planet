/**
 * Deterministic terrain: surface height (meters relative to PLANET_RADIUS = sea level) as a
 * pure function of direction on the sphere, derived from a fixed seed. Sampling by position
 * keeps fine planet, coarse far-sphere, and any future LOD consistent — they all read
 * the same underlying field.
 *
 * Composition: a low-frequency continent field splits ocean from land; ridged
 * multifractal mountain ranges (up to +115 m) run where a medium-frequency mask allows;
 * oceans shelve down to -35 m; a sparse hotspot field pushes volcanic islands up through
 * the ocean surface.
 */

import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { hashString, mulberry32 } from '../util/prng';

export const MAT = {
  GRASS: 0, DIRT: 1, ROCK: 2, SAND: 3, SNOW: 4, BEDROCK: 5, BUILT: 6, SEABED: 7, WOOD: 8,
} as const;
export type MaterialId = (typeof MAT)[keyof typeof MAT];

export const HEIGHT_MIN = -35;
export const HEIGHT_MAX = 115;

function sm01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

export class Terrain {
  readonly seed: string;
  private readonly n1: NoiseFunction3D;
  private readonly n2: NoiseFunction3D;
  private readonly n3: NoiseFunction3D;

  constructor(seed: string) {
    this.seed = seed;
    const h = hashString(seed);
    this.n1 = createNoise3D(mulberry32(h ^ 0x9e3779b9));
    this.n2 = createNoise3D(mulberry32(h ^ 0x85ebca6b));
    this.n3 = createNoise3D(mulberry32(h ^ 0xc2b2ae35));
  }

  private fbm(n: NoiseFunction3D, x: number, y: number, z: number, octaves: number): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  /** height in meters relative to sea level, for unit direction (x,y,z). Deterministic. */
  heightAt(x: number, y: number, z: number): number {
    // continents: low frequency, mask in [0,1], midpoint at c ~= 0 for a balanced land/ocean split
    const c = this.fbm(this.n1, x * 1.15, y * 1.15, z * 1.15, 4);
    const land = sm01((c + 0.13) / 0.26);

    // mountain ranges: ridged noise gated by a range mask, land only
    const ridgeRaw = this.fbm(this.n2, x * 2.4, y * 2.4, z * 2.4, 5);
    const ridge = 1 - Math.abs(ridgeRaw);
    const rangeMask = sm01((this.fbm(this.n3, x * 1.6 + 7.3, y * 1.6 - 2.1, z * 1.6 + 4.9, 3) - 0.18) / 0.42);
    const mountains = Math.pow(ridge, 2.2) * rangeMask * 118;

    // rolling hills + fine detail
    const hills = 9 * this.fbm(this.n2, x * 6, y * 6, z * 6, 3);
    const detail = 1.2 * this.fbm(this.n1, x * 11, y * 11, z * 11, 2);

    // ocean floor: shelf near coasts, deep basins far from land
    const depthFac = sm01((0.02 - c) / 0.44);
    const oceanFloor = -10 - 26 * depthFac;

    // volcanic islands: sparse hotspots, only meaningful in ocean
    const hotspot = this.fbm(this.n3, x * 3.8 - 11.2, y * 3.8 + 6.6, z * 3.8 - 3.7, 4);
    const island = Math.pow(Math.max(0, hotspot - 0.58), 1.5) * 550 * (1 - land);

    let h = land * (3 + hills + mountains) + (1 - land) * oceanFloor + island + detail;
    if (h < HEIGHT_MIN) h = HEIGHT_MIN;
    if (h > HEIGHT_MAX) h = HEIGHT_MAX;
    return h;
  }

  /**
   * Forest density field in [0,1]: medium-frequency clusters so trees come in woods and
   * glades rather than a uniform sprinkle. Same determinism contract as heightAt.
   */
  forestAt(x: number, y: number, z: number): number {
    const f = this.fbm(this.n2, x * 4.3 - 17.1, y * 4.3 + 9.4, z * 4.3 + 3.2, 3);
    return sm01((f + 0.05) / 0.55);
  }

  /** surface material for a column whose surface height is h meters (relative to sea level). */
  surfaceMaterial(h: number): MaterialId {
    if (h < -2.2) return MAT.SEABED;
    if (h <= 2.2) return MAT.SAND;
    if (h < 46) return MAT.GRASS;
    if (h < 88) return MAT.ROCK;
    return MAT.SNOW;
  }
}
