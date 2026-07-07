import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import { WATER_SURFACE } from '../world/layers';
import type { DomainResourceKind, DomainResourceSite } from '../sim/domainResources';
import type {
  DomainResourceSkinProvider,
  KilnDomainResourceSkinFitSnapshot,
  KilnDomainResourceSkinSlug,
  KilnDomainResourceSkinTemplate,
} from './kilnAssets';

type ResourcePart = 'base' | 'core' | 'glow' | 'dormant';
type DomainResourceSilhouette =
  | 'coal-nodule'
  | 'rain-reeds'
  | 'salt-shells'
  | 'lamp-prism'
  | 'root-pods'
  | 'red-nodules'
  | 'snow-bloom'
  | 'glass-panes'
  | 'storm-amber'
  | 'reed-kelp'
  | 'bell-ribs'
  | 'horizon-vane';

function mat(color: number, roughness = 0.78, metalness = 0.03, emissive = 0x000000, intensity = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive === 0 ? 0 : intensity });
}

const kindColors: Record<DomainResourceKind, { core: number; glow: number }> = {
  hearthCoal: { core: 0x34271f, glow: 0xe1783e },
  rainReed: { core: 0x5d8f74, glow: 0x71b8d8 },
  saltShell: { core: 0xe6ddbd, glow: 0x83c7dd },
  lanternShard: { core: 0xe6c572, glow: 0xffd166 },
  rootPod: { core: 0x796038, glow: 0x8fbd5b },
  redNodule: { core: 0xa95545, glow: 0xe07052 },
  snowBloom: { core: 0xd6edf1, glow: 0xbfe8f2 },
  glassShard: { core: 0x9fd6d8, glow: 0xcfe9df },
  stormAmber: { core: 0xb87fd3, glow: 0xc48df0 },
  reedKelp: { core: 0x4f9f74, glow: 0x7ccf8d },
  bellCrystal: { core: 0x69c6c8, glow: 0x70d6d1 },
  horizonShard: { core: 0xc2a86b, glow: 0xf0cf7a },
};

const silhouettes: Record<DomainResourceKind, DomainResourceSilhouette> = {
  hearthCoal: 'coal-nodule',
  rainReed: 'rain-reeds',
  saltShell: 'salt-shells',
  lanternShard: 'lamp-prism',
  rootPod: 'root-pods',
  redNodule: 'red-nodules',
  snowBloom: 'snow-bloom',
  glassShard: 'glass-panes',
  stormAmber: 'storm-amber',
  reedKelp: 'reed-kelp',
  bellCrystal: 'bell-ribs',
  horizonShard: 'horizon-vane',
};

const KILN_DOMAIN_RESOURCE_SKIN_BY_KIND: Record<DomainResourceKind, KilnDomainResourceSkinSlug> = {
  hearthCoal: 'node-hearth-coal',
  rainReed: 'node-rain-reed',
  saltShell: 'node-salt-shell',
  lanternShard: 'node-lantern-shard',
  rootPod: 'node-root-pod',
  redNodule: 'node-red-nodule',
  snowBloom: 'node-snow-bloom',
  glassShard: 'node-glass-shard',
  stormAmber: 'node-storm-amber',
  reedKelp: 'node-reed-kelp',
  bellCrystal: 'node-bell-crystal',
  horizonShard: 'node-horizon-shard',
};

type DomainResourceSkinStatus = 'pending' | 'loaded' | 'fallback';

interface DomainResourceSkinBatch {
  slug: KilnDomainResourceSkinSlug;
  group: THREE.Group;
  template: KilnDomainResourceSkinTemplate;
  meshes: THREE.InstancedMesh[];
  capacity: number;
  count: number;
}

interface DomainResourceSkinStats {
  loaded: number;
  pending: number;
  fallback: number;
  batchedInstances: number;
  instancedMeshes: number;
}

