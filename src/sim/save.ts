import type { Columns } from '../world/columns';
import { TREE_CHOP_STAGES, type Trees } from '../world/trees';
import type { MoveMode, Player } from '../player/player';
import { normalizeInventory, type InventoryItems } from './crafting';
import { MineProgress, normalizeMineProgress, type MineProgressSave } from './mining';
import { normalizeResourceDrops, type ResourceDropSave } from './resourceDrops';
import { normalizeStructureSaves, type StructureSave } from './structures';
import { normalizePentagonList } from './landmarks';
import { normalizeToolWear, type ToolWear } from './tools';
import { normalizeSurvivalState, normalizeTimeState, normalizeWeatherState, type SurvivalState, type TimeState, type WeatherState } from './survival';

// Bumped for the controlled-burn cut (2026-07-08): save shape changed across ~20 systems,
// old saves are incompatible and intentionally not migrated — this forces a clean reset.
export const SAVE_VERSION = 2;

export interface ColumnEditSave {
  tile: number;
  solid: number[];
  placed: number[];
  mat?: number[];
}

export interface TreeChopProgressSave {
  tile: number;
  progress: number;
}

export interface PlayerSave {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  fwdX: number; fwdY: number; fwdZ: number;
  pitch: number;
  mode: MoveMode;
  tile: number;
  throttle: number;
  holdAGL: number;
  planeSpeed: number;
}

export interface WorldSave {
  version: typeof SAVE_VERSION;
  seed: string;
  frequency: number;
  savedAt: number;
  player: PlayerSave;
  inventory: number[];
  craftedItems: InventoryItems;
  hotbarSel: number;
  planeCrafted: boolean;
  columns: ColumnEditSave[];
  choppedTrees: number[];
  treeChopProgress: TreeChopProgressSave[];
  mineProgress: MineProgressSave[];
  drops: ResourceDropSave[];
  structures: StructureSave[];
  crops: unknown[];
  time: TimeState;
  weather: WeatherState;
  survival: SurvivalState;
  progression: { pentagons: number[]; toolWear: ToolWear };
}

export interface CaptureWorldSaveInput {
  seed: string;
  frequency: number;
  player: Player;
  columns: Columns;
  trees: Trees;
  mining?: MineProgress;
  inventory: readonly number[];
  craftedItems?: InventoryItems;
  drops?: readonly ResourceDropSave[];
  structures?: readonly StructureSave[];
  progression?: { pentagons?: readonly number[]; toolWear?: ToolWear };
  time?: TimeState;
  weather?: WeatherState;
  survival?: SurvivalState;
  hotbarSel: number;
  planeCrafted: boolean;
  savedAt?: number;
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function intArray(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const n of v) {
    if (!finite(n)) return null;
    out.push(Math.trunc(n));
  }
  return out;
}

function inventoryObject(v: unknown): InventoryItems | null {
  if (v === undefined) return {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: InventoryItems = {};
  for (const [id, count] of Object.entries(v)) {
    if (!finite(count)) return null;
    out[id as keyof InventoryItems] = Math.max(0, Math.trunc(count));
  }
  return normalizeInventory(out);
}

export function saveSlotKey(seed: string, frequency: number): string {
  return `goldberg-planet:hearth-horizon:v${SAVE_VERSION}:m${frequency}:${encodeURIComponent(seed)}`;
}

export function capturePlayer(player: Player): PlayerSave {
  return {
    px: player.px, py: player.py, pz: player.pz,
    vx: player.vx, vy: player.vy, vz: player.vz,
    fwdX: player.fwdX, fwdY: player.fwdY, fwdZ: player.fwdZ,
    pitch: player.pitch,
    mode: player.mode,
    tile: player.tile,
    throttle: player.throttle,
    holdAGL: player.holdAGL,
    planeSpeed: player.planeSpeed,
  };
}

export function applyPlayerSave(player: Player, save: PlayerSave, tileCount: number): boolean {
  const nums = [
    save.px, save.py, save.pz, save.vx, save.vy, save.vz,
    save.fwdX, save.fwdY, save.fwdZ, save.pitch,
    save.throttle, save.holdAGL, save.planeSpeed,
  ];
  if (!nums.every(finite)) return false;
  const r = Math.hypot(save.px, save.py, save.pz);
  const f = Math.hypot(save.fwdX, save.fwdY, save.fwdZ);
  if (r < 1 || f < 1e-6) return false;
  if (!['walk', 'fly', 'plane'].includes(save.mode)) return false;
  player.px = save.px; player.py = save.py; player.pz = save.pz;
  player.vx = save.vx; player.vy = save.vy; player.vz = save.vz;
  player.fwdX = save.fwdX; player.fwdY = save.fwdY; player.fwdZ = save.fwdZ;
  player.pitch = Math.max(-1.55, Math.min(1.55, save.pitch));
  player.mode = save.mode;
  player.tile = Math.max(0, Math.min(tileCount - 1, Math.trunc(save.tile)));
  player.throttle = save.throttle;
  player.holdAGL = save.holdAGL;
  player.planeSpeed = save.planeSpeed;
  player.grounded = false;
  player.planeStowed = false;
  player.stepSmooth = 0;
  player.reorthonormalize();
  return true;
}

export function serializeColumnEdits(columns: Columns): ColumnEditSave[] {
  return [...columns.edits.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tile, edit]) => ({
      tile,
      solid: Array.from(edit.solid),
      placed: Array.from(edit.placed),
      mat: edit.mat ? Array.from(edit.mat) : undefined,
    }));
}

