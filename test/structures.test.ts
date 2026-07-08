import { describe, expect, it } from 'vitest';
import {
  addStructure,
  canPlaceStructure,
  chestStorageView,
  dismantleStructure,
  homeScore,
  interactStructure,
  normalizeStructureSaves,
  normalizeStructureYaw,
  relocateStructure,
  rootCellarProvisionCapacity,
  rootCellarProvisionCount,
  rotateStructure,
  shelterReport,
  spendPlacedItem,
  spendRootCellarProvision,
  STRUCTURE_YAW_STEP,
  structureSocketCatalog,
  structureSocketOccupancy,
  structureSocketPlacement,
  structureSocketSpec,
  structureYawTurn,
  structureStationInventory,
  transferChestMaterial,
  waystoneMarkLabel,
  type StructureTopology,
  type StructureSave,
} from '../src/sim/structures';
import type { InventoryItems } from '../src/sim/crafting';

describe('Hearth and Horizon structures', () => {
  const hubTopology: StructureTopology = {
    degreeOf: (tile) => (tile === 100 ? 6 : 1),
    neighbor: (tile, edge) => (tile === 100 ? 101 + edge : 100),
  };

  it('normalizes save data and rejects unknown, invalid, or duplicate placed props', () => {
    const raw = [
      { id: 4, item: 'campfire', tile: 10, layer: 3, yaw: 0.5 },
      { id: 4, item: 'chest', tile: 11, layer: 4, yaw: 1, state: { storage: { wood: 3, nope: 9 } } },
      { id: 7, item: 'missingThing', tile: 12, layer: 4, yaw: 1 },
      { id: 8, item: 'bedroll', tile: 10, layer: 4, yaw: 1 },
      { id: 9, item: 'workbench', tile: 999, layer: 4, yaw: 1 },
      { id: 10, item: 'workbench', tile: 12, layer: 4, yaw: 1, state: { lit: true, home: true, storage: { wood: 1 }, rested: 2 } },
    ];

    const structures = normalizeStructureSaves(raw, 100, 20);
    expect(structures).toEqual([
      { id: 4, item: 'campfire', tile: 10, layer: 3, yaw: 0.5 },
      { id: 5, item: 'chest', tile: 11, layer: 4, yaw: 1, state: { storage: { wood: 3 } } },
      { id: 10, item: 'workbench', tile: 12, layer: 4, yaw: 1 },
    ]);
    expect(structureSocketOccupancy(structures[0])).toMatchObject({
      kind: 'center',
      tile: 10,
      occupancyKeys: ['10:center'],
    });
  });

  it('places center props one per tile, exposes stations, spends inventory, and scores a hearth', () => {
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

  it('only allows one placeable prop per hex tile', () => {
    const structures: StructureSave[] = [];
    const bench = addStructure(structures, { item: 'workbench', tile: 30, layer: 2, yaw: 0 })!;
    expect(bench).toMatchObject({ item: 'workbench', tile: 30 });
    expect(structureSocketPlacement(bench)).toMatchObject({ kind: 'center', occupies: ['center'] });
    expect(addStructure(structures, { item: 'campfire', tile: 30, layer: 2, yaw: 0 })).toBeNull();
    expect(addStructure(structures, { item: 'chest', tile: 31, layer: 2, yaw: 0 })).not.toBeNull();
    expect(canPlaceStructure(structures, 30, 'bedroll')).toBe(false);
    expect(canPlaceStructure(structures, 32, 'bedroll')).toBe(true);
  });

  it('defines code-owned socket dimensions for the surviving core props', () => {
    const workbench = structureSocketSpec('workbench');
    expect(workbench).toMatchObject({ item: 'workbench', role: 'crafting-station', pivot: 'center', collider: 'hex-cell' });
    const campfire = structureSocketSpec('campfire');
    expect(campfire).toMatchObject({ role: 'warmth-station' });
    const chest = structureSocketSpec('chest');
    expect(chest).toMatchObject({ role: 'storage-station' });
    const bedroll = structureSocketSpec('bedroll');
    expect(bedroll).toMatchObject({ role: 'home-rest' });
    expect(structureSocketCatalog().map((spec) => spec.item)).toEqual([
      'workbench', 'campfire', 'chest', 'bedroll',
      'rainCistern', 'rootCellar', 'dockSegment', 'fishTrap', 'shoreNet', 'dryingRack', 'weatherVane', 'lantern', 'waystone',
    ]);
  });

  it('normalizes and rotates placed props in hex-facing steps', () => {
    const structures: StructureSave[] = [];
    const bench = addStructure(structures, { item: 'workbench', tile: 6, layer: 2, yaw: -STRUCTURE_YAW_STEP })!;
    expect(bench.yaw).toBeCloseTo(Math.PI * 2 - STRUCTURE_YAW_STEP);
    expect(structureYawTurn(bench.yaw)).toBe(5);

    expect(rotateStructure(structures, bench.id, 2)).toMatchObject({
      ok: true,
      id: bench.id,
      item: 'workbench',
      turn: 1,
      message: 'rotated workbench to hex face 2',
    });
    expect(bench.yaw).toBeCloseTo(STRUCTURE_YAW_STEP);
    expect(rotateStructure(structures, bench.id, -1)).toMatchObject({ ok: true, turn: 0 });
    expect(bench.yaw).toBeCloseTo(0);
    expect(rotateStructure(structures, 999, 1)).toEqual({ ok: false, message: 'no structure' });

    const normalized = normalizeStructureSaves([{ id: 4, item: 'chest', tile: 8, layer: 2, yaw: Math.PI * 3 }], 20, 8);
    expect(normalized[0].yaw).toBeCloseTo(Math.PI);
    expect(normalizeStructureYaw(Number.NaN)).toBe(0);
  });

  it('relocates props across the snap grid while preserving identity and state', () => {
    const structures: StructureSave[] = [];
    const bench = addStructure(structures, { item: 'workbench', tile: 6, layer: 2, yaw: STRUCTURE_YAW_STEP })!;
    const other = addStructure(structures, { item: 'campfire', tile: 9, layer: 2, yaw: 0 })!;
    const chest = addStructure(structures, { item: 'chest', tile: 8, layer: 2, yaw: 0 })!;
    chest.state = { storage: { wood: 2 } };

    expect(relocateStructure(structures, bench.id, { tile: 9, layer: 2 })).toMatchObject({
      ok: false,
      id: bench.id,
      item: 'workbench',
      fromTile: 6,
      toTile: 9,
      message: 'that hex already has a prop',
      blockers: ['occupied snap target'],
    });
    expect(relocateStructure(structures, bench.id, { tile: 6, layer: 2, yaw: STRUCTURE_YAW_STEP })).toMatchObject({
      ok: false,
      id: bench.id,
      item: 'workbench',
      fromTile: 6,
      toTile: 6,
      message: 'workbench already on that snap hex',
      blockers: ['same snap target'],
    });

    const moved = relocateStructure(structures, bench.id, { tile: 10, layer: 3 });
    expect(moved).toMatchObject({
      ok: true,
      id: bench.id,
      item: 'workbench',
      fromTile: 6,
      fromLayer: 2,
      toTile: 10,
      toLayer: 3,
      turn: 1,
      message: 'moved workbench to snap hex',
    });
    expect(bench).toMatchObject({ id: 1, item: 'workbench', tile: 10, layer: 3 });
    expect(other).toMatchObject({ id: 2, item: 'campfire', tile: 9 });

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
  });

  it('recognizes a functional camp as a local cluster of warmth, station, and storage around the home bedroll', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'campfire', tile: 104, layer: 2, yaw: 0, state: { lit: true } },
      { id: 3, item: 'workbench', tile: 105, layer: 2, yaw: 0 },
      { id: 4, item: 'chest', tile: 106, layer: 2, yaw: 0 },
    ];

    const shelter = shelterReport(structures, hubTopology);
    expect(shelter).toMatchObject({
      centerTile: 100,
      hasWarmth: true,
      hasStation: true,
      hasStorage: true,
      hasLight: true,
      protected: true,
      functional: true,
      comfort: 3,
      comfortTier: 'ready',
      missing: [],
      label: 'camp ready',
    });
    expect(shelter.tiles.sort((a, b) => a - b)).toEqual([100, 101, 102, 103, 104, 105, 106]);
    expect(homeScore(structures, hubTopology)).toMatchObject({ functional: true, label: 'camp ready' });
  });

  it('keeps the shelter report empty and non-functional when no home bedroll exists', () => {
    const shelter = shelterReport([], hubTopology);

    expect(shelter).toMatchObject({
      centerTile: null,
      tiles: [],
      hasWarmth: false,
      hasStation: false,
      hasStorage: false,
      functional: false,
      protected: false,
      comfort: 0,
      comfortTier: 'none',
      missing: ['home bedroll'],
      label: 'no home bedroll',
    });
  });

  it('keeps global hearth scoring from bypassing topology-aware local shelter validation', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'campfire', tile: 104, layer: 2, yaw: 0, state: { lit: true } },
      { id: 3, item: 'workbench', tile: 200, layer: 2, yaw: 0 },
      { id: 4, item: 'chest', tile: 201, layer: 2, yaw: 0 },
    ];

    expect(homeScore(structures)).toMatchObject({ functional: true, label: 'hearth alive' });
    const local = homeScore(structures, hubTopology);
    expect(local).toMatchObject({ functional: false, label: 'warm camp' });
    expect(local.shelter).toMatchObject({
      hasWarmth: true,
      hasStation: false,
      hasStorage: false,
      comfort: 1,
      comfortTier: 'rough',
      missing: ['workbench', 'chest'],
    });
  });

  it('reports rough shelter comfort with warmth alone before workbench and chest arrive', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'campfire', tile: 101, layer: 2, yaw: 0, state: { lit: true } },
    ];

    const shelter = shelterReport(structures, hubTopology);
    expect(shelter.protected).toBe(true);
    expect(shelter.functional).toBe(false);
    expect(shelter.missing).toEqual(['workbench', 'chest']);
    expect(shelter.comfortTier).toBe('rough');
  });

  it('grants a stronger rest message inside a complete camp than a bare bedroll', () => {
    const bareStructures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0 },
    ];
    const bareRest = interactStructure(bareStructures, 1, [0, 0, 0, 0, 0], undefined, hubTopology);
    expect(bareRest).toMatchObject({ ok: true, mode: 'home', message: 'home set · rested until dawn' });

    const fullStructures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0 },
      { id: 2, item: 'campfire', tile: 104, layer: 2, yaw: 0, state: { lit: true } },
      { id: 3, item: 'workbench', tile: 105, layer: 2, yaw: 0 },
      { id: 4, item: 'chest', tile: 106, layer: 2, yaw: 0 },
    ];
    const fullRest = interactStructure(fullStructures, 1, [0, 0, 0, 0, 0], undefined, hubTopology);
    expect(fullRest).toMatchObject({ ok: true, mode: 'home', message: 'shelter rest · warmth, storage, and workbench ready' });
    expect(fullStructures[0].state?.rested).toBeGreaterThanOrEqual(2);
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

  it('toggles a lantern on and off like a campfire', () => {
    const structures: StructureSave[] = [];
    const lantern = addStructure(structures, { item: 'lantern', tile: 21, layer: 2, yaw: 0 })!;
    expect(interactStructure(structures, lantern.id, [0, 0, 0, 0, 0])).toMatchObject({ ok: true, mode: 'lit' });
    expect(lantern.state?.lit).toBe(true);
    expect(dismantleStructure(structures, lantern.id)).toMatchObject({ ok: false, blockers: ['douse light first'] });
    expect(interactStructure(structures, lantern.id, [0, 0, 0, 0, 0])).toMatchObject({ ok: true, mode: 'unlit' });
    expect(lantern.state?.lit).toBe(false);
  });

  it('lets a lit lantern light an otherwise dark camp', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 100, layer: 2, yaw: 0, state: { home: true } },
      { id: 2, item: 'lantern', tile: 101, layer: 2, yaw: 0, state: { lit: true } },
    ];
    expect(shelterReport(structures, hubTopology)).toMatchObject({ hasWarmth: false, hasLight: true });
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

    expect(interactStructure(structures, trap.id, materials, food, undefined, undefined, undefined, undefined, context(60))).toMatchObject({
      ok: true,
      mode: 'setTrap',
      message: 'baited fish trap set · baited dock run · check after 3h',
    });
    expect(food).toEqual({});
    expect(trap.state).toMatchObject({ trapSetDay: 2, trapSetMinute: 60, trapBaited: true });
    expect(dismantleStructure(structures, trap.id)).toMatchObject({ ok: false, blockers: ['fish trap is set'] });

    expect(interactStructure(structures, trap.id, materials, food, undefined, undefined, undefined, undefined, context(120))).toMatchObject({
      ok: true,
      mode: 'checkTrap',
      message: 'fish trap soaking · 120m until first check · baited dock run',
    });
    expect(trap.state).toMatchObject({ trapSetDay: 2, trapSetMinute: 60, trapBaited: true });

    expect(interactStructure(structures, trap.id, materials, food, undefined, undefined, undefined, undefined, context(450))).toMatchObject({
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

    expect(interactStructure(structures, net.id, materials, food, undefined, undefined, undefined, undefined, context(40))).toMatchObject({
      ok: true,
      mode: 'setNet',
      message: 'shore net set · reed-water fish run · comb after 150m',
    });
    expect(net.state).toMatchObject({ netSetDay: 3, netSetMinute: 40 });
    expect(dismantleStructure(structures, net.id)).toMatchObject({ ok: false, blockers: ['shore net is set'] });

    expect(interactStructure(structures, net.id, materials, food, undefined, undefined, undefined, undefined, context(80))).toMatchObject({
      ok: true,
      mode: 'checkNet',
      message: 'shore net soaking · 110m until first comb · reed-water fish run',
    });
    expect(food).toEqual({});

    expect(interactStructure(structures, net.id, materials, food, undefined, undefined, undefined, undefined, context(230))).toMatchObject({
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

  it('reads and normalizes weather vanes as forecast instruments', () => {
    const structures: StructureSave[] = [];
    const vane = addStructure(structures, { item: 'weatherVane', tile: 23, layer: 2, yaw: 0.2 })!;

    const result = interactStructure(structures, vane.id, [0, 0, 0, 0, 0], undefined, undefined, undefined, {
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

  it('collects rain and storm water in a rain cistern up to capacity', () => {
    const structures: StructureSave[] = [];
    const cistern = addStructure(structures, { item: 'rainCistern', tile: 25, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];

    expect(interactStructure(structures, cistern.id, materials, undefined, undefined, undefined, undefined, {
      kind: 'clear', label: 'clear', intensity: 0.1,
    })).toMatchObject({ ok: true, mode: 'inspect', message: 'rain cistern dry · wait for rain, storm, or mist' });

    expect(interactStructure(structures, cistern.id, materials, undefined, undefined, undefined, undefined, {
      kind: 'storm', label: 'storm front', intensity: 0.9,
    })).toMatchObject({ ok: true, mode: 'collectWater', message: 'rain cistern caught storm front water · water 2/4' });
    expect(cistern.state).toMatchObject({ water: 2, fills: 1 });

    expect(interactStructure(structures, cistern.id, materials, undefined, undefined, undefined, undefined, {
      kind: 'storm', label: 'storm front', intensity: 0.9,
    })).toMatchObject({ ok: true, mode: 'collectWater', message: 'rain cistern caught storm front water · water 4/4' });
    expect(cistern.state).toMatchObject({ water: 4, fills: 2 });

    expect(interactStructure(structures, cistern.id, materials, undefined, undefined, undefined, undefined, {
      kind: 'storm', label: 'storm front', intensity: 0.9,
    })).toMatchObject({ ok: true, mode: 'collectWater', message: 'rain cistern full · water 4/4' });
    expect(cistern.state).toMatchObject({ water: 4, fills: 2 });
    expect(dismantleStructure(structures, cistern.id)).toMatchObject({ ok: false, blockers: ['empty water first'] });

    const normalized = normalizeStructureSaves([
      { id: 6, item: 'rainCistern', tile: 26, layer: 3, yaw: 0.5, state: { water: 9, fills: 2.8 } },
    ], 50, 8);
    expect(normalized).toEqual([{ id: 6, item: 'rainCistern', tile: 26, layer: 3, yaw: 0.5, state: { water: 4, fills: 2 } }]);
  });

  it('caches root-cellar provisions for home expedition prep and feeds hearth supper', () => {
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
    expect(homeScore(structures, hubTopology)).toMatchObject({ cellarProvisions: 2 });

    expect(interactStructure(structures, cellar.id, materials, food, hubTopology)).toMatchObject({
      ok: true,
      mode: 'withdrawProvision',
      moved: { trailRation: 1 },
      message: 'pulled trail ration from root cellar · provisions 1/6',
    });
    expect(food).toEqual({ trailRation: 1 });
    expect(rootCellarProvisionCount(structures, hubTopology)).toBe(1);

    const spent = spendRootCellarProvision(structures, hubTopology);
    expect(spent).toMatchObject({ ok: true, cellarId: cellar.id, remaining: 0 });
    expect(cellar.state?.provisions).toBeUndefined();
    expect(rootCellarProvisionCount(structures, hubTopology)).toBe(0);
    expect(spendRootCellarProvision(structures, hubTopology)).toMatchObject({ ok: false, remaining: 0 });

    const normalized = normalizeStructureSaves([
      { id: 15, item: 'rootCellar', tile: 43, layer: 3, yaw: 0.5, state: { provisions: 99, caches: 2.8 } },
    ], 50, 8);
    expect(normalized).toEqual([{ id: 15, item: 'rootCellar', tile: 43, layer: 3, yaw: 0.5, state: { provisions: rootCellarProvisionCapacity(), caches: 2 } }]);
  });

  it('attunes and normalizes waystones as persistent route markers', () => {
    const structures: StructureSave[] = [];
    const stone = addStructure(structures, { item: 'waystone', tile: 20, layer: 2, yaw: 0 })!;
    const materials = [0, 0, 0, 0, 0];

    const shore = interactStructure(structures, stone.id, materials, undefined, undefined, { nearWater: true });
    expect(shore).toMatchObject({ ok: true, mode: 'mark', message: 'shore waystone attuned · shore route' });
    expect(stone.state).toMatchObject({ waystone: 'shore', markerUses: 1 });

    const cave = interactStructure(structures, stone.id, materials, undefined, undefined, { cave: true, nearWater: true });
    expect(cave.message).toBe('cave waystone attuned · cave entrance');
    expect(stone.state).toMatchObject({ waystone: 'cave', markerUses: 2 });
    expect(waystoneMarkLabel(stone.state?.waystone)).toBe('cave waystone');
    expect(dismantleStructure(structures, stone.id)).toMatchObject({ ok: false, blockers: ['waystone is attuned'] });

    const normalized = normalizeStructureSaves([
      { id: 9, item: 'waystone', tile: 21, layer: 2, yaw: 0.4, state: { waystone: 'home', markerUses: 3 } },
      { id: 10, item: 'waystone', tile: 22, layer: 2, yaw: 0.4, state: { waystone: 'bogus', markerUses: 2 } },
    ], 50, 5);
    expect(normalized[0].state).toEqual({ waystone: 'home', markerUses: 3 });
    expect(normalized[1].state).toEqual({ markerUses: 2 });
  });

  it('places dock, trap, and net props on separate hex edges without colliding', () => {
    const hexTopology: StructureTopology = { degreeOf: () => 6, neighbor: (tile, edge) => 1000 + tile * 10 + edge };
    const structures: StructureSave[] = [];
    const dock = addStructure(structures, { item: 'dockSegment', tile: 30, layer: 2, yaw: 0 }, hexTopology)!;
    expect(structureSocketPlacement(dock)).toMatchObject({ kind: 'edge', edge: 0, occupies: ['edge:0'] });

    // a fish trap on the same tile but a different edge is fine
    const trap = addStructure(structures, { item: 'fishTrap', tile: 30, layer: 2, yaw: STRUCTURE_YAW_STEP }, hexTopology);
    expect(trap).not.toBeNull();
    expect(structureSocketPlacement(trap!)).toMatchObject({ kind: 'edge', edge: 1 });

    // a shore net aimed at the same edge as the dock is blocked
    expect(addStructure(structures, { item: 'shoreNet', tile: 30, layer: 2, yaw: 0 }, hexTopology)).toBeNull();

    // a socket edge beyond a tile's real degree is rejected
    const pentagon: StructureTopology = { degreeOf: () => 5, neighbor: (tile, edge) => 2000 + tile * 10 + edge };
    expect(addStructure(structures, { item: 'fishTrap', tile: 31, layer: 2, yaw: 5 * STRUCTURE_YAW_STEP }, pentagon)).toBeNull();
  });
});
