import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import { WATER_SURFACE } from '../world/layers';
import { makeSurfaceBasisFromForward } from './surfaceFrame';

function mat(color: number, roughness = 0.8, metalness = 0.02, emissive = 0x000000, intensity = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive === 0 ? 0 : intensity });
}

const materials = {
  base: mat(0x3d4650, 0.92),
  postDormant: mat(0x4f6473, 0.68, 0.03, 0x172f3c, 0.2),
  postAwake: mat(0xf1cf79, 0.35, 0.02, 0xffb13d, 1.2),
};

const cyl5 = new THREE.CylinderGeometry(0.5, 0.5, 1, 5);
const cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const sphere = new THREE.SphereGeometry(0.5, 10, 8);

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.receiveShadow = true;
  return m;
}

/** A bare, undecorated pentagon waypoint: a low base, a post, and a beacon that lights when discovered. */
function makeWaypoint(index: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `pentagon-landmark-${index}`;
  g.add(mesh(cyl5, materials.base, [0, 0.08, 0], [1.1, 0.16, 1.1], 'waypointBase'));
  g.add(mesh(cyl6, materials.postDormant, [0, 0.9, 0], [0.12, 1.6, 0.12], 'waypointPost'));
  g.add(mesh(sphere, materials.postDormant, [0, 1.78, 0], [0.2, 0.2, 0.2], 'waypointBeacon'));
  return g;
}

export class LandmarkRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene, pentagonTiles: readonly number[]) {
    this.group.name = 'pentagon-landmarks';
    scene.add(this.group);
    for (let i = 0; i < pentagonTiles.length; i++) {
      const tile = pentagonTiles[i];
      const obj = makeWaypoint(i);
      obj.userData.tile = tile;
      obj.userData.index = i;
      this.objects.set(tile, obj);
      this.group.add(obj);
    }
  }

  update(
    pentagonTiles: readonly number[],
    discovered: ReadonlySet<number>,
    geo: Goldberg,
    layers: Layers,
    columns: Columns,
    camWorld: { x: number; y: number; z: number },
    seconds: number,
  ): void {
    const vX = new THREE.Vector3();
    const vY = new THREE.Vector3();
    const vZ = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const c = geo.centers;
    for (let i = 0; i < pentagonTiles.length; i++) {
      const tile = pentagonTiles[i];
      const obj = this.objects.get(tile);
      if (!obj) continue;
      const frame = geo.frameOf(tile);
      vY.set(frame.normal[0], frame.normal[1], frame.normal[2]);
      vZ.set(frame.east[0], frame.east[1], frame.east[2]);
      makeSurfaceBasisFromForward(vY, vZ, m, vX, vY, vZ);
      obj.setRotationFromMatrix(m);
      const ground = layers.topRadius(columns.groundLayerBelow(tile, layers.bounds[0]));
      const r = Math.max(ground + 0.05, WATER_SURFACE + 0.18);
      obj.position.set(
        c[tile * 3] * r - camWorld.x,
        c[tile * 3 + 1] * r - camWorld.y,
        c[tile * 3 + 2] * r - camWorld.z,
      );
      const known = discovered.has(tile);
      const pulse = known ? 1 + Math.sin(seconds * 2.2 + i) * 0.12 : 1;
      obj.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const child2 = child as THREE.Mesh;
        if (child.name === 'waypointPost' || child.name === 'waypointBeacon') {
          child2.material = known ? materials.postAwake : materials.postDormant;
        }
        if (child.name === 'waypointBeacon') child.scale.setScalar(0.2 * pulse);
      });
    }
  }

  stats(): { groups: number; meshes: number; lit: number } {
    let meshes = 0;
    let lit = 0;
    for (const obj of this.objects.values()) {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshes++;
          if (child.name === 'waypointBeacon' && (child as THREE.Mesh).material === materials.postAwake) lit++;
        }
      });
    }
    return { groups: this.objects.size, meshes, lit };
  }
}
