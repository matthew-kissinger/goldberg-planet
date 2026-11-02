/** Worker-safe dimensions and habitat identity for the expedition growth kit.
 * Shape modules live in render/vegetationKit; these dimensions also drive tools,
 * exports and the authoritative interaction field. */
import type { FloraArchetype, PlanetArchetype } from './planetConfig';

export type WorldGrowthSpecies = 'crystalFan' | 'mineralSpire' | 'cactus' | 'yucca' | 'desertPalm'
  | 'frostwillow' | 'iceFan' | 'charCoral' | 'heatStalk' | 'fungalParasol' | 'sporeFan';
export interface GrowthSpeciesProfile {
  world: PlanetArchetype;
  kind: FloraArchetype;
  trunk: number; canopy: number; spread: number; girth: number;
  /** Flexibility only; the atmosphere can further reduce it to zero. */
  wind: number;
}
export const GROWTH_SPECIES: Readonly<Record<WorldGrowthSpecies, GrowthSpeciesProfile>> = {
  crystalFan: { world: 'shattered', kind: 'crystal_spire', trunk: 0.6, canopy: 3.2, spread: 2.2, girth: 0.34, wind: 0 },
  mineralSpire: { world: 'shattered', kind: 'crystal_spire', trunk: 0.4, canopy: 4.6, spread: 1.3, girth: 0.45, wind: 0 },
  cactus: { world: 'canyon', kind: 'cactus', trunk: 2.7, canopy: 1.8, spread: 1.65, girth: 0.42, wind: 0 },
  yucca: { world: 'canyon', kind: 'palm', trunk: 1.8, canopy: 1.7, spread: 1.9, girth: 0.24, wind: 0.65 },
  desertPalm: { world: 'canyon', kind: 'palm', trunk: 5.3, canopy: 2.4, spread: 3.5, girth: 0.32, wind: 0.8 },
  frostwillow: { world: 'cryo', kind: 'ice_willow', trunk: 3.6, canopy: 2.6, spread: 2.8, girth: 0.26, wind: 0.12 },
  iceFan: { world: 'cryo', kind: 'crystal_spire', trunk: 0.3, canopy: 3.4, spread: 2.3, girth: 0.25, wind: 0 },
  charCoral: { world: 'volcanic', kind: 'crystal_spire', trunk: 1.8, canopy: 2.7, spread: 2.5, girth: 0.38, wind: 0 },
  heatStalk: { world: 'volcanic', kind: 'spore_bulb', trunk: 2.8, canopy: 1.6, spread: 1.2, girth: 0.28, wind: 0.24 },
  fungalParasol: { world: 'biolum', kind: 'fungal', trunk: 4.1, canopy: 1.7, spread: 3.5, girth: 0.5, wind: 0.28 },
  sporeFan: { world: 'biolum', kind: 'spore_bulb', trunk: 1.6, canopy: 2.7, spread: 2.4, girth: 0.35, wind: 0.4 },
};
