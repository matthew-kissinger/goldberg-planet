import { describe, expect, it } from 'vitest';
import { carryAureliaIntoWorldsV3 } from '../src/sim/worldRecipeSave';
import { SAVE_VERSION, type WorldSave } from '../src/sim/save';

function fixture(activePlanetId = 'planet-0'): WorldSave {
  return {
    version: SAVE_VERSION, seed: 'carry', frequency: 192, savedAt: 1, activePlanetId,
    player: { px: 1, py: 902, pz: 0, vx: 0, vy: 0, vz: 0, fwdX: 1, fwdY: 0, fwdZ: 0, pitch: 0, mode: 'walk', tile: 5, throttle: 0, holdAGL: 0, planeSpeed: 0 },
    inventory: { wood: 12, orbital_thruster: 1 }, planeCrafted: true, choppedTrees: [99], treeChopProgress: [], drops: [],
    appearance: { version: 1, hair: 'braid' }, mode: 'survival', journal: { version: 1, visitedSites: ['shore-camp'] },
    planetDeltas: {
      'planet-0': { choppedTrees: [6], treeChopProgress: [{ tile: 7, progress: 2 }], columnEdits: [{ tile: 5, solid: [1, 0], placed: [1, 0], mat: [[10, 15]] }], seededEcoTiles: [8], drops: [] },
      'planet-2': { choppedTrees: [9], treeChopProgress: [], columnEdits: [], seededEcoTiles: [], drops: [] },
    },
    structures: [{ id: 'camp', planetId: 'planet-0' }, { id: 'old-outpost', planetId: 'planet-2' }] as WorldSave['structures'],
  };
}

describe('non-destructive world recipe carry-forward', () => {
  it('retains compatible home progress and kit without importing foreign layer edits', () => {
    const source = fixture(), before = JSON.stringify(source), result = carryAureliaIntoWorldsV3(source);
    expect(result.relocate).toBe(false);
    expect(Object.keys(result.save.planetDeltas!)).toEqual(['planet-0']);
    expect(result.save.planetDeltas!['planet-0']).toEqual(source.planetDeltas!['planet-0']);
    expect(result.save.choppedTrees).toEqual([6]);
    expect(result.save.structures?.map(s => s.id)).toEqual(['camp']);
    expect(result.save.inventory).toEqual(source.inventory);
    expect(result.save.appearance).toEqual(source.appearance);
    expect(result.save.journal).toEqual(source.journal);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('requests a safe home spawn if saved on a rebuilt world, keeping its old save intact', () => {
    const source = fixture('planet-2'), before = JSON.stringify(source), result = carryAureliaIntoWorldsV3(source);
    expect(result.relocate).toBe(true);
    expect(result.save.activePlanetId).toBe('planet-0');
    expect(result.save.choppedTrees).toEqual([6]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('never mistakes foreign top-level tree/drop state for an unrecorded home world', () => {
    const source = fixture('planet-3'); delete source.planetDeltas;
    const result = carryAureliaIntoWorldsV3(source);
    expect(result.save.choppedTrees).toEqual([]);
    expect(result.save.treeChopProgress).toEqual([]);
    expect(result.save.drops).toEqual([]);
  });
});
