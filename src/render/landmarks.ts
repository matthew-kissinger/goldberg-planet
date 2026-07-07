import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import { WATER_SURFACE } from '../world/layers';
import {
  pentagonExpeditionSiteProfile,
  pentagonLandscapeProfileForIndex,
  pentagonSiteThresholdProfile,
  type PentagonLandscapeSilhouette,
  type PentagonSiteThresholdShape,
} from '../sim/landmarks';
import type {
  KilnAssetSnapshot,
  KilnLandmarkSkinFitSnapshot,
  KilnLandmarkSkinSlug,
  LandmarkSkinProvider,
} from './kilnAssets';
import { makeSurfaceBasisFromYaw } from './surfaceFrame';

function mat(color: number, roughness = 0.8, metalness = 0.02, emissive = 0x000000, intensity = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive === 0 ? 0 : intensity });
}

const materials = {
  basalt: mat(0x3d4650, 0.92),
  rim: mat(0x8f9baa, 0.7, 0.08),
  rune: mat(0x74a7b8, 0.48, 0.05, 0x1c6f8c, 0.35),
  glow: mat(0xf1cf79, 0.35, 0.02, 0xffb13d, 1.2),
  quietGlow: mat(0x4f6473, 0.65, 0.02, 0x172f3c, 0.2),
  thresholdDormant: mat(0x2f3d48, 0.9, 0.03, 0x0f2230, 0.1),
  thresholdAwake: mat(0x7396a8, 0.72, 0.04, 0x325f73, 0.24),
  thresholdOpen: mat(0x9fe8cb, 0.52, 0.06, 0x65d9b0, 0.86),
  thresholdWater: mat(0x5faed2, 0.44, 0.02, 0x3aa7d8, 0.62),
};

const domainColors = [
  0xd48754,
  0x6aa6c8,
  0x69b6a7,
  0xe4cf77,
  0x77b864,
  0xb35d4d,
  0xaed6e8,
  0xd9c98a,
  0x9f77c8,
  0x80b96f,
  0x6fc0bc,
  0xc5a86a,
] as const;

const domainMaterials = domainColors.map((color) => mat(color, 0.76, 0.03, color, 0.18));

const cyl5 = new THREE.CylinderGeometry(0.5, 0.5, 1, 5);
const cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const box = new THREE.BoxGeometry(1, 1, 1);
const cone5 = new THREE.ConeGeometry(0.5, 1, 5);
const cone6 = new THREE.ConeGeometry(0.5, 1, 6);
const sphere = new THREE.SphereGeometry(0.5, 10, 8);

const KILN_LANDMARK_SKIN_BY_INDEX: readonly KilnLandmarkSkinSlug[] = [
  'shrine-first-hearth',
  'shrine-rainward-gate',
  'shrine-salt-mirror',
  'shrine-high-lantern',
  'shrine-root-vault',
  'shrine-red-cairn',
  'shrine-snow-dial',
  'shrine-glass-shoal',
  'shrine-storm-seat',
  'shrine-reed-crown',
  'shrine-deep-bell',
  'shrine-last-horizon',
];

const PROCEDURAL_LANDMARK_SHELL_PARTS = new Set([
  'landscapeOuterRing',
  'landscapeRib',
  'landscapeMarker',
  'landscapeCrown',
  'pentagonBase',
  'metalRim',
  'outerPillar',
  'runeSlab',
  'topCap',
]);

const PROCEDURAL_LANDMARK_OVERLAYS = new Set(['landscapeApron', 'domainHalo', 'quietCore', 'awakenedOrb', 'signalBeam']);

function basisDeterminant(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3): number {
  return x.x * (y.y * z.z - y.z * z.y)
    - x.y * (y.x * z.z - y.z * z.x)
    + x.z * (y.x * z.y - y.y * z.x);
}

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.userData.baseScale = scale;
  m.receiveShadow = true;
  return m;
}

function addThresholdPart(g: THREE.Group, geom: THREE.BufferGeometry, pos: [number, number, number], scale: [number, number, number], name: string, yaw = 0, role?: string): void {
  const part = mesh(geom, materials.thresholdDormant, pos, scale, name);
  part.rotation.y = yaw;
  if (role) part.userData.assetRole = role;
  g.add(part);
}

