import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import { WATER_SURFACE } from '../world/layers';
import type { MurmurKind, MurmurSite } from '../sim/murmurs';
import { makeSurfaceBasisFromYaw } from './surfaceFrame';

function mat(color: number, roughness = 0.64, metalness = 0.04, emissive = 0x000000, intensity = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity: emissive === 0 ? 0 : intensity,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
}

const kindColors: Record<MurmurKind, { base: number; glow: number; dark: number }> = {
  windThread: { base: 0xcbd8ff, glow: 0x9db8ff, dark: 0x49516f },
  tideBell: { base: 0x9fe7d8, glow: 0x61d9c8, dark: 0x285f68 },
  rootWhisper: { base: 0xb7d27b, glow: 0x9bd661, dark: 0x405b33 },
  caveBreath: { base: 0x89b5ff, glow: 0x72e0ff, dark: 0x273e5a },
  starGlass: { base: 0xe4d2ff, glow: 0xc795ff, dark: 0x55406d },
};

const cyl16 = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const cyl24 = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
const cone8 = new THREE.ConeGeometry(0.5, 1, 8);
const sphere = new THREE.SphereGeometry(0.5, 12, 8);
const box = new THREE.BoxGeometry(1, 1, 1);

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.frustumCulled = false;
  return m;
}

function makeSite(site: MurmurSite): THREE.Group {
  const colors = kindColors[site.kind];
  const base = mat(colors.base, 0.5, 0.05, colors.glow, 0.35);
  const glow = mat(colors.glow, 0.28, 0.02, colors.glow, 0.9);
  const dark = mat(colors.dark, 0.78, 0.03, colors.glow, 0.12);
  const veil = mat(colors.glow, 0.2, 0, colors.glow, 0.75);
  veil.opacity = 0.25;

  const g = new THREE.Group();
  g.name = `worldMurmur-${site.kind}-${site.id}`;
  g.add(mesh(cyl24, veil, [0, 0.05, 0], [0.9, 0.025, 0.9], 'murmurListeningRing'));
  g.add(mesh(cyl16, dark, [0, 0.1, 0], [0.28, 0.08, 0.28], 'murmurGroundMark'));

  for (let i = 0; i < 3; i++) {
    const a = site.id * 0.21 + i * Math.PI * 2 / 3;
    const post = mesh(box, dark, [Math.cos(a) * 0.42, 0.34, Math.sin(a) * 0.42], [0.05, 0.42, 0.05], 'murmurPost');
    post.rotation.y = a;
    post.rotation.z = 0.18 * Math.sin(a);
    g.add(post);
  }

  if (site.kind === 'windThread') {
    for (let i = 0; i < 4; i++) {
      const strand = mesh(box, base, [0, 0.52 + i * 0.13, 0], [0.88 - i * 0.1, 0.018, 0.035], 'murmurWindThread');
      strand.rotation.y = i * 0.64;
      g.add(strand);
    }
  } else if (site.kind === 'tideBell') {
    g.add(mesh(cyl16, base, [0, 0.48, 0], [0.2, 0.42, 0.2], 'murmurBellStem'));
    g.add(mesh(sphere, glow, [0, 0.84, 0], [0.18, 0.14, 0.18], 'murmurBellGlow'));
  } else if (site.kind === 'rootWhisper') {
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      const root = mesh(cone8, base, [Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2], [0.05, 0.36, 0.05], 'murmurRootSpire');
      root.rotation.y = a;
      root.rotation.z = 0.85;
      g.add(root);
    }
  } else if (site.kind === 'caveBreath') {
    g.add(mesh(box, dark, [0, 0.18, 0], [0.72, 0.045, 0.1], 'murmurSeam'));
    for (let i = 0; i < 3; i++) g.add(mesh(sphere, glow, [0, 0.5 + i * 0.2, 0], [0.07, 0.035, 0.07], `murmurBreath${i}`));
  } else {
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5;
      const shard = mesh(cone8, base, [Math.cos(a) * 0.18, 0.52, Math.sin(a) * 0.18], [0.06, 0.38, 0.06], 'murmurGlassShard');
      shard.rotation.y = a;
      shard.rotation.z = 0.42;
      g.add(shard);
    }
  }

  for (let i = 0; i < 7; i++) {
    g.add(mesh(sphere, glow, [0, 0.7, 0], [0.035, 0.035, 0.035], `murmurMote${i}`));
  }
  return g;
}

export class MurmurRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'world-murmurs';
    scene.add(this.group);
  }

  setSites(sites: readonly MurmurSite[]): void {
    const wanted = new Set(sites.map((s) => s.id));
    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.group.remove(obj);
        this.objects.delete(id);
      }
    }
    for (const site of sites) {
      if (this.objects.has(site.id)) continue;
      const obj = makeSite(site);
      obj.userData.murmurId = site.id;
      obj.userData.tile = site.tile;
      this.objects.set(site.id, obj);
      this.group.add(obj);
    }
  }

  update(
    sites: readonly MurmurSite[],
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
    for (const site of sites) {
      const obj = this.objects.get(site.id);
      if (!obj) continue;
      obj.visible = site.active && !site.observed;
      if (!obj.visible) continue;
      const frame = geo.frameOf(site.tile);
      const yaw = site.id * 0.37;
      makeSurfaceBasisFromYaw(frame, yaw, m, vX, vY, vZ);
      obj.setRotationFromMatrix(m);
      const ground = layers.topRadius(columns.groundLayerBelow(site.tile, layers.bounds[0]));
      const r = Math.max(ground + 0.16, WATER_SURFACE + 0.24);
      obj.position.set(
        c[site.tile * 3] * r - camWorld.x,
        c[site.tile * 3 + 1] * r - camWorld.y,
        c[site.tile * 3 + 2] * r - camWorld.z,
      );
      const pulse = 1 + Math.sin(seconds * 2.1 + site.id * 0.2) * 0.08;
      obj.scale.setScalar(2.15 * pulse);
      obj.traverse((child) => {
        if (child.name === 'murmurListeningRing') child.scale.set(0.9 + pulse * 0.08, 0.025, 0.9 + pulse * 0.08);
        if (child.name.startsWith('murmurMote')) {
          const i = Number(child.name.replace('murmurMote', '')) || 0;
          const a = seconds * (0.74 + i * 0.04) + i * 0.9 + site.slot;
          const radius = 0.38 + Math.sin(seconds * 1.2 + i) * 0.07;
          child.position.set(Math.cos(a) * radius, 0.62 + Math.sin(a * 1.7) * 0.18, Math.sin(a) * radius);
        }
        if (child.name.startsWith('murmurBreath')) {
          const i = Number(child.name.replace('murmurBreath', '')) || 0;
          child.position.y = 0.45 + i * 0.2 + Math.sin(seconds * 1.8 + i) * 0.08;
          child.scale.set(0.07 + i * 0.018, 0.035, 0.07 + i * 0.018);
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
