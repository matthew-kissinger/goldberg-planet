export const MATERIAL_ITEM_IDS = ['dirt', 'rock', 'sand', 'snow', 'wood'] as const;

export type MaterialItemId = typeof MATERIAL_ITEM_IDS[number];

export type CraftedItemId =
  | 'sticks'
  | 'workbench'
  | 'stoneHatchet'
  | 'stoneAxe'
  | 'stonePick'
  | 'stoneShovel'
  | 'echoAxe'
  | 'echoPick'
  | 'echoShovel'
  | 'packFrame'
  | 'stormCloak'
  | 'repairKit'
  | 'fishingRod'
  | 'bait'
  | 'seeds'
  | 'compost'
  | 'berries'
  | 'caveMushroom'
  | 'snowHerb'
  | 'kelp'
  | 'reeds'
  | 'rawFish'
  | 'cookedFish'
  | 'campMeal'
  | 'trailRation'
  | 'expeditionStew'
  | 'glowCrystal'
  | 'campfire'
  | 'chest'
  | 'bedroll'
  | 'rainCistern'
  | 'rootCellar'
  | 'dockSegment'
  | 'fishTrap'
  | 'shoreNet'
  | 'dryingRack'
  | 'weatherVane'
  | 'lantern'
  | 'waystone'
  | 'echoLantern'
  | 'planeFrame';

export type ItemId = MaterialItemId | CraftedItemId;

export type InventoryItems = Partial<Record<ItemId, number>>;

export interface ItemDef {
  id: ItemId;
  name: string;
  kind: 'material' | 'part' | 'tool' | 'food' | 'station' | 'placeable' | 'travel';
  css: string;
  description: string;
}

export interface RecipeDef {
  id: string;
  name: string;
  result: ItemId;
  count: number;
  requires: Partial<Record<ItemId, number>>;
  station?: ItemId;
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
  stationReady: boolean;
  station?: RequirementStatus;
  requirements: RequirementStatus[];
}

