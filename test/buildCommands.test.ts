import { describe, expect, it } from 'vitest';
import {
  normalizePlacementTurn,
  packStructureCommand,
  placeStructureCommand,
  relocateStructureCommand,
  rotatePlacedStructureCommand,
  rotateSelectedPlacementCommand,
  selectStructurePlacementCommand,
  useStructureInteractionCommand,
} from '../src/sim/buildCommands';
import { addStructure, type StructureSave } from '../src/sim/structures';
import type { InventoryItems } from '../src/sim/crafting';

describe('Hearth and Horizon build commands', () => {
  it('returns explicit command results for select, rotate, place, use, and pack', () => {
    const materials = [0, 0, 0, 0, 0];
    const crafted: InventoryItems = { doorKit: 2, campfire: 1 };
    const structures: StructureSave[] = [];

    expect(normalizePlacementTurn(-1)).toBe(5);
    expect(selectStructurePlacementCommand(materials, crafted, 'missing')).toMatchObject({
      ok: false,
      command: 'selectPlacement',
      action: 'select:invalid',
      selected: null,
    });
    expect(selectStructurePlacementCommand(materials, {}, 'doorKit')).toMatchObject({
      ok: false,
      command: 'selectPlacement',
      action: 'doorKit:select:missing',
      message: 'craft door kit first',
    });

    const selected = selectStructurePlacementCommand(materials, crafted, 'doorKit');
    expect(selected).toMatchObject({ ok: true, action: 'doorKit:select', selected: 'doorKit' });
    expect(rotateSelectedPlacementCommand(null, 0, 1)).toMatchObject({
      ok: false,
      command: 'rotatePlacement',
      action: 'placement-rotate:none',
    });
    const placementTurn = rotateSelectedPlacementCommand('doorKit', 0, 2);
    expect(placementTurn).toMatchObject({
      ok: true,
      command: 'rotatePlacement',
      action: 'doorKit:placement-rotate:hex face 3',
      turn: 2,
    });

    expect(placeStructureCommand({
      structures,
      item: 'doorKit',
      tile: 4,
      layer: 2,
      yaw: placementTurn.yaw!,
      placementTurn: placementTurn.turn!,
      materialCounts: materials,
      craftedItems: crafted,
      creative: false,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      command: 'place',
      action: 'doorKit:place:blocked:player',
      message: 'step aside before placing here',
    });

    const placed = placeStructureCommand({
      structures,
      item: 'doorKit',
      tile: 6,
      layer: 2,
      yaw: placementTurn.yaw!,
      placementTurn: placementTurn.turn!,
      materialCounts: materials,
      craftedItems: crafted,
      creative: false,
      playerTile: 4,
    });
    expect(placed).toMatchObject({
      ok: true,
      command: 'place',
      item: 'doorKit',
      selected: 'doorKit',
      turn: 2,
      action: 'doorKit:placed:hex face 3:placement face 3',
    });
    expect(placed.placed).toMatchObject({ item: 'doorKit', tile: 6, layer: 2 });
    expect(crafted.doorKit).toBe(1);
    expect(placeStructureCommand({
      structures,
      item: 'doorKit',
      tile: 6,
      layer: 2,
      yaw: 0,
      placementTurn: 0,
      materialCounts: materials,
      craftedItems: crafted,
      creative: false,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      command: 'place',
      action: 'doorKit:place:blocked:occupied',
      message: 'that hex already has a prop',
    });

    expect(rotatePlacedStructureCommand(structures, null, 1)).toMatchObject({
      ok: false,
      command: 'rotatePlaced',
      action: 'rotate:none',
    });
    expect(relocateStructureCommand({
      structures,
      target: null,
      tile: 8,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      command: 'relocate',
      action: 'relocate:none',
      message: 'no nearby prop to move',
    });
    expect(rotatePlacedStructureCommand(structures, placed.placed!, -1)).toMatchObject({
      ok: true,
      command: 'rotatePlaced',
      item: 'doorKit',
      turn: 1,
      action: 'doorKit:rotate:rotated door kit to hex face 2',
    });

    addStructure(structures, { item: 'windowFrame', tile: 9, layer: 2, yaw: 0 });
    expect(relocateStructureCommand({
      structures,
      target: placed.placed!,
      tile: 4,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      command: 'relocate',
      item: 'doorKit',
      id: placed.placed!.id,
      fromTile: 6,
      toTile: 4,
      action: 'doorKit:relocate:blocked:player',
      blockers: ['player on snap target'],
    });
    expect(relocateStructureCommand({
      structures,
      target: placed.placed!,
      tile: 7,
      layer: 2,
      playerTile: 4,
      blocker: 'needs solid ground',
    })).toMatchObject({
      ok: false,
      command: 'relocate',
      item: 'doorKit',
      id: placed.placed!.id,
      fromTile: 6,
      toTile: 7,
      action: 'doorKit:relocate:blocked:needs solid ground',
      blockers: ['needs solid ground'],
    });
    expect(relocateStructureCommand({
      structures,
      target: placed.placed!,
      tile: 9,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      command: 'relocate',
      item: 'doorKit',
      id: placed.placed!.id,
      fromTile: 6,
      toTile: 9,
      action: 'doorKit:relocate:that hex already has a prop',
      blockers: ['occupied snap target'],
    });
    expect(relocateStructureCommand({
      structures,
      target: placed.placed!,
      tile: 6,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      command: 'relocate',
      item: 'doorKit',
      id: placed.placed!.id,
      fromTile: 6,
      toTile: 6,
      action: 'doorKit:relocate:door kit already on that snap hex',
      blockers: ['same snap target'],
    });
    expect(relocateStructureCommand({
      structures,
      target: placed.placed!,
      tile: 8,
      layer: 3,
      playerTile: 4,
    })).toMatchObject({
      ok: true,
      command: 'relocate',
      item: 'doorKit',
      id: placed.placed!.id,
      fromTile: 6,
      fromLayer: 2,
      toTile: 8,
      toLayer: 3,
      turn: 1,
      action: 'doorKit:relocate:moved door kit to snap hex',
    });
    expect(placed.placed).toMatchObject({ tile: 8, layer: 3 });

    const packed = packStructureCommand(structures, placed.placed!, crafted, false);
    expect(packed).toMatchObject({
      ok: true,
      command: 'pack',
      item: 'doorKit',
      selected: 'doorKit',
      inventoryReturned: true,
      action: 'doorKit:pack:packed door kit',
    });
    expect(crafted.doorKit).toBe(2);
    expect(packStructureCommand(structures, null, crafted, false)).toMatchObject({
      ok: false,
      command: 'pack',
      action: 'pack:none',
      message: 'no nearby prop to pack',
    });

    const fire = addStructure(structures, { item: 'campfire', tile: 10, layer: 2, yaw: 0 })!;
    const useFire = useStructureInteractionCommand({
      structures,
      target: fire,
      materialCounts: materials,
      craftedItems: crafted,
    });
    expect(useFire).toMatchObject({
      ok: true,
      command: 'use',
      item: 'campfire',
      mode: 'lit',
      action: 'campfire:lit:campfire lit',
    });
    expect(packStructureCommand(structures, fire, crafted, false)).toMatchObject({
      ok: false,
      command: 'pack',
      blockers: ['douse light first'],
      action: 'campfire:pack:campfire cannot be packed · douse light first',
    });
  });
});
