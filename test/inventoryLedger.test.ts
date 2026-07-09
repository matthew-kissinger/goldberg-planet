import { describe, expect, it } from 'vitest';
import { buildInventoryLedger, mealUnitsForInventory, packBurdenForInventory, packCapacityBonusForInventory } from '../src/sim/inventoryLedger';
import type { InventoryItems } from '../src/sim/crafting';

describe('Pack Ledger inventory view', () => {
  it('groups hotbar materials and crafted items into loop-focused sections', () => {
    const materials = [3, 4, 0, 0, 6];
    const crafted: InventoryItems = {
      sticks: 2,
      stoneHatchet: 1,
      stonePick: 1,
      repairKit: 2,
      cookedFish: 1,
      campMeal: 1,
      chest: 1,
      packFrame: 1,
    };

    const ledger = buildInventoryLedger(materials, crafted, { stonePick: 9 });
    const section = (id: string) => ledger.sections.find((s) => s.id === id);

    expect(ledger.title).toBe('Pack Ledger');
    expect(ledger.summary).toContain('light pack');
    expect(ledger.summary).toContain('3.4 meal units');
    expect(ledger.burden).toMatchObject({ status: 'light', sprintBlocked: false });
    expect(section('materials')?.entries.map((entry) => entry.item)).toEqual(['dirt', 'rock', 'wood']);
    expect(section('tools')?.entries.map((entry) => entry.item)).toEqual(['stoneHatchet', 'stonePick', 'repairKit']);
    expect(section('food')?.entries.map((entry) => entry.item)).toEqual(['cookedFish', 'campMeal']);
    expect(section('build')?.entries.map((entry) => entry.item)).toEqual(['chest']);
    expect(section('route')?.entries.map((entry) => entry.item)).toEqual(['packFrame']);
    expect(section('parts')?.entries.map((entry) => entry.item)).toEqual(['sticks']);
    expect(section('tools')?.entries.find((entry) => entry.item === 'stoneHatchet')?.detail).toBe('24/24 uses · wood');
    expect(section('tools')?.entries.find((entry) => entry.item === 'stonePick')?.detail).toBe('29/38 uses · rock');
    expect(ledger.totals).toMatchObject({
      materials: 13,
      tools: 4,
      foodUnits: 3.4,
      buildKits: 1,
      routeGear: 1,
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

    const overloaded = packBurdenForInventory([0, 500, 0, 0, 0], {});
    expect(overloaded.status).toBe('overloaded');
    expect(overloaded.sprintBlocked).toBe(true);
    expect(overloaded.detail).toContain('stash or build storage');

    const creative = packBurdenForInventory([999, 999, 999, 999, 999], {}, { creative: true });
    expect(creative.status).toBe('creative');
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
});
