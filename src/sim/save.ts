import { TREE_CHOP_STAGES, type Trees } from '../world/trees';
import type { MoveMode, Player } from '../player/player';
import { normalizeInventory, type Inventory } from './crafting';
import { normalizeResourceDrops, type ResourceDropSave } from './resourceDrops';
import type { PlacedStructure } from './persistence';
import type { SerializedColumnEdit } from '../world/columns';

export const SAVE_VERSION = 4;

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

export interface PlanetDeltaSave {
  choppedTrees: number[];
  treeChopProgress: TreeChopProgressSave[];
  columnEdits: SerializedColumnEdit[];
  seededEcoTiles: number[];
  drops: ResourceDropSave[];
}

export interface WorldSave {
  version: typeof SAVE_VERSION;
  seed: string;
  frequency: number;
  savedAt: number;
  player: PlayerSave;
  inventory: Inventory;
  planeCrafted: boolean;
  choppedTrees: number[];
  treeChopProgress: TreeChopProgressSave[];
  drops: ResourceDropSave[];
  activePlanetId?: string;
  structures?: PlacedStructure[];
  planetDeltas?: Record<string, PlanetDeltaSave>;
}

export interface CaptureWorldSaveInput {
  seed: string;
  frequency: number;
  player: Player;
  trees: Trees;
  inventory: Inventory;
  drops?: readonly ResourceDropSave[];
  planeCrafted: boolean;
  savedAt?: number;
  activePlanetId?: string;
  structures?: readonly PlacedStructure[];
  planetDeltas?: Record<string, PlanetDeltaSave>;
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

export function saveSlotKey(seed: string, frequency: number): string {
  return `goldberg-planet:v${SAVE_VERSION}:m${frequency}:${encodeURIComponent(seed)}`;
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
  const out: WorldSave = {
    version: SAVE_VERSION,
    seed: input.seed,
    frequency: input.frequency,
    savedAt: input.savedAt ?? Date.now(),
    player: capturePlayer(input.player),
    inventory: normalizeInventory(input.inventory),
    planeCrafted: input.planeCrafted,
    choppedTrees: serializeChoppedTrees(input.trees),
    treeChopProgress: serializeTreeChopProgress(input.trees),
    drops: normalizeResourceDrops(input.drops, Number.MAX_SAFE_INTEGER),
  };
  if (input.activePlanetId) out.activePlanetId = input.activePlanetId;
  if (input.structures && input.structures.length > 0) out.structures = [...input.structures];
  if (input.planetDeltas) out.planetDeltas = input.planetDeltas;
  return out;
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
    const choppedTrees = intArray(v.choppedTrees);
    if (!choppedTrees) return null;
    const out: WorldSave = {
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
      inventory: normalizeInventory(v.inventory),
      planeCrafted: v.planeCrafted === true,
      choppedTrees,
      treeChopProgress: normalizeTreeChopProgress(v.treeChopProgress, Number.MAX_SAFE_INTEGER, choppedTrees),
      drops: normalizeResourceDrops(v.drops, Number.MAX_SAFE_INTEGER),
    };
    if (typeof v.activePlanetId === 'string') out.activePlanetId = v.activePlanetId;
    if (Array.isArray(v.structures)) out.structures = v.structures;
    if (v.planetDeltas && typeof v.planetDeltas === 'object') out.planetDeltas = v.planetDeltas;
    return out;
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
