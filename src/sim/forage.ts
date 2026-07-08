import type { InventoryItems, ItemId } from './crafting';
import type { WeatherReport } from './survival';
import type { NaturalVoidKind } from '../world/caves';

export type ForageKind = 'none' | 'berryPatch' | 'seedPods' | 'snowHerb' | 'caveMushroom' | 'kelp' | 'reeds';

export interface ForageContext {
  tile: number;
  day: number;
  minute: number;
  height: number;
  nearWater: boolean;
  weatherKind?: WeatherReport['kind'];
  caveKind?: NaturalVoidKind | null;
  thresholdForageBoost?: number;
  thresholdLabel?: string;
}

export interface ForageReport {
  kind: ForageKind;
  item?: ItemId;
  count: number;
  label: string;
  strength: number;
  message: string;
}

export interface ForageResult {
  ok: boolean;
  item?: ItemId;
  count?: number;
  report: ForageReport;
  message: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function add(items: InventoryItems, item: ItemId, amount: number): void {
  if (amount <= 0) return;
  items[item] = Math.max(0, Math.trunc(items[item] ?? 0) + amount);
}

export function forageAt(ctx: ForageContext): ForageReport {
  const tile = Math.max(0, Math.trunc(ctx.tile));
  const day = Math.max(0, Math.trunc(ctx.day));
  const minute = clamp(ctx.minute, 0, 24 * 60);
  const wave = Math.sin((tile * 0.023 + day * 0.61 + minute / (24 * 60) * 1.7) * Math.PI);
  const thresholdBoost = clamp(ctx.thresholdForageBoost ?? 0, 0, 0.35);
  const thresholdLabel = ctx.thresholdLabel ?? 'threshold';
  const strength = clamp(0.5 + 0.5 * wave + thresholdBoost, 0, 1);

  if (ctx.caveKind === 'dryCave') {
    return {
      kind: 'caveMushroom',
      item: 'caveMushroom',
      count: strength > 0.72 ? 3 : 2,
      label: 'cave mushroom shelf',
      strength,
      message: 'foraged cave mushrooms',
    };
  }
  if (ctx.caveKind === 'seaCave') {
    return {
      kind: 'kelp',
      item: 'kelp',
      count: strength > 0.62 ? 3 : 2,
      label: 'sea-cave kelp',
      strength,
      message: 'foraged sea-cave kelp',
    };
  }
  if (ctx.nearWater && ctx.height < 1.2 && strength > 0.22) {
    return {
      kind: 'kelp',
      item: 'kelp',
      count: strength > 0.7 ? 2 : 1,
      label: 'shore kelp',
      strength,
      message: 'foraged shore kelp',
    };
  }
  if (ctx.nearWater && ctx.height < 7 && strength > 0.32) {
    return {
      kind: 'reeds',
      item: 'reeds',
      count: strength > 0.74 ? 3 : 2,
      label: 'shore reeds',
      strength,
      message: 'cut shore reeds',
    };
  }
  if ((ctx.weatherKind === 'cold' || ctx.height > 42) && strength > 0.28) {
    return {
      kind: 'snowHerb',
      item: 'snowHerb',
      count: strength > 0.78 ? 2 : 1,
      label: 'snow herb sprig',
      strength,
      message: 'foraged snow herbs',
    };
  }
  if (thresholdBoost > 0 && ctx.height > -8 && ctx.height < 46 && strength > 0.32) {
    return {
      kind: 'berryPatch',
      item: 'berries',
      count: strength > 0.82 ? 3 : 2,
      label: `${thresholdLabel} forage`,
      strength,
      message: 'foraged threshold forage',
    };
  }
  if (ctx.height > 0 && ctx.height < 38 && strength > 0.58) {
    return {
      kind: 'berryPatch',
      item: 'berries',
      count: strength > 0.86 ? 3 : 2,
      label: 'wild berry patch',
      strength,
      message: 'foraged wild berries',
    };
  }
  return {
    kind: 'none',
    count: 0,
    label: 'no forage',
    strength,
    message: 'nothing useful to forage here',
  };
}

export function applyForage(items: InventoryItems, report: ForageReport): ForageResult {
  if (!report.item || report.count <= 0) return { ok: false, report, message: report.message };
  add(items, report.item, report.count);
  return {
    ok: true,
    item: report.item,
    count: report.count,
    report,
    message: `${report.message} ${report.count}`,
  };
}