function makeThreshold(g: THREE.Group, shape: PentagonSiteThresholdShape, index: number): void {
  const a = Math.PI + index * 0.031;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const place = (x: number, y: number, z: number): [number, number, number] => {
    const px = x * ca - z * sa;
    const pz = x * sa + z * ca;
    return [px, y, pz];
  };
  const yaw = -a;
  const radius = 3.32;
  if (shape === 'lowArch') {
    addThresholdPart(g, box, place(-0.52, 0.45, radius), [0.16, 0.92, 0.22], 'thresholdHearthPost', yaw, 'walk-under support');
    addThresholdPart(g, box, place(0.52, 0.45, radius), [0.16, 0.92, 0.22], 'thresholdHearthPost', yaw, 'walk-under support');
    addThresholdPart(g, box, place(0, 1.05, radius), [0.92, 0.16, 0.24], 'thresholdHearthLintel', yaw, 'home doorway lintel');
    addThresholdPart(g, cyl6, place(0, 0.08, radius + 0.04), [0.7, 0.018, 0.42], 'thresholdHearthFootstone', yaw, 'duck-under floor');
    addThresholdPart(g, sphere, place(0, 0.32, radius - 0.22), [0.12, 0.06, 0.12], 'thresholdHearthWarmthBowl', yaw, 'warm home cue');
    return;
  }
  if (shape === 'underpass') {
    addThresholdPart(g, cyl6, place(0, 0.08, radius + 0.1), [0.78, 0.02, 0.48], 'thresholdTideCrawlFloor', yaw, 'crawlable shore floor');
    addThresholdPart(g, cyl6, place(0, 0.2, radius + 0.12), [0.68, 0.026, 0.68], 'thresholdTideWaterline', yaw, 'tide waterline');
    for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * 0.23;
      const rib = mesh(box, materials.thresholdDormant, place(spread, 0.43 + Math.abs(i - 2) * 0.025, radius), [0.07, 0.68 - Math.abs(i - 2) * 0.05, 0.17], 'thresholdTideRib');
      rib.rotation.y = yaw;
      rib.rotation.z = spread * -0.28;
      rib.userData.assetRole = 'shore underpass ribs';
      rib.userData.baseScale = [0.07, 0.68 - Math.abs(i - 2) * 0.05, 0.17];
      g.add(rib);
    }
    addThresholdPart(g, box, place(0, 0.73, radius), [0.8, 0.08, 0.18], 'thresholdTideLowRoof', yaw, 'low crawl roof');
    return;
  }
  if (shape === 'cutGate') {
    addThresholdPart(g, cyl6, place(0, 0.08, radius + 0.02), [0.95, 0.016, 0.46], 'thresholdScreeCutFloor', yaw, 'tool-route floor cut');
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1;
      const row = i % 2;
      const slab = mesh(box, materials.thresholdDormant, place(side * (0.38 + row * 0.14), 0.34 + row * 0.1, radius + row * 0.05), [0.22, 0.72 - row * 0.12, 0.18], 'thresholdScreeCutWall');
      slab.rotation.y = yaw + side * (0.15 + row * 0.06);
      slab.rotation.z = side * -0.16;
      slab.userData.assetRole = 'split red scree walls';
      slab.userData.baseScale = [0.22, 0.72 - row * 0.12, 0.18];
      g.add(slab);
    }
    addThresholdPart(g, box, place(0, 0.48, radius - 0.08), [0.12, 0.42, 0.05], 'thresholdScreeSeam', yaw, 'pick-readable seam');
    return;
  }
  if (shape === 'vaneGate') {
    addThresholdPart(g, cyl6, place(0, 0.08, radius), [0.74, 0.02, 0.5], 'thresholdHorizonReturnPad', yaw, 'return-route pad');
    addThresholdPart(g, box, place(-0.48, 0.72, radius), [0.08, 1.28, 0.1], 'thresholdHorizonPost', yaw, 'departure post');
    addThresholdPart(g, box, place(0.48, 0.72, radius), [0.08, 1.28, 0.1], 'thresholdHorizonPost', yaw, 'departure post');
    addThresholdPart(g, box, place(0, 1.32, radius), [0.98, 0.07, 0.12], 'thresholdHorizonSightline', yaw, 'route sightline');
    for (let i = 0; i < 3; i++) {
      const spread = (i - 1) * 0.24;
      const vane = mesh(cone6, materials.thresholdDormant, place(spread, 1.8 + Math.abs(spread) * 0.25, radius + i * 0.045), [0.08, 0.74 + i * 0.08, 0.08], 'thresholdHorizonVane');
      vane.rotation.y = yaw + Math.PI / 6 + spread * 0.5;
      vane.rotation.z = spread * 0.18;
      vane.userData.assetRole = 'long-route wind vane';
      vane.userData.baseScale = [0.08, 0.74 + i * 0.08, 0.08];
      g.add(vane);
    }
    return;
  }
  if (shape === 'fins') {
    for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * 0.28;
      const slab = mesh(box, materials.thresholdDormant, place(spread, 0.16 + (i % 2) * 0.035, radius + Math.abs(spread) * 0.06), [0.28, 0.085, 0.28], 'thresholdScreeSlab');
      slab.rotation.y = yaw + (i - 2) * 0.16;
      slab.rotation.z = (i % 2 === 0 ? 0.08 : -0.05);
      g.add(slab);
    }
    addThresholdPart(g, cyl6, place(0, 0.07, radius + 0.02), [0.86, 0.016, 0.54], 'thresholdScreeCutFloor', yaw);
    return;
  }
  if (shape === 'stormPocket') {
    addThresholdPart(g, cyl6, place(0, 0.08, radius), [0.94, 0.018, 0.62], 'thresholdStormBowlFloor', yaw);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const spread = (t - 0.5) * 1.12;
      const depth = Math.sin(t * Math.PI) * 0.18;
      const stone = mesh(sphere, materials.thresholdDormant, place(spread, 0.2 + (i % 2) * 0.04, radius + 0.1 + depth), [0.14 + (i % 3) * 0.03, 0.13, 0.1], 'thresholdStormPocketStone');
      stone.rotation.y = yaw + spread * 0.45;
      stone.rotation.z = spread * -0.1;
      g.add(stone);
    }
    for (let i = 0; i < 3; i++) {
      const ribbon = mesh(box, materials.thresholdDormant, place((i - 1) * 0.22, 0.46 + i * 0.04, radius - 0.08 + i * 0.05), [0.22, 0.026, 0.045], 'thresholdStormRibbon');
      ribbon.rotation.y = yaw + 0.55 + i * 0.2;
      ribbon.rotation.z = -0.18 + i * 0.11;
      g.add(ribbon);
    }
    return;
  }
  if (shape === 'steppedTerrace' || shape === 'glassLedge') {
    for (let i = 0; i < 3; i++) {
      addThresholdPart(g, box, place(0, 0.08 + i * 0.11, radius + i * 0.24), [0.98 - i * 0.16, 0.055, 0.28], 'thresholdTerrace', yaw);
    }
    if (shape === 'glassLedge') addThresholdPart(g, box, place(0, 0.42, radius + 0.44), [0.72, 0.035, 0.075], 'thresholdGlassLine', yaw);
    return;
  }
  if (shape === 'skylight') {
    addThresholdPart(g, cyl6, place(0, 0.72, radius), [0.44, 0.08, 0.44], 'thresholdSkylightRing', yaw);
    addThresholdPart(g, cone6, place(0, 1.36, radius), [0.16, 1.05, 0.16], 'thresholdSkylightNeedle', yaw);
    return;
  }
  if (shape === 'rootRoom' || shape === 'bellChamber') {
    addThresholdPart(g, sphere, place(0, 0.34, radius), [0.72, shape === 'bellChamber' ? 0.38 : 0.28, 0.42], 'thresholdChamber', yaw);
    addThresholdPart(g, cyl5, place(0, 0.62, radius), [0.28, 0.4, 0.28], shape === 'bellChamber' ? 'thresholdBellCore' : 'thresholdRootCore', yaw);
    return;
  }
  if (shape === 'springMouth') {
    addThresholdPart(g, cyl6, place(0, 0.14, radius), [0.62, 0.035, 0.42], 'thresholdSpringMouth', yaw);
    addThresholdPart(g, cone6, place(-0.36, 0.56, radius + 0.08), [0.07, 0.92, 0.07], 'thresholdReed', yaw);
    addThresholdPart(g, cone6, place(0.36, 0.5, radius - 0.04), [0.07, 0.8, 0.07], 'thresholdReed', yaw + 0.12);
  }
}

