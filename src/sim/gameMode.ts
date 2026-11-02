/** Mode policy is shared by startup and the core loop; saves remain finite JSON. */
import { ITEM_DEFS, type Inventory, type ItemId } from './crafting';

export type GameMode = 'survival' | 'creative';
export const CREATIVE_RESOURCE_STACK = 999;
const EQUIPMENT = new Set<ItemId>(['hatchet', 'pickaxe', 'spear', 'planeFrame', 'orbital_thruster', 'thermal_hull']);

export function parseGameMode(value: unknown): GameMode { return value === 'creative' ? 'creative' : 'survival'; }

/** Fully supplied, independent inventory object; no Infinity sentinel reaches a save. */
export function createCreativeInventory(): Inventory {
  const inventory: Inventory = {};
  refillCreativeInventory(inventory);
  return inventory;
}

/** Replenish consumables and restore every equipment unlock to a bounded stock. */
export function refillCreativeInventory(inventory: Inventory): boolean {
  let changed = false;
  for (const item of Object.keys(ITEM_DEFS) as ItemId[]) {
    const count = EQUIPMENT.has(item) ? 1 : CREATIVE_RESOURCE_STACK;
    if (inventory[item] !== count) { inventory[item] = count; changed = true; }
  }
  return changed;
}