export function applyColumnEdits(columns: Columns, edits: readonly ColumnEditSave[]): void {
  columns.edits.clear();
  for (const e of edits) {
    const tile = Math.trunc(e.tile);
    if (tile < 0 || tile >= columns.geo.count) continue;
    if (e.solid.length !== columns.words || e.placed.length !== columns.words) continue;
    const mat = e.mat && e.mat.length === columns.layers.L ? Uint8Array.from(e.mat) : undefined;
    columns.edits.set(tile, {
      solid: Uint32Array.from(e.solid),
      placed: Uint32Array.from(e.placed),
      mat,
    });
  }
}

export function serializeChoppedTrees(trees: Trees): number[] {
  return [...trees.chopped].sort((a, b) => a - b);
}

export function applyChoppedTrees(trees: Trees, chopped: readonly number[], tileCount: number): void {
  trees.chopped.clear();
  trees.chopProgress.clear();
  for (const id of chopped) {
    const tile = Math.trunc(id);
    if (tile >= 0 && tile < tileCount) trees.chopped.add(tile);
  }
}

export function serializeTreeChopProgress(trees: Trees): TreeChopProgressSave[] {
  return [...trees.chopProgress.entries()]
    .filter(([tile, progress]) => progress > 0 && progress < TREE_CHOP_STAGES && trees.hasTree(tile))
    .sort((a, b) => a[0] - b[0])
    .map(([tile, progress]) => ({ tile, progress }));
}

function normalizeTreeChopProgress(raw: unknown, tileCount: number, chopped: Iterable<number> = []): TreeChopProgressSave[] {
  if (!Array.isArray(raw)) return [];
  const choppedSet = new Set([...chopped].map((n) => Math.trunc(n)));
  const seen = new Set<number>();
  const out: TreeChopProgressSave[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const v = entry as Partial<TreeChopProgressSave>;
    if (!finite(v.tile) || !finite(v.progress)) continue;
    const tile = Math.trunc(v.tile);
    if (tile < 0 || tile >= tileCount || choppedSet.has(tile) || seen.has(tile)) continue;
    const progress = Math.max(0, Math.min(TREE_CHOP_STAGES - 0.01, v.progress));
    if (progress <= 0) continue;
    seen.add(tile);
    out.push({ tile, progress });
  }
  return out.sort((a, b) => a.tile - b.tile);
}

export function applyTreeChopProgress(trees: Trees, progress: readonly TreeChopProgressSave[], tileCount: number): void {
  trees.chopProgress.clear();
  for (const entry of normalizeTreeChopProgress(progress, tileCount, trees.chopped)) {
    if (trees.hasTree(entry.tile)) trees.chopProgress.set(entry.tile, entry.progress);
  }
}

