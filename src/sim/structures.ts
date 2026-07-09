import { ITEM_DEFS, MATERIAL_ITEM_IDS, normalizeInventory, type CraftedItemId, type InventoryItems, type ItemId, type MaterialItemId } from './crafting';
import type { FishSchoolReport } from './fishing';

export const PLACEABLE_ITEM_IDS = [
  'workbench',
  'campfire',
  'chest',
  'bedroll',
  'rainCistern',
  'rootCellar',
  'dockSegment',
  'fishTrap',
  'shoreNet',
  'dryingRack',
  'weatherVane',
  'lantern',
  'waystone',
] as const;

export type PlaceableItemId = typeof PLACEABLE_ITEM_IDS[number];

export interface StructureSave {
  id: number;
  item: PlaceableItemId;
  tile: number;
  layer: number;
  yaw: number;
  state?: StructureState;
}

export const STRUCTURE_YAW_STEP = Math.PI / 3;

export interface StructureState {
  storage?: InventoryItems;
  lit?: boolean;
  home?: boolean;
  rested?: number;
  water?: number;
  fills?: number;
  provisions?: number;
  caches?: number;
  preserves?: number;
  forecastReads?: number;
  forecastKind?: WeatherVaneContext['kind'];
  forecastLabel?: string;
  forecastIntensity?: number;
  waystone?: WaystoneMark;
  markerUses?: number;
  trapSetDay?: number;
  trapSetMinute?: number;
  trapBaited?: boolean;
  trapChecks?: number;
  netSetDay?: number;
  netSetMinute?: number;
  netChecks?: number;
}

export type WaystoneMark = 'survey' | 'home' | 'cave' | 'shore' | 'forage';

export interface WaystoneContext {
  home?: boolean;
  cave?: boolean;
  nearWater?: boolean;
  forage?: boolean;
}

export interface WeatherVaneContext {
  kind: 'clear' | 'mist' | 'rain' | 'storm' | 'cold' | 'soaked';
  label: string;
  intensity: number;
}

export type RainCisternContext = WeatherVaneContext;

export interface FishTrapContext {
  day: number;
  minute: number;
  nearWater: boolean;
  school: FishSchoolReport;
}

export interface PlaceStructureInput {
  item: PlaceableItemId;
  tile: number;
  layer: number;
  yaw: number;
}

export type StructureSocketPlacementKind = 'center' | 'edge';

export interface StructureSocketPlacement {
  kind: StructureSocketPlacementKind;
  edge?: number;
  key: string;
  occupies: string[];
  label: string;
}

export interface HomeScore {
  score: number;
  max: number;
  label: string;
  hasHearth: boolean;
  functional: boolean;
  litCampfire: boolean;
  homeBedroll: boolean;
  storedItems: number;
  cellarProvisions: number;
  shelter: ShelterReport;
}

export interface StructureTopology {
  degreeOf(tile: number): number;
  neighbor(tile: number, edge: number): number;
}

export type ShelterComfortTier = 'none' | 'rough' | 'ready';

export interface ShelterReport {
  centerTile: number | null;
  tiles: number[];
  hasWarmth: boolean;
  hasStation: boolean;
  hasStorage: boolean;
  hasCellar: boolean;
  hasLight: boolean;
  cellarProvisions: number;
  protected: boolean;
  functional: boolean;
  comfort: number;
  comfortTier: ShelterComfortTier;
  missing: string[];
  label: string;
}

export interface StructureInteractionResult {
  ok: boolean;
  message: string;
  mode?: 'lit' | 'unlit' | 'home' | 'deposit' | 'withdraw' | 'cook' | 'collectWater' | 'cache' | 'withdrawProvision' | 'preserve' | 'setTrap' | 'checkTrap' | 'collectTrap' | 'setNet' | 'checkNet' | 'collectNet' | 'mark' | 'forecast' | 'inspect';
  moved?: InventoryItems;
}

export interface StructureDismantleResult {
  ok: boolean;
  message: string;
  item?: PlaceableItemId;
  id?: number;
  blockers?: string[];
}

export interface StructureRotationResult {
  ok: boolean;
  message: string;
  item?: PlaceableItemId;
  id?: number;
  yaw?: number;
  turn?: number;
  blockers?: string[];
}

export interface StructureRelocationInput {
  tile: number;
  layer: number;
  yaw?: number;
}

export interface StructureRelocationResult {
  ok: boolean;
  message: string;
  item?: PlaceableItemId;
  id?: number;
  fromTile?: number;
  fromLayer?: number;
  toTile?: number;
  toLayer?: number;
  yaw?: number;
  turn?: number;
  blockers?: string[];
}

export type StructureSocketRole =
  | 'crafting-station'
  | 'warmth-station'
  | 'storage-station'
  | 'home-rest'
  | 'water-cistern'
  | 'provision-cache'
  | 'shore-edge'
  | 'food-preserve'
  | 'weather-readback'
  | 'light-post'
  | 'route-marker';

export interface StructureSocketSpec {
  item: PlaceableItemId;
  name: string;
  role: StructureSocketRole;
  modularKit: boolean;
  gridWidth: number;
  gridDepth: number;
  height: number;
  pivot: 'center' | 'shore-center';
  collider: 'hex-cell' | 'edge-strip';
  snap: string[];
  visualScale: string;
  loadBearing: 'code-socket';
  glbPolicy: 'decorative-skin-after-normalization' | 'procedural-only';
}

export type ChestTransferAction = 'depositOne' | 'depositAll' | 'withdrawOne' | 'withdrawAll';

export interface ChestStorageRow {
  item: MaterialItemId;
  name: string;
  css: string;
  pack: number;
  stored: number;
  canDeposit: boolean;
  canWithdraw: boolean;
}

export interface ChestStorageView {
  id: number;
  title: string;
  summary: string;
  packTotal: number;
  storedTotal: number;
  rows: ChestStorageRow[];
}

const HOME_ITEMS: PlaceableItemId[] = ['workbench', 'campfire', 'chest', 'bedroll', 'rootCellar'];
const CISTERN_CAPACITY = 4;
const ROOT_CELLAR_CAPACITY = 6;
const FISH_TRAP_FAST_MINUTES = 180;
const FISH_TRAP_SLOW_MINUTES = 300;
const SHORE_NET_FAST_MINUTES = 90;
const SHORE_NET_SLOW_MINUTES = 150;

const DEFAULT_SOCKET_SPEC = {
  role: 'home-rest' as const,
  modularKit: false,
  gridWidth: 0.8,
  gridDepth: 0.8,
  height: 0.8,
  pivot: 'center' as const,
  collider: 'hex-cell' as const,
  snap: ['center of one hex'],
  visualScale: 'fit inside one hex socket',
  loadBearing: 'code-socket' as const,
  glbPolicy: 'procedural-only' as const,
};

