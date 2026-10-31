import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { PLANET_RADIUS, WATER_SURFACE } from './layers';
import { hashString, mulberry32 } from '../util/prng';

export type NaturalVoidKind = 'arch' | 'dryCave' | 'seaCave' | 'abyssalCavern';

export interface NaturalVoidSample {
  kind: NaturalVoidKind;
  depth: number;
  flooded: boolean;
  spring?: boolean;
  crystalVein?: boolean;
}

export interface SkyIslandSample {
  /** Top elevation of the floating island in meters above sea level (planetRadius) */
  topHeight: number;
  /** Bottom elevation of the floating island's tapered rock underside in meters above sea level */
  bottomHeight: number;
  /** Whether this tile is on the outer rim of the floating island (for waterfalls) */
  isRim: boolean;
}

export const NATURAL_VOID_SCAN_LAYERS = 36;

function sm01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

export class NaturalCaves {
  readonly planetRadius: number;
  readonly waterSurface: number;
  private readonly archNoise: NoiseFunction3D;
  private readonly caveNoise: NoiseFunction3D;
  private readonly chamberNoise: NoiseFunction3D;
  private readonly springNoise: NoiseFunction3D;
  private readonly skyClusterNoise: NoiseFunction3D;
  private readonly skyDetailNoise: NoiseFunction3D;

  constructor(seed: string, planetRadius = PLANET_RADIUS, waterSurface = WATER_SURFACE) {
    this.planetRadius = planetRadius;
    this.waterSurface = waterSurface;
    const h = hashString(`${seed}:natural-caves`);
    this.archNoise = createNoise3D(mulberry32(h ^ 0x3c6ef372));
    this.caveNoise = createNoise3D(mulberry32(h ^ 0xa54ff53a));
    this.chamberNoise = createNoise3D(mulberry32(h ^ 0x510e527f));
    this.springNoise = createNoise3D(mulberry32(h ^ 0x9e3779b9));
    this.skyClusterNoise = createNoise3D(mulberry32(h ^ 0x7f4a7c15));
    this.skyDetailNoise = createNoise3D(mulberry32(h ^ 0x27d4eb2f));
  }

  /**
   * Evaluate whether unit normal `(x, y, z)` hosts a Volumetric Floating Sky-Island
   * suspended high above the ground (`+44 m .. +78 m` above sea level).
   */
  sampleSkyIsland(x: number, y: number, z: number, surfaceHeight: number): SkyIslandSample | null {
    // Keep floating islands over basins, lowlands, and mid-elevation hills so there is always >= 24m air gap
    if (surfaceHeight > 30) return null;

    const macro = this.skyClusterNoise(x * 2.6 + 3.1, y * 2.6 - 4.7, z * 2.6 + 1.9);
    const detail = this.skyDetailNoise(x * 7.8 - 2.2, y * 7.8 + 5.4, z * 7.8 - 6.1);
    const score = macro + detail * 0.22;

    // Threshold creates distinct multi-hex floating island archipelagos across the sky
    if (score < 0.56) return null;

    const coreStrength = sm01((score - 0.56) / 0.32);
    const baseAlt = 52 + Math.round(this.skyClusterNoise(x * 1.4, y * 1.4, z * 1.4) * 14);
    const topHeight = baseAlt + Math.round(coreStrength * 4.5);
    // Inverted stalactite/cone underside: thicker in the center (up to 16m thick), thinner at the rim (3m)
    const thickness = 3.0 + coreStrength * 12.5 + Math.max(0, detail) * 3.5;
    const bottomHeight = topHeight - thickness;

    if (bottomHeight - surfaceHeight < 20) return null;

    return {
      topHeight,
      bottomHeight,
      isRim: score < 0.62,
    };
  }

  sample(
    x: number,
    y: number,
    z: number,
    surfaceHeight: number,
    topRadius: number,
    cellTopRadius: number,
    cellBottomRadius: number,
  ): NaturalVoidSample | null {
    const depth = Math.max(0, topRadius - cellTopRadius);
    if (depth <= 0 || depth > 45) return null;
    const flooded = cellBottomRadius < this.waterSurface + 0.2;
    if (surfaceHeight < -3) return null;

    if (surfaceHeight > 5 && depth >= 1.2 && depth <= 7.6) {
      const band = Math.abs(this.archNoise(x * 5.4 + 1.7, y * 5.4 - 3.2, z * 5.4 + depth * 0.16));
      const relief = sm01((surfaceHeight - 5) / 22);
      const gate = this.chamberNoise(x * 1.8 - 4.4, y * 1.8 + 8.1, z * 1.8 - 1.6);
      const roof = sm01((depth - 1.0) / 1.2) * sm01((7.8 - depth) / 1.8);
      if (band < 0.115 + relief * 0.035 && gate > -0.45 && roof > 0.08) {
        return { kind: 'arch', depth, flooded: false };
      }
    }

    if (!flooded && surfaceHeight > 7 && depth >= 6 && depth <= 23) {
      const tube = Math.abs(this.caveNoise(x * 4.2 + depth * 0.09, y * 4.2 - 2.3, z * 4.2 + 5.7));
      const chamber = this.chamberNoise(x * 7.1 - depth * 0.025, y * 7.1 + 3.9, z * 7.1 - 6.5);
      const deepMask = sm01((depth - 5.5) / 3.2) * sm01((24 - depth) / 5);
      if ((tube < 0.14 || chamber > 0.58) && deepMask > 0.1) {
        const seep = this.springNoise(x * 6.2 + depth * 0.07, y * 6.2 - 5.1, z * 6.2 + 2.8);
        const spring = depth >= 9 && (seep > 0.48 || (chamber > 0.7 && seep > 0.18));
        return { kind: 'dryCave', depth, flooded: false, spring };
      }
    }

    // Deep Abyssal Cathedral Caverns (depth 18m .. 44m, massive high-ceiling chambers & crystal grottos)
    if (!flooded && surfaceHeight > 10 && depth >= 18 && depth <= 44) {
      const cathedral = this.chamberNoise(x * 3.4 + 2.1, y * 3.4 - 1.8, z * 3.4 + depth * 0.035);
      const tunnel = Math.abs(this.caveNoise(x * 2.9 - 4.2, y * 2.9 + 3.1, z * 2.9 + depth * 0.06));
      const abyssMask = sm01((depth - 17.5) / 4.0) * sm01((44.5 - depth) / 4.5);
      if ((cathedral > 0.42 || tunnel < 0.13) && abyssMask > 0.12) {
        const seep = this.springNoise(x * 5.1, y * 5.1, z * 5.1 + depth * 0.08);
        return {
          kind: 'abyssalCavern',
          depth,
          flooded: false,
          spring: seep > 0.35,
          crystalVein: cathedral > 0.56,
        };
      }
    }

    if (flooded && surfaceHeight > -2.5 && surfaceHeight < 8 && depth >= 2.5 && depth <= 14) {
      const tube = Math.abs(this.caveNoise(x * 5.0 - 9.4, y * 5.0 + depth * 0.11, z * 5.0 + 2.2));
      const gate = this.archNoise(x * 2.5 + 6.5, y * 2.5 - 1.1, z * 2.5 + 8.7);
      if (tube < 0.18 && gate > -0.3) return { kind: 'seaCave', depth, flooded: true };
    }

    return null;
  }
}
