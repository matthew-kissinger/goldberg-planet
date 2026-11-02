import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { buildCampStation } from '../src/render/campKit';
import { StructureRenderer } from '../src/render/structures';
import { ResourceDropRenderer } from '../src/render/resourceDrops';
import { FallingTreeRenderer } from '../src/render/fallingTrees';
import { ITEM_DEFS } from '../src/sim/crafting';
import { StructureStore, type StructureKind } from '../src/sim/persistence';
import { habitatDirection, HABITAT_FORWARD } from '../src/world/expeditionHabitat';
import type { TreeParams } from '../src/world/trees';
import type { ResourceDropSave } from '../src/sim/resourceDrops';

const kinds: StructureKind[] = ['campfire', 'workbench', 'furnace', 'storage_chest', 'solar_relay', 'extractor', 'synthesizer', 'mass_driver', 'landing_pad', 'eco_dome'];
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse((part) => { if ((part as THREE.Mesh).isMesh) result.push(part as THREE.Mesh); });
  return result;
}
function resource(id: number, item: ResourceDropSave['item'] = 'wood', count = 2): ResourceDropSave {
  return { id, item, count, tile: 5, offsetA: 0, offsetB: 0, groundRadius: 904, age: 2 };
}

describe('expedition camp assets', () => {
  it('grounds all station models, bounds small stations to their plot and gives old aliases distinct geometry', () => {
    const signatures = new Set<string>();
    for (const kind of kinds) {
      const asset = buildCampStation(kind);
      const p = asset.geometry.getAttribute('position'), colors = asset.geometry.getAttribute('color');
      expect(asset.geometry.boundingBox!.min.y, kind).toBeCloseTo(0, 5);
      expect(colors.count).toBe(p.count);
      expect(p.count / 3, kind).toBeLessThan(1800);
      for (let i = 0; i < p.count; i++) {
        expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
        if (kind !== 'landing_pad' && kind !== 'eco_dome') expect(Math.hypot(p.getX(i), p.getZ(i)), kind).toBeLessThan(0.86);
      }
      signatures.add(`${p.count}:${asset.geometry.boundingBox!.max.toArray().join(',')}`);
      asset.geometry.dispose(); asset.animation?.geometry.dispose();
    }
    expect(signatures.size).toBe(kinds.length);
  });

  it('shares station geometry across instances and previews, with at most three opaque meshes per station', () => {
    const renderer = new StructureRenderer(new THREE.Scene()), geo = new Goldberg(4), store = new StructureStore();
    for (const kind of kinds) for (let i = 0; i < 2; i++) store.place({ planetId: 'home', kind, anchorTile: i, groundRadius: 904 });
    renderer.update(geo, store.list('home'), [], 0, 0, 0, 0);
    for (const kind of kinds) {
      const instances = renderer.group.children.filter((obj) => obj.userData.kind === kind);
      expect(instances).toHaveLength(2);
      const body = instances[0].getObjectByName('stationBody') as THREE.Mesh;
      expect((instances[1].getObjectByName('stationBody') as THREE.Mesh).geometry).toBe(body.geometry);
      for (const mesh of meshes(instances[0])) expect((mesh.material as THREE.Material).transparent).toBe(false);
      expect(meshes(instances[0]).length).toBeLessThanOrEqual(3);
      renderer.updatePreview(geo, kind, 3, 0, 0, 904, 0.7, 0, 0, 0);
      const preview = renderer.group.getObjectByName('stationPlacementPreview')!;
      expect((preview.getObjectByName('stationBody') as THREE.Mesh).geometry).toBe(body.geometry);
      expect(preview.quaternion.length()).toBeCloseTo(1);
    }
    const body = renderer.group.getObjectByName('stationBody') as THREE.Mesh;
    const dispose = vi.spyOn(body.geometry, 'dispose');
    renderer.update(geo, [], [], 0, 0, 0, 0);
    expect(dispose).not.toHaveBeenCalled();
    renderer.dispose(); renderer.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps different cargo item colors independent across shared station models', () => {
    const renderer = new StructureRenderer(new THREE.Scene()), geo = new Goldberg(4), store = new StructureStore();
    const a = store.place({ planetId: 'home', kind: 'storage_chest', anchorTile: 0, groundRadius: 904, storedCount: 2, outputItem: 'wood' });
    const b = store.place({ planetId: 'home', kind: 'storage_chest', anchorTile: 1, groundRadius: 904, storedCount: 2, outputItem: 'crystal' });
    renderer.update(geo, [a, b], [], 0, 0, 0, 1);
    const cargo = renderer.group.children.filter((obj) => obj.userData.structureId).map((obj) => obj.getObjectByName('cargoIndicator') as THREE.Mesh);
    expect(cargo[0].material).not.toBe(cargo[1].material);
    expect(`#${(cargo[0].material as THREE.MeshStandardMaterial).color.getHexString()}`).toBe(ITEM_DEFS.wood.css);
    expect(`#${(cargo[1].material as THREE.MeshStandardMaterial).color.getHexString()}`).toBe(ITEM_DEFS.crystal.css);
    renderer.dispose(); renderer.dispose();
  });

  it('shares drop bundles without disposing other pickups and refreshes changed item/count data', () => {
    const renderer = new ResourceDropRenderer(new THREE.Scene());
    renderer.setDrops([resource(1), resource(2), resource(3, 'stone'), resource(4, 'flint')]);
    expect(renderer.stats().meshes).toBe(12);
    const a = renderer.group.children[0].getObjectByName('dropWoodLog') as THREE.Mesh;
    const b = renderer.group.children[1].getObjectByName('dropWoodLog') as THREE.Mesh;
    expect(a.geometry).toBe(b.geometry);
    const dispose = vi.spyOn(a.geometry, 'dispose');
    renderer.setDrops([resource(2), resource(3, 'crystal', 3)]);
    expect(dispose).not.toHaveBeenCalled();
    expect(renderer.group.children.find((obj) => obj.userData.resourceDropId === 3)!.userData).toMatchObject({ item: 'crystal', pieces: 3 });
    renderer.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('matches authored tree base and heading, then releases transient geometry while retaining shared material', () => {
    const renderer = new FallingTreeRenderer(new THREE.Scene());
    const params: TreeParams = {
      kind: 'broadleaf', trunk: 4.5, canopy: 3.5, spread: 5.3, girth: 0.48, offA: 0, offB: 0, tint: 1, planetRadius: 900,
      habitat: { tile: 4, x: -20, z: 30, yaw: 0.7, scale: 1, community: 'shore' },
    };
    renderer.spawn(4, 0, 1, 0, 904, params, 0, 1, 0);
    renderer.update(0, 0, 0, 0);
    const item = renderer.active[0], up = new THREE.Vector3(...habitatDirection(-20, 30, 900));
    expect(item.stumpGroup.position.distanceTo(up.clone().multiplyScalar(904.025))).toBeLessThan(1e-8);
    const forward = new THREE.Vector3(...HABITAT_FORWARD).addScaledVector(up, -new THREE.Vector3(...HABITAT_FORWARD).dot(up)).normalize().applyAxisAngle(up, 0.7);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(item.meshGroup.quaternion).distanceTo(forward)).toBeLessThan(1e-8);
    const parts = meshes(renderer.group);
    expect(parts).toHaveLength(2);
    expect(parts[0].material).toBe(parts[1].material);
    const disposed = parts.map((part) => vi.spyOn(part.geometry, 'dispose'));
    const materialDisposed = vi.spyOn(parts[0].material as THREE.Material, 'dispose');
    renderer.update(3, 0, 0, 0); renderer.clear();
    expect(renderer.active).toHaveLength(0);
    for (const dispose of disposed) expect(dispose).toHaveBeenCalledTimes(1);
    expect(materialDisposed).not.toHaveBeenCalled();
    renderer.dispose(); renderer.dispose(); expect(materialDisposed).toHaveBeenCalledTimes(1);
  });
});