const STRUCTURE_SOCKET_SPEC_OVERRIDES: Partial<Record<PlaceableItemId, Partial<Omit<StructureSocketSpec, 'item' | 'name'>>>> = {
  workbench: {
    role: 'crafting-station',
    gridWidth: 1.34,
    gridDepth: 0.74,
    height: 0.78,
    snap: ['center of one hex', 'crafting reach stays code-owned', 'decorative GLB does not alter recipe gating'],
    visualScale: 'normalize approved GLB to one crafting-station hex',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  campfire: {
    role: 'warmth-station',
    gridWidth: 1.08,
    gridDepth: 1.08,
    height: 0.22,
    snap: ['center of one hex', 'warmth and lit state stay code-owned', 'decorative GLB keeps flame and smoke overlays visible'],
    visualScale: 'normalize approved GLB to one hearth body socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  chest: {
    role: 'storage-station',
    gridWidth: 0.88,
    gridDepth: 0.72,
    height: 0.64,
    snap: ['center of one hex', 'storage contents stay code-owned', 'decorative GLB keeps latch/readiness cues visible'],
    visualScale: 'normalize approved GLB to one storage chest socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  bedroll: {
    role: 'home-rest',
    gridWidth: 1.18,
    gridDepth: 0.62,
    height: 0.18,
    snap: ['center of one hex', 'home claim and rest state stay code-owned', 'decorative GLB keeps home marker visible'],
    visualScale: 'normalize approved GLB to one rest/home socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  rainCistern: {
    role: 'water-cistern',
    gridWidth: 0.95,
    gridDepth: 0.76,
    height: 1.05,
    snap: ['center of one hex', 'weather collection stays code-owned', 'decorative GLB keeps water-fill readback visible'],
    visualScale: 'normalize approved GLB to one water-storage socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  rootCellar: {
    role: 'provision-cache',
    gridWidth: 1.28,
    gridDepth: 1.12,
    height: 0.76,
    snap: ['center of one hex', 'provision storage stays code-owned', 'decorative GLB keeps hatch, glow, and bundles visible'],
    visualScale: 'normalize approved GLB to one provision-cache socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  dockSegment: {
    role: 'shore-edge',
    gridWidth: 1.5,
    gridDepth: 0.86,
    height: 0.72,
    pivot: 'shore-center',
    collider: 'edge-strip',
    snap: ['edge must touch shore or waterline', 'dock cast target and waterline blocker stay code-owned', 'decorative GLB keeps fishing mark visible'],
    visualScale: 'normalize approved GLB along one waterline edge without changing cast rules',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  fishTrap: {
    role: 'shore-edge',
    gridWidth: 1,
    gridDepth: 0.62,
    height: 0.45,
    pivot: 'shore-center',
    collider: 'edge-strip',
    snap: ['edge must touch shore or waterline', 'set/check/collect timing stays code-owned', 'decorative GLB keeps bait, float, tether, and soak overlays visible'],
    visualScale: 'normalize approved GLB along one waterline edge without changing trap payout',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  shoreNet: {
    role: 'shore-edge',
    gridWidth: 1.12,
    gridDepth: 0.22,
    height: 0.96,
    pivot: 'shore-center',
    collider: 'edge-strip',
    snap: ['edge must touch shore or waterline', 'comb timing and waterline blocker stay code-owned', 'decorative GLB keeps floats, soak rings, fish, and scrap overlays visible'],
    visualScale: 'normalize approved GLB along one waterline edge with a 90-degree visual correction',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  dryingRack: {
    role: 'food-preserve',
    gridWidth: 1.2,
    gridDepth: 0.56,
    height: 1.05,
    snap: ['center of one hex', 'preservation state stays code-owned', 'decorative GLB keeps hanging food overlays visible'],
    visualScale: 'normalize approved GLB to one preservation rack socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  weatherVane: {
    role: 'weather-readback',
    gridWidth: 0.5,
    gridDepth: 0.5,
    height: 1.25,
    snap: ['center of one hex', 'forecast state stays code-owned', 'decorative GLB keeps needle, ribbon, and storm overlays visible'],
    visualScale: 'normalize approved GLB to one weather instrument socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  lantern: {
    role: 'light-post',
    gridWidth: 0.45,
    gridDepth: 0.45,
    height: 1.25,
    snap: ['center of one hex', 'lit state and shelter light accounting stay code-owned', 'decorative GLB keeps lantern glow overlay visible'],
    visualScale: 'normalize approved GLB to one light-post socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  waystone: {
    role: 'route-marker',
    gridWidth: 0.62,
    gridDepth: 0.62,
    height: 1.25,
    snap: ['centered on route marker hex'],
    visualScale: 'procedural glyph remains readable over decorative skin',
    glbPolicy: 'decorative-skin-after-normalization',
  },
};

export function isPlaceableItemId(id: unknown): id is PlaceableItemId {
  return typeof id === 'string' && (PLACEABLE_ITEM_IDS as readonly string[]).includes(id);
}

export function placeableName(item: PlaceableItemId): string {
  return ITEM_DEFS[item].name;
}

export function structureSocketSpec(item: PlaceableItemId): StructureSocketSpec {
  const override = STRUCTURE_SOCKET_SPEC_OVERRIDES[item] ?? {};
  return {
    item,
    name: placeableName(item),
    ...DEFAULT_SOCKET_SPEC,
    ...override,
  };
}

export function structureSocketCatalog(items: readonly PlaceableItemId[] = PLACEABLE_ITEM_IDS): StructureSocketSpec[] {
  return items.map((item) => structureSocketSpec(item));
}

export function normalizeStructureYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) return 0;
  const tau = Math.PI * 2;
  const value = yaw % tau;
  return value < 0 ? value + tau : value;
}

export function structureYawTurn(yaw: number): number {
  const step = Math.round(normalizeStructureYaw(yaw) / STRUCTURE_YAW_STEP);
  return ((step % 6) + 6) % 6;
}

function edgeSlot(edge: number): string {
  return `edge:${((Math.trunc(edge) % 6) + 6) % 6}`;
}

function edgeFromSlot(slot: string): number | null {
  const match = /^edge:(\d+)$/.exec(slot);
  return match ? Math.trunc(Number(match[1])) : null;
}

function isEdgeAddressedSocket(item: PlaceableItemId): boolean {
  return structureSocketSpec(item).collider === 'edge-strip';
}

export function structureSocketPlacementFor(item: PlaceableItemId, yaw: number): StructureSocketPlacement {
  if (!isEdgeAddressedSocket(item)) {
    return {
      kind: 'center',
      key: 'center',
      occupies: ['center'],
      label: 'center hex',
    };
  }
  const edge = structureYawTurn(yaw);
  return {
    kind: 'edge',
    edge,
    key: edgeSlot(edge),
    occupies: [edgeSlot(edge)],
    label: `hex edge ${edge + 1}`,
  };
}

export function structureSocketPlacement(structure: Pick<StructureSave, 'item' | 'yaw'>): StructureSocketPlacement {
  return structureSocketPlacementFor(structure.item, structure.yaw);
}

export function structureSocketOccupancy(structure: Pick<StructureSave, 'item' | 'tile' | 'yaw'>): StructureSocketPlacement & { tile: number; occupancyKeys: string[] } {
  const tile = Math.trunc(structure.tile);
  const placement = structureSocketPlacement(structure);
  return {
    ...placement,
    tile,
    occupancyKeys: placement.occupies.map((slot) => `${tile}:${slot}`),
  };
}

export function structurePlacementBlocker(
  structures: readonly StructureSave[],
  input: Pick<PlaceStructureInput, 'item' | 'tile' | 'yaw'>,
  ignoreId?: number,
  topology?: StructureTopology,
): string | null {
  const tile = Math.trunc(input.tile);
  const placement = structureSocketPlacementFor(input.item, input.yaw);
  if (topology && placement.kind === 'edge') {
    const degree = Math.max(0, Math.trunc(topology.degreeOf(tile)));
    if (placement.occupies.some((slot) => {
      const edge = edgeFromSlot(slot);
      return edge !== null && edge >= degree;
    })) {
      return 'invalid edge socket';
    }
  }
  const wanted = new Set(placement.occupies);
  const ignored = Number.isFinite(ignoreId) ? Math.trunc(ignoreId!) : null;
  for (const entry of structures) {
    if (ignored !== null && entry.id === ignored) continue;
    if (entry.tile !== tile) continue;
    const occupied = structureSocketPlacement(entry);
    if (occupied.occupies.some((slot) => wanted.has(slot))) {
      return placement.kind === 'edge' ? 'occupied edge socket' : 'occupied snap target';
    }
  }
  return null;
}

export function isWaystoneMark(value: unknown): value is WaystoneMark {
  return value === 'survey' || value === 'home' || value === 'cave' || value === 'shore' || value === 'forage';
}

function isWeatherVaneKind(value: unknown): value is WeatherVaneContext['kind'] {
  return value === 'clear'
    || value === 'mist'
    || value === 'rain'
    || value === 'storm'
    || value === 'cold'
    || value === 'soaked';
}

export function waystoneMarkLabel(mark: WaystoneMark | undefined): string {
  switch (mark) {
    case 'home': return 'hearth waystone';
    case 'cave': return 'cave waystone';
    case 'shore': return 'shore waystone';
    case 'forage': return 'forage waystone';
    case 'survey':
    default: return 'survey waystone';
  }
}

export function chooseWaystoneMark(ctx?: WaystoneContext): WaystoneMark {
  if (ctx?.home) return 'home';
  if (ctx?.cave) return 'cave';
  if (ctx?.nearWater) return 'shore';
  if (ctx?.forage) return 'forage';
  return 'survey';
}

function storageTotal(storage: InventoryItems | undefined): number {
  if (!storage) return 0;
  let total = 0;
  for (const count of Object.values(storage)) total += Math.max(0, Math.trunc(count ?? 0));
  return total;
}

function normalizeChestStorage(storage: InventoryItems | undefined): InventoryItems {
  const normalized = normalizeInventory(storage);
  const out: InventoryItems = {};
  for (const id of MATERIAL_ITEM_IDS) {
    const count = Math.max(0, Math.trunc(normalized[id] ?? 0));
    if (count > 0) out[id] = count;
  }
  return out;
}

function setChestStorage(chest: StructureSave, storage: InventoryItems): void {
  const total = storageTotal(storage);
  chest.state = {
    ...chest.state,
    storage: total > 0 ? storage : undefined,
  };
  if (chest.state.storage === undefined) delete chest.state.storage;
  if (Object.keys(chest.state).length === 0) delete chest.state;
}

function materialSlotOf(item: MaterialItemId): number {
  return MATERIAL_ITEM_IDS.indexOf(item);
}

function isMaterialItemId(value: unknown): value is MaterialItemId {
  return typeof value === 'string' && (MATERIAL_ITEM_IDS as readonly string[]).includes(value);
}

function normalizeState(item: PlaceableItemId, raw: unknown): StructureState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Partial<StructureState>;
  const state: StructureState = {};
  if (item === 'chest' && value.storage !== undefined) {
    const storage = normalizeChestStorage(value.storage);
    if (storageTotal(storage) > 0) state.storage = storage;
  }
  if ((item === 'campfire' || item === 'lantern') && value.lit === true) state.lit = true;
  if (item === 'bedroll') {
    if (value.home === true) state.home = true;
    if (Number.isFinite(value.rested) && value.rested! > 0) state.rested = Math.trunc(value.rested!);
  }
  if (item === 'rainCistern') {
    if (Number.isFinite(value.water) && value.water! > 0) state.water = Math.max(0, Math.min(CISTERN_CAPACITY, Math.trunc(value.water!)));
    if (Number.isFinite(value.fills) && value.fills! > 0) state.fills = Math.trunc(value.fills!);
  }
  if (item === 'rootCellar') {
    if (Number.isFinite(value.provisions) && value.provisions! > 0) state.provisions = Math.max(0, Math.min(ROOT_CELLAR_CAPACITY, Math.trunc(value.provisions!)));
    if (Number.isFinite(value.caches) && value.caches! > 0) state.caches = Math.trunc(value.caches!);
  }
  if (item === 'dryingRack') {
    if (Number.isFinite(value.preserves) && value.preserves! > 0) state.preserves = Math.trunc(value.preserves!);
  }
  if (item === 'fishTrap') {
    if (Number.isFinite(value.trapSetDay) && value.trapSetDay! >= 0) state.trapSetDay = Math.trunc(value.trapSetDay!);
    if (Number.isFinite(value.trapSetMinute)) state.trapSetMinute = Math.max(0, Math.min(1439, Math.trunc(value.trapSetMinute!)));
    if (typeof value.trapBaited === 'boolean') state.trapBaited = value.trapBaited;
    if (Number.isFinite(value.trapChecks) && value.trapChecks! > 0) state.trapChecks = Math.trunc(value.trapChecks!);
    if (state.trapSetDay === undefined) {
      delete state.trapSetMinute;
      delete state.trapBaited;
    } else if (state.trapSetMinute === undefined) {
      state.trapSetMinute = 0;
    }
  }
  if (item === 'shoreNet') {
    if (Number.isFinite(value.netSetDay) && value.netSetDay! >= 0) state.netSetDay = Math.trunc(value.netSetDay!);
    if (Number.isFinite(value.netSetMinute)) state.netSetMinute = Math.max(0, Math.min(1439, Math.trunc(value.netSetMinute!)));
    if (Number.isFinite(value.netChecks) && value.netChecks! > 0) state.netChecks = Math.trunc(value.netChecks!);
    if (state.netSetDay === undefined) {
      delete state.netSetMinute;
    } else if (state.netSetMinute === undefined) {
      state.netSetMinute = 0;
    }
  }
  if (item === 'weatherVane') {
    if (Number.isFinite(value.forecastReads) && value.forecastReads! > 0) state.forecastReads = Math.trunc(value.forecastReads!);
    if (isWeatherVaneKind(value.forecastKind)) state.forecastKind = value.forecastKind;
    if (typeof value.forecastLabel === 'string' && value.forecastLabel.trim().length > 0) {
      state.forecastLabel = value.forecastLabel.trim().slice(0, 64);
    }
    if (Number.isFinite(value.forecastIntensity)) state.forecastIntensity = Math.max(0, Math.min(1, value.forecastIntensity!));
  }
  if (item === 'waystone') {
    if (isWaystoneMark(value.waystone)) state.waystone = value.waystone;
    if (Number.isFinite(value.markerUses) && value.markerUses! > 0) state.markerUses = Math.trunc(value.markerUses!);
  }
  return Object.keys(state).length > 0 ? state : undefined;
}

export function normalizeStructureSaves(raw: unknown, tileCount: number, layerCount: number): StructureSave[] {
  if (!Array.isArray(raw)) return [];
  const out: StructureSave[] = [];
  const usedIds = new Set<number>();
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Partial<StructureSave>;
    if (!isPlaceableItemId(entry.item)) continue;
    const tileValue = entry.tile;
    const layerValue = entry.layer;
    if (!Number.isFinite(tileValue) || !Number.isFinite(layerValue)) continue;
    const tile = Math.trunc(tileValue as number);
    const layer = Math.trunc(layerValue as number);
    if (tile < 0 || tile >= tileCount || layer < 0 || layer >= layerCount) continue;
    const yaw = normalizeStructureYaw(Number.isFinite(entry.yaw) ? entry.yaw! : 0);
    if (structurePlacementBlocker(out, { item: entry.item, tile, yaw })) continue;
    let id = Number.isFinite(entry.id) ? Math.max(1, Math.trunc(entry.id as number)) : 1;
    while (usedIds.has(id)) id++;
    usedIds.add(id);
    out.push({
      id,
      item: entry.item,
      tile,
      layer,
      yaw,
      state: normalizeState(entry.item, entry.state),
    });
  }
  return out.sort((a, b) => a.id - b.id);
}

