import type { InventoryItems, ItemId, MaterialItemId } from './crafting';

export const TOOL_ITEM_IDS = ['stoneHatchet', 'stoneBlade', 'stoneAxe', 'stonePick', 'stoneShovel', 'echoAxe', 'echoPick', 'echoShovel', 'reedBow'] as const;

export type ToolItemId = typeof TOOL_ITEM_IDS[number];
export type ToolWear = Partial<Record<ToolItemId, number>>;
export type ToolTarget = 'wood' | 'rock' | 'soil' | 'defense' | 'rangedDefense' | 'hands';

export interface ToolProfile {
  id: ToolItemId;
  name: string;
  target: ToolTarget;
  reachBonus: number;
  cooldown: number;
  durability: number;
  tier: number;
}

export interface ToolEffect {
  tool: ToolItemId | null;
  name: string;
  target: ToolTarget;
  reachBonus: number;
  cooldown: number;
  durability: number;
  wear: number;
  label: string;
}

export interface ToolUseResult {
  tool: ToolItemId | null;
  broke: boolean;
  repaired: boolean;
  wear: ToolWear;
  craftedItems: InventoryItems;
  message?: string;
}

export const REPAIR_KIT_RESTORE = 18;

export const TOOL_PROFILES: Record<ToolItemId, ToolProfile> = {
  stoneHatchet: { id: 'stoneHatchet', name: 'Stone Hatchet', target: 'wood', reachBonus: 0.75, cooldown: 0.085, durability: 24, tier: 0 },
  stoneBlade: { id: 'stoneBlade', name: 'Stone Blade', target: 'defense', reachBonus: 0.45, cooldown: 0.075, durability: 30, tier: 1 },
  stoneAxe: { id: 'stoneAxe', name: 'Stone Axe', target: 'wood', reachBonus: 1.15, cooldown: 0.1, durability: 32, tier: 1 },
  stonePick: { id: 'stonePick', name: 'Stone Pick', target: 'rock', reachBonus: 1.35, cooldown: 0.12, durability: 38, tier: 1 },
  stoneShovel: { id: 'stoneShovel', name: 'Stone Shovel', target: 'soil', reachBonus: 1.2, cooldown: 0.11, durability: 34, tier: 1 },
  echoAxe: { id: 'echoAxe', name: 'Echo Axe', target: 'wood', reachBonus: 1.65, cooldown: 0.085, durability: 58, tier: 2 },
  echoPick: { id: 'echoPick', name: 'Echo Pick', target: 'rock', reachBonus: 1.95, cooldown: 0.095, durability: 66, tier: 2 },
  echoShovel: { id: 'echoShovel', name: 'Echo Shovel', target: 'soil', reachBonus: 1.7, cooldown: 0.09, durability: 60, tier: 2 },
  reedBow: { id: 'reedBow', name: 'Reed Bow', target: 'rangedDefense', reachBonus: 4.5, cooldown: 0.13, durability: 36, tier: 1 },
};

const HANDS: ToolEffect = {
  tool: null,
  name: 'Hands',
  target: 'hands',
  reachBonus: 0,
  cooldown: 0.17,
  durability: 0,
  wear: 0,
  label: 'hands',
};

export function normalizeToolWear(raw: unknown): ToolWear {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ToolWear = {};
  for (const id of TOOL_ITEM_IDS) {
    const value = (raw as Partial<Record<ToolItemId, unknown>>)[id];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const wear = Math.max(0, Math.trunc(value));
    if (wear > 0) out[id] = Math.min(wear, TOOL_PROFILES[id].durability - 1);
  }
  return out;
}

export function materialToolTarget(material: MaterialItemId): ToolTarget {
  if (material === 'wood') return 'wood';
  if (material === 'rock') return 'rock';
  if (material === 'dirt' || material === 'sand' || material === 'snow') return 'soil';
  return 'hands';
}

function hasTool(items: InventoryItems, id: ToolItemId): boolean {
  return Math.max(0, Math.trunc(items[id] ?? 0)) > 0;
}

function countItem(items: InventoryItems, id: ItemId): number {
  return Math.max(0, Math.trunc(items[id] ?? 0));
}

function spendItem(items: InventoryItems, id: ItemId, amount = 1): void {
  const next = countItem(items, id) - Math.max(0, Math.trunc(amount));
  if (next > 0) items[id] = next;
  else delete items[id];
}

function effect(profile: ToolProfile, wear: ToolWear): ToolEffect {
  const current = Math.max(0, Math.trunc(wear[profile.id] ?? 0));
  return {
    tool: profile.id,
    name: profile.name,
    target: profile.target,
    reachBonus: profile.reachBonus,
    cooldown: profile.cooldown,
    durability: profile.durability,
    wear: current,
    label: `${profile.name.toLowerCase()} ${profile.durability - current}/${profile.durability}`,
  };
}

