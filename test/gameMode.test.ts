import { describe, expect, it, vi } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { Player } from '../src/player/player';
import { CoreLoop, type CoreLoopDeps } from '../src/game/coreLoop';
import { ITEM_DEFS, type Inventory } from '../src/sim/crafting';
import { StructureStore, type StructureKind } from '../src/sim/persistence';
import { createCreativeInventory, refillCreativeInventory, parseGameMode, CREATIVE_RESOURCE_STACK } from '../src/sim/gameMode';
import { Columns } from '../src/world/columns';
import { buildLayers } from '../src/world/layers';
import { Terrain } from '../src/world/terrain';
import { Trees } from '../src/world/trees';

function fixture(inventory: Inventory, creative = false) {
  const geo = new Goldberg(4), layers = buildLayers(), terrain = new Terrain('mode-test');
  const columns = new Columns(geo, layers, terrain), trees = new Trees(geo, columns, terrain, 'mode-test');
  const player = new Player(geo, layers, columns); player.spawnAt(5);
  const structures = new StructureStore(), flash = vi.fn(), changed = vi.fn();
  const deps = {
    geo, layers, columns, trees, player, structures, creative,
    streamer: { rebuildTile: vi.fn() }, hud: { flash }, audio: { playEvent: vi.fn() }, drops: { setDrops: vi.fn() },
    device: () => 'keyboard', changed, activePlanetId: () => 'planet-0',
  } as unknown as CoreLoopDeps;
  const loop = new CoreLoop(deps, { inventory, planeCrafted: false, drops: [] });
  const station = (kind: StructureKind, planetId = 'planet-0') => structures.place({
    kind, planetId, anchorTile: player.tile, offsetEast: 0, offsetNorth: 0,
    groundRadius: Math.hypot(player.px, player.py, player.pz),
  });
  return { loop, player, structures, station, flash, changed };
}

describe('Survival and Creative mode policy', () => {
  it('defaults to Survival and uses independent finite Creative stock', () => {
    expect(parseGameMode('creative')).toBe('creative'); expect(parseGameMode('survival')).toBe('survival');
    expect(parseGameMode(undefined)).toBe('survival'); expect(parseGameMode('unknown')).toBe('survival');
    const a = createCreativeInventory(), b = createCreativeInventory();
    expect(Object.keys(a).sort()).toEqual(Object.keys(ITEM_DEFS).sort());
    expect(a.planeFrame).toBe(1); expect(a.orbital_thruster).toBe(1); expect(a.thermal_hull).toBe(1);
    a.wood = Infinity; a.eco_pod = 0;
    expect(refillCreativeInventory(a)).toBe(true); expect(a.wood).toBe(CREATIVE_RESOURCE_STACK);
    expect(a.eco_pod).toBe(CREATIVE_RESOURCE_STACK); expect(refillCreativeInventory(a)).toBe(false);
    a.wood = 1; expect(b.wood).toBe(CREATIVE_RESOURCE_STACK);
    expect(Object.values(b).every(n => Number.isFinite(n) && n > 0)).toBe(true);
  });

  it.each([
    ['roast_meat', 'campfire', { raw_meat: 1, wood: 1 }, 'cooked_meat'],
    ['stone_pickaxe', 'workbench', { wood: 2, stone: 2 }, 'pickaxe'],
    ['smelt_iron', 'furnace', { iron_ore: 1, wood: 1 }, 'iron_ingot'],
  ] as const)('enforces the actual nearby station for %s before spending ingredients', (recipe, kind, supplied, output) => {
    const inventory: Inventory = { ...supplied }, { loop, station, player } = fixture(inventory);
    expect(loop.craftingRows().find(r => r.id === recipe)!.canCraft).toBe(false);
    expect(loop.craft(recipe)).toBe(false); expect(inventory).toEqual(supplied);
    station(kind, 'planet-1');
    expect(loop.craft(recipe)).toBe(false); expect(inventory).toEqual(supplied);
    station(kind);
    const x = player.px; player.px += 50;
    expect(loop.craft(recipe)).toBe(false); expect(inventory).toEqual(supplied);
    player.px = x;
    expect(loop.craftingRows().find(r => r.id === recipe)!.canCraft).toBe(true);
    expect(loop.craft(recipe)).toBe(true); expect(inventory[output]).toBe(1);
  });

  it('does not accept another kind of nearby station and still checks ingredient shortages', () => {
    const { loop, station } = fixture({ wood: 1, raw_meat: 1 });
    station('furnace'); expect(loop.craft('roast_meat')).toBe(false);
    station('campfire'); delete loop.inventory.wood;
    expect(loop.craft('roast_meat')).toBe(false); expect(loop.inventory.raw_meat).toBe(1);
  });

  it('spends survival campfire cost and allows field skiff crafting without a station', () => {
    const { loop, player } = fixture({ wood: 15, stone: 2 });
    expect(loop.placeStructure('campfire', player.tile)?.kind).toBe('campfire');
    expect(loop.inventory).toEqual({ wood: 12 });
    expect(loop.craft('plane_frame')).toBe(true); expect(loop.planeCrafted).toBe(true);
    expect(loop.inventory).toEqual({ planeFrame: 1 });
  });

  it('completes the Starfarer progression with Aurelia materials and real Furnace/Workbench stations', () => {
    const { loop, station, player } = fixture({ wood: 10, stone: 4, iron_ore: 2 });
    expect(loop.craft('orbital_thruster')).toBe(false);
    station('furnace');
    expect(loop.craft('smelt_iron')).toBe(true); expect(loop.craft('smelt_iron')).toBe(true);
    expect(loop.inventory.iron_ingot).toBe(2); expect(loop.inventory.wood).toBe(8);
    expect(loop.craft('orbital_thruster')).toBe(false);
    station('workbench');
    expect(loop.craft('orbital_thruster')).toBe(true);
    expect(loop.inventory).toEqual({ orbital_thruster: 1 });
    expect(player.hasOrbitalThruster).toBe(true);
    expect(loop.planeCrafted).toBe(true);
    loop.planeButton();
    expect(player.mode).toBe('plane');
  });

  it('supplies Creative equipment and freely crafts/builds/plants without stations or spending stock', () => {
    const { loop, player, structures } = fixture({}, true);
    expect(loop.creative).toBe(true); expect(loop.planeCrafted).toBe(true);
    expect(player.hasOrbitalThruster).toBe(true); expect(player.suitTier).toBe(3);
    const supplied = { ...loop.inventory };
    expect(loop.craftingRows().find(r => r.id === 'roast_meat')).toMatchObject({ canCraft: true, requirements: [] });
    expect(loop.craft('roast_meat')).toBe(true); expect(loop.inventory).toEqual(supplied);
    expect(loop.placeStructure('furnace', player.tile)).not.toBeNull();
    expect(structures.list('planet-0')).toHaveLength(1); expect(loop.inventory).toEqual(supplied);
    expect(loop.deployEcoPod(player.tile)).toBe(true); expect(loop.inventory).toEqual(supplied);
    loop.inventory = {}; loop.refillCreativeSupplies(); expect(loop.inventory).toEqual(supplied);
    expect(loop.craft('unknown')).toBe(false);
  });
});
