import { itemCount, type InventoryItems } from './crafting';
import {
  addStructure,
  dismantleStructure,
  interactStructure,
  isPlaceableItemId,
  placeableName,
  relocateStructure,
  rotateStructure,
  spendPlacedItem,
  STRUCTURE_YAW_STEP,
  structureDismantleBlockers,
  structurePlacementBlocker,
  structureSocketPlacement,
  structureSocketPlacementFor,
  structureSocketSpec,
  structureYawTurn,
  type FishTrapContext,
  type PlaceableItemId,
  type RainCisternContext,
  type StructureRelocationResult,
  type StructureInteractionResult,
  type StructureSave,
  type StructureSocketSpec,
  type StructureTopology,
  type WaystoneContext,
  type WeatherVaneContext,
} from './structures';

export type StructureCommandKind = 'selectPlacement' | 'rotatePlacement' | 'rotatePlaced' | 'place' | 'relocate' | 'pack' | 'use';

export interface StructureCommandResult {
  ok: boolean;
  command: StructureCommandKind;
  message: string;
  action: string;
  item?: PlaceableItemId;
  id?: number;
  selected?: PlaceableItemId | null;
  turn?: number;
  yaw?: number;
  fromTile?: number;
  fromLayer?: number;
  toTile?: number;
  toLayer?: number;
  placed?: StructureSave;
  interaction?: StructureInteractionResult;
  relocation?: StructureRelocationResult;
  mode?: StructureInteractionResult['mode'];
  foodAction?: string;
  navigationAction?: string;
  caveAction?: string;
  inventoryReturned?: boolean;
  blockers?: string[];
}

export interface StructureSnapPreview {
  active: boolean;
  mode: 'place' | 'relocate';
  ok: boolean;
  item: PlaceableItemId;
  id?: number;
  tile: number;
  layer: number;
  yaw: number;
  turn: number;
  fromTile?: number;
  fromLayer?: number;
  message: string;
  blocker: string | null;
  blockers: string[];
  socket: StructureSocketSpec;
}

export interface StructurePlaceCommandInput {
  structures: StructureSave[];
  item: PlaceableItemId;
  tile: number;
  layer: number;
  yaw: number;
  placementTurn: number;
  materialCounts: readonly number[];
  craftedItems: InventoryItems;
  creative: boolean;
  playerTile: number;
  blocker?: string | null;
  topology?: StructureTopology;
}

export interface StructureUseCommandInput {
  structures: StructureSave[];
  target: StructureSave | null;
  materialCounts: number[];
  craftedItems?: InventoryItems;
  topology?: StructureTopology;
  waystoneContext?: WaystoneContext;
  weatherVaneContext?: WeatherVaneContext;
  rainCisternContext?: RainCisternContext;
  fishTrapContext?: FishTrapContext;
}

export interface StructureRelocateCommandInput {
  structures: StructureSave[];
  target: StructureSave | null;
  tile: number;
  layer: number;
  yaw?: number;
  playerTile: number;
  blocker?: string | null;
  topology?: StructureTopology;
}

export interface StructurePlacePreviewInput extends StructurePlaceCommandInput {}

export interface StructureRelocatePreviewInput extends StructureRelocateCommandInput {}

export function normalizePlacementTurn(turns: number): number {
  return ((Math.trunc(Number.isFinite(turns) ? turns : 0) % 6) + 6) % 6;
}

export function selectStructurePlacementCommand(
  materialCounts: readonly number[],
  craftedItems: InventoryItems,
  id: string,
): StructureCommandResult {
  if (!isPlaceableItemId(id)) {
    return {
      ok: false,
      command: 'selectPlacement',
      message: 'unknown placeable prop',
      action: 'select:invalid',
      selected: null,
    };
  }
  if (itemCount(materialCounts, craftedItems, id) <= 0) {
    return {
      ok: false,
      command: 'selectPlacement',
      item: id,
      message: `craft ${placeableName(id).toLowerCase()} first`,
      action: `${id}:select:missing`,
      selected: null,
    };
  }
  return {
    ok: true,
    command: 'selectPlacement',
    item: id,
    message: `place ${placeableName(id)}`,
    action: `${id}:select`,
    selected: id,
  };
}

