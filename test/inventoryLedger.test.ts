import { describe, expect, it } from 'vitest';
import { buildInventoryLedger, mealUnitsForInventory, packBurdenForInventory, packCapacityBonusForInventory } from '../src/sim/inventoryLedger';
import type { InventoryItems } from '../src/sim/crafting';

describe('Pack Ledger inventory view', () => {
  it('groups hotbar materials and crafted survival items into loop-focused sections', () => {
    const materials = [3, 4, 0, 0, 6];
    const crafted: InventoryItems = {
      sticks: 2,
      stoneHatchet: 1,
      stoneBlade: 1,
      stonePick: 1,
      repairKit: 2,
      reedBow: 1,
      whistlingArrow: 5,
      cookedFish: 1,
      campMeal: 1,
      chest: 1,
      waystone: 2,
      horizonChart: 1,
    };

    const ledger = buildInventoryLedger(materials, crafted, { stoneBlade: 4, stonePick: 9, reedBow: 3 });
    const section = (id: string) => ledger.sections.find((s) => s.id === id);

    expect(ledger.title).toBe('Pack Ledger');
    expect(ledger.summary).toContain('light pack');
    expect(ledger.summary).toContain('3.4 meal units');
    expect(ledger.burden).toMatchObject({ status: 'light', sprintBlocked: false });
    expect(section('materials')?.entries.map((entry) => entry.item)).toEqual(['dirt', 'rock', 'wood']);
    expect(section('tools')?.entries.map((entry) => entry.item)).toEqual(['stoneHatchet', 'stoneBlade', 'stonePick', 'repairKit', 'reedBow']);
    expect(section('food')?.entries.map((entry) => entry.item)).toEqual(['cookedFish', 'campMeal']);
    expect(section('build')?.entries.map((entry) => entry.item)).toEqual(['chest']);
    expect(section('route')?.entries.map((entry) => entry.item)).toEqual(['waystone', 'horizonChart']);
    expect(section('parts')?.entries.map((entry) => entry.item)).toEqual(['sticks', 'whistlingArrow']);
    expect(section('tools')?.entries.find((entry) => entry.item === 'stoneHatchet')?.detail).toBe('24/24 uses · wood');
    expect(section('tools')?.entries.find((entry) => entry.item === 'stoneBlade')?.detail).toBe('26/30 uses · defense');
    expect(section('tools')?.entries.find((entry) => entry.item === 'stonePick')?.detail).toBe('29/38 uses · rock');
    expect(section('tools')?.entries.find((entry) => entry.item === 'reedBow')?.detail).toBe('33/36 uses · ranged defense');
    expect(section('parts')?.entries.find((entry) => entry.item === 'whistlingArrow')?.detail).toBe('5 ranged ward shots');
    expect(ledger.totals).toMatchObject({
      materials: 13,
      tools: 6,
      foodUnits: 3.4,
      buildKits: 1,
      routeGear: 3,
      repairKits: 2,
    });
  });

  it('counts edible meal units separately from bait and seed supplies', () => {
    expect(mealUnitsForInventory({
      bait: 9,
      seeds: 4,
      berries: 2,
      expeditionStew: 1,
      trailRation: 1,
    })).toBe(6.9);
  });

  it('classifies heavy and creative pack burden without hard-capping inventory', () => {
    const heavy = packBurdenForInventory([0, 360, 0, 0, 0], {});
    expect(heavy.status).toBe('heavy');
    expect(heavy.sprintBlocked).toBe(false);
    expect(heavy.staminaDrain).toBeGreaterThan(0.5);

    const overloaded = packBurdenForInventory([0, 500, 0, 0, 0], {});
    expect(overloaded.status).toBe('overloaded');
    expect(overloaded.sprintBlocked).toBe(true);
    expect(overloaded.detail).toContain('stash or build storage');

    const creative = packBurdenForInventory([999, 999, 999, 999, 999], {}, { creative: true });
    expect(creative.status).toBe('creative');
    expect(creative.staminaDrain).toBe(0);
    expect(creative.sprintBlocked).toBe(false);
  });

  it('uses a fitted pack frame to turn borderline heavy loads into field carry', () => {
    const crafted: InventoryItems = { packFrame: 1 };
    const capacityBonus = packCapacityBonusForInventory(crafted);
    const framed = packBurdenForInventory([0, 360, 0, 0, 0], crafted, { capacityBonus });
    expect(capacityBonus).toBe(28);
    expect(framed.capacity).toBe(70);
    expect(framed.status).toBe('field');
    expect(framed.sprintBlocked).toBe(false);

    const ledger = buildInventoryLedger([0, 360, 0, 0, 0], crafted, {}, { capacityBonus });
    expect(ledger.summary).toContain('field pack');
    expect(ledger.sections.find((section) => section.id === 'route')?.entries.map((entry) => entry.item)).toEqual(['packFrame']);
    expect(ledger.sections.find((section) => section.id === 'route')?.entries[0].detail).toContain('+28 capacity');
  });

  it('lists a storm cloak as lightweight route gear with weather protection detail', () => {
    const crafted: InventoryItems = { stormCloak: 1, horizonChart: 1 };
    const ledger = buildInventoryLedger([0, 0, 0, 0, 0], crafted, {});
    const route = ledger.sections.find((section) => section.id === 'route');

    expect(route?.entries.map((entry) => entry.item)).toEqual(['stormCloak', 'horizonChart']);
    expect(route?.entries[0].detail).toContain('weather cloak');
    expect(ledger.burden.load).toBe(1.1);
  });
});
