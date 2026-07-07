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
      craftedItems: { sticks: 4, workbench: 1, stoneHatchet: 1, stoneBlade: 1, reedBow: 1, whistlingArrow: 5, stoneAxe: 1, packFrame: 1, stormCloak: 1, compost: 2, berries: 3, reeds: 4, rawFish: 1, campMeal: 1, expeditionStew: 1, rainCistern: 1, rootCellar: 1, caveAnchor: 1, wallDoorPanel: 1, wallWindowPanel: 1, wallCorner: 1, roofJoin: 1, fishTrap: 1, shoreNet: 1 },
      drops: [{ id: 7, item: 'wood', count: 2, tile: partialTreeTile, offsetA: 0.1, offsetB: -0.2, age: 0.5, source: 'tree' }],
      structures: [
        { id: 1, item: 'campfire', tile: editTile, layer: top - 1, yaw: 0.25, state: { lit: true } },
        { id: 2, item: 'chest', tile: editTile + 1, layer: top - 1, yaw: 0, state: { storage: { wood: 5, rock: 2 } } },
        { id: 3, item: 'cropPlot', tile: editTile + 2, layer: top - 1, yaw: 0.5, state: { crop: 'berries', growth: 3, fertility: 2, harvests: 2 } },
        { id: 4, item: 'compostBin', tile: editTile + 3, layer: top - 1, yaw: 0.35, state: { composts: 2 } },
        { id: 5, item: 'rainCistern', tile: editTile + 4, layer: top - 1, yaw: 0.15, state: { water: 3, fills: 2 } },
        { id: 6, item: 'rootCellar', tile: editTile + 5, layer: top - 1, yaw: 0.45, state: { provisions: 3, caches: 2 } },
        { id: 7, item: 'caveAnchor', tile: editTile + 6, layer: top - 1, yaw: 0.2, state: { anchorUses: 1, anchorKind: 'dryCave', anchorLabel: 'basalt throat', anchorDepth: 12.75, anchorDistance: 1, anchorFlooded: false, anchorClearance: 4, anchorTile: editTile + 8 } },
        { id: 8, item: 'fishTrap', tile: editTile + 7, layer: top - 1, yaw: 0.3, state: { trapSetDay: 3, trapSetMinute: 720, trapBaited: true, trapChecks: 2 } },
        { id: 9, item: 'cropPlot', tile: editTile + 8, layer: top - 1, yaw: 0.15, state: { crop: 'reeds', growth: 2, fertility: 1, harvests: 3 } },
        { id: 10, item: 'shoreNet', tile: editTile + 9, layer: top - 1, yaw: 0.22, state: { netSetDay: 3, netSetMinute: 700, netChecks: 1 } },
        { id: 11, item: 'wallDoorPanel', tile: editTile + 10, layer: top - 1, yaw: 0.4 },
        { id: 12, item: 'wallWindowPanel', tile: editTile + 11, layer: top - 1, yaw: 0.45 },
        { id: 13, item: 'wallCorner', tile: editTile + 12, layer: top - 1, yaw: 0.5 },
        { id: 14, item: 'roofJoin', tile: editTile + 13, layer: top - 1, yaw: 0.55 },
      ],
      progression: {
        pentagons: [5, 2, 5, 0],
        siteCompletions: [5, 2, 5, 0],
        domainHarvests: [22, 0, 22, 11],
        skyfallHarvests: [4, 1, 4],
        murmurObservations: [7, 3, 7],
        seasonAfterglowReadings: [19, 7, 19],
        thresholdChamberObservations: [10, 0, 10],
        caveResonanceObservations: [2048, 1024, 2048],
        nativeCreatureTends: [24, 8, 24],
        nativeCreatureWards: [33, 12, 33],
        routePlan: { targetTile: 333, sourceKind: 'skyfall', label: 'emberfall crater', detail: '1.2 km left · 70m left', originTile: 100, setDay: 3, setMinute: 735 },
        toolWear: { stoneHatchet: 5, stoneBlade: 7, reedBow: 9, stoneAxe: 3, stonePick: 99 },
      },
      time: { day: 3, minute: 735 },
      weather: { phase: 0.42 },
      survival: { stamina: 68, exposure: 31, mealsEaten: 2, trailFocus: 45 },
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
    expect(parsed!.drops).toEqual([{ id: 7, item: 'wood', count: 2, tile: partialTreeTile, offsetA: 0.1, offsetB: -0.2, age: 0.5, source: 'tree' }]);
    expect(parsed!.inventory).toEqual([2, 4, 6, 8, 10]);
    expect(parsed!.craftedItems).toEqual({ sticks: 4, workbench: 1, stoneHatchet: 1, stoneBlade: 1, reedBow: 1, whistlingArrow: 5, stoneAxe: 1, packFrame: 1, stormCloak: 1, compost: 2, berries: 3, reeds: 4, rawFish: 1, campMeal: 1, expeditionStew: 1, rainCistern: 1, rootCellar: 1, caveAnchor: 1, wallDoorPanel: 1, wallWindowPanel: 1, wallCorner: 1, roofJoin: 1, fishTrap: 1, shoreNet: 1 });
    expect(parsed!.structures).toEqual([
      { id: 1, item: 'campfire', tile: editTile, layer: top - 1, yaw: 0.25, state: { lit: true } },
      { id: 2, item: 'chest', tile: editTile + 1, layer: top - 1, yaw: 0, state: { storage: { wood: 5, rock: 2 } } },
      { id: 3, item: 'cropPlot', tile: editTile + 2, layer: top - 1, yaw: 0.5, state: { crop: 'berries', growth: 3, fertility: 2, harvests: 2 } },
      { id: 4, item: 'compostBin', tile: editTile + 3, layer: top - 1, yaw: 0.35, state: { composts: 2 } },
      { id: 5, item: 'rainCistern', tile: editTile + 4, layer: top - 1, yaw: 0.15, state: { water: 3, fills: 2 } },
      { id: 6, item: 'rootCellar', tile: editTile + 5, layer: top - 1, yaw: 0.45, state: { provisions: 3, caches: 2 } },
      { id: 7, item: 'caveAnchor', tile: editTile + 6, layer: top - 1, yaw: 0.2, state: { anchorUses: 1, anchorKind: 'dryCave', anchorLabel: 'basalt throat', anchorDepth: 12.75, anchorDistance: 1, anchorFlooded: false, anchorClearance: 4, anchorTile: editTile + 8 } },
      { id: 8, item: 'fishTrap', tile: editTile + 7, layer: top - 1, yaw: 0.3, state: { trapSetDay: 3, trapSetMinute: 720, trapBaited: true, trapChecks: 2 } },
      { id: 9, item: 'cropPlot', tile: editTile + 8, layer: top - 1, yaw: 0.15, state: { crop: 'reeds', growth: 2, fertility: 1, harvests: 3 } },
      { id: 10, item: 'shoreNet', tile: editTile + 9, layer: top - 1, yaw: 0.22, state: { netSetDay: 3, netSetMinute: 700, netChecks: 1 } },
      { id: 11, item: 'wallDoorPanel', tile: editTile + 10, layer: top - 1, yaw: 0.4 },
      { id: 12, item: 'wallWindowPanel', tile: editTile + 11, layer: top - 1, yaw: 0.45 },
      { id: 13, item: 'wallCorner', tile: editTile + 12, layer: top - 1, yaw: 0.5 },
      { id: 14, item: 'roofJoin', tile: editTile + 13, layer: top - 1, yaw: 0.55 },
    ]);
    expect(parsed!.progression.pentagons).toEqual([0, 2, 5]);
    expect(parsed!.progression.siteCompletions).toEqual([0, 2, 5]);
    expect(parsed!.progression.domainHarvests).toEqual([0, 11, 22]);
    expect(parsed!.progression.skyfallHarvests).toEqual([1, 4]);
    expect(parsed!.progression.murmurObservations).toEqual([3, 7]);
    expect(parsed!.progression.seasonAfterglowReadings).toEqual([7, 19]);
    expect(parsed!.progression.thresholdChamberObservations).toEqual([0, 10]);
    expect(parsed!.progression.caveResonanceObservations).toEqual([1024, 2048]);
    expect(parsed!.progression.nativeCreatureTends).toEqual([8, 24]);
    expect(parsed!.progression.nativeCreatureWards).toEqual([12, 33]);
    expect(parsed!.progression.routePlan).toEqual({ targetTile: 333, sourceKind: 'skyfall', label: 'emberfall crater', detail: '1.2 km left · 70m left', originTile: 100, setDay: 3, setMinute: 735 });
    expect(parsed!.progression.toolWear).toEqual({ stoneHatchet: 5, stoneBlade: 7, stoneAxe: 3, stonePick: 37, reedBow: 9 });
    expect(parsed!.time).toEqual({ day: 3, minute: 735 });
    expect(parsed!.weather).toEqual({ phase: 0.42 });
    expect(parsed!.survival).toEqual({ stamina: 68, exposure: 31, mealsEaten: 2, collapseCount: 0, trailFocus: 45 });
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
      progression: { pentagons: [0], siteCompletions: [0], toolWear: {} },
      hotbarSel: 0,
      planeCrafted: false,
      savedAt: 321,
    });
    delete (legacy.progression as any).siteCompletions;
    delete (legacy.progression as any).domainHarvests;
    delete (legacy.progression as any).skyfallHarvests;
    delete (legacy.progression as any).murmurObservations;
    delete (legacy.progression as any).seasonAfterglowReadings;
    delete (legacy.progression as any).thresholdChamberObservations;
    delete (legacy.progression as any).caveResonanceObservations;
    delete (legacy.progression as any).nativeCreatureTends;
    delete (legacy.progression as any).nativeCreatureWards;
    delete (legacy.progression as any).routePlan;
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.domainHarvests).toEqual([]);
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.siteCompletions).toEqual([]);
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.skyfallHarvests).toEqual([]);
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.murmurObservations).toEqual([]);
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.seasonAfterglowReadings).toEqual([]);
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.thresholdChamberObservations).toEqual([]);
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.caveResonanceObservations).toEqual([]);
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.nativeCreatureTends).toEqual([]);
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.nativeCreatureWards).toEqual([]);
    expect(parseWorldSaveJson(JSON.stringify(legacy))!.progression.routePlan).toBeNull();
    expect(saveSlotKey('A B', 8)).toContain('A%20B');
  });

  it('round-trips saved route itineraries with reached and active legs', () => {
    const a = world('route-itinerary-save');
    const save = captureWorldSave({
      seed: 'route-itinerary-save',
      frequency: geo.m,
      player: a.player,
      columns: a.columns,
      trees: a.trees,
      inventory: [0, 0, 0, 0, 0],
      craftedItems: {},
      structures: [],
      progression: {
        routePlan: {
          targetTile: 220,
          sourceKind: 'skyfall',
          label: 'glass-rain shoal',
          detail: 'pale shard halo',
          originTile: 100,
          setDay: 4,
          setMinute: 360,
          legs: [
            { targetTile: 111, sourceKind: 'target', label: 'North Gate', detail: 'first horizon stop', originTile: 100, setDay: 4, setMinute: 360, reached: true, reachedDay: 4, reachedMinute: 390 },
            { targetTile: 220, sourceKind: 'skyfall', label: 'glass-rain shoal', detail: 'pale shard halo', originTile: 100, setDay: 4, setMinute: 360 },
            { targetTile: 333, sourceKind: 'murmur', label: 'star-glass glimmer', detail: '31m left', originTile: 100, setDay: 4, setMinute: 360 },
            { targetTile: 444, sourceKind: 'nativeHazard', label: 'cave bell-jaw', detail: 'answer: keep light on its hinge', originTile: 100, setDay: 4, setMinute: 360 },
            { targetTile: 555, sourceKind: 'nativeLife', label: 'reedback grazer', detail: 'tend: scratch its reed mane', originTile: 100, setDay: 4, setMinute: 360 },
          ],
        },
        toolWear: {},
      },
      hotbarSel: 0,
      planeCrafted: false,
      savedAt: 456,
    });
    const parsed = parseWorldSaveJson(JSON.stringify(save));
    expect(parsed?.progression.routePlan).toMatchObject({
      targetTile: 220,
      sourceKind: 'skyfall',
      label: 'glass-rain shoal',
      legs: [
        { targetTile: 111, sourceKind: 'target', reached: true, reachedDay: 4, reachedMinute: 390 },
        { targetTile: 220, sourceKind: 'skyfall' },
        { targetTile: 333, sourceKind: 'murmur' },
        { targetTile: 444, sourceKind: 'nativeHazard' },
        { targetTile: 555, sourceKind: 'nativeLife' },
      ],
    });
    expect(parsed?.progression.routePlan?.legs?.[1].reached).toBeUndefined();
    expect(parsed?.progression.routePlan?.legs?.[2].reached).toBeUndefined();
    expect(parsed?.progression.routePlan?.legs?.[3].reached).toBeUndefined();
    expect(parsed?.progression.routePlan?.legs?.[4].reached).toBeUndefined();
  });
});
