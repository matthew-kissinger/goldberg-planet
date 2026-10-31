/**
 * Planetary configuration & archetype definitions for multi-planet solar systems.
 *
 * Centralizes radius, layer heights, gravity, atmospheric scattering, ocean chemistry,
 * ring belt geometry, flora types, survival hazards, ecosystem resources, and the
 * 12 Pentagon Wonders per world.
 */

export type PlanetArchetype =
  | 'terran'
  | 'canyon'
  | 'volcanic'
  | 'cryo'
  | 'biolum'
  | 'shattered';

export type FloraArchetype =
  | 'conifer'
  | 'broadleaf'
  | 'palm'
  | 'weeping_willow'
  | 'cactus'
  | 'fungal'
  | 'spore_bulb'
  | 'crystal_spire'
  | 'ice_willow';

export type PentagonWonderKind =
  | 'geyser_amphitheater'
  | 'resonance_monolith'
  | 'bell_sinkhole'
  | 'caldera_vent';

export type WeatherKind = 'none' | 'snow' | 'embers' | 'spores' | 'dust';

export type EnvironmentalHazard =
  | 'none'
  | 'vacuum'
  | 'dust_storm'
  | 'cryo_freeze'
  | 'extreme_heat'
  | 'spore_mist';

export type PlanetResourceId =
  | 'wood'
  | 'stone'
  | 'crystal'
  | 'alloy_ore'
  | 'cryo_core'
  | 'magma_core'
  | 'mycelium_spore';

export interface PlanetRingConfig {
  innerRadius: number;
  outerRadius: number;
  /** Unit normal of the ring plane in planet-local space */
  normal: [number, number, number];
  colorInner: [number, number, number];
  colorOuter: [number, number, number];
  opacity: number;
}

export interface PlanetAtmosphereConfig {
  density: number;
  thickness: number;
  zenithColor: [number, number, number];
  horizonColor: [number, number, number];
  sunsetColor: [number, number, number];
  cloudCoverage: number;
  cloudTint: [number, number, number];
  weatherKind: WeatherKind;
}

export interface PlanetOceanConfig {
  hasOcean: boolean;
  kind: 'water' | 'magma' | 'cryo_brine' | 'biolagoon';
  shallowColor: [number, number, number];
  deepColor: [number, number, number];
  foamColor: [number, number, number];
  emissiveIntensity: number;
}

export interface PlanetSurvivalConfig {
  hazard: EnvironmentalHazard;
  /** Suit/hull shield drain per second when unshielded and outside a powered dome */
  hazardDrainPerSec: number;
  /** Required tech tier (0..3) to negate the environmental hazard passively */
  requiredSuitTier: number;
  primaryResource: PlanetResourceId;
  secondaryResource: PlanetResourceId;
}

export interface PlanetConfig {
  id: string;
  name: string;
  subtitle: string;
  seed: string;
  archetype: PlanetArchetype;
  radius: number;
  heightMax: number;
  heightMin: number;
  layerH: number;
  /** Offset of liquid surface relative to radius (e.g. -0.35m) */
  waterSurfaceOffset: number;
  /** Surface gravitational acceleration in m/s^2 */
  gravity: number;
  /** Altitude AGL (meters) above which atmospheric flight enters space cruise */
  karmanAGL: number;
  /** f64 position in solar system coordinates (meters) */
  solarPosition: [number, number, number];
  atmosphere: PlanetAtmosphereConfig;
  ocean: PlanetOceanConfig;
  rings: PlanetRingConfig | null;
  floraDensity: number;
  primaryFlora: FloraArchetype;
  secondaryFlora: FloraArchetype;
  pentagonWonder: PentagonWonderKind;
  survival: PlanetSurvivalConfig;
  /** Whether this planet generates volumetric floating sky-island archipelagos */
  hasFloatingIslands?: boolean;
  /** Whether this planet traces gravity-driven downhill rivers & waterfalls */
  hasFlowingRivers?: boolean;
}

/** Default Terran Cradle planet configuration matching the classic 900m planet metrics. */
export function makeDefaultPlanetConfig(seed = 'planet-one'): PlanetConfig {
  return {
    id: 'planet-0',
    name: 'Aurelia',
    subtitle: 'Terran Cradle World',
    seed,
    archetype: 'terran',
    radius: 900,
    heightMax: 96,
    heightMin: -60,
    layerH: 1.25,
    waterSurfaceOffset: -0.35,
    gravity: 14,
    karmanAGL: 280,
    solarPosition: [0, 0, 0],
    atmosphere: {
      density: 1.0,
      thickness: 220,
      zenithColor: [0.16, 0.42, 0.82],
      horizonColor: [0.62, 0.82, 0.96],
      sunsetColor: [0.98, 0.52, 0.24],
      cloudCoverage: 1.0,
      cloudTint: [0.98, 0.97, 0.95],
      weatherKind: 'none',
    },
    ocean: {
      hasOcean: true,
      kind: 'water',
      shallowColor: [0.14, 0.62, 0.68],
      deepColor: [0.03, 0.16, 0.34],
      foamColor: [0.92, 0.96, 0.98],
      emissiveIntensity: 0.0,
    },
    rings: null,
    floraDensity: 0.45,
    primaryFlora: 'conifer',
    secondaryFlora: 'broadleaf',
    pentagonWonder: 'geyser_amphitheater',
    survival: {
      hazard: 'none',
      hazardDrainPerSec: 0,
      requiredSuitTier: 0,
      primaryResource: 'wood',
      secondaryResource: 'stone',
    },
  };
}

