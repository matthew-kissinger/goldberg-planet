import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import { WATER_SURFACE } from '../world/layers';
import type { CaveMouthSignal } from '../sim/caveMouths';

function mat(color: number, roughness = 0.82, metalness = 0.03, emissive = 0x000000, intensity = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive === 0 ? 0 : intensity });
}

const stone = mat(0x4f5960, 0.9);
const dark = mat(0x20272c, 0.96);
const archGlow = mat(0x97b7c8, 0.65, 0.04, 0x4f7f95, 0.2);
const dryGlow = mat(0x70d6d1, 0.45, 0.08, 0x38d8d1, 0.9);
const seaGlow = mat(0x5faed2, 0.45, 0.05, 0x2a8eb8, 0.75);
const springGlow = mat(0x8fe8ff, 0.32, 0.04, 0x45cfe8, 0.85);
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const cone6 = new THREE.ConeGeometry(0.5, 1, 6);
const sphere = new THREE.SphereGeometry(0.5, 10, 8);

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.userData.baseScale = scale;
  m.receiveShadow = true;
  return m;
}

function makeMouth(signal: CaveMouthSignal): THREE.Group {
  const g = new THREE.Group();
  g.name = `cave-mouth-${signal.kind}-${signal.id}`;
  const glow = signal.kind === 'dryCave' ? dryGlow : signal.kind === 'seaCave' ? seaGlow : archGlow;
  g.add(mesh(cyl6, dark, [0, 0.035, 0], [0.76, 0.04, 0.5], 'mouthShadow'));
  if (signal.kind === 'arch') {
    const left = mesh(box, stone, [-0.34, 0.44, 0], [0.16, 0.88, 0.18], 'mouthRib');
    left.rotation.z = -0.18;
    const right = mesh(box, stone, [0.34, 0.44, 0], [0.16, 0.88, 0.18], 'mouthRib');
    right.rotation.z = 0.18;
    g.add(left, right);
    const lintel = mesh(box, stone, [0, 0.88, 0], [0.72, 0.14, 0.2], 'mouthLintel');
    g.add(lintel);
    const bridge = mesh(box, archGlow, [0, 1.04, 0], [0.5, 0.08, 0.12], 'mouthGlyph');
    bridge.rotation.z = 0.08;
    g.add(bridge);
  } else {
    const leftLip = mesh(sphere, stone, [-0.28, 0.18, 0], [0.22, 0.13, 0.16], 'mouthStoneLip');
    leftLip.rotation.z = -0.2;
    const rightLip = mesh(sphere, stone, [0.18, 0.2, -0.02], [0.3, 0.14, 0.18], 'mouthStoneLip');
    rightLip.rotation.z = 0.14;
    const capLip = mesh(box, stone, [-0.02, 0.36, -0.02], [0.48, 0.08, 0.16], 'mouthStoneLip');
    capLip.rotation.z = -0.08;
    g.add(leftLip, rightLip, capLip);
    const cairnSide = signal.kind === 'seaCave' ? -0.24 : 0.24;
    const baseStone = mesh(cyl6, stone, [cairnSide, 0.18, -0.08], [0.2, 0.09, 0.14], 'mouthCairnStone');
    baseStone.rotation.y = 0.2;
    const midStone = mesh(sphere, stone, [cairnSide * 0.9, 0.32, -0.08], [0.16, 0.1, 0.13], 'mouthCairnStone');
    midStone.rotation.z = -0.18;
    const topStone = mesh(sphere, glow, [cairnSide * 0.78, 0.47, -0.1], [0.08, 0.07, 0.065], 'mouthGlow');
    g.add(baseStone, midStone, topStone);
    const tag = mesh(signal.kind === 'seaCave' ? cone6 : box, glow, [-cairnSide * 0.55, 0.62, -0.12], [0.11, 0.08, 0.035], 'mouthGlyph');
    tag.rotation.x = signal.kind === 'seaCave' ? Math.PI / 2 : 0.08;
    tag.rotation.z = signal.kind === 'seaCave' ? 0.24 : -0.18;
    g.add(tag);
  }
  if (signal.kind === 'seaCave') {
    const tide = mesh(box, seaGlow, [0, 0.18, 0.22], [0.64, 0.035, 0.1], 'mouthTideLine');
    g.add(tide);
  }
  if (signal.spring) {
    const pool = mesh(cyl6, springGlow, [0, 0.16, 0.24], [0.34, 0.035, 0.22], 'mouthSpringSeep');
    pool.rotation.y = Math.PI / 6;
    g.add(pool);
    g.add(mesh(sphere, springGlow, [-0.24, 0.31, 0.2], [0.045, 0.045, 0.045], 'mouthSpringDrop'));
  }
  return g;
}

export class CaveMouthRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'cave-mouths';
    scene.add(this.group);
  }

  setMouths(mouths: readonly CaveMouthSignal[]): void {
    const wanted = new Set(mouths.map((mouth) => mouth.id));
    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.group.remove(obj);
        this.objects.delete(id);
      }
    }
    for (const mouth of mouths) {
      if (this.objects.has(mouth.id)) continue;
      const obj = makeMouth(mouth);
      obj.userData.caveMouthId = mouth.id;
      obj.userData.tile = mouth.tile;
      this.objects.set(mouth.id, obj);
      this.group.add(obj);
    }
  }

  update(
    mouths: readonly CaveMouthSignal[],
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
    for (const mouth of mouths) {
      const obj = this.objects.get(mouth.id);
      if (!obj) continue;
      const frame = geo.frameOf(mouth.tile);
      const yaw = mouth.id * 0.017;
      const ca = Math.cos(yaw);
      const sa = Math.sin(yaw);
      vX.set(
        frame.east[0] * ca + frame.north[0] * sa,
        frame.east[1] * ca + frame.north[1] * sa,
        frame.east[2] * ca + frame.north[2] * sa,
      );
      vY.set(...frame.normal);
      vZ.set(
        -frame.east[0] * sa + frame.north[0] * ca,
        -frame.east[1] * sa + frame.north[1] * ca,
        -frame.east[2] * sa + frame.north[2] * ca,
      );
      m.makeBasis(vX, vY, vZ);
      obj.setRotationFromMatrix(m);
      const ground = layers.topRadius(columns.groundLayerBelow(mouth.tile, layers.bounds[0]));
      const r = Math.max(ground + 0.22, WATER_SURFACE + (mouth.flooded ? 0.34 : 0.18));
      obj.position.set(
        c[mouth.tile * 3] * r - camWorld.x,
        c[mouth.tile * 3 + 1] * r - camWorld.y,
        c[mouth.tile * 3 + 2] * r - camWorld.z,
      );
      const markerScale = mouth.kind === 'arch' ? 1.28 : mouth.kind === 'seaCave' ? 1.55 : 1.45;
      obj.scale.setScalar(markerScale);
      const pulse = 1 + Math.sin(seconds * 2.0 + mouth.id * 0.1) * 0.08;
      obj.traverse((child) => {
        if (child.name === 'mouthGlyph' || child.name === 'mouthGlow' || child.name === 'mouthTideLine' || child.name === 'mouthSpringSeep' || child.name === 'mouthSpringDrop') {
          const base = child.userData.baseScale as [number, number, number] | undefined;
          if (base) child.scale.set(base[0] * pulse, base[1] * pulse, base[2] * pulse);
        }
      });
      obj.visible = true;
    }
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