export interface CraftResult {
  ok: boolean;
  recipe?: RecipeDef;
  result?: ItemId;
  count?: number;
  missing: RequirementStatus[];
  stationMissing?: RequirementStatus;
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  dirt: { id: 'dirt', name: 'Dirt', kind: 'material', css: '#8a6242', description: 'Packed soil for terraces, fill, and early crop plots.' },
  rock: { id: 'rock', name: 'Rock', kind: 'material', css: '#7d7f85', description: 'Hard stone for tools, fires, walls, and anchors.' },
  sand: { id: 'sand', name: 'Sand', kind: 'material', css: '#d8c48a', description: 'Beach material for glass, windows, and coastal building.' },
  snow: { id: 'snow', name: 'Snow', kind: 'material', css: '#eef2f5', description: 'Cold-region material for insulation and weather experiments.' },
  wood: { id: 'wood', name: 'Wood', kind: 'material', css: '#a8763f', description: 'Tree wood for shelters, tools, stations, and the plane frame.' },
  sticks: { id: 'sticks', name: 'Sticks', kind: 'part', css: '#c69254', description: 'Light handles and frames for early tools.' },
  workbench: { id: 'workbench', name: 'Workbench', kind: 'station', css: '#8d6948', description: 'The first station for real survival recipes.' },
  stoneHatchet: { id: 'stoneHatchet', name: 'Stone Hatchet', kind: 'tool', css: '#b6aaa0', description: 'A light one-handed chopping tool with short reach and quick, fragile swings.' },
  stoneAxe: { id: 'stoneAxe', name: 'Stone Axe', kind: 'tool', css: '#a5a7ac', description: 'A woodcutting tool target for faster chopping.' },
  stonePick: { id: 'stonePick', name: 'Stone Pick', kind: 'tool', css: '#8f939b', description: 'A mining tool target for rock and cave materials.' },
  stoneShovel: { id: 'stoneShovel', name: 'Stone Shovel', kind: 'tool', css: '#9b8974', description: 'A digging tool target for soil, sand, and farming prep.' },
  echoAxe: { id: 'echoAxe', name: 'Echo Axe', kind: 'tool', css: '#62d4c7', description: 'A crystal-bound axe that chops farther, faster, and lasts through longer wood runs.' },
  echoPick: { id: 'echoPick', name: 'Echo Pick', kind: 'tool', css: '#6de2d8', description: 'A cave-crystal pick for longer rock, cave, and expedition work.' },
  echoShovel: { id: 'echoShovel', name: 'Echo Shovel', kind: 'tool', css: '#78cfc2', description: 'A tuned shovel that clears soil, sand, and snow with stronger reach and durability.' },
  packFrame: { id: 'packFrame', name: 'Pack Frame', kind: 'travel', css: '#b58b52', description: 'A reed-lashed frame that makes heavy expedition loads easier to carry without removing burden entirely.' },
  stormCloak: { id: 'stormCloak', name: 'Storm Cloak', kind: 'travel', css: '#5f7f92', description: 'A reed-wrapped weather cloak that softens rain, cold, storm, and soaked exposure without replacing real shelter.' },
  repairKit: { id: 'repairKit', name: 'Field Repair Kit', kind: 'part', css: '#c9a56d', description: 'Reed lashings, wedges, and stone flakes that save a worn tool at the breaking point.' },
  fishingRod: { id: 'fishingRod', name: 'Fishing Rod', kind: 'tool', css: '#c8a36b', description: 'A first path into shore, dock, and cave fishing.' },
  bait: { id: 'bait', name: 'Bait', kind: 'food', css: '#c98b5a', description: 'Berry mash and scraps for pulling better fish schools toward shore.' },
  seeds: { id: 'seeds', name: 'Berry Seeds', kind: 'food', css: '#9abf5a', description: 'Hardy starts for repeatable crop plots.' },
  compost: { id: 'compost', name: 'Compost', kind: 'part', css: '#6b5b32', description: 'Broken-down scraps that feed crop plots and speed a protected farm.' },
  berries: { id: 'berries', name: 'Berries', kind: 'food', css: '#b64d6b', description: 'A quick farm food and camp-meal ingredient.' },
  caveMushroom: { id: 'caveMushroom', name: 'Cave Mushroom', kind: 'food', css: '#8bd0b0', description: 'A dim cave forage food that helps stretch underground trips.' },
  snowHerb: { id: 'snowHerb', name: 'Snow Herb', kind: 'food', css: '#c9eef2', description: 'A cold ridge herb that cuts exposure during harsh weather.' },
  kelp: { id: 'kelp', name: 'Kelp', kind: 'food', css: '#4f9f74', description: 'Coastal and sea-cave forage for rough meals and bait experiments.' },
  reeds: { id: 'reeds', name: 'Reeds', kind: 'part', css: '#7da65f', description: 'Waterline stems for reed beds, trap lashings, roof mats, and food wraps.' },
  rawFish: { id: 'rawFish', name: 'Raw Fish', kind: 'food', css: '#8bb7c8', description: 'Caught from shores and docks, best cooked at a lit fire.' },
  cookedFish: { id: 'cookedFish', name: 'Cooked Fish', kind: 'food', css: '#d59a63', description: 'A reliable cooked food and camp-meal ingredient.' },
  campMeal: { id: 'campMeal', name: 'Camp Meal', kind: 'food', css: '#d9c16c', description: 'A warm fish-and-berry meal for longer trips.' },
  trailRation: { id: 'trailRation', name: 'Trail Ration', kind: 'food', css: '#b89458', description: 'Preserved fish, kelp, and herbs packed for caves, storms, and longer flights.' },
  expeditionStew: { id: 'expeditionStew', name: 'Expedition Stew', kind: 'food', css: '#e8a65f', description: 'A packed hearth meal that steadies cave walks, bad weather, and long flights with trail focus.' },
  glowCrystal: { id: 'glowCrystal', name: 'Glow Crystal', kind: 'part', css: '#70d6d1', description: 'A cave-grown crystal from dry and sea cave walls.' },
  campfire: { id: 'campfire', name: 'Campfire', kind: 'placeable', css: '#e07a3f', description: 'Warmth, cooking, light, and a visible home signal.' },
  chest: { id: 'chest', name: 'Chest', kind: 'placeable', css: '#a56d3a', description: 'Persistent storage for a functional house.' },
  bedroll: { id: 'bedroll', name: 'Bedroll', kind: 'placeable', css: '#8fb0d0', description: 'A sleep and respawn target until a full bed ships.' },
  rainCistern: { id: 'rainCistern', name: 'Rain Cistern', kind: 'placeable', css: '#5faed2', description: 'A camp basin that catches rain and storm water.' },
  rootCellar: { id: 'rootCellar', name: 'Root Cellar', kind: 'placeable', css: '#7b6a8f', description: 'A cool home cache for staging preserved food before expeditions.' },
  dockSegment: { id: 'dockSegment', name: 'Dock Segment', kind: 'placeable', css: '#7b6a4a', description: 'A shoreline platform for stronger fishing and coastal travel staging.' },
  fishTrap: { id: 'fishTrap', name: 'Fish Trap', kind: 'placeable', css: '#8bb7c8', description: 'A shore, dock, or sea-cave trap that can be baited and checked after time passes.' },
  shoreNet: { id: 'shoreNet', name: 'Shore Net', kind: 'placeable', css: '#7da65f', description: 'A reed net for shore, dock, and sea-cave camps that gathers fish plus useful waterline scraps.' },
  dryingRack: { id: 'dryingRack', name: 'Drying Rack', kind: 'placeable', css: '#b89458', description: 'A camp food station that preserves fish and forage into trail rations.' },
  weatherVane: { id: 'weatherVane', name: 'Weather Vane', kind: 'placeable', css: '#9fb8c2', description: 'A camp instrument that reads local wind and storm timing.' },
  lantern: { id: 'lantern', name: 'Lantern', kind: 'placeable', css: '#ffd06f', description: 'A portable light target for caves and storms.' },
  waystone: { id: 'waystone', name: 'Waystone', kind: 'placeable', css: '#87a9d6', description: 'A persistent route marker that can be attuned to home, caves, shores, forage, or survey points.' },
  echoLantern: { id: 'echoLantern', name: 'Echo Lantern', kind: 'tool', css: '#6de2d8', description: 'A crystal-tuned lantern that reads nearby cave resonance.' },
  planeFrame: { id: 'planeFrame', name: 'Plane Frame', kind: 'travel', css: '#d6a86a', description: 'A visible recipe path for the craftable wooden plane.' },
};