/** Generate a complete, deterministic multi-planet solar system from a universe seed. */
export function buildSolarSystemConfigs(universeSeed: string): PlanetConfig[] {
  const starter = makeDefaultPlanetConfig(universeSeed);
  starter.hasFloatingIslands = true;
  starter.hasFlowingRivers = true;

  const shatteredMoon: PlanetConfig = {
    id: 'planet-1',
    name: 'Vespera Shard',
    subtitle: 'Airless Cratered Crystal Moon',
    seed: `${universeSeed}:moon-vespera`,
    archetype: 'shattered',
    radius: 420,
    heightMax: 72,
    heightMin: -45,
    layerH: 1.25,
    waterSurfaceOffset: -9999,
    gravity: 5.5,
    karmanAGL: 130,
    solarPosition: [3600, 950, -2800],
    atmosphere: {
      density: 0.08,
      thickness: 75,
      zenithColor: [0.02, 0.03, 0.08],
      horizonColor: [0.22, 0.32, 0.58],
      sunsetColor: [0.55, 0.38, 0.85],
      cloudCoverage: 0.0,
      cloudTint: [0.8, 0.85, 1.0],
      weatherKind: 'none',
    },
    ocean: {
      hasOcean: false,
      kind: 'water',
      shallowColor: [0.1, 0.2, 0.3],
      deepColor: [0.05, 0.1, 0.2],
      foamColor: [0.8, 0.9, 1.0],
      emissiveIntensity: 0.0,
    },
    rings: null,
    floraDensity: 0.22,
    primaryFlora: 'crystal_spire',
    secondaryFlora: 'crystal_spire',
    pentagonWonder: 'resonance_monolith',
    hasFloatingIslands: true,
    hasFlowingRivers: false,
    survival: {
      hazard: 'vacuum',
      hazardDrainPerSec: 2.5,
      requiredSuitTier: 1,
      primaryResource: 'crystal',
      secondaryResource: 'stone',
    },
  };

  const ringedCanyon: PlanetConfig = {
    id: 'planet-2',
    name: 'Khoros Mesa',
    subtitle: 'Ringed Red-Rock Canyon World',
    seed: `${universeSeed}:canyon-khoros`,
    archetype: 'canyon',
    radius: 760,
    heightMax: 95,
    heightMin: -40,
    layerH: 1.25,
    waterSurfaceOffset: -18.35,
    gravity: 11.5,
    karmanAGL: 240,
    solarPosition: [-5800, -600, -4900],
    atmosphere: {
      density: 0.72,
      thickness: 190,
      zenithColor: [0.48, 0.26, 0.18],
      horizonColor: [0.92, 0.64, 0.42],
      sunsetColor: [1.0, 0.38, 0.16],
      cloudCoverage: 0.35,
      cloudTint: [0.96, 0.84, 0.72],
      weatherKind: 'dust',
    },
    ocean: {
      hasOcean: true,
      kind: 'water',
      shallowColor: [0.18, 0.68, 0.58],
      deepColor: [0.06, 0.28, 0.32],
      foamColor: [0.94, 0.90, 0.82],
      emissiveIntensity: 0.0,
    },
    rings: {
      innerRadius: 1080,
      outerRadius: 1680,
      normal: [0.22, 0.94, -0.26],
      colorInner: [0.88, 0.66, 0.46],
      colorOuter: [0.58, 0.76, 0.88],
      opacity: 0.78,
    },
    floraDensity: 0.26,
    primaryFlora: 'cactus',
    secondaryFlora: 'palm',
    pentagonWonder: 'bell_sinkhole',
    hasFloatingIslands: true,
    hasFlowingRivers: true,
    survival: {
      hazard: 'dust_storm',
      hazardDrainPerSec: 1.8,
      requiredSuitTier: 1,
      primaryResource: 'alloy_ore',
      secondaryResource: 'wood',
    },
  };

  const cryoSpire: PlanetConfig = {
    id: 'planet-3',
    name: 'Nivara Spire',
    subtitle: 'Cryo-Glacial World',
    seed: `${universeSeed}:cryo-nivara`,
    archetype: 'cryo',
    radius: 680,
    heightMax: 92,
    heightMin: -55,
    layerH: 1.25,
    waterSurfaceOffset: -0.35,
    gravity: 10.0,
    karmanAGL: 220,
    solarPosition: [6900, -1100, 5400],
    atmosphere: {
      density: 0.92,
      thickness: 185,
      zenithColor: [0.10, 0.32, 0.64],
      horizonColor: [0.68, 0.92, 0.98],
      sunsetColor: [0.42, 0.86, 0.95],
      cloudCoverage: 0.65,
      cloudTint: [0.90, 0.97, 1.0],
      weatherKind: 'snow',
    },
    ocean: {
      hasOcean: true,
      kind: 'cryo_brine',
      shallowColor: [0.26, 0.78, 0.92],
      deepColor: [0.04, 0.18, 0.42],
      foamColor: [0.95, 0.99, 1.0],
      emissiveIntensity: 0.12,
    },
    rings: null,
    floraDensity: 0.30,
    primaryFlora: 'ice_willow',
    secondaryFlora: 'crystal_spire',
    pentagonWonder: 'geyser_amphitheater',
    hasFloatingIslands: false,
    hasFlowingRivers: true,
    survival: {
      hazard: 'cryo_freeze',
      hazardDrainPerSec: 4.0,
      requiredSuitTier: 2,
      primaryResource: 'cryo_core',
      secondaryResource: 'crystal',
    },
  };

  const volcanicCaldera: PlanetConfig = {
    id: 'planet-4',
    name: 'Pyraxis',
    subtitle: 'Volcanic Caldera & Basalt World',
    seed: `${universeSeed}:volcanic-pyraxis`,
    archetype: 'volcanic',
    radius: 620,
    heightMax: 88,
    heightMin: -48,
    layerH: 1.25,
    waterSurfaceOffset: -0.35,
    gravity: 15.5,
    karmanAGL: 210,
    solarPosition: [-4400, 1450, 6800],
    atmosphere: {
      density: 1.15,
      thickness: 175,
      zenithColor: [0.18, 0.08, 0.08],
      horizonColor: [0.85, 0.32, 0.12],
      sunsetColor: [1.0, 0.55, 0.10],
      cloudCoverage: 0.75,
      cloudTint: [0.36, 0.28, 0.26],
      weatherKind: 'embers',
    },
    ocean: {
      hasOcean: true,
      kind: 'magma',
      shallowColor: [1.0, 0.48, 0.08],
      deepColor: [0.52, 0.08, 0.02],
      foamColor: [1.0, 0.86, 0.32],
      emissiveIntensity: 1.45,
    },
    rings: null,
    floraDensity: 0.18,
    primaryFlora: 'crystal_spire',
    secondaryFlora: 'fungal',
    pentagonWonder: 'caldera_vent',
    survival: {
      hazard: 'extreme_heat',
      hazardDrainPerSec: 5.0,
      requiredSuitTier: 2,
      primaryResource: 'magma_core',
      secondaryResource: 'alloy_ore',
    },
  };

  const biolumAtoll: PlanetConfig = {
    id: 'planet-5',
    name: 'Mycelia Atoll',
    subtitle: 'Bioluminescent Fungal Archipelago',
    seed: `${universeSeed}:biolum-mycelia`,
    archetype: 'biolum',
    radius: 560,
    heightMax: 75,
    heightMin: -50,
    layerH: 1.25,
    waterSurfaceOffset: -0.35,
    gravity: 9.0,
    karmanAGL: 195,
    solarPosition: [1200, -1850, -7900],
    atmosphere: {
      density: 1.05,
      thickness: 170,
      zenithColor: [0.12, 0.16, 0.46],
      horizonColor: [0.24, 0.84, 0.76],
      sunsetColor: [0.78, 0.28, 0.86],
      cloudCoverage: 0.55,
      cloudTint: [0.76, 0.96, 0.92],
      weatherKind: 'spores',
    },
    ocean: {
      hasOcean: true,
      kind: 'biolagoon',
      shallowColor: [0.12, 0.88, 0.78],
      deepColor: [0.05, 0.22, 0.44],
      foamColor: [0.62, 1.0, 0.92],
      emissiveIntensity: 0.35,
    },
    rings: {
      innerRadius: 780,
      outerRadius: 1120,
      normal: [-0.18, 0.95, 0.25],
      colorInner: [0.32, 0.92, 0.82],
      colorOuter: [0.68, 0.42, 0.94],
      opacity: 0.55,
    },
    floraDensity: 0.58,
    primaryFlora: 'fungal',
    secondaryFlora: 'spore_bulb',
    pentagonWonder: 'resonance_monolith',
    hasFloatingIslands: true,
    hasFlowingRivers: true,
    survival: {
      hazard: 'spore_mist',
      hazardDrainPerSec: 3.0,
      requiredSuitTier: 3,
      primaryResource: 'mycelium_spore',
      secondaryResource: 'crystal',
    },
  };

  return [starter, shatteredMoon, ringedCanyon, cryoSpire, volcanicCaldera, biolumAtoll];
}
