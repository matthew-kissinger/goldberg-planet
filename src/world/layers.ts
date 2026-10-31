/**
 * Global radial layer grid, shared by every tile on a planet so walls between neighboring
 * columns always line up exactly.
 *
 * Cell k occupies radii [bounds[k+1], bounds[k]]. Layer 0 is the build ceiling.
 * Near-surface cells are uniform (fine) for mining/building feel; below the surface band,
 * thickness grows geometrically — resolution decreases with depth, so a full column is
 * O(log R) cells and total addressable volume scales with surface tile count, not R^3.
 */

import type { PlanetConfig } from './planetConfig';

export const PLANET_RADIUS = 900;
/** sea level radius; oceans render just below a layer boundary to avoid z-fighting beach tops */
export const SEA_RADIUS = PLANET_RADIUS;
export const WATER_SURFACE = SEA_RADIUS - 0.35;
/** thickness of a near-surface cell, meters */
export const CELL_H = 1.25;
/** uniform fine cells from the build ceiling down: covers +130 (peaks+headroom) to -55 (below seabed) */
const UNIFORM_LAYERS = 148;
/** build headroom above the highest possible terrain */
export const BUILD_CEILING = PLANET_RADIUS + 130;
const DEPTH_GROWTH = 1.5;
const CORE_RADIUS = 60;

export interface Layers {
  /** L+1 radii, strictly decreasing; bounds[0] = buildCeiling, bounds[L] = coreRadius */
  bounds: Float64Array;
  L: number;
  uniformLayers: number;
  planetRadius: number;
  waterSurface: number;
  buildCeiling: number;
  cellH: number;
  layerOfRadius(r: number): number;
  topRadius(k: number): number;
  bottomRadius(k: number): number;
  thickness(k: number): number;
}

export function buildLayers(
  config?: Partial<Pick<PlanetConfig, 'radius' | 'layerH' | 'waterSurfaceOffset'>>,
): Layers {
  const planetRadius = config?.radius ?? PLANET_RADIUS;
  const cellH = config?.layerH ?? CELL_H;
  const waterSurfaceOffset = config?.waterSurfaceOffset ?? -0.35;
  const waterSurface = planetRadius + waterSurfaceOffset;
  const buildCeiling = planetRadius + 130;
  const coreRadius = Math.max(30, Math.min(CORE_RADIUS, Math.floor(planetRadius * 0.12)));

  const b: number[] = [buildCeiling];
  let r = buildCeiling;
  for (let k = 0; k < UNIFORM_LAYERS; k++) {
    r -= cellH;
    b.push(r);
  }
  let t = cellH * DEPTH_GROWTH;
  while (r - t > coreRadius + 40) {
    r -= t;
    b.push(r);
    t *= DEPTH_GROWTH;
  }
  b.push(coreRadius); // final bedrock cell (unmineable)
  const bounds = new Float64Array(b);
  const L = bounds.length - 1;
  const uniformBottom = bounds[UNIFORM_LAYERS];

  const layerOfRadius = (radius: number): number => {
    if (radius >= bounds[0]) return -1; // above build ceiling
    if (radius <= bounds[L]) return L - 1;
    if (radius >= uniformBottom) {
      const k = Math.floor((bounds[0] - radius) / cellH);
      return Math.min(k, UNIFORM_LAYERS - 1);
    }
    // few coarse layers: linear scan
    for (let k = UNIFORM_LAYERS; k < L; k++) {
      if (radius >= bounds[k + 1]) return k;
    }
    return L - 1;
  };

  return {
    bounds,
    L,
    uniformLayers: UNIFORM_LAYERS,
    planetRadius,
    waterSurface,
    buildCeiling,
    cellH,
    layerOfRadius,
    topRadius: (k) => bounds[k],
    bottomRadius: (k) => bounds[k + 1],
    thickness: (k) => bounds[k] - bounds[k + 1],
  };
}
