import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { StructureRenderer, type StructureSnapPreview } from '../src/render/structures';
import { structureSocketSpec, type StructureSave } from '../src/sim/structures';
import { buildLayers } from '../src/world/layers';

function meshNames(renderer: StructureRenderer): Set<string> {
  const names = new Set<string>();
  renderer.group.traverse((part) => {
    if ((part as THREE.Mesh).isMesh) names.add(part.name);
  });
  return names;
}

function namedObject(renderer: StructureRenderer, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  renderer.group.traverse((part) => {
    if (part.name === name) found = part;
  });
  return found;
}

function previewObject(renderer: StructureRenderer, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  renderer.snapPreviewGroup.traverse((part) => {
    if (part.name === name) found = part;
  });
  return found;
}

describe('structure renderer asset readability', () => {
  it('renders distinct procedural bodies for the four surviving core props', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const structures: StructureSave[] = [
      { id: 1, item: 'workbench', tile: 1, layer: 100, yaw: 0 },
      { id: 2, item: 'campfire', tile: 2, layer: 100, yaw: 0, state: { lit: true } },
      { id: 3, item: 'chest', tile: 3, layer: 100, yaw: 0, state: { storage: { wood: 2 } } },
      { id: 4, item: 'bedroll', tile: 4, layer: 100, yaw: 0, state: { home: true } },
    ];

    renderer.setStructures(structures);
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 0.5);
    const stats = renderer.stats();

    expect(stats.groups).toBe(4);
    expect(stats.meshes).toBeGreaterThan(10);
    const names = meshNames(renderer);
    expect(names).toContain('benchTop');
    expect(names).toContain('fireRingStone');
    expect(names).toContain('chestBox');
    expect(names).toContain('sleepMat');
    expect(namedObject(renderer, 'flameCore')?.visible).toBe(true);
    expect(namedObject(renderer, 'frontLatch')?.visible).toBe(true);
    expect(namedObject(renderer, 'homeMarker')?.visible).toBe(true);
  });

  it('renders functional camp warmth and comfort signals from the shelter report', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const homeTile = Array.from({ length: geo.count }, (_, tile) => tile).find((tile) => geo.degreeOf(tile) >= 6);
    if (homeTile === undefined) throw new Error('test Goldberg lacks a six-neighbor home tile');
    const local = Array.from({ length: geo.degreeOf(homeTile) }, (_, edge) => geo.neighbor(homeTile, edge));
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: homeTile, layer: 100, yaw: 0, state: { home: true } },
      { id: 2, item: 'campfire', tile: local[0], layer: 100, yaw: 0, state: { lit: true } },
      { id: 3, item: 'workbench', tile: local[1], layer: 100, yaw: 0 },
      { id: 4, item: 'chest', tile: local[2], layer: 100, yaw: 0 },
    ];

    renderer.setStructures(structures);
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 1.25);
    const stats = renderer.stats();

    expect(namedObject(renderer, 'homeComfortRing')?.visible).toBe(true);
    expect(namedObject(renderer, 'hearthWarmthHalo')?.visible).toBe(true);
    expect(stats.homeComfortSignals).toBeGreaterThanOrEqual(2);
    expect(stats.homeComfort).toMatchObject({
      visibleWarmthMeshes: 2,
      visibleHomeMarkers: 1,
      visibleSmokePuffs: 6,
      litCampfires: 1,
    });
  });

  it('renders valid and blocked snap previews without adding saved structure groups', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const structures: StructureSave[] = [
      { id: 1, item: 'workbench', tile: 1, layer: 100, yaw: 0 },
    ];

    renderer.setStructures(structures);
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 1);
    const chestPreview: StructureSnapPreview = {
      active: true,
      mode: 'place',
      ok: true,
      item: 'chest',
      tile: 2,
      layer: 100,
      yaw: Math.PI / 3,
      turn: 1,
      message: 'Chest can snap here',
      blocker: null,
      blockers: [],
      socket: structureSocketSpec('chest'),
    };
    renderer.updateSnapPreview(chestPreview, geo, layers, { x: 0, y: 0, z: 0 }, 1.1);

    expect(renderer.stats()).toMatchObject({
      groups: 1,
      snapPreview: {
        active: true,
        ok: true,
        mode: 'place',
        item: 'chest',
        tile: 2,
        blocker: null,
      },
    });
    expect(renderer.stats().snapPreview.meshes).toBeGreaterThan(2);
    expect(previewObject(renderer, 'snapPreviewFootprint')?.visible).toBe(true);
    expect(previewObject(renderer, 'snapPreviewBlockerA')?.visible).toBe(false);

    const blockedPreview: StructureSnapPreview = {
      active: true,
      mode: 'relocate',
      ok: false,
      item: 'workbench',
      id: 1,
      tile: 1,
      layer: 100,
      yaw: 0,
      turn: 0,
      fromTile: 1,
      fromLayer: 100,
      message: 'workbench already on that snap hex',
      blocker: 'same snap target',
      blockers: ['same snap target'],
      socket: structureSocketSpec('workbench'),
    };
    renderer.updateSnapPreview(blockedPreview, geo, layers, { x: 0, y: 0, z: 0 }, 1.2);

    expect(renderer.stats()).toMatchObject({
      groups: 1,
      snapPreview: {
        active: true,
        ok: false,
        mode: 'relocate',
        item: 'workbench',
        tile: 1,
        blocker: 'same snap target',
      },
    });
    expect(previewObject(renderer, 'snapPreviewBlockerA')?.visible).toBe(true);
    expect(previewObject(renderer, 'snapPreviewBlockerB')?.visible).toBe(true);

    renderer.updateSnapPreview(null, geo, layers, { x: 0, y: 0, z: 0 }, 1.3);
    expect(renderer.stats().snapPreview.active).toBe(false);
    expect(renderer.stats().groups).toBe(1);
  });

  it('renders distinct procedural bodies for the nine restored utility and waterline props', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const structures: StructureSave[] = [
      { id: 1, item: 'rainCistern', tile: 1, layer: 100, yaw: 0, state: { water: 2 } },
      { id: 2, item: 'rootCellar', tile: 2, layer: 100, yaw: 0, state: { provisions: 2 } },
      { id: 3, item: 'dockSegment', tile: 3, layer: 100, yaw: 0 },
      { id: 4, item: 'fishTrap', tile: 4, layer: 100, yaw: 0, state: { trapSetDay: 1, trapSetMinute: 0, trapBaited: true } },
      { id: 5, item: 'shoreNet', tile: 5, layer: 100, yaw: 0, state: { netSetDay: 1, netSetMinute: 0 } },
      { id: 6, item: 'dryingRack', tile: 6, layer: 100, yaw: 0, state: { preserves: 1 } },
      { id: 7, item: 'weatherVane', tile: 7, layer: 100, yaw: 0, state: { forecastReads: 1, forecastKind: 'storm' } },
      { id: 8, item: 'lantern', tile: 8, layer: 100, yaw: 0, state: { lit: true } },
      { id: 9, item: 'waystone', tile: 9, layer: 100, yaw: 0, state: { waystone: 'shore' } },
    ];

    renderer.setStructures(structures);
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 0.5);
    const stats = renderer.stats();

    expect(stats.groups).toBe(9);
    const names = meshNames(renderer);
    for (const name of [
      'rainCisternBarrel', 'rootCellarStoneLip', 'dockDeckPlank', 'fishTrapSkid', 'shoreNetFootRail',
      'dryingRackRail', 'weatherVaneCompassDisk', 'lanternCage', 'waystoneBase',
    ]) {
      expect(names).toContain(name);
    }

    expect(namedObject(renderer, 'rainCisternWater')?.visible).toBe(true);
    expect(namedObject(renderer, 'rootCellarCoolGlow')?.visible).toBe(true);
    expect(namedObject(renderer, 'fishTrapBait')?.visible).toBe(true);
    expect(namedObject(renderer, 'fishTrapFloat')?.visible).toBe(true);
    expect(namedObject(renderer, 'shoreNetFloat')).toBeTruthy();
    expect(namedObject(renderer, 'dryingFood')?.visible).toBe(true);
    expect(namedObject(renderer, 'weatherVaneStormGlow')?.visible).toBe(true);
    expect(namedObject(renderer, 'lanternGlow')?.visible).toBe(true);
    expect(namedObject(renderer, 'waystoneGlyph-shore')?.visible).toBe(true);
    expect(namedObject(renderer, 'waystoneGlyph-home')?.visible).toBe(false);
  });
});
