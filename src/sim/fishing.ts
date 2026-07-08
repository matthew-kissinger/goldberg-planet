import type { InventoryItems, ItemId } from './crafting';
import type { WeatherReport } from './survival';
import type { NaturalVoidKind } from '../world/caves';

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

export type FishingCueAction = 'land' | 'craftRod' | 'moveToWater' | 'cast' | 'wait';

export interface FishingCueOptions {
  hasRod: boolean;
  nearWater: boolean;
  nearDock?: boolean;
  inPlane?: boolean;
  castLabel?: string;
}

export interface FishingCueReport {
  action: FishingCueAction;
  canCast: boolean;
  showInVitals: boolean;
  schoolKind: FishSchoolKind;
  schoolLabel: string;
  catchCount: number;
  usesBait: boolean;
  baitUseful: boolean;
  hud: string;
  detail: string;
  failureReason?: string;
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
  const strength = clamp(0.5 + 0.5 * timeWave + weatherBoost + caveBoost + dockBoost, 0, 1);
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

export function fishingCueForSchool(school: FishSchoolReport, opts: FishingCueOptions): FishingCueReport {
  const castLabel = opts.castLabel ?? 'R cast';
  const nearFishingWater = opts.nearWater || opts.nearDock === true || school.kind === 'cave';
  const base = {
    schoolKind: school.kind,
    schoolLabel: school.label,
    catchCount: school.catchCount,
    usesBait: school.usesBait,
    baitUseful: school.baitUseful,
  };

  if (opts.inPlane) {
    return {
      ...base,
      action: 'land',
      canCast: false,
      showInVitals: false,
      hud: 'land to fish',
      detail: 'Land before fishing.',
      failureReason: 'in plane',
    };
  }

  if (!opts.hasRod) {
    return {
      ...base,
      action: 'craftRod',
      canCast: false,
      showInVitals: nearFishingWater,
      hud: 'craft fishing rod to cast',
      detail: 'Craft fishing rod to cast here.',
      failureReason: 'no rod',
    };
  }

  if (!nearFishingWater) {
    return {
      ...base,
      action: 'moveToWater',
      canCast: false,
      showInVitals: false,
      hud: 'find shore water to fish',
      detail: 'Fishing needs water beside you.',
      failureReason: 'no water',
    };
  }

  if (school.catchCount <= 0) {
    return {
      ...base,
      action: 'wait',
      canCast: true,
      showInVitals: true,
      hud: `${castLabel}: ${school.label}${school.baitUseful ? ' · bait may help' : ''}`,
      detail: `${castLabel}: ${school.label}${school.baitUseful ? ' · bait may help' : ''}.`,
    };
  }

  const bait = school.usesBait ? ' · bait ready' : school.baitUseful ? ' · bait helps' : '';
  return {
    ...base,
    action: 'cast',
    canCast: true,
    showInVitals: true,
    hud: `${castLabel}: ${school.label} · +${school.catchCount} raw fish${bait}`,
    detail: `${castLabel}: ${school.label} · +${school.catchCount} raw fish${bait}.`,
  };
}