export function nextStructureId(structures: readonly StructureSave[]): number {
  let id = 1;
  for (const s of structures) id = Math.max(id, s.id + 1);
  return id;
}

export function canPlaceStructure(structures: readonly StructureSave[], tile: number, item?: PlaceableItemId, yaw = 0, topology?: StructureTopology): boolean {
  if (item) return structurePlacementBlocker(structures, { item, tile, yaw }, undefined, topology) === null;
  return !structures.some((s) => s.tile === tile && structureSocketPlacement(s).kind === 'center');
}

export function addStructure(structures: StructureSave[], input: PlaceStructureInput, topology?: StructureTopology): StructureSave | null {
  const tile = Math.trunc(input.tile);
  const layer = Math.trunc(input.layer);
  if (!isPlaceableItemId(input.item) || tile < 0 || layer < 0) return null;
  const yaw = normalizeStructureYaw(Number.isFinite(input.yaw) ? input.yaw : 0);
  if (structurePlacementBlocker(structures, { item: input.item, tile, yaw }, undefined, topology)) return null;
  const structure = {
    id: nextStructureId(structures),
    item: input.item,
    tile,
    layer,
    yaw,
    state: undefined,
  };
  structures.push(structure);
  return structure;
}

function structurePlacementBlockerMessage(item: PlaceableItemId, blocker: string): string {
  if (blocker === 'occupied edge socket') return `${placeableName(item).toLowerCase()} edge is occupied`;
  if (blocker === 'invalid edge socket') return `${placeableName(item).toLowerCase()} needs a real hex edge`;
  return 'that hex already has a prop';
}

