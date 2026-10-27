import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { ResourceDropRenderer } from '../src/render/resourceDrops';
import type { ResourceDropSave } from '../src/sim/resourceDrops';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';
import { ITEM_DEFS } from '../src/sim/crafting';

function drop(id: number, item: ResourceDropSave['item'], tile: number, groundRadius = 905): ResourceDropSave {
  return {
    id,
    item,
    count: 2,
    tile,
    offsetA: 0.12 * id,
    offsetB: -0.05 * id,
    groundRadius,
    age: 1.2,
  };
}

function fixtureWorld() {
  const geo = new Goldberg(4);
  const layers = buildLayers();
  const columns = new Columns(geo, layers, new Terrain('resource-drop-renderer'));
  return { geo, layers, columns };
}

describe('resource drop renderer', () => {
  it('renders every drop as plain-geometry meshes and drops removed ones', () => {
    const scene = new THREE.Scene();
    const renderer = new ResourceDropRenderer(scene);
    const drops = [drop(1, 'wood', 3), drop(2, 'wood', 4), drop(3, 'planeFrame', 5)];
    const { geo, layers, columns } = fixtureWorld();

    renderer.setDrops(drops);
    renderer.update(drops, geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    let stats = renderer.stats();
    expect(stats.groups).toBe(3);
    expect(stats.active).toBe(3);
    expect(stats.meshes).toBeGreaterThan(drops.length);

    renderer.setDrops(drops.slice(1));
    stats = renderer.stats();
    expect(stats.groups).toBe(2);
    expect(renderer.group.children.some((child) => child.userData.resourceDropId === 1)).toBe(false);
  });

  it('tints non-wood drops with the item catalog color', () => {
    const scene = new THREE.Scene();
    const renderer = new ResourceDropRenderer(scene);
    renderer.setDrops([drop(1, 'planeFrame', 3)]);
    let chip: THREE.Mesh | null = null;
    renderer.group.traverse((node) => {
      if (node.name === 'dropChip') chip = node as THREE.Mesh;
    });
    expect(chip).not.toBeNull();
    expect(`#${(chip!.material as THREE.MeshStandardMaterial).color.getHexString()}`).toBe(ITEM_DEFS.planeFrame.css);
  });

  it('keeps a cached drop ground height fixed after the terrain under it changes', () => {
    const scene = new THREE.Scene();
    const renderer = new ResourceDropRenderer(scene);
    const { geo, layers, columns } = fixtureWorld();

    const tile = 3;
    const groundLayerBefore = columns.groundLayerBelow(tile, layers.bounds[0]);
    const testDrop = drop(1, 'wood', tile, layers.topRadius(groundLayerBefore));

    renderer.setDrops([testDrop]);
    renderer.update([testDrop], geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    const before = renderer.group.children.find((child) => child.userData.resourceDropId === testDrop.id)!;
    const posBefore = before.position.clone();

    // remove the exact cell the drop rests on; the drop must not snap to the new ground
    expect(columns.mine(tile, groundLayerBefore)).toBe(true);
    expect(columns.groundLayerBelow(tile, layers.bounds[0])).not.toBe(groundLayerBefore);

    renderer.update([testDrop], geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    const after = renderer.group.children.find((child) => child.userData.resourceDropId === testDrop.id)!;
    expect(after.position.distanceTo(posBefore)).toBeLessThan(1e-9);
  });
});
