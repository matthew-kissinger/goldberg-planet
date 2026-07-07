import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import { WATER_SURFACE } from '../world/layers';
import type { SkyfallKind, SkyfallSite } from '../sim/skyfall';

function mat(color: number, roughness = 0.7, metalness = 0.05, emissive = 0x000000, intensity = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive === 0 ? 0 : intensity });
}

function beamMat(color: number, opacity = 0.24, intensity = 0.8): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.22,
    metalness: 0,
    emissive: color,
    emissiveIntensity: intensity,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

const kindColors: Record<SkyfallKind, { crust: number; shard: number; glow: number }> = {
  emberFall: { crust: 0x3f2b24, shard: 0xd86d38, glow: 0xff8b4a },
  glassRain: { crust: 0x4b5c62, shard: 0xc6e8df, glow: 0x9fe4e0 },
  starBloom: { crust: 0x4a4732, shard: 0xc7d77a, glow: 0xf0da7a },
};

const craterMat = mat(0x2f3735, 0.94, 0.02);
const shadowMat = mat(0x20292c, 0.96);
const cyl12 = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const cyl16 = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const cone8 = new THREE.ConeGeometry(0.5, 1, 8);
const sphere = new THREE.SphereGeometry(0.5, 12, 8);
const box = new THREE.BoxGeometry(1, 1, 1);

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.receiveShadow = true;
  return m;
}

function makeSite(site: SkyfallSite): THREE.Group {
  const colors = kindColors[site.kind];
  const crust = mat(colors.crust, 0.82, 0.08, colors.glow, 0.12);
  const shard = mat(colors.shard, 0.42, site.kind === 'glassRain' ? 0.18 : 0.07, colors.glow, 0.62);
  const glow = mat(colors.glow, 0.28, 0.04, colors.glow, 1.1);
  const beam = beamMat(colors.glow);
  const omenBeam = beamMat(colors.glow, 0.72, 2.15);
  const g = new THREE.Group();
  g.name = `skyfall-${site.kind}-${site.id}`;
  g.add(mesh(cyl16, shadowMat, [0, 0.022, 0], [1.05, 0.035, 1.05], 'skyfallShadow'));
  g.add(mesh(cyl12, craterMat, [0, 0.06, 0], [0.78, 0.055, 0.78], 'skyfallCraterRing'));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + site.id * 0.31;
    const rock = mesh(box, crust, [Math.cos(a) * 0.58, 0.13, Math.sin(a) * 0.58], [0.14, 0.07 + (i % 3) * 0.02, 0.08], 'skyfallCraterRock');
    rock.rotation.y = a;
    rock.rotation.z = 0.16 * Math.sin(a);
    g.add(rock);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.09 + site.id * 0.17;
    const chip = mesh(cone8, shard, [Math.cos(a) * 0.18, 0.32 + i * 0.08, Math.sin(a) * 0.18], [0.12 - i * 0.018, 0.48 - i * 0.06, 0.12 - i * 0.018], 'skyfallShard');
    chip.rotation.y = a;
    chip.rotation.z = 0.32 + i * 0.18;
    g.add(chip);
  }
  if (site.kind === 'starBloom') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = mesh(cone8, shard, [Math.cos(a) * 0.28, 0.25, Math.sin(a) * 0.28], [0.07, 0.26, 0.07], 'skyfallPetal');
      petal.rotation.y = a;
      petal.rotation.z = 0.9;
      g.add(petal);
    }
  }
  g.add(mesh(sphere, glow, [0, 0.52, 0], [0.12, 0.12, 0.12], 'skyfallCoreGlow'));
  g.add(mesh(cyl16, beam, [0, 0.18, 0], [0.95, 0.018, 0.95], 'skyfallSignalDisc'));
  g.add(mesh(cyl12, beam, [0, 2.55, 0], [0.32, 4.8, 0.32], 'skyfallFallingBeam'));
  g.add(mesh(cyl12, omenBeam, [0, 8.1, 0], [0.28, 10.6, 0.28], 'skyfallOmenTrail'));
  g.add(mesh(cyl16, omenBeam, [0, 13.4, 0], [2.05, 0.02, 2.05], 'skyfallOmenHalo'));
  for (let i = 0; i < 6; i++) {
    const a = i * 1.047 + site.id * 0.13;
    const omen = mesh(
      site.kind === 'starBloom' ? sphere : cone8,
      i % 2 === 0 ? glow : shard,
      [Math.cos(a) * 1.15, 13.2 + Math.sin(a) * 0.28, Math.sin(a) * 1.15],
      site.kind === 'glassRain' ? [0.055, 0.3, 0.055] : [0.07, 0.18, 0.07],
      `skyfallOmenShard${i}`,
    );
    omen.rotation.y = a;
    omen.rotation.z = 0.55 + i * 0.11;
    g.add(omen);
  }
  for (let i = 0; i < 8; i++) {
    const spark = mesh(sphere, glow, [0, 0.75, 0], [0.035, 0.035, 0.035], `skyfallSpark${i}`);
    g.add(spark);
  }
  return g;
}

