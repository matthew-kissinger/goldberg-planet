import { ITEM_DEFS, MATERIAL_ITEM_IDS, normalizeInventory, type CraftedItemId, type InventoryItems, type ItemId, type MaterialItemId } from './crafting';
import type { FishSchoolReport } from './fishing';

export const PLACEABLE_ITEM_IDS = [
  'workbench',
  'campfire',
  'chest',
  'bedroll',
  'cropPlot',
  'compostBin',
  'rainCistern',
  'rootCellar',
  'caveAnchor',
  'floorFoundation',
  'wallPanel',
  'wallHalfRail',
  'wallDoorPanel',
  'wallWindowPanel',
  'wallCorner',
  'roofJoin',
  'doorKit',
  'windowFrame',
  'roofBundle',
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
  crop?: CropKind;
  growth?: number;
  fertility?: number;
  harvests?: number;
  composts?: number;
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
  anchorUses?: number;
  anchorKind?: CaveAnchorKind;
  anchorLabel?: string;
  anchorDepth?: number;
  anchorDistance?: number;
  anchorFlooded?: boolean;
  anchorSpring?: boolean;
  anchorClearance?: number;
  anchorTile?: number;
  trapSetDay?: number;
  trapSetMinute?: number;
  trapBaited?: boolean;
  trapChecks?: number;
  netSetDay?: number;
  netSetMinute?: number;
  netChecks?: number;
}

export type WaystoneMark = 'survey' | 'home' | 'cave' | 'shore' | 'forage';
export type CaveAnchorKind = 'arch' | 'dryCave' | 'seaCave';
export type CropKind = 'berries' | 'reeds';

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

export interface SpringWaterContext {
  spring: boolean;
  label: string;
  distance?: number;
}

export interface RainCisternContext extends WeatherVaneContext {
  spring?: SpringWaterContext | null;
}

export interface CaveAnchorContext {
  tile?: number;
  kind: CaveAnchorKind;
  label?: string;
  depth: number;
  flooded: boolean;
  spring?: boolean;
  clearance?: number;
  distance?: number;
  mouth?: boolean;
}

export interface FishTrapContext {
  day: number;
  minute: number;
  nearWater: boolean;
  school: FishSchoolReport;
}

export type WaterlineRouteResupplyKind = 'fishTrap' | 'shoreNet';

export interface WaterlineRouteResupplySource {
  id: number;
  kind: WaterlineRouteResupplyKind;
}

export interface WaterlineRouteResupplyConsumption {
  consumed: number;
  traps: number;
  nets: number;
  sourceIds: number[];
}

export interface CropPlotEnvironment {
  watered: boolean;
  naturalWater?: boolean;
  cisternWater?: number;
  sheltered: boolean;
  protected: boolean;
  lit: boolean;
  warm: boolean;
  cold: boolean;
  storm: boolean;
  highAltitude: boolean;
  label: string;
}