export function rotateStructure(structures: StructureSave[], id: number, turns = 1, topology?: StructureTopology): StructureRotationResult {
  const targetId = Math.trunc(id);
  const structure = structures.find((entry) => entry.id === targetId);
  if (!structure) return { ok: false, message: 'no structure' };
  const turnDelta = Math.trunc(Number.isFinite(turns) ? turns : 0);
  if (turnDelta === 0) {
    return {
      ok: true,
      id: structure.id,
      item: structure.item,
      yaw: structure.yaw,
      turn: structureYawTurn(structure.yaw),
      message: `${placeableName(structure.item).toLowerCase()} already aligned`,
    };
  }
  const nextYaw = normalizeStructureYaw(structure.yaw + turnDelta * STRUCTURE_YAW_STEP);
  const blocker = structurePlacementBlocker(structures, { item: structure.item, tile: structure.tile, yaw: nextYaw }, structure.id, topology);
  if (blocker) {
    return {
      ok: false,
      id: structure.id,
      item: structure.item,
      yaw: structure.yaw,
      turn: structureYawTurn(structure.yaw),
      message: structurePlacementBlockerMessage(structure.item, blocker),
      blockers: [blocker],
    };
  }
  structure.yaw = nextYaw;
  const turn = structureYawTurn(structure.yaw);
  return {
    ok: true,
    id: structure.id,
    item: structure.item,
    yaw: structure.yaw,
    turn,
    message: `rotated ${placeableName(structure.item).toLowerCase()} to hex face ${turn + 1}`,
  };
}

export function relocateStructure(
  structures: StructureSave[],
  id: number,
  input: StructureRelocationInput,
  topology?: StructureTopology,
): StructureRelocationResult {
  const targetId = Math.trunc(id);
  const structure = structures.find((entry) => entry.id === targetId);
  if (!structure) return { ok: false, message: 'no structure' };
  const toTile = Math.trunc(input.tile);
  const toLayer = Math.trunc(input.layer);
  if (toTile < 0 || toLayer < 0) {
    return {
      ok: false,
      id: structure.id,
      item: structure.item,
      message: `${placeableName(structure.item).toLowerCase()} cannot be moved there`,
      blockers: ['invalid snap target'],
    };
  }
  const blockers = structureDismantleBlockers(structure);
  if (blockers.length > 0) {
    return {
      ok: false,
      id: structure.id,
      item: structure.item,
      fromTile: structure.tile,
      fromLayer: structure.layer,
      blockers,
      message: `${placeableName(structure.item).toLowerCase()} cannot be moved · ${blockers[0]}`,
    };
  }
  const nextYaw = Number.isFinite(input.yaw) ? normalizeStructureYaw(input.yaw!) : structure.yaw;
  const currentSocket = structureSocketPlacement(structure);
  const nextSocket = structureSocketPlacementFor(structure.item, nextYaw);
  const sameSocket = structure.tile === toTile
    && structure.layer === toLayer
    && currentSocket.occupies.length === nextSocket.occupies.length
    && currentSocket.occupies.every((slot, index) => slot === nextSocket.occupies[index]);
  if (sameSocket) {
    return {
      ok: false,
      id: structure.id,
      item: structure.item,
      fromTile: structure.tile,
      fromLayer: structure.layer,
      toTile,
      toLayer,
      message: `${placeableName(structure.item).toLowerCase()} already on that snap hex`,
      blockers: ['same snap target'],
    };
  }
  const blocker = structurePlacementBlocker(structures, { item: structure.item, tile: toTile, yaw: nextYaw }, structure.id, topology);
  if (blocker) {
    return {
      ok: false,
      id: structure.id,
      item: structure.item,
      fromTile: structure.tile,
      fromLayer: structure.layer,
      toTile,
      toLayer,
      message: structurePlacementBlockerMessage(structure.item, blocker),
      blockers: [blocker],
    };
  }
  const fromTile = structure.tile;
  const fromLayer = structure.layer;
  structure.tile = toTile;
  structure.layer = toLayer;
  structure.yaw = nextYaw;
  const turn = structureYawTurn(structure.yaw);
  return {
    ok: true,
    id: structure.id,
    item: structure.item,
    fromTile,
    fromLayer,
    toTile,
    toLayer,
    yaw: structure.yaw,
    turn,
    message: `moved ${placeableName(structure.item).toLowerCase()} to snap hex`,
  };
}

export function structureDismantleBlockers(structure: StructureSave): string[] {
  const state = structure.state;
  if (!state) return [];
  const blockers: string[] = [];
  if (structure.item === 'chest' && storageTotal(state.storage) > 0) blockers.push('empty chest first');
  if (structure.item === 'rainCistern' && Math.max(0, Math.trunc(state.water ?? 0)) > 0) blockers.push('empty water first');
  if (structure.item === 'rootCellar' && Math.max(0, Math.trunc(state.provisions ?? 0)) > 0) blockers.push('empty provisions first');
  if ((structure.item === 'campfire' || structure.item === 'lantern') && state.lit === true) blockers.push('douse light first');
  if (structure.item === 'bedroll' && state.home === true) blockers.push('home bedroll is set');
  if (structure.item === 'waystone' && state.waystone) blockers.push('waystone is attuned');
  if (structure.item === 'fishTrap' && state.trapSetDay !== undefined) blockers.push('fish trap is set');
  if (structure.item === 'shoreNet' && state.netSetDay !== undefined) blockers.push('shore net is set');
  return blockers;
}

export function dismantleStructure(structures: StructureSave[], id: number): StructureDismantleResult {
  const targetId = Math.trunc(id);
  const index = structures.findIndex((entry) => entry.id === targetId);
  if (index < 0) return { ok: false, message: 'no structure' };
  const structure = structures[index];
  const blockers = structureDismantleBlockers(structure);
  if (blockers.length > 0) {
    return {
      ok: false,
      id: structure.id,
      item: structure.item,
      blockers,
      message: `${placeableName(structure.item).toLowerCase()} cannot be packed · ${blockers[0]}`,
    };
  }
  structures.splice(index, 1);
  return {
    ok: true,
    id: structure.id,
    item: structure.item,
    message: `packed ${placeableName(structure.item).toLowerCase()}`,
  };
}

export function chestStorageView(chest: StructureSave, materialCounts: readonly number[]): ChestStorageView | null {
  if (chest.item !== 'chest') return null;
  const storage = normalizeChestStorage(chest.state?.storage);
  let packTotal = 0;
  let storedTotal = 0;
  const rows = MATERIAL_ITEM_IDS.map((item, index) => {
    const pack = Math.max(0, Math.trunc(materialCounts[index] ?? 0));
    const stored = Math.max(0, Math.trunc(storage[item] ?? 0));
    packTotal += pack;
    storedTotal += stored;
    return {
      item,
      name: ITEM_DEFS[item].name,
      css: ITEM_DEFS[item].css,
      pack,
      stored,
      canDeposit: pack > 0,
      canWithdraw: stored > 0,
    };
  });
  const summary = storedTotal > 0
    ? `${storedTotal} stored · ${packTotal} carried`
    : packTotal > 0
    ? `empty chest · ${packTotal} carried`
    : 'empty chest · pack is empty';
  return {
    id: chest.id,
    title: 'Chest Storage',
    summary,
    packTotal,
    storedTotal,
    rows,
  };
}