export function rotateSelectedPlacementCommand(
  selected: PlaceableItemId | null,
  currentTurn: number,
  turns = 1,
): StructureCommandResult {
  const startTurn = normalizePlacementTurn(currentTurn);
  if (!selected) {
    return {
      ok: false,
      command: 'rotatePlacement',
      message: 'no selected prop to rotate',
      action: 'placement-rotate:none',
      selected: null,
      turn: startTurn,
      yaw: startTurn * STRUCTURE_YAW_STEP,
    };
  }
  const turn = normalizePlacementTurn(startTurn + Math.trunc(Number.isFinite(turns) ? turns : 0));
  return {
    ok: true,
    command: 'rotatePlacement',
    item: selected,
    selected,
    turn,
    yaw: turn * STRUCTURE_YAW_STEP,
    message: `${placeableName(selected).toLowerCase()} facing hex face ${turn + 1}`,
    action: `${selected}:placement-rotate:hex face ${turn + 1}`,
  };
}

export function rotatePlacedStructureCommand(
  structures: StructureSave[],
  target: StructureSave | null,
  turns = 1,
  topology?: StructureTopology,
): StructureCommandResult {
  if (!target) {
    return {
      ok: false,
      command: 'rotatePlaced',
      message: 'no nearby prop to rotate',
      action: 'rotate:none',
    };
  }
  const result = rotateStructure(structures, target.id, turns, topology);
  return {
    ok: result.ok,
    command: 'rotatePlaced',
    item: result.item ?? target.item,
    id: result.id ?? target.id,
    turn: result.turn,
    yaw: result.yaw,
    message: result.message,
    action: `${target.item}:rotate:${result.message}`,
    blockers: result.blockers,
  };
}

function placementBlockerMessage(item: PlaceableItemId, blocker: string, genericOccupiedEdge = false): string {
  if (blocker === 'occupied edge socket') return genericOccupiedEdge ? 'that edge already has a prop' : `${placeableName(item)} edge is occupied`;
  if (blocker === 'invalid edge socket') return `${placeableName(item)} needs a real hex edge`;
  return 'that hex already has a prop';
}

export function previewPlaceStructureCommand(input: StructurePlacePreviewInput): StructureSnapPreview {
  const turn = normalizePlacementTurn(input.placementTurn);
  const socket = structureSocketSpec(input.item);
  const base = {
    active: true,
    mode: 'place' as const,
    item: input.item,
    tile: Math.trunc(input.tile),
    layer: Math.trunc(input.layer),
    yaw: input.yaw,
    turn,
    socket,
  };
  if (!input.creative && itemCount(input.materialCounts, input.craftedItems, input.item) <= 0) {
    const blocker = `no ${placeableName(input.item).toLowerCase()} to place`;
    return { ...base, ok: false, message: blocker, blocker, blockers: [blocker] };
  }
  if (Math.trunc(input.tile) === Math.trunc(input.playerTile)) {
    return { ...base, ok: false, message: 'step aside before placing here', blocker: 'player on snap target', blockers: ['player on snap target'] };
  }
  if (input.blocker) {
    return { ...base, ok: false, message: input.blocker, blocker: input.blocker, blockers: [input.blocker] };
  }
  const occupancyBlocker = structurePlacementBlocker(input.structures, { item: input.item, tile: input.tile, yaw: input.yaw }, undefined, input.topology);
  if (occupancyBlocker) {
    return {
      ...base,
      ok: false,
      message: placementBlockerMessage(input.item, occupancyBlocker, true),
      blocker: occupancyBlocker,
      blockers: [occupancyBlocker],
    };
  }
  return {
    ...base,
    ok: true,
    message: `${placeableName(input.item)} can snap here`,
    blocker: null,
    blockers: [],
  };
}