function makeLandmark(index: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `pentagon-landmark-${index}`;
  const landscape = pentagonLandscapeProfileForIndex(index);
  const threshold = pentagonSiteThresholdProfile(pentagonExpeditionSiteProfile(landscape.effect).kind);
  const domainMaterial = domainMaterials[index % domainMaterials.length];
  g.userData.landscapeProfile = landscape;
  g.userData.thresholdProfile = threshold;
  g.add(mesh(cyl5, domainMaterial, [0, 0.026, 0], [3.55, 0.014, 3.55], 'landscapeApron'));
  g.add(mesh(cyl5, materials.basalt, [0, 0.042, 0], [3.05, 0.018, 3.05], 'landscapeOuterRing'));
  for (let i = 0; i < landscape.ribCount; i++) {
    const a = (i / landscape.ribCount) * Math.PI * 2 + index * 0.047;
    const radius = 2.32 + (i % 2) * 0.18;
    const rib = mesh(
      box,
      i % 3 === 0 ? materials.rim : domainMaterial,
      [Math.cos(a) * radius, 0.096, Math.sin(a) * radius],
      [0.82 + landscape.ribCount * 0.045, 0.045, 0.11 + (i % 3) * 0.025],
      'landscapeRib',
    );
    rib.rotation.y = -a;
    g.add(rib);
  }
  const markerGeom = (silhouette: PentagonLandscapeSilhouette): THREE.BufferGeometry =>
    silhouette === 'root-knuckles' || silhouette === 'hearth-ring' || silhouette === 'bell-stones'
      ? sphere
      : silhouette === 'rain-fins' || silhouette === 'horizon-vanes'
      ? box
      : silhouette === 'salt-ribs' || silhouette === 'snow-steps'
      ? cyl6
      : cone6;
  for (let i = 0; i < landscape.markerCount; i++) {
    const a = (i / landscape.markerCount) * Math.PI * 2 + Math.PI / landscape.markerCount + index * 0.083;
    const h = landscape.markerHeight * (0.78 + (i % 3) * 0.12);
    const width = landscape.silhouette === 'reed-crown' ? 0.075 : landscape.silhouette === 'glass-teeth' ? 0.105 : 0.16;
    const marker = mesh(
      markerGeom(landscape.silhouette),
      i % 2 === 0 ? domainMaterial : materials.basalt,
      [Math.cos(a) * 2.78, 0.18 + h * 0.28, Math.sin(a) * 2.78],
      [width, h, width * (landscape.silhouette === 'horizon-vanes' ? 2.4 : 1)],
      'landscapeMarker',
    );
    marker.rotation.y = -a;
    marker.rotation.z = landscape.silhouette === 'storm-prongs' ? 0.24 * (i % 2 === 0 ? 1 : -1) : 0;
    g.add(marker);
  }
  const crown = mesh(
    landscape.silhouette === 'lantern-spires' || landscape.silhouette === 'storm-prongs' ? cone5 : cyl5,
    domainMaterial,
    [0, 0.2 + landscape.markerHeight * 0.32, 0],
    [0.24, 0.42 + landscape.markerHeight * 0.22, 0.24],
    'landscapeCrown',
  );
  crown.rotation.y = Math.PI / 5 + index * 0.07;
  g.add(crown);
  g.add(mesh(cyl5, domainMaterial, [0, 0.045, 0], [2.1, 0.035, 2.1], 'domainHalo'));
  g.add(mesh(cyl5, materials.basalt, [0, 0.11, 0], [1.55, 0.22, 1.55], 'pentagonBase'));
  g.add(mesh(cyl5, materials.rim, [0, 0.26, 0], [1.22, 0.08, 1.22], 'metalRim'));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + index * 0.09;
    const x = Math.cos(a) * 0.92;
    const z = Math.sin(a) * 0.92;
    const p = mesh(cyl6, materials.basalt, [x, 0.72, z], [0.12, 0.92, 0.12], 'outerPillar');
    p.rotation.y = a;
    g.add(p);
    const r = mesh(box, domainMaterial, [Math.cos(a) * 0.62, 0.48, Math.sin(a) * 0.62], [0.1, 0.34, 0.05], 'runeSlab');
    r.rotation.y = -a;
    g.add(r);
  }
  const core = mesh(cone5, materials.quietGlow, [0, 1.15, 0], [0.36, 1.05, 0.36], 'quietCore');
  core.rotation.y = Math.PI / 5;
  g.add(core);
  const cap = mesh(cone5, materials.rim, [0, 1.82, 0], [0.42, 0.35, 0.42], 'topCap');
  cap.rotation.x = Math.PI;
  cap.rotation.y = Math.PI / 5;
  g.add(cap);
  g.add(mesh(sphere, materials.glow, [0, 1.58, 0], [0.24, 0.24, 0.24], 'awakenedOrb'));
  g.add(mesh(cyl6, materials.glow, [0, 2.05, 0], [0.04, 1.1, 0.04], 'signalBeam'));
  makeThreshold(g, threshold.shape, index);
  return g;
}

