import {
  ITEM_DEFS,
  MATERIAL_ITEM_IDS,
  itemCount,
  type InventoryItems,
  type ItemDef,
  type ItemId,
} from './crafting';
import { TOOL_PROFILES, isToolItem, type ToolWear } from './tools';

export type InventoryLedgerSectionId = 'materials' | 'tools' | 'food' | 'build' | 'route' | 'parts';

export interface InventoryLedgerEntry {
  item: ItemId;
  name: string;
  css: string;
  kind: ItemDef['kind'];
  count: number;
  detail: string;
}

export interface InventoryLedgerSection {
  id: InventoryLedgerSectionId;
  title: string;
  total: number;
  emptyLabel: string;
  entries: InventoryLedgerEntry[];
}

export interface InventoryLedger {
  title: string;
  summary: string;
  totals: {
    items: number;
    stacks: number;
    materials: number;
    tools: number;
    foodUnits: number;
    buildKits: number;
    routeGear: number;
    repairKits: number;
  };
  burden: InventoryBurden;
  sections: InventoryLedgerSection[];
}

export type InventoryBurdenStatus = 'light' | 'field' | 'heavy' | 'overloaded' | 'creative';

export interface InventoryBurden {
  status: InventoryBurdenStatus;
  label: string;
  detail: string;
  load: number;
  capacity: number;
  ratio: number;
  staminaDrain: number;
  exposureRate: number;
  sprintBlocked: boolean;
}

export interface InventoryLedgerOptions {
  creative?: boolean;
  capacityBonus?: number;
}

const SECTION_ORDER: InventoryLedgerSectionId[] = ['materials', 'tools', 'food', 'build', 'route', 'parts'];

const SECTION_COPY: Record<InventoryLedgerSectionId, { title: string; emptyLabel: string }> = {
  materials: { title: 'Materials', emptyLabel: 'mine terrain and chop trees' },
  tools: { title: 'Tools & Light', emptyLabel: 'craft tools at a workbench' },
  food: { title: 'Food & Bait', emptyLabel: 'forage, fish, farm, or cook' },
  build: { title: 'Build Kits', emptyLabel: 'craft house and camp props' },
  route: { title: 'Route Gear', emptyLabel: 'make markers, charts, and travel gear' },
  parts: { title: 'Parts', emptyLabel: 'craft handles, fiber, crystals, and compost' },
};

const FOOD_UNITS: Partial<Record<ItemId, number>> = {
  berries: 0.45,
  caveMushroom: 0.8,
  snowHerb: 0.9,
  kelp: 0.35,
  rawFish: 0.35,
  cookedFish: 1.4,
  campMeal: 2,
  trailRation: 2.4,
  expeditionStew: 3.6,
};

const ROUTE_GEAR = new Set<ItemId>([
  'caveAnchor',
  'echoLantern',
  'horizonChart',
  'lantern',
  'packFrame',
  'planeFrame',
  'stormCloak',
  'waystone',
  'weatherVane',
]);

const BASE_PACK_CAPACITY = 42;
export const PACK_FRAME_CAPACITY_BONUS = 28;
export const STORM_CLOAK_EXPOSURE_MULTIPLIER = 0.68;

const ITEM_LOADS: Partial<Record<ItemId, number>> = {
  dirt: 0.07,
  rock: 0.12,
  sand: 0.08,
  snow: 0.05,
  wood: 0.16,
  sticks: 0.04,
  workbench: 3.2,
  stoneHatchet: 0.9,
  stoneBlade: 0.85,
  stoneAxe: 1.6,
  stonePick: 1.9,
  stoneShovel: 1.7,
  echoAxe: 2.1,
  echoPick: 2.4,
  echoShovel: 2.2,
  packFrame: 1.4,
  stormCloak: 0.9,
  repairKit: 0.45,
  fishingRod: 1,
  reedBow: 1.15,
  whistlingArrow: 0.04,
  bait: 0.08,
  seeds: 0.04,
  compost: 0.2,
  berries: 0.08,
  caveMushroom: 0.1,
  snowHerb: 0.06,
  kelp: 0.08,
  reeds: 0.05,
  rawFish: 0.3,
  cookedFish: 0.28,
  campMeal: 0.45,
  trailRation: 0.38,
  expeditionStew: 0.65,
  glowCrystal: 0.28,
  campfire: 3,
  chest: 3.4,
  bedroll: 2.2,
  cropPlot: 2.4,
  compostBin: 2.8,
  rainCistern: 3.2,
  rootCellar: 4,
  caveAnchor: 2.2,
  doorKit: 1.8,
  windowFrame: 1.5,
  roofBundle: 1.3,
  dockSegment: 3.6,
  fishTrap: 1.7,
  shoreNet: 1.1,
  dryingRack: 1.9,
  weatherVane: 1.3,
  lantern: 0.9,
  waystone: 2,
  echoLantern: 1.2,
  horizonChart: 0.15,
  planeFrame: 5.5,
};

