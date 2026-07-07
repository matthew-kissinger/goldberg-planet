import { describe, expect, it } from 'vitest';
import { allRecipeStatuses, craftRecipe, normalizeInventory, type InventoryItems } from '../src/sim/crafting';

describe('Hearth and Horizon crafting rules', () => {
  it('crafts a workbench from current hotbar materials and persists crafted counts separately', () => {
    const materials = [0, 2, 0, 0, 7];
    const crafted: InventoryItems = {};

    const result = craftRecipe('workbench', materials, crafted);
    expect(result.ok).toBe(true);
    expect(crafted.workbench).toBe(1);
    expect(materials).toEqual([0, 0, 0, 0, 1]);
  });

  it('requires station ownership and spends crafted parts for tools', () => {
    const materials = [0, 8, 0, 0, 4];
    const crafted: InventoryItems = {};

    expect(craftRecipe('stone_axe', materials, crafted).stationMissing?.item).toBe('workbench');
    expect(craftRecipe('sticks', materials, crafted).ok).toBe(true);
    expect(crafted.sticks).toBe(4);
    crafted.workbench = 1;

    const axe = craftRecipe('stone_axe', materials, crafted);
    expect(axe.ok).toBe(true);
    expect(crafted.stoneAxe).toBe(1);
    expect(crafted.sticks).toBe(2);
    expect(materials[1]).toBe(5);
  });

  it('crafts a compact stone hatchet as the first warding and chopping sidearm', () => {
    const materials = [0, 2, 0, 0, 0];
    const crafted: InventoryItems = { sticks: 1 };

    expect(craftRecipe('stone_hatchet', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('stone_hatchet', materials, crafted, { workbench: 1 });
    expect(result).toMatchObject({ ok: true, result: 'stoneHatchet', count: 1 });
    expect(crafted).toEqual({ stoneHatchet: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts a stone blade as the first close-control defensive tool', () => {
    const materials = [0, 3, 0, 0, 0];
    const crafted: InventoryItems = { sticks: 1, reeds: 1 };

    expect(craftRecipe('stone_blade', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('stone_blade', materials, crafted, { workbench: 1 });
    expect(result).toMatchObject({ ok: true, result: 'stoneBlade', count: 1 });
    expect(crafted).toEqual({ stoneBlade: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts a reed bow and whistling arrows for ranged native-life warding', () => {
    const bowMaterials = [0, 0, 0, 0, 2];
    const bowItems: InventoryItems = { sticks: 3, reeds: 3 };

    expect(craftRecipe('reed_bow', bowMaterials, bowItems).stationMissing?.item).toBe('workbench');

    const bow = craftRecipe('reed_bow', bowMaterials, bowItems, { workbench: 1 });
    expect(bow).toMatchObject({ ok: true, result: 'reedBow', count: 1 });
    expect(bowItems).toEqual({ reedBow: 1 });
    expect(bowMaterials).toEqual([0, 0, 0, 0, 0]);

    const arrowMaterials = [0, 1, 0, 0, 0];
    const arrowItems: InventoryItems = { sticks: 1, reeds: 2 };
    const arrows = craftRecipe('whistling_arrows', arrowMaterials, arrowItems, { workbench: 1 });
    expect(arrows).toMatchObject({ ok: true, result: 'whistlingArrow', count: 6 });
    expect(arrowItems).toEqual({ whistlingArrow: 6 });
    expect(arrowMaterials).toEqual([0, 0, 0, 0, 0]);
  });

  it('allows placed stations to unlock recipes after the station leaves inventory', () => {
    const materials = [0, 8, 0, 0, 4];
    const crafted: InventoryItems = { sticks: 4 };

    expect(craftRecipe('stone_pick', materials, crafted).stationMissing?.item).toBe('workbench');

    const pick = craftRecipe('stone_pick', materials, crafted, { workbench: 1 });
    expect(pick.ok).toBe(true);
    expect(crafted.stonePick).toBe(1);
    expect(crafted.sticks).toBe(2);
    expect(materials[1]).toBe(4);
  });

  it('reports recipe readiness and drops unknown or empty saved items', () => {
    const crafted = normalizeInventory({ workbench: 1, sticks: 0, stoneHatchet: 1, stoneBlade: 1, stonePick: 2, echoPick: 1, packFrame: 1, stormCloak: 1, repairKit: 1, reedBow: 1, whistlingArrow: 5, bait: 2, compost: 2, berries: 3, caveMushroom: 1, snowHerb: 1, kelp: 2, reeds: 3, rawFish: 1, trailRation: 2, expeditionStew: 1, glowCrystal: 2, compostBin: 1, rainCistern: 1, rootCellar: 1, caveAnchor: 1, fishTrap: 1, shoreNet: 1, dryingRack: 1, weatherVane: 1, waystone: 2, echoLantern: 1, horizonChart: 1, nope: 5 } as InventoryItems);
    expect(crafted).toEqual({ workbench: 1, stoneHatchet: 1, stoneBlade: 1, stonePick: 2, echoPick: 1, packFrame: 1, stormCloak: 1, repairKit: 1, reedBow: 1, whistlingArrow: 5, bait: 2, compost: 2, berries: 3, caveMushroom: 1, snowHerb: 1, kelp: 2, reeds: 3, rawFish: 1, trailRation: 2, expeditionStew: 1, glowCrystal: 2, compostBin: 1, rainCistern: 1, rootCellar: 1, caveAnchor: 1, fishTrap: 1, shoreNet: 1, dryingRack: 1, weatherVane: 1, waystone: 2, echoLantern: 1, horizonChart: 1 });

    const statuses = allRecipeStatuses([0, 8, 0, 0, 4], { workbench: 1, sticks: 4 });
    const pick = statuses.find((status) => status.recipe.id === 'stone_pick');
    expect(pick?.canCraft).toBe(true);
    expect(pick?.requirements.map((req) => [req.item, req.have, req.need])).toEqual([
      ['sticks', 4, 2],
      ['rock', 8, 4],
    ]);
  });

  it('turns a workbench, lantern, and cave crystals into an echo lantern', () => {
    const materials = [0, 0, 0, 0, 0];
    const crafted: InventoryItems = { lantern: 1, glowCrystal: 2 };

    expect(craftRecipe('echo_lantern', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('echo_lantern', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ echoLantern: 1 });
  });

  it('turns harvested berries into bait for stronger fishing', () => {
    const materials = [0, 0, 0, 0, 0];
    const crafted: InventoryItems = { berries: 2 };

    const result = craftRecipe('bait', materials, crafted);
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ berries: 1, bait: 3 });
  });

  it('crafts field repair kits as expedition supply for tool wear', () => {
    const materials = [0, 2, 0, 0, 0];
    const crafted: InventoryItems = { sticks: 1, reeds: 1 };

    expect(craftRecipe('field_repair_kit', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('field_repair_kit', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(result.result).toBe('repairKit');
    expect(crafted).toEqual({ repairKit: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts a pack frame as a one-time carry-capacity upgrade', () => {
    const materials = [0, 0, 0, 0, 4];
    const crafted: InventoryItems = { sticks: 4, reeds: 3 };

    expect(craftRecipe('pack_frame', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('pack_frame', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(result.result).toBe('packFrame');
    expect(crafted).toEqual({ packFrame: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts a storm cloak as a wearable weather-prep upgrade', () => {
    const materials = [0, 0, 0, 4, 0];
    const crafted: InventoryItems = { reeds: 4, kelp: 1, snowHerb: 1 };

    expect(craftRecipe('storm_cloak', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('storm_cloak', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(result.result).toBe('stormCloak');
    expect(crafted).toEqual({ stormCloak: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('upgrades stone tools into echo tools with cave crystals and repair supplies', () => {
    const axeMaterials = [0, 0, 0, 0, 0];
    const axeItems: InventoryItems = { stoneAxe: 1, repairKit: 1, glowCrystal: 1, reeds: 1 };
    expect(craftRecipe('echo_axe', axeMaterials, axeItems, { workbench: 1 }).ok).toBe(true);
    expect(axeItems).toEqual({ echoAxe: 1 });

    const pickMaterials = [0, 2, 0, 0, 0];
    const pickItems: InventoryItems = { stonePick: 1, repairKit: 1, glowCrystal: 2 };
    expect(craftRecipe('echo_pick', pickMaterials, pickItems, { workbench: 1 })).toMatchObject({ ok: true, result: 'echoPick' });
    expect(pickItems).toEqual({ echoPick: 1 });
    expect(pickMaterials).toEqual([0, 0, 0, 0, 0]);

    const shovelMaterials = [0, 0, 2, 0, 0];
    const shovelItems: InventoryItems = { stoneShovel: 1, repairKit: 1, glowCrystal: 1 };
    expect(craftRecipe('echo_shovel', shovelMaterials, shovelItems, { workbench: 1 })).toMatchObject({ ok: true, result: 'echoShovel' });
    expect(shovelItems).toEqual({ echoShovel: 1 });
    expect(shovelMaterials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts waystones as persistent route markers', () => {
    const materials = [0, 5, 1, 0, 1];
    const crafted: InventoryItems = { sticks: 1 };

    expect(craftRecipe('waystone', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('waystone', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ waystone: 2 });
    expect(materials).toEqual([0, 0, 0, 0, 1]);
  });

  it('crafts dock segments as shoreline building props', () => {
    const materials = [0, 2, 0, 0, 8];
    const crafted: InventoryItems = { sticks: 2 };

    expect(craftRecipe('dock_segment', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('dock_segment', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ dockSegment: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts fish traps as passive shore and cave food props', () => {
    const materials = [0, 0, 0, 0, 4];
    const crafted: InventoryItems = { sticks: 4, kelp: 1 };

    expect(craftRecipe('fish_trap', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('fish_trap', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ fishTrap: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts reed fish traps from waterline harvests', () => {
    const materials = [0, 0, 0, 0, 2];
    const crafted: InventoryItems = { sticks: 2, reeds: 3 };

    const result = craftRecipe('reed_fish_trap', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ fishTrap: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts shore nets from reed-bed materials', () => {
    const materials = [0, 0, 0, 0, 1];
    const crafted: InventoryItems = { sticks: 3, reeds: 4 };

    const result = craftRecipe('shore_net', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(result.result).toBe('shoreNet');
    expect(crafted).toEqual({ shoreNet: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts drying racks as preserved-food stations', () => {
    const materials = [0, 1, 0, 0, 5];
    const crafted: InventoryItems = { sticks: 3 };

    expect(craftRecipe('drying_rack', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('drying_rack', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ dryingRack: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts compost bins as farm fertility stations', () => {
    const materials = [2, 0, 0, 0, 4];
    const crafted: InventoryItems = { sticks: 2 };

    expect(craftRecipe('compost_bin', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('compost_bin', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ compostBin: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts rain cisterns as storm-water farm stations', () => {
    const materials = [0, 4, 2, 0, 4];
    const crafted: InventoryItems = {};

    expect(craftRecipe('rain_cistern', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('rain_cistern', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ rainCistern: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts root cellars as home expedition caches', () => {
    const materials = [3, 5, 0, 0, 5];
    const crafted: InventoryItems = {};

    expect(craftRecipe('root_cellar', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('root_cellar', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ rootCellar: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts cave anchors as crystal-tuned expedition markers', () => {
    const materials = [0, 3, 0, 0, 0];
    const crafted: InventoryItems = { sticks: 2, glowCrystal: 1 };

    expect(craftRecipe('cave_anchor', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('cave_anchor', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ caveAnchor: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });

  it('crafts weather vanes as route-planning camp instruments', () => {
    const materials = [0, 2, 1, 0, 3];
    const crafted: InventoryItems = { sticks: 2 };

    expect(craftRecipe('weather_vane', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('weather_vane', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ weatherVane: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
  });
});
