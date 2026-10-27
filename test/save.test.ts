import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { buildLayers } from '../src/world/layers';
import { Terrain } from '../src/world/terrain';
import { Columns } from '../src/world/columns';
import { Trees } from '../src/world/trees';
import { Player } from '../src/player/player';
import {
  SAVE_VERSION,
  applyChoppedTrees,
  applyPlayerSave,
  applyTreeChopProgress,
  captureWorldSave,
  parseWorldSaveJson,
  saveSlotKey,
} from '../src/sim/save';

describe('save boundary', () => {
  const geo = new Goldberg(8);
  const layers = buildLayers();

  function world(seed = 'save-cycle'): { trees: Trees; player: Player } {
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    const trees = new Trees(geo, columns, terrain, seed);
    const player = new Player(geo, layers, columns);
    player.spawnAt(100);
    return { trees, player };
  }

  it('round-trips chopped trees, chop progress, inventory, drops, plane unlock, and player state', () => {
    const a = world();
    let treeTile = -1;
    let partialTreeTile = -1;
    for (let id = 0; id < geo.count; id++) {
      if (!a.trees.hasTree(id)) continue;
      if (treeTile < 0) treeTile = id;
      else { partialTreeTile = id; break; }
    }
    expect(treeTile).toBeGreaterThanOrEqual(0);
    expect(partialTreeTile).toBeGreaterThanOrEqual(0);
    expect(a.trees.chop(treeTile)).toBe(true);
    expect(a.trees.strike(partialTreeTile, 1.5).felled).toBe(false);

    a.player.px += 3.2;
    a.player.py += 1.1;
    a.player.vx = 2;
    a.player.vy = -0.5;
    a.player.fwdX = 0.4;
    a.player.fwdY = 0.2;
    a.player.fwdZ = 0.9;
    a.player.mode = 'plane';
    a.player.throttle = 63;
    a.player.holdAGL = 44;
    a.player.planeSpeed = 58;
    a.player.reorthonormalize();

    const drop = { id: 7, item: 'wood' as const, count: 2, tile: partialTreeTile, offsetA: 0.1, offsetB: -0.2, groundRadius: 903.75, age: 0.5 };
    const save = captureWorldSave({
      seed: 'save-cycle',
      frequency: geo.m,
      player: a.player,
      trees: a.trees,
      inventory: { wood: 4, planeFrame: 1 },
      drops: [drop],
      planeCrafted: true,
      savedAt: 123,
    });
    const parsed = parseWorldSaveJson(JSON.stringify(save));
    expect(parsed).not.toBeNull();

    const b = world();
    applyChoppedTrees(b.trees, parsed!.choppedTrees, geo.count);
    applyTreeChopProgress(b.trees, parsed!.treeChopProgress, geo.count);
    expect(applyPlayerSave(b.player, parsed!.player, geo.count)).toBe(true);

    expect(b.trees.chopped.has(treeTile)).toBe(true);
    expect(b.trees.hasTree(treeTile)).toBe(false);
    expect(b.trees.chopProgress.get(partialTreeTile)).toBe(1.5);
    expect(parsed!.drops).toEqual([drop]);
    expect(parsed!.inventory).toEqual({ wood: 4, planeFrame: 1 });
    expect(parsed!.planeCrafted).toBe(true);
    expect(b.player.mode).toBe('plane');
    expect(b.player.throttle).toBe(63);
    expect(b.player.holdAGL).toBe(44);
    expect(b.player.planeSpeed).toBe(58);
    expect(b.player.radius()).toBeCloseTo(a.player.radius(), 8);
  });

  it('rejects malformed and older saves', () => {
    const { player, trees } = world('save-order');
    const good = captureWorldSave({ seed: 's', frequency: geo.m, player, trees, inventory: {}, planeCrafted: false, savedAt: 1 });
    expect(parseWorldSaveJson(JSON.stringify(good))).not.toBeNull();
    expect(parseWorldSaveJson('not json')).toBeNull();
    expect(parseWorldSaveJson(JSON.stringify({ ...good, version: SAVE_VERSION - 1 }))).toBeNull();
    expect(parseWorldSaveJson(JSON.stringify({ ...good, choppedTrees: ['x'] }))).toBeNull();
    expect(parseWorldSaveJson(JSON.stringify({ ...good, player: { ...good.player, mode: 'swim' } }))).toBeNull();
  });

  it('drops unknown items from a saved inventory instead of rejecting the save', () => {
    const { player, trees } = world('save-items');
    const save = captureWorldSave({ seed: 's', frequency: geo.m, player, trees, inventory: { wood: 3 }, planeCrafted: false, savedAt: 1 });
    const parsed = parseWorldSaveJson(JSON.stringify({ ...save, inventory: { wood: 3, rock: 9, berries: 2 } }));
    expect(parsed!.inventory).toEqual({ wood: 3 });
  });

  it('keys save slots by version, frequency, and escaped seed', () => {
    expect(saveSlotKey('A B', 8)).toBe(`goldberg-planet:v${SAVE_VERSION}:m8:A%20B`);
  });
});
