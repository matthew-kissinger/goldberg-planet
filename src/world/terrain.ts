/**
 * Deterministic terrain & multi-archetype procedural world generator.
 *
 * Evaluates surface height (meters relative to planetRadius = sea level), moisture,
 * temperature, flora density, and surface/subsurface materials as pure functions of unit
 * direction (x, y, z) on the sphere.
 *
 * Supports 6 distinct planetary archetypes ('terran', 'canyon', 'volcanic', 'cryo',
 * 'biolum', 'shattered') using composable 3D spherical noise operators (fBm, ridged
 * multifractal, billow dunes, domain warping, mesa terracing, and 3D Voronoi craters).
 */

import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { hashString, mulberry32 } from '../util/prng';
import {
  billowFbm3D,
  craterProfile,
  domainWarp3D,
  fbm3D,
  ridgedFbm3D,
  terrace,
  voronoiSphere3D,
} from './noise';
import {
  makeDefaultPlanetConfig,
  type PlanetArchetype,
  type PlanetConfig,
} from './planetConfig';

export const MAT = {
  GRASS: 0,
  DIRT: 1,
  ROCK: 2,
  SAND: 3,
  SNOW: 4,
  BEDROCK: 5,
  BUILT: 6,
  SEABED: 7,
  WOOD: 8,
  ICE: 9,
  TERRACOTTA: 10,
  BASALT: 11,
  CRYSTAL: 12,
  MAGMA: 13,
  MYCELIUM: 14,
} as const;
export type MaterialId = (typeof MAT)[keyof typeof MAT];

export const HEIGHT_MIN = -35;
export const HEIGHT_MAX = 115;

function sm01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

const warpScratch = new Float64Array(3);
const voronoiScratch = new Float64Array(3);

export class Terrain {
  readonly seed: string;
  readonly archetype: PlanetArchetype;
  readonly config: PlanetConfig;
  private readonly seedHash: number;
  private readonly n1: NoiseFunction3D;
  private readonly n2: NoiseFunction3D;
  private readonly n3: NoiseFunction3D;
  private readonly n4: NoiseFunction3D;