const dormant = mat(0x59636a, 0.86, 0.02, 0x1d3137, 0.14);
const shadow = mat(0x3d4746, 0.92);
const ring = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const cyl8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const cone8 = new THREE.ConeGeometry(0.5, 1, 8);
const sphere = new THREE.SphereGeometry(0.5, 10, 8);
const box = new THREE.BoxGeometry(1, 1, 1);

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string, part?: ResourcePart): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.userData.baseScale = scale;
  if (part) m.userData.resourcePart = part;
  m.receiveShadow = true;
  return m;
}

function addReeds(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  for (let i = 0; i < 4; i++) {
    const a = i * 1.55;
    const reed = mesh(cyl8, core, [Math.cos(a) * 0.18, 0.42, Math.sin(a) * 0.18], [0.035, 0.74 + i * 0.05, 0.035], 'resourceRainReedStem', 'core');
    reed.rotation.z = 0.18 * Math.sin(a);
    g.add(reed);
    g.add(mesh(sphere, glow, [Math.cos(a) * 0.2, 0.82 + i * 0.05, Math.sin(a) * 0.2], [0.055, 0.055, 0.055], 'resourceRainDropGlow', 'glow'));
  }
}

function addShardCluster(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    const shard = mesh(cone8, core, [Math.cos(a) * 0.18, 0.36 + i * 0.08, Math.sin(a) * 0.18], [0.12, 0.58 - i * 0.08, 0.12], 'resourceShardClusterCore', 'core');
    shard.rotation.z = 0.25 * Math.cos(a);
    shard.rotation.y = a;
    g.add(shard);
  }
  g.add(mesh(sphere, glow, [0, 0.78, 0], [0.08, 0.08, 0.08], 'resourceShardClusterGlow', 'glow'));
}

function addLanternPrism(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  const post = mesh(cyl8, shadow, [0, 0.42, 0], [0.035, 0.82, 0.035], 'resourceLanternPost', 'core');
  g.add(post);
  const cross = mesh(box, shadow, [0, 0.84, 0], [0.42, 0.035, 0.045], 'resourceLanternYoke', 'core');
  cross.rotation.y = Math.PI / 4;
  g.add(cross);
  const prism = mesh(cone8, core, [0, 0.54, 0], [0.16, 0.46, 0.16], 'resourceLanternPrism', 'core');
  prism.rotation.x = Math.PI;
  prism.rotation.y = Math.PI / 8;
  g.add(prism);
  g.add(mesh(sphere, glow, [0, 0.52, 0], [0.12, 0.12, 0.12], 'resourceLanternLampGlow', 'glow'));
}

function addGlassPanes(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  for (let i = 0; i < 4; i++) {
    const a = -0.48 + i * 0.32;
    const pane = mesh(box, core, [Math.sin(a) * 0.22, 0.28 + i * 0.035, Math.cos(a) * 0.08], [0.34 - i * 0.035, 0.022, 0.18], 'resourceGlassPane', 'core');
    pane.rotation.y = a;
    pane.rotation.z = 0.08 - i * 0.035;
    g.add(pane);
  }
  const sight = mesh(box, glow, [0, 0.44, 0], [0.5, 0.016, 0.035], 'resourceGlassSightline', 'glow');
  sight.rotation.y = Math.PI / 8;
  g.add(sight);
}

function addBellRibs(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  g.add(mesh(sphere, core, [0, 0.26, 0], [0.22, 0.18, 0.22], 'resourceBellBowl', 'core'));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const rib = mesh(cyl8, core, [Math.cos(a) * 0.18, 0.46, Math.sin(a) * 0.18], [0.028, 0.54, 0.028], 'resourceBellRib', 'core');
    rib.rotation.z = 0.28 * Math.cos(a);
    rib.rotation.x = 0.18 * Math.sin(a);
    g.add(rib);
  }
  g.add(mesh(ring, glow, [0, 0.54, 0], [0.36, 0.012, 0.36], 'resourceBellResonanceRing', 'glow'));
  g.add(mesh(sphere, glow, [0, 0.7, 0], [0.055, 0.055, 0.055], 'resourceBellToneGlow', 'glow'));
}