export function placeStructureCommand(input: StructurePlaceCommandInput): StructureCommandResult {
  const { structures, item, tile, layer, yaw, materialCounts, craftedItems, creative } = input;
  const placementTurn = normalizePlacementTurn(input.placementTurn);
  if (!isPlaceableItemId(item)) {
    return {
      ok: false,
      command: 'place',
      message: 'unknown placeable prop',
      action: 'place:invalid',
      selected: null,
    };
  }
  if (!creative && itemCount(materialCounts, craftedItems, item) <= 0) {
    return {
      ok: false,
      command: 'place',
      item,
      message: `no ${placeableName(item).toLowerCase()} to place`,
      action: `${item}:place:missing`,
      selected: null,
    };
  }
  if (Math.trunc(tile) === Math.trunc(input.playerTile)) {
    return {
      ok: false,
      command: 'place',
      item,
      message: 'step aside before placing here',
      action: `${item}:place:blocked:player`,
      selected: item,
    };
  }
  if (input.blocker) {
    return {
      ok: false,
      command: 'place',
      item,
      message: input.blocker,
      action: `${item}:place:blocked:${input.blocker}`,
      selected: item,
      blockers: [input.blocker],
    };
  }
  const occupancyBlocker = structurePlacementBlocker(structures, { item, tile, yaw }, undefined, input.topology);
  if (occupancyBlocker) {
    return {
      ok: false,
      command: 'place',
      item,
      message: placementBlockerMessage(item, occupancyBlocker, true),
      action: `${item}:place:blocked:${occupancyBlocker}`,
      selected: item,
      blockers: [occupancyBlocker],
    };
  }
  const placed = addStructure(structures, { item, tile, layer, yaw }, input.topology);
  if (!placed) {
    return {
      ok: false,
      command: 'place',
      item,
      message: 'that hex already has a prop',
      action: `${item}:place:blocked:occupied`,
      selected: item,
    };
  }
  if (!creative) spendPlacedItem(craftedItems, item);
  const selected = itemCount(materialCounts, craftedItems, item) > 0 ? item : null;
  const turn = structureYawTurn(placed.yaw);
  return {
    ok: true,
    command: 'place',
    item,
    id: placed.id,
    selected,
    placed,
    turn,
    yaw: placed.yaw,
    message: `${placeableName(item)} placed`,
    action: `${item}:placed:hex face ${turn + 1}:placement face ${placementTurn + 1}`,
  };
}

export function relocateStructureCommand(input: StructureRelocateCommandInput): StructureCommandResult {
  const { target, tile, layer, yaw } = input;
  if (!target) {
    return {
      ok: false,
      command: 'relocate',
      message: 'no nearby prop to move',
      action: 'relocate:none',
    };
  }
  if (Math.trunc(tile) === Math.trunc(input.playerTile)) {
    return {
      ok: false,
      command: 'relocate',
      item: target.item,
      id: target.id,
      fromTile: target.tile,
      fromLayer: target.layer,
      toTile: Math.trunc(tile),
      toLayer: Math.trunc(layer),
      message: 'step aside before moving here',
      action: `${target.item}:relocate:blocked:player`,
      blockers: ['player on snap target'],
    };
  }
  if (input.blocker) {
    return {
      ok: false,
      command: 'relocate',
      item: target.item,
      id: target.id,
      fromTile: target.tile,
      fromLayer: target.layer,
      toTile: Math.trunc(tile),
      toLayer: Math.trunc(layer),
      message: input.blocker,
      action: `${target.item}:relocate:blocked:${input.blocker}`,
      blockers: [input.blocker],
    };
  }
  const result = relocateStructure(input.structures, target.id, { tile, layer, yaw }, input.topology);
  return {
    ok: result.ok,
    command: 'relocate',
    item: result.item ?? target.item,
    id: result.id ?? target.id,
    fromTile: result.fromTile ?? target.tile,
    fromLayer: result.fromLayer ?? target.layer,
    toTile: result.toTile,
    toLayer: result.toLayer,
    turn: result.turn,
    yaw: result.yaw,
    message: result.message,
    action: `${target.item}:relocate:${result.message}`,
    blockers: result.blockers,
    relocation: result,
  };
}

