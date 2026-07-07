import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { DomainResourceRenderer } from '../src/render/domainResources';
import { domainResourceSites, type DomainResourceKind } from '../src/sim/domainResources';
import type {
  DomainResourceSkinProvider,
  KilnDomainResourceSkinSlug,
  KilnDomainResourceSkinTemplate,
} from '../src/render/kilnAssets';
import { pentagonTileIds } from '../src/sim/landmarks';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';

const KILN_SLUG_BY_KIND: Record<DomainResourceKind, KilnDomainResourceSkinSlug> = {
  hearthCoal: 'node-hearth-coal',
  rainReed: 'node-rain-reed',
  saltShell: 'node-salt-shell',
  lanternShard: 'node-lantern-shard',
  rootPod: 'node-root-pod',
  redNodule: 'node-red-nodule',
  snowBloom: 'node-snow-bloom',
  glassShard: 'node-glass-shard',
  stormAmber: 'node-storm-amber',
  reedKelp: 'node-reed-kelp',
  bellCrystal: 'node-bell-crystal',
  horizonShard: 'node-horizon-shard',
};

const KIND_BY_KILN_SLUG = Object.fromEntries(
  Object.entries(KILN_SLUG_BY_KIND).map(([kind, slug]) => [slug, kind as DomainResourceKind]),
) as Record<KilnDomainResourceSkinSlug, DomainResourceKind>;

function meshNamesForKind(renderer: DomainResourceRenderer, kind: DomainResourceKind): Set<string> {
  const names = new Set<string>();
  for (const child of renderer.group.children) {
    if (!child.name.startsWith(`domain-resource-${kind}-`)) continue;
    child.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) names.add(part.name);
    });
  }
  return names;
}

function template(slug: KilnDomainResourceSkinSlug): KilnDomainResourceSkinTemplate {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const kind = KIND_BY_KILN_SLUG[slug];
  return {
    slug,
    kind,
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
      material: new THREE.MeshStandardMaterial({ color: 0x88aacc }),
    }],
    fit: {
      slug,
      kind,
      socketRole: 'domain-resource-node',
      sourceBboxSize: [1, 1, 1],
      runtimeSourceBboxSize: [1, 1, 1],
      orientedSourceBboxSize: [1, 1, 1],
      normalizedBboxSize: [1, 1, 1],
      normalizePolicy: 'center-xz-bottom-y',
      orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
      batchingPolicy: 'instanced-merged-by-material',
      animationPolicy: 'matrix-pulse-only',
      sourceUrl: `/assets/kiln/models/${slug}.glb`,
      sourceMeshCount: 1,
      instancedMeshCount: 1,
      materialCount: 1,
      acceptanceNote: 'fake test node template',
    },
  };
}

class FakeDomainResourceSkins implements DomainResourceSkinProvider {
  readonly requested: KilnDomainResourceSkinSlug[] = [];

  async createDomainResourceSkinTemplate(slug: KilnDomainResourceSkinSlug): Promise<KilnDomainResourceSkinTemplate | null> {
    this.requested.push(slug);
    return template(slug);
  }
}

async function flushSkinPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function fixtureWorld() {
  const geo = new Goldberg(8);
  const pentagons = pentagonTileIds(geo);
  const sites = domainResourceSites(pentagons, geo, new Set(pentagons), new Set());
  const layers = buildLayers();
  const columns = new Columns(geo, layers, new Terrain('domain-resource-renderer'));
  return { geo, pentagons, sites, layers, columns };
}

describe('domain resource renderer asset readability', () => {
  it('uses distinct role-shaped silhouettes instead of one shard cluster', () => {
    const geo = new Goldberg(8);
    const pentagons = pentagonTileIds(geo);
    const sites = domainResourceSites(pentagons, geo, new Set(pentagons), new Set());
    const scene = new THREE.Scene();
    const renderer = new DomainResourceRenderer(scene);
    renderer.setSites(sites);
    const stats = renderer.stats();

    expect(stats.groups).toBe(36);
    expect(stats.kinds).toBe(12);
    expect(stats.silhouettes).toBe(12);
    expect(stats.meshes).toBeGreaterThan(150);

    expect([...meshNamesForKind(renderer, 'lanternShard')]).toEqual(expect.arrayContaining([
      'resourceLanternPrism',
      'resourceLanternYoke',
      'resourceLanternLampGlow',
    ]));
    expect([...meshNamesForKind(renderer, 'glassShard')]).toEqual(expect.arrayContaining([
      'resourceGlassPane',
      'resourceGlassSightline',
    ]));
    expect([...meshNamesForKind(renderer, 'bellCrystal')]).toEqual(expect.arrayContaining([
      'resourceBellBowl',
      'resourceBellRib',
      'resourceBellResonanceRing',
    ]));
    expect([...meshNamesForKind(renderer, 'horizonShard')]).toEqual(expect.arrayContaining([
      'resourceHorizonBearingBar',
      'resourceHorizonVaneArrow',
      'resourceHorizonRouteGlow',
    ]));

    for (const kind of ['lanternShard', 'glassShard', 'bellCrystal', 'horizonShard'] as const) {
      expect(meshNamesForKind(renderer, kind).has('resourceShardClusterCore')).toBe(false);
    }
  });

  it('batches approved Kiln node GLBs by domain-resource kind while preserving overlay groups', async () => {
    const { geo, sites, layers, columns } = fixtureWorld();
    const scene = new THREE.Scene();
    const provider = new FakeDomainResourceSkins();
    const renderer = new DomainResourceRenderer(scene, provider);

    renderer.setSites(sites);
    await flushSkinPromises();
    renderer.update(sites, geo, layers, columns, { x: 0, y: 0, z: 0 }, 3.2);
    const stats = renderer.stats();

    expect(new Set(provider.requested).size).toBe(12);
    expect(stats.groups).toBe(48);
    expect(stats.kinds).toBe(12);
    expect(stats.silhouettes).toBe(12);
    expect(stats.kilnSkinsLoaded).toBe(36);
    expect(stats.kilnSkinsPending).toBe(0);
    expect(stats.kilnSkinFallbacks).toBe(0);
    expect(stats.batchedInstances).toBe(36);
    expect(stats.instancedMeshes).toBe(12);
    expect(stats.instancedDrawCalls).toBe(12);
    expect(stats.fallbackGroups).toBe(0);
    expect(stats.kilnSkinsBySlug['node-hearth-coal']).toMatchObject({ loaded: 3, batchedInstances: 3, instancedMeshes: 1 });
    expect(stats.kilnSkinsBySlug['node-horizon-shard']).toMatchObject({ loaded: 3, batchedInstances: 3, instancedMeshes: 1 });
    expect(stats.kilnSkinFits['node-red-nodule']).toMatchObject({
      sourceUrl: '/assets/kiln/models/node-red-nodule.glb',
      batchingPolicy: 'instanced-merged-by-material',
      animationPolicy: 'matrix-pulse-only',
    });
  });
});
