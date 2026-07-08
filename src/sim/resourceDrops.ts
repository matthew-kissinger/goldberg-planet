import { ITEM_DEFS, type ItemId } from './crafting';

export type ResourceDropSource = 'tree' | 'mine' | 'creature' | 'debug';

export interface ResourceDropSave {
  id: number;
  item: ItemId;
  count: number;
  tile: number;
  offsetA: number;
  offsetB: number;
  /**
   * World-space radius (distance from the planet center) of the ground the drop rests
   * on, captured once at spawn time. Rendering must read this cached value instead of
   * recomputing it from live terrain every frame — otherwise mining/building near a
   * drop makes it visibly snap to the new height. 0 means "not cached yet" (legacy save
   * data); callers should backfill it once from current terrain, then leave it fixed.
   */
  groundRadius: number;
  age: number;
  source: ResourceDropSource;
}

export interface DropCollectResult {
  remaining: ResourceDropSave[];
  collected: ResourceDropSave[];
}

export interface DropDespawnResult {
  remaining: ResourceDropSave[];
  despawned: ResourceDropSave[];
}

export const RESOURCE_DROP_PICKUP_DELAY = 0.9;

/** Uncollected drops disappear after this many seconds of real time (~8 minutes). */
export const RESOURCE_DROP_DESPAWN_AGE = 480;

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function itemId(v: unknown): ItemId | null {
  return typeof v === 'string' && v in ITEM_DEFS ? v as ItemId : null;
}

function sourceId(v: unknown): ResourceDropSource {
  return v === 'mine' || v === 'creature' || v === 'debug' ? v : 'tree';
}

function hash01(a: number, b: number): number {
  let h = (Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function normalizeDrop(raw: unknown, tileCount: number): ResourceDropSave | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Partial<ResourceDropSave>;
  const item = itemId(v.item);
  if (!item || !finite(v.id) || !finite(v.count) || !finite(v.tile)) return null;
  const tile = Math.trunc(v.tile);
  if (tile < 0 || tile >= tileCount) return null;
  const count = Math.max(1, Math.min(999, Math.trunc(v.count)));
  return {
    id: Math.max(1, Math.trunc(v.id)),
    item,
    count,
    tile,
    offsetA: finite(v.offsetA) ? Math.max(-2.4, Math.min(2.4, v.offsetA)) : 0,
    offsetB: finite(v.offsetB) ? Math.max(-2.4, Math.min(2.4, v.offsetB)) : 0,
    groundRadius: finite(v.groundRadius) && v.groundRadius > 0 ? v.groundRadius : 0,
    age: finite(v.age) ? Math.max(0, Math.min(3600, v.age)) : 0,
    source: sourceId(v.source),
  };
}

export function normalizeResourceDrops(raw: unknown, tileCount = Number.MAX_SAFE_INTEGER): ResourceDropSave[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: ResourceDropSave[] = [];
  for (const entry of raw) {
    const drop = normalizeDrop(entry, tileCount);
    if (!drop || seen.has(drop.id)) continue;
    seen.add(drop.id);
    out.push(drop);
  }
  return out.sort((a, b) => a.id - b.id);
}

export function nextResourceDropId(drops: readonly ResourceDropSave[]): number {
  let max = 0;
  for (const drop of drops) max = Math.max(max, Math.trunc(drop.id));
  return max + 1;
}

export function spawnItemDrops(
  tile: number,
  startId: number,
  groundRadius: number,
  item: ItemId,
  total = 1,
  source: ResourceDropSource = 'debug',
  maxStacks = 2,
): { drops: ResourceDropSave[]; nextId: number } {
  const count = Math.max(1, Math.trunc(total));
  const stacks = Math.max(1, Math.min(Math.max(1, Math.trunc(maxStacks)), count));
  const drops: ResourceDropSave[] = [];
  let remaining = count;
  let nextId = Math.max(1, Math.trunc(startId));
  const groundR = finite(groundRadius) && groundRadius > 0 ? groundRadius : 0;
  const itemSalt = item.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  for (let i = 0; i < stacks; i++) {
    const stack = Math.ceil(remaining / (stacks - i));
    remaining -= stack;
    const angle = hash01(tile + itemSalt, i + 17) * Math.PI * 2;
    const radius = 0.38 + hash01(tile + itemSalt, i + 41) * 0.95;
    drops.push({
      id: nextId++,
      item,
      count: stack,
      tile: Math.max(0, Math.trunc(tile)),
      offsetA: Math.cos(angle) * radius,
      offsetB: Math.sin(angle) * radius,
      groundRadius: groundR,
      age: 0,
      source,
    });
  }
  return { drops, nextId };
}

export function spawnTreeWoodDrops(tile: number, startId: number, groundRadius: number, total = 6): { drops: ResourceDropSave[]; nextId: number } {
  return spawnItemDrops(tile, startId, groundRadius, 'wood', total, 'tree', 3);
}

export function spawnMinedItemDrops(tile: number, startId: number, groundRadius: number, item: ItemId, total = 1): { drops: ResourceDropSave[]; nextId: number } {
  return spawnItemDrops(tile, startId, groundRadius, item, total, 'mine', Math.min(3, Math.max(1, Math.trunc(total))));
}

export function ageResourceDrops(drops: readonly ResourceDropSave[], dt: number): ResourceDropSave[] {
  const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  return drops.map((drop) => ({
    ...drop,
    age: Math.min(3600, drop.age + seconds),
  }));
}

export function collectReadyResourceDrops(
  drops: readonly ResourceDropSave[],
  collectTiles: ReadonlySet<number>,
  minAge = RESOURCE_DROP_PICKUP_DELAY,
): DropCollectResult {
  const remaining: ResourceDropSave[] = [];
  const collected: ResourceDropSave[] = [];
  for (const drop of drops) {
    if (drop.age >= minAge && collectTiles.has(drop.tile)) collected.push(drop);
    else remaining.push(drop);
  }
  return { remaining, collected };
}

/** Removes drops that have sat uncollected for `maxAge` seconds so the world doesn't accumulate clutter. */
export function despawnAgedResourceDrops(
  drops: readonly ResourceDropSave[],
  maxAge = RESOURCE_DROP_DESPAWN_AGE,
): DropDespawnResult {
  const remaining: ResourceDropSave[] = [];
  const despawned: ResourceDropSave[] = [];
  for (const drop of drops) {
    if (drop.age >= maxAge) despawned.push(drop);
    else remaining.push(drop);
  }
  return { remaining, despawned };
}
