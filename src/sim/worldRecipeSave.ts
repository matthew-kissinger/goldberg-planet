import type { WorldSave } from './save';

/** Layer indices on the five rebuilt worlds are incompatible with their old
 * recipes. Carry the unchanged home world and expedition kit into a NEW slot;
 * never mutate or overwrite the original save. */
export function carryAureliaIntoWorldsV3(source: WorldSave): { save: WorldSave; relocate: boolean } {
  const home = 'planet-0';
  const relocate = !!source.activePlanetId && source.activePlanetId !== home;
  const delta = source.planetDeltas?.[home];
  return {
    relocate,
    save: {
      ...source,
      activePlanetId: home,
      // Legacy top-level fields describe the active world. Do not accidentally
      // import those as home trees/drops when the saved explorer was off-world.
      choppedTrees: delta?.choppedTrees ?? (relocate ? [] : source.choppedTrees),
      treeChopProgress: delta?.treeChopProgress ?? (relocate ? [] : source.treeChopProgress),
      drops: delta?.drops ?? (relocate ? [] : source.drops),
      structures: source.structures?.filter(structure => structure.planetId === home),
      planetDeltas: source.planetDeltas ? (delta ? { [home]: delta } : {}) : undefined,
      faunaByPlanet: source.faunaByPlanet?.[home] ? { [home]: source.faunaByPlanet[home] } : undefined,
    },
  };
}
