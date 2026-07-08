import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { FishSchoolRenderer, kilnFishSkinForSchool, type FishSchoolVisualSite } from '../src/render/fishSchools';
import type { FishSchoolReport } from '../src/sim/fishing';
import { WATER_SURFACE } from '../src/world/layers';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';

function school(kind: FishSchoolReport['kind'], label = `${kind} school`, catchCount = 2): FishSchoolReport {
  return {
    kind,
    label,
    strength: 0.72,
    catchCount,
    baitUseful: true,
    usesBait: false,
    message: label,
  };
}

function fixtureWorld() {
  const geo = new Goldberg(8);
  const layers = buildLayers();
  const terrain = new Terrain('fish-school-renderer');
  const columns = new Columns(geo, layers, terrain);
  return { geo, layers, columns };
}

function cameraAtTile(geo: Goldberg, tile: number): { x: number; y: number; z: number } {
  const c = geo.centers;
  return {
    x: c[tile * 3] * WATER_SURFACE,
    y: c[tile * 3 + 1] * WATER_SURFACE,
    z: c[tile * 3 + 2] * WATER_SURFACE,
  };
}

describe('fish school renderer', () => {
  it('maps existing fishing schools to approved singleton fish bodies', () => {
    expect(kilnFishSkinForSchool(school('shore', 'shore nibble', 1))).toBe('fish-shore-minnow');
    expect(kilnFishSkinForSchool(school('dock', 'dockside fish run', 2))).toBe('fish-shore-minnow');
    expect(kilnFishSkinForSchool(school('storm', 'storm fish run', 3))).toBe('fish-storm-runner');
    expect(kilnFishSkinForSchool(school('cave', 'cave fish shimmer', 2))).toBe('fish-cave-shimmer');
    expect(kilnFishSkinForSchool(school('run', 'salt-tide fish run', 3))).toBe('creature-driftjelly');
    expect(kilnFishSkinForSchool(school('run', 'reed-water fish run', 3))).toBe('fish-reed-fry');
    expect(kilnFishSkinForSchool(school('none', 'quiet water', 0))).toBeNull();
  });

  it('renders the point-school sprites and swim path near the camera, freezing and hiding with distance', () => {
    const scene = new THREE.Scene();
    const renderer = new FishSchoolRenderer(scene);
    const { geo, layers, columns } = fixtureWorld();
    const site: FishSchoolVisualSite = { id: 123, tile: 4, school: school('storm', 'storm fish run', 3) };

    renderer.setSchool(site);
    renderer.update(site, geo, layers, columns, cameraAtTile(geo, site.tile), 2.4);
    const near = renderer.stats();

    expect(near).toMatchObject({
      active: 1,
      slug: 'fish-storm-runner',
      fallbackVisible: 1,
      motionBand: 'nearBoids',
    });
    expect(near.pointSchoolSprites).toBeGreaterThanOrEqual(20);
    expect(near.nearBoidSprites).toBe(near.pointSchoolSprites);
    expect(near.swimPathVisible).toBe(1);
    expect(near.swimPathBeads).toBeGreaterThanOrEqual(12);
    expect(near.swimPathLength).toBeGreaterThan(0.75);
    expect(near.schoolSpread).toBeGreaterThan(0.25);

    const cam = cameraAtTile(geo, site.tile);
    renderer.update(site, geo, layers, columns, { x: cam.x + 135, y: cam.y, z: cam.z }, 2.7);
    const low = renderer.stats();
    expect(low.motionBand).toBe('frozenCloud');
    expect(low.nearBoidSprites).toBe(0);
    expect(low.swimPathVisible).toBe(0);
    expect(low.swimPathBeads).toBe(0);
    expect(low.pointSchoolSprites).toBeGreaterThan(0);

    renderer.update(site, geo, layers, columns, { x: cam.x + 360, y: cam.y, z: cam.z }, 3);
    const hidden = renderer.stats();
    expect(hidden.active).toBe(0);
    expect(hidden.fallbackVisible).toBe(0);
    expect(hidden.pointSchoolSprites).toBe(0);
    expect(hidden.nearBoidSprites).toBe(0);
    expect(hidden.swimPathVisible).toBe(0);
    expect(hidden.swimPathBeads).toBe(0);
    expect(hidden.motionBand).toBe('hidden');
  });

  it('renders fully via plain-geometry fallback, the only body every fish school has', () => {
    const scene = new THREE.Scene();
    const renderer = new FishSchoolRenderer(scene);
    const { geo, layers, columns } = fixtureWorld();
    const site: FishSchoolVisualSite = { id: 5, tile: 4, school: school('storm', 'storm fish run', 3) };

    renderer.setSchool(site);
    renderer.update(site, geo, layers, columns, cameraAtTile(geo, site.tile), 2);
    const stats = renderer.stats();

    expect(stats.active).toBe(1);
    expect(stats.slug).toBe('fish-storm-runner');
    expect(stats.fallbackVisible).toBe(1);
    expect(stats.pointSchoolSprites).toBeGreaterThan(0);
  });

  it('colors the plain-geometry fallback body per fish-school kind instead of one generic look', () => {
    const scene = new THREE.Scene();
    const renderer = new FishSchoolRenderer(scene);
    const { geo, layers, columns } = fixtureWorld();
    const scenarios: FishSchoolReport[] = [
      school('shore', 'shore nibble', 1),
      school('storm', 'storm fish run', 3),
      school('cave', 'cave fish shimmer', 2),
      school('run', 'salt-tide fish run', 3),
      school('run', 'reed-water fish run', 3),
    ];

    const colors = new Set<string>();
    for (const report of scenarios) {
      const site: FishSchoolVisualSite = { id: 9, tile: 4, school: report };
      renderer.setSchool(site);
      renderer.update(site, geo, layers, columns, cameraAtTile(geo, site.tile), 1);
      const body = renderer.group.getObjectByName('fallbackFishBody') as THREE.Mesh;
      const material = body.material as THREE.MeshStandardMaterial;
      colors.add(material.color.getHexString());
    }

    expect(colors.size).toBe(scenarios.length);
  });
});
