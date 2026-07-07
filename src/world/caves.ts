import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { WATER_SURFACE } from './layers';
import { hashString, mulberry32 } from '../util/prng';

export type NaturalVoidKind = 'arch' | 'dryCave' | 'seaCave';

export interface NaturalVoidSample {
  kind: NaturalVoidKind;
  depth: number;
  flooded: boolean;
  spring?: boolean;
}

export const NATURAL_VOID_SCAN_LAYERS = 24;

function sm01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

export class NaturalCaves {
  private readonly archNoise: NoiseFunction3D;
  private readonly caveNoise: NoiseFunction3D;
  private readonly chamberNoise: NoiseFunction3D;
  private readonly springNoise: NoiseFunction3D;

  constructor(seed: string) {
    const h = hashString(`${seed}:natural-caves`);
    this.archNoise = createNoise3D(mulberry32(h ^ 0x3c6ef372));
    this.caveNoise = createNoise3D(mulberry32(h ^ 0xa54ff53a));
    this.chamberNoise = createNoise3D(mulberry32(h ^ 0x510e527f));
    this.springNoise = createNoise3D(mulberry32(h ^ 0x9e3779b9));
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
    if (depth <= 0 || depth > 30) return null;
    const flooded = cellBottomRadius < WATER_SURFACE + 0.2;
    if (surfaceHeight < -3) return null;

    // Natural arches are shallow land cuts. They leave the surface cap intact and carve
    // a continuous passage a few layers below it, so slopes and valleys expose walkable
    // mouths instead of every low void becoming ocean.
    if (surfaceHeight > 5 && depth >= 1.2 && depth <= 7.6) {
      const band = Math.abs(this.archNoise(x * 5.4 + 1.7, y * 5.4 - 3.2, z * 5.4 + depth * 0.16));
      const relief = sm01((surfaceHeight - 5) / 22);
      const gate = this.chamberNoise(x * 1.8 - 4.4, y * 1.8 + 8.1, z * 1.8 - 1.6);
      const roof = sm01((depth - 1.0) / 1.2) * sm01((7.8 - depth) / 1.8);
      if (band < 0.115 + relief * 0.035 && gate > -0.45 && roof > 0.08) {
        return { kind: 'arch', depth, flooded: false };
      }
    }

    // Dry caves sit above sea level and start deeper than arches. They are sparse pockets
    // joined by noisy tubes so mining or walking into one feels like a discovered place,
    // while the water rule keeps below-sea voids classified separately.
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

    // Sea caves are allowed only around shorelines and below the water surface. The global
    // water sphere then visually floods them, instead of every arbitrary dry cave becoming
    // an underwater pocket when the player digs down.
    if (flooded && surfaceHeight > -2.5 && surfaceHeight < 8 && depth >= 2.5 && depth <= 14) {
      const tube = Math.abs(this.caveNoise(x * 5.0 - 9.4, y * 5.0 + depth * 0.11, z * 5.0 + 2.2));
      const gate = this.archNoise(x * 2.5 + 6.5, y * 2.5 - 1.1, z * 2.5 + 8.7);
      if (tube < 0.18 && gate > -0.3) return { kind: 'seaCave', depth, flooded: true };
    }

    return null;
  }
}