export function previewRelocateStructureCommand(input: StructureRelocatePreviewInput): StructureSnapPreview | null {
  const target = input.target;
  if (!target) return null;
  const toTile = Math.trunc(input.tile);
  const toLayer = Math.trunc(input.layer);
  const yaw = Number.isFinite(input.yaw) ? input.yaw! : target.yaw;
  const turn = structureYawTurn(yaw);
  const base = {
    active: true,
    mode: 'relocate' as const,
    item: target.item,
    id: target.id,
    tile: toTile,
    layer: toLayer,
    yaw,
    turn,
    fromTile: target.tile,
    fromLayer: target.layer,
    socket: structureSocketSpec(target.item),
  };
  if (toTile < 0 || toLayer < 0) {
    return { ...base, ok: false, message: `${placeableName(target.item).toLowerCase()} cannot be moved there`, blocker: 'invalid snap target', blockers: ['invalid snap target'] };
  }
  const dismantleBlockers = structureDismantleBlockers(target);
  if (dismantleBlockers.length > 0) {
    return { ...base, ok: false, message: `${placeableName(target.item).toLowerCase()} cannot be moved · ${dismantleBlockers[0]}`, blocker: dismantleBlockers[0], blockers: dismantleBlockers };
  }
  if (toTile === Math.trunc(input.playerTile)) {
    return { ...base, ok: false, message: 'step aside before moving here', blocker: 'player on snap target', blockers: ['player on snap target'] };
  }
  if (input.blocker) {
    return { ...base, ok: false, message: input.blocker, blocker: input.blocker, blockers: [input.blocker] };
  }
  const currentSocket = structureSocketPlacement(target);
  const nextSocket = structureSocketPlacementFor(target.item, yaw);
  const sameSocket = target.tile === toTile
    && target.layer === toLayer
    && currentSocket.occupies.length === nextSocket.occupies.length
    && currentSocket.occupies.every((slot, index) => slot === nextSocket.occupies[index]);
  if (sameSocket) {
    return { ...base, ok: false, message: `${placeableName(target.item).toLowerCase()} already on that snap hex`, blocker: 'same snap target', blockers: ['same snap target'] };
  }
  const occupancyBlocker = structurePlacementBlocker(input.structures, { item: target.item, tile: toTile, yaw }, target.id, input.topology);
  if (occupancyBlocker) {
    return {
      ...base,
      ok: false,
      message: placementBlockerMessage(target.item, occupancyBlocker),
      blocker: occupancyBlocker,
      blockers: [occupancyBlocker],
    };
  }
  return {
    ...base,
    ok: true,
    message: `${placeableName(target.item)} can move here`,
    blocker: null,
    blockers: [],
  };
}

export function packStructureCommand(
  structures: StructureSave[],
  target: StructureSave | null,
  craftedItems: InventoryItems,
  creative: boolean,
): StructureCommandResult {
  if (!target) {
    return {
      ok: false,
      command: 'pack',
      message: 'no nearby prop to pack',
      action: 'pack:none',
      selected: null,
    };
  }
  const result = dismantleStructure(structures, target.id);
  const action = `${target.item}:pack:${result.message}`;
  if (!result.ok || !result.item) {
    return {
      ok: false,
      command: 'pack',
      item: result.item ?? target.item,
      id: result.id ?? target.id,
      message: result.message,
      action,
      blockers: result.blockers,
    };
  }
  if (!creative) {
    craftedItems[result.item] = Math.max(0, Math.trunc(craftedItems[result.item] ?? 0) + 1);
  }
  return {
    ok: true,
    command: 'pack',
    item: result.item,
    id: result.id,
    message: result.message,
    action,
    selected: creative ? null : result.item,
    inventoryReturned: !creative,
  };
}

export function structureModeTouchesFood(mode?: StructureInteractionResult['mode']): boolean {
  return mode === 'cook';
}

export function useStructureInteractionCommand(input: StructureUseCommandInput): StructureCommandResult {
  const target = input.target;
  if (!target) {
    return {
      ok: false,
      command: 'use',
      message: 'no nearby prop to use',
      action: 'none',
    };
  }
  const interaction = interactStructure(
    input.structures,
    target.id,
    input.materialCounts,
    input.craftedItems,
    input.topology,
    input.waystoneContext,
    input.weatherVaneContext,
    input.rainCisternContext,
    input.fishTrapContext,
  );
  const action = `${target.item}:${interaction.mode ?? 'none'}:${interaction.message}`;
  return {
    ok: interaction.ok,
    command: 'use',
    item: target.item,
    id: target.id,
    message: interaction.message,
    action,
    mode: interaction.mode,
    interaction,
    foodAction: structureModeTouchesFood(interaction.mode) ? action : undefined,
  };
}
