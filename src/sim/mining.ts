import type { MaterialItemId } from './crafting';
import type { ToolEffect } from './tools';

export interface MineProgressSave {
  tile: number;
  layer: number;
  progress: number;
  needed?: number;
}

export interface MineStrikeResult {
  hit: boolean;
  mined: boolean;
  progress: number;
  needed: number;
  remaining: number;
  damage: number;
}

export interface CellDamageProvider {
  damageOf(tile: number, layer: number): number;
}

export const MAX_MINING_STAGES = 6;

function key(tile: number, layer: number): string {
  return `${Math.trunc(tile)}:${Math.trunc(layer)}`;
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function miningStagesForMaterial(material: MaterialItemId): number {
  switch (material) {
    case 'rock': return 4;
    case 'wood': return 3;
    case 'dirt':
    case 'sand':
    case 'snow':
      return 2;
    default:
      return 3;
  }
}

export function miningPowerForTool(material: MaterialItemId, tool: ToolEffect): number {
  if (tool.tool?.startsWith('echo')) return material === 'rock' ? 2.6 : 2.25;
  if (tool.target === 'rock' && material === 'rock') return 1.75;
  if (tool.target === 'soil' && (material === 'dirt' || material === 'sand' || material === 'snow')) return 1.7;
  if (tool.target === 'wood' && material === 'wood') return 1.45;
  return 1;
}

export function normalizeMineProgress(
  raw: unknown,
  tileCount = Number.MAX_SAFE_INTEGER,
  layerCount = Number.MAX_SAFE_INTEGER,
  solidAt?: (tile: number, layer: number) => boolean,
): MineProgressSave[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MineProgressSave[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const v = entry as Partial<MineProgressSave>;
    if (!finite(v.tile) || !finite(v.layer) || !finite(v.progress)) continue;
    const tile = Math.trunc(v.tile);
    const layer = Math.trunc(v.layer);
    if (tile < 0 || tile >= tileCount || layer < 0 || layer >= layerCount) continue;
    if (solidAt && !solidAt(tile, layer)) continue;
    const id = key(tile, layer);
    if (seen.has(id)) continue;
    const progress = Math.max(0, Math.min(MAX_MINING_STAGES - 0.01, v.progress));
    if (progress <= 0) continue;
    const needed = finite(v.needed) ? Math.max(1, Math.min(MAX_MINING_STAGES, v.needed)) : undefined;
    seen.add(id);
    out.push(needed ? { tile, layer, progress, needed } : { tile, layer, progress });
  }
  return out.sort((a, b) => a.tile - b.tile || a.layer - b.layer);
}

export class MineProgress implements CellDamageProvider {
  readonly progress = new Map<string, MineProgressSave>();

  constructor(initial?: readonly MineProgressSave[]) {
    if (initial) this.load(initial);
  }

  load(entries: readonly MineProgressSave[]): void {
    this.progress.clear();
    for (const entry of entries) {
      if (!finite(entry.tile) || !finite(entry.layer) || !finite(entry.progress)) continue;
      const tile = Math.trunc(entry.tile);
      const layer = Math.trunc(entry.layer);
      if (tile < 0 || layer < 0 || entry.progress <= 0) continue;
      const needed = finite(entry.needed) ? Math.max(1, Math.min(MAX_MINING_STAGES, entry.needed)) : undefined;
      this.progress.set(key(tile, layer), {
        tile,
        layer,
        progress: Math.min(MAX_MINING_STAGES - 0.01, entry.progress),
        needed,
      });
    }
  }

  clear(tile: number, layer?: number): void {
    const t = Math.trunc(tile);
    if (layer === undefined) {
      for (const entryKey of [...this.progress.keys()]) {
        if (entryKey.startsWith(`${t}:`)) this.progress.delete(entryKey);
      }
      return;
    }
    this.progress.delete(key(t, layer));
  }

  strike(tile: number, layer: number, power = 1, needed = MAX_MINING_STAGES): MineStrikeResult {
    const t = Math.max(0, Math.trunc(tile));
    const l = Math.max(0, Math.trunc(layer));
    const required = Math.max(1, Math.min(MAX_MINING_STAGES, Number.isFinite(needed) ? needed : MAX_MINING_STAGES));
    const id = key(t, l);
    const next = Math.min(required, Math.max(0, this.progress.get(id)?.progress ?? 0) + Math.max(0.1, Number.isFinite(power) ? power : 1));
    if (next >= required) {
      this.progress.delete(id);
      return { hit: true, mined: true, progress: required, needed: required, remaining: 0, damage: 1 };
    }
    this.progress.set(id, { tile: t, layer: l, progress: next, needed: required });
    return {
      hit: true,
      mined: false,
      progress: next,
      needed: required,
      remaining: required - next,
      damage: Math.max(0, Math.min(0.98, next / required)),
    };
  }

  damageOf(tile: number, layer: number, needed = MAX_MINING_STAGES): number {
    const entry = this.progress.get(key(tile, layer));
    if (!entry) return 0;
    const required = Math.max(1, Math.min(MAX_MINING_STAGES, Number.isFinite(entry.needed) ? entry.needed! : Number.isFinite(needed) ? needed : MAX_MINING_STAGES));
    return Math.max(0, Math.min(0.98, entry.progress / required));
  }

  serialize(solidAt?: (tile: number, layer: number) => boolean): MineProgressSave[] {
    return normalizeMineProgress([...this.progress.values()], Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, solidAt);
  }
}
