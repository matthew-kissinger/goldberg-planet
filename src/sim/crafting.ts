/**
 * Inventory + crafting for the core loop: trees drop wood, wood crafts the plane frame.
 * The inventory is one sparse item -> count map so new items need no slot bookkeeping.
 */

export type ItemId = 'wood' | 'planeFrame';

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
  planeFrame: { id: 'planeFrame', name: 'Plane Frame', css: '#d6a86a' },
};

export const PLANE_WOOD_COST = 12;

export const RECIPES: RecipeDef[] = [
  {
    id: 'plane_frame',
    name: 'Plane Frame',
    result: 'planeFrame',
    count: 1,
    requires: { wood: PLANE_WOOD_COST },
    description: 'A wooden bush plane. Craft it, then climb aboard and fly.',
  },
];

export const RECIPE_BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));

function isItemId(id: string): id is ItemId {
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

function spendItem(inventory: Inventory, id: ItemId, amount: number): void {
  const next = itemCount(inventory, id) - Math.trunc(amount);
  if (next > 0) inventory[id] = next;
  else delete inventory[id];
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
