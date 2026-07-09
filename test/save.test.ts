import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { buildLayers } from '../src/world/layers';
import { Terrain, MAT } from '../src/world/terrain';
import { Columns } from '../src/world/columns';
import { Trees } from '../src/world/trees';
import { Player } from '../src/player/player';
import { MineProgress } from '../src/sim/mining';
import {
  applyChoppedTrees,
  applyColumnEdits,
  applyPlayerSave,
  applyTreeChopProgress,
  captureWorldSave,
  parseWorldSaveJson,
  saveSlotKey,
  serializeColumnEdits,
} from '../src/sim/save';

describe('Hearth and Horizon save boundary', () => {
  const geo = new Goldberg(8);
  const layers = buildLayers();

  function world(seed = 'save-cycle'): { terrain: Terrain; columns: Columns; trees: Trees; player: Player } {
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    const trees = new Trees(geo, columns, terrain, seed);
    const player = new Player(geo, layers, columns);
    player.spawnAt(100);
    return { terrain, columns, trees, player };
  }

  it('round-trips edits, chopped trees, inventory, plane unlock, and player state', () => {
    const a = world();
    const editTile = 220;
    const top = a.columns.topLayerOf(editTile);
    expect(a.columns.mine(editTile, top)).toBe(true);
    expect(a.columns.place(editTile, top - 1, MAT.WOOD)).toBe(true);

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
    const mining = new MineProgress();
    const crackedTile = editTile + 11;
    const crackedLayer = a.columns.topLayerOf(crackedTile);
    mining.strike(crackedTile, crackedLayer, 1.25, 4);

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

    const save = captureWorldSave({
      seed: 'save-cycle',
      frequency: geo.m,
      player: a.player,
      columns: a.columns,
      trees: a.trees,
      mining,
      inventory: [2, 4, 6, 8, 10],
      craftedItems: { sticks: 4, workbench: 1, stoneHatchet: 1, stoneAxe: 1, packFrame: 1, compost: 2, berries: 3, reeds: 4, rawFish: 1, campMeal: 1, expeditionStew: 1 },
      drops: [{ id: 7, item: 'wood', count: 2, tile: partialTreeTile, offsetA: 0.1, offsetB: -0.2, groundRadius: 903.75, age: 0.5, source: 'tree' }],
      structures: [
        { id: 1, item: 'campfire', tile: editTile, layer: top - 1, yaw: 0.25, state: { lit: true } },
        { id: 2, item: 'chest', tile: editTile + 1, layer: top - 1, yaw: 0, state: { storage: { wood: 5, rock: 2 } } },
        { id: 3, item: 'bedroll', tile: editTile + 2, layer: top - 1, yaw: 0.5, state: { home: true, rested: 3 } },
        { id: 4, item: 'workbench', tile: editTile + 3, layer: top - 1, yaw: 0.35 },
        { id: 5, item: 'chest', tile: editTile + 4, layer: top - 1, yaw: 0.15, state: { storage: { sand: 2 } } },
        { id: 6, item: 'campfire', tile: editTile + 5, layer: top - 1, yaw: 0.45 },
        { id: 7, item: 'bedroll', tile: editTile + 6, layer: top - 1, yaw: 0.2 },
        { id: 8, item: 'workbench', tile: editTile + 7, layer: top - 1, yaw: 0.3 },
        { id: 9, item: 'chest', tile: editTile + 8, layer: top - 1, yaw: 0.15, state: { storage: { dirt: 1 } } },
        { id: 10, item: 'bedroll', tile: editTile + 9, layer: top - 1, yaw: 0.22, state: { rested: 1 } },
        { id: 11, item: 'campfire', tile: editTile + 10, layer: top - 1, yaw: 0.4, state: { lit: true } },
        { id: 12, item: 'workbench', tile: editTile + 11, layer: top - 1, yaw: 0.45 },
        { id: 13, item: 'chest', tile: editTile + 12, layer: top - 1, yaw: 0.5, state: { storage: { snow: 3 } } },
        { id: 14, item: 'bedroll', tile: editTile + 13, layer: top - 1, yaw: 0.55, state: { home: true } },
      ],
      progression: {
        pentagons: [5, 2, 5, 0],
        toolWear: { stoneHatchet: 5, stoneAxe: 3, stonePick: 99 },
      },
      time: { day: 3, minute: 735 },
      weather: { phase: 0.42 },
      hotbarSel: 4,
      planeCrafted: true,
      savedAt: 123,
    });
    const parsed = parseWorldSaveJson(JSON.stringify(save));
    expect(parsed).not.toBeNull();

    const b = world();
    applyColumnEdits(b.columns, parsed!.columns);
    applyChoppedTrees(b.trees, parsed!.choppedTrees, geo.count);
    applyTreeChopProgress(b.trees, parsed!.treeChopProgress, geo.count);
    const loadedMining = new MineProgress(parsed!.mineProgress);
    expect(applyPlayerSave(b.player, parsed!.player, geo.count)).toBe(true);

    expect(b.columns.solidAt(editTile, top)).toBe(false);
    expect(b.columns.solidAt(editTile, top - 1)).toBe(true);
    expect(b.columns.materialAt(editTile, top - 1)).toBe(MAT.WOOD);
    expect(b.trees.chopped.has(treeTile)).toBe(true);
    expect(b.trees.hasTree(treeTile)).toBe(false);
    expect(b.trees.chopProgress.get(partialTreeTile)).toBe(1.5);
    expect(loadedMining.damageOf(crackedTile, crackedLayer)).toBeCloseTo(1.25 / 4);
    expect(parsed!.mineProgress).toEqual([{ tile: crackedTile, layer: crackedLayer, progress: 1.25, needed: 4 }]);
    expect(parsed!.drops).toEqual([{ id: 7, item: 'wood', count: 2, tile: partialTreeTile, offsetA: 0.1, offsetB: -0.2, groundRadius: 903.75, age: 0.5, source: 'tree' }]);
    expect(parsed!.inventory).toEqual([2, 4, 6, 8, 10]);
    expect(parsed!.craftedItems).toEqual({ sticks: 4, workbench: 1, stoneHatchet: 1, stoneAxe: 1, packFrame: 1, compost: 2, berries: 3, reeds: 4, rawFish: 1, campMeal: 1, expeditionStew: 1 });
    expect(parsed!.structures).toEqual([
      { id: 1, item: 'campfire', tile: editTile, layer: top - 1, yaw: 0.25, state: { lit: true } },
      { id: 2, item: 'chest', tile: editTile + 1, layer: top - 1, yaw: 0, state: { storage: { wood: 5, rock: 2 } } },
      { id: 3, item: 'bedroll', tile: editTile + 2, layer: top - 1, yaw: 0.5, state: { home: true, rested: 3 } },
      { id: 4, item: 'workbench', tile: editTile + 3, layer: top - 1, yaw: 0.35 },
      { id: 5, item: 'chest', tile: editTile + 4, layer: top - 1, yaw: 0.15, state: { storage: { sand: 2 } } },
      { id: 6, item: 'campfire', tile: editTile + 5, layer: top - 1, yaw: 0.45 },
      { id: 7, item: 'bedroll', tile: editTile + 6, layer: top - 1, yaw: 0.2 },
      { id: 8, item: 'workbench', tile: editTile + 7, layer: top - 1, yaw: 0.3 },
      { id: 9, item: 'chest', tile: editTile + 8, layer: top - 1, yaw: 0.15, state: { storage: { dirt: 1 } } },
      { id: 10, item: 'bedroll', tile: editTile + 9, layer: top - 1, yaw: 0.22, state: { rested: 1 } },
      { id: 11, item: 'campfire', tile: editTile + 10, layer: top - 1, yaw: 0.4, state: { lit: true } },
      { id: 12, item: 'workbench', tile: editTile + 11, layer: top - 1, yaw: 0.45 },
      { id: 13, item: 'chest', tile: editTile + 12, layer: top - 1, yaw: 0.5, state: { storage: { snow: 3 } } },
      { id: 14, item: 'bedroll', tile: editTile + 13, layer: top - 1, yaw: 0.55, state: { home: true } },
    ]);
    expect(parsed!.progression.pentagons).toEqual([0, 2, 5]);
    expect(parsed!.progression.toolWear).toEqual({ stoneHatchet: 5, stoneAxe: 3, stonePick: 37 });
    expect(parsed!.time).toEqual({ day: 3, minute: 735 });
    expect(parsed!.weather).toEqual({ phase: 0.42 });
    expect(parsed!.hotbarSel).toBe(4);
    expect(parsed!.planeCrafted).toBe(true);
    expect(b.player.mode).toBe('plane');
    expect(b.player.throttle).toBe(63);
    expect(b.player.holdAGL).toBe(44);
    expect(b.player.planeSpeed).toBe(58);
    expect(b.player.radius()).toBeCloseTo(a.player.radius(), 8);
  });

  it('serializes column edits in stable tile order and rejects malformed saves', () => {
    const { columns } = world('save-order');
    const high = 410;
    const low = 120;
    expect(columns.mine(high, columns.topLayerOf(high))).toBe(true);
    expect(columns.mine(low, columns.topLayerOf(low))).toBe(true);
    expect(serializeColumnEdits(columns).map((e) => e.tile)).toEqual([low, high]);

    expect(parseWorldSaveJson('not json')).toBeNull();
    expect(parseWorldSaveJson(JSON.stringify({ version: 999 }))).toBeNull();
    expect(parseWorldSaveJson(JSON.stringify({
      version: 1,
      seed: 'bad-inventory',
      frequency: 8,
      savedAt: 1,
      player: {
        px: 1, py: 0, pz: 0,
        vx: 0, vy: 0, vz: 0,
        fwdX: 0, fwdY: 1, fwdZ: 0,
        pitch: 0,
        mode: 'walk',
        tile: 0,
        throttle: 0,
        holdAGL: 0,
        planeSpeed: 0,
      },
      inventory: [0, 0, 0, 0, 0],
      craftedItems: { workbench: 'nope' },
      columns: [],
      choppedTrees: [],
    }))).toBeNull();

    const legacy = captureWorldSave({
      seed: 'legacy-save',
      frequency: geo.m,
      player: world('legacy-save').player,
      columns,
      trees: world('legacy-trees').trees,
      inventory: [0, 0, 0, 0, 0],
      craftedItems: {},
      structures: [],
      progression: { pentagons: [0], toolWear: {} },
      hotbarSel: 0,
      planeCrafted: false,
      savedAt: 321,
    });
    delete (legacy as any).progression;
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.pentagons).toEqual([]);
    expect(saveSlotKey('A B', 8)).toContain('A%20B');
  });
});