export function transferChestMaterial(
  chest: StructureSave,
  materialCounts: number[],
  item: MaterialItemId,
  action: ChestTransferAction,
): StructureInteractionResult {
  if (chest.item !== 'chest') return { ok: false, mode: 'inspect', message: 'not a chest' };
  if (!isMaterialItemId(item)) return { ok: false, mode: 'inspect', message: 'chest only stores terrain materials' };
  const slot = materialSlotOf(item);
  if (slot < 0) return { ok: false, mode: 'inspect', message: 'chest only stores terrain materials' };
  const storage = normalizeChestStorage(chest.state?.storage);
  const name = ITEM_DEFS[item].name.toLowerCase();
  const pack = Math.max(0, Math.trunc(materialCounts[slot] ?? 0));
  const stored = Math.max(0, Math.trunc(storage[item] ?? 0));
  const depositing = action === 'depositOne' || action === 'depositAll';
  const amount = depositing
    ? action === 'depositOne' ? Math.min(1, pack) : pack
    : action === 'withdrawOne' ? Math.min(1, stored) : stored;
  if (amount <= 0) {
    return {
      ok: false,
      mode: 'inspect',
      message: depositing ? `no ${name} to stash` : `no ${name} in chest`,
    };
  }
  if (depositing) {
    materialCounts[slot] = pack - amount;
    storage[item] = stored + amount;
    setChestStorage(chest, storage);
    return {
      ok: true,
      mode: 'deposit',
      moved: { [item]: amount },
      message: `stashed ${name} ${amount} · chest ${storageTotal(storage)}`,
    };
  }
  materialCounts[slot] = pack + amount;
  const nextStored = stored - amount;
  if (nextStored > 0) storage[item] = nextStored;
  else delete storage[item];
  setChestStorage(chest, storage);
  return {
    ok: true,
    mode: 'withdraw',
    moved: { [item]: amount },
    message: `withdrew ${name} ${amount} · chest ${storageTotal(storage)}`,
  };
}

export function structureStationInventory(structures: readonly StructureSave[]): InventoryItems {
  const stations: InventoryItems = {};
  for (const s of structures) {
    if (ITEM_DEFS[s.item].kind !== 'station') continue;
    stations[s.item as ItemId] = (stations[s.item as ItemId] ?? 0) + 1;
  }
  return stations;
}

function tilesWithin(topology: StructureTopology | undefined, center: number, rings: number): number[] {
  if (!topology) return [center];
  const seen = new Set<number>([center]);
  const queue: { tile: number; ring: number }[] = [{ tile: center, ring: 0 }];
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    if (entry.ring >= rings) continue;
    const deg = topology.degreeOf(entry.tile);
    for (let k = 0; k < deg; k++) {
      const next = topology.neighbor(entry.tile, k);
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ tile: next, ring: entry.ring + 1 });
    }
  }
  return [...seen];
}

function craftedCount(items: InventoryItems | undefined, item: CraftedItemId): number {
  return Math.max(0, Math.trunc(items?.[item] ?? 0));
}

function addCraftedItem(items: InventoryItems | undefined, item: CraftedItemId, amount: number): void {
  if (!items || amount <= 0) return;
  items[item] = Math.max(0, Math.trunc(items[item] ?? 0) + amount);
}

function spendCraftedItem(items: InventoryItems | undefined, item: CraftedItemId, amount: number): boolean {
  if (!items || amount <= 0 || craftedCount(items, item) < amount) return false;
  const next = craftedCount(items, item) - amount;
  if (next > 0) items[item] = next;
  else delete items[item];
  return true;
}

function formatMoved(items: InventoryItems): string {
  return Object.entries(items)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([item, count]) => `${ITEM_DEFS[item as ItemId].name.toLowerCase()} ${count}`)
    .join(', ');
}

function setOnlyHomeBedroll(structures: StructureSave[], id: number): void {
  for (const s of structures) {
    if (s.item !== 'bedroll') continue;
    if (s.id === id) {
      s.state = { ...s.state, home: true, rested: Math.max(1, Math.trunc(s.state?.rested ?? 0) + 1) };
    } else if (s.state?.home) {
      s.state = { ...s.state, home: false };
    }
  }
}

export function shelterReport(structures: readonly StructureSave[], topology?: StructureTopology, rings = 1): ShelterReport {
  const home = structures.find((s) => s.item === 'bedroll' && s.state?.home === true) ?? null;
  if (!home) {
    return {
      centerTile: null,
      tiles: [],
      hasWarmth: false,
      hasStation: false,
      hasStorage: false,
      hasCellar: false,
      hasLight: false,
      cellarProvisions: 0,
      protected: false,
      functional: false,
      comfort: 0,
      comfortTier: 'none',
      missing: ['home bedroll'],
      label: 'no home bedroll',
    };
  }
  const tiles = tilesWithin(topology, home.tile, Math.max(0, Math.trunc(rings)));
  const local = new Set(tiles);
  const nearby = structures.filter((s) => local.has(s.tile));
  const hasWarmth = nearby.some((s) => s.item === 'campfire' && s.state?.lit === true);
  const hasStation = nearby.some((s) => s.item === 'workbench');
  const hasStorage = nearby.some((s) => s.item === 'chest');
  const hasCellar = nearby.some((s) => s.item === 'rootCellar');
  const cellarProvisions = nearby.reduce((sum, s) => sum + (s.item === 'rootCellar' ? rootCellarProvisions(s) : 0), 0);
  const hasLight = hasWarmth || nearby.some((s) => s.item === 'lantern' && s.state?.lit === true);
  const comfort = Number(hasWarmth) + Number(hasStation) + Number(hasStorage) + Number(hasCellar);
  const functional = hasWarmth && hasStation && hasStorage;
  const missing: string[] = [];
  if (!hasWarmth) missing.push('lit campfire');
  if (!hasStation) missing.push('workbench');
  if (!hasStorage) missing.push('chest');
  const comfortTier: ShelterComfortTier = functional ? 'ready' : hasWarmth ? 'rough' : 'none';
  return {
    centerTile: home.tile,
    tiles,
    hasWarmth,
    hasStation,
    hasStorage,
    hasCellar,
    hasLight,
    cellarProvisions,
    protected: hasWarmth,
    functional,
    comfort,
    comfortTier,
    missing,
    label: functional
      ? 'camp ready'
      : hasWarmth
      ? 'warm camp'
      : missing.length > 0
      ? `camp needs ${missing[0]}`
      : 'camp started',
  };
}

export function homeScore(structures: readonly StructureSave[], topology?: StructureTopology): HomeScore {
  const placed = new Set(structures.map((s) => s.item));
  let score = 0;
  for (const item of HOME_ITEMS) if (placed.has(item)) score++;
  const litCampfire = structures.some((s) => s.item === 'campfire' && s.state?.lit === true);
  const homeBedroll = structures.some((s) => s.item === 'bedroll' && s.state?.home === true);
  const storedItems = structures.reduce((sum, s) => sum + (s.item === 'chest' ? storageTotal(s.state?.storage) : 0), 0);
  const hasHearth = placed.has('campfire') && placed.has('bedroll') && score >= 4;
  const shelter = shelterReport(structures, topology);
  const functional = topology ? shelter.functional : hasHearth && litCampfire && homeBedroll;
  const label = topology && homeBedroll
    ? shelter.label
    : functional
    ? 'hearth alive'
    : hasHearth
    ? 'hearth ready'
    : score > 0
    ? `home ${score}/${HOME_ITEMS.length}`
    : 'no home';
  return { score, max: HOME_ITEMS.length, label, hasHearth, functional, litCampfire, homeBedroll, storedItems, cellarProvisions: shelter.cellarProvisions, shelter };
}

