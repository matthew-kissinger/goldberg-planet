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

  it('crafts a compact stone hatchet as the first chopping sidearm', () => {
    const materials = [0, 2, 0, 0, 0];
    const crafted: InventoryItems = { sticks: 1 };

    expect(craftRecipe('stone_hatchet', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('stone_hatchet', materials, crafted, { workbench: 1 });
    expect(result).toMatchObject({ ok: true, result: 'stoneHatchet', count: 1 });
    expect(crafted).toEqual({ stoneHatchet: 1 });
    expect(materials).toEqual([0, 0, 0, 0, 0]);
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
    const crafted = normalizeInventory({ workbench: 1, sticks: 0, stoneHatchet: 1, stonePick: 2, echoPick: 1, packFrame: 1, repairKit: 1, bait: 2, compost: 2, berries: 3, caveMushroom: 1, snowHerb: 1, kelp: 2, reeds: 3, rawFish: 1, trailRation: 2, expeditionStew: 1, glowCrystal: 2, echoLantern: 1, nope: 5 } as InventoryItems);
    expect(crafted).toEqual({ workbench: 1, stoneHatchet: 1, stonePick: 2, echoPick: 1, packFrame: 1, repairKit: 1, bait: 2, compost: 2, berries: 3, caveMushroom: 1, snowHerb: 1, kelp: 2, reeds: 3, rawFish: 1, trailRation: 2, expeditionStew: 1, glowCrystal: 2, echoLantern: 1 });

    const statuses = allRecipeStatuses([0, 8, 0, 0, 4], { workbench: 1, sticks: 4 });
    const pick = statuses.find((status) => status.recipe.id === 'stone_pick');
    expect(pick?.canCraft).toBe(true);
    expect(pick?.requirements.map((req) => [req.item, req.have, req.need])).toEqual([
      ['sticks', 4, 2],
      ['rock', 8, 4],
    ]);
  });

  it('turns a workbench, a lantern, and cave crystals into an echo lantern', () => {
    const materials = [0, 0, 0, 0, 0];
    const crafted: InventoryItems = { lantern: 1, glowCrystal: 2 };

    expect(craftRecipe('echo_lantern', materials, crafted).stationMissing?.item).toBe('workbench');

    const result = craftRecipe('echo_lantern', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ echoLantern: 1 });
  });

  it('crafts a lantern from a workbench and terrain materials', () => {
    const materials = [0, 5, 4, 0, 3];
    const crafted: InventoryItems = {};

    const result = craftRecipe('lantern', materials, crafted, { workbench: 1 });
    expect(result.ok).toBe(true);
    expect(crafted).toEqual({ lantern: 1 });
    expect(materials).toEqual([0, 2, 2, 0, 2]);
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

});