  constructor(seedOrConfig: string | PlanetConfig, archetypeOverride?: PlanetArchetype) {
    if (typeof seedOrConfig === 'string') {
      this.seed = seedOrConfig;
      this.config = makeDefaultPlanetConfig(seedOrConfig);
      if (archetypeOverride) {
        this.config.archetype = archetypeOverride;
      }
      this.archetype = this.config.archetype;
    } else {
      this.config = seedOrConfig;
      this.seed = seedOrConfig.seed;
      this.archetype = archetypeOverride ?? seedOrConfig.archetype;
    }
    const h = hashString(this.seed);
    this.seedHash = h;
    this.n1 = createNoise3D(mulberry32(h ^ 0x9e3779b9));
    this.n2 = createNoise3D(mulberry32(h ^ 0x85ebca6b));
    this.n3 = createNoise3D(mulberry32(h ^ 0xc2b2ae35));
    this.n4 = createNoise3D(mulberry32(h ^ 0x27d4eb2f));
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

  /** Height in meters relative to sea level, for unit direction (x,y,z). Deterministic. */
  heightAt(x: number, y: number, z: number): number {
    switch (this.archetype) {
      case 'canyon':
        return this.heightCanyon(x, y, z);
      case 'volcanic':
        return this.heightVolcanic(x, y, z);
      case 'cryo':
        return this.heightCryo(x, y, z);
      case 'biolum':
        return this.heightBiolum(x, y, z);
      case 'shattered':
        return this.heightShattered(x, y, z);
      case 'terran':
      default:
        return this.heightTerran(x, y, z);
    }
  }

  /** Classic Terran Cradle World: continents, alpine ridges, ocean shelves, and volcanic island hotspots. */
  private heightTerran(x: number, y: number, z: number): number {
    const c = this.fbm(this.n1, x * 1.15, y * 1.15, z * 1.15, 4);
    const land = sm01((c + 0.13) / 0.26);

    const ridgeRaw = this.fbm(this.n2, x * 2.4, y * 2.4, z * 2.4, 5);
    const ridge = 1 - Math.abs(ridgeRaw);
    const rangeMask = sm01((this.fbm(this.n3, x * 1.6 + 7.3, y * 1.6 - 2.1, z * 1.6 + 4.9, 3) - 0.18) / 0.42);
    const mountains = Math.pow(ridge, 2.2) * rangeMask * 118;

    const hills = 9 * this.fbm(this.n2, x * 6, y * 6, z * 6, 3);
    const detail = 1.2 * this.fbm(this.n1, x * 11, y * 11, z * 11, 2);

    const depthFac = sm01((0.02 - c) / 0.44);
    const oceanFloor = -10 - 26 * depthFac;

    const hotspot = this.fbm(this.n3, x * 3.8 - 11.2, y * 3.8 + 6.6, z * 3.8 - 3.7, 4);
    const island = Math.pow(Math.max(0, hotspot - 0.58), 1.5) * 550 * (1 - land);

    let h = land * (3 + hills + mountains) + (1 - land) * oceanFloor + island + detail;
    if (h < HEIGHT_MIN) h = HEIGHT_MIN;
    if (h > HEIGHT_MAX) h = HEIGHT_MAX;
    return h;
  }

  /** Canyon Mesa World: domain-warped stepped plateaus, deep river gorges, and billow sand dunes. */
  private heightCanyon(x: number, y: number, z: number): number {
    domainWarp3D(this.n1, this.n2, this.n3, x, y, z, 1.8, 0.28, warpScratch);
    const wx = warpScratch[0], wy = warpScratch[1], wz = warpScratch[2];

    const plateauRaw = fbm3D(this.n1, wx * 1.35, wy * 1.35, wz * 1.35, 4);
    const plateauMask = sm01((plateauRaw + 0.18) / 0.52);
    const steppedMesa = terrace(plateauMask * 86, 12.5, 0.78);

    // Winding river canyon cut using sharp inverted ridge noise
    const riverChannel = Math.abs(fbm3D(this.n2, wx * 2.1, wy * 2.1, wz * 2.1, 3));
    const gorgeCut = (1 - sm01(riverChannel / 0.14)) * 34;

    // Billow sand dunes in the basins
    const dunes = billowFbm3D(this.n3, x * 7.5, y * 7.5, z * 7.5, 3) * 8.5 * (1 - plateauMask * 0.7);
    const hoodoos = ridgedFbm3D(this.n4, x * 5.2, y * 5.2, z * 5.2, 3, 2.1, 0.5, 2.8) * 18 * plateauMask;

    let h = -8 + steppedMesa - gorgeCut + dunes + hoodoos;
    return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, h));
  }

  /** Volcanic Caldera World: Voronoi caldera craters, hexagonal basalt cliffs, and magma ocean shelves. */
  private heightVolcanic(x: number, y: number, z: number): number {
    const continent = fbm3D(this.n1, x * 1.25, y * 1.25, z * 1.25, 4);
    const land = sm01((continent + 0.08) / 0.28);

    // Tectonic ridge spines
    const spines = ridgedFbm3D(this.n2, x * 2.6, y * 2.6, z * 2.6, 5, 2.05, 0.5, 2.4) * 95;

    // Large volcanic calderas via 3D Voronoi
    voronoiSphere3D(this.seedHash ^ 0x13579bdf, x, y, z, 2.8, voronoiScratch, 0.78);
    const caldera = craterProfile(voronoiScratch[0], 0.36, 0.22, 38, 28);

    // Hexagonal basalt stepped flows
    const basaltFlow = terrace(fbm3D(this.n3, x * 4.5, y * 4.5, z * 4.5, 3) * 18 + 14, 5.0, 0.72);
    const magmaFloor = -12 - 18 * sm01((-continent) / 0.45);

    let h = land * (4 + spines * 0.72 + basaltFlow + caldera) + (1 - land) * magmaFloor;
    return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, h));
  }

  /** Cryo-Glacial Spire World: pack-ice ocean, razor-sharp ice spires, and glacial domes. */
  private heightCryo(x: number, y: number, z: number): number {
    const shelf = fbm3D(this.n1, x * 1.3, y * 1.3, z * 1.3, 4);
    const land = sm01((shelf + 0.1) / 0.25);

    const domes = billowFbm3D(this.n2, x * 2.2, y * 2.2, z * 2.2, 4) * 32;
    const spires = ridgedFbm3D(this.n3, x * 3.6, y * 3.6, z * 3.6, 5, 2.15, 0.52, 3.1) * 108;
    const spireMask = sm01((fbm3D(this.n4, x * 1.9, y * 1.9, z * 1.9, 3) - 0.05) / 0.4);

    // Floating pack-ice floes on the cryo ocean
    voronoiSphere3D(this.seedHash ^ 0x2468ace0, x, y, z, 5.5, voronoiScratch, 0.85);
    const crackDist = voronoiScratch[1] - voronoiScratch[0];
    const packIce = crackDist > 0.09 && shelf > -0.22 ? 2.6 : -16 - 16 * sm01(-shelf / 0.5);

    let h = land * (3 + domes + spires * spireMask) + (1 - land) * packIce;
    return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, h));
  }

  /** Bioluminescent Fungal Atoll World: ringed coral lagoons, terraced island arches, and fungal plateaus. */
  private heightBiolum(x: number, y: number, z: number): number {
    voronoiSphere3D(this.seedHash ^ 0x55aa55aa, x, y, z, 2.3, voronoiScratch, 0.8);
    const d1 = voronoiScratch[0];
    // Ringed atoll rim around Voronoi cells
    const ringBand = Math.exp(-Math.pow((d1 - 0.42) / 0.14, 2));
    const centralPeak = Math.exp(-Math.pow(d1 / 0.16, 2)) * (voronoiScratch[2] > 0.35 ? 1 : 0);

    const warp = fbm3D(this.n1, x * 3.2, y * 3.2, z * 3.2, 4);
    const atollHeight = (ringBand * 36 + centralPeak * 68) * sm01((warp + 0.35) / 0.65);
    const terracedCanopy = terrace(atollHeight, 6.25, 0.65);
    const lagoonFloor = -8 - 18 * (1 - ringBand);

    const landMask = sm01((terracedCanopy - 6) / 14);
    let h = landMask * (terracedCanopy + warp * 8) + (1 - landMask) * lagoonFloor;
    return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, h));
  }

  /** Shattered Crystal Moon: airless multi-scale Voronoi impact craters and exposed crystal fissures. */
  private heightShattered(x: number, y: number, z: number): number {
    const highlands = fbm3D(this.n1, x * 1.1, y * 1.1, z * 1.1, 4) * 28 + 16;

    // Primary large impact basins
    voronoiSphere3D(this.seedHash ^ 0xdeadbeef, x, y, z, 2.4, voronoiScratch, 0.82);
    const cLarge = craterProfile(voronoiScratch[0], 0.38, 0.18, 32, 18);

    // Secondary medium craters
    voronoiSphere3D(this.seedHash ^ 0x76543210, x, y, z, 5.6, voronoiScratch, 0.85);
    const cMed = craterProfile(voronoiScratch[0], 0.34, 0.15, 16, 9);

    // Ridged rays & micro-craters
    const rays = ridgedFbm3D(this.n2, x * 4.2, y * 4.2, z * 4.2, 4, 2.0, 0.5, 2.2) * 18;

    let h = highlands + cLarge + cMed + rays - 8;
    return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, h));
  }

  /**
   * Moisture field in [0, 1] for biome variation and shader micro-patterns.
   */
  moistureAt(x: number, y: number, z: number): number {
    const m = fbm3D(this.n3, x * 2.8 + 5.1, y * 2.8 - 8.3, z * 2.8 + 2.7, 3);
    return sm01((m + 0.45) / 0.9);
  }

  /**
   * Temperature field in [0, 1] combining latitude (|y|) and local noise.
   */
  temperatureAt(x: number, y: number, z: number, h = 0): number {
    const lat = 1 - Math.abs(y) * 0.65;
    const altCool = Math.max(0, h) / 140;
    const local = fbm3D(this.n4, x * 3.1, y * 3.1, z * 3.1, 2) * 0.18;
    return sm01(lat - altCool + local);
  }

  /**
   * Forest / Flora density field in [0,1]: medium-frequency clusters so flora comes in woods
   * and glades rather than a uniform sprinkle. Same determinism contract as heightAt.
   */
  forestAt(x: number, y: number, z: number): number {
    const f = this.fbm(this.n2, x * 4.3 - 17.1, y * 4.3 + 9.4, z * 4.3 + 3.2, 3);
    return sm01((f + 0.05) / 0.55);
  }

  /**
   * Surface material for a column whose surface height is h meters (relative to sea level).
   * Optional unit normal (x, y, z) enables climate-aware biome materials while preserving
   * single-argument `surfaceMaterial(h)` backward compatibility.
   */
  surfaceMaterial(h: number, x = 0, y = 0, z = 1): MaterialId {
    switch (this.archetype) {
      case 'canyon': {
        if (h < -16) return MAT.SEABED;
        if (h < -11) return MAT.GRASS; // Oasis vegetation ring
        if (h < 6) return MAT.SAND;
        if (h < 62) return MAT.TERRACOTTA;
        return MAT.ROCK;
      }
      case 'volcanic': {
        if (h < -1.5) return MAT.MAGMA;
        if (h < 3.5) return MAT.BASALT;
        if (h < 52) {
          const v = this.n4(x * 7, y * 7, z * 7);
          return v > 0.58 ? MAT.MAGMA : MAT.BASALT;
        }
        if (h < 76) return MAT.ROCK;
        return MAT.CRYSTAL;
      }
      case 'cryo': {
        if (h < -2.2) return MAT.SEABED;
        if (h <= 3.2) return MAT.ICE;
        if (h < 42) return MAT.SNOW;
        if (h < 74) return MAT.ICE;
        return MAT.CRYSTAL;
      }
      case 'biolum': {
        if (h < -2.0) return MAT.SEABED;
        if (h <= 2.4) return MAT.SAND;
        if (h < 44) return MAT.MYCELIUM;
        if (h < 64) return MAT.TERRACOTTA;
        return MAT.CRYSTAL;
      }
      case 'shattered': {
        if (h < -14) return MAT.CRYSTAL; // Exposed crystal floor in deep impact craters
        if (h < 18) return MAT.BASALT;
        if (h < 52) return MAT.ROCK;
        return MAT.CRYSTAL;
      }
      case 'terran':
      default: {
        if (h < -2.2) return MAT.SEABED;
        if (h <= 2.2) return MAT.SAND;
        if (h < 46) return MAT.GRASS;
        if (h < 88) return MAT.ROCK;
        return MAT.SNOW;
      }
    }
  }

  /**
   * Subsurface soil/strata material immediately below the top cap (1..3 layers deep).
   */
  subsurfaceMaterial(topMat: MaterialId): MaterialId {
    switch (topMat) {
      case MAT.TERRACOTTA:
      case MAT.SAND:
        return this.archetype === 'canyon' ? MAT.TERRACOTTA : MAT.DIRT;
      case MAT.ICE:
      case MAT.SNOW:
        return this.archetype === 'cryo' ? MAT.ICE : MAT.ROCK;
      case MAT.BASALT:
      case MAT.MAGMA:
        return MAT.BASALT;
      case MAT.MYCELIUM:
        return MAT.DIRT;
      case MAT.CRYSTAL:
        return MAT.CRYSTAL;
      default:
        return MAT.DIRT;
    }
  }
}
