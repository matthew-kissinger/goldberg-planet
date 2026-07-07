import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { TreeAssetRenderer } from '../src/render/treeAssets';
import type {
  KilnTreeSkinSlug,
  KilnTreeSkinTemplate,
  TreeSkinProvider,
} from '../src/render/kilnAssets';
import { enumerateChunks, type ChunkInfo } from '../src/world/chunks';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';
import { Trees, type TreeVisualKind } from '../src/world/trees';

const KIND_BY_KILN_SLUG: Record<KilnTreeSkinSlug, TreeVisualKind> = {
  'tree-pine': 'pine',
  'tree-broadleaf': 'broadleaf',
  'tree-dead-snag': 'deadSnag',
  'tree-shrub': 'shrub',
};

const TREE_SLUGS = Object.keys(KIND_BY_KILN_SLUG) as KilnTreeSkinSlug[];

function template(slug: KilnTreeSkinSlug): KilnTreeSkinTemplate {
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    slug,
    kind: KIND_BY_KILN_SLUG[slug],
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
      material: new THREE.MeshStandardMaterial({ color: 0x6aa05b, vertexColors: false }),
    }],
    fit: {
      slug,
      kind: KIND_BY_KILN_SLUG[slug],
      socketRole: 'tree-scatter',
      sourceBboxSize: [1, 2, 1],
      runtimeSourceBboxSize: [1, 2, 1],
      normalizedBboxSize: [1, 2, 1],
      normalizePolicy: 'center-xz-bottom-y',
      batchingPolicy: 'instanced-merged-by-material',
      animationPolicy: 'matrix-sway-near-and-damage-only',
      sourceUrl: `/assets/kiln/models/${slug}.glb`,
      sourceMeshCount: 1,
      instancedMeshCount: 1,
      materialCount: 1,
      acceptanceNote: 'fake test tree template',
    },
  };
}

class FakeTreeSkins implements TreeSkinProvider {
  readonly requested: KilnTreeSkinSlug[] = [];

  async createTreeSkinTemplate(slug: KilnTreeSkinSlug): Promise<KilnTreeSkinTemplate | null> {
    this.requested.push(slug);
    return template(slug);
  }
}

class FailingTreeSkins implements TreeSkinProvider {
  async createTreeSkinTemplate(): Promise<KilnTreeSkinTemplate | null> {
    return null;
  }
}

async function flushSkinPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function fixtureWorld() {
  const geo = new Goldberg(24);
  const layers = buildLayers();
  const terrain = new Terrain('tree-asset-renderer');
  const columns = new Columns(geo, layers, terrain);
  const trees = new Trees(geo, columns, terrain, 'tree-asset-renderer');
  return { geo, layers, columns, trees };
}

function firstLiveTreeByKind(trees: Trees, geo: Goldberg): Map<TreeVisualKind, number> {
  const byKind = new Map<TreeVisualKind, number>();
  for (let tile = 0; tile < geo.count; tile += 1) {
    if (!trees.hasTree(tile)) continue;
    const kind = trees.visualKindFor(tile);
    if (!byKind.has(kind)) byKind.set(kind, tile);
  }
  return byKind;
}

function chunksForTiles(geo: Goldberg, tiles: Iterable<number>): ChunkInfo[] {
  const wanted = new Set(tiles);
  const chunks: ChunkInfo[] = [];
  for (const chunk of enumerateChunks(geo).values()) {
    if ([...chunk.tiles].some((tile) => wanted.has(tile))) chunks.push(chunk);
  }
  return chunks;
}

describe('tree asset renderer Kiln skin batching', () => {
  it('classifies the generated tree field into the four approved visual kinds', () => {
    const { geo, trees } = fixtureWorld();
    const byKind = firstLiveTreeByKind(trees, geo);

    expect([...byKind.keys()].sort()).toEqual(['broadleaf', 'deadSnag', 'pine', 'shrub']);
  });

  it('batches approved Kiln tree GLBs while terrain trees remain gameplay authority', async () => {
    const { geo, layers, columns, trees } = fixtureWorld();
    const byKind = firstLiveTreeByKind(trees, geo);
    const chunks = chunksForTiles(geo, byKind.values());
    const scene = new THREE.Scene();
    const provider = new FakeTreeSkins();
    const renderer = new TreeAssetRenderer(scene, provider);

    renderer.setChunks(chunks, geo, trees);
    renderer.setProceduralFallbackActive(false);
    renderer.setRenderEnabled(true);
    await flushSkinPromises();
    renderer.update(geo, layers, columns, trees, { x: 0, y: 0, z: 0 }, 1.25);
    const stats = renderer.stats();

    expect(new Set(provider.requested)).toEqual(new Set(TREE_SLUGS));
    expect(stats.readyForProceduralReplacement).toBe(true);
    expect(stats.proceduralFallbackActive).toBe(false);
    expect(stats.renderEnabled).toBe(true);
    expect(stats.kilnTreeSkinsPending).toBe(0);
    expect(stats.kilnTreeSkinFallbacks).toBe(0);
    expect(stats.currentTrees).toBeGreaterThanOrEqual(4);
    expect(stats.batchedInstances).toBe(stats.currentTrees);
    expect(stats.instancedDrawCalls).toBe(4);
    expect(stats.animationLodDistance).toBe(96);
    expect(stats.kilnTreeSkinsBySlug['tree-pine']).toMatchObject({ instancedMeshes: 1 });
    expect(stats.kilnTreeSkinsBySlug['tree-broadleaf']).toMatchObject({ instancedMeshes: 1 });
    expect(stats.kilnTreeSkinsBySlug['tree-dead-snag']).toMatchObject({ instancedMeshes: 1 });
    expect(stats.kilnTreeSkinsBySlug['tree-shrub']).toMatchObject({ instancedMeshes: 1 });
    expect(stats.kilnTreeSkinFits['tree-pine']).toMatchObject({
      sourceUrl: '/assets/kiln/models/tree-pine.glb',
      batchingPolicy: 'instanced-merged-by-material',
      animationPolicy: 'matrix-sway-near-and-damage-only',
    });
  });

  it('keeps procedural chunk trees active if any approved tree GLB fails', async () => {
    const { geo, layers, columns, trees } = fixtureWorld();
    const byKind = firstLiveTreeByKind(trees, geo);
    const chunks = chunksForTiles(geo, byKind.values());
    const scene = new THREE.Scene();
    const renderer = new TreeAssetRenderer(scene, new FailingTreeSkins());

    renderer.setChunks(chunks, geo, trees);
    renderer.setProceduralFallbackActive(true);
    renderer.setRenderEnabled(false);
    await flushSkinPromises();
    renderer.update(geo, layers, columns, trees, { x: 0, y: 0, z: 0 }, 1.25);
    const stats = renderer.stats();

    expect(stats.readyForProceduralReplacement).toBe(false);
    expect(stats.proceduralFallbackActive).toBe(true);
    expect(stats.renderEnabled).toBe(false);
    expect(stats.batchedInstances).toBe(0);
    expect(stats.instancedDrawCalls).toBe(0);
    expect(stats.kilnTreeSkinFallbacks).toBeGreaterThan(0);
  });
});