export class SkyfallRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'skyfall-events';
    scene.add(this.group);
  }

  setSites(sites: readonly SkyfallSite[]): void {
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
      obj.userData.skyfallId = site.id;
      obj.userData.tile = site.tile;
      this.objects.set(site.id, obj);
      this.group.add(obj);
    }
  }

  update(
    sites: readonly SkyfallSite[],
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
      obj.visible = site.active && !site.harvested;
      if (!obj.visible) continue;
      const frame = geo.frameOf(site.tile);
      const yaw = site.id * 0.71;
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
      const ground = layers.topRadius(columns.groundLayerBelow(site.tile, layers.bounds[0]));
      const r = Math.max(ground + 0.1, WATER_SURFACE + 0.18);
      obj.position.set(
        c[site.tile * 3] * r - camWorld.x,
        c[site.tile * 3 + 1] * r - camWorld.y,
        c[site.tile * 3 + 2] * r - camWorld.z,
      );
      obj.scale.setScalar(2.8);
      const pulse = 1 + Math.sin(seconds * 2.8 + site.id) * 0.1;
      obj.traverse((child) => {
        if (child.name === 'skyfallCoreGlow') child.scale.setScalar(0.12 * pulse);
        if (child.name === 'skyfallSignalDisc') child.scale.set(1.0 * pulse, 0.018, 1.0 * pulse);
        if (child.name === 'skyfallFallingBeam') child.scale.set(0.34 * pulse, 4.8 + Math.sin(seconds * 1.4) * 0.35, 0.34 * pulse);
        if (child.name === 'skyfallOmenTrail') child.scale.set(0.28 * pulse, 10.6 + Math.sin(seconds * 0.85 + site.id) * 0.65, 0.28 * pulse);
        if (child.name === 'skyfallOmenHalo') child.scale.set(2.05 + pulse * 0.14, 0.02, 2.05 + pulse * 0.14);
        if (child.name === 'skyfallCraterRing') child.scale.set(0.78 + pulse * 0.04, 0.055, 0.78 + pulse * 0.04);
        if (child.name.startsWith('skyfallOmenShard')) {
          const i = Number(child.name.replace('skyfallOmenShard', '')) || 0;
          const a = seconds * (0.16 + i * 0.012) + i * 1.047 + site.id * 0.13;
          const radius = 1.08 + Math.sin(seconds * 0.55 + i) * 0.18;
          child.position.set(Math.cos(a) * radius, 13.15 + Math.sin(a * 1.3) * 0.42, Math.sin(a) * radius);
          child.rotation.y = a;
        }
        if (child.name.startsWith('skyfallSpark')) {
          const i = Number(child.name.replace('skyfallSpark', '')) || 0;
          const a = seconds * (0.8 + i * 0.03) + i * 0.78;
          const radius = 0.42 + Math.sin(seconds * 1.3 + i) * 0.06;
          child.position.set(Math.cos(a) * radius, 0.56 + Math.sin(a * 1.7) * 0.14, Math.sin(a) * radius);
        }
      });
    }
  }

  stats(): { groups: number; meshes: number; active: number; omens: number } {
    let meshes = 0;
    let active = 0;
    let omens = 0;
    for (const obj of this.objects.values()) {
      if (obj.visible) active++;
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshes++;
          if (child.name.startsWith('skyfallOmen')) omens++;
        }
      });
    }
    return { groups: this.objects.size, meshes, active, omens };
  }
}
