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
    const crafted: InventoryItems = { chest: 2, campfire: 1 };
    const structures: StructureSave[] = [];

    expect(normalizePlacementTurn(-1)).toBe(5);
    expect(selectStructurePlacementCommand(materials, crafted, 'missing')).toMatchObject({
      ok: false,
      command: 'selectPlacement',
      action: 'select:invalid',
      selected: null,
    });
    expect(selectStructurePlacementCommand(materials, {}, 'chest')).toMatchObject({
      ok: false,
      command: 'selectPlacement',
      action: 'chest:select:missing',
      message: 'craft chest first',
    });

    const selected = selectStructurePlacementCommand(materials, crafted, 'chest');
    expect(selected).toMatchObject({ ok: true, action: 'chest:select', selected: 'chest' });
    expect(rotateSelectedPlacementCommand(null, 0, 1)).toMatchObject({
      ok: false,
      command: 'rotatePlacement',
      action: 'placement-rotate:none',
    });
    const placementTurn = rotateSelectedPlacementCommand('chest', 0, 2);
    expect(placementTurn).toMatchObject({
      ok: true,
      command: 'rotatePlacement',
      action: 'chest:placement-rotate:hex face 3',
      turn: 2,
    });

    expect(placeStructureCommand({
      structures,
      item: 'chest',
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
      action: 'chest:place:blocked:player',
      message: 'step aside before placing here',
    });

    const placed = placeStructureCommand({
      structures,
      item: 'chest',
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
      item: 'chest',
      selected: 'chest',
      turn: 2,
      action: 'chest:placed:hex face 3:placement face 3',
    });
    expect(placed.placed).toMatchObject({ item: 'chest', tile: 6, layer: 2 });
    expect(crafted.chest).toBe(1);
    expect(placeStructureCommand({
      structures,
      item: 'chest',
      tile: 6,
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
      action: 'chest:place:blocked:occupied snap target',
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
      item: 'chest',
      turn: 1,
      action: 'chest:rotate:rotated chest to hex face 2',
    });

    addStructure(structures, { item: 'workbench', tile: 9, layer: 2, yaw: 0 });
    expect(relocateStructureCommand({
      structures,
      target: placed.placed!,
      tile: 4,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      command: 'relocate',
      item: 'chest',
      id: placed.placed!.id,
      fromTile: 6,
      toTile: 4,
      action: 'chest:relocate:blocked:player',
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
      item: 'chest',
      id: placed.placed!.id,
      fromTile: 6,
      toTile: 7,
      action: 'chest:relocate:blocked:needs solid ground',
      blockers: ['needs solid ground'],
    });
    expect(placeStructureCommand({
      structures,
      item: 'chest',
      tile: 11,
      layer: 2,
      yaw: 0,
      placementTurn: 0,
      materialCounts: materials,
      craftedItems: crafted,
      creative: false,
      playerTile: 4,
      blocker: 'obstruction on snap target',
    })).toMatchObject({
      ok: false,
      command: 'place',
      action: 'chest:place:blocked:obstruction on snap target',
      blockers: ['obstruction on snap target'],
    });
    expect(relocateStructureCommand({
      structures,
      target: placed.placed!,
      tile: 9,
      layer: 2,
      yaw: 0,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      command: 'relocate',
      item: 'chest',
      id: placed.placed!.id,
      fromTile: 6,
      toTile: 9,
      action: 'chest:relocate:that hex already has a prop',
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
      item: 'chest',
      id: placed.placed!.id,
      fromTile: 6,
      toTile: 6,
      action: 'chest:relocate:chest already on that snap hex',
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
      item: 'chest',
      id: placed.placed!.id,
      fromTile: 6,
      fromLayer: 2,
      toTile: 8,
      toLayer: 3,
      turn: 1,
      action: 'chest:relocate:moved chest to snap hex',
    });
    expect(placed.placed).toMatchObject({ tile: 8, layer: 3 });

    const packed = packStructureCommand(structures, placed.placed!, crafted, false);
    expect(packed).toMatchObject({
      ok: true,
      command: 'pack',
      item: 'chest',
      selected: 'chest',
      inventoryReturned: true,
      action: 'chest:pack:packed chest',
    });
    expect(crafted.chest).toBe(2);
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
    const crafted: InventoryItems = { chest: 1, workbench: 1 };
    const structures: StructureSave[] = [];
    const chest = addStructure(structures, { item: 'chest', tile: 6, layer: 2, yaw: 0 })!;
    const bench = addStructure(structures, { item: 'workbench', tile: 9, layer: 2, yaw: 0 })!;

    expect(previewPlaceStructureCommand({
      structures,
      item: 'workbench',
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
      item: 'workbench',
      tile: 7,
      blocker: null,
      blockers: [],
      socket: { role: 'crafting-station', modularKit: false },
    });
    expect(crafted.workbench).toBe(1);
    expect(structures.map((s) => s.tile)).toEqual([6, 9]);

    expect(previewPlaceStructureCommand({
      structures,
      item: 'workbench',
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
      item: 'workbench',
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
      item: 'workbench',
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
      target: chest,
      tile: 8,
      layer: 3,
      yaw: Math.PI / 3,
      playerTile: 4,
    })).toMatchObject({
      active: true,
      mode: 'relocate',
      ok: true,
      item: 'chest',
      id: chest.id,
      fromTile: 6,
      tile: 8,
      layer: 3,
      turn: 1,
      blocker: null,
      socket: { role: 'storage-station', modularKit: false },
    });
    expect(previewRelocateStructureCommand({
      structures,
      target: chest,
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
      target: chest,
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
      target: chest,
      tile: 6,
      layer: 2,
      playerTile: 4,
    })).toMatchObject({
      ok: false,
      message: 'chest already on that snap hex',
      blocker: 'same snap target',
      blockers: ['same snap target'],
    });
    expect(previewRelocateStructureCommand({
      structures,
      target: bench,
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
    expect(structures.find((s) => s.id === chest.id)).toMatchObject({ tile: 6, layer: 2 });
  });

  it('forwards waystone, weather vane, rain cistern, and fish trap contexts into the structure interaction', () => {
    const structures: StructureSave[] = [];
    const materials = [0, 0, 0, 0, 0];

    const stone = addStructure(structures, { item: 'waystone', tile: 12, layer: 2, yaw: 0 })!;
    expect(useStructureInteractionCommand({
      structures,
      target: stone,
      materialCounts: materials,
      waystoneContext: { home: true },
    })).toMatchObject({ ok: true, mode: 'mark', message: 'hearth waystone attuned · home route' });

    const vane = addStructure(structures, { item: 'weatherVane', tile: 13, layer: 2, yaw: 0 })!;
    expect(useStructureInteractionCommand({
      structures,
      target: vane,
      materialCounts: materials,
      weatherVaneContext: { kind: 'storm', label: 'storm front', intensity: 0.9 },
    })).toMatchObject({ ok: true, mode: 'forecast', message: 'weather vane reads storm front · storm timing marked' });

    const cistern = addStructure(structures, { item: 'rainCistern', tile: 14, layer: 2, yaw: 0 })!;
    expect(useStructureInteractionCommand({
      structures,
      target: cistern,
      materialCounts: materials,
      rainCisternContext: { kind: 'rain', label: 'rain', intensity: 0.6 },
    })).toMatchObject({ ok: true, mode: 'collectWater' });

    const trap = addStructure(structures, { item: 'fishTrap', tile: 15, layer: 2, yaw: 0 })!;
    const food: InventoryItems = {};
    expect(useStructureInteractionCommand({
      structures,
      target: trap,
      materialCounts: materials,
      craftedItems: food,
      fishTrapContext: {
        day: 1,
        minute: 0,
        nearWater: true,
        school: { kind: 'shore', label: 'shore run', strength: 0.4, catchCount: 1, baitUseful: false, usesBait: false, message: 'shore run' },
      },
    })).toMatchObject({ ok: true, mode: 'setTrap' });
  });
});