export function spendPlacedItem(items: InventoryItems, item: PlaceableItemId): boolean {
  const count = Math.max(0, Math.trunc(items[item] ?? 0));
  if (count <= 0) return false;
  if (count === 1) delete items[item];
  else items[item] = count - 1;
  return true;
}

function toggleChest(chest: StructureSave, materialCounts: number[]): StructureInteractionResult {
  chest.state = chest.state ?? {};
  const storage = normalizeInventory(chest.state.storage);
  const stored = storageTotal(storage);
  const moved: InventoryItems = {};
  if (stored > 0) {
    for (const id of MATERIAL_ITEM_IDS) {
      const count = Math.max(0, Math.trunc(storage[id] ?? 0));
      if (count <= 0) continue;
      const slot = MATERIAL_ITEM_IDS.indexOf(id);
      materialCounts[slot] = Math.max(0, Math.trunc(materialCounts[slot] ?? 0) + count);
      const amount = count;
      moved[id] = Math.max(0, Math.trunc(moved[id] ?? 0) + amount);
    }
    chest.state.storage = undefined;
    const text = formatMoved(moved);
    return { ok: text.length > 0, mode: 'withdraw', moved, message: text ? `withdrew ${text}` : 'chest is empty' };
  }
  for (const id of MATERIAL_ITEM_IDS) {
    const slot = MATERIAL_ITEM_IDS.indexOf(id);
    const have = Math.max(0, Math.trunc(materialCounts[slot] ?? 0));
    const amount = Math.min(20, Math.floor(have / 2));
    if (amount <= 0) continue;
    materialCounts[slot] = have - amount;
    storage[id] = Math.max(0, Math.trunc(storage[id] ?? 0) + amount);
    moved[id] = Math.max(0, Math.trunc(moved[id] ?? 0) + amount);
  }
  chest.state.storage = storageTotal(storage) > 0 ? storage : undefined;
  const text = formatMoved(moved);
  return { ok: text.length > 0, mode: 'deposit', moved, message: text ? `stashed ${text}` : 'nothing to stash' };
}

function cookAtCampfire(campfire: StructureSave, craftedItems?: InventoryItems): StructureInteractionResult | null {
  if (!craftedItems || campfire.state?.lit !== true) return null;
  const stewSeasoning: CraftedItemId | null = craftedCount(craftedItems, 'caveMushroom') > 0
    ? 'caveMushroom'
    : craftedCount(craftedItems, 'snowHerb') > 0
    ? 'snowHerb'
    : null;
  if (craftedCount(craftedItems, 'campMeal') > 0 && craftedCount(craftedItems, 'trailRation') > 0 && stewSeasoning) {
    spendCraftedItem(craftedItems, 'campMeal', 1);
    spendCraftedItem(craftedItems, 'trailRation', 1);
    spendCraftedItem(craftedItems, stewSeasoning, 1);
    addCraftedItem(craftedItems, 'expeditionStew', 1);
    return {
      ok: true,
      mode: 'cook',
      moved: { expeditionStew: 1 },
      message: `cooked expedition stew · ${ITEM_DEFS[stewSeasoning].name.toLowerCase()}`,
    };
  }
  if (craftedCount(craftedItems, 'cookedFish') > 0 && craftedCount(craftedItems, 'berries') > 0) {
    spendCraftedItem(craftedItems, 'cookedFish', 1);
    spendCraftedItem(craftedItems, 'berries', 1);
    addCraftedItem(craftedItems, 'campMeal', 1);
    return { ok: true, mode: 'cook', moved: { campMeal: 1 }, message: 'cooked camp meal' };
  }
  if (craftedCount(craftedItems, 'rawFish') > 0) {
    spendCraftedItem(craftedItems, 'rawFish', 1);
    addCraftedItem(craftedItems, 'cookedFish', 1);
    return { ok: true, mode: 'cook', moved: { cookedFish: 1 }, message: 'cooked fish' };
  }
  return null;
}

function cisternWater(cistern: StructureSave | undefined | null): number {
  return Math.max(0, Math.min(CISTERN_CAPACITY, Math.trunc(cistern?.state?.water ?? 0)));
}

function rootCellarProvisions(cellar: StructureSave | undefined | null): number {
  return Math.max(0, Math.min(ROOT_CELLAR_CAPACITY, Math.trunc(cellar?.state?.provisions ?? 0)));
}

export function rainCisternWaterCapacity(): number {
  return CISTERN_CAPACITY;
}

export function rootCellarProvisionCapacity(): number {
  return ROOT_CELLAR_CAPACITY;
}

function useRainCistern(cistern: StructureSave, ctx?: RainCisternContext): StructureInteractionResult {
  const current = cisternWater(cistern);
  const wet = ctx?.kind === 'rain' || ctx?.kind === 'storm' || ctx?.kind === 'soaked' || ctx?.kind === 'mist';
  if (!ctx || !wet) {
    return {
      ok: true,
      mode: 'inspect',
      message: current > 0
        ? `rain cistern holds water ${current}/${CISTERN_CAPACITY}`
        : 'rain cistern dry · wait for rain, storm, or mist',
    };
  }
  const amount = ctx.kind === 'storm' || ctx.kind === 'soaked' ? 2 : 1;
  const next = Math.min(CISTERN_CAPACITY, current + amount);
  cistern.state = {
    ...cistern.state,
    water: next,
    fills: Math.max(0, Math.trunc(cistern.state?.fills ?? 0)) + (next > current ? 1 : 0),
  };
  return {
    ok: true,
    mode: 'collectWater',
    message: next > current
      ? `rain cistern caught ${ctx.label.toLowerCase()} water · water ${next}/${CISTERN_CAPACITY}`
      : `rain cistern full · water ${next}/${CISTERN_CAPACITY}`,
  };
}

function cellarProvisionCandidate(items: InventoryItems | undefined): { item: CraftedItemId; spend: number; label: string } | null {
  if (!items) return null;
  if (craftedCount(items, 'trailRation') > 0) return { item: 'trailRation', spend: 1, label: 'trail ration' };
  if (craftedCount(items, 'campMeal') > 0) return { item: 'campMeal', spend: 1, label: 'camp meal' };
  if (craftedCount(items, 'caveMushroom') >= 2) return { item: 'caveMushroom', spend: 2, label: 'cave mushrooms' };
  if (craftedCount(items, 'snowHerb') >= 2) return { item: 'snowHerb', spend: 2, label: 'snow herbs' };
  if (craftedCount(items, 'berries') >= 4) return { item: 'berries', spend: 4, label: 'berries' };
  if (craftedCount(items, 'kelp') >= 4) return { item: 'kelp', spend: 4, label: 'kelp bundles' };
  return null;
}

function useRootCellar(cellar: StructureSave, craftedItems?: InventoryItems): StructureInteractionResult {
  const current = rootCellarProvisions(cellar);
  const candidate = current < ROOT_CELLAR_CAPACITY ? cellarProvisionCandidate(craftedItems) : null;
  if (candidate && craftedItems) {
    if (!spendCraftedItem(craftedItems, candidate.item, candidate.spend)) {
      return { ok: false, mode: 'inspect', message: 'root cellar could not cache provisions' };
    }
    const next = Math.min(ROOT_CELLAR_CAPACITY, current + 1);
    const moved: InventoryItems = { [candidate.item]: candidate.spend };
    cellar.state = {
      ...cellar.state,
      provisions: next,
      caches: Math.max(0, Math.trunc(cellar.state?.caches ?? 0)) + 1,
    };
    return {
      ok: true,
      mode: 'cache',
      moved,
      message: `root cellar cached ${candidate.label} · provisions ${next}/${ROOT_CELLAR_CAPACITY}`,
    };
  }
  if (current > 0 && craftedItems) {
    const next = current - 1;
    addCraftedItem(craftedItems, 'trailRation', 1);
    cellar.state = {
      ...cellar.state,
      provisions: next > 0 ? next : undefined,
    };
    if (cellar.state.provisions === undefined) delete cellar.state.provisions;
    return {
      ok: true,
      mode: 'withdrawProvision',
      moved: { trailRation: 1 },
      message: `pulled trail ration from root cellar · provisions ${next}/${ROOT_CELLAR_CAPACITY}`,
    };
  }
  return {
    ok: true,
    mode: 'inspect',
    message: current >= ROOT_CELLAR_CAPACITY
      ? `root cellar stocked ${current}/${ROOT_CELLAR_CAPACITY}`
      : `root cellar empty · cache trail rations or forage ${current}/${ROOT_CELLAR_CAPACITY}`,
  };
}