export const BASIC_RECIPES: RecipeDef[] = [
  {
    id: 'sticks',
    name: 'Sticks',
    result: 'sticks',
    count: 4,
    requires: { wood: 1 },
    description: 'Split one wood into tool handles.',
  },
  {
    id: 'workbench',
    name: 'Workbench',
    result: 'workbench',
    count: 1,
    requires: { wood: 6, rock: 2 },
    description: 'Unlocks the first real survival recipes.',
  },
  {
    id: 'stone_hatchet',
    name: 'Stone Hatchet',
    result: 'stoneHatchet',
    count: 1,
    station: 'workbench',
    requires: { sticks: 1, rock: 2 },
    description: 'A compact survival hatchet for faster staged chopping and emergency warding.',
  },
  {
    id: 'stone_axe',
    name: 'Stone Axe',
    result: 'stoneAxe',
    count: 1,
    station: 'workbench',
    requires: { sticks: 2, rock: 3 },
    description: 'A readable first chopping tool.',
  },
  {
    id: 'stone_pick',
    name: 'Stone Pick',
    result: 'stonePick',
    count: 1,
    station: 'workbench',
    requires: { sticks: 2, rock: 4 },
    description: 'A readable first mining tool.',
  },
  {
    id: 'stone_shovel',
    name: 'Stone Shovel',
    result: 'stoneShovel',
    count: 1,
    station: 'workbench',
    requires: { sticks: 2, rock: 2 },
    description: 'A readable first digging and farming tool.',
  },
  {
    id: 'field_repair_kit',
    name: 'Field Repair Kit',
    result: 'repairKit',
    count: 1,
    station: 'workbench',
    requires: { sticks: 1, rock: 2, reeds: 1 },
    description: 'Automatically rewraps a breaking stone tool so long trips do not end on a vanished pick.',
  },
  {
    id: 'pack_frame',
    name: 'Pack Frame',
    result: 'packFrame',
    count: 1,
    station: 'workbench',
    requires: { wood: 4, sticks: 4, reeds: 3 },
    description: 'Adds a reed-lashed carry frame: +28 pack capacity and a visible back-frame target for long routes.',
  },
  {
    id: 'storm_cloak',
    name: 'Storm Cloak',
    result: 'stormCloak',
    count: 1,
    station: 'workbench',
    requires: { snow: 4, reeds: 4, kelp: 1, snowHerb: 1 },
    description: 'Fits a weather cloak: storm/cold/soaked exposure softens, and storm routes gain a wearable prep answer.',
  },
  {
    id: 'echo_axe',
    name: 'Echo Axe',
    result: 'echoAxe',
    count: 1,
    station: 'workbench',
    requires: { stoneAxe: 1, repairKit: 1, glowCrystal: 1, reeds: 1 },
    description: 'Upgrades a stone axe with crystal resonance and reed lashings for longer forest work.',
  },
  {
    id: 'echo_pick',
    name: 'Echo Pick',
    result: 'echoPick',
    count: 1,
    station: 'workbench',
    requires: { stonePick: 1, repairKit: 1, glowCrystal: 2, rock: 2 },
    description: 'Upgrades a stone pick into an expedition pick that better answers caves and distant routes.',
  },
  {
    id: 'echo_shovel',
    name: 'Echo Shovel',
    result: 'echoShovel',
    count: 1,
    station: 'workbench',
    requires: { stoneShovel: 1, repairKit: 1, glowCrystal: 1, sand: 2 },
    description: 'Upgrades a stone shovel with a crystal edge for shore, snow, and farm shaping.',
  },
  {
    id: 'fishing_rod',
    name: 'Fishing Rod',
    result: 'fishingRod',
    count: 1,
    station: 'workbench',
    requires: { sticks: 3, wood: 2 },
    description: 'Opens the first fishing interaction target.',
  },
  {
    id: 'bait',
    name: 'Bait',
    result: 'bait',
    count: 3,
    requires: { berries: 1 },
    description: 'Turns farmed berries into better shore and storm fishing odds.',
  },
  {
    id: 'campfire',
    name: 'Campfire',
    result: 'campfire',
    count: 1,
    requires: { wood: 4, rock: 6 },
    description: 'A first home function: warmth, food prep, and light.',
  },
  {
    id: 'chest',
    name: 'Chest',
    result: 'chest',
    count: 1,
    station: 'workbench',
    requires: { wood: 8 },
    description: 'A storage target for functional houses.',
  },
  {
    id: 'bedroll',
    name: 'Bedroll',
    result: 'bedroll',
    count: 1,
    station: 'workbench',
    requires: { wood: 5, snow: 2 },
    description: 'A temporary sleep prop until cloth/fiber resources ship.',
  },
  {
    id: 'rain_cistern',
    name: 'Rain Cistern',
    result: 'rainCistern',
    count: 1,
    station: 'workbench',
    requires: { wood: 4, rock: 4, sand: 2 },
    description: 'Catches rain and storm water for the camp.',
  },
  {
    id: 'root_cellar',
    name: 'Root Cellar',
    result: 'rootCellar',
    count: 1,
    station: 'workbench',
    requires: { wood: 5, rock: 5, dirt: 3 },
    description: 'Stores preserved food and forage as home provisions for hearth supper.',
  },
  {
    id: 'dock_segment',
    name: 'Dock Segment',
    result: 'dockSegment',
    count: 1,
    station: 'workbench',
    requires: { wood: 8, sticks: 2, rock: 2 },
    description: 'Builds a shore platform that steadies casts and marks coastal staging points.',
  },
  {
    id: 'fish_trap',
    name: 'Fish Trap',
    result: 'fishTrap',
    count: 1,
    station: 'workbench',
    requires: { wood: 4, sticks: 4, kelp: 1 },
    description: 'Sets a passive shore, dock, or sea-cave food loop that gets stronger when baited and revisited.',
  },
  {
    id: 'reed_fish_trap',
    name: 'Reed Fish Trap',
    result: 'fishTrap',
    count: 1,
    station: 'workbench',
    requires: { wood: 2, sticks: 2, reeds: 3 },
    description: 'Uses waterline reeds to build a lighter passive trap for shore or sea-cave camps.',
  },
  {
    id: 'shore_net',
    name: 'Shore Net',
    result: 'shoreNet',
    count: 1,
    station: 'workbench',
    requires: { wood: 1, sticks: 3, reeds: 4 },
    description: 'Braids reeds into a quick-check shore net that catches fish and useful waterline scraps.',
  },
  {
    id: 'drying_rack',
    name: 'Drying Rack',
    result: 'dryingRack',
    count: 1,
    station: 'workbench',
    requires: { wood: 5, sticks: 3, rock: 1 },
    description: 'Preserves raw fish with kelp or snow herbs into longer-lasting trail rations.',
  },
  {
    id: 'weather_vane',
    name: 'Weather Vane',
    result: 'weatherVane',
    count: 1,
    station: 'workbench',
    requires: { wood: 3, sticks: 2, rock: 2, sand: 1 },
    description: 'Reads wind and storm timing so a home can plan safer departures.',
  },
  {
    id: 'lantern',
    name: 'Lantern',
    result: 'lantern',
    count: 1,
    station: 'workbench',
    requires: { rock: 3, sand: 2, wood: 1 },
    description: 'A light target for caves and night weather.',
  },
  {
    id: 'waystone',
    name: 'Waystone',
    result: 'waystone',
    count: 2,
    station: 'workbench',
    requires: { rock: 5, sticks: 1, sand: 1 },
    description: 'Persistent route markers for return paths, caves, shores, forage, and survey points.',
  },
  {
    id: 'echo_lantern',
    name: 'Echo Lantern',
    result: 'echoLantern',
    count: 1,
    station: 'workbench',
    requires: { lantern: 1, glowCrystal: 2 },
    description: 'Reads nearby cave resonance and turns crystal finds into expedition gear.',
  },
  {
    id: 'plane_frame',
    name: 'Plane Frame',
    result: 'planeFrame',
    count: 1,
    requires: { wood: 12 },
    description: 'The existing plane craft path, now visible as a recipe.',
  },
];

