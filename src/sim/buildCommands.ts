import { itemCount, type InventoryItems } from './crafting';
import {
  addStructure,
  dismantleStructure,
  interactStructure,
  isPlaceableItemId,
  placeableName,
  rotateStructure,
  spendPlacedItem,
  STRUCTURE_YAW_STEP,
  structureYawTurn,
  type CaveAnchorContext,
  type CropPlotEnvironment,
  type FishTrapContext,
  type PlaceableItemId,
  type RainCisternContext,
  type StructureInteractionResult,
  type StructureSave,
  type StructureTopology,
  type WaystoneContext,
  type WeatherVaneContext,
} from './structures';

export type StructureCommandKind = 'selectPlacement' | 'rotatePlacement' | 'rotatePlaced' | 'place' | 'pack' | 'use';

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
  placed?: StructureSave;
  interaction?: StructureInteractionResult;
  mode?: StructureInteractionResult['mode'];
  foodAction?: string;
  navigationAction?: string;
  caveAction?: string;
  inventoryReturned?: boolean;
  blockers?: string[];
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
}

export interface StructureUseCommandInput {
  structures: StructureSave[];
  target: StructureSave | null;
  materialCounts: number[];
  craftedItems?: InventoryItems;
  topology?: StructureTopology;
  cropEnvironment?: CropPlotEnvironment;
  waystoneContext?: WaystoneContext;
  weatherVaneContext?: WeatherVaneContext;
  rainCisternContext?: RainCisternContext;
  caveAnchorContext?: CaveAnchorContext;
  fishTrapContext?: FishTrapContext;
}

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
): StructureCommandResult {
  if (!target) {
    return {
      ok: false,
      command: 'rotatePlaced',
      message: 'no nearby prop to rotate',
      action: 'rotate:none',
    };
  }
  const result = rotateStructure(structures, target.id, turns);
  return {
    ok: result.ok,
    command: 'rotatePlaced',
    item: result.item ?? target.item,
    id: result.id ?? target.id,
    turn: result.turn,
    yaw: result.yaw,
    message: result.message,
    action: `${target.item}:rotate:${result.message}`,
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
    };
  }
  const placed = addStructure(structures, { item, tile, layer, yaw });
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
  return mode === 'plant'
    || mode === 'plantReeds'
    || mode === 'tend'
    || mode === 'harvest'
    || mode === 'fertilize'
    || mode === 'irrigate'
    || mode === 'compost'
    || mode === 'collectWater'
    || mode === 'cache'
    || mode === 'withdrawProvision'
    || mode === 'cook'
    || mode === 'preserve'
    || mode === 'setTrap'
    || mode === 'checkTrap'
    || mode === 'collectTrap'
    || mode === 'setNet'
    || mode === 'checkNet'
    || mode === 'collectNet';
}

export function structureModeTouchesNavigation(mode?: StructureInteractionResult['mode']): boolean {
  return mode === 'forecast' || mode === 'anchor';
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
    input.cropEnvironment,
    input.waystoneContext,
    input.weatherVaneContext,
    input.rainCisternContext,
    input.caveAnchorContext,
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
    navigationAction: structureModeTouchesNavigation(interaction.mode) ? action : undefined,
    caveAction: interaction.mode === 'anchor' ? action : undefined,
  };
}