export class LandmarkRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();
  private readonly kilnSkinStatus = new Map<number, 'pending' | 'loaded' | 'fallback'>();

  constructor(scene: THREE.Scene, pentagonTiles: readonly number[], private readonly kilnAssets?: LandmarkSkinProvider) {
    this.group.name = 'pentagon-landmarks';
    scene.add(this.group);
    for (let i = 0; i < pentagonTiles.length; i++) {
      const tile = pentagonTiles[i];
      const obj = makeLandmark(i);
      obj.userData.tile = tile;
      obj.userData.index = i;
      this.objects.set(tile, obj);
      this.group.add(obj);
      this.attachKilnSkin(i, tile, obj);
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
    completedSites: ReadonlySet<number> = new Set(),
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
      const yaw = i * 0.31;
      makeSurfaceBasisFromYaw(frame, yaw, m, vX, vY, vZ);
      obj.userData.surfaceBasisDeterminant = basisDeterminant(vX, vY, vZ);
      obj.userData.surfaceUpDot = vY.x * frame.normal[0] + vY.y * frame.normal[1] + vY.z * frame.normal[2];
      obj.setRotationFromMatrix(m);
      const ground = layers.topRadius(columns.groundLayerBelow(tile, layers.bounds[0]));
      const r = Math.max(ground + 0.05, WATER_SURFACE + 0.18);
      obj.position.set(
        c[tile * 3] * r - camWorld.x,
        c[tile * 3 + 1] * r - camWorld.y,
        c[tile * 3 + 2] * r - camWorld.z,
      );
      const known = discovered.has(tile);
      const completed = completedSites.has(tile);
      const pulse = known ? 1 + Math.sin(seconds * 2.2 + i) * 0.12 : 1;
      obj.traverse((child) => {
        if (child.name === 'awakenedOrb' || child.name === 'signalBeam') child.visible = known;
        if (child.name === 'quietCore') child.visible = !known;
        if (child.name === 'domainHalo') {
          const haloPulse = known ? 1.02 + Math.sin(seconds * 1.2 + i) * 0.035 : 1;
          child.scale.set(2.1 * haloPulse, 0.035, 2.1 * haloPulse);
        }
        if (child.name === 'landscapeApron') {
          const apronPulse = known ? 1.02 + Math.sin(seconds * 0.7 + i) * 0.018 : 1;
          child.scale.set(3.55 * apronPulse, 0.014, 3.55 * apronPulse);
        }
        if (child.name === 'landscapeCrown') {
          child.rotation.y = Math.PI / 5 + i * 0.07 + seconds * (known ? 0.42 : 0.12);
        }
        if (child.name === 'awakenedOrb') child.scale.setScalar(0.24 * pulse);
        if (child.name === 'signalBeam') child.scale.y = 1.1 + pulse * 0.28;
        if (child.name.startsWith('threshold')) {
          const m = child as THREE.Mesh;
          if (m.isMesh) {
            m.material = child.name === 'thresholdSpringMouth' || child.name === 'thresholdTideWaterline'
              ? materials.thresholdWater
              : completed ? materials.thresholdOpen : known ? materials.thresholdAwake : materials.thresholdDormant;
          }
          child.visible = true;
          const thresholdPulse = completed ? 1 + Math.sin(seconds * 1.9 + i) * 0.08 : known ? 1.02 : 1;
          const base = Array.isArray(child.userData.baseScale) ? child.userData.baseScale as [number, number, number] : [child.scale.x, child.scale.y, child.scale.z];
          if (
            child.name.includes('Lintel') ||
            child.name.includes('Sightline') ||
            child.name.includes('Vane') ||
            child.name === 'thresholdSkylightNeedle' ||
            child.name === 'thresholdBellCore' ||
            child.name === 'thresholdRootCore'
          ) {
            child.scale.set(base[0], base[1] * thresholdPulse, base[2]);
          } else {
            child.scale.set(base[0], base[1], base[2]);
          }
        }
      });
    }
  }

  private attachKilnSkin(index: number, tile: number, obj: THREE.Group): void {
    if (!this.kilnAssets) return;
    const slug = KILN_LANDMARK_SKIN_BY_INDEX[index % KILN_LANDMARK_SKIN_BY_INDEX.length];
    this.kilnSkinStatus.set(tile, 'pending');
    obj.userData.kilnLandmarkSkinStatus = 'pending';
    obj.userData.kilnAssetSlug = slug;
    obj.userData.kilnLandmarkIndex = index;
    void this.kilnAssets.createLandmarkSkinTemplate(slug)
      .then((template) => {
        const current = this.objects.get(tile);
        if (current !== obj || obj.parent !== this.group) return;
        if (!template) {
          this.kilnSkinStatus.set(tile, 'fallback');
          obj.userData.kilnLandmarkSkinStatus = 'fallback';
          return;
        }
        const skin = template.template.clone(true);
        skin.name = `kiln-landmark-skin-${slug}`;
        skin.userData.kilnAssetSlug = slug;
        skin.userData.kilnLandmarkIndex = index;
        skin.userData.kilnLandmarkSkin = true;
        skin.userData.kilnLandmarkFit = template.fit;
        skin.traverse((child) => {
          child.userData.kilnAssetSlug = slug;
          child.userData.kilnLandmarkIndex = index;
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = false;
            mesh.receiveShadow = true;
          }
        });
        obj.add(skin);
        this.hideProceduralLandmarkShell(obj);
        this.kilnSkinStatus.set(tile, 'loaded');
        obj.userData.kilnLandmarkSkinStatus = 'loaded';
        obj.userData.kilnAssetSlug = slug;
        obj.userData.kilnAssetFile = template.manifest.file;
        obj.userData.kilnAssetSourceUrl = template.sourceUrl;
        obj.userData.kilnLandmarkSkinFit = template.fit;
      })
      .catch((err: unknown) => {
        const current = this.objects.get(tile);
        if (current !== obj || obj.parent !== this.group) return;
        this.kilnSkinStatus.set(tile, 'fallback');
        obj.userData.kilnLandmarkSkinStatus = 'fallback';
        obj.userData.kilnLandmarkSkinError = err instanceof Error ? err.message : String(err);
      });
  }

  private hideProceduralLandmarkShell(obj: THREE.Group): void {
    obj.traverse((child) => {
      if (child.userData.kilnAssetSlug) return;
      if (PROCEDURAL_LANDMARK_SHELL_PARTS.has(child.name)) child.visible = false;
    });
  }

  stats(): {
    groups: number;
    meshes: number;
    landscapeMeshes: number;
    thresholdMeshes: number;
    profiles: number;
    thresholds: number;
    thresholdAssetRoles: number;
    proceduralLandmarkShellPartsVisible: number;
    proceduralLandmarkOverlaysVisible: number;
    proceduralThresholdPartsVisible: number;
    kilnLandmarkSkinsLoaded: number;
    kilnLandmarkSkinsPending: number;
    kilnLandmarkSkinFallbacks: number;
    kilnLandmarkGlbMeshesVisible: number;
    surfaceBasisDeterminantMin: number;
    surfaceUpDotMin: number;
    kilnLandmarkSkinsBySlug: Partial<Record<KilnLandmarkSkinSlug, { loaded: number; pending: number; fallback: number }>>;
    kilnLandmarkSkinFits: Partial<Record<KilnLandmarkSkinSlug, KilnLandmarkSkinFitSnapshot>>;
    kilnAssets?: KilnAssetSnapshot;
  } {
    let meshes = 0;
    let landscapeMeshes = 0;
    let thresholdMeshes = 0;
    let proceduralLandmarkShellPartsVisible = 0;
    let proceduralLandmarkOverlaysVisible = 0;
    let proceduralThresholdPartsVisible = 0;
    let kilnLandmarkSkinsLoaded = 0;
    let kilnLandmarkSkinsPending = 0;
    let kilnLandmarkSkinFallbacks = 0;
    let kilnLandmarkGlbMeshesVisible = 0;
    let surfaceBasisDeterminantMin = Infinity;
    let surfaceUpDotMin = Infinity;
    const kilnLandmarkSkinsBySlug: Partial<Record<KilnLandmarkSkinSlug, { loaded: number; pending: number; fallback: number }>> = {};
    const kilnLandmarkSkinFits: Partial<Record<KilnLandmarkSkinSlug, KilnLandmarkSkinFitSnapshot>> = {};
    const profiles = new Set<string>();
    const thresholds = new Set<string>();
    const thresholdAssetRoles = new Set<string>();
    for (const obj of this.objects.values()) {
      if (typeof obj.userData.landscapeProfile?.silhouette === 'string') profiles.add(obj.userData.landscapeProfile.silhouette);
      if (typeof obj.userData.thresholdProfile?.shape === 'string') thresholds.add(obj.userData.thresholdProfile.shape);
      const skinStatus = obj.userData.kilnLandmarkSkinStatus as 'pending' | 'loaded' | 'fallback' | undefined;
      const skinSlug = obj.userData.kilnAssetSlug as KilnLandmarkSkinSlug | undefined;
      if (skinStatus === 'loaded') kilnLandmarkSkinsLoaded++;
      if (skinStatus === 'pending') kilnLandmarkSkinsPending++;
      if (skinStatus === 'fallback') kilnLandmarkSkinFallbacks++;
      if (skinSlug && skinStatus) {
        const entry = kilnLandmarkSkinsBySlug[skinSlug] ?? { loaded: 0, pending: 0, fallback: 0 };
        entry[skinStatus] += 1;
        kilnLandmarkSkinsBySlug[skinSlug] = entry;
      }
      if (skinSlug && obj.userData.kilnLandmarkSkinFit) {
        kilnLandmarkSkinFits[skinSlug] = obj.userData.kilnLandmarkSkinFit as KilnLandmarkSkinFitSnapshot;
      }
      if (typeof obj.userData.surfaceBasisDeterminant === 'number') {
        surfaceBasisDeterminantMin = Math.min(surfaceBasisDeterminantMin, obj.userData.surfaceBasisDeterminant);
      }
      if (typeof obj.userData.surfaceUpDot === 'number') {
        surfaceUpDotMin = Math.min(surfaceUpDotMin, obj.userData.surfaceUpDot);
      }
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshes++;
          if (child.name.startsWith('landscape')) landscapeMeshes++;
          if (child.name.startsWith('threshold')) thresholdMeshes++;
          if (child.name.startsWith('threshold') && typeof child.userData.assetRole === 'string') thresholdAssetRoles.add(child.userData.assetRole);
          if (child.userData.kilnAssetSlug && child.visible) kilnLandmarkGlbMeshesVisible++;
          if (!child.userData.kilnAssetSlug && PROCEDURAL_LANDMARK_SHELL_PARTS.has(child.name) && child.visible) {
            proceduralLandmarkShellPartsVisible++;
          }
          if (!child.userData.kilnAssetSlug && PROCEDURAL_LANDMARK_OVERLAYS.has(child.name) && child.visible) {
            proceduralLandmarkOverlaysVisible++;
          }
          if (!child.userData.kilnAssetSlug && child.name.startsWith('threshold') && child.visible) {
            proceduralThresholdPartsVisible++;
          }
        }
      });
    }
    return {
      groups: this.objects.size,
      meshes,
      landscapeMeshes,
      thresholdMeshes,
      profiles: profiles.size,
      thresholds: thresholds.size,
      thresholdAssetRoles: thresholdAssetRoles.size,
      proceduralLandmarkShellPartsVisible,
      proceduralLandmarkOverlaysVisible,
      proceduralThresholdPartsVisible,
      kilnLandmarkSkinsLoaded,
      kilnLandmarkSkinsPending,
      kilnLandmarkSkinFallbacks,
      kilnLandmarkGlbMeshesVisible,
      surfaceBasisDeterminantMin: Number.isFinite(surfaceBasisDeterminantMin) ? surfaceBasisDeterminantMin : 0,
      surfaceUpDotMin: Number.isFinite(surfaceUpDotMin) ? surfaceUpDotMin : 0,
      kilnLandmarkSkinsBySlug,
      kilnLandmarkSkinFits,
      kilnAssets: this.kilnAssets?.snapshot?.(),
    };
  }
}