export function captureWorldSave(input: CaptureWorldSaveInput): WorldSave {
  return {
    version: SAVE_VERSION,
    seed: input.seed,
    frequency: input.frequency,
    savedAt: input.savedAt ?? Date.now(),
    player: capturePlayer(input.player),
    inventory: input.inventory.map((n) => Math.max(0, Math.trunc(n))),
    craftedItems: normalizeInventory(input.craftedItems),
    hotbarSel: Math.max(0, Math.trunc(input.hotbarSel)),
    planeCrafted: input.planeCrafted,
    columns: serializeColumnEdits(input.columns),
    choppedTrees: serializeChoppedTrees(input.trees),
    treeChopProgress: serializeTreeChopProgress(input.trees),
    mineProgress: input.mining ? input.mining.serialize((tile, layer) => input.columns.solidAt(tile, layer)) : [],
    drops: normalizeResourceDrops(input.drops, Number.MAX_SAFE_INTEGER),
    structures: input.structures ? [...input.structures] : [],
    crops: [],
    time: normalizeTimeState(input.time),
    weather: normalizeWeatherState(input.weather),
    survival: normalizeSurvivalState(input.survival),
    progression: {
      pentagons: normalizePentagonList(input.progression?.pentagons),
      toolWear: normalizeToolWear(input.progression?.toolWear),
    },
  };
}

export function parseWorldSaveJson(json: string): WorldSave | null {
  try {
    const v = JSON.parse(json) as Partial<WorldSave>;
    if (v.version !== SAVE_VERSION) return null;
    if (typeof v.seed !== 'string' || !finite(v.frequency) || !finite(v.savedAt)) return null;
    if (!v.player || typeof v.player !== 'object') return null;
    const p = v.player as Partial<PlayerSave>;
    if (!['walk', 'fly', 'plane'].includes(p.mode ?? '')) return null;
    const playerNums = [
      p.px, p.py, p.pz, p.vx, p.vy, p.vz, p.fwdX, p.fwdY, p.fwdZ,
      p.pitch, p.tile, p.throttle, p.holdAGL, p.planeSpeed,
    ];
    if (!playerNums.every(finite)) return null;
    const inventory = intArray(v.inventory);
    const craftedItems = inventoryObject(v.craftedItems);
    const choppedTrees = intArray(v.choppedTrees);
    if (!inventory || !craftedItems || !choppedTrees || !Array.isArray(v.columns)) return null;
    const treeChopProgress = normalizeTreeChopProgress(v.treeChopProgress, Number.MAX_SAFE_INTEGER, choppedTrees);
    const mineProgress = normalizeMineProgress(v.mineProgress, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    const drops = normalizeResourceDrops(v.drops, Number.MAX_SAFE_INTEGER);
    const columns: ColumnEditSave[] = [];
    for (const c of v.columns as Partial<ColumnEditSave>[]) {
      if (!finite(c.tile)) return null;
      const solid = intArray(c.solid);
      const placed = intArray(c.placed);
      const mat = c.mat === undefined ? undefined : intArray(c.mat);
      if (!solid || !placed || mat === null) return null;
      columns.push({ tile: Math.trunc(c.tile), solid, placed, mat });
    }
    return {
      version: SAVE_VERSION,
      seed: v.seed,
      frequency: Math.trunc(v.frequency),
      savedAt: v.savedAt,
      player: {
        px: p.px!, py: p.py!, pz: p.pz!,
        vx: p.vx!, vy: p.vy!, vz: p.vz!,
        fwdX: p.fwdX!, fwdY: p.fwdY!, fwdZ: p.fwdZ!,
        pitch: p.pitch!,
        mode: p.mode as MoveMode,
        tile: Math.trunc(p.tile!),
        throttle: p.throttle!,
        holdAGL: p.holdAGL!,
        planeSpeed: p.planeSpeed!,
      },
      inventory,
      craftedItems,
      hotbarSel: finite(v.hotbarSel) ? Math.trunc(v.hotbarSel) : 0,
      planeCrafted: v.planeCrafted === true,
      columns,
      choppedTrees,
      treeChopProgress,
      mineProgress,
      drops,
      structures: normalizeStructureSaves(v.structures, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      crops: Array.isArray(v.crops) ? v.crops : [],
      time: normalizeTimeState(v.time),
      weather: normalizeWeatherState(v.weather),
      survival: normalizeSurvivalState(v.survival),
      progression: v.progression && Array.isArray(v.progression.pentagons)
        ? {
          pentagons: normalizePentagonList(intArray(v.progression.pentagons) ?? []),
          toolWear: normalizeToolWear(v.progression.toolWear),
        }
        : { pentagons: [], toolWear: {} },
    };
  } catch {
    return null;
  }
}

export function loadStoredWorldSave(key: string, seed: string, frequency: number): WorldSave | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const save = parseWorldSaveJson(raw);
    if (!save || save.seed !== seed || save.frequency !== frequency) return null;
    return save;
  } catch {
    return null;
  }
}

export function storeWorldSave(key: string, save: WorldSave): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredWorldSave(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private/embedded contexts.
  }
}