export interface CropConditionReport {
  canGrow: boolean;
  bonusYield: boolean;
  problems: string[];
  label: string;
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

export interface ShelterReport {
  centerTile: number | null;
  tiles: number[];
  enclosure: ShelterEnclosureReport;
  roofPieces: number;
  roofNeed: number;
  hasDoor: boolean;
  hasWindow: boolean;
  hasWarmth: boolean;
  hasStation: boolean;
  hasStorage: boolean;
  hasCellar: boolean;
  hasLight: boolean;
  cellarProvisions: number;
  protected: boolean;
  functional: boolean;
  comfort: number;
  missing: string[];
  label: string;
}

export type ShelterComfortTier = 'none' | 'rough' | 'weather-safe' | 'working' | 'lived-in';

export interface ShelterEnclosureReport {
  roomTiles: number[];
  boundaryTiles: number[];
  supportTiles: number[];
  foundationTiles: number[];
  wallTiles: number[];
  railTiles: number[];
  cornerTiles: number[];
  roofTiles: number[];
  roofJoinTiles: number[];
  openingTiles: number[];
  utilityTiles: number[];
  roofCoverage: number;
  boundaryCoverage: number;
  utilityCoverage: number;
  doorOnBoundary: boolean;
  warmthInside: boolean;
  lightInside: boolean;
  workbenchInside: boolean;
  storageInside: boolean;
  cellarInSupport: boolean;
  enclosed: boolean;
  serviceReady: boolean;
  comfortTier: ShelterComfortTier;
  label: string;
}

export interface StructureInteractionResult {
  ok: boolean;
  message: string;
  mode?: 'lit' | 'unlit' | 'home' | 'deposit' | 'withdraw' | 'plant' | 'plantReeds' | 'tend' | 'harvest' | 'fertilize' | 'irrigate' | 'compost' | 'collectWater' | 'cache' | 'withdrawProvision' | 'cook' | 'preserve' | 'setTrap' | 'checkTrap' | 'collectTrap' | 'setNet' | 'checkNet' | 'collectNet' | 'mark' | 'anchor' | 'forecast' | 'inspect';
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

export type StructureSocketRole = 'floor' | 'foundation' | 'wall-panel' | 'half-rail' | 'wall-opening' | 'wall-light' | 'wall-corner' | 'roof-cap' | 'roof-join' | 'shore-edge' | 'route-marker';

export interface StructureSocketSpec {
  item: PlaceableItemId;
  name: string;
  role: StructureSocketRole;
  modularKit: boolean;
  gridWidth: number;
  gridDepth: number;
  height: number;
  openingWidth?: number;
  openingHeight?: number;
  pivot: 'center' | 'wall-center' | 'shore-center';
  collider: 'hex-cell' | 'thin-wall' | 'roof-shell' | 'edge-strip';
  snap: string[];
  visualScale: string;
  loadBearing: 'code-socket';
  glbPolicy: 'decorative-skin-after-normalization' | 'procedural-only';
}

export interface RootCellarSpendResult {
  ok: boolean;
  cellarId?: number;
  remaining: number;
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

const HOME_ITEMS: PlaceableItemId[] = ['workbench', 'campfire', 'chest', 'bedroll', 'doorKit', 'roofBundle', 'rootCellar'];
const ROOF_NEED = 2;
const CISTERN_CAPACITY = 4;
const ROOT_CELLAR_CAPACITY = 6;
const FISH_TRAP_FAST_MINUTES = 180;
const FISH_TRAP_SLOW_MINUTES = 300;
const SHORE_NET_FAST_MINUTES = 90;
const SHORE_NET_SLOW_MINUTES = 150;

const DEFAULT_SOCKET_SPEC = {
  role: 'floor' as const,
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
  floorFoundation: {
    role: 'foundation',
    modularKit: true,
    gridWidth: 1.08,
    gridDepth: 1.08,
    height: 0.16,
    pivot: 'center',
    collider: 'hex-cell',
    snap: ['centered under a house socket', 'levels one hex footprint', 'does not count as weather boundary'],
    visualScale: 'procedural pad defines floor height and future skin footprint',
  },
  wallPanel: {
    role: 'wall-panel',
    modularKit: true,
    gridWidth: 1,
    gridDepth: 0.2,
    height: 1.65,
    pivot: 'wall-center',
    collider: 'thin-wall',
    snap: ['front edge on hex face', 'full panel counts as shelter boundary', 'top cap stays under roof socket'],
    visualScale: 'procedural full wall owns boundary and future skin footprint',
  },
  wallHalfRail: {
    role: 'half-rail',
    modularKit: true,
    gridWidth: 1,
    gridDepth: 0.16,
    height: 0.82,
    pivot: 'wall-center',
    collider: 'thin-wall',
    snap: ['front edge on hex face', 'porch rail leaves weather gap open', 'does not satisfy full shelter boundary'],
    visualScale: 'procedural rail stays visibly lower than full walls',
  },
  wallDoorPanel: {
    role: 'wall-opening',
    modularKit: true,
    gridWidth: 1,
    gridDepth: 0.22,
    height: 1.75,
    openingWidth: 0.72,
    openingHeight: 1.55,
    pivot: 'wall-center',
    collider: 'thin-wall',
    snap: ['front edge on hex face', 'full wall panel counts as shelter boundary', 'integrated doorway satisfies door access'],
    visualScale: 'procedural full wall and doorway own boundary until shared-scale skins exist',
  },
  wallWindowPanel: {
    role: 'wall-light',
    modularKit: true,
    gridWidth: 1,
    gridDepth: 0.2,
    height: 1.65,
    openingWidth: 0.58,
    openingHeight: 0.52,
    pivot: 'wall-center',
    collider: 'thin-wall',
    snap: ['front edge on hex face', 'full wall panel counts as shelter boundary', 'integrated window satisfies shelter light/readability'],
    visualScale: 'procedural full wall and window opening own boundary until shared-scale skins exist',
  },
  wallCorner: {
    role: 'wall-corner',
    modularKit: true,
    gridWidth: 0.72,
    gridDepth: 0.72,
    height: 1.65,
    pivot: 'wall-center',
    collider: 'thin-wall',
    snap: ['centered as a temporary corner join', 'counts as shelter boundary', 'future edge sockets will split this into two faces'],
    visualScale: 'procedural corner placeholder bridges two wall directions without owning final edge math',
  },
  roofJoin: {
    role: 'roof-join',
    modularKit: true,
    gridWidth: 1.12,
    gridDepth: 0.3,
    height: 0.5,
    pivot: 'wall-center',
    collider: 'roof-shell',
    snap: ['front edge on roof span', 'counts toward roof coverage', 'future shared-scale skins can replace the join cap'],
    visualScale: 'procedural roof join reads as ridge/eave support without changing shelter footprint',
  },
  doorKit: {
    role: 'wall-opening',
    modularKit: true,
    gridWidth: 1,
    gridDepth: 0.22,
    height: 1.9,
    openingWidth: 0.72,
    openingHeight: 1.55,
    pivot: 'wall-center',
    collider: 'thin-wall',
    snap: ['front edge on hex face', 'hinge side follows yaw turn', 'opening remains inside one hex edge'],
    visualScale: 'normalize decorative GLB to one hex edge and keep opening centered',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  windowFrame: {
    role: 'wall-light',
    modularKit: true,
    gridWidth: 0.92,
    gridDepth: 0.18,
    height: 1.45,
    openingWidth: 0.58,
    openingHeight: 0.52,
    pivot: 'wall-center',
    collider: 'thin-wall',
    snap: ['front edge on hex face', 'sill floats above floor socket', 'opening remains centered'],
    visualScale: 'normalize decorative GLB to one hex edge with sill above waist height',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  roofBundle: {
    role: 'roof-cap',
    modularKit: true,
    gridWidth: 1.12,
    gridDepth: 1.12,
    height: 0.62,
    pivot: 'center',
    collider: 'roof-shell',
    snap: ['centered over one occupied shelter hex', 'eaves may overhang but collider stays in socket'],
    visualScale: 'normalize decorative GLB to cap one hex without changing shelter footprint',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  dockSegment: {
    role: 'shore-edge',
    gridWidth: 1.05,
    gridDepth: 0.55,
    height: 0.28,
    pivot: 'shore-center',
    collider: 'edge-strip',
    snap: ['edge must touch shore or waterline'],
    visualScale: 'fit along one waterline edge',
  },
  caveAnchor: {
    role: 'route-marker',
    gridWidth: 0.55,
    gridDepth: 0.55,
    height: 1.15,
    snap: ['centered near a real cave mouth'],
    visualScale: 'fit as marker, not a fake cave entrance',
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

export function houseKitSocketCatalog(): StructureSocketSpec[] {
  return structureSocketCatalog(['doorKit', 'windowFrame', 'roofBundle']);
}

export function wallShellSocketCatalog(): StructureSocketSpec[] {
  return structureSocketCatalog(['floorFoundation', 'wallPanel', 'wallDoorPanel', 'wallWindowPanel', 'wallCorner', 'wallHalfRail', 'roofJoin']);
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

function isEdgeAddressedSocket(item: PlaceableItemId): boolean {
  const spec = structureSocketSpec(item);
  return spec.pivot === 'wall-center' || spec.collider === 'edge-strip' || spec.role === 'roof-join';
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
  const occupies = item === 'wallCorner'
    ? [edgeSlot(edge), edgeSlot(edge + 1)]
    : [edgeSlot(edge)];
  return {
    kind: 'edge',
    edge,
    key: occupies.join('+'),
    occupies,
    label: item === 'wallCorner' ? `hex edges ${edge + 1}/${((edge + 1) % 6) + 1}` : `hex edge ${edge + 1}`,
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
): string | null {
  const tile = Math.trunc(input.tile);
  const placement = structureSocketPlacementFor(input.item, input.yaw);
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

function isCaveAnchorKind(value: unknown): value is CaveAnchorKind {
  return value === 'arch' || value === 'dryCave' || value === 'seaCave';
}

export function caveAnchorKindLabel(kind: CaveAnchorKind | undefined): string {
  switch (kind) {
    case 'dryCave': return 'dry cave';
    case 'seaCave': return 'sea cave';
    case 'arch':
    default: return 'natural arch';
  }
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
  if (item === 'cropPlot') {
    if (value.crop === 'berries' || value.crop === 'reeds') state.crop = value.crop;
    if (Number.isFinite(value.growth) && value.growth! > 0) state.growth = Math.max(0, Math.min(3, Math.trunc(value.growth!)));
    if (Number.isFinite(value.fertility) && value.fertility! > 0) state.fertility = Math.max(0, Math.min(3, Math.trunc(value.fertility!)));
    if (Number.isFinite(value.harvests) && value.harvests! > 0) state.harvests = Math.trunc(value.harvests!);
  }
  if (item === 'compostBin') {
    if (Number.isFinite(value.composts) && value.composts! > 0) state.composts = Math.trunc(value.composts!);
  }
  if (item === 'rainCistern') {
    if (Number.isFinite(value.water) && value.water! > 0) state.water = Math.max(0, Math.min(CISTERN_CAPACITY, Math.trunc(value.water!)));
    if (Number.isFinite(value.fills) && value.fills! > 0) state.fills = Math.trunc(value.fills!);
  }
  if (item === 'rootCellar') {
    if (Number.isFinite(value.provisions) && value.provisions! > 0) state.provisions = Math.max(0, Math.min(ROOT_CELLAR_CAPACITY, Math.trunc(value.provisions!)));
    if (Number.isFinite(value.caches) && value.caches! > 0) state.caches = Math.trunc(value.caches!);
  }
  if (item === 'caveAnchor') {
    if (Number.isFinite(value.anchorUses) && value.anchorUses! > 0) state.anchorUses = Math.trunc(value.anchorUses!);
    if (isCaveAnchorKind(value.anchorKind)) state.anchorKind = value.anchorKind;
    if (typeof value.anchorLabel === 'string' && value.anchorLabel.trim().length > 0) {
      state.anchorLabel = value.anchorLabel.trim().slice(0, 64);
    }
    if (Number.isFinite(value.anchorDepth)) state.anchorDepth = Math.max(0, Math.min(128, value.anchorDepth!));
    if (Number.isFinite(value.anchorDistance)) state.anchorDistance = Math.max(0, Math.min(12, Math.trunc(value.anchorDistance!)));
    if (typeof value.anchorFlooded === 'boolean') state.anchorFlooded = value.anchorFlooded;
    if (typeof value.anchorSpring === 'boolean') state.anchorSpring = value.anchorSpring;
    if (Number.isFinite(value.anchorClearance)) state.anchorClearance = Math.max(0, Math.min(64, Math.trunc(value.anchorClearance!)));
    if (Number.isFinite(value.anchorTile) && value.anchorTile! >= 0) state.anchorTile = Math.trunc(value.anchorTile!);
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

export function canPlaceStructure(structures: readonly StructureSave[], tile: number, item?: PlaceableItemId, yaw = 0): boolean {
  if (item) return structurePlacementBlocker(structures, { item, tile, yaw }) === null;
  return !structures.some((s) => s.tile === tile && structureSocketPlacement(s).kind === 'center');
}

export function addStructure(structures: StructureSave[], input: PlaceStructureInput): StructureSave | null {
  const tile = Math.trunc(input.tile);
  const layer = Math.trunc(input.layer);
  if (!isPlaceableItemId(input.item) || tile < 0 || layer < 0) return null;
  const yaw = normalizeStructureYaw(Number.isFinite(input.yaw) ? input.yaw : 0);
  if (structurePlacementBlocker(structures, { item: input.item, tile, yaw })) return null;
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

export function rotateStructure(structures: StructureSave[], id: number, turns = 1): StructureRotationResult {
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
  const blocker = structurePlacementBlocker(structures, { item: structure.item, tile: structure.tile, yaw: nextYaw }, structure.id);
  if (blocker) {
    return {
      ok: false,
      id: structure.id,
      item: structure.item,
      yaw: structure.yaw,
      turn: structureYawTurn(structure.yaw),
      message: blocker === 'occupied edge socket' ? `${placeableName(structure.item).toLowerCase()} edge is occupied` : 'that hex already has a prop',
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
  const blocker = structurePlacementBlocker(structures, { item: structure.item, tile: toTile, yaw: nextYaw }, structure.id);
  if (blocker) {
    return {
      ok: false,
      id: structure.id,
      item: structure.item,
      fromTile: structure.tile,
      fromLayer: structure.layer,
      toTile,
      toLayer,
      message: blocker === 'occupied edge socket' ? `${placeableName(structure.item).toLowerCase()} edge is occupied` : 'that hex already has a prop',
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
  if (structure.item === 'cropPlot' && state.crop) blockers.push('clear crop first');
  if (structure.item === 'rainCistern' && Math.max(0, Math.trunc(state.water ?? 0)) > 0) blockers.push('empty water first');
  if (structure.item === 'rootCellar' && Math.max(0, Math.trunc(state.provisions ?? 0)) > 0) blockers.push('empty provisions first');
  if ((structure.item === 'campfire' || structure.item === 'lantern') && state.lit === true) blockers.push('douse light first');
  if (structure.item === 'bedroll' && state.home === true) blockers.push('home bedroll is set');
  if (structure.item === 'waystone' && state.waystone) blockers.push('waystone is attuned');
  if (structure.item === 'caveAnchor' && state.anchorKind) blockers.push('cave anchor is set');
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

function homeSupportTiles(structures: readonly StructureSave[], topology?: StructureTopology, rings = 2): number[] {
  const home = structures.find((s) => s.item === 'bedroll' && s.state?.home === true) ?? null;
  return home ? tilesWithin(topology, home.tile, Math.max(0, Math.trunc(rings))) : [];
}

function emptyShelterEnclosure(): ShelterEnclosureReport {
  return {
    roomTiles: [],
    boundaryTiles: [],
    supportTiles: [],
    foundationTiles: [],
    wallTiles: [],
    railTiles: [],
    cornerTiles: [],
    roofTiles: [],
    roofJoinTiles: [],
    openingTiles: [],
    utilityTiles: [],
    roofCoverage: 0,
    boundaryCoverage: 0,
    utilityCoverage: 0,
    doorOnBoundary: false,
    warmthInside: false,
    lightInside: false,
    workbenchInside: false,
    storageInside: false,
    cellarInSupport: false,
    enclosed: false,
    serviceReady: false,
    comfortTier: 'none',
    label: 'no room',
  };
}

function shelterComfortTier(functional: boolean, weatherSafe: boolean, home: boolean, comfort: number): ShelterComfortTier {
  if (functional && comfort >= 6) return 'lived-in';
  if (functional) return 'working';
  if (weatherSafe) return 'weather-safe';
  if (home) return 'rough';
  return 'none';
}

function isWallBoundaryItem(item: PlaceableItemId): boolean {
  return item === 'wallPanel'
    || item === 'wallDoorPanel'
    || item === 'wallWindowPanel'
    || item === 'wallCorner';
}

function isDoorItem(item: PlaceableItemId): boolean {
  return item === 'doorKit' || item === 'wallDoorPanel';
}

function isWindowItem(item: PlaceableItemId): boolean {
  return item === 'windowFrame' || item === 'wallWindowPanel';
}

function isRoofItem(item: PlaceableItemId): boolean {
  return item === 'roofBundle' || item === 'roofJoin';
}

function isOpeningItem(item: PlaceableItemId): boolean {
  return isDoorItem(item) || isWindowItem(item);
}

export function shelterReport(structures: readonly StructureSave[], topology?: StructureTopology, rings = 1): ShelterReport {
  const home = structures.find((s) => s.item === 'bedroll' && s.state?.home === true) ?? null;
  if (!home) {
    return {
      centerTile: null,
      tiles: [],
      enclosure: emptyShelterEnclosure(),
      roofPieces: 0,
      roofNeed: ROOF_NEED,
      hasDoor: false,
      hasWindow: false,
      hasWarmth: false,
      hasStation: false,
      hasStorage: false,
      hasCellar: false,
      hasLight: false,
      cellarProvisions: 0,
      protected: false,
      functional: false,
      comfort: 0,
      missing: ['home bedroll'],
      label: 'no home bedroll',
    };
  }

  const tiles = tilesWithin(topology, home.tile, Math.max(0, Math.trunc(rings)));
  const local = new Set(tiles);
  const boundaryTiles = tiles.filter((tile) => tile !== home.tile);
  const boundary = new Set(boundaryTiles);
  const supportTiles = tilesWithin(topology, home.tile, 2);
  const support = new Set(supportTiles);
  const nearby = structures.filter((s) => local.has(s.tile));
  const foundationTiles = nearby.filter((s) => s.item === 'floorFoundation').map((s) => s.tile);
  const wallTiles = nearby.filter((s) => isWallBoundaryItem(s.item)).map((s) => s.tile);
  const railTiles = nearby.filter((s) => s.item === 'wallHalfRail').map((s) => s.tile);
  const cornerTiles = nearby.filter((s) => s.item === 'wallCorner').map((s) => s.tile);
  const roofTiles = nearby.filter((s) => isRoofItem(s.item)).map((s) => s.tile);
  const roofJoinTiles = nearby.filter((s) => s.item === 'roofJoin').map((s) => s.tile);
  const openingTiles = nearby.filter((s) => isOpeningItem(s.item)).map((s) => s.tile);
  const utilityTiles = nearby.filter((s) => s.item === 'campfire' || s.item === 'lantern' || s.item === 'workbench' || s.item === 'chest').map((s) => s.tile);
  const roofPieces = nearby.filter((s) => isRoofItem(s.item)).length;
  const hasDoor = nearby.some((s) => isDoorItem(s.item));
  const hasWindow = nearby.some((s) => isWindowItem(s.item));
  const doorOnBoundary = nearby.some((s) => isDoorItem(s.item) && boundary.has(s.tile));
  const hasWarmth = nearby.some((s) => s.item === 'campfire' && s.state?.lit === true);
  const hasStation = nearby.some((s) => s.item === 'workbench');
  const hasStorage = nearby.some((s) => s.item === 'chest');
  const supportStructures = structures.filter((s) => support.has(s.tile));
  const cellarProvisions = supportStructures.reduce((sum, s) => s.item === 'rootCellar' ? sum + rootCellarProvisionCount([s], undefined, false) : sum, 0);
  const hasCellar = supportStructures.some((s) => s.item === 'rootCellar');
  const hasLight = hasWarmth || nearby.some((s) => s.item === 'lantern' && s.state?.lit === true);
  const comfort = (hasWindow ? 1 : 0) + (hasLight ? 1 : 0) + (hasStation ? 1 : 0) + (hasStorage ? 1 : 0) + (hasCellar ? 1 : 0) + (foundationTiles.length > 0 ? 1 : 0) + Math.min(2, roofPieces);
  const boundaryNeed = Math.max(1, Math.min(4, boundaryTiles.length || 1));
  const shellBoundaryAttempt = wallTiles.length > 0 || railTiles.length > 0;
  const boundaryContributorTiles = shellBoundaryAttempt ? [...wallTiles, ...openingTiles] : [...roofTiles, ...openingTiles];
  const boundaryContributorSet = new Set(boundaryContributorTiles.filter((tile) => boundary.has(tile)));
  const boundaryCoverage = Math.min(1, boundaryContributorSet.size / boundaryNeed);
  const utilityCoverage = Math.min(1, (Number(hasWarmth) + Number(hasStation) + Number(hasStorage)) / 3);
  const spatiallyEnclosed = roofPieces >= ROOF_NEED && boundaryCoverage >= 0.75 && doorOnBoundary;
  const weatherSafe = spatiallyEnclosed && hasWarmth;
  const serviceReady = hasWarmth && hasStation && hasStorage;
  const functional = weatherSafe && serviceReady;
  const missing: string[] = [];
  if (roofPieces < ROOF_NEED) missing.push(`roof ${roofPieces}/${ROOF_NEED}`);
  if (!hasDoor) missing.push('door');
  else if (!doorOnBoundary) missing.push('door on room edge');
  if (hasDoor && roofPieces >= ROOF_NEED && boundaryCoverage < 0.75) missing.push('room boundary');
  if (!hasWarmth) missing.push('lit campfire');
  if (!hasStation) missing.push('workbench');
  if (!hasStorage) missing.push('chest');
  const tier = shelterComfortTier(functional, weatherSafe, true, comfort);
  const enclosure: ShelterEnclosureReport = {
    roomTiles: tiles,
    boundaryTiles,
    supportTiles,
    foundationTiles,
    wallTiles,
    railTiles,
    cornerTiles,
    roofTiles,
    roofJoinTiles,
    openingTiles,
    utilityTiles,
    roofCoverage: Math.min(1, roofPieces / ROOF_NEED),
    boundaryCoverage,
    utilityCoverage,
    doorOnBoundary,
    warmthInside: hasWarmth,
    lightInside: hasLight,
    workbenchInside: hasStation,
    storageInside: hasStorage,
    cellarInSupport: hasCellar,
    enclosed: spatiallyEnclosed,
    serviceReady,
    comfortTier: tier,
    label: functional
      ? tier === 'lived-in' ? 'lived-in shelter room' : 'working shelter room'
      : weatherSafe
      ? 'weather-safe room'
      : `open room needs ${missing[0] ?? 'more shelter'}`,
  };
  return {
    centerTile: home.tile,
    tiles,
    enclosure,
    roofPieces,
    roofNeed: ROOF_NEED,
    hasDoor,
    hasWindow,
    hasWarmth,
    hasStation,
    hasStorage,
    hasCellar,
    hasLight,
    cellarProvisions,
    protected: weatherSafe,
    functional,
    comfort,
    missing,
    label: functional
      ? 'shelter alive'
      : weatherSafe
      ? 'weather safe'
      : missing.length > 0
      ? `shelter needs ${missing[0]}`
      : 'shelter started',
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
  const cellarProvisions = rootCellarProvisionCount(structures, topology);
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
  return { score, max: HOME_ITEMS.length, label, hasHearth, functional, litCampfire, homeBedroll, storedItems, cellarProvisions, shelter };
}

export function spendPlacedItem(items: InventoryItems, item: PlaceableItemId): boolean {
  const count = Math.max(0, Math.trunc(items[item] ?? 0));
  if (count <= 0) return false;
  if (count === 1) delete items[item];
  else items[item] = count - 1;
  return true;
}

function addInventoryItem(items: InventoryItems, item: ItemId, amount: number): void {
  if (amount <= 0) return;
  items[item] = Math.max(0, Math.trunc(items[item] ?? 0) + amount);
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

function cisternWater(cistern: StructureSave | undefined | null): number {
  return Math.max(0, Math.min(CISTERN_CAPACITY, Math.trunc(cistern?.state?.water ?? 0)));
}

function rootCellarProvisions(cellar: StructureSave | undefined | null): number {
  return Math.max(0, Math.min(ROOT_CELLAR_CAPACITY, Math.trunc(cellar?.state?.provisions ?? 0)));
}

export function rootCellarProvisionCapacity(): number {
  return ROOT_CELLAR_CAPACITY;
}

export function rootCellarProvisionCount(
  structures: readonly StructureSave[],
  topology?: StructureTopology,
  homeOnly = true,
): number {
  const localTiles = new Set(homeOnly ? homeSupportTiles(structures, topology, 2) : []);
  const requireLocal = homeOnly && localTiles.size > 0;
  return structures.reduce((sum, s) =>
    s.item === 'rootCellar' && (!requireLocal || localTiles.has(s.tile))
      ? sum + rootCellarProvisions(s)
      : sum,
    0,
  );
}

export function spendRootCellarProvision(
  structures: StructureSave[],
  topology?: StructureTopology,
  homeOnly = true,
): RootCellarSpendResult {
  const localTiles = new Set(homeOnly ? homeSupportTiles(structures, topology, 2) : []);
  const requireLocal = homeOnly && localTiles.size > 0;
  let best: StructureSave | null = null;
  let bestProvisions = 0;
  for (const s of structures) {
    if (s.item !== 'rootCellar') continue;
    if (requireLocal && !localTiles.has(s.tile)) continue;
    const provisions = rootCellarProvisions(s);
    if (provisions <= bestProvisions) continue;
    best = s;
    bestProvisions = provisions;
  }
  if (!best) {
    return { ok: false, remaining: rootCellarProvisionCount(structures, topology, homeOnly) };
  }
  const next = bestProvisions - 1;
  best.state = {
    ...best.state,
    provisions: next > 0 ? next : undefined,
  };
  if (best.state.provisions === undefined) delete best.state.provisions;
  if (Object.keys(best.state).length === 0) delete best.state;
  return {
    ok: true,
    cellarId: best.id,
    remaining: rootCellarProvisionCount(structures, topology, homeOnly),
  };
}

function localCisternWithWater(
  structures: readonly StructureSave[],
  plot: StructureSave,
  topology?: StructureTopology,
): StructureSave | null {
  const tiles = new Set(tilesWithin(topology, plot.tile, 1));
  let best: StructureSave | null = null;
  let bestWater = 0;
  for (const s of structures) {
    if (s.item !== 'rainCistern' || !tiles.has(s.tile)) continue;
    const water = cisternWater(s);
    if (water <= bestWater) continue;
    best = s;
    bestWater = water;
  }
  return best;
}

export function cropConditionReport(env?: CropPlotEnvironment, fertility = 0, crop: CropKind = 'berries'): CropConditionReport {
  if (!env) {
    return {
      canGrow: true,
      bonusYield: fertility > 0,
      problems: [],
      label: crop === 'reeds' ? 'reed bed' : fertility > 0 ? 'fertile garden' : 'temperate garden',
    };
  }
  const fertile = Math.max(0, Math.trunc(fertility)) > 0;
  const problems: string[] = [];
  if (!env.watered && (crop === 'reeds' || !fertile)) problems.push(crop === 'reeds' ? 'needs standing water' : 'needs nearby water');
  if (!env.lit) problems.push('needs light');
  if (crop !== 'reeds' && env.cold && !env.warm) problems.push(env.highAltitude ? 'needs ridge warmth' : 'needs warmth');
  if (crop !== 'reeds' && env.storm && !env.protected) problems.push('needs storm cover');
  const baseLabel = env.label.trim() || (problems.length > 0 ? problems[0] : 'garden ready');
  const cropLabel = crop === 'reeds' ? `${baseLabel} · reed bed` : baseLabel;
  const label = fertile && problems.length === 0 ? `${cropLabel} · composted` : cropLabel;
  return {
    canGrow: problems.length === 0,
    bonusYield: crop === 'reeds'
      ? env.watered && env.lit && (env.naturalWater || env.storm || fertile)
      : (env.watered || fertile) && env.lit && (env.protected || env.sheltered || env.warm || fertile),
    problems,
    label,
  };
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
      addInventoryItem(moved, id, count);
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
    addInventoryItem(storage, id, amount);
    addInventoryItem(moved, id, amount);
  }
  chest.state.storage = storageTotal(storage) > 0 ? storage : undefined;
  const text = formatMoved(moved);
  return { ok: text.length > 0, mode: 'deposit', moved, message: text ? `stashed ${text}` : 'nothing to stash' };
}

function tendCropPlot(
  plot: StructureSave,
  craftedItems?: InventoryItems,
  env?: CropPlotEnvironment,
  structures: readonly StructureSave[] = [],
  topology?: StructureTopology,
): StructureInteractionResult {
  plot.state = plot.state ?? {};
  const fertility = Math.max(0, Math.min(3, Math.trunc(plot.state.fertility ?? 0)));
  const currentCrop = plot.state.crop ?? (env?.naturalWater && craftedCount(craftedItems, 'reeds') > 0 ? 'reeds' : 'berries');
  const report = cropConditionReport(env, fertility, currentCrop);
  const irrigationCistern = env && !env.naturalWater && (env.cisternWater ?? 0) > 0
    ? localCisternWithWater(structures, plot, topology)
    : null;
  if (!plot.state.crop) {
    if (currentCrop === 'reeds') {
      spendCraftedItem(craftedItems, 'reeds', 1);
      plot.state.crop = 'reeds';
      plot.state.growth = 1;
      return {
        ok: true,
        mode: 'plantReeds',
        message: env ? `planted reed slips · ${report.label}` : 'planted reed slips',
      };
    }
    const spentSeeds = spendCraftedItem(craftedItems, 'seeds', 1);
    plot.state.crop = 'berries';
    plot.state.growth = 1;
    const base = spentSeeds ? 'planted berry seeds' : 'planted wild berry starts';
    return {
      ok: true,
      mode: 'plant',
      message: env ? `${base} · ${report.label}` : base,
    };
  }
  const growth = Math.max(0, Math.trunc(plot.state.growth ?? 0));
  if (growth >= 3) {
    if (plot.state.crop === 'reeds') {
      const reeds = 3 + (report.bonusYield ? 1 : 0) + fertility;
      const bait = report.bonusYield ? 1 : 0;
      addCraftedItem(craftedItems, 'reeds', reeds);
      if (bait > 0) addCraftedItem(craftedItems, 'bait', bait);
      plot.state.growth = 1;
      const nextFertility = Math.max(0, fertility - 1);
      if (nextFertility > 0) plot.state.fertility = nextFertility;
      else delete plot.state.fertility;
      plot.state.harvests = Math.max(0, Math.trunc(plot.state.harvests ?? 0)) + 1;
      return {
        ok: true,
        mode: 'harvest',
        moved: bait > 0 ? { reeds, bait } : { reeds },
        message: `cut reeds ${reeds}${bait > 0 ? ` · bait ${bait}` : ''}${env ? ` · ${report.label}` : ''}`,
      };
    }
    const berries = 3 + (report.bonusYield ? 1 : 0) + fertility;
    const seeds = 1 + (env?.protected && env.watered ? 1 : 0) + (fertility >= 2 ? 1 : 0);
    addCraftedItem(craftedItems, 'berries', berries);
    addCraftedItem(craftedItems, 'seeds', seeds);
    plot.state.growth = 1;
    const nextFertility = Math.max(0, fertility - 1);
    if (nextFertility > 0) plot.state.fertility = nextFertility;
    else delete plot.state.fertility;
    plot.state.harvests = Math.max(0, Math.trunc(plot.state.harvests ?? 0)) + 1;
    return {
      ok: true,
      mode: 'harvest',
      moved: { berries, seeds },
      message: `harvested berries ${berries} · seeds ${seeds}${env ? ` · ${report.label}` : ''}`,
    };
  }
  if (craftedCount(craftedItems, 'compost') > 0 && fertility < 2) {
    spendCraftedItem(craftedItems, 'compost', 1);
    plot.state.fertility = fertility + 1;
    return {
      ok: true,
      mode: 'fertilize',
      moved: { compost: 1 },
      message: `fed compost to ${plot.state.crop === 'reeds' ? 'reed bed' : 'berry plot'} · fertility ${plot.state.fertility}/2`,
    };
  }
  if (!report.canGrow) {
    return {
      ok: true,
      mode: 'tend',
      message: `${plot.state.crop === 'reeds' ? 'reed bed' : 'berry plot'} waits: ${report.problems.slice(0, 2).join(' + ')} · ${report.label}`,
    };
  }
  const growthStep = fertility > 0 ? 2 : 1;
  plot.state.growth = Math.min(3, growth + growthStep);
  let irrigated = false;
  if (irrigationCistern) {
    const next = Math.max(0, cisternWater(irrigationCistern) - 1);
    irrigationCistern.state = {
      ...irrigationCistern.state,
      water: next > 0 ? next : undefined,
    };
    if (irrigationCistern.state.water === undefined) delete irrigationCistern.state.water;
    irrigated = true;
  }
  return {
    ok: true,
    mode: irrigated ? 'irrigate' : 'tend',
    message: plot.state.growth >= 3
      ? `${plot.state.crop === 'reeds' ? 'reed bed' : 'berry plot'} ready to harvest${env ? ` · ${report.label}` : ''}${irrigationCistern ? ` · cistern water ${cisternWater(irrigationCistern)}/${CISTERN_CAPACITY}` : ''}`
      : `tended ${plot.state.crop === 'reeds' ? 'reed bed' : 'berry plot'} ${plot.state.growth}/3${env ? ` · ${report.label}` : ''}${irrigationCistern ? ` · cistern water ${cisternWater(irrigationCistern)}/${CISTERN_CAPACITY}` : ''}`,
  };
}

function makeCompost(bin: StructureSave, craftedItems?: InventoryItems): StructureInteractionResult {
  if (!craftedItems) return { ok: false, message: 'compost bin needs food inventory' };
  const scrap: CraftedItemId | null = craftedCount(craftedItems, 'kelp') > 0
    ? 'kelp'
    : craftedCount(craftedItems, 'reeds') > 0
    ? 'reeds'
    : craftedCount(craftedItems, 'berries') > 0
    ? 'berries'
    : craftedCount(craftedItems, 'caveMushroom') > 0
    ? 'caveMushroom'
    : craftedCount(craftedItems, 'rawFish') > 0
    ? 'rawFish'
    : null;
  if (!scrap) return { ok: false, mode: 'inspect', message: 'compost bin needs kelp, reeds, berries, mushrooms, or raw fish scraps' };
  spendCraftedItem(craftedItems, scrap, 1);
  addCraftedItem(craftedItems, 'compost', 2);
  bin.state = {
    ...bin.state,
    composts: Math.max(1, Math.trunc(bin.state?.composts ?? 0) + 1),
  };
  return {
    ok: true,
    mode: 'compost',
    moved: { compost: 2 },
    message: `turned ${ITEM_DEFS[scrap].name.toLowerCase()} into compost 2`,
  };
}

function useRainCistern(cistern: StructureSave, ctx?: RainCisternContext): StructureInteractionResult {
  const current = cisternWater(cistern);
  const wet = ctx?.kind === 'rain' || ctx?.kind === 'storm' || ctx?.kind === 'soaked' || ctx?.kind === 'mist';
  const spring = ctx?.spring?.spring === true ? ctx.spring : null;
  if (!ctx || (!wet && !spring)) {
    return {
      ok: true,
      mode: 'inspect',
      message: current > 0
        ? `rain cistern holds water ${current}/${CISTERN_CAPACITY}`
        : 'rain cistern dry · wait for rain, storm, or a cave spring',
    };
  }
  const amount = ctx.kind === 'storm' || ctx.kind === 'soaked' ? 2 : 1;
  const next = Math.min(CISTERN_CAPACITY, current + amount);
  cistern.state = {
    ...cistern.state,
    water: next,
    fills: Math.max(0, Math.trunc(cistern.state?.fills ?? 0)) + (next > current ? 1 : 0),
  };
  if (!wet && spring) {
    return {
      ok: true,
      mode: 'collectWater',
      message: next > current
        ? `rain cistern tapped ${spring.label.toLowerCase()} · water ${next}/${CISTERN_CAPACITY}`
        : `rain cistern full · water ${next}/${CISTERN_CAPACITY}`,
    };
  }
  return {
    ok: true,
    mode: 'collectWater',
    message: next > current
      ? `rain cistern caught ${ctx.label.toLowerCase()} water · water ${next}/${CISTERN_CAPACITY}`
      : `rain cistern full · water ${next}/${CISTERN_CAPACITY}`,
  };
}

export function rainCisternWaterCapacity(): number {
  return CISTERN_CAPACITY;
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
      : `root cellar empty · cache trail rations or cave forage ${current}/${ROOT_CELLAR_CAPACITY}`,
  };
}

function useCaveAnchor(anchor: StructureSave, ctx?: CaveAnchorContext): StructureInteractionResult {
  if (!ctx) {
    if (anchor.state?.anchorKind) {
      const label = anchor.state.anchorLabel || caveAnchorKindLabel(anchor.state.anchorKind);
      const depth = Number.isFinite(anchor.state.anchorDepth) ? ` · depth ${anchor.state.anchorDepth!.toFixed(1)} m` : '';
      const flooded = anchor.state.anchorFlooded ? ' · flooded' : '';
      const spring = anchor.state.anchorSpring ? ' · spring seep' : '';
      return {
        ok: true,
        mode: 'inspect',
        message: `cave anchor holds ${label}${depth}${flooded}${spring}`,
      };
    }
    return {
      ok: false,
      mode: 'inspect',
      message: 'cave anchor needs a nearby cave mouth or arch',
    };
  }
  const distance = Math.max(0, Math.trunc(ctx.distance ?? 0));
  const label = (ctx.label?.trim() || caveAnchorKindLabel(ctx.kind)).slice(0, 64);
  const targetTile = Number.isFinite(ctx.tile) && ctx.tile! >= 0 ? Math.trunc(ctx.tile!) : anchor.tile;
  anchor.state = {
    ...anchor.state,
    anchorUses: Math.max(0, Math.trunc(anchor.state?.anchorUses ?? 0)) + 1,
    anchorKind: ctx.kind,
    anchorLabel: label,
    anchorDepth: Math.max(0, Math.min(128, ctx.depth)),
    anchorDistance: distance,
    anchorFlooded: ctx.flooded,
    anchorSpring: ctx.spring === true,
    anchorTile: targetTile,
  };
  if (ctx.clearance !== undefined) anchor.state.anchorClearance = Math.max(0, Math.min(64, Math.trunc(ctx.clearance)));
  else delete anchor.state.anchorClearance;
  const rings = distance === 0 ? 'here' : `${distance} ring${distance === 1 ? '' : 's'} away`;
  const clearance = ctx.clearance !== undefined ? ` · clearance ${Math.trunc(ctx.clearance)} cells` : '';
  const spring = ctx.spring ? ' · spring seep' : '';
  return {
    ok: true,
    mode: 'anchor',
    message: `cave anchor set · ${label} ${rings} · depth ${ctx.depth.toFixed(1)} m${clearance}${ctx.flooded ? ' · flooded' : ''}${spring}`,
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

export function consumeWaterlineRouteResupply(
  structures: StructureSave[],
  sources: readonly WaterlineRouteResupplySource[],
): WaterlineRouteResupplyConsumption {
  const trapIds = new Set<number>();
  const netIds = new Set<number>();
  for (const source of sources) {
    const id = Math.max(0, Math.trunc(source.id));
    if (id <= 0) continue;
    if (source.kind === 'fishTrap') trapIds.add(id);
    else if (source.kind === 'shoreNet') netIds.add(id);
  }

  const consumedIds: number[] = [];
  let traps = 0;
  let nets = 0;
  for (const structure of structures) {
    if (structure.item === 'fishTrap' && trapIds.has(structure.id) && structure.state?.trapSetDay !== undefined) {
      const checks = Math.max(0, Math.trunc(structure.state?.trapChecks ?? 0)) + 1;
      clearTrapSetState(structure);
      structure.state = { ...structure.state, trapChecks: checks };
      consumedIds.push(structure.id);
      traps++;
    } else if (structure.item === 'shoreNet' && netIds.has(structure.id) && structure.state?.netSetDay !== undefined) {
      const checks = Math.max(0, Math.trunc(structure.state?.netChecks ?? 0)) + 1;
      clearNetSetState(structure);
      structure.state = { ...structure.state, netChecks: checks };
      consumedIds.push(structure.id);
      nets++;
    }
  }

  return {
    consumed: traps + nets,
    traps,
    nets,
    sourceIds: consumedIds,
  };
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
  cropEnvironment?: CropPlotEnvironment,
  waystoneContext?: WaystoneContext,
  weatherVaneContext?: WeatherVaneContext,
  rainCisternContext?: RainCisternContext,
  caveAnchorContext?: CaveAnchorContext,
  fishTrapContext?: FishTrapContext,
): StructureInteractionResult {
  const s = structures.find((entry) => entry.id === id);
  if (!s) return { ok: false, message: 'no structure' };
  if (s.item === 'cropPlot') return tendCropPlot(s, craftedItems, cropEnvironment, structures, topology);
  if (s.item === 'compostBin') return makeCompost(s, craftedItems);
  if (s.item === 'rainCistern') return useRainCistern(s, rainCisternContext);
  if (s.item === 'rootCellar') return useRootCellar(s, craftedItems);
  if (s.item === 'caveAnchor') return useCaveAnchor(s, caveAnchorContext);
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
