import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import type { ResourceDropSave } from '../sim/resourceDrops';
import { RESOURCE_DROP_PICKUP_DELAY } from '../sim/resourceDrops';

function mat(color: number, roughness = 0.76, metalness = 0.02, emissive = 0x000000): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive === 0 ? 0 : 0.25 });
}

const materials = {
  wood: mat(0xa56d3a),
  woodDark: mat(0x5b3822),
  stone: mat(0x8a8d91),
  soil: mat(0x76543a),
  sand: mat(0xd8c48a),
  snow: mat(0xeef2f5, 0.58),
  glow: mat(0xf1d076, 0.44, 0.08, 0xe9a63d),
};

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const sphere8 = new THREE.SphereGeometry(0.5, 8, 6);

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.receiveShadow = true;
  return m;
}

function makeWoodDrop(drop: ResourceDropSave): THREE.Group {
  const g = new THREE.Group();
  g.name = `resource-drop-wood-${drop.id}`;
  const pieces = Math.max(1, Math.min(3, Math.trunc(drop.count)));
  for (let i = 0; i < pieces; i++) {
    const log = mesh(cyl8, materials.wood, [-0.18 + i * 0.18, 0.12 + i * 0.025, (i - 1) * 0.07], [0.08, 0.42, 0.08], 'dropWoodLog');
    log.rotation.z = Math.PI / 2;
    log.rotation.y = i * 0.72;
    g.add(log);
    const cap = mesh(cyl8, materials.woodDark, [-0.18 + i * 0.18, 0.12 + i * 0.025, (i - 1) * 0.07], [0.083, 0.014, 0.083], 'dropWoodCap');
    cap.rotation.z = Math.PI / 2;
    cap.rotation.y = log.rotation.y;
    cap.position.x -= 0.22;
    g.add(cap);
  }
  g.add(mesh(sphere8, materials.glow, [0.04, 0.34, 0.02], [0.045, 0.045, 0.045], 'dropGlint'));
  return g;
}

function makeGenericDrop(drop: ResourceDropSave): THREE.Group {
  const g = new THREE.Group();
  g.name = `resource-drop-${drop.item}-${drop.id}`;
  const material =
    drop.item === 'rock' ? materials.stone
    : drop.item === 'sand' ? materials.sand
    : drop.item === 'snow' ? materials.snow
    : drop.item === 'dirt' ? materials.soil
    : materials.glow;
  for (let i = 0; i < Math.max(1, Math.min(3, drop.count)); i++) {
    const chip = mesh(box, material, [-0.1 + i * 0.1, 0.12 + i * 0.035, (i % 2) * 0.08], [0.16, 0.12, 0.14], 'dropChip');
    chip.rotation.set(i * 0.4, i * 0.7, i * 0.22);
    g.add(chip);
  }
  g.add(mesh(sphere8, materials.glow, [0.04, 0.32, 0.02], [0.04, 0.04, 0.04], 'dropGlint'));
  return g;
}

function makeDrop(drop: ResourceDropSave): THREE.Group {
  return drop.item === 'wood' ? makeWoodDrop(drop) : makeGenericDrop(drop);
}

export class ResourceDropRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'resource-drops';
    scene.add(this.group);
  }

  setDrops(drops: readonly ResourceDropSave[]): void {
    const wanted = new Set(drops.map((drop) => drop.id));
    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.group.remove(obj);
        this.objects.delete(id);
      }
    }
    for (const drop of drops) {
      if (this.objects.has(drop.id)) continue;
      const obj = makeDrop(drop);
      obj.userData.resourceDropId = drop.id;
      obj.userData.item = drop.item;
      obj.userData.tile = drop.tile;
      this.objects.set(drop.id, obj);
      this.group.add(obj);
    }
  }

  update(
    drops: readonly ResourceDropSave[],
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
    for (const drop of drops) {
      const obj = this.objects.get(drop.id);
      if (!obj) continue;
      const frame = geo.frameOf(drop.tile);
      const yaw = drop.id * 1.173 + drop.tile * 0.013;
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

      const ground = layers.topRadius(columns.groundLayerBelow(drop.tile, layers.bounds[0]));
      const toss = drop.age < RESOURCE_DROP_PICKUP_DELAY
        ? Math.sin((drop.age / RESOURCE_DROP_PICKUP_DELAY) * Math.PI) * 0.42
        : Math.sin(seconds * 4.3 + drop.id) * 0.035;
      const pulse = drop.age < RESOURCE_DROP_PICKUP_DELAY
        ? 0.72 + (drop.age / RESOURCE_DROP_PICKUP_DELAY) * 0.28
        : 1 + Math.sin(seconds * 3.1 + drop.id) * 0.045;
      const r = ground + 0.12 + toss;
      obj.position.set(
        c[drop.tile * 3] * r + vX.x * drop.offsetA + vZ.x * drop.offsetB - camWorld.x,
        c[drop.tile * 3 + 1] * r + vX.y * drop.offsetA + vZ.y * drop.offsetB - camWorld.y,
        c[drop.tile * 3 + 2] * r + vX.z * drop.offsetA + vZ.z * drop.offsetB - camWorld.z,
      );
      obj.scale.setScalar(pulse);
      obj.visible = true;
      obj.traverse((child) => {
        if (child.name === 'dropGlint') {
          const glint = 0.8 + Math.sin(seconds * 5.2 + drop.id) * 0.22;
          child.scale.setScalar(0.045 * glint);
          child.visible = drop.age >= RESOURCE_DROP_PICKUP_DELAY * 0.35;
        }
      });
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