function attuneWaystone(stone: StructureSave, ctx?: WaystoneContext): StructureInteractionResult {
  const mark = chooseWaystoneMark(ctx);
  stone.state = {
    ...stone.state,
    waystone: mark,
    markerUses: Math.max(0, Math.trunc(stone.state?.markerUses ?? 0)) + 1,
  };
  const label = waystoneMarkLabel(mark);
  const reason = mark === 'home'
    ? 'home route'
    : mark === 'cave'
    ? 'cave entrance'
    : mark === 'shore'
    ? 'shore route'
    : mark === 'forage'
    ? 'forage patch'
    : 'survey point';
  return {
    ok: true,
    mode: 'mark',
    message: `${label} attuned · ${reason}`,
  };
}

function readWeatherVane(vane: StructureSave, ctx?: WeatherVaneContext): StructureInteractionResult {
  const reads = Math.max(0, Math.trunc(vane.state?.forecastReads ?? 0)) + 1;
  if (!ctx) {
    vane.state = {
      ...vane.state,
      forecastReads: reads,
    };
    return { ok: true, mode: 'forecast', message: 'weather vane turns quietly' };
  }
  const label = ctx.label.trim() || ctx.kind;
  vane.state = {
    ...vane.state,
    forecastReads: reads,
    forecastKind: ctx.kind,
    forecastLabel: label,
    forecastIntensity: Math.max(0, Math.min(1, ctx.intensity)),
  };
  const timing = ctx.kind === 'storm'
    ? 'storm timing marked'
    : ctx.kind === 'cold'
    ? 'cold front marked'
    : ctx.kind === 'rain' || ctx.kind === 'soaked'
    ? 'wet travel marked'
    : 'route weather marked';
  return {
    ok: true,
    mode: 'forecast',
    message: `weather vane reads ${label} · ${timing}`,
  };
}

function preserveAtDryingRack(rack: StructureSave, craftedItems?: InventoryItems): StructureInteractionResult {
  if (!craftedItems) return { ok: false, message: 'drying rack needs food inventory' };
  if (craftedCount(craftedItems, 'rawFish') <= 0) {
    return { ok: false, mode: 'inspect', message: 'drying rack needs raw fish' };
  }
  const seasoning: CraftedItemId | null = craftedCount(craftedItems, 'kelp') > 0
    ? 'kelp'
    : craftedCount(craftedItems, 'reeds') > 0
    ? 'reeds'
    : craftedCount(craftedItems, 'snowHerb') > 0
    ? 'snowHerb'
    : null;
  if (!seasoning) return { ok: false, mode: 'inspect', message: 'drying rack needs kelp, reeds, or snow herbs' };
  spendCraftedItem(craftedItems, 'rawFish', 1);
  spendCraftedItem(craftedItems, seasoning, 1);
  addCraftedItem(craftedItems, 'trailRation', 2);
  rack.state = {
    ...rack.state,
    preserves: Math.max(1, Math.trunc(rack.state?.preserves ?? 0) + 1),
  };
  return {
    ok: true,
    mode: 'preserve',
    moved: { trailRation: 2 },
    message: `dried trail rations 2 · ${ITEM_DEFS[seasoning].name.toLowerCase()}`,
  };
}

function trapElapsedMinutes(trap: StructureSave, ctx: FishTrapContext): number {
  if (trap.state?.trapSetDay === undefined) return 0;
  const setDay = Math.max(0, Math.trunc(trap.state.trapSetDay));
  const setMinute = Math.max(0, Math.min(1439, Math.trunc(trap.state.trapSetMinute ?? 0)));
  const now = Math.max(0, Math.trunc(ctx.day)) * 1440 + Math.max(0, Math.min(1439, Math.trunc(ctx.minute)));
  const then = setDay * 1440 + setMinute;
  return Math.max(0, now - then);
}

function fishTrapCatchCount(trap: StructureSave, ctx: FishTrapContext): number {
  const elapsed = trapElapsedMinutes(trap, ctx);
  const baited = trap.state?.trapBaited === true;
  const interval = baited ? FISH_TRAP_FAST_MINUTES : FISH_TRAP_SLOW_MINUTES;
  const ticks = Math.floor(elapsed / interval);
  if (ticks <= 0 || ctx.school.catchCount <= 0) return 0;
  if (!ctx.nearWater && ctx.school.kind !== 'cave') return 0;
  const schoolPower = Math.max(1, Math.min(3, Math.trunc(ctx.school.catchCount)));
  const ceiling = ctx.school.kind === 'cave' || ctx.school.kind === 'storm'
    ? 4
    : ctx.school.kind === 'dock' || ctx.school.kind === 'run'
    ? 3
    : 2;
  return Math.max(1, Math.min(ceiling, schoolPower + (baited ? 1 : 0), ticks + (baited ? 1 : 0)));
}

function clearTrapSetState(trap: StructureSave): void {
  const next: StructureState = { ...trap.state };
  delete next.trapSetDay;
  delete next.trapSetMinute;
  delete next.trapBaited;
  trap.state = Object.keys(next).length > 0 ? next : undefined;
}

function useFishTrap(trap: StructureSave, craftedItems?: InventoryItems, ctx?: FishTrapContext): StructureInteractionResult {
  if (!ctx) return { ok: false, mode: 'inspect', message: 'fish trap needs local water reading' };
  const set = trap.state?.trapSetDay !== undefined;
  if (set) {
    const caught = fishTrapCatchCount(trap, ctx);
    const elapsed = trapElapsedMinutes(trap, ctx);
    const interval = trap.state?.trapBaited === true ? FISH_TRAP_FAST_MINUTES : FISH_TRAP_SLOW_MINUTES;
    const checks = Math.max(0, Math.trunc(trap.state?.trapChecks ?? 0)) + 1;
    if (caught > 0) {
      addCraftedItem(craftedItems, 'rawFish', caught);
      clearTrapSetState(trap);
      trap.state = { ...trap.state, trapChecks: checks };
      return {
        ok: true,
        mode: 'collectTrap',
        moved: { rawFish: caught },
        message: `fish trap hauled raw fish ${caught} · ${ctx.school.label}`,
      };
    }
    if (elapsed >= interval) {
      clearTrapSetState(trap);
      trap.state = { ...trap.state, trapChecks: checks };
      return {
        ok: true,
        mode: 'checkTrap',
        message: `fish trap checked empty · ${ctx.school.label}${ctx.school.baitUseful ? ' · bait may help' : ''}`,
      };
    }
    const remaining = Math.max(1, interval - elapsed);
    return {
      ok: true,
      mode: 'checkTrap',
      message: `fish trap soaking · ${remaining}m until first check · ${ctx.school.label}`,
    };
  }
  if (!ctx.nearWater && ctx.school.kind !== 'cave') {
    return { ok: false, mode: 'inspect', message: 'fish trap needs shore, dock, or sea-cave water' };
  }
  const baited = spendCraftedItem(craftedItems, 'bait', 1);
  trap.state = {
    ...trap.state,
    trapSetDay: Math.max(0, Math.trunc(ctx.day)),
    trapSetMinute: Math.max(0, Math.min(1439, Math.trunc(ctx.minute))),
    trapBaited: baited,
  };
  return {
    ok: true,
    mode: 'setTrap',
    message: `${baited ? 'baited fish trap set' : 'fish trap set'} · ${ctx.school.label}${baited ? ' · check after 3h' : ' · bait improves the haul'}`,
  };
}

