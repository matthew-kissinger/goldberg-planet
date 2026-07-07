import type { InventoryItems, ItemId } from './crafting';
import type { WeatherReport } from './survival';
import type { NaturalVoidKind } from '../world/caves';
import type { PentagonInsightEffect } from './landmarks';

export type FishSchoolKind = 'none' | 'shore' | 'dock' | 'run' | 'storm' | 'cave';

export interface FishSchoolContext {
  tile: number;
  day: number;
  minute: number;
  nearWater: boolean;
  dock?: boolean;
  bait: number;
  weatherKind?: WeatherReport['kind'];
  caveKind?: NaturalVoidKind | null;
  domainEffect?: PentagonInsightEffect | null;
  domainIntensity?: number;
  thresholdFishBoost?: number;
  thresholdLabel?: string;
}

export interface FishSchoolReport {
  kind: FishSchoolKind;
  label: string;
  strength: number;
  catchCount: number;
  baitUseful: boolean;
  usesBait: boolean;
  message: string;
}

export interface FishCatchResult {
  ok: boolean;
  item?: ItemId;
  count?: number;
  usedBait?: boolean;
  school: FishSchoolReport;
  message: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function count(items: InventoryItems, id: ItemId): number {
  return Math.max(0, Math.trunc(items[id] ?? 0));
}

function spend(items: InventoryItems, id: ItemId, amount: number): boolean {
  const have = count(items, id);
  if (have < amount) return false;
  const next = have - amount;
  if (next > 0) items[id] = next;
  else delete items[id];
  return true;
}

function add(items: InventoryItems, id: ItemId, amount: number): void {
  if (amount <= 0) return;
  items[id] = count(items, id) + amount;
}

export function fishSchoolAt(ctx: FishSchoolContext): FishSchoolReport {
  const tile = Math.max(0, Math.trunc(ctx.tile));
  const day = Math.max(0, Math.trunc(ctx.day));
  const minute = clamp(ctx.minute, 0, 24 * 60);
  const timeWave = Math.sin((tile * 0.019 + day * 0.71 + minute / (24 * 60) * 2.2) * Math.PI);
  const weatherBoost = ctx.weatherKind === 'storm' ? 0.28 : ctx.weatherKind === 'rain' ? 0.16 : ctx.weatherKind === 'mist' ? 0.08 : 0;
  const caveBoost = ctx.caveKind === 'seaCave' ? 0.34 : 0;
  const dockBoost = ctx.dock ? 0.18 : 0;
  const domainIntensity = clamp(ctx.domainIntensity ?? 0, 0, 1);
  const domainBoost = ctx.domainEffect === 'tide'
    ? 0.24 * domainIntensity
    : ctx.domainEffect === 'water'
    ? 0.18 * domainIntensity
    : ctx.domainEffect === 'storm'
    ? 0.16 * domainIntensity
    : ctx.domainEffect === 'cave' && ctx.caveKind === 'seaCave'
    ? 0.12 * domainIntensity
    : 0;
  const thresholdBoost = clamp(ctx.thresholdFishBoost ?? 0, 0, 0.35);
  const thresholdLabel = ctx.thresholdLabel ?? 'threshold';
  const strength = clamp(0.5 + 0.5 * timeWave + weatherBoost + caveBoost + dockBoost + domainBoost + thresholdBoost, 0, 1);
  const baitUseful = ctx.bait > 0;

  if (!ctx.nearWater && !ctx.dock && ctx.caveKind !== 'seaCave') {
    return {
      kind: 'none',
      label: 'dry ground',
      strength,
      catchCount: 0,
      baitUseful: false,
      usesBait: false,
      message: 'fishing needs water beside you',
    };
  }

  if (ctx.caveKind === 'seaCave') {
    const usesBait = baitUseful;
    return {
      kind: 'cave',
      label: 'cave fish shimmer',
      strength,
      catchCount: usesBait ? 3 : 2,
      baitUseful: true,
      usesBait,
      message: usesBait ? 'baited cave fish shimmer' : 'cave fish shimmer',
    };
  }

  if (ctx.weatherKind === 'storm') {
    const usesBait = baitUseful;
    return {
      kind: 'storm',
      label: 'storm fish run',
      strength,
      catchCount: usesBait ? 3 : 2,
      baitUseful: true,
      usesBait,
      message: usesBait ? 'baited storm fish run' : 'storm fish run',
    };
  }

  if ((ctx.domainEffect === 'tide' || ctx.domainEffect === 'water') && ctx.nearWater && strength >= 0.42) {
    const usesBait = baitUseful;
    return {
      kind: 'run',
      label: ctx.domainEffect === 'tide' ? 'salt-tide fish run' : 'reed-water fish run',
      strength,
      catchCount: usesBait ? 3 : 2,
      baitUseful: true,
      usesBait,
      message: usesBait ? 'baited landmark fish run' : 'landmark fish run',
    };
  }

  if (thresholdBoost > 0 && (ctx.nearWater || ctx.dock) && strength >= 0.24) {
    const usesBait = baitUseful;
    return {
      kind: 'run',
      label: `${thresholdLabel} fish run`,
      strength,
      catchCount: usesBait ? 3 : 2,
      baitUseful: true,
      usesBait,
      message: usesBait ? 'baited threshold fish run' : 'threshold fish run',
    };
  }

  if (ctx.dock && (strength >= 0.22 || baitUseful)) {
    const usesBait = baitUseful;
    return {
      kind: 'dock',
      label: usesBait ? 'baited dock run' : 'dockside fish run',
      strength,
      catchCount: usesBait ? 3 : 2,
      baitUseful: true,
      usesBait,
      message: usesBait ? 'baited dock catch' : 'dockside catch',
    };
  }

  if (strength >= 0.68) {
    const usesBait = baitUseful;
    return {
      kind: 'run',
      label: 'fish school',
      strength,
      catchCount: usesBait ? 3 : 2,
      baitUseful: true,
      usesBait,
      message: usesBait ? 'baited fish school' : 'fish school',
    };
  }

  if (strength >= 0.25 || baitUseful) {
    const usesBait = baitUseful;
    return {
      kind: 'shore',
      label: usesBait ? 'baited shore nibble' : 'shore nibble',
      strength,
      catchCount: usesBait ? 2 : 1,
      baitUseful: true,
      usesBait,
      message: usesBait ? 'baited shore catch' : 'shore catch',
    };
  }

  return {
    kind: 'none',
    label: 'quiet water',
    strength,
    catchCount: 0,
    baitUseful: true,
    usesBait: false,
    message: 'water is quiet · bait may help',
  };
}

export function applyFishingCatch(items: InventoryItems, school: FishSchoolReport): FishCatchResult {
  if (school.catchCount <= 0) {
    return { ok: false, school, message: school.message };
  }
  const usedBait = school.usesBait && spend(items, 'bait', 1);
  add(items, 'rawFish', school.catchCount);
  return {
    ok: true,
    item: 'rawFish',
    count: school.catchCount,
    usedBait,
    school,
    message: `caught raw fish ${school.catchCount} · ${school.label}${usedBait ? ' · bait used' : ''}`,
  };
}