function cleanCount(n: number | undefined): number {
  return Math.max(0, Math.trunc(n ?? 0));
}

function formatAmount(n: number): string {
  const rounded = Math.round(Math.max(0, n) * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

function sectionForItem(id: ItemId, def: ItemDef): InventoryLedgerSectionId {
  if (def.kind === 'material') return 'materials';
  if (id === 'repairKit') return 'tools';
  if (ROUTE_GEAR.has(id)) return 'route';
  if (def.kind === 'tool') return 'tools';
  if (def.kind === 'food') return 'food';
  if (def.kind === 'placeable' || def.kind === 'station') return 'build';
  return 'parts';
}

function entryDetail(id: ItemId, def: ItemDef, count: number, wear: ToolWear): string {
  if (isToolItem(id)) {
    const profile = TOOL_PROFILES[id];
    const used = cleanCount(wear[id]);
    const targetLabel = profile.target === 'rangedDefense' ? 'ranged defense' : profile.target;
    return `${Math.max(0, profile.durability - used)}/${profile.durability} uses · ${targetLabel}`;
  }
  if (id === 'repairKit') return `${count} auto-repair ${count === 1 ? 'kit' : 'kits'}`;
  if (id === 'packFrame') return `carry frame · +${PACK_FRAME_CAPACITY_BONUS} capacity`;
  if (id === 'stormCloak') return `weather cloak · storm exposure x${STORM_CLOAK_EXPOSURE_MULTIPLIER}`;
  if (id === 'echoLantern') return 'cave resonance light';
  if (id === 'fishingRod') return 'shore and dock casting';
  if (id === 'whistlingArrow') return `${count} ranged ward ${count === 1 ? 'shot' : 'shots'}`;
  if (id === 'bait') return 'fishing bait';
  if (id === 'seeds') return 'plant stock';
  if (id === 'sticks') return 'handles and frames';
  if (id === 'compost') return 'farm fertility';
  if (id === 'reeds') return 'waterline fiber';
  if (id === 'glowCrystal') return 'cave upgrade part';
  if (def.kind === 'food') {
    const units = (FOOD_UNITS[id] ?? 0) * count;
    return units > 0 ? `${formatAmount(units)} meal units` : 'field supply';
  }
  if (def.kind === 'material') return 'terrain stack';
  if (def.kind === 'station') return 'crafting station';
  if (def.kind === 'placeable') return ROUTE_GEAR.has(id) ? 'route prop' : 'build prop';
  if (def.kind === 'travel') return 'travel unlock';
  return 'crafting part';
}

function allLedgerEntries(materialCounts: readonly number[], craftedItems: InventoryItems, wear: ToolWear): InventoryLedgerEntry[] {
  const ids = Object.keys(ITEM_DEFS) as ItemId[];
  return ids
    .map((id) => {
      const def = ITEM_DEFS[id];
      const count = itemCount(materialCounts, craftedItems, id);
      return count > 0 ? {
        item: id,
        name: def.name,
        css: def.css,
        kind: def.kind,
        count,
        detail: entryDetail(id, def, count, wear),
      } : null;
    })
    .filter((entry): entry is InventoryLedgerEntry => entry !== null);
}

function itemLoad(id: ItemId, def: ItemDef): number {
  if (ITEM_LOADS[id] !== undefined) return ITEM_LOADS[id]!;
  if (def.kind === 'material') return 0.1;
  if (def.kind === 'tool') return 1.5;
  if (def.kind === 'food') return 0.25;
  if (def.kind === 'placeable' || def.kind === 'station') return 2.4;
  if (def.kind === 'travel') return 1;
  return 0.2;
}

export function mealUnitsForInventory(craftedItems: InventoryItems): number {
  let units = 0;
  for (const [id, value] of Object.entries(FOOD_UNITS) as [ItemId, number][]) {
    units += cleanCount(craftedItems[id]) * value;
  }
  return Math.round(units * 10) / 10;
}

export function packCapacityBonusForInventory(craftedItems: InventoryItems): number {
  return cleanCount(craftedItems.packFrame) > 0 ? PACK_FRAME_CAPACITY_BONUS : 0;
}

export function packBurdenForInventory(
  materialCounts: readonly number[],
  craftedItems: InventoryItems,
  options: InventoryLedgerOptions = {},
): InventoryBurden {
  const capacity = Math.max(1, BASE_PACK_CAPACITY + Math.max(0, options.capacityBonus ?? 0));
  let load = 0;
  for (const id of Object.keys(ITEM_DEFS) as ItemId[]) {
    load += itemCount(materialCounts, craftedItems, id) * itemLoad(id, ITEM_DEFS[id]);
  }
  const roundedLoad = Math.round(load * 10) / 10;
  const ratio = Math.round((roundedLoad / capacity) * 100) / 100;
  if (options.creative) {
    return {
      status: 'creative',
      label: 'creative carry',
      detail: `${formatAmount(roundedLoad)}/${capacity} load · burden ignored`,
      load: roundedLoad,
      capacity,
      ratio,
      staminaDrain: 0,
      exposureRate: 0,
      sprintBlocked: false,
    };
  }
  if (ratio <= 0.5) {
    return {
      status: 'light',
      label: 'light pack',
      detail: `${formatAmount(roundedLoad)}/${capacity} load · travel easy`,
      load: roundedLoad,
      capacity,
      ratio,
      staminaDrain: 0,
      exposureRate: 0,
      sprintBlocked: false,
    };
  }
  if (ratio <= 0.85) {
    return {
      status: 'field',
      label: 'field pack',
      detail: `${formatAmount(roundedLoad)}/${capacity} load · steady carry`,
      load: roundedLoad,
      capacity,
      ratio,
      staminaDrain: 0.18,
      exposureRate: 0,
      sprintBlocked: false,
    };
  }
  if (ratio <= 1.15) {
    return {
      status: 'heavy',
      label: 'heavy pack',
      detail: `${formatAmount(roundedLoad)}/${capacity} load · sprint drains faster`,
      load: roundedLoad,
      capacity,
      ratio,
      staminaDrain: 0.65,
      exposureRate: 0.06,
      sprintBlocked: false,
    };
  }
  return {
    status: 'overloaded',
    label: 'overloaded pack',
    detail: `${formatAmount(roundedLoad)}/${capacity} load · stash or build storage`,
    load: roundedLoad,
    capacity,
    ratio,
    staminaDrain: 1.35,
    exposureRate: 0.14,
    sprintBlocked: true,
  };
}

export function buildInventoryLedger(
  materialCounts: readonly number[],
  craftedItems: InventoryItems,
  wear: ToolWear = {},
  options: InventoryLedgerOptions = {},
): InventoryLedger {
  const entries = allLedgerEntries(materialCounts, craftedItems, wear);
  const totals = {
    items: entries.reduce((sum, entry) => sum + entry.count, 0),
    stacks: entries.length,
    materials: MATERIAL_ITEM_IDS.reduce((sum, id) => sum + itemCount(materialCounts, craftedItems, id), 0),
    tools: entries
      .filter((entry) => entry.kind === 'tool' || entry.item === 'repairKit')
      .reduce((sum, entry) => sum + entry.count, 0),
    foodUnits: mealUnitsForInventory(craftedItems),
    buildKits: entries
      .filter((entry) => sectionForItem(entry.item, ITEM_DEFS[entry.item]) === 'build')
      .reduce((sum, entry) => sum + entry.count, 0),
    routeGear: entries
      .filter((entry) => sectionForItem(entry.item, ITEM_DEFS[entry.item]) === 'route')
      .reduce((sum, entry) => sum + entry.count, 0),
    repairKits: cleanCount(craftedItems.repairKit),
  };
  const sections = SECTION_ORDER.map((id) => {
    const copy = SECTION_COPY[id];
    const sectionEntries = entries.filter((entry) => sectionForItem(entry.item, ITEM_DEFS[entry.item]) === id);
    return {
      id,
      title: copy.title,
      emptyLabel: copy.emptyLabel,
      total: sectionEntries.reduce((sum, entry) => sum + entry.count, 0),
      entries: sectionEntries,
    };
  });
  const mealLabel = totals.foodUnits > 0 ? `${formatAmount(totals.foodUnits)} meal units` : 'no packed meals';
  const buildLabel = totals.buildKits > 0 ? `${totals.buildKits} build kits` : 'no build kits';
  const routeLabel = totals.routeGear > 0 ? `${totals.routeGear} route gear` : 'no route gear';
  const burden = packBurdenForInventory(materialCounts, craftedItems, options);
  return {
    title: 'Pack Ledger',
    summary: `${totals.stacks} stacks · ${burden.label} · ${mealLabel} · ${totals.tools} tools/supplies · ${buildLabel} · ${routeLabel}`,
    totals,
    burden,
    sections,
  };
}