function shoreNetElapsedMinutes(net: StructureSave, ctx: FishTrapContext): number {
  if (net.state?.netSetDay === undefined) return 0;
  const setDay = Math.max(0, Math.trunc(net.state.netSetDay));
  const setMinute = Math.max(0, Math.min(1439, Math.trunc(net.state.netSetMinute ?? 0)));
  const now = Math.max(0, Math.trunc(ctx.day)) * 1440 + Math.max(0, Math.min(1439, Math.trunc(ctx.minute)));
  return Math.max(0, now - (setDay * 1440 + setMinute));
}

function shoreNetInterval(ctx: FishTrapContext): number {
  return ctx.school.kind === 'storm' || ctx.school.kind === 'dock' || ctx.school.kind === 'cave'
    ? SHORE_NET_FAST_MINUTES
    : SHORE_NET_SLOW_MINUTES;
}

function shoreNetCatch(net: StructureSave, ctx: FishTrapContext): InventoryItems {
  const elapsed = shoreNetElapsedMinutes(net, ctx);
  const interval = shoreNetInterval(ctx);
  const ticks = Math.floor(elapsed / interval);
  if (ticks <= 0 || ctx.school.catchCount <= 0) return {};
  if (!ctx.nearWater && ctx.school.kind !== 'cave') return {};
  const fishBonus = ctx.school.kind === 'storm' || ctx.school.kind === 'dock' || ctx.school.kind === 'cave' ? 1 : 0;
  const rawFish = Math.max(1, Math.min(4, Math.trunc(ctx.school.catchCount) + fishBonus, ticks + 1));
  const moved: InventoryItems = { rawFish };
  if (ctx.school.kind === 'cave') moved.kelp = 1;
  else if (ctx.school.kind === 'storm' || ctx.school.kind === 'run') moved.reeds = 1;
  if (ctx.school.baitUseful || ctx.school.kind === 'storm') moved.bait = Math.max(1, Math.trunc(moved.bait ?? 0) + 1);
  return moved;
}

function clearNetSetState(net: StructureSave): void {
  const next: StructureState = { ...net.state };
  delete next.netSetDay;
  delete next.netSetMinute;
  net.state = Object.keys(next).length > 0 ? next : undefined;
}

function useShoreNet(net: StructureSave, craftedItems?: InventoryItems, ctx?: FishTrapContext): StructureInteractionResult {
  if (!ctx) return { ok: false, mode: 'inspect', message: 'shore net needs local water reading' };
  const set = net.state?.netSetDay !== undefined;
  if (set) {
    const moved = shoreNetCatch(net, ctx);
    const elapsed = shoreNetElapsedMinutes(net, ctx);
    const interval = shoreNetInterval(ctx);
    const checks = Math.max(0, Math.trunc(net.state?.netChecks ?? 0)) + 1;
    if (Object.keys(moved).length > 0) {
      for (const [item, amount] of Object.entries(moved)) addCraftedItem(craftedItems, item as CraftedItemId, amount ?? 0);
      clearNetSetState(net);
      net.state = { ...net.state, netChecks: checks };
      return {
        ok: true,
        mode: 'collectNet',
        moved,
        message: `shore net hauled ${formatMoved(moved)} · ${ctx.school.label}`,
      };
    }
    if (elapsed >= interval) {
      clearNetSetState(net);
      net.state = { ...net.state, netChecks: checks };
      return {
        ok: true,
        mode: 'checkNet',
        message: `shore net combed empty · ${ctx.school.label}${ctx.school.baitUseful ? ' · set near a stronger run' : ''}`,
      };
    }
    const remaining = Math.max(1, interval - elapsed);
    return {
      ok: true,
      mode: 'checkNet',
      message: `shore net soaking · ${remaining}m until first comb · ${ctx.school.label}`,
    };
  }
  if (!ctx.nearWater && ctx.school.kind !== 'cave') {
    return { ok: false, mode: 'inspect', message: 'shore net needs shore, dock, or sea-cave water' };
  }
  net.state = {
    ...net.state,
    netSetDay: Math.max(0, Math.trunc(ctx.day)),
    netSetMinute: Math.max(0, Math.min(1439, Math.trunc(ctx.minute))),
  };
  return {
    ok: true,
    mode: 'setNet',
    message: `shore net set · ${ctx.school.label} · comb after ${shoreNetInterval(ctx)}m`,
  };
}

export function interactStructure(
  structures: StructureSave[],
  id: number,
  materialCounts: number[],
  craftedItems?: InventoryItems,
  topology?: StructureTopology,
  waystoneContext?: WaystoneContext,
  weatherVaneContext?: WeatherVaneContext,
  rainCisternContext?: RainCisternContext,
  fishTrapContext?: FishTrapContext,
): StructureInteractionResult {
  const s = structures.find((entry) => entry.id === id);
  if (!s) return { ok: false, message: 'no structure' };
  if (s.item === 'rainCistern') return useRainCistern(s, rainCisternContext);
  if (s.item === 'rootCellar') return useRootCellar(s, craftedItems);
  if (s.item === 'waystone') return attuneWaystone(s, waystoneContext);
  if (s.item === 'weatherVane') return readWeatherVane(s, weatherVaneContext);
  if (s.item === 'fishTrap') return useFishTrap(s, craftedItems, fishTrapContext);
  if (s.item === 'shoreNet') return useShoreNet(s, craftedItems, fishTrapContext);
  if (s.item === 'dryingRack') return preserveAtDryingRack(s, craftedItems);
  if (s.item === 'campfire') {
    const cooked = cookAtCampfire(s, craftedItems);
    if (cooked) return cooked;
    s.state = { ...s.state, lit: s.state?.lit !== true };
    return {
      ok: true,
      mode: s.state.lit ? 'lit' : 'unlit',
      message: `${placeableName(s.item).toLowerCase()} ${s.state.lit ? 'lit' : 'doused'}`,
    };
  }
  if (s.item === 'lantern') {
    s.state = { ...s.state, lit: s.state?.lit !== true };
    return {
      ok: true,
      mode: s.state.lit ? 'lit' : 'unlit',
      message: `${placeableName(s.item).toLowerCase()} ${s.state.lit ? 'lit' : 'doused'}`,
    };
  }
  if (s.item === 'bedroll') {
    setOnlyHomeBedroll(structures, s.id);
    const shelter = shelterReport(structures, topology);
    if (shelter.functional) {
      s.state = { ...s.state, rested: Math.max(2, Math.trunc(s.state?.rested ?? 1) + 1) };
      return { ok: true, mode: 'home', message: 'shelter rest · warmth, storage, and workbench ready' };
    }
    return { ok: true, mode: 'home', message: shelter.protected ? 'weather-safe rest' : 'home set · rested until dawn' };
  }
  if (s.item === 'chest') return toggleChest(s, materialCounts);
  if (s.item === 'dockSegment') return { ok: true, mode: 'inspect', message: 'dock segment ready · cast here with a fishing rod' };
  return { ok: true, mode: 'inspect', message: `${placeableName(s.item).toLowerCase()} ready` };
}

export function nearestStructureOnTiles(structures: readonly StructureSave[], tiles: readonly number[]): StructureSave | null {
  const order = new Map<number, number>();
  tiles.forEach((tile, i) => order.set(tile, i));
  let best: StructureSave | null = null;
  let bestRank = Infinity;
  for (const s of structures) {
    const rank = order.get(s.tile);
    if (rank === undefined || rank >= bestRank) continue;
    best = s;
    bestRank = rank;
  }
  return best;
}
