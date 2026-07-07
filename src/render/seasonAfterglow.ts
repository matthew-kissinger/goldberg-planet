import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import { WATER_SURFACE } from '../world/layers';
import type { StrangerSeasonAfterglow } from '../sim/eventSeasons';

function mat(color: number, roughness = 0.58, metalness = 0.04, emissive = 0x000000, intensity = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity: emissive === 0 ? 0 : intensity,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
}

const ringGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
const postGeom = new THREE.BoxGeometry(1, 1, 1);
const moteGeom = new THREE.SphereGeometry(0.5, 12, 8);
const beamGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const shellGeom = new THREE.ConeGeometry(0.5, 1, 7);

function mesh(
  geom: THREE.BufferGeometry,
  material: THREE.Material,
  pos: [number, number, number],
  scale: [number, number, number],
  name: string,
): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.frustumCulled = false;
  return m;
}

function makeAfterglow(afterglow: StrangerSeasonAfterglow): THREE.Group {
  const warm = mat(0xf3e690, 0.5, 0.04, 0xfff0a8, 0.7);
  const pale = mat(0xbbe6ff, 0.42, 0.03, 0x9fdcff, 0.55);
  const shadow = mat(0x465258, 0.88, 0.02, 0xfff0a8, 0.1);
  const beam = mat(0xf8f0b4, 0.24, 0, 0xfff0a8, 1.15);
  beam.opacity = 0.32;

  const g = new THREE.Group();
  g.name = `season-afterglow-${afterglow.id}`;
  g.add(mesh(ringGeom, beam, [0, 0.045, 0], [0.95, 0.025, 0.95], 'afterglowReadingRing'));
  g.add(mesh(ringGeom, shadow, [0, 0.075, 0], [0.48, 0.03, 0.48], 'afterglowChordMark'));
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + afterglow.id * 0.19;
    const post = mesh(postGeom, shadow, [Math.cos(a) * 0.43, 0.34, Math.sin(a) * 0.43], [0.05, 0.42, 0.05], 'afterglowChordPost');
    post.rotation.y = a;
    post.rotation.z = 0.2 * Math.sin(a);
    g.add(post);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + 0.54;
    const shell = mesh(shellGeom, i === 1 ? pale : warm, [Math.cos(a) * 0.18, 0.43 + i * 0.04, Math.sin(a) * 0.18], [0.095, 0.35, 0.095], 'afterglowMemoryShell');
    shell.rotation.y = a;
    shell.rotation.z = 0.72;
    g.add(shell);
  }
  g.add(mesh(moteGeom, warm, [0, 0.64, 0], [0.16, 0.12, 0.16], 'afterglowChordHeart'));
  g.add(mesh(beamGeom, beam, [0, 1.28, 0], [0.22, 2.45, 0.22], 'afterglowFocusBeam'));
  for (let i = 0; i < 9; i++) {
    g.add(mesh(moteGeom, i % 2 === 0 ? warm : pale, [0, 0.78, 0], [0.035, 0.035, 0.035], `afterglowMote${i}`));
  }
  return g;
}

export class SeasonAfterglowRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'season-afterglows';
    scene.add(this.group);
  }

  setAfterglow(afterglow: StrangerSeasonAfterglow | null): void {
    const wanted = afterglow && !afterglow.read ? afterglow.id : null;
    for (const [id, obj] of this.objects) {
      if (id !== wanted) {
        this.group.remove(obj);
        this.objects.delete(id);
      }
    }
    if (!afterglow || afterglow.read || this.objects.has(afterglow.id)) return;
    const obj = makeAfterglow(afterglow);
    obj.userData.seasonAfterglowId = afterglow.id;
    obj.userData.tile = afterglow.tile;
    this.objects.set(afterglow.id, obj);
    this.group.add(obj);
  }

  update(
    afterglow: StrangerSeasonAfterglow | null,
    geo: Goldberg,
    layers: Layers,
    columns: Columns,
    camWorld: { x: number; y: number; z: number },
    seconds: number,
  ): void {
    if (!afterglow || afterglow.read) {
      for (const obj of this.objects.values()) obj.visible = false;
      return;
    }
    const obj = this.objects.get(afterglow.id);
    if (!obj) return;
    obj.visible = true;

    const frame = geo.frameOf(afterglow.tile);
    const yaw = afterglow.id * 0.29;
    const ca = Math.cos(yaw);
    const sa = Math.sin(yaw);
    const vX = new THREE.Vector3(
      frame.east[0] * ca + frame.north[0] * sa,
      frame.east[1] * ca + frame.north[1] * sa,
      frame.east[2] * ca + frame.north[2] * sa,
    );
    const vY = new THREE.Vector3(...frame.normal);
    const vZ = new THREE.Vector3(
      -frame.east[0] * sa + frame.north[0] * ca,
      -frame.east[1] * sa + frame.north[1] * ca,
      -frame.east[2] * sa + frame.north[2] * ca,
    );
    obj.setRotationFromMatrix(new THREE.Matrix4().makeBasis(vX, vY, vZ));
    const c = geo.centers;
    const ground = layers.topRadius(columns.groundLayerBelow(afterglow.tile, layers.bounds[0]));
    const r = Math.max(ground + 0.14, WATER_SURFACE + 0.22);
    obj.position.set(
      c[afterglow.tile * 3] * r - camWorld.x,
      c[afterglow.tile * 3 + 1] * r - camWorld.y,
      c[afterglow.tile * 3 + 2] * r - camWorld.z,
    );
    const pulse = 1 + Math.sin(seconds * 1.9 + afterglow.id * 0.17) * 0.08;
    obj.scale.setScalar(2.35 * pulse);
    obj.traverse((child) => {
      if (child.name === 'afterglowReadingRing') child.scale.set(0.95 + pulse * 0.08, 0.025, 0.95 + pulse * 0.08);
      if (child.name === 'afterglowFocusBeam') child.scale.set(0.22 * pulse, 2.45 + Math.sin(seconds * 1.2) * 0.22, 0.22 * pulse);
      if (child.name.startsWith('afterglowMote')) {
        const i = Number(child.name.replace('afterglowMote', '')) || 0;
        const a = seconds * (0.58 + i * 0.035) + i * 0.7 + afterglow.id * 0.08;
        const radius = 0.32 + Math.sin(seconds * 1.05 + i) * 0.05;
        child.position.set(Math.cos(a) * radius, 0.74 + Math.sin(a * 1.6) * 0.2, Math.sin(a) * radius);
      }
    });
  }

  stats(): { groups: number; meshes: number; active: number } {
    let meshes = 0;
    let active = 0;
    for (const obj of this.objects.values()) {
      if (obj.visible) active++;
      obj.traverse((child) => { if ((child as THREE.Mesh).isMesh) meshes++; });
    }
    return { groups: this.objects.size, meshes, active };
  }
}
