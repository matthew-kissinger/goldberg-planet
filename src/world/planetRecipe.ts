/**
 * Planetary Recipes, The 12 Pentagon Wonders, and Biome Resource Yields.
 *
 * Bridges Goldberg polyhedron topology (`tileId 0..11` = the 12 pentagons) with
 * geological landmarks, thermal updrafts, and survival-automation resource extraction.
 */

import type { Goldberg } from '../geo/goldberg';
import { MAT, type MaterialId } from './terrain';
import type { PentagonWonderKind, PlanetConfig, PlanetResourceId } from './planetConfig';

export interface PentagonWonderEvaluation {
  /** 0 = center pentagon (tile 0..11), 1 = immediate 5-neighbor ring, -1 = normal tile */
  ringLevel: -1 | 0 | 1;
  /** Which of the 12 pentagons (0..11) this tile belongs to, or -1 */
  pentagonId: number;
  /** Elevation delta in meters sculpted into the terrain column */
  heightDelta: number;
  /** Optional material override for the wonder's cap/terrace */
  materialOverride: MaterialId | null;
  /** Upward vertical air/harmonic boost (m/s^2) when flying or jumping over this tile */
  updraftAccel: number;
  /** Automation yield & power multiplier (2.5x on pentagon cores, 1.5x on rim, 1.0x elsewhere) */
  automationMultiplier: number;
}

/**
 * Determine whether `tileId` is one of the 12 Goldberg pentagons (`0..11`) or in its
 * immediate 5-neighbor amphitheater ring.
 */
export function classifyPentagonTile(geo: Goldberg, tileId: number): { ringLevel: -1 | 0 | 1; pentagonId: number } {
  if (tileId >= 0 && tileId < 12) {
    return { ringLevel: 0, pentagonId: tileId };
  }
  const deg = geo.degrees[tileId];
  const base = tileId * 6;
  for (let e = 0; e < deg; e++) {
    const n = geo.nbrs[base + e];
    if (n >= 0 && n < 12) {
      return { ringLevel: 1, pentagonId: n };
    }
  }
  return { ringLevel: -1, pentagonId: -1 };
}

/**
 * Evaluate the physical and gameplay properties of a tile with respect to the planet's
 * 12 Pentagon Wonders ("The Twelve Bells").
 */
export function evaluatePentagonWonder(
  geo: Goldberg,
  tileId: number,
  wonderKind: PentagonWonderKind,
): PentagonWonderEvaluation {
  const { ringLevel, pentagonId } = classifyPentagonTile(geo, tileId);
  if (ringLevel === -1) {
    return {
      ringLevel: -1,
      pentagonId: -1,
      heightDelta: 0,
      materialOverride: null,
      updraftAccel: 0,
      automationMultiplier: 1.0,
    };
  }

  switch (wonderKind) {
    case 'resonance_monolith':
      return {
        ringLevel,
        pentagonId,
        heightDelta: ringLevel === 0 ? 7.5 : 2.5,
        materialOverride: ringLevel === 0 ? MAT.CRYSTAL : MAT.BASALT,
        updraftAccel: ringLevel === 0 ? 26 : 12,
        automationMultiplier: ringLevel === 0 ? 2.5 : 1.5,
      };
    case 'bell_sinkhole':
      return {
        ringLevel,
        pentagonId,
        heightDelta: ringLevel === 0 ? -5.0 : 3.75,
        materialOverride: ringLevel === 0 ? MAT.CRYSTAL : MAT.TERRACOTTA,
        updraftAccel: ringLevel === 0 ? 30 : 14,
        automationMultiplier: ringLevel === 0 ? 2.5 : 1.5,
      };
    case 'caldera_vent':
      return {
        ringLevel,
        pentagonId,
        heightDelta: ringLevel === 0 ? -2.5 : 5.0,
        materialOverride: ringLevel === 0 ? MAT.MAGMA : MAT.BASALT,
        updraftAccel: ringLevel === 0 ? 34 : 16,
        automationMultiplier: ringLevel === 0 ? 2.5 : 1.5,
      };
    case 'geyser_amphitheater':
    default:
      return {
        ringLevel,
        pentagonId,
        heightDelta: ringLevel === 0 ? 3.75 : 1.25,
        materialOverride: ringLevel === 0 ? MAT.CRYSTAL : null,
        updraftAccel: ringLevel === 0 ? 24 : 10,
        automationMultiplier: ringLevel === 0 ? 2.5 : 1.5,
      };
  }
}

export interface TileResourceYield {
  resource: PlanetResourceId;
  unitsPerMinute: number;
  isPentagonBoosted: boolean;
}

/**
 * Computes what resource an Auto-Extractor harvests when placed on `tileId` of `config`,
 * factoring in surface material and Pentagon Wonder harmonic amplification.
 */
export function queryTileResourceYield(
  geo: Goldberg,
  config: PlanetConfig,
  tileId: number,
  surfaceMat: MaterialId,
): TileResourceYield {
  const wonder = evaluatePentagonWonder(geo, tileId, config.pentagonWonder);
  const mult = wonder.automationMultiplier;

  let resource: PlanetResourceId = config.survival.primaryResource;
  if (surfaceMat === MAT.CRYSTAL) {
    resource = 'crystal';
  } else if (surfaceMat === MAT.MAGMA) {
    resource = 'magma_core';
  } else if (surfaceMat === MAT.ICE) {
    resource = config.archetype === 'cryo' ? 'cryo_core' : 'stone';
  } else if (surfaceMat === MAT.MYCELIUM) {
    resource = 'mycelium_spore';
  } else if (surfaceMat === MAT.TERRACOTTA || surfaceMat === MAT.BASALT) {
    resource = config.archetype === 'canyon' || config.archetype === 'volcanic' ? 'alloy_ore' : 'stone';
  } else if (surfaceMat === MAT.ROCK || surfaceMat === MAT.SNOW) {
    resource = config.survival.secondaryResource;
  }

  return {
    resource,
    unitsPerMinute: Math.round(15 * mult),
    isPentagonBoosted: wonder.ringLevel >= 0,
  };
}