export function bestToolForTarget(target: ToolTarget, craftedItems: InventoryItems, wear: ToolWear = {}): ToolEffect {
  const profile = TOOL_ITEM_IDS
    .map((id) => TOOL_PROFILES[id])
    .filter((p) => p.target === target && hasTool(craftedItems, p.id))
    .sort((a, b) => b.tier - a.tier || b.reachBonus - a.reachBonus || a.cooldown - b.cooldown)[0];
  if (!profile || !hasTool(craftedItems, profile.id)) return HANDS;
  return effect(profile, wear);
}

export function bestToolForMaterial(material: MaterialItemId, craftedItems: InventoryItems, wear: ToolWear = {}): ToolEffect {
  return bestToolForTarget(materialToolTarget(material), craftedItems, wear);
}

export function bestToolForTree(craftedItems: InventoryItems, wear: ToolWear = {}): ToolEffect {
  return bestToolForTarget('wood', craftedItems, wear);
}

export function bestToolForDefense(craftedItems: InventoryItems, wear: ToolWear = {}): ToolEffect {
  return bestToolForTarget('defense', craftedItems, wear);
}

export function bestToolForRangedDefense(craftedItems: InventoryItems, wear: ToolWear = {}): ToolEffect {
  return bestToolForTarget('rangedDefense', craftedItems, wear);
}

export function maxReachBonus(craftedItems: InventoryItems): number {
  let reach = 0;
  for (const id of TOOL_ITEM_IDS) {
    const profile = TOOL_PROFILES[id];
    if ((profile.target === 'wood' || profile.target === 'rock' || profile.target === 'soil') && hasTool(craftedItems, id)) reach = Math.max(reach, profile.reachBonus);
  }
  return reach;
}

export function hasToolForTarget(craftedItems: InventoryItems, target: Exclude<ToolTarget, 'hands'>): boolean {
  return bestToolForTarget(target, craftedItems).tool !== null;
}

export function bestToolLabelForTarget(craftedItems: InventoryItems, target: Exclude<ToolTarget, 'hands'>): string {
  const tool = bestToolForTarget(target, craftedItems);
  return tool.tool ? tool.name.toLowerCase() : target === 'rock' ? 'pick' : target === 'wood' ? 'axe' : target === 'defense' ? 'blade' : target === 'rangedDefense' ? 'bow' : 'shovel';
}

export function useTool(tool: ToolItemId | null, craftedItems: InventoryItems, wear: ToolWear, creative = false): ToolUseResult {
  if (!tool || creative) return { tool, broke: false, repaired: false, wear: { ...wear }, craftedItems: { ...craftedItems } };
  const profile = TOOL_PROFILES[tool];
  if (!profile || !hasTool(craftedItems, tool)) return { tool: null, broke: false, repaired: false, wear: { ...wear }, craftedItems: { ...craftedItems } };
  const nextWear = normalizeToolWear(wear);
  const nextItems = { ...craftedItems };
  const value = Math.max(0, Math.trunc(nextWear[tool] ?? 0)) + 1;
  if (value >= profile.durability) {
    if (countItem(nextItems, 'repairKit') > 0) {
      spendItem(nextItems, 'repairKit');
      const repairedWear = Math.max(0, profile.durability - REPAIR_KIT_RESTORE);
      if (repairedWear > 0) nextWear[tool] = repairedWear;
      else delete nextWear[tool];
      return {
        tool,
        broke: false,
        repaired: true,
        wear: nextWear,
        craftedItems: nextItems,
        message: `field repair kit saved ${profile.name.toLowerCase()} · ${profile.durability - repairedWear}/${profile.durability}`,
      };
    }
    const count = Math.max(0, Math.trunc(nextItems[tool] ?? 0)) - 1;
    if (count > 0) nextItems[tool] = count;
    else delete nextItems[tool];
    delete nextWear[tool];
    return {
      tool,
      broke: true,
      repaired: false,
      wear: nextWear,
      craftedItems: nextItems,
      message: `${profile.name.toLowerCase()} broke`,
    };
  }
  nextWear[tool] = value;
  return { tool, broke: false, repaired: false, wear: nextWear, craftedItems: nextItems };
}

export function toolSummary(craftedItems: InventoryItems, wear: ToolWear): { owned: ToolEffect[]; bestReachBonus: number; repairKits: number } {
  const owned = TOOL_ITEM_IDS
    .filter((id) => hasTool(craftedItems, id))
    .map((id) => effect(TOOL_PROFILES[id], wear));
  return { owned, bestReachBonus: maxReachBonus(craftedItems), repairKits: countItem(craftedItems, 'repairKit') };
}

export function isToolItem(id: ItemId): id is ToolItemId {
  return (TOOL_ITEM_IDS as readonly string[]).includes(id);
}
