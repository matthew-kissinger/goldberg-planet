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

function drop(id: number, item: ResourceDropSave['item'], tile: number, source: ResourceDropSave['source'] = item === 'wood' ? 'tree' : 'mine'): ResourceDropSave {
  return {
    id,
    item,
    count: item === 'wood' ? 2 : 1,
    tile,
    offsetA: 0.12 * id,
    offsetB: -0.05 * id,
    age: 1.2,
    source,
  };
}

function itemForSlug(slug: KilnResourceDropSkinSlug): string {
  if (slug === 'drop-wood-logs') return 'wood';
  if (slug === 'drop-ore-chunk') return 'rock';
  if (slug === 'drop-dirt-clod') return 'dirt';
  if (slug === 'drop-sand-pile') return 'sand';
  if (slug === 'drop-snow-clump') return 'snow';
  if (slug === 'drop-glow-crystal') return 'glowCrystal';
  if (slug === 'drop-raw-fish') return 'rawFish';
  if (slug === 'drop-kelp-reeds') return 'kelp/reeds';
  if (slug === 'drop-compost-pellet') return 'compost';
  if (slug === 'drop-cave-mushroom') return 'caveMushroom';
  if (slug === 'node-root-pod') return 'seeds';
  return 'reeds';
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
      material: new THREE.MeshStandardMaterial({ color: slug === 'drop-wood-logs' ? 0xa56d3a : slug === 'drop-glow-crystal' ? 0x70d6d1 : 0x8a8d91 }),
    }],
    fit: {
      slug,
      item: itemForSlug(slug),
      socketRole: 'ground-pickup',
      sourceBboxSize: [1, 1, 1],
      runtimeSourceBboxSize: [1, 1, 1],
      orientedSourceBboxSize: [1, 1, 1],
      normalizedBboxSize: [1, 1, 1],
      normalizePolicy: 'center-xz-bottom-y',
      orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
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
  it('batches approved pickup GLBs while keeping unmapped drops on fallback meshes', async () => {
    const scene = new THREE.Scene();
    const provider = new FakeDropSkins();
    const renderer = new ResourceDropRenderer(scene, provider);
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
    await flushSkinPromises();
    renderer.update(drops, geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    const stats = renderer.stats();

    expect(provider.requested.sort()).toEqual([
      'drop-cave-mushroom',
      'drop-compost-pellet',
      'drop-creature-fiber',
      'drop-dirt-clod',
      'drop-glow-crystal',
      'drop-kelp-reeds',
      'drop-ore-chunk',
      'drop-raw-fish',
      'drop-sand-pile',
      'drop-snow-clump',
      'drop-wood-logs',
      'node-root-pod',
    ]);
    expect(stats.kilnSkinsLoaded).toBe(13);
    expect(stats.kilnSkinsPending).toBe(0);
    expect(stats.kilnSkinFallbacks).toBe(0);
    expect(stats.batchedInstances).toBe(13);
    expect(stats.instancedMeshes).toBe(12);
    expect(stats.instancedDrawCalls).toBe(12);
    expect(stats.fallbackGroups).toBe(1);
    expect(stats.kilnDropSkinsBySlug['drop-wood-logs']).toMatchObject({ loaded: 1, batchedInstances: 1, instancedMeshes: 1 });
    expect(stats.kilnDropSkinsBySlug['drop-ore-chunk']).toMatchObject({ loaded: 1, batchedInstances: 1, instancedMeshes: 1 });
    expect(stats.kilnDropSkinsBySlug['drop-kelp-reeds']).toMatchObject({ loaded: 2, batchedInstances: 2, instancedMeshes: 1 });
    expect(stats.kilnDropSkinsBySlug['drop-creature-fiber']).toMatchObject({ loaded: 1, batchedInstances: 1, instancedMeshes: 1 });
    expect(stats.kilnDropSkinsBySlug['drop-raw-fish']).toMatchObject({ loaded: 1, batchedInstances: 1, instancedMeshes: 1 });
    expect(stats.kilnDropSkinsBySlug['drop-cave-mushroom']).toMatchObject({ loaded: 1, batchedInstances: 1, instancedMeshes: 1 });
    expect(stats.kilnDropSkinsBySlug['node-root-pod']).toMatchObject({ loaded: 1, batchedInstances: 1, instancedMeshes: 1 });
    expect(stats.kilnSkinFits['drop-wood-logs']).toMatchObject({
      sourceUrl: '/assets/kiln/models/drop-wood-logs.glb',
      batchingPolicy: 'instanced-merged-by-material',
      animationPolicy: 'matrix-bob-only',
    });
  });

  it('leaves supported drops visible through procedural fallback if the GLB skin fails', async () => {
    const scene = new THREE.Scene();
    const renderer = new ResourceDropRenderer(scene, new FailingDropSkins());
    const drops = [drop(1, 'wood', 3), drop(2, 'rock', 4), drop(3, 'rawFish', 5), drop(4, 'reeds', 6, 'creature'), drop(5, 'seeds', 7, 'creature')];
    const { geo, layers, columns } = fixtureWorld();

    renderer.setDrops(drops);
    await flushSkinPromises();
    renderer.update(drops, geo, layers, columns, { x: 0, y: 0, z: 0 }, 2.1);
    const stats = renderer.stats();

    expect(stats.kilnSkinsLoaded).toBe(0);
    expect(stats.batchedInstances).toBe(0);
    expect(stats.instancedDrawCalls).toBe(0);
    expect(stats.fallbackGroups).toBe(5);
    expect(stats.kilnSkinFallbacks).toBe(5);
    expect(stats.kilnDropSkinsBySlug['drop-wood-logs']).toMatchObject({ loaded: 0, fallback: 1 });
    expect(stats.kilnDropSkinsBySlug['drop-ore-chunk']).toMatchObject({ loaded: 0, fallback: 1 });
    expect(stats.kilnDropSkinsBySlug['drop-raw-fish']).toMatchObject({ loaded: 0, fallback: 1 });
    expect(stats.kilnDropSkinsBySlug['drop-creature-fiber']).toMatchObject({ loaded: 0, fallback: 1 });
    expect(stats.kilnDropSkinsBySlug['node-root-pod']).toMatchObject({ loaded: 0, fallback: 1 });
  });
});
