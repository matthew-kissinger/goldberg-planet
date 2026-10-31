/**
 * Infinite Procedural Fauna DNA Generator (`wildlifePool.ts`).
 *
 * Synthesizes deterministic, infinitely varied creature species from any world seed,
 * planetary archetype, and species slot across 4 distinct locomotion & anatomical plans:
 *  - `quadruped`: 4-legged grazers, armored herbivores, and pack predators
 *  - `biped`: 2-legged striders, crested raptors, and agile canyon runners
 *  - `avian`: flying birds, sky-gliders, and thermal soarers with articulated flapping wings
 *  - `aquatic`: ocean, lagoon, and river fish/leviathans with oscillating caudal & pectoral fins
 */

import type { PlanetArchetype } from './planetConfig';
import { hashString, mulberry32 } from '../util/prng';

export type CreatureLocomotion = 'quadruped' | 'biped' | 'avian' | 'aquatic';
export type CreatureDiet = 'herbivore' | 'predator';
export type CreatureHeadStyle = 'elk' | 'lupine' | 'raptor' | 'beaked' | 'armored' | 'fusiform';
export type CreatureHornStyle = 'none' | 'branched_antlers' | 'curved_horns' | 'dorsal_crest' | 'crystal_crown' | 'tusks';
export type CreatureDorsalStyle = 'smooth' | 'ridge_plates' | 'sail_fin' | 'glowing_spores';
export type CreatureTailStyle = 'short_tuft' | 'long_whip' | 'feathered_fan' | 'vertical_fin';

export interface CreatureDna {
  speciesId: string;
  name: string;
  locomotion: CreatureLocomotion;
  diet: CreatureDiet;
  scale: number;
  bodyLength: number;
  bodyWidth: number;
  bodyHeight: number;
  legLength: number;
  neckLength: number;
  neckAngle: number;
  headStyle: CreatureHeadStyle;
  hornStyle: CreatureHornStyle;
  dorsalStyle: CreatureDorsalStyle;
  tailStyle: CreatureTailStyle;
  wingSpan: number;
  primaryColor: number;
  secondaryColor: number;
  accentColor: number;
  eyeColor: number;
  emissiveAccent: boolean;
  flightAGL: number;
  swimDepth: number;
  walkSpeed: number;
  runSpeed: number;
  maxHp: number;
}

const PREFIXES_BY_ARCHETYPE: Record<PlanetArchetype, readonly string[]> = {
  terran: ['Crowned', 'Verdant', 'Timber', 'Meadow', 'Highland', 'Amber', 'Dappled', 'Golden'],
  canyon: ['Red-Rock', 'Mesa', 'Dune', 'Sun-Baked', 'Ochre', 'Canyon', 'Crested', 'Sand'],
  volcanic: ['Cinder', 'Basalt', 'Obsidian', 'Magma', 'Ashen', 'Pyre', 'Ember', 'Slag'],
  cryo: ['Glacial', 'Rime', 'Frost', 'Aurora', 'Tundra', 'Permafrost', 'Pale', 'Ice'],
  biolum: ['Luminous', 'Mycelial', 'Spore', 'Neon', 'Atoll', 'Cyan', 'Fungal', 'Glimmer'],
  shattered: ['Prismatic', 'Shard', 'Aether', 'Quartz', 'Void', 'Faceted', 'Star', 'Astral'],
};

const ROOTS_BY_LOCOMOTION: Record<CreatureLocomotion, { herbivore: readonly string[]; predator: readonly string[] }> = {
  quadruped: {
    herbivore: ['Hex-Stag', 'Ridge-buck', 'Grazer', 'Steppe-Ram', 'Horn-Ox', 'Plains-Elk'],
    predator: ['Ridge-Wolf', 'Prowler', 'Fang-Hound', 'Crag-Stalker', 'Dire-Lynx', 'Ravager'],
  },
  biped: {
    herbivore: ['Crest-Strider', 'Mesa-Runner', 'Hopper', 'Plume-Biped', 'Swift-Grazer'],
    predator: ['Raptor-Stalker', 'Talon-Runner', 'Scythe-Strider', 'Canyon-Raptor', 'Slasher'],
  },
  avian: {
    herbivore: ['Sky-Glider', 'Cloud-Heron', 'Breeze-Finch', 'Canopy-Drifter', 'Sun-Tern'],
    predator: ['Storm-Hawk', 'Thermal-Condor', 'Crag-Eagle', 'Sky-Harrier', 'Apex-Falcon'],
  },
  aquatic: {
    herbivore: ['Reef-Darter', 'Lagoon-Carp', 'Kelp-Glider', 'Shoal-Fin', 'Tide-Grazer'],
    predator: ['Fang-Barracuda', 'Abyssal-Pike', 'Reef-Shark', 'Brine-Hunter', 'Trench-Eel'],
  },
};

