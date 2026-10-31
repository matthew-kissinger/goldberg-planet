/**
 * First-Principles Survival, Hunting, Cooking, Crafting & Interplanetary Progression:
 *  - Tier 0 (Field): Gather Wood, Stone, Flint & Fiber -> Craft Flint Hatchet, Hunting Spear, Campfire
 *  - Hunting & Cooking: Hunt Hex-Horn Stags & Ridge-Stalker Wolves for Raw Venison, Hide & Bone ->
 *    Roast Meat over a Campfire (`cooked_meat`, +35 Hunger; Hunger >= 70% regenerates Health)
 *  - Tier 1 (Workbench): Craft Stone Pickaxe & Sky-Hopper Rotor-Skiff (`planeFrame`) for atmospheric exploration
 *  - Tier 2 (Stone Furnace): Smelt Iron Ore (`iron_ore`) -> Iron Ingot (`iron_ingot`) & Crystal Cells
 *  - Tier 3 (Starfarer Starship): Craft the Starfarer Interplanetary Starship (`orbital_thruster`)
 *    to blast past the Kármán line into deep space and land on other planets
 */

export type ItemId =
  | 'wood'
  | 'stone'
  | 'flint'
  | 'fiber'
  | 'raw_meat'
  | 'cooked_meat'
  | 'hide'
  | 'bone'
  | 'iron_ore'
  | 'iron_ingot'
  | 'crystal'
  | 'star_shard'
  | 'alloy_ore'
  | 'cryo_core'
  | 'magma_core'
  | 'mycelium_spore'
  | 'hatchet'
  | 'pickaxe'
  | 'spear'
  | 'planeFrame'
  | 'crystal_cell'
  | 'orbital_thruster'
  | 'thermal_hull'
  | 'eco_pod';

export type Inventory = Partial<Record<ItemId, number>>;

export interface ItemDef {
  id: ItemId;
  name: string;
  css: string;
}

export interface RecipeDef {
  id: string;
  name: string;
  result: ItemId;
  count: number;
  requires: Partial<Record<ItemId, number>>;
  description: string;
  station?: 'campfire' | 'workbench' | 'furnace';
}

export interface RequirementStatus {
  item: ItemId;
  name: string;
  need: number;
  have: number;
}

export interface RecipeStatus {
  recipe: RecipeDef;
  canCraft: boolean;
  requirements: RequirementStatus[];
}

export interface CraftResult {
  ok: boolean;
  recipe?: RecipeDef;
  missing: RequirementStatus[];
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  wood: { id: 'wood', name: 'Wood', css: '#a8763f' },
  stone: { id: 'stone', name: 'Ferric Stone', css: '#8b929a' },
  flint: { id: 'flint', name: 'Flint Shard', css: '#5f6672' },
  fiber: { id: 'fiber', name: 'Plant Fiber', css: '#72b856' },
  raw_meat: { id: 'raw_meat', name: 'Raw Venison', css: '#d9534f' },
  cooked_meat: { id: 'cooked_meat', name: 'Roasted Meat', css: '#d87a32' },
  hide: { id: 'hide', name: 'Beast Hide', css: '#9c6638' },
  bone: { id: 'bone', name: 'Beast Bone', css: '#e6dec8' },
  iron_ore: { id: 'iron_ore', name: 'Iron Ore', css: '#b87348' },
  iron_ingot: { id: 'iron_ingot', name: 'Iron Ingot', css: '#cfd6df' },
  crystal: { id: 'crystal', name: 'Quartz Crystal', css: '#6ce8e0' },
  star_shard: { id: 'star_shard', name: 'Star-Core Shard', css: '#f5b841' },
  alloy_ore: { id: 'alloy_ore', name: 'Canyon Alloy', css: '#d4714a' },
  cryo_core: { id: 'cryo_core', name: 'Cryo Core', css: '#66c8ea' },
  magma_core: { id: 'magma_core', name: 'Magma Core', css: '#ff5a18' },
  mycelium_spore: { id: 'mycelium_spore', name: 'Bio-Spore', css: '#28e2c4' },
  hatchet: { id: 'hatchet', name: 'Flint Hatchet', css: '#c48c52' },
  pickaxe: { id: 'pickaxe', name: 'Stone Pickaxe', css: '#9aa4b2' },
  spear: { id: 'spear', name: 'Hunting Spear', css: '#d9a45b' },
  planeFrame: { id: 'planeFrame', name: 'Sky-Hopper Skiff', css: '#d6a86a' },
  crystal_cell: { id: 'crystal_cell', name: 'Crystal Cell', css: '#54f0e8' },
  orbital_thruster: { id: 'orbital_thruster', name: 'Starfarer Starship', css: '#78a8ff' },
  thermal_hull: { id: 'thermal_hull', name: 'Cryo-Thermal Suit', css: '#ff8844' },
  eco_pod: { id: 'eco_pod', name: 'Ecosystem Seed Pod', css: '#38e898' },
};

export const PLANE_WOOD_COST = 12;

