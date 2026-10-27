import { describe, expect, it } from 'vitest';
import { PLANE_WOOD_COST, RECIPES, craftRecipe, itemCount, normalizeInventory, recipeStatus, type Inventory } from '../src/sim/crafting';

describe('plane crafting', () => {
  it('crafts the plane frame from exactly the wood cost and spends it', () => {
    const inventory: Inventory = { wood: PLANE_WOOD_COST + 3 };
    const result = craftRecipe('plane_frame', inventory);
    expect(result.ok).toBe(true);
    expect(inventory).toEqual({ wood: 3, planeFrame: 1 });
  });

  it('reports what is missing and leaves the inventory untouched when short', () => {
    const inventory: Inventory = { wood: 5 };
    const result = craftRecipe('plane_frame', inventory);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([{ item: 'wood', name: 'Wood', need: PLANE_WOOD_COST, have: 5 }]);
    expect(inventory).toEqual({ wood: 5 });
  });

  it('drops the wood entry when crafting spends it to zero', () => {
    const inventory: Inventory = { wood: PLANE_WOOD_COST };
    expect(craftRecipe('plane_frame', inventory).ok).toBe(true);
    expect(inventory).toEqual({ planeFrame: 1 });
  });

  it('rejects unknown recipes', () => {
    expect(craftRecipe('workbench', { wood: 99 })).toEqual({ ok: false, missing: [] });
  });

  it('exposes recipe status for the crafting panel', () => {
    const status = recipeStatus(RECIPES[0], { wood: 7 });
    expect(status.canCraft).toBe(false);
    expect(status.requirements[0]).toMatchObject({ item: 'wood', need: PLANE_WOOD_COST, have: 7 });
  });

  it('normalizes saved inventories to known items with positive whole counts', () => {
    const inventory = normalizeInventory({ wood: 7.9, planeFrame: 0, rock: 4, berries: 2, nope: 'x' });
    expect(inventory).toEqual({ wood: 7 });
    expect(itemCount(inventory, 'planeFrame')).toBe(0);
    expect(normalizeInventory(null)).toEqual({});
    expect(normalizeInventory([1, 2])).toEqual({});
  });
});