function hslToHex(h: number, s: number, l: number): number {
  const hue = ((h % 1) + 1) % 1;
  const sat = Math.max(0, Math.min(1, s));
  const lig = Math.max(0, Math.min(1, l));
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number): number => {
    const k = (n + hue * 12) % 12;
    const color = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/**
 * Deterministically generate a complete `CreatureDna` from a seed, planetary archetype,
 * locomotion class, and variation index.
 */
export function generateCreatureDna(
  seed: string,
  archetype: PlanetArchetype,
  locomotion: CreatureLocomotion,
  diet: CreatureDiet,
  variantIndex = 0,
): CreatureDna {
  const h = hashString(`${seed}:${archetype}:${locomotion}:${diet}:${variantIndex}`);
  const rng = mulberry32(h);

  const prefixes = PREFIXES_BY_ARCHETYPE[archetype] ?? PREFIXES_BY_ARCHETYPE.terran;
  const roots = ROOTS_BY_LOCOMOTION[locomotion][diet];
  const prefix = prefixes[Math.floor(rng() * prefixes.length)]!;
  const root = roots[Math.floor(rng() * roots.length)]!;
  const name = `${prefix} ${root}`;

  // Archetype hue base + individual genetic drift
  let baseHue = 0.08;
  let baseSat = 0.52;
  let baseLig = 0.44;
  switch (archetype) {
    case 'terran':
      baseHue = locomotion === 'avian' ? 0.56 : locomotion === 'aquatic' ? 0.48 : 0.08;
      baseSat = 0.55;
      baseLig = diet === 'predator' ? 0.30 : 0.46;
      break;
    case 'canyon':
      baseHue = 0.05;
      baseSat = 0.68;
      baseLig = diet === 'predator' ? 0.32 : 0.50;
      break;
    case 'volcanic':
      baseHue = 0.02;
      baseSat = 0.72;
      baseLig = 0.26;
      break;
    case 'cryo':
      baseHue = 0.54;
      baseSat = 0.42;
      baseLig = diet === 'predator' ? 0.45 : 0.72;
      break;
    case 'biolum':
      baseHue = 0.46;
      baseSat = 0.78;
      baseLig = 0.44;
      break;
    case 'shattered':
      baseHue = 0.76;
      baseSat = 0.65;
      baseLig = 0.48;
      break;
  }

  const hueShift = (rng() - 0.5) * 0.16;
  const primaryColor = hslToHex(baseHue + hueShift, baseSat + (rng() - 0.5) * 0.18, baseLig);
  const secondaryColor = hslToHex(baseHue + hueShift + 0.04, Math.max(0.2, baseSat - 0.18), Math.min(0.86, baseLig + 0.24));
  const accentColor = hslToHex(baseHue + hueShift + (diet === 'predator' ? -0.06 : 0.32), 0.82, 0.58);
  const eyeColor = diet === 'predator' ? 0xff4818 : archetype === 'biolum' ? 0x38f8e2 : 0x24d8ff;
  const emissiveAccent = archetype === 'biolum' || archetype === 'volcanic' || archetype === 'shattered' || rng() < 0.35;

  const scale = 0.82 + rng() * 0.48;

  if (locomotion === 'avian') {
    return {
      speciesId: `${archetype}-avian-${variantIndex}`,
      name,
      locomotion: 'avian',
      diet,
      scale,
      bodyLength: 0.56 + rng() * 0.32,
      bodyWidth: 0.24 + rng() * 0.10,
      bodyHeight: 0.22 + rng() * 0.10,
      legLength: 0.22 + rng() * 0.10,
      neckLength: 0.18 + rng() * 0.18,
      neckAngle: 0.35,
      headStyle: 'beaked',
      hornStyle: rng() < 0.5 ? 'dorsal_crest' : 'none',
      dorsalStyle: 'smooth',
      tailStyle: 'feathered_fan',
      wingSpan: 1.65 + rng() * 1.15,
      primaryColor,
      secondaryColor,
      accentColor,
      eyeColor,
      emissiveAccent,
      flightAGL: 8.5 + rng() * 11.0,
      swimDepth: 0,
      walkSpeed: 7.5 + rng() * 3.5,
      runSpeed: 12.5 + rng() * 4.0,
      maxHp: 2,
    };
  }

  if (locomotion === 'aquatic') {
    return {
      speciesId: `${archetype}-aquatic-${variantIndex}`,
      name,
      locomotion: 'aquatic',
      diet,
      scale,
      bodyLength: 0.68 + rng() * 0.52,
      bodyWidth: 0.22 + rng() * 0.14,
      bodyHeight: 0.28 + rng() * 0.18,
      legLength: 0.18,
      neckLength: 0.12,
      neckAngle: 0,
      headStyle: 'fusiform',
      hornStyle: rng() < 0.35 ? 'crystal_crown' : 'none',
      dorsalStyle: 'sail_fin',
      tailStyle: 'vertical_fin',
      wingSpan: 0.55 + rng() * 0.35,
      primaryColor,
      secondaryColor,
      accentColor,
      eyeColor,
      emissiveAccent: true,
      flightAGL: 0,
      swimDepth: 0.45 + rng() * 1.35,
      walkSpeed: 3.4 + rng() * 2.2,
      runSpeed: 7.2 + rng() * 3.0,
      maxHp: diet === 'predator' ? 3 : 2,
    };
  }

  if (locomotion === 'biped') {
    const horns: CreatureHornStyle[] = ['dorsal_crest', 'curved_horns', 'crystal_crown', 'none'];
    const dorsals: CreatureDorsalStyle[] = ['ridge_plates', 'sail_fin', 'glowing_spores', 'smooth'];
    return {
      speciesId: `${archetype}-biped-${variantIndex}`,
      name,
      locomotion: 'biped',
      diet,
      scale,
      bodyLength: 0.64 + rng() * 0.30,
      bodyWidth: 0.36 + rng() * 0.14,
      bodyHeight: 0.38 + rng() * 0.16,
      legLength: 0.58 + rng() * 0.28,
      neckLength: 0.38 + rng() * 0.24,
      neckAngle: 0.42 + rng() * 0.32,
      headStyle: diet === 'predator' ? 'raptor' : 'beaked',
      hornStyle: horns[Math.floor(rng() * horns.length)]!,
      dorsalStyle: dorsals[Math.floor(rng() * dorsals.length)]!,
      tailStyle: rng() < 0.55 ? 'feathered_fan' : 'long_whip',
      wingSpan: 0.45 + rng() * 0.25,
      primaryColor,
      secondaryColor,
      accentColor,
      eyeColor,
      emissiveAccent,
      flightAGL: 0,
      swimDepth: 0,
      walkSpeed: 2.8 + rng() * 1.4,
      runSpeed: 6.4 + rng() * 2.2,
      maxHp: diet === 'predator' ? 4 : 3,
    };
  }

  // Default: Quadruped with wide anatomical diversity
  const horns: CreatureHornStyle[] =
    diet === 'herbivore'
      ? ['branched_antlers', 'curved_horns', 'crystal_crown', 'tusks']
      : ['none', 'curved_horns', 'dorsal_crest', 'tusks'];
  const dorsals: CreatureDorsalStyle[] = ['smooth', 'ridge_plates', 'glowing_spores', 'sail_fin'];
  const tails: CreatureTailStyle[] = ['short_tuft', 'long_whip', 'feathered_fan'];

  return {
    speciesId: `${archetype}-quadruped-${variantIndex}`,
    name,
    locomotion: 'quadruped',
    diet,
    scale,
    bodyLength: 0.88 + rng() * 0.42,
    bodyWidth: 0.44 + rng() * 0.20,
    bodyHeight: 0.40 + rng() * 0.18,
    legLength: 0.52 + rng() * 0.26,
    neckLength: 0.34 + rng() * 0.32,
    neckAngle: 0.32 + rng() * 0.36,
    headStyle: diet === 'predator' ? 'lupine' : rng() < 0.5 ? 'elk' : 'armored',
    hornStyle: horns[Math.floor(rng() * horns.length)]!,
    dorsalStyle: dorsals[Math.floor(rng() * dorsals.length)]!,
    tailStyle: tails[Math.floor(rng() * tails.length)]!,
    wingSpan: 0,
    primaryColor,
    secondaryColor,
    accentColor,
    eyeColor,
    emissiveAccent,
    flightAGL: 0,
    swimDepth: 0,
    walkSpeed: 2.1 + rng() * 1.1,
    runSpeed: 5.6 + rng() * 1.8,
    maxHp: diet === 'predator' ? 4 : 3,
  };
}
