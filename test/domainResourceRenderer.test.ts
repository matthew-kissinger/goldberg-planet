import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { DomainResourceRenderer } from '../src/render/domainResources';
import { domainResourceSites, type DomainResourceKind } from '../src/sim/domainResources';
import { pentagonTileIds } from '../src/sim/landmarks';

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
});