function addHorizonVane(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  g.add(mesh(cyl8, shadow, [0, 0.25, 0], [0.035, 0.5, 0.035], 'resourceHorizonStake', 'core'));
  const beam = mesh(box, core, [0, 0.52, 0], [0.72, 0.045, 0.08], 'resourceHorizonBearingBar', 'core');
  beam.rotation.y = Math.PI / 9;
  g.add(beam);
  const near = mesh(cone8, core, [0.42, 0.52, 0], [0.1, 0.24, 0.1], 'resourceHorizonVaneArrow', 'core');
  near.rotation.z = -Math.PI / 2;
  near.rotation.y = Math.PI / 9;
  g.add(near);
  const far = mesh(cone8, core, [-0.42, 0.52, 0], [0.1, 0.24, 0.1], 'resourceHorizonVaneArrow', 'core');
  far.rotation.z = Math.PI / 2;
  far.rotation.y = Math.PI / 9;
  g.add(far);
  g.add(mesh(box, glow, [0, 0.62, 0], [0.54, 0.018, 0.03], 'resourceHorizonRouteGlow', 'glow'));
}

function addCoalEmber(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  g.add(mesh(sphere, core, [0, 0.2, 0], [0.28, 0.18, 0.24], 'resourceHearthCoal', 'core'));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.2;
    const crack = mesh(box, glow, [Math.cos(a) * 0.08, 0.3 + i * 0.012, Math.sin(a) * 0.08], [0.022, 0.018, 0.2], 'resourceCoalWarmCrack', 'glow');
    crack.rotation.y = a;
    g.add(crack);
  }
  g.add(mesh(ring, shadow, [0, 0.08, 0], [0.36, 0.018, 0.28], 'resourceCoalAshRing', 'core'));
}

function addRedStoneNodule(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  g.add(mesh(sphere, core, [0, 0.24, 0], [0.28, 0.2, 0.24], 'resourceRedStoneNodule', 'core'));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.25;
    const chip = mesh(box, core, [Math.cos(a) * 0.25, 0.15, Math.sin(a) * 0.25], [0.12, 0.045, 0.08], 'resourceRedToolChip', 'core');
    chip.rotation.y = a;
    g.add(chip);
  }
  const seam = mesh(box, glow, [0.02, 0.37, 0], [0.035, 0.2, 0.026], 'resourceRedPickSeam', 'glow');
  seam.rotation.z = 0.2;
  g.add(seam);
}

function addStormAmber(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  g.add(mesh(sphere, core, [0, 0.34, 0], [0.2, 0.28, 0.18], 'resourceStormAmberCore', 'core'));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.35;
    const charge = mesh(box, glow, [Math.cos(a) * 0.28, 0.38 + (i % 2) * 0.1, Math.sin(a) * 0.28], [0.24, 0.018, 0.035], 'resourceStormChargeRibbon', 'glow');
    charge.rotation.y = a + 0.6;
    charge.rotation.z = i % 2 === 0 ? 0.24 : -0.18;
    g.add(charge);
  }
  g.add(mesh(ring, glow, [0, 0.58, 0], [0.42, 0.01, 0.42], 'resourceStormAmberHalo', 'glow'));
}

function addKelpTangle(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26;
    const ribbon = mesh(box, core, [Math.cos(a) * 0.18, 0.34 + (i % 2) * 0.05, Math.sin(a) * 0.18], [0.055, 0.56 - i * 0.035, 0.028], 'resourceKelpRibbon', 'core');
    ribbon.rotation.y = a;
    ribbon.rotation.z = 0.3 * Math.sin(a);
    g.add(ribbon);
  }
  g.add(mesh(sphere, glow, [0, 0.3, 0], [0.07, 0.07, 0.07], 'resourceKelpWetGlow', 'glow'));
  const drift = mesh(box, shadow, [0, 0.18, 0], [0.48, 0.018, 0.12], 'resourceKelpDriftLine', 'core');
  drift.rotation.y = -0.45;
  g.add(drift);
}

