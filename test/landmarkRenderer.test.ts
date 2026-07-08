import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';
import { LandmarkRenderer } from '../src/render/landmarks';
import { pentagonTileIds } from '../src/sim/landmarks';

describe('bare pentagon waypoint renderer', () => {
  it('builds one undecorated waypoint per pentagon tile', () => {
    const geo = new Goldberg(8);
    const scene = new THREE.Scene();
    const pentagons = pentagonTileIds(geo);
    const renderer = new LandmarkRenderer(scene, pentagons);
    const stats = renderer.stats();

    expect(stats.groups).toBe(12);
    expect(stats.meshes).toBe(12 * 3);
    expect(stats.lit).toBe(0);

    const names = new Set<string>();
    renderer.group.traverse((child) => names.add(child.name));
    expect([...names]).toEqual(expect.arrayContaining(['waypointBase', 'waypointPost', 'waypointBeacon']));
    expect(scene.children).toContain(renderer.group);
  });

  it('lights the beacon only for discovered waypoints and positions them on the surface', () => {
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const terrain = new Terrain('landmark-renderer');
    const columns = new Columns(geo, layers, terrain);
    const scene = new THREE.Scene();
    const pentagons = pentagonTileIds(geo);
    const renderer = new LandmarkRenderer(scene, pentagons);

    renderer.update(pentagons, new Set([pentagons[0]]), geo, layers, columns, { x: 0, y: 0, z: 0 }, 0);
    const stats = renderer.stats();
    expect(stats.lit).toBe(1);

    let beaconPosition: THREE.Vector3 | null = null;
    renderer.group.traverse((child) => {
      if (child.name === `pentagon-landmark-0`) beaconPosition = child.position.clone();
    });
    expect(beaconPosition).not.toBeNull();
    expect(beaconPosition!.length()).toBeGreaterThan(0);
  });
});
