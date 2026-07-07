import { describe, expect, it } from 'vitest';
import {
  addStructure,
  caveAnchorKindLabel,
  chestStorageView,
  consumeWaterlineRouteResupply,
  dismantleStructure,
  homeScore,
  houseKitSocketCatalog,
  interactStructure,
  normalizeStructureSaves,
  normalizeStructureYaw,
  relocateStructure,
  rotateStructure,
  rootCellarProvisionCapacity,
  rootCellarProvisionCount,
  shelterReport,
  spendRootCellarProvision,
  spendPlacedItem,
  STRUCTURE_YAW_STEP,
  structureSocketSpec,
  structureYawTurn,
  structureStationInventory,
  transferChestMaterial,
  wallShellSocketCatalog,
  waystoneMarkLabel,
  type CropPlotEnvironment,
  type StructureTopology,
  type StructureSave,
} from '../src/sim/structures';
import type { InventoryItems } from '../src/sim/crafting';

describe('Hearth and Horizon structures', () => {
  const hubTopology: StructureTopology = {
    degreeOf: (tile) => (tile === 100 ? 6 : 1),
    neighbor: (tile, edge) => (tile === 100 ? 101 + edge : 100),
  };

  it('normalizes save data and rejects invalid or duplicate placed props', () => {
    const raw = [
      { id: 4, item: 'campfire', tile: 10, layer: 3, yaw: 0.5 },
      { id: 4, item: 'chest', tile: 11, layer: 4, yaw: 1, state: { storage: { wood: 3, nope: 9 } } },
      { id: 12, item: 'floorFoundation', tile: 12, layer: 4, yaw: 0.2, state: { lit: true } },
      { id: 13, item: 'wallPanel', tile: 13, layer: 4, yaw: 0.4, state: { storage: { wood: 5 } } },
      { id: 14, item: 'wallHalfRail', tile: 14, layer: 4, yaw: 0.6 },
      { id: 15, item: 'wallDoorPanel', tile: 15, layer: 4, yaw: 0.8, state: { lit: true } },
      { id: 16, item: 'wallWindowPanel', tile: 16, layer: 4, yaw: 1, state: { storage: { wood: 1 } } },
      { id: 17, item: 'wallCorner', tile: 17, layer: 4, yaw: 1.2, state: { home: true } },
      { id: 18, item: 'roofJoin', tile: 18, layer: 4, yaw: 1.4, state: { water: 3 } },
      { id: 7, item: 'missingThing', tile: 12, layer: 4, yaw: 1 },
      { id: 8, item: 'bedroll', tile: 10, layer: 4, yaw: 1 },
      { id: 9, item: 'lantern', tile: 999, layer: 4, yaw: 1 },
    ];

    const structures = normalizeStructureSaves(raw, 100, 20);
    expect(structures).toEqual([
      { id: 4, item: 'campfire', tile: 10, layer: 3, yaw: 0.5 },
      { id: 5, item: 'chest', tile: 11, layer: 4, yaw: 1, state: { storage: { wood: 3 } } },
      { id: 12, item: 'floorFoundation', tile: 12, layer: 4, yaw: 0.2 },
      { id: 13, item: 'wallPanel', tile: 13, layer: 4, yaw: 0.4 },
      { id: 14, item: 'wallHalfRail', tile: 14, layer: 4, yaw: 0.6 },
      { id: 15, item: 'wallDoorPanel', tile: 15, layer: 4, yaw: 0.8 },
      { id: 16, item: 'wallWindowPanel', tile: 16, layer: 4, yaw: 1 },
      { id: 17, item: 'wallCorner', tile: 17, layer: 4, yaw: 1.2 },
      { id: 18, item: 'roofJoin', tile: 18, layer: 4, yaw: 1.4 },
    ]);
  });

  it('places one prop per tile, exposes stations, spends inventory, and scores a hearth', () => {
    const structures: StructureSave[] = [];
    expect(addStructure(structures, { item: 'workbench', tile: 1, layer: 2, yaw: 0 })?.id).toBe(1);
    expect(addStructure(structures, { item: 'campfire', tile: 1, layer: 2, yaw: 0 })).toBeNull();
    expect(addStructure(structures, { item: 'campfire', tile: 2, layer: 2, yaw: 0 })?.id).toBe(2);
    expect(addStructure(structures, { item: 'chest', tile: 3, layer: 2, yaw: 0 })?.id).toBe(3);
    expect(addStructure(structures, { item: 'bedroll', tile: 4, layer: 2, yaw: 0 })?.id).toBe(4);

    expect(structureStationInventory(structures)).toEqual({ workbench: 1 });
    expect(homeScore(structures)).toMatchObject({ score: 4, hasHearth: true, functional: false, label: 'hearth ready' });

    expect(interactStructure(structures, 2, [0, 0, 0, 0, 0])).toMatchObject({ ok: true, mode: 'lit' });
    expect(interactStructure(structures, 4, [0, 0, 0, 0, 0])).toMatchObject({ ok: true, mode: 'home' });
    expect(homeScore(structures)).toMatchObject({
      score: 4,
      hasHearth: true,
      functional: true,
      litCampfire: true,
      homeBedroll: true,
      label: 'hearth alive',
    });

    const items: InventoryItems = { campfire: 2 };
    expect(spendPlacedItem(items, 'campfire')).toBe(true);
    expect(items.campfire).toBe(1);
    expect(spendPlacedItem(items, 'campfire')).toBe(true);
    expect(items.campfire).toBeUndefined();
    expect(spendPlacedItem(items, 'campfire')).toBe(false);
  });

  it('normalizes and rotates placed props in hex-facing steps', () => {
    const structures: StructureSave[] = [];
    const door = addStructure(structures, { item: 'doorKit', tile: 6, layer: 2, yaw: -STRUCTURE_YAW_STEP })!;
    expect(door.yaw).toBeCloseTo(Math.PI * 2 - STRUCTURE_YAW_STEP);
    expect(structureYawTurn(door.yaw)).toBe(5);

    expect(rotateStructure(structures, door.id, 2)).toMatchObject({
      ok: true,
      id: door.id,
      item: 'doorKit',
      turn: 1,
      message: 'rotated door kit to hex face 2',
    });
    expect(door.yaw).toBeCloseTo(STRUCTURE_YAW_STEP);
    expect(rotateStructure(structures, door.id, -1)).toMatchObject({ ok: true, turn: 0 });
    expect(door.yaw).toBeCloseTo(0);
    expect(rotateStructure(structures, 999, 1)).toEqual({ ok: false, message: 'no structure' });

    const normalized = normalizeStructureSaves([{ id: 4, item: 'windowFrame', tile: 8, layer: 2, yaw: Math.PI * 3 }], 20, 8);
    expect(normalized[0].yaw).toBeCloseTo(Math.PI);
    expect(normalizeStructureYaw(Number.NaN)).toBe(0);
  });

  it('relocates only inactive props across the snap grid while preserving identity and state', () => {
    const structures: StructureSave[] = [];
    const door = addStructure(structures, { item: 'doorKit', tile: 6, layer: 2, yaw: STRUCTURE_YAW_STEP })!;
    const chest = addStructure(structures, { item: 'chest', tile: 8, layer: 2, yaw: 0 })!;
    chest.state = { storage: { wood: 2 } };

    expect(relocateStructure(structures, door.id, { tile: 8, layer: 2 })).toMatchObject({
      ok: false,
      id: door.id,
      item: 'doorKit',
      fromTile: 6,
      toTile: 8,
      message: 'that hex already has a prop',
      blockers: ['occupied snap target'],
    });
    expect(relocateStructure(structures, door.id, { tile: 6, layer: 2 })).toMatchObject({
      ok: false,
      id: door.id,
      item: 'doorKit',
      fromTile: 6,
      toTile: 6,
      message: 'door kit already on that snap hex',
      blockers: ['same snap target'],
    });

    const moved = relocateStructure(structures, door.id, { tile: 10, layer: 3 });
    expect(moved).toMatchObject({
      ok: true,
      id: door.id,
      item: 'doorKit',
      fromTile: 6,
      fromLayer: 2,
      toTile: 10,
      toLayer: 3,
      turn: 1,
      message: 'moved door kit to snap hex',
    });
    expect(door).toMatchObject({ id: 1, item: 'doorKit', tile: 10, layer: 3 });
    expect(door.yaw).toBeCloseTo(STRUCTURE_YAW_STEP);

    expect(relocateStructure(structures, chest.id, { tile: 12, layer: 2 })).toMatchObject({
      ok: false,
      id: chest.id,
      item: 'chest',
      fromTile: 8,
      blockers: ['empty chest first'],
      message: 'chest cannot be moved · empty chest first',
    });
    expect(chest).toMatchObject({ tile: 8, layer: 2, state: { storage: { wood: 2 } } });
  });

  it('defines code-owned house-kit socket dimensions before modular GLB snapping', () => {
    const catalog = houseKitSocketCatalog();
    expect(catalog.map((entry) => entry.item)).toEqual(['doorKit', 'windowFrame', 'roofBundle']);
    expect(structureSocketSpec('doorKit')).toMatchObject({
      role: 'wall-opening',
      modularKit: true,
      gridWidth: 1,
      collider: 'thin-wall',
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    });
    expect(structureSocketSpec('windowFrame')).toMatchObject({
      role: 'wall-light',
      openingHeight: 0.52,
      pivot: 'wall-center',
    });
    expect(structureSocketSpec('roofBundle')).toMatchObject({
      role: 'roof-cap',
      collider: 'roof-shell',
      gridDepth: 1.12,
    });
  });

  it('defines code-owned wall-shell sockets separately from decorative house-kit inserts', () => {
    const catalog = wallShellSocketCatalog();
    expect(catalog.map((entry) => entry.item)).toEqual(['floorFoundation', 'wallPanel', 'wallDoorPanel', 'wallWindowPanel', 'wallCorner', 'wallHalfRail', 'roofJoin']);
    expect(structureSocketSpec('floorFoundation')).toMatchObject({
      role: 'foundation',
      modularKit: true,
      pivot: 'center',
      collider: 'hex-cell',
      loadBearing: 'code-socket',
      glbPolicy: 'procedural-only',
    });
    expect(structureSocketSpec('wallPanel')).toMatchObject({
      role: 'wall-panel',
      modularKit: true,
      pivot: 'wall-center',
      collider: 'thin-wall',
      loadBearing: 'code-socket',
    });
    expect(structureSocketSpec('wallDoorPanel')).toMatchObject({
      role: 'wall-opening',
      modularKit: true,
      openingHeight: 1.55,
      pivot: 'wall-center',
      collider: 'thin-wall',
      glbPolicy: 'procedural-only',
    });
    expect(structureSocketSpec('wallWindowPanel')).toMatchObject({
      role: 'wall-light',
      modularKit: true,
      openingWidth: 0.58,
      collider: 'thin-wall',
    });
    expect(structureSocketSpec('wallCorner')).toMatchObject({
      role: 'wall-corner',
      modularKit: true,
      gridDepth: 0.72,
      collider: 'thin-wall',
    });
    expect(structureSocketSpec('wallHalfRail')).toMatchObject({
      role: 'half-rail',
      pivot: 'wall-center',
      collider: 'thin-wall',
      visualScale: 'procedural rail stays visibly lower than full walls',
    });
    expect(structureSocketSpec('roofJoin')).toMatchObject({
      role: 'roof-join',
      modularKit: true,
      collider: 'roof-shell',
      loadBearing: 'code-socket',
    });
  });

  it('saves dock segments and identifies them as fishing platforms', () => {
    const structures: StructureSave[] = [];
    const dock = addStructure(structures, { item: 'dockSegment', tile: 8, layer: 2, yaw: 0.4 })!;

    expect(dock).toMatchObject({ id: 1, item: 'dockSegment', tile: 8, layer: 2 });
    expect(interactStructure(structures, dock.id, [0, 0, 0, 0, 0])).toMatchObject({
      ok: true,
      mode: 'inspect',
      message: 'dock segment ready · cast here with a fishing rod',
    });

    const normalized = normalizeStructureSaves([{ id: 4, item: 'dockSegment', tile: 9, layer: 3, yaw: 0.2 }], 20, 8);
    expect(normalized).toEqual([{ id: 4, item: 'dockSegment', tile: 9, layer: 3, yaw: 0.2 }]);
  });

  it('sets, checks, collects, and normalizes fish traps', () => {
    const structures: StructureSave[] = [];
    const trap = addStructure(structures, { item: 'fishTrap', tile: 15, layer: 2, yaw: 0.1 })!;
    const materials = [0, 0, 0, 0, 0];
    const food: InventoryItems = { bait: 1 };
    const context = (minute: number) => ({
      day: 2,
      minute,
      nearWater: true,
      school: {
        kind: 'dock' as const,
        label: 'baited dock run',
        strength: 0.72,
        catchCount: 2,
        baitUseful: true,
        usesBait: true,
        message: 'baited dock catch',
      },
    });

    expect(interactStructure(structures, trap.id, materials, food, undefined, undefined, undefined, undefined, undefined, undefined, context(60))).toMatchObject({
      ok: true,
      mode: 'setTrap',
      message: 'baited fish trap set · baited dock run · check after 3h',
    });
    expect(food).toEqual({});
    expect(trap.state).toMatchObject({ trapSetDay: 2, trapSetMinute: 60, trapBaited: true });
    expect(dismantleStructure(structures, trap.id)).toMatchObject({ ok: false, blockers: ['fish trap is set'] });

    expect(interactStructure(structures, trap.id, materials, food, undefined, undefined, undefined, undefined, undefined, undefined, context(120))).toMatchObject({
      ok: true,
      mode: 'checkTrap',
      message: 'fish trap soaking · 120m until first check · baited dock run',
    });
    expect(trap.state).toMatchObject({ trapSetDay: 2, trapSetMinute: 60, trapBaited: true });

    expect(interactStructure(structures, trap.id, materials, food, undefined, undefined, undefined, undefined, undefined, undefined, context(450))).toMatchObject({
      ok: true,
      mode: 'collectTrap',
      moved: { rawFish: 3 },
      message: 'fish trap hauled raw fish 3 · baited dock run',
    });
    expect(food).toEqual({ rawFish: 3 });
    expect(trap.state).toEqual({ trapChecks: 1 });

    const normalized = normalizeStructureSaves([
      { id: 8, item: 'fishTrap', tile: 16, layer: 3, yaw: 0.5, state: { trapSetDay: 1.8, trapSetMinute: 89.9, trapBaited: true, trapChecks: 2.4 } },
    ], 50, 8);
    expect(normalized).toEqual([{ id: 8, item: 'fishTrap', tile: 16, layer: 3, yaw: 0.5, state: { trapSetDay: 1, trapSetMinute: 89, trapBaited: true, trapChecks: 2 } }]);
  });

  it('sets, combs, collects, blocks packing, and normalizes shore nets', () => {
    const structures: StructureSave[] = [];
    const net = addStructure(structures, { item: 'shoreNet', tile: 17, layer: 2, yaw: 0.15 })!;
    const materials = [0, 0, 0, 0, 0];
    const food: InventoryItems = {};
    const context = (minute: number) => ({
      day: 3,
      minute,
      nearWater: true,
      school: {
        kind: 'run' as const,
        label: 'reed-water fish run',
        strength: 0.68,
        catchCount: 2,
        baitUseful: true,
        usesBait: false,
        message: 'reed-water run',
      },
    });

    expect(interactStructure(structures, net.id, materials, food, undefined, undefined, undefined, undefined, undefined, undefined, context(40))).toMatchObject({
      ok: true,
      mode: 'setNet',
      message: 'shore net set · reed-water fish run · comb after 150m',
    });
    expect(net.state).toMatchObject({ netSetDay: 3, netSetMinute: 40 });
    expect(dismantleStructure(structures, net.id)).toMatchObject({ ok: false, blockers: ['shore net is set'] });

    expect(interactStructure(structures, net.id, materials, food, undefined, undefined, undefined, undefined, undefined, undefined, context(80))).toMatchObject({
      ok: true,
      mode: 'checkNet',
      message: 'shore net soaking · 110m until first comb · reed-water fish run',
    });
    expect(food).toEqual({});

    expect(interactStructure(structures, net.id, materials, food, undefined, undefined, undefined, undefined, undefined, undefined, context(230))).toMatchObject({
      ok: true,
      mode: 'collectNet',
      moved: { rawFish: 2, reeds: 1, bait: 1 },
      message: 'shore net hauled raw fish 2, reeds 1, bait 1 · reed-water fish run',
    });
    expect(food).toEqual({ rawFish: 2, reeds: 1, bait: 1 });
    expect(net.state).toEqual({ netChecks: 1 });

    const normalized = normalizeStructureSaves([
      { id: 9, item: 'shoreNet', tile: 18, layer: 3, yaw: 0.5, state: { netSetDay: 2.8, netSetMinute: 70.9, netChecks: 3.5 } },
    ], 50, 8);
    expect(normalized).toEqual([{ id: 9, item: 'shoreNet', tile: 18, layer: 3, yaw: 0.5, state: { netSetDay: 2, netSetMinute: 70, netChecks: 3 } }]);
  });

  it('consumes staged waterline route sources without awarding duplicate inventory', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'fishTrap', tile: 10, layer: 2, yaw: 0, state: { trapSetDay: 4, trapSetMinute: 120, trapBaited: true, trapChecks: 2 } },
      { id: 2, item: 'shoreNet', tile: 11, layer: 2, yaw: 0, state: { netSetDay: 4, netSetMinute: 130, netChecks: 1 } },
      { id: 3, item: 'fishTrap', tile: 12, layer: 2, yaw: 0, state: { trapSetDay: 4, trapSetMinute: 140, trapBaited: true, trapChecks: 0 } },
      { id: 4, item: 'shoreNet', tile: 13, layer: 2, yaw: 0 },
    ];
    const food: InventoryItems = {};

    const result = consumeWaterlineRouteResupply(structures, [
      { id: 1, kind: 'fishTrap' },
      { id: 2, kind: 'shoreNet' },
      { id: 2, kind: 'shoreNet' },
      { id: 3, kind: 'shoreNet' },
      { id: 4, kind: 'shoreNet' },
    ]);

    expect(result).toEqual({ consumed: 2, traps: 1, nets: 1, sourceIds: [1, 2] });
    expect(food).toEqual({});
    expect(structures[0].state).toEqual({ trapChecks: 3 });
    expect(structures[1].state).toEqual({ netChecks: 2 });
    expect(structures[2].state).toEqual({ trapSetDay: 4, trapSetMinute: 140, trapBaited: true, trapChecks: 0 });
    expect(structures[3].state).toBeUndefined();
  });

  it('uses drying racks to preserve fish into trail rations', () => {
    const structures: StructureSave[] = [];
    const rack = addStructure(structures, { item: 'dryingRack', tile: 18, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];
    const food: InventoryItems = { rawFish: 2, kelp: 1, snowHerb: 1 };

    expect(interactStructure(structures, rack.id, materials, food)).toMatchObject({
      ok: true,
      mode: 'preserve',
      moved: { trailRation: 2 },
      message: 'dried trail rations 2 · kelp',
    });
    expect(food).toEqual({ rawFish: 1, snowHerb: 1, trailRation: 2 });
    expect(rack.state).toMatchObject({ preserves: 1 });

    expect(interactStructure(structures, rack.id, materials, food)).toMatchObject({
      ok: true,
      mode: 'preserve',
      moved: { trailRation: 2 },
      message: 'dried trail rations 2 · snow herb',
    });
    expect(food).toEqual({ trailRation: 4 });
    expect(rack.state).toMatchObject({ preserves: 2 });

    expect(interactStructure(structures, rack.id, materials, food)).toMatchObject({
      ok: false,
      mode: 'inspect',
      message: 'drying rack needs raw fish',
    });

    const normalized = normalizeStructureSaves([
      { id: 7, item: 'dryingRack', tile: 19, layer: 3, yaw: 0.5, state: { preserves: 2.8 } },
    ], 20, 8);
    expect(normalized).toEqual([{ id: 7, item: 'dryingRack', tile: 19, layer: 3, yaw: 0.5, state: { preserves: 2 } }]);
  });

  it('uses reeds as drying-rack wraps for trail rations', () => {
    const structures: StructureSave[] = [];
    const rack = addStructure(structures, { item: 'dryingRack', tile: 20, layer: 2, yaw: 0 })!;
    const food: InventoryItems = { rawFish: 1, reeds: 1 };

    expect(interactStructure(structures, rack.id, [0, 0, 0, 0, 0], food)).toMatchObject({
      ok: true,
      mode: 'preserve',
      moved: { trailRation: 2 },
      message: 'dried trail rations 2 · reeds',
    });
    expect(food).toEqual({ trailRation: 2 });
    expect(rack.state).toMatchObject({ preserves: 1 });
  });

  it('reads and normalizes weather vanes as forecast instruments', () => {
    const structures: StructureSave[] = [];
    const vane = addStructure(structures, { item: 'weatherVane', tile: 23, layer: 2, yaw: 0.2 })!;

    const result = interactStructure(structures, vane.id, [0, 0, 0, 0, 0], undefined, undefined, undefined, undefined, {
      kind: 'storm',
      label: 'storm front',
      intensity: 0.84,
    });
    expect(result).toMatchObject({
      ok: true,
      mode: 'forecast',
      message: 'weather vane reads storm front · storm timing marked',
    });
    expect(vane.state).toMatchObject({
      forecastReads: 1,
      forecastKind: 'storm',
      forecastLabel: 'storm front',
      forecastIntensity: 0.84,
    });

    const normalized = normalizeStructureSaves([
      { id: 11, item: 'weatherVane', tile: 24, layer: 3, yaw: 0.5, state: { forecastReads: 2.8, forecastKind: 'cold', forecastLabel: ' ridge cold ', forecastIntensity: 1.5 } },
    ], 50, 8);
    expect(normalized).toEqual([{ id: 11, item: 'weatherVane', tile: 24, layer: 3, yaw: 0.5, state: { forecastReads: 2, forecastKind: 'cold', forecastLabel: 'ridge cold', forecastIntensity: 1 } }]);
  });

  it('turns scraps into compost and feeds crop fertility', () => {
    const structures: StructureSave[] = [];
    const bin = addStructure(structures, { item: 'compostBin', tile: 25, layer: 2, yaw: 0 })!;
    const plot = addStructure(structures, { item: 'cropPlot', tile: 26, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];
    const food: InventoryItems = { kelp: 1, seeds: 1 };

    expect(interactStructure(structures, bin.id, materials, food)).toMatchObject({
      ok: true,
      mode: 'compost',
      moved: { compost: 2 },
      message: 'turned kelp into compost 2',
    });
    expect(food).toEqual({ seeds: 1, compost: 2 });
    expect(bin.state).toMatchObject({ composts: 1 });

    expect(interactStructure(structures, plot.id, materials, food)).toMatchObject({ ok: true, mode: 'plant' });
    expect(food).toEqual({ compost: 2 });
    expect(plot.state).toMatchObject({ crop: 'berries', growth: 1 });

    expect(interactStructure(structures, plot.id, materials, food)).toMatchObject({
      ok: true,
      mode: 'fertilize',
      moved: { compost: 1 },
      message: 'fed compost to berry plot · fertility 1/2',
    });
    expect(food).toEqual({ compost: 1 });
    expect(plot.state).toMatchObject({ fertility: 1 });

    expect(interactStructure(structures, plot.id, materials, food, undefined, {
      watered: false,
      sheltered: false,
      protected: false,
      lit: true,
      warm: false,
      cold: false,
      storm: false,
      highAltitude: false,
      label: 'dry composted plot',
    })).toMatchObject({ ok: true, mode: 'fertilize' });
    expect(food).toEqual({});
    expect(plot.state).toMatchObject({ fertility: 2 });

    expect(interactStructure(structures, plot.id, materials, food, undefined, {
      watered: false,
      sheltered: false,
      protected: false,
      lit: true,
      warm: false,
      cold: false,
      storm: false,
      highAltitude: false,
      label: 'dry composted plot',
    })).toMatchObject({ ok: true, mode: 'tend' });
    expect(plot.state?.growth).toBe(3);

    const harvest = interactStructure(structures, plot.id, materials, food, undefined, {
      watered: true,
      sheltered: true,
      protected: true,
      lit: true,
      warm: true,
      cold: false,
      storm: false,
      highAltitude: false,
      label: 'watered protected fertile plot',
    });
    expect(harvest).toMatchObject({ ok: true, mode: 'harvest', moved: { berries: 6, seeds: 3 } });
    expect(food).toEqual({ berries: 6, seeds: 3 });
    expect(plot.state).toMatchObject({ crop: 'berries', growth: 1, fertility: 1, harvests: 1 });

    const normalized = normalizeStructureSaves([
      { id: 12, item: 'compostBin', tile: 27, layer: 3, yaw: 0.5, state: { composts: 2.8 } },
      { id: 13, item: 'cropPlot', tile: 28, layer: 3, yaw: 0.5, state: { crop: 'berries', growth: 3, fertility: 2.9, harvests: 1 } },
    ], 50, 8);
    expect(normalized).toEqual([
      { id: 12, item: 'compostBin', tile: 27, layer: 3, yaw: 0.5, state: { composts: 2 } },
      { id: 13, item: 'cropPlot', tile: 28, layer: 3, yaw: 0.5, state: { crop: 'berries', growth: 3, fertility: 2, harvests: 1 } },
    ]);
  });

  it('plants waterline reed beds as crop variety and harvests reeds plus bait scraps', () => {
    const structures: StructureSave[] = [];
    const plot = addStructure(structures, { item: 'cropPlot', tile: 32, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];
    const food: InventoryItems = { reeds: 1, compost: 1 };
    const shoreEnv: CropPlotEnvironment = {
      watered: true,
      naturalWater: true,
      sheltered: false,
      protected: false,
      lit: true,
      warm: false,
      cold: true,
      storm: true,
      highAltitude: false,
      label: 'shore storm water',
    };

    expect(interactStructure(structures, plot.id, materials, food, undefined, shoreEnv)).toMatchObject({
      ok: true,
      mode: 'plantReeds',
      message: 'planted reed slips · shore storm water · reed bed',
    });
    expect(food).toEqual({ compost: 1 });
    expect(plot.state).toMatchObject({ crop: 'reeds', growth: 1 });

    expect(interactStructure(structures, plot.id, materials, food, undefined, shoreEnv)).toMatchObject({
      ok: true,
      mode: 'fertilize',
      moved: { compost: 1 },
      message: 'fed compost to reed bed · fertility 1/2',
    });
    expect(interactStructure(structures, plot.id, materials, food, undefined, shoreEnv)).toMatchObject({
      ok: true,
      mode: 'tend',
      message: 'reed bed ready to harvest · shore storm water · reed bed · composted',
    });

    const harvest = interactStructure(structures, plot.id, materials, food, undefined, shoreEnv);
    expect(harvest).toMatchObject({
      ok: true,
      mode: 'harvest',
      moved: { reeds: 5, bait: 1 },
      message: 'cut reeds 5 · bait 1 · shore storm water · reed bed · composted',
    });
    expect(food).toEqual({ reeds: 5, bait: 1 });
    expect(plot.state).toMatchObject({ crop: 'reeds', growth: 1, harvests: 1 });

    const normalized = normalizeStructureSaves([
      { id: 14, item: 'cropPlot', tile: 33, layer: 3, yaw: 0.5, state: { crop: 'reeds', growth: 2.8, fertility: 1, harvests: 3 } },
    ], 50, 8);
    expect(normalized).toEqual([
      { id: 14, item: 'cropPlot', tile: 33, layer: 3, yaw: 0.5, state: { crop: 'reeds', growth: 2, fertility: 1, harvests: 3 } },
    ]);
  });

  it('catches storm water and irrigates dry inland crop plots', () => {
    const structures: StructureSave[] = [];
    const plot = addStructure(structures, { item: 'cropPlot', tile: 40, layer: 2, yaw: 0 })!;
    const cistern = addStructure(structures, { item: 'rainCistern', tile: 41, layer: 2, yaw: 0 })!;
    const localTopology: StructureTopology = {
      degreeOf: (tile) => (tile === 40 || tile === 41 ? 1 : 0),
      neighbor: (tile) => (tile === 40 ? 41 : 40),
    };
    const materials = [0, 0, 0, 0, 0];
    const food: InventoryItems = { seeds: 1 };

    expect(interactStructure(structures, cistern.id, materials, food, localTopology, undefined, undefined, undefined, {
      kind: 'storm',
      label: 'storm front',
      intensity: 0.9,
    })).toMatchObject({
      ok: true,
      mode: 'collectWater',
      message: 'rain cistern caught storm front water · water 2/4',
    });
    expect(cistern.state).toMatchObject({ water: 2, fills: 1 });

    const cisternEnv: CropPlotEnvironment = {
      watered: true,
      naturalWater: false,
      cisternWater: 2,
      sheltered: false,
      protected: false,
      lit: true,
      warm: false,
      cold: false,
      storm: false,
      highAltitude: false,
      label: 'cistern-watered · open',
    };

    expect(interactStructure(structures, plot.id, materials, food, localTopology, cisternEnv)).toMatchObject({
      ok: true,
      mode: 'plant',
    });
    expect(food).toEqual({});
    expect(plot.state).toMatchObject({ crop: 'berries', growth: 1 });

    expect(interactStructure(structures, plot.id, materials, food, localTopology, cisternEnv)).toMatchObject({
      ok: true,
      mode: 'irrigate',
      message: 'tended berry plot 2/3 · cistern-watered · open · cistern water 1/4',
    });
    expect(plot.state?.growth).toBe(2);
    expect(cistern.state).toMatchObject({ water: 1, fills: 1 });

    expect(interactStructure(structures, plot.id, materials, food, localTopology, { ...cisternEnv, cisternWater: 1 })).toMatchObject({
      ok: true,
      mode: 'irrigate',
      message: 'berry plot ready to harvest · cistern-watered · open · cistern water 0/4',
    });
    expect(plot.state?.growth).toBe(3);
    expect(cistern.state?.water).toBeUndefined();

    const normalized = normalizeStructureSaves([
      { id: 14, item: 'rainCistern', tile: 42, layer: 3, yaw: 0.5, state: { water: 7.8, fills: 2.8 } },
    ], 50, 8);
    expect(normalized).toEqual([{ id: 14, item: 'rainCistern', tile: 42, layer: 3, yaw: 0.5, state: { water: 4, fills: 2 } }]);
  });

  it('lets rain cisterns tap nearby dry-cave spring seeps', () => {
    const structures: StructureSave[] = [];
    const cistern = addStructure(structures, { item: 'rainCistern', tile: 43, layer: 2, yaw: 0 })!;
    const dry = addStructure(structures, { item: 'rainCistern', tile: 44, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];
    const clear = { kind: 'clear' as const, label: 'clear', intensity: 0.1, exposureRate: -0.2, staminaRegen: 1 };

    expect(interactStructure(structures, cistern.id, materials, undefined, undefined, undefined, undefined, undefined, {
      ...clear,
      spring: { spring: true, label: 'spring seep', distance: 1 },
    })).toMatchObject({
      ok: true,
      mode: 'collectWater',
      message: 'rain cistern tapped spring seep · water 1/4',
    });
    expect(cistern.state).toMatchObject({ water: 1, fills: 1 });

    expect(interactStructure(structures, dry.id, materials, undefined, undefined, undefined, undefined, undefined, clear)).toMatchObject({
      ok: true,
      mode: 'inspect',
      message: 'rain cistern dry · wait for rain, storm, or a cave spring',
    });
  });

  it('caches root-cellar provisions for home expedition prep', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
    ];
    const cellar = addStructure(structures, { item: 'rootCellar', tile: 101, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];
    const food: InventoryItems = { trailRation: 1, caveMushroom: 2 };

    expect(interactStructure(structures, cellar.id, materials, food, hubTopology)).toMatchObject({
      ok: true,
      mode: 'cache',
      moved: { trailRation: 1 },
      message: 'root cellar cached trail ration · provisions 1/6',
    });
    expect(food).toEqual({ caveMushroom: 2 });
    expect(cellar.state).toMatchObject({ provisions: 1, caches: 1 });

    expect(interactStructure(structures, cellar.id, materials, food, hubTopology)).toMatchObject({
      ok: true,
      mode: 'cache',
      moved: { caveMushroom: 2 },
      message: 'root cellar cached cave mushrooms · provisions 2/6',
    });
    expect(food).toEqual({});
    expect(rootCellarProvisionCount(structures, hubTopology)).toBe(2);
    expect(homeScore(structures, hubTopology).shelter).toMatchObject({
      hasCellar: true,
      cellarProvisions: 2,
    });

    expect(interactStructure(structures, cellar.id, materials, food, hubTopology)).toMatchObject({
      ok: true,
      mode: 'withdrawProvision',
      moved: { trailRation: 1 },
      message: 'pulled trail ration from root cellar · provisions 1/6',
    });
    expect(food).toEqual({ trailRation: 1 });
    expect(rootCellarProvisionCount(structures, hubTopology)).toBe(1);
    const remote = addStructure(structures, { item: 'rootCellar', tile: 200, layer: 2, yaw: 0 })!;
    remote.state = { provisions: 3, caches: 3 };
    expect(rootCellarProvisionCount(structures, hubTopology)).toBe(1);

    const spent = spendRootCellarProvision(structures, hubTopology);
    expect(spent).toMatchObject({ ok: true, cellarId: cellar.id, remaining: 0 });
    expect(cellar.state?.provisions).toBeUndefined();
    expect(remote.state).toMatchObject({ provisions: 3 });
    expect(rootCellarProvisionCount(structures, hubTopology)).toBe(0);
    expect(spendRootCellarProvision(structures, hubTopology)).toMatchObject({ ok: false, remaining: 0 });

    const normalized = normalizeStructureSaves([
      { id: 15, item: 'rootCellar', tile: 43, layer: 3, yaw: 0.5, state: { provisions: 99, caches: 2.8 } },
    ], 50, 8);
    expect(normalized).toEqual([{ id: 15, item: 'rootCellar', tile: 43, layer: 3, yaw: 0.5, state: { provisions: rootCellarProvisionCapacity(), caches: 2 } }]);
  });

  it('counts root cellars in the wider home support ring, outside the shelter footprint', () => {
    const chainTopology: StructureTopology = {
      degreeOf: (tile) => tile === 10 ? 1 : tile === 11 ? 2 : tile === 12 ? 1 : 0,
      neighbor: (tile, edge) => {
        if (tile === 10) return 11;
        if (tile === 11) return edge === 0 ? 10 : 12;
        return 11;
      },
    };
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 10, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'rootCellar', tile: 12, layer: 2, yaw: 0, state: { provisions: 1 } },
    ];

    const shelter = shelterReport(structures, chainTopology);
    expect(shelter.tiles).toEqual([10, 11]);
    expect(shelter.cellarProvisions).toBe(1);
    expect(rootCellarProvisionCount(structures, chainTopology)).toBe(1);

    expect(spendRootCellarProvision(structures, chainTopology)).toMatchObject({ ok: true, cellarId: 2, remaining: 0 });
    expect(rootCellarProvisionCount(structures, chainTopology)).toBe(0);
  });

  it('sets and normalizes cave anchors as persistent cave expedition markers', () => {
    const structures: StructureSave[] = [];
    const anchor = addStructure(structures, { item: 'caveAnchor', tile: 31, layer: 5, yaw: 0.1 })!;
    const materials = [0, 0, 0, 0, 0];

    expect(interactStructure(structures, anchor.id, materials)).toMatchObject({
      ok: false,
      mode: 'inspect',
      message: 'cave anchor needs a nearby cave mouth or arch',
    });

    const result = interactStructure(structures, anchor.id, materials, undefined, undefined, undefined, undefined, undefined, undefined, {
      tile: 34,
      kind: 'dryCave',
      label: 'basalt throat',
      depth: 12.75,
      flooded: false,
      spring: true,
      clearance: 4,
      distance: 1,
      mouth: true,
    });
    expect(result).toMatchObject({
      ok: true,
      mode: 'anchor',
      message: 'cave anchor set · basalt throat 1 ring away · depth 12.8 m · clearance 4 cells · spring seep',
    });
    expect(anchor.state).toMatchObject({
      anchorUses: 1,
      anchorKind: 'dryCave',
      anchorLabel: 'basalt throat',
      anchorDepth: 12.75,
      anchorDistance: 1,
      anchorFlooded: false,
      anchorSpring: true,
      anchorClearance: 4,
      anchorTile: 34,
    });
    expect(caveAnchorKindLabel(anchor.state?.anchorKind)).toBe('dry cave');

    const normalized = normalizeStructureSaves([
      { id: 16, item: 'caveAnchor', tile: 44, layer: 3, yaw: 0.5, state: { anchorUses: 2.8, anchorKind: 'seaCave', anchorLabel: ' blue wash ', anchorDepth: 999, anchorDistance: 6.8, anchorFlooded: true, anchorSpring: true, anchorClearance: 80, anchorTile: 45.9 } },
    ], 50, 8);
    expect(normalized).toEqual([{ id: 16, item: 'caveAnchor', tile: 44, layer: 3, yaw: 0.5, state: { anchorUses: 2, anchorKind: 'seaCave', anchorLabel: 'blue wash', anchorDepth: 128, anchorDistance: 6, anchorFlooded: true, anchorSpring: true, anchorClearance: 64, anchorTile: 45 } }]);
  });

  it('uses a chest as quick material storage and retrieval', () => {
    const structures: StructureSave[] = [];
    const chest = addStructure(structures, { item: 'chest', tile: 7, layer: 2, yaw: 0 })!;
    const materials = [8, 6, 0, 0, 10];

    const deposit = interactStructure(structures, chest.id, materials);
    expect(deposit).toMatchObject({ ok: true, mode: 'deposit' });
    expect(materials).toEqual([4, 3, 0, 0, 5]);
    expect(chest.state?.storage).toEqual({ dirt: 4, rock: 3, wood: 5 });
    expect(homeScore(structures).storedItems).toBe(12);

    const withdraw = interactStructure(structures, chest.id, materials);
    expect(withdraw).toMatchObject({ ok: true, mode: 'withdraw' });
    expect(materials).toEqual([8, 6, 0, 0, 10]);
    expect(chest.state?.storage).toBeUndefined();
  });

  it('supports explicit chest storage rows and one/all material transfers', () => {
    const structures: StructureSave[] = [];
    const chest = addStructure(structures, { item: 'chest', tile: 7, layer: 2, yaw: 0 })!;
    const materials = [3, 0, 0, 0, 4];

    expect(chestStorageView(chest, materials)).toMatchObject({
      id: chest.id,
      storedTotal: 0,
      packTotal: 7,
      rows: expect.arrayContaining([
        expect.objectContaining({ item: 'dirt', pack: 3, stored: 0, canDeposit: true, canWithdraw: false }),
        expect.objectContaining({ item: 'wood', pack: 4, stored: 0, canDeposit: true, canWithdraw: false }),
      ]),
    });

    expect(transferChestMaterial(chest, materials, 'wood', 'depositAll')).toMatchObject({
      ok: true,
      mode: 'deposit',
      moved: { wood: 4 },
      message: 'stashed wood 4 · chest 4',
    });
    expect(materials).toEqual([3, 0, 0, 0, 0]);
    expect(chest.state?.storage).toEqual({ wood: 4 });

    expect(transferChestMaterial(chest, materials, 'dirt', 'depositOne')).toMatchObject({
      ok: true,
      mode: 'deposit',
      moved: { dirt: 1 },
    });
    expect(materials).toEqual([2, 0, 0, 0, 0]);
    expect(chest.state?.storage).toEqual({ dirt: 1, wood: 4 });

    expect(transferChestMaterial(chest, materials, 'wood', 'withdrawOne')).toMatchObject({
      ok: true,
      mode: 'withdraw',
      moved: { wood: 1 },
    });
    expect(materials).toEqual([2, 0, 0, 0, 1]);
    expect(chest.state?.storage).toEqual({ dirt: 1, wood: 3 });

    expect(transferChestMaterial(chest, materials, 'dirt', 'withdrawAll')).toMatchObject({
      ok: true,
      mode: 'withdraw',
      moved: { dirt: 1 },
    });
    expect(materials).toEqual([3, 0, 0, 0, 1]);
    expect(chest.state?.storage).toEqual({ wood: 3 });

    expect(chestStorageView(chest, materials)).toMatchObject({
      storedTotal: 3,
      packTotal: 4,
      rows: expect.arrayContaining([
        expect.objectContaining({ item: 'wood', pack: 1, stored: 3, canDeposit: true, canWithdraw: true }),
      ]),
    });

    expect(transferChestMaterial(chest, materials, 'sand', 'withdrawOne')).toMatchObject({
      ok: false,
      mode: 'inspect',
      message: 'no sand in chest',
    });
  });

  it('packs empty placed props back into inventory but refuses active or stocked props', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'workbench', tile: 10, layer: 2, yaw: 0 },
      { id: 2, item: 'chest', tile: 11, layer: 2, yaw: 0, state: { storage: { wood: 3 } } },
      { id: 3, item: 'campfire', tile: 12, layer: 2, yaw: 0, state: { lit: true } },
      { id: 4, item: 'bedroll', tile: 13, layer: 2, yaw: 0, state: { home: true } },
      { id: 5, item: 'cropPlot', tile: 14, layer: 2, yaw: 0, state: { crop: 'berries', growth: 2 } },
      { id: 6, item: 'rainCistern', tile: 15, layer: 2, yaw: 0, state: { water: 2 } },
      { id: 7, item: 'rootCellar', tile: 16, layer: 2, yaw: 0, state: { provisions: 1 } },
      { id: 8, item: 'waystone', tile: 17, layer: 2, yaw: 0, state: { waystone: 'home' } },
      { id: 9, item: 'caveAnchor', tile: 18, layer: 2, yaw: 0, state: { anchorKind: 'dryCave' } },
    ];

    expect(dismantleStructure(structures, 1)).toEqual({
      ok: true,
      id: 1,
      item: 'workbench',
      message: 'packed workbench',
    });
    expect(structures.some((structure) => structure.id === 1)).toBe(false);

    expect(dismantleStructure(structures, 2)).toMatchObject({ ok: false, blockers: ['empty chest first'] });
    expect(dismantleStructure(structures, 3)).toMatchObject({ ok: false, blockers: ['douse light first'] });
    expect(dismantleStructure(structures, 4)).toMatchObject({ ok: false, blockers: ['home bedroll is set'] });
    expect(dismantleStructure(structures, 5)).toMatchObject({ ok: false, blockers: ['clear crop first'] });
    expect(dismantleStructure(structures, 6)).toMatchObject({ ok: false, blockers: ['empty water first'] });
    expect(dismantleStructure(structures, 7)).toMatchObject({ ok: false, blockers: ['empty provisions first'] });
    expect(dismantleStructure(structures, 8)).toMatchObject({ ok: false, blockers: ['waystone is attuned'] });
    expect(dismantleStructure(structures, 9)).toMatchObject({ ok: false, blockers: ['cave anchor is set'] });
  });

  it('recognizes a functional shelter as a local cluster around the home bedroll', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofBundle', tile: 101, layer: 2, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: 102, layer: 2, yaw: 0 },
      { id: 4, item: 'doorKit', tile: 103, layer: 2, yaw: 0 },
      { id: 5, item: 'campfire', tile: 104, layer: 2, yaw: 0, state: { lit: true } },
      { id: 6, item: 'workbench', tile: 105, layer: 2, yaw: 0 },
      { id: 7, item: 'chest', tile: 106, layer: 2, yaw: 0 },
      { id: 8, item: 'windowFrame', tile: 200, layer: 2, yaw: 0 },
    ];

    const shelter = shelterReport(structures, hubTopology);
    expect(shelter).toMatchObject({
      centerTile: 100,
      roofPieces: 2,
      hasDoor: true,
      hasWarmth: true,
      hasStation: true,
      hasStorage: true,
      hasWindow: false,
      protected: true,
      functional: true,
      label: 'shelter alive',
      enclosure: {
        roofTiles: [101, 102],
        openingTiles: [103],
        utilityTiles: [104, 105, 106],
        roofCoverage: 1,
        utilityCoverage: 1,
        doorOnBoundary: true,
        warmthInside: true,
        workbenchInside: true,
        storageInside: true,
        enclosed: true,
        serviceReady: true,
        comfortTier: 'working',
        label: 'working shelter room',
      },
    });
    expect(shelter.tiles).toEqual([100, 101, 102, 103, 104, 105, 106]);
    expect(shelter.enclosure.boundaryTiles).toEqual([101, 102, 103, 104, 105, 106]);
    expect(shelter.enclosure.boundaryCoverage).toBeCloseTo(0.75);
    expect(homeScore(structures, hubTopology)).toMatchObject({ functional: true, label: 'shelter alive' });
  });

  it('keeps the empty shelter enclosure stable when no home bedroll exists', () => {
    const shelter = shelterReport([], hubTopology);

    expect(shelter).toMatchObject({
      centerTile: null,
      functional: false,
      protected: false,
      missing: ['home bedroll'],
      enclosure: {
        roomTiles: [],
        boundaryTiles: [],
        supportTiles: [],
        roofTiles: [],
        openingTiles: [],
        utilityTiles: [],
        enclosed: false,
        serviceReady: false,
        comfortTier: 'none',
        label: 'no room',
      },
    });
  });

  it('keeps global hearth scoring from bypassing topology-aware room validation', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'campfire', tile: 104, layer: 2, yaw: 0, state: { lit: true } },
      { id: 3, item: 'workbench', tile: 200, layer: 2, yaw: 0 },
      { id: 4, item: 'chest', tile: 201, layer: 2, yaw: 0 },
      { id: 5, item: 'doorKit', tile: 202, layer: 2, yaw: 0 },
      { id: 6, item: 'roofBundle', tile: 203, layer: 2, yaw: 0 },
      { id: 7, item: 'roofBundle', tile: 204, layer: 2, yaw: 0 },
    ];

    expect(homeScore(structures)).toMatchObject({ functional: true, label: 'hearth alive' });
    const local = homeScore(structures, hubTopology);
    expect(local).toMatchObject({ functional: false, label: 'shelter needs roof 0/2' });
    expect(local.shelter.enclosure).toMatchObject({
      roofTiles: [],
      openingTiles: [],
      utilityTiles: [104],
      enclosed: false,
      serviceReady: false,
      utilityCoverage: 1 / 3,
    });
  });

  it('separates spatial enclosure from warmth and utility readiness', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofBundle', tile: 101, layer: 2, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: 102, layer: 2, yaw: 0 },
      { id: 4, item: 'doorKit', tile: 103, layer: 2, yaw: 0 },
      { id: 5, item: 'workbench', tile: 104, layer: 2, yaw: 0 },
      { id: 6, item: 'chest', tile: 105, layer: 2, yaw: 0 },
    ];

    const shelter = shelterReport(structures, hubTopology);
    expect(shelter.protected).toBe(false);
    expect(shelter.functional).toBe(false);
    expect(shelter.missing).toContain('lit campfire');
    expect(shelter.enclosure).toMatchObject({
      enclosed: true,
      serviceReady: false,
      warmthInside: false,
      workbenchInside: true,
      storageInside: true,
      comfortTier: 'rough',
      label: 'open room needs lit campfire',
    });
  });

  it('recognizes a weather-safe room before it becomes a functional workshop', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofBundle', tile: 101, layer: 2, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: 102, layer: 2, yaw: 0 },
      { id: 4, item: 'doorKit', tile: 103, layer: 2, yaw: 0 },
      { id: 5, item: 'campfire', tile: 104, layer: 2, yaw: 0, state: { lit: true } },
    ];

    const shelter = shelterReport(structures, hubTopology);
    expect(shelter).toMatchObject({
      protected: true,
      functional: false,
      label: 'weather safe',
      enclosure: {
        enclosed: true,
        serviceReady: false,
        warmthInside: true,
        workbenchInside: false,
        storageInside: false,
        comfortTier: 'weather-safe',
        label: 'weather-safe room',
      },
    });
    expect(shelter.missing).toEqual(['workbench', 'chest']);
  });

  it('counts full wall panels as the first C6 shell boundary authority', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofBundle', tile: 101, layer: 2, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: 102, layer: 2, yaw: 0 },
      { id: 4, item: 'doorKit', tile: 103, layer: 2, yaw: 0 },
      { id: 5, item: 'wallPanel', tile: 104, layer: 2, yaw: 0 },
      { id: 6, item: 'wallPanel', tile: 105, layer: 2, yaw: 0 },
      { id: 7, item: 'campfire', tile: 106, layer: 2, yaw: 0, state: { lit: true } },
      { id: 8, item: 'floorFoundation', tile: 200, layer: 2, yaw: 0 },
    ];

    const shelter = shelterReport(structures, hubTopology);
    expect(shelter).toMatchObject({
      protected: true,
      functional: false,
      label: 'weather safe',
      enclosure: {
        wallTiles: [104, 105],
        railTiles: [],
        foundationTiles: [],
        roofTiles: [101, 102],
        openingTiles: [103],
        boundaryCoverage: 0.75,
        enclosed: true,
        comfortTier: 'weather-safe',
      },
    });
    expect(shelter.missing).toEqual(['workbench', 'chest']);
  });

  it('counts integrated wall door/window panels, corners, and roof joins without double-counting tiles', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofJoin', tile: 101, layer: 2, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: 102, layer: 2, yaw: 0 },
      { id: 4, item: 'wallDoorPanel', tile: 103, layer: 2, yaw: 0 },
      { id: 5, item: 'wallWindowPanel', tile: 104, layer: 2, yaw: 0 },
      { id: 6, item: 'wallCorner', tile: 105, layer: 2, yaw: 0 },
      { id: 7, item: 'campfire', tile: 106, layer: 2, yaw: 0, state: { lit: true } },
    ];

    const shelter = shelterReport(structures, hubTopology);
    expect(shelter).toMatchObject({
      roofPieces: 2,
      hasDoor: true,
      hasWindow: true,
      hasWarmth: true,
      protected: true,
      functional: false,
      comfort: 4,
      enclosure: {
        wallTiles: [103, 104, 105],
        cornerTiles: [105],
        roofTiles: [101, 102],
        roofJoinTiles: [101],
        openingTiles: [103, 104],
        boundaryCoverage: 0.75,
        doorOnBoundary: true,
        enclosed: true,
        comfortTier: 'weather-safe',
      },
    });
    expect(shelter.missing).toEqual(['workbench', 'chest']);
  });

  it('does not double-count an integrated door panel as two boundary tiles', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofJoin', tile: 101, layer: 2, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: 102, layer: 2, yaw: 0 },
      { id: 4, item: 'wallDoorPanel', tile: 103, layer: 2, yaw: 0 },
      { id: 5, item: 'campfire', tile: 104, layer: 2, yaw: 0, state: { lit: true } },
    ];

    const shelter = shelterReport(structures, hubTopology);
    expect(shelter.hasDoor).toBe(true);
    expect(shelter.enclosure.boundaryCoverage).toBeCloseTo(0.25);
    expect(shelter.protected).toBe(false);
    expect(shelter.missing).toContain('room boundary');
  });

  it('does not let an integrated window panel satisfy the required door', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofJoin', tile: 101, layer: 2, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: 102, layer: 2, yaw: 0 },
      { id: 4, item: 'wallWindowPanel', tile: 103, layer: 2, yaw: 0 },
      { id: 5, item: 'wallPanel', tile: 104, layer: 2, yaw: 0 },
      { id: 6, item: 'wallCorner', tile: 105, layer: 2, yaw: 0 },
      { id: 7, item: 'campfire', tile: 106, layer: 2, yaw: 0, state: { lit: true } },
    ];

    const shelter = shelterReport(structures, hubTopology);
    expect(shelter.hasWindow).toBe(true);
    expect(shelter.hasDoor).toBe(false);
    expect(shelter.protected).toBe(false);
    expect(shelter.enclosure.boundaryCoverage).toBeCloseTo(0.75);
    expect(shelter.missing).toContain('door');
  });

  it('keeps foundations and half rails from pretending to be sealed walls', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofBundle', tile: 101, layer: 2, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: 102, layer: 2, yaw: 0 },
      { id: 4, item: 'doorKit', tile: 103, layer: 2, yaw: 0 },
      { id: 5, item: 'wallHalfRail', tile: 104, layer: 2, yaw: 0 },
      { id: 6, item: 'floorFoundation', tile: 105, layer: 2, yaw: 0 },
      { id: 7, item: 'campfire', tile: 106, layer: 2, yaw: 0, state: { lit: true } },
    ];

    const shelter = shelterReport(structures, hubTopology);
    expect(shelter.protected).toBe(false);
    expect(shelter.missing).toContain('room boundary');
    expect(shelter.enclosure).toMatchObject({
      wallTiles: [],
      railTiles: [104],
      foundationTiles: [105],
      boundaryCoverage: 0.25,
      enclosed: false,
      comfortTier: 'rough',
      label: 'open room needs room boundary',
    });
  });

  it('keeps incomplete or distant shelter props from granting full shelter rest', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0 },
      { id: 2, item: 'roofBundle', tile: 101, layer: 2, yaw: 0 },
      { id: 3, item: 'doorKit', tile: 103, layer: 2, yaw: 0 },
      { id: 4, item: 'campfire', tile: 104, layer: 2, yaw: 0, state: { lit: true } },
      { id: 5, item: 'workbench', tile: 200, layer: 2, yaw: 0 },
      { id: 6, item: 'chest', tile: 201, layer: 2, yaw: 0 },
    ];

    const rest = interactStructure(structures, 1, [0, 0, 0, 0, 0], undefined, hubTopology);
    expect(rest).toMatchObject({ ok: true, mode: 'home', message: 'home set · rested until dawn' });
    const shelter = homeScore(structures, hubTopology).shelter;
    expect(shelter.functional).toBe(false);
    expect(shelter.missing).toContain('roof 1/2');
    expect(shelter.missing).toContain('workbench');
    expect(shelter.missing).toContain('chest');
    expect(shelter.enclosure).toMatchObject({
      enclosed: false,
      serviceReady: false,
      roofCoverage: 0.5,
      utilityCoverage: 1 / 3,
      comfortTier: 'rough',
      label: 'open room needs roof 1/2',
    });
  });

  it('grants a stronger rest message inside a complete shelter', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0 },
      { id: 2, item: 'roofBundle', tile: 101, layer: 2, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: 102, layer: 2, yaw: 0 },
      { id: 4, item: 'doorKit', tile: 103, layer: 2, yaw: 0 },
      { id: 5, item: 'campfire', tile: 104, layer: 2, yaw: 0, state: { lit: true } },
      { id: 6, item: 'workbench', tile: 105, layer: 2, yaw: 0 },
      { id: 7, item: 'chest', tile: 106, layer: 2, yaw: 0 },
    ];

    expect(interactStructure(structures, 1, [0, 0, 0, 0, 0], undefined, hubTopology)).toMatchObject({
      ok: true,
      mode: 'home',
      message: 'shelter rest · warmth, storage, and workbench ready',
    });
    expect(structures[0].state).toMatchObject({ home: true, rested: 2 });
  });

  it('plants, tends, and harvests crop plots into food inventory', () => {
    const structures: StructureSave[] = [];
    const plot = addStructure(structures, { item: 'cropPlot', tile: 12, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];
    const food: InventoryItems = { seeds: 1 };

    expect(interactStructure(structures, plot.id, materials, food)).toMatchObject({ ok: true, mode: 'plant' });
    expect(food.seeds).toBeUndefined();
    expect(plot.state).toMatchObject({ crop: 'berries', growth: 1 });

    expect(interactStructure(structures, plot.id, materials, food)).toMatchObject({ ok: true, mode: 'tend' });
    expect(plot.state?.growth).toBe(2);
    expect(interactStructure(structures, plot.id, materials, food)).toMatchObject({ ok: true, mode: 'tend' });
    expect(plot.state?.growth).toBe(3);

    expect(interactStructure(structures, plot.id, materials, food)).toMatchObject({ ok: true, mode: 'harvest' });
    expect(food).toEqual({ berries: 3, seeds: 1 });
    expect(plot.state).toMatchObject({ crop: 'berries', growth: 1, harvests: 1 });
  });

  it('makes crop plots wait when dry, cold, dark, or storm exposed', () => {
    const structures: StructureSave[] = [];
    const plot = addStructure(structures, { item: 'cropPlot', tile: 12, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];
    const food: InventoryItems = { seeds: 1 };
    const dry: CropPlotEnvironment = {
      watered: false,
      sheltered: false,
      protected: false,
      lit: true,
      warm: false,
      cold: false,
      storm: false,
      highAltitude: false,
      label: 'dry open',
    };

    expect(interactStructure(structures, plot.id, materials, food, undefined, dry)).toMatchObject({ ok: true, mode: 'plant' });
    expect(plot.state).toMatchObject({ crop: 'berries', growth: 1 });

    const dryWait = interactStructure(structures, plot.id, materials, food, undefined, dry);
    expect(dryWait.message).toContain('needs nearby water');
    expect(plot.state?.growth).toBe(1);

    const coldWait = interactStructure(structures, plot.id, materials, food, undefined, {
      ...dry,
      watered: true,
      cold: true,
      highAltitude: true,
      label: 'watered cold ridge',
    });
    expect(coldWait.message).toContain('needs ridge warmth');
    expect(plot.state?.growth).toBe(1);

    const stormWait = interactStructure(structures, plot.id, materials, food, undefined, {
      ...dry,
      watered: true,
      storm: true,
      label: 'watered storm open',
    });
    expect(stormWait.message).toContain('needs storm cover');
    expect(plot.state?.growth).toBe(1);

    const grow = interactStructure(structures, plot.id, materials, food, undefined, {
      ...dry,
      watered: true,
      protected: true,
      storm: true,
      label: 'watered protected storm plot',
    });
    expect(grow).toMatchObject({ ok: true, mode: 'tend' });
    expect(plot.state?.growth).toBe(2);
  });

  it('gives protected watered crop plots a better harvest', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'cropPlot', tile: 12, layer: 2, yaw: 0, state: { crop: 'berries', growth: 3 } },
    ];
    const food: InventoryItems = {};
    const env: CropPlotEnvironment = {
      watered: true,
      sheltered: true,
      protected: true,
      lit: true,
      warm: true,
      cold: false,
      storm: true,
      highAltitude: false,
      label: 'watered protected warm storm plot',
    };

    const harvest = interactStructure(structures, 1, [0, 0, 0, 0, 0], food, undefined, env);
    expect(harvest).toMatchObject({ ok: true, mode: 'harvest', moved: { berries: 4, seeds: 2 } });
    expect(food).toEqual({ berries: 4, seeds: 2 });
    expect(structures[0].state).toMatchObject({ crop: 'berries', growth: 1, harvests: 1 });
  });

  it('uses lit campfires for fish and camp-meal cooking before dousing', () => {
    const structures: StructureSave[] = [];
    const fire = addStructure(structures, { item: 'campfire', tile: 13, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];
    const food: InventoryItems = { rawFish: 2, berries: 1 };

    expect(interactStructure(structures, fire.id, materials, food)).toMatchObject({ ok: true, mode: 'lit' });
    expect(fire.state?.lit).toBe(true);
    expect(food.rawFish).toBe(2);

    expect(interactStructure(structures, fire.id, materials, food)).toMatchObject({ ok: true, mode: 'cook', moved: { cookedFish: 1 } });
    expect(food).toMatchObject({ rawFish: 1, cookedFish: 1, berries: 1 });

    expect(interactStructure(structures, fire.id, materials, food)).toMatchObject({ ok: true, mode: 'cook', moved: { campMeal: 1 } });
    expect(food).toEqual({ rawFish: 1, campMeal: 1 });

    expect(interactStructure(structures, fire.id, materials, food)).toMatchObject({ ok: true, mode: 'cook', moved: { cookedFish: 1 } });
    expect(food).toEqual({ campMeal: 1, cookedFish: 1 });

    expect(interactStructure(structures, fire.id, materials, food)).toMatchObject({ ok: true, mode: 'unlit' });
    expect(fire.state?.lit).toBe(false);
  });

  it('cooks preserved expedition stew at a lit campfire', () => {
    const structures: StructureSave[] = [];
    const fire = addStructure(structures, { item: 'campfire', tile: 14, layer: 2, yaw: 0 })!;
    fire.state = { lit: true };
    const materials = [0, 0, 0, 0, 0];
    const mushroomFood: InventoryItems = { campMeal: 1, trailRation: 1, caveMushroom: 1, snowHerb: 1 };

    expect(interactStructure(structures, fire.id, materials, mushroomFood)).toMatchObject({
      ok: true,
      mode: 'cook',
      moved: { expeditionStew: 1 },
      message: 'cooked expedition stew · cave mushroom',
    });
    expect(mushroomFood).toEqual({ snowHerb: 1, expeditionStew: 1 });

    const herbFood: InventoryItems = { campMeal: 1, trailRation: 1, snowHerb: 1 };
    expect(interactStructure(structures, fire.id, materials, herbFood)).toMatchObject({
      ok: true,
      mode: 'cook',
      moved: { expeditionStew: 1 },
      message: 'cooked expedition stew · snow herb',
    });
    expect(herbFood).toEqual({ expeditionStew: 1 });
  });

  it('attunes and normalizes waystones as persistent route markers', () => {
    const structures: StructureSave[] = [];
    const stone = addStructure(structures, { item: 'waystone', tile: 20, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];

    const shore = interactStructure(structures, stone.id, materials, undefined, undefined, undefined, { nearWater: true });
    expect(shore).toMatchObject({ ok: true, mode: 'mark', message: 'shore waystone attuned · shore route' });
    expect(stone.state).toMatchObject({ waystone: 'shore', markerUses: 1 });

    const cave = interactStructure(structures, stone.id, materials, undefined, undefined, undefined, { cave: true, nearWater: true });
    expect(cave.message).toBe('cave waystone attuned · cave entrance');
    expect(stone.state).toMatchObject({ waystone: 'cave', markerUses: 2 });
    expect(waystoneMarkLabel(stone.state?.waystone)).toBe('cave waystone');

    const normalized = normalizeStructureSaves([
      { id: 9, item: 'waystone', tile: 21, layer: 2, yaw: 0.4, state: { waystone: 'home', markerUses: 3 } },
      { id: 10, item: 'waystone', tile: 22, layer: 2, yaw: 0.4, state: { waystone: 'bogus', markerUses: 2 } },
    ], 50, 5);
    expect(normalized[0].state).toEqual({ waystone: 'home', markerUses: 3 });
    expect(normalized[1].state).toEqual({ markerUses: 2 });
  });
});
