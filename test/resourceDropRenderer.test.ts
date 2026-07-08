import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { ResourceDropRenderer } from '../src/render/resourceDrops';
import type { ResourceDropSave } from '../src/sim/resourceDrops';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';

function drop(
  id: number,
  item: ResourceDropSave['item'],
  tile: number,
  source: ResourceDropSave['source'] = item === 'wood' ? 'tree' : 'mine',
  groundRadius = 905,
): ResourceDropSave {
  return {
    id,
    item,
    count: item === 'wood' ? 2 : 1,
    tile,
    offsetA: 0.12 * id,
    offsetB: -0.05 * id,
    groundRadius,
    age: 1.2,
    source,
  };
}

function fixtureWorld() {
  const geo = new Goldberg(4);
  const layers = buildLayers();
  const columns = new Columns(geo, layers, new Terrain('resource-drop-renderer'));
  return { geo, layers, columns };
}

describe('resource drop renderer', () => {
  it('renders every drop via plain-geometry fallback meshes', () => {
    const scene = new THREE.Scene();
    const renderer = new ResourceDropRenderer(scene);
    const drops = [
      drop(1, 'wood', 3),
      drop(2, 'rock', 4),
      drop(3, 'dirt', 5),
      drop(4, 'sand', 6),
      drop(5, 'snow', 7),
      drop(6, 'glowCrystal', 8),
      drop(7, 'rawFish', 9),
      drop(8, 'kelp', 10),
      drop(9, 'reeds', 11),
      drop(10, 'reeds', 12, 'creature'),
      drop(11, 'seeds', 13, 'creature'),
      drop(12, 'compost', 14),
      drop(13, 'caveMushroom', 15),
      drop(14, 'bait', 16),
    ];
    const { geo, layers, columns } = fixtureWorld();

    renderer.setDrops(drops);
    renderer.update(drops, geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    const stats = renderer.stats();

    expect(stats.groups).toBe(drops.length);
    expect(stats.active).toBe(drops.length);
    expect(stats.meshes).toBeGreaterThan(drops.length);
  });

  it('renders fully via plain-geometry fallback with no constructor argument at all', () => {
    const scene = new THREE.Scene();
    const renderer = new ResourceDropRenderer(scene);
    const drops = [drop(1, 'wood', 3), drop(2, 'rock', 4), drop(3, 'rawFish', 5)];
    const { geo, layers, columns } = fixtureWorld();

    renderer.setDrops(drops);
    renderer.update(drops, geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    const stats = renderer.stats();

    expect(stats.groups).toBe(3);
    expect(stats.active).toBe(3);
    expect(renderer.group.children.filter((child) => child.visible).length).toBe(3);
  });

  it('colors plain-geometry fallback drops per resource kind instead of one generic look', () => {
    const scene = new THREE.Scene();
    const renderer = new ResourceDropRenderer(scene);
    // These all shared a single hardcoded "glow" fallback color/shape before; each should
    // now read as visually distinct via its own item catalog color.
    const items: ResourceDropSave['item'][] = ['glowCrystal', 'rawFish', 'kelp', 'compost', 'caveMushroom', 'bait'];
    const drops = items.map((item, i) => drop(i + 1, item, 3 + i));
    const { geo, layers, columns } = fixtureWorld();

    renderer.setDrops(drops);
    renderer.update(drops, geo, layers, columns, { x: 0, y: 0, z: 0 }, 1);

    const colors = new Set<string>();
    for (const child of renderer.group.children) {
      child.traverse((node) => {
        if (node.name !== 'dropChip' || !(node as THREE.Mesh).isMesh) return;
        const material = (node as THREE.Mesh).material as THREE.MeshStandardMaterial;
        colors.add(material.color.getHexString());
      });
    }
    expect(colors.size).toBe(items.length);
  });

  it('keeps a drop\'s cached ground height fixed after nearby terrain is mined out from under it', () => {
    const scene = new THREE.Scene();
    const renderer = new ResourceDropRenderer(scene);
    const { geo, layers, columns } = fixtureWorld();

    const tile = 3;
    const groundLayerBefore = columns.groundLayerBelow(tile, layers.bounds[0]);
    const groundRadiusBefore = layers.topRadius(groundLayerBefore);
    const testDrop: ResourceDropSave = {
      id: 1,
      item: 'rock',
      count: 1,
      tile,
      offsetA: 0,
      offsetB: 0,
      groundRadius: groundRadiusBefore,
      age: 1.2,
      source: 'mine',
    };

    renderer.setDrops([testDrop]);
    renderer.update([testDrop], geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    const before = renderer.group.children.find((child) => child.userData.resourceDropId === testDrop.id)!;
    const posBefore = before.position.clone();

    // Mine away the exact cell the drop is resting on — the scenario from the bug report:
    // breaking terrain right at/above a ground item used to make it visibly snap downward.
    expect(columns.mine(tile, groundLayerBefore)).toBe(true);
    const groundLayerAfter = columns.groundLayerBelow(tile, layers.bounds[0]);
    expect(groundLayerAfter).not.toBe(groundLayerBefore);
    expect(layers.topRadius(groundLayerAfter)).toBeLessThan(groundRadiusBefore);

    renderer.update([testDrop], geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    const after = renderer.group.children.find((child) => child.userData.resourceDropId === testDrop.id)!;
    expect(after.position.distanceTo(posBefore)).toBeLessThan(1e-9);
  });
});