function addBloom(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const petal = mesh(cone8, core, [Math.cos(a) * 0.16, 0.28, Math.sin(a) * 0.16], [0.08, 0.28, 0.08], 'resourceSnowPetal', 'core');
    petal.rotation.z = 0.85;
    petal.rotation.y = a;
    g.add(petal);
  }
  g.add(mesh(sphere, glow, [0, 0.35, 0], [0.09, 0.09, 0.09], 'resourceSnowBloomGlow', 'glow'));
}

function addPods(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  for (let i = 0; i < 3; i++) {
    const a = i * 2.15;
    g.add(mesh(sphere, core, [Math.cos(a) * 0.18, 0.22, Math.sin(a) * 0.18], [0.14, 0.18, 0.14], 'resourceRootPod', 'core'));
    const root = mesh(cyl8, shadow, [Math.cos(a) * 0.1, 0.12, Math.sin(a) * 0.1], [0.025, 0.42, 0.025], 'resourceRootTendril', 'core');
    root.rotation.z = Math.PI / 2;
    root.rotation.y = a;
    g.add(root);
  }
  g.add(mesh(sphere, glow, [0, 0.42, 0], [0.06, 0.06, 0.06], 'resourceRootGlow', 'glow'));
}

function addShells(g: THREE.Group, core: THREE.Material, glow: THREE.Material): void {
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57;
    const shell = mesh(sphere, core, [Math.cos(a) * 0.2, 0.16, Math.sin(a) * 0.2], [0.18, 0.045, 0.25], 'resourceSaltShell', 'core');
    shell.rotation.y = a;
    g.add(shell);
  }
  g.add(mesh(box, glow, [0, 0.24, 0], [0.08, 0.035, 0.2], 'resourceSaltGlint', 'glow'));
}

function makeSite(site: DomainResourceSite): THREE.Group {
  const g = new THREE.Group();
  g.name = `domain-resource-${site.kind}-${site.id}`;
  g.userData.resourceKind = site.kind;
  g.userData.resourceSilhouette = silhouettes[site.kind];
  const colors = kindColors[site.kind];
  const core = mat(colors.core, 0.68, site.kind.includes('Shard') || site.kind.includes('Crystal') ? 0.12 : 0.03, colors.glow, 0.18);
  const glow = mat(colors.glow, 0.38, 0.06, colors.glow, 0.85);
  g.add(mesh(ring, shadow, [0, 0.035, 0], [0.58, 0.045, 0.58], 'resourceBase', 'base'));
  g.add(mesh(sphere, dormant, [0, 0.2, 0], [0.18, 0.12, 0.18], 'dormantCore', 'dormant'));
  if (site.kind === 'rainReed') addReeds(g, core, glow);
  else if (site.kind === 'reedKelp') addKelpTangle(g, core, glow);
  else if (site.kind === 'lanternShard') addLanternPrism(g, core, glow);
  else if (site.kind === 'glassShard') addGlassPanes(g, core, glow);
  else if (site.kind === 'bellCrystal') addBellRibs(g, core, glow);
  else if (site.kind === 'horizonShard') addHorizonVane(g, core, glow);
  else if (site.kind === 'rootPod') addPods(g, core, glow);
  else if (site.kind === 'saltShell') addShells(g, core, glow);
  else if (site.kind === 'snowBloom') addBloom(g, core, glow);
  else if (site.kind === 'hearthCoal') addCoalEmber(g, core, glow);
  else if (site.kind === 'redNodule') addRedStoneNodule(g, core, glow);
  else if (site.kind === 'stormAmber') addStormAmber(g, core, glow);
  else addShardCluster(g, core, glow);
  return g;
}

function capacityForSiteCount(count: number): number {
  let capacity = 16;
  while (capacity < count) capacity *= 2;
  return capacity;
}

