import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { LandmarkRenderer } from '../src/render/landmarks';
import { pentagonTileIds } from '../src/sim/landmarks';

describe('landmark renderer asset readability', () => {
  it('builds terrain-first threshold assets with named readability roles', () => {
    const geo = new Goldberg(8);
    const scene = new THREE.Scene();
    const renderer = new LandmarkRenderer(scene, pentagonTileIds(geo));
    const stats = renderer.stats();

    expect(stats.thresholds).toBe(12);
    expect(stats.thresholdMeshes).toBeGreaterThan(40);
    expect(stats.thresholdAssetRoles).toBeGreaterThanOrEqual(12);

    const names = new Set<string>();
    scene.traverse((child) => { if (child.name.startsWith('threshold')) names.add(child.name); });
    expect([...names]).toEqual(expect.arrayContaining([
      'thresholdHearthLintel',
      'thresholdTideRib',
      'thresholdScreeCutWall',
      'thresholdHorizonVane',
    ]));
  });
});