export const RECIPE_BY_ID = new Map(BASIC_RECIPES.map((recipe) => [recipe.id, recipe]));

export function normalizeInventory(items: InventoryItems | null | undefined): InventoryItems {
  const out: InventoryItems = {};
  if (!items) return out;
  for (const id of Object.keys(items) as ItemId[]) {
    if (!(id in ITEM_DEFS)) continue;
    const count = items[id];
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      out[id] = Math.trunc(count);
    }
  }
  return out;
}

function materialSlot(id: ItemId): number {
  return MATERIAL_ITEM_IDS.indexOf(id as MaterialItemId);
}

export function itemCount(materialCounts: readonly number[], craftedItems: InventoryItems, id: ItemId): number {
  const slot = materialSlot(id);
  if (slot >= 0) return Math.max(0, Math.trunc(materialCounts[slot] ?? 0));
  return Math.max(0, Math.trunc(craftedItems[id] ?? 0));
}

function addItem(materialCounts: number[], craftedItems: InventoryItems, id: ItemId, amount: number): void {
  if (amount <= 0) return;
  const slot = materialSlot(id);
  if (slot >= 0) {
    materialCounts[slot] = Math.max(0, Math.trunc((materialCounts[slot] ?? 0) + amount));
    return;
  }
  craftedItems[id] = Math.max(0, Math.trunc((craftedItems[id] ?? 0) + amount));
}