function makeDomainResourceSkinBatch(template: KilnDomainResourceSkinTemplate, capacity: number): DomainResourceSkinBatch {
  const group = new THREE.Group();
  group.name = `kiln-domain-resource-batch-${template.slug}`;
  group.userData.kilnAssetSlug = template.slug;
  group.userData.kilnDomainResourceKind = template.kind;
  group.userData.kilnDomainResourceSkinFit = template.fit;
  const meshes = template.parts.map((part, index) => {
    const instanced = new THREE.InstancedMesh(part.geometry, part.material, capacity);
    instanced.name = `${part.name}-domain-resource-batch`;
    instanced.count = 0;
    instanced.frustumCulled = false;
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanced.userData.kilnAssetSlug = template.slug;
    instanced.userData.kilnDomainResourceKind = template.kind;
    instanced.userData.kilnSourceMeshNames = part.sourceMeshNames;
    instanced.userData.kilnSourceMeshCount = part.sourceMeshCount;
    instanced.userData.kilnBatchPartIndex = index;
    group.add(instanced);
    return instanced;
  });
  return { slug: template.slug, group, template, meshes, capacity, count: 0 };
}

function domainNodeScale(fit: KilnDomainResourceSkinFitSnapshot): number {
  const footprint = Math.max(fit.normalizedBboxSize[0] ?? 0, fit.normalizedBboxSize[2] ?? 0, 0.001);
  return Math.max(0.38, Math.min(2.35, 0.78 / footprint));
}

