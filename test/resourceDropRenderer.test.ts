import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { ResourceDropRenderer } from '../src/render/resourceDrops';
import type {
  KilnResourceDropSkinSlug,
  KilnResourceDropSkinTemplate,
  ResourceDropSkinProvider,
} from '../src/render/kilnAssets';
import type { ResourceDropSave } from '../src/sim/resourceDrops';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';

function drop(id: number, item: ResourceDropSave['item'], tile: number): ResourceDropSave {
  return {
    id,
    item,
    count: item === 'wood' ? 2 : 1,
    tile,
    offsetA: 0.12 * id,
    offsetB: -0.05 * id,
    age: 1.2,
    source: item === 'wood' ? 'tree' : 'mine',
  };
}

function template(slug: KilnResourceDropSkinSlug): KilnResourceDropSkinTemplate {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    slug,
    manifest: {
      slug,
      status: 'ready',
      file: `models/${slug}.glb`,
      geometry: { materialCount: 1 },
    },
    sourceUrl: `/assets/kiln/models/${slug}.glb`,
    parts: [{
      name: `fake-instanced-${slug}`,
      sourceMeshNames: [`${slug}-mesh`],
      sourceMeshCount: 1,
      geometry,
      material: new THREE.MeshStandardMaterial({ color: slug === 'drop-wood-logs' ? 0xa56d3a : 0x8a8d91 }),
    }],
    fit: {
      slug,
      item: slug === 'drop-wood-logs' ? 'wood' : 'rock',
      socketRole: 'ground-pickup',
      sourceBboxSize: [1, 1, 1],
      runtimeSourceBboxSize: [1, 1, 1],
      normalizedBboxSize: [1, 1, 1],
      normalizePolicy: 'center-xz-bottom-y',
      batchingPolicy: 'instanced-merged-by-material',
      animationPolicy: 'matrix-bob-only',
      sourceUrl: `/assets/kiln/models/${slug}.glb`,
      sourceMeshCount: 1,
      instancedMeshCount: 1,
      materialCount: 1,
      acceptanceNote: 'fake test template',
    },
  };
}

class FakeDropSkins implements ResourceDropSkinProvider {
  readonly requested: KilnResourceDropSkinSlug[] = [];

  async createResourceDropSkinTemplate(slug: KilnResourceDropSkinSlug): Promise<KilnResourceDropSkinTemplate | null> {
    this.requested.push(slug);
    return template(slug);
  }
}

class FailingDropSkins implements ResourceDropSkinProvider {
  async createResourceDropSkinTemplate(): Promise<KilnResourceDropSkinTemplate | null> {
    return null;
  }
}

async function flushSkinPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function fixtureWorld() {
  const geo = new Goldberg(4);
  const layers = buildLayers();
  const columns = new Columns(geo, layers, new Terrain('resource-drop-renderer'));
  return { geo, layers, columns };
}

describe('resource drop renderer Kiln skin batching', () => {
  it('batches approved wood and rock drop GLBs while keeping unmapped drops on fallback meshes', async () => {
    const scene = new THREE.Scene();
    const provider = new FakeDropSkins();
    const renderer = new ResourceDropRenderer(scene, provider);
    const drops = [drop(1, 'wood', 3), drop(2, 'rock', 4), drop(3, 'sand', 5)];
    const { geo, layers, columns } = fixtureWorld();

    renderer.setDrops(drops);
    await flushSkinPromises();
    renderer.update(drops, geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    const stats = renderer.stats();

    expect(provider.requested.sort()).toEqual(['drop-ore-chunk', 'drop-wood-logs']);
    expect(stats.kilnSkinsLoaded).toBe(2);
    expect(stats.kilnSkinsPending).toBe(0);
    expect(stats.kilnSkinFallbacks).toBe(0);
    expect(stats.batchedInstances).toBe(2);
    expect(stats.instancedMeshes).toBe(2);
    expect(stats.instancedDrawCalls).toBe(2);
    expect(stats.fallbackGroups).toBe(1);
    expect(stats.kilnDropSkinsBySlug['drop-wood-logs']).toMatchObject({ loaded: 1, batchedInstances: 1, instancedMeshes: 1 });
    expect(stats.kilnDropSkinsBySlug['drop-ore-chunk']).toMatchObject({ loaded: 1, batchedInstances: 1, instancedMeshes: 1 });
    expect(stats.kilnSkinFits['drop-wood-logs']).toMatchObject({
      sourceUrl: '/assets/kiln/models/drop-wood-logs.glb',
      batchingPolicy: 'instanced-merged-by-material',
      animationPolicy: 'matrix-bob-only',
    });
  });

  it('leaves supported drops visible through procedural fallback if the GLB skin fails', async () => {
    const scene = new THREE.Scene();
    const renderer = new ResourceDropRenderer(scene, new FailingDropSkins());
    const drops = [drop(1, 'wood', 3), drop(2, 'rock', 4)];
    const { geo, layers, columns } = fixtureWorld();

    renderer.setDrops(drops);
    await flushSkinPromises();
    renderer.update(drops, geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    const stats = renderer.stats();

    expect(stats.kilnSkinsLoaded).toBe(0);
    expect(stats.batchedInstances).toBe(0);
    expect(stats.instancedDrawCalls).toBe(0);
    expect(stats.fallbackGroups).toBe(2);
    expect(stats.kilnSkinFallbacks).toBe(2);
    expect(stats.kilnDropSkinsBySlug['drop-wood-logs']).toMatchObject({ loaded: 0, fallback: 1 });
    expect(stats.kilnDropSkinsBySlug['drop-ore-chunk']).toMatchObject({ loaded: 0, fallback: 1 });
  });
});