export const RECIPES: RecipeDef[] = [
  {
    id: 'plane_frame',
    name: 'Sky-Hopper Rotor-Skiff',
    result: 'planeFrame',
    count: 1,
    requires: { wood: PLANE_WOOD_COST },
    description: 'Twin-rotor atmospheric explorer skiff. Press E to board and fly across mountains and oceans.',
  },
  {
    id: 'roast_meat',
    name: 'Roast Venison (Campfire)',
    result: 'cooked_meat',
    count: 1,
    requires: { raw_meat: 1, wood: 1 },
    station: 'campfire',
    description: 'Char-grill raw meat over a Campfire. Press C to eat (+35 Hunger & triggers Health regen).',
  },
  {
    id: 'flint_hatchet',
    name: 'Flint Hatchet',
    result: 'hatchet',
    count: 1,
    requires: { wood: 2, stone: 1 },
    description: 'Knapped flint hand-axe that fells trees in half the strikes.',
  },
  {
    id: 'hunting_spear',
    name: 'Hunting Spear',
    result: 'spear',
    count: 1,
    requires: { wood: 2, stone: 1 },
    description: 'Balanced hunting spear for taking down Hex-Horn Stags and fending off Ridge-Stalker Wolves.',
  },
  {
    id: 'stone_pickaxe',
    name: 'Stone Pickaxe',
    result: 'pickaxe',
    count: 1,
    requires: { wood: 2, stone: 2 },
    station: 'workbench',
    description: 'Heavy stone pickaxe that yields 2x ore and crystal when mining cliff strata and caves.',
  },
  {
    id: 'smelt_iron',
    name: 'Smelt Iron Ingot (Furnace)',
    result: 'iron_ingot',
    count: 1,
    requires: { iron_ore: 1, wood: 1 },
    station: 'furnace',
    description: 'Smelt raw Iron Ore into refined Iron Ingots inside a Stone Smelting Furnace.',
  },
  {
    id: 'crystal_cell',
    name: 'Crystal Power Cell',
    result: 'crystal_cell',
    count: 2,
    requires: { crystal: 2, stone: 2 },
    station: 'furnace',
    description: 'High-density harmonic battery refined from Quartz Crystal and Ferric Stone.',
  },
  {
    id: 'orbital_thruster',
    name: 'Starfarer Interplanetary Starship',
    result: 'orbital_thruster',
    count: 1,
    requires: { wood: 8, stone: 4, crystal: 2 },
    description: 'Unlocks the Starfarer Interplanetary Starship for deep-space flight between planets and vacuum shielding.',
  },
  {
    id: 'thermal_hull',
    name: 'Cryo-Thermal Suit Upgrade',
    result: 'thermal_hull',
    count: 1,
    requires: { alloy_ore: 4, crystal_cell: 2, cryo_core: 2 },
    description: 'Shields your Wayfarer suit and starship against Cryo-Freeze, Extreme Heat, and Spore Mist.',
  },
  {
    id: 'eco_pod',
    name: 'Ecosystem Seed Pod',
    result: 'eco_pod',
    count: 1,
    requires: { wood: 4, crystal: 2, mycelium_spore: 1 },
    description: 'Living cross-planet bio-seed. Deploy on any barren world to grow a thriving forest oasis.',
  },
];

export const RECIPE_BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));

export function isItemId(id: string): id is ItemId {
  return id in ITEM_DEFS;
}

export function normalizeInventory(items: unknown): Inventory {
  const out: Inventory = {};
  if (!items || typeof items !== 'object' || Array.isArray(items)) return out;
  for (const [id, count] of Object.entries(items)) {
    if (!isItemId(id)) continue;
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) out[id] = Math.trunc(count);
  }
  return out;
}

export function itemCount(inventory: Inventory, id: ItemId): number {
  return Math.max(0, Math.trunc(inventory[id] ?? 0));
}

export function addItem(inventory: Inventory, id: ItemId, amount: number): void {
  if (amount <= 0) return;
  inventory[id] = itemCount(inventory, id) + Math.trunc(amount);
}

export function spendItem(inventory: Inventory, id: ItemId, amount: number): boolean {
  const cur = itemCount(inventory, id);
  const need = Math.trunc(amount);
  if (cur < need) return false;
  const next = cur - need;
  if (next > 0) inventory[id] = next;
  else delete inventory[id];
  return true;
}

export function recipeStatus(recipe: RecipeDef, inventory: Inventory): RecipeStatus {
  const requirements = (Object.entries(recipe.requires) as [ItemId, number][]).map(([item, need]) => ({
    item,
    name: ITEM_DEFS[item].name,
    need,
    have: itemCount(inventory, item),
  }));
  return { recipe, canCraft: requirements.every((req) => req.have >= req.need), requirements };
}

export function craftRecipe(recipeId: string, inventory: Inventory): CraftResult {
  const recipe = RECIPE_BY_ID.get(recipeId);
  if (!recipe) return { ok: false, missing: [] };
  const status = recipeStatus(recipe, inventory);
  if (!status.canCraft) return { ok: false, recipe, missing: status.requirements.filter((req) => req.have < req.need) };
  for (const req of status.requirements) spendItem(inventory, req.item, req.need);
  addItem(inventory, recipe.result, recipe.count);
  return { ok: true, recipe, missing: [] };
}