function spendItem(materialCounts: number[], craftedItems: InventoryItems, id: ItemId, amount: number): void {
  if (amount <= 0) return;
  const slot = materialSlot(id);
  if (slot >= 0) {
    materialCounts[slot] = Math.max(0, Math.trunc((materialCounts[slot] ?? 0) - amount));
    return;
  }
  const next = Math.max(0, Math.trunc((craftedItems[id] ?? 0) - amount));
  if (next > 0) craftedItems[id] = next;
  else delete craftedItems[id];
}

function requirementStatus(materialCounts: readonly number[], craftedItems: InventoryItems, id: ItemId, need: number): RequirementStatus {
  return {
    item: id,
    name: ITEM_DEFS[id].name,
    need: Math.max(0, Math.trunc(need)),
    have: itemCount(materialCounts, craftedItems, id),
  };
}

export function recipeStatus(
  recipe: RecipeDef,
  materialCounts: readonly number[],
  craftedItems: InventoryItems,
  stationItems: InventoryItems = {},
): RecipeStatus {
  const requirements = Object.entries(recipe.requires).map(([id, need]) =>
    requirementStatus(materialCounts, craftedItems, id as ItemId, need ?? 0));
  const station = recipe.station ? {
    item: recipe.station,
    name: ITEM_DEFS[recipe.station].name,
    need: 1,
    have: itemCount(materialCounts, craftedItems, recipe.station) + Math.max(0, Math.trunc(stationItems[recipe.station] ?? 0)),
  } : undefined;
  const stationReady = !station || station.have >= station.need;
  return {
    recipe,
    canCraft: stationReady && requirements.every((req) => req.have >= req.need),
    stationReady,
    station,
    requirements,
  };
}

export function allRecipeStatuses(
  materialCounts: readonly number[],
  craftedItems: InventoryItems,
  stationItems: InventoryItems = {},
): RecipeStatus[] {
  return BASIC_RECIPES.map((recipe) => recipeStatus(recipe, materialCounts, craftedItems, stationItems));
}

export function craftRecipe(
  recipeId: string,
  materialCounts: number[],
  craftedItems: InventoryItems,
  stationItems: InventoryItems = {},
): CraftResult {
  const recipe = RECIPE_BY_ID.get(recipeId);
  if (!recipe) return { ok: false, missing: [] };
  const status = recipeStatus(recipe, materialCounts, craftedItems, stationItems);
  const missing = status.requirements.filter((req) => req.have < req.need);
  if (!status.canCraft) {
    return {
      ok: false,
      recipe,
      missing,
      stationMissing: status.station && status.station.have < status.station.need ? status.station : undefined,
    };
  }
  for (const req of status.requirements) spendItem(materialCounts, craftedItems, req.item, req.need);
  addItem(materialCounts, craftedItems, recipe.result, recipe.count);
  return {
    ok: true,
    recipe,
    result: recipe.result,
    count: recipe.count,
    missing: [],
  };
}
