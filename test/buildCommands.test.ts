import { describe, expect, it } from 'vitest';
import {
  normalizePlacementTurn,
  packStructureCommand,
  placeStructureCommand,
  previewPlaceStructureCommand,
  previewRelocateStructureCommand,
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
    expect(placeStructureCommand({
      structures,
      item: 'doorKit',
      tile: 11,
      layer: 2,
      yaw: 0,
      placementTurn: 0,
      materialCounts: materials,
      craftedItems: crafted,
      creative: false,
      playerTile: 4,
      blocker: 'native life on snap target: brambleback',
    })).toMatchObject({
      ok: false,
      command: 'place',
      action: 'doorKit:place:blocked:native life on snap target: brambleback',
      blockers: ['native life on snap target: brambleback'],
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

  it('previews snap placement and relocation blockers without mutating structures or inventory', () => {
    const materials = [0, 0, 0, 0, 0];
    const crafted: InventoryItems = { doorKit: 1, windowFrame: 1 };
    const structures: StructureSave[] = [];
    const door = addStructure(structures, { item: 'doorKit', tile: 6, layer: 2, yaw: 0 })!;
    const windowFrame = addStructure(structures, { item: 'windowFrame', tile: 9, layer: 2, yaw: 0 })!;

    expect(previewPlaceStructureCommand({
      structures,
      item: 'windowFrame',
      tile: 7,
      layer: 2,
      yaw: 0,
      placementTurn: 0,
      materialCounts: materials,
      craftedItems: crafted,
      creative: false,
      playerTile: 4,
    })).toMatchObject({
      active: true,
      mode: 'place',
      ok: true,
      item: 'windowFrame',
      tile: 7,
      blocker: null,
      blockers: [],
      socket: { role: 'wall-light', modularKit: true },
    });
    expect(crafted.windowFrame).toBe(1);
    expect(structures.map((s) => s.tile)).toEqual([6, 9]);

    expect(previewPlaceStructureCommand({
      structures,
      item: 'windowFrame',
      tile: 4,
      layer: 2,
      yaw: 0,
      placementTurn: 0,
      materialCounts: materials,
      craftedItems: crafted,
      creative: false,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      message: 'step aside before placing here',
      blocker: 'player on snap target',
      blockers: ['player on snap target'],
    });
    expect(previewPlaceStructureCommand({
      structures,
      item: 'windowFrame',
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
      message: 'that hex already has a prop',
      blocker: 'occupied snap target',
      blockers: ['occupied snap target'],
    });
    expect(previewPlaceStructureCommand({
      structures,
      item: 'windowFrame',
      tile: 8,
      layer: 2,
      yaw: 0,
      placementTurn: 0,
      materialCounts: materials,
      craftedItems: crafted,
      creative: false,
      playerTile: 4,
      blocker: 'needs solid ground',
    })).toMatchObject({
      ok: false,
      message: 'needs solid ground',
      blocker: 'needs solid ground',
      blockers: ['needs solid ground'],
    });

    expect(previewRelocateStructureCommand({
      structures,
      target: door,
      tile: 8,
      layer: 3,
      yaw: Math.PI / 3,
      playerTile: 4,
    })).toMatchObject({
      active: true,
      mode: 'relocate',
      ok: true,
      item: 'doorKit',
      id: door.id,
      fromTile: 6,
      tile: 8,
      layer: 3,
      turn: 1,
      blocker: null,
      socket: { role: 'wall-opening', modularKit: true },
    });
    expect(previewRelocateStructureCommand({
      structures,
      target: door,
      tile: 4,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      message: 'step aside before moving here',
      blocker: 'player on snap target',
      blockers: ['player on snap target'],
    });
    expect(previewRelocateStructureCommand({
      structures,
      target: door,
      tile: 9,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      message: 'that hex already has a prop',
      blocker: 'occupied snap target',
      blockers: ['occupied snap target'],
    });
    expect(previewRelocateStructureCommand({
      structures,
      target: door,
      tile: 6,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      message: 'door kit already on that snap hex',
      blocker: 'same snap target',
      blockers: ['same snap target'],
    });
    expect(previewRelocateStructureCommand({
      structures,
      target: windowFrame,
      tile: 8,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: true,
    });
    const litFire = addStructure(structures, { item: 'campfire', tile: 10, layer: 2, yaw: 0 })!;
    litFire.state = { lit: true };
    expect(previewRelocateStructureCommand({
      structures,
      target: litFire,
      tile: 11,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      blocker: 'douse light first',
      blockers: ['douse light first'],
    });
    expect(structures.find((s) => s.id === door.id)).toMatchObject({ tile: 6, layer: 2 });
  });

  it('uses the wall-shell socket contract for new procedural house pieces', () => {
    const materials = [0, 0, 0, 0, 0];
    const crafted: InventoryItems = { wallPanel: 1, floorFoundation: 1, wallHalfRail: 1 };
    const structures: StructureSave[] = [];

    expect(selectStructurePlacementCommand(materials, crafted, 'wallPanel')).toMatchObject({
      ok: true,
      action: 'wallPanel:select',
      selected: 'wallPanel',
    });
    expect(previewPlaceStructureCommand({
      structures,
      item: 'wallPanel',
      tile: 12,
      layer: 2,
      yaw: Math.PI / 3,
      placementTurn: 1,
      materialCounts: materials,
      craftedItems: crafted,
      creative: false,
      playerTile: 4,
    })).toMatchObject({
      active: true,
      ok: true,
      item: 'wallPanel',
      socket: { role: 'wall-panel', collider: 'thin-wall', modularKit: true },
    });

    const placed = placeStructureCommand({
      structures,
      item: 'wallPanel',
      tile: 12,
      layer: 2,
      yaw: Math.PI / 3,
      placementTurn: 1,
      materialCounts: materials,
      craftedItems: crafted,
      creative: false,
      playerTile: 4,
    });
    expect(placed).toMatchObject({
      ok: true,
      item: 'wallPanel',
      selected: null,
      action: 'wallPanel:placed:hex face 2:placement face 2',
    });
    expect(crafted.wallPanel).toBeUndefined();
    expect(previewRelocateStructureCommand({
      structures,
      target: placed.placed!,
      tile: 13,
      layer: 2,
      yaw: Math.PI * 2 / 3,
      playerTile: 4,
    })).toMatchObject({
      ok: true,
      item: 'wallPanel',
      socket: { role: 'wall-panel', collider: 'thin-wall' },
      turn: 2,
    });

    const moved = relocateStructureCommand({
      structures,
      target: placed.placed!,
      tile: 13,
      layer: 2,
      yaw: Math.PI * 2 / 3,
      playerTile: 4,
    });
    expect(moved).toMatchObject({
      ok: true,
      item: 'wallPanel',
      toTile: 13,
      turn: 2,
      action: 'wallPanel:relocate:moved wall panel to snap hex',
    });
    expect(packStructureCommand(structures, placed.placed!, crafted, false)).toMatchObject({
      ok: true,
      item: 'wallPanel',
      selected: 'wallPanel',
      action: 'wallPanel:pack:packed wall panel',
    });
    expect(crafted.wallPanel).toBe(1);
  });

  it('uses integrated wall-shell sockets in generic build commands', () => {
    const materials = [0, 0, 0, 0, 0];
    const crafted: InventoryItems = { wallDoorPanel: 1, wallWindowPanel: 1, wallCorner: 1, roofJoin: 1 };
    const structures: StructureSave[] = [];
    const cases: Array<{ item: 'wallDoorPanel' | 'wallWindowPanel' | 'wallCorner' | 'roofJoin'; role: string; tile: number }> = [
      { item: 'wallDoorPanel', role: 'wall-opening', tile: 20 },
      { item: 'wallWindowPanel', role: 'wall-light', tile: 21 },
      { item: 'wallCorner', role: 'wall-corner', tile: 22 },
      { item: 'roofJoin', role: 'roof-join', tile: 23 },
    ];

    for (const [index, testCase] of cases.entries()) {
      expect(selectStructurePlacementCommand(materials, crafted, testCase.item)).toMatchObject({
        ok: true,
        selected: testCase.item,
      });
      expect(previewPlaceStructureCommand({
        structures,
        item: testCase.item,
        tile: testCase.tile,
        layer: 2,
        yaw: index * Math.PI / 3,
        placementTurn: index,
        materialCounts: materials,
        craftedItems: crafted,
        creative: false,
        playerTile: 4,
      })).toMatchObject({
        active: true,
        ok: true,
        item: testCase.item,
        socket: { role: testCase.role, modularKit: true },
      });
      const placed = placeStructureCommand({
        structures,
        item: testCase.item,
        tile: testCase.tile,
        layer: 2,
        yaw: index * Math.PI / 3,
        placementTurn: index,
        materialCounts: materials,
        craftedItems: crafted,
        creative: false,
        playerTile: 4,
      });
      expect(placed).toMatchObject({ ok: true, item: testCase.item, selected: null });
      expect(packStructureCommand(structures, placed.placed!, crafted, false)).toMatchObject({
        ok: true,
        item: testCase.item,
        selected: testCase.item,
      });
      expect(crafted[testCase.item]).toBe(1);
    }
  });
});
