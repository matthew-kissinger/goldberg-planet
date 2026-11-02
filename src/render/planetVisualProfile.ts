/** Small immutable render recipes. No Three imports, terrain sampling or global
 * active-world state: workers may consume the same planet identity safely. */
import type { PlanetArchetype, PlanetConfig } from '../world/planetConfig';

export interface PlanetVisualProfile {
  lighting: { sun: number; sky: number; ground: number; ambient: number;
    sunStrength: number; dayFill: number; nightFill: number; ambientStrength: number; shadow: number; exposure: number };
  sky: { scaleHeight: number; opticalDepth: number; cloudOpacity: number; cloudContrast: number; night: readonly [number, number, number]; cloudLow: number; cloudHigh: number; cloudSpeed: number; forwardHaze: number };
  surface: { roughness: number; wetResponse: number; grain: number; bump: number; macro: number;
    wallShade: number; strata: number; radialStrata: number; hazeStart: number; hazeEnd: number; haze: number;
    emission: readonly [number, number, number]; emissionGrain: number };
  ocean: { amplitude: number; speed: number; roughness: number; foam: number; opacity: number; crust: number; shorelineGlow: number };
}

export const PLANET_VISUAL_PROFILES: Readonly<Record<PlanetArchetype, PlanetVisualProfile>> = {
  // Exact established Aurelia constants; new world profiles do not retune home.
  terran: {
    lighting: { sun: 0xffedd1, sky: 0xc4dce6, ground: 0x71664f, ambient: 0xe4e0d2, sunStrength: 2.6, dayFill: 1.2, nightFill: .28, ambientStrength: .12, shadow: .78, exposure: 1.12 },
    sky: { scaleHeight: 46, opticalDepth: .161, cloudOpacity: .38, cloudContrast: 1, night: [.05, .08, .16], cloudLow: 125, cloudHigh: 165, cloudSpeed: 1, forwardHaze: 0 },
    surface: { roughness: .88, wetResponse: .32, grain: .28, bump: .055, macro: .06, wallShade: .16, strata: .035, radialStrata: 0,
      hazeStart: 220, hazeEnd: 2200, haze: .55, emission: [1.25, 1.25, 1.25], emissionGrain: 0 },
    ocean: { amplitude: 1, speed: 1, roughness: .09, foam: .5, opacity: .82, crust: 0, shorelineGlow: 0 },
  },
  shattered: {
    lighting: { sun: 0xfff7e9, sky: 0x8d9bb0, ground: 0x5b565b, ambient: 0xc9c9ce, sunStrength: 3.1, dayFill: .42, nightFill: .1, ambientStrength: .1, shadow: .9, exposure: 1.08 },
    sky: { scaleHeight: 18, opticalDepth: 0, cloudOpacity: 0, cloudContrast: 0, night: [.015, .018, .03], cloudLow: 125, cloudHigh: 165, cloudSpeed: 0, forwardHaze: 0 },
    surface: { roughness: .96, wetResponse: .03, grain: .36, bump: .07, macro: .035, wallShade: .11, strata: .025, radialStrata: 1,
      hazeStart: 220, hazeEnd: 2200, haze: 0, emission: [1, .12, .08], emissionGrain: .75 },
    ocean: { amplitude: 0, speed: 0, roughness: .75, foam: 0, opacity: 1, crust: 0, shorelineGlow: 0 },
  },
  canyon: {
    lighting: { sun: 0xffdfac, sky: 0xe7c995, ground: 0x9a6846, ambient: 0xe6c9a2, sunStrength: 2.5, dayFill: 1.08, nightFill: .27, ambientStrength: .14, shadow: .66, exposure: 1.1 },
    sky: { scaleHeight: 58, opticalDepth: 2, cloudOpacity: .14, cloudContrast: .4, night: [.1, .065, .045], cloudLow: 90, cloudHigh: 135, cloudSpeed: .55, forwardHaze: .18 },
    surface: { roughness: .94, wetResponse: .2, grain: .25, bump: .045, macro: .035, wallShade: .12, strata: .15, radialStrata: 1,
      hazeStart: 100, hazeEnd: 1450, haze: .58, emission: [.9, .18, .08], emissionGrain: .75 },
    ocean: { amplitude: .45, speed: .58, roughness: .2, foam: .2, opacity: .88, crust: 0, shorelineGlow: 0 },
  },
  cryo: {
    lighting: { sun: 0xe8f3ff, sky: 0xc5ddf4, ground: 0x7795ac, ambient: 0xcddded, sunStrength: 1.8, dayFill: 1.7, nightFill: .42, ambientStrength: .2, shadow: .47, exposure: 1.06 },
    sky: { scaleHeight: 72, opticalDepth: 1.45, cloudOpacity: .23, cloudContrast: .6, night: [.055, .09, .15], cloudLow: 95, cloudHigh: 150, cloudSpeed: .3, forwardHaze: .08 },
    surface: { roughness: .95, wetResponse: .23, grain: .15, bump: .028, macro: .025, wallShade: .08, strata: .025, radialStrata: 1,
      hazeStart: 180, hazeEnd: 1900, haze: .52, emission: [.7, .18, .06], emissionGrain: .8 },
    ocean: { amplitude: .28, speed: .3, roughness: .27, foam: .14, opacity: .9, crust: 0, shorelineGlow: 0 },
  },
  volcanic: {
    lighting: { sun: 0xffd9b1, sky: 0xb7a599, ground: 0x75635c, ambient: 0xd1b5a5, sunStrength: 2.15, dayFill: 1.28, nightFill: .4, ambientStrength: .24, shadow: .6, exposure: 1.14 },
    sky: { scaleHeight: 54, opticalDepth: 1.8, cloudOpacity: .16, cloudContrast: .4, night: [.09, .045, .035], cloudLow: 70, cloudHigh: 115, cloudSpeed: .4, forwardHaze: .16 },
    surface: { roughness: .91, wetResponse: .08, grain: .25, bump: .07, macro: .025, wallShade: .07, strata: .055, radialStrata: 1,
      hazeStart: 85, hazeEnd: 1200, haze: .48, emission: [2, .15, .05], emissionGrain: .85 },
    ocean: { amplitude: .18, speed: .12, roughness: .83, foam: 0, opacity: 1, crust: 1, shorelineGlow: 0 },
  },
  biolum: {
    lighting: { sun: 0xe8d7ef, sky: 0xb4a6cc, ground: 0x51776e, ambient: 0xc6c0dc, sunStrength: 1.8, dayFill: 1.4, nightFill: .42, ambientStrength: .18, shadow: .54, exposure: 1.12 },
    sky: { scaleHeight: 68, opticalDepth: 1.4, cloudOpacity: .18, cloudContrast: .55, night: [.075, .045, .11], cloudLow: 105, cloudHigh: 155, cloudSpeed: .18, forwardHaze: .06 },
    surface: { roughness: .8, wetResponse: .34, grain: .2, bump: .04, macro: .025, wallShade: .09, strata: .035, radialStrata: 1,
      hazeStart: 140, hazeEnd: 1700, haze: .5, emission: [.8, .28, .25], emissionGrain: .9 },
    ocean: { amplitude: .55, speed: .45, roughness: .16, foam: .28, opacity: .85, crust: 0, shorelineGlow: 1 },
  },
};

export function planetVisualProfile(config: Pick<PlanetConfig, 'archetype'>): PlanetVisualProfile {
  return PLANET_VISUAL_PROFILES[config.archetype];
}
export function hasAtmosphere(config: Pick<PlanetConfig, 'atmosphere'>): boolean {
  return config.atmosphere.density > .001;
}