export class DomainResourceRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();
  private readonly skinTemplates = new Map<KilnDomainResourceSkinSlug, KilnDomainResourceSkinTemplate>();
  private readonly skinBatches = new Map<KilnDomainResourceSkinSlug, DomainResourceSkinBatch>();
  private readonly skinStatus = new Map<KilnDomainResourceSkinSlug, DomainResourceSkinStatus>();
  private readonly skinPromises = new Map<KilnDomainResourceSkinSlug, Promise<KilnDomainResourceSkinTemplate | null>>();
  private currentSites: DomainResourceSite[] = [];

  constructor(scene: THREE.Scene, private readonly domainSkins?: DomainResourceSkinProvider) {
    this.group.name = 'domain-resources';
    scene.add(this.group);
  }

  setSites(sites: readonly DomainResourceSite[]): void {
    this.currentSites = sites.map((site) => ({ ...site }));
    const wanted = new Set(sites.map((s) => s.id));
    const wantedBySkin = new Map<KilnDomainResourceSkinSlug, number>();
    for (const site of sites) {
      if (!site.discovered || site.harvested) continue;
      const slug = KILN_DOMAIN_RESOURCE_SKIN_BY_KIND[site.kind];
      wantedBySkin.set(slug, (wantedBySkin.get(slug) ?? 0) + 1);
    }
    for (const [slug, count] of wantedBySkin) this.ensureSkin(slug, count);

    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.group.remove(obj);
        this.objects.delete(id);
      }
    }
    for (const site of sites) {
      if (this.objects.has(site.id)) continue;
      const obj = makeSite(site);
      obj.userData.domainResourceId = site.id;
      obj.userData.tile = site.tile;
      this.objects.set(site.id, obj);
      this.group.add(obj);
    }
  }

  private ensureSkin(slug: KilnDomainResourceSkinSlug, minCount: number): void {
    const template = this.skinTemplates.get(slug);
    if (template) {
      this.ensureBatch(slug, template, minCount);
      return;
    }
    if (!this.domainSkins) {
      this.skinStatus.set(slug, 'fallback');
      return;
    }
    if (this.skinPromises.has(slug)) {
      this.skinStatus.set(slug, 'pending');
      return;
    }
    this.skinStatus.set(slug, 'pending');
    const promise = this.domainSkins.createDomainResourceSkinTemplate(slug)
      .then((loaded) => {
        this.skinPromises.delete(slug);
        if (!loaded) {
          this.skinStatus.set(slug, 'fallback');
          return null;
        }
        this.skinTemplates.set(slug, loaded);
        this.skinStatus.set(slug, 'loaded');
        const count = this.currentSites.filter((site) => !site.harvested && site.discovered && KILN_DOMAIN_RESOURCE_SKIN_BY_KIND[site.kind] === slug).length;
        this.ensureBatch(slug, loaded, count);
        this.setSites(this.currentSites);
        return loaded;
      })
      .catch(() => {
        this.skinPromises.delete(slug);
        this.skinStatus.set(slug, 'fallback');
        return null;
      });
    this.skinPromises.set(slug, promise);
  }

  private ensureBatch(slug: KilnDomainResourceSkinSlug, template: KilnDomainResourceSkinTemplate, minCount: number): void {
    const existing = this.skinBatches.get(slug);
    if (existing && existing.capacity >= Math.max(1, minCount)) return;
    if (existing) this.group.remove(existing.group);
    const batch = makeDomainResourceSkinBatch(template, capacityForSiteCount(Math.max(1, minCount)));
    this.skinBatches.set(slug, batch);
    this.group.add(batch.group);
  }

  private writeBatchInstance(batch: DomainResourceSkinBatch, matrix: THREE.Matrix4): void {
    if (batch.count >= batch.capacity) return;
    const index = batch.count;
    for (const mesh of batch.meshes) mesh.setMatrixAt(index, matrix);
    batch.count += 1;
  }

  update(
    sites: readonly DomainResourceSite[],
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
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const instanceMatrix = new THREE.Matrix4();
    const c = geo.centers;
    for (const batch of this.skinBatches.values()) {
      batch.count = 0;
      for (const mesh of batch.meshes) mesh.count = 0;
    }
    for (const site of sites) {
      const obj = this.objects.get(site.id);
      if (!obj) continue;
      obj.visible = !site.harvested;
      obj.userData.kilnResourceSkinActive = false;
      const frame = geo.frameOf(site.tile);
      const yaw = site.id * 0.47 + site.slot * 0.9;
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
      const r = Math.max(ground + 0.07, WATER_SURFACE + 0.12);
      const offset = site.ring === 0 ? 1.18 : 0.28 + site.slot * 0.08;
      const offsetAngle = site.ring === 0 ? site.id * 1.7 + 0.65 : site.id * 0.91;
      const ox = Math.cos(offsetAngle) * offset;
      const oz = Math.sin(offsetAngle) * offset;
      obj.position.set(
        c[site.tile * 3] * r + vX.x * ox + vZ.x * oz - camWorld.x,
        c[site.tile * 3 + 1] * r + vX.y * ox + vZ.y * oz - camWorld.y,
        c[site.tile * 3 + 2] * r + vX.z * ox + vZ.z * oz - camWorld.z,
      );
      const pulse = site.discovered ? 1 + Math.sin(seconds * 2.1 + site.id) * 0.1 : 0.72;
      const slug = KILN_DOMAIN_RESOURCE_SKIN_BY_KIND[site.kind];
      const batch = site.discovered && !site.harvested ? this.skinBatches.get(slug) : undefined;
      if (batch) {
        obj.userData.kilnResourceSkinActive = true;
        q.setFromRotationMatrix(m);
        const bodyPulse = 1 + Math.sin(seconds * 1.6 + site.id) * 0.025;
        scale.setScalar(domainNodeScale(batch.template.fit) * bodyPulse);
        instanceMatrix.compose(obj.position, q, scale);
        this.writeBatchInstance(batch, instanceMatrix);
      }
      obj.traverse((child) => {
        const part = child.userData.resourcePart as ResourcePart | undefined;
        const kilnBody = batch !== undefined;
        if (part === 'dormant' || child.name === 'dormantCore') child.visible = !site.discovered;
        if (part === 'core' || child.name === 'resourceCore' || child.name === 'resourceRoot') child.visible = site.discovered && !kilnBody;
        if (part === 'glow' || child.name === 'resourceGlow') child.visible = site.discovered;
        if (part === 'base' || child.name === 'resourceBase') child.visible = true;
        const base = Array.isArray(child.userData.baseScale) ? child.userData.baseScale as [number, number, number] : [child.scale.x, child.scale.y, child.scale.z];
        if (part === 'glow' || child.name === 'resourceGlow') child.scale.set(base[0] * pulse, base[1] * pulse, base[2] * pulse);
        if (part === 'base' || child.name === 'resourceBase') child.scale.set(base[0] * (site.discovered ? pulse : 0.86), base[1], base[2] * (site.discovered ? pulse : 0.86));
      });
    }
    for (const batch of this.skinBatches.values()) {
      for (const mesh of batch.meshes) {
        mesh.count = batch.count;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  stats(): {
    groups: number;
    meshes: number;
    active: number;
    kinds: number;
    silhouettes: number;
    fallbackGroups: number;
    fallbackMeshes: number;
    kilnSkinsLoaded: number;
    kilnSkinsPending: number;
    kilnSkinFallbacks: number;
    instancedMeshes: number;
    instancedDrawCalls: number;
    batchedInstances: number;
    kilnSkinsBySlug: Partial<Record<KilnDomainResourceSkinSlug, DomainResourceSkinStats>>;
    kilnSkinFits: Partial<Record<KilnDomainResourceSkinSlug, KilnDomainResourceSkinFitSnapshot>>;
  } {
    let meshes = 0;
    let active = 0;
    let fallbackGroups = 0;
    let fallbackMeshes = 0;
    const kinds = new Set<string>();
    const silhouettes = new Set<string>();
    for (const obj of this.objects.values()) {
      if (obj.visible) active++;
      if (obj.visible && obj.userData.kilnResourceSkinActive !== true) fallbackGroups++;
      if (typeof obj.userData.resourceKind === 'string') kinds.add(obj.userData.resourceKind);
      if (typeof obj.userData.resourceSilhouette === 'string') silhouettes.add(obj.userData.resourceSilhouette);
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshes++;
          if (obj.userData.kilnResourceSkinActive !== true) fallbackMeshes++;
        }
      });
    }
    let instancedMeshes = 0;
    let batchedInstances = 0;
    const kilnSkinFits: Partial<Record<KilnDomainResourceSkinSlug, KilnDomainResourceSkinFitSnapshot>> = {};
    for (const [slug, batch] of this.skinBatches) {
      instancedMeshes += batch.meshes.length;
      batchedInstances += batch.count;
      meshes += batch.meshes.length;
      active += batch.count;
      kilnSkinFits[slug] = batch.template.fit;
    }
    const countsBySlug: Partial<Record<KilnDomainResourceSkinSlug, number>> = {};
    for (const site of this.currentSites) {
      if (!site.discovered || site.harvested) continue;
      const slug = KILN_DOMAIN_RESOURCE_SKIN_BY_KIND[site.kind];
      countsBySlug[slug] = (countsBySlug[slug] ?? 0) + 1;
    }
    let kilnSkinsLoaded = 0;
    let kilnSkinsPending = 0;
    let kilnSkinFallbacks = 0;
    const kilnSkinsBySlug: Partial<Record<KilnDomainResourceSkinSlug, DomainResourceSkinStats>> = {};
    for (const slug of new Set(Object.values(KILN_DOMAIN_RESOURCE_SKIN_BY_KIND))) {
      const count = countsBySlug[slug] ?? 0;
      if (count <= 0 && !this.skinStatus.has(slug)) continue;
      const batch = this.skinBatches.get(slug);
      const status = this.skinStatus.get(slug);
      const loaded = batch ? count : 0;
      const pending = status === 'pending' ? count : 0;
      const fallback = !batch && status === 'fallback' ? count : 0;
      kilnSkinsLoaded += loaded;
      kilnSkinsPending += pending;
      kilnSkinFallbacks += fallback;
      kilnSkinsBySlug[slug] = {
        loaded,
        pending,
        fallback,
        batchedInstances: batch?.count ?? 0,
        instancedMeshes: batch?.meshes.length ?? 0,
      };
    }
    return {
      groups: this.objects.size + this.skinBatches.size,
      meshes,
      active,
      kinds: kinds.size,
      silhouettes: silhouettes.size,
      fallbackGroups,
      fallbackMeshes,
      kilnSkinsLoaded,
      kilnSkinsPending,
      kilnSkinFallbacks,
      instancedMeshes,
      instancedDrawCalls: instancedMeshes,
      batchedInstances,
      kilnSkinsBySlug,
      kilnSkinFits,
    };
  }
}
