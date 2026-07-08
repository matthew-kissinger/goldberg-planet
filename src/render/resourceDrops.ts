import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import type { ResourceDropSave } from '../sim/resourceDrops';
import { RESOURCE_DROP_PICKUP_DELAY } from '../sim/resourceDrops';
import type {
  KilnResourceDropSkinFitSnapshot,
  KilnResourceDropSkinSlug,
  KilnResourceDropSkinTemplate,
  ResourceDropSkinProvider,
} from './kilnAssets';
import { makeSurfaceBasisFromYaw } from './surfaceFrame';

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

const KILN_DROP_SKIN_BY_ITEM: Partial<Record<ResourceDropSave['item'], KilnResourceDropSkinSlug>> = {
  wood: 'drop-wood-logs',
  rock: 'drop-ore-chunk',
  dirt: 'drop-dirt-clod',
  sand: 'drop-sand-pile',
  snow: 'drop-snow-clump',
  glowCrystal: 'drop-glow-crystal',
  rawFish: 'drop-raw-fish',
  kelp: 'drop-kelp-reeds',
  reeds: 'drop-kelp-reeds',
  seeds: 'node-root-pod',
  compost: 'drop-compost-pellet',
  caveMushroom: 'drop-cave-mushroom',
};

const KILN_DROP_SKIN_SCALE: Record<KilnResourceDropSkinSlug, number> = {
  'drop-wood-logs': 1.12,
  'drop-ore-chunk': 0.74,
  'drop-dirt-clod': 0.72,
  'drop-sand-pile': 0.72,
  'drop-snow-clump': 0.78,
  'drop-glow-crystal': 0.82,
  'drop-raw-fish': 0.84,
  'drop-kelp-reeds': 0.76,
  'drop-compost-pellet': 0.68,
  'drop-cave-mushroom': 0.72,
  'drop-creature-fiber': 0.72,
  'node-root-pod': 0.52,
};

function kilnSkinSlugForDrop(drop: ResourceDropSave): KilnResourceDropSkinSlug | undefined {
  if (drop.item === 'reeds' && drop.source === 'creature') return 'drop-creature-fiber';
  return KILN_DROP_SKIN_BY_ITEM[drop.item];
}

type DropSkinStatus = 'pending' | 'loaded' | 'fallback';

interface DropSkinBatch {
  slug: KilnResourceDropSkinSlug;
  group: THREE.Group;
  template: KilnResourceDropSkinTemplate;
  meshes: THREE.InstancedMesh[];
  capacity: number;
  count: number;
}

interface DropSkinStats {
  loaded: number;
  pending: number;
  fallback: number;
  batchedInstances: number;
  instancedMeshes: number;
}

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

function capacityForDropCount(count: number): number {
  let capacity = 16;
  while (capacity < count) capacity *= 2;
  return capacity;
}

function makeDropSkinBatch(template: KilnResourceDropSkinTemplate, capacity: number): DropSkinBatch {
  const group = new THREE.Group();
  group.name = `kiln-resource-drop-batch-${template.slug}`;
  group.userData.kilnAssetSlug = template.slug;
  group.userData.kilnDropSkinFit = template.fit;
  const meshes = template.parts.map((part, index) => {
    const instanced = new THREE.InstancedMesh(part.geometry, part.material, capacity);
    instanced.name = `${part.name}-batch`;
    instanced.count = 0;
    instanced.frustumCulled = false;
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanced.userData.kilnAssetSlug = template.slug;
    instanced.userData.kilnSourceMeshNames = part.sourceMeshNames;
    instanced.userData.kilnSourceMeshCount = part.sourceMeshCount;
    instanced.userData.kilnBatchPartIndex = index;
    group.add(instanced);
    return instanced;
  });
  return { slug: template.slug, group, template, meshes, capacity, count: 0 };
}

export class ResourceDropRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();
  private readonly skinTemplates = new Map<KilnResourceDropSkinSlug, KilnResourceDropSkinTemplate>();
  private readonly skinBatches = new Map<KilnResourceDropSkinSlug, DropSkinBatch>();
  private readonly skinStatus = new Map<KilnResourceDropSkinSlug, DropSkinStatus>();
  private readonly skinPromises = new Map<KilnResourceDropSkinSlug, Promise<KilnResourceDropSkinTemplate | null>>();
  private currentDrops: ResourceDropSave[] = [];

  constructor(scene: THREE.Scene, private readonly dropSkins?: ResourceDropSkinProvider) {
    this.group.name = 'resource-drops';
    scene.add(this.group);
  }

  setDrops(drops: readonly ResourceDropSave[]): void {
    this.currentDrops = drops.map((drop) => ({ ...drop }));
    const wanted = new Set(drops.map((drop) => drop.id));
    const wantedBySkin = new Map<KilnResourceDropSkinSlug, number>();
    for (const drop of drops) {
      const slug = kilnSkinSlugForDrop(drop);
      if (slug) wantedBySkin.set(slug, (wantedBySkin.get(slug) ?? 0) + 1);
    }
    for (const [slug, count] of wantedBySkin) this.ensureSkin(slug, count);

    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.group.remove(obj);
        this.objects.delete(id);
      }
    }
    for (const drop of drops) {
      const slug = kilnSkinSlugForDrop(drop);
      if (slug && this.skinBatches.has(slug)) {
        const fallback = this.objects.get(drop.id);
        if (fallback) {
          this.group.remove(fallback);
          this.objects.delete(drop.id);
        }
        continue;
      }
      if (this.objects.has(drop.id)) continue;
      const obj = makeDrop(drop);
      obj.userData.resourceDropId = drop.id;
      obj.userData.item = drop.item;
      obj.userData.tile = drop.tile;
      this.objects.set(drop.id, obj);
      this.group.add(obj);
    }
  }

  private ensureSkin(slug: KilnResourceDropSkinSlug, minCount: number): void {
    const template = this.skinTemplates.get(slug);
    if (template) {
      this.ensureBatch(slug, template, minCount);
      return;
    }
    if (!this.dropSkins) {
      this.skinStatus.set(slug, 'fallback');
      return;
    }
    if (this.skinPromises.has(slug)) {
      this.skinStatus.set(slug, 'pending');
      return;
    }
    this.skinStatus.set(slug, 'pending');
    const promise = this.dropSkins.createResourceDropSkinTemplate(slug)
      .then((loaded) => {
        this.skinPromises.delete(slug);
        if (!loaded) {
          this.skinStatus.set(slug, 'fallback');
          return null;
        }
        this.skinTemplates.set(slug, loaded);
        this.skinStatus.set(slug, 'loaded');
        const count = this.currentDrops.filter((drop) => kilnSkinSlugForDrop(drop) === slug).length;
        this.ensureBatch(slug, loaded, count);
        this.setDrops(this.currentDrops);
        return loaded;
      })
      .catch(() => {
        this.skinPromises.delete(slug);
        this.skinStatus.set(slug, 'fallback');
        return null;
      });
    this.skinPromises.set(slug, promise);
  }

  private ensureBatch(slug: KilnResourceDropSkinSlug, template: KilnResourceDropSkinTemplate, minCount: number): void {
    const existing = this.skinBatches.get(slug);
    if (existing && existing.capacity >= Math.max(1, minCount)) return;
    if (existing) this.group.remove(existing.group);
    const batch = makeDropSkinBatch(template, capacityForDropCount(Math.max(1, minCount)));
    this.skinBatches.set(slug, batch);
    this.group.add(batch.group);
  }

  private writeBatchInstance(batch: DropSkinBatch, matrix: THREE.Matrix4): void {
    if (batch.count >= batch.capacity) return;
    const index = batch.count;
    for (const mesh of batch.meshes) mesh.setMatrixAt(index, matrix);
    batch.count += 1;
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
    const instanceMatrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const c = geo.centers;
    for (const batch of this.skinBatches.values()) {
      batch.count = 0;
      for (const mesh of batch.meshes) mesh.count = 0;
    }
    for (const drop of drops) {
      const obj = this.objects.get(drop.id);
      const slug = kilnSkinSlugForDrop(drop);
      const batch = slug ? this.skinBatches.get(slug) : undefined;
      const frame = geo.frameOf(drop.tile);
      const yaw = drop.id * 1.173 + drop.tile * 0.013;
      makeSurfaceBasisFromYaw(frame, yaw, m, vX, vY, vZ);

      const ground = layers.topRadius(columns.groundLayerBelow(drop.tile, layers.bounds[0]));
      const toss = drop.age < RESOURCE_DROP_PICKUP_DELAY
        ? Math.sin((drop.age / RESOURCE_DROP_PICKUP_DELAY) * Math.PI) * 0.42
        : Math.sin(seconds * 4.3 + drop.id) * 0.035;
      const pulse = drop.age < RESOURCE_DROP_PICKUP_DELAY
        ? 0.72 + (drop.age / RESOURCE_DROP_PICKUP_DELAY) * 0.28
        : 1 + Math.sin(seconds * 3.1 + drop.id) * 0.045;
      const r = ground + (batch ? 0.045 : 0.12) + toss;
      pos.set(
        c[drop.tile * 3] * r + vX.x * drop.offsetA + vZ.x * drop.offsetB - camWorld.x,
        c[drop.tile * 3 + 1] * r + vX.y * drop.offsetA + vZ.y * drop.offsetB - camWorld.y,
        c[drop.tile * 3 + 2] * r + vX.z * drop.offsetA + vZ.z * drop.offsetB - camWorld.z,
      );
      if (batch && slug) {
        if (obj) obj.visible = false;
        q.setFromRotationMatrix(m);
        const amountScale = 1 + Math.min(2, Math.max(0, Math.trunc(drop.count) - 1)) * 0.055;
        scale.setScalar(pulse * KILN_DROP_SKIN_SCALE[slug] * amountScale);
        instanceMatrix.compose(pos, q, scale);
        this.writeBatchInstance(batch, instanceMatrix);
        continue;
      }
      if (!obj) continue;
      obj.setRotationFromMatrix(m);
      obj.position.copy(pos);
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
    fallbackGroups: number;
    fallbackMeshes: number;
    kilnSkinsLoaded: number;
    kilnSkinsPending: number;
    kilnSkinFallbacks: number;
    instancedMeshes: number;
    instancedDrawCalls: number;
    batchedInstances: number;
    kilnDropSkinsBySlug: Partial<Record<KilnResourceDropSkinSlug, DropSkinStats>>;
    kilnSkinFits: Partial<Record<KilnResourceDropSkinSlug, KilnResourceDropSkinFitSnapshot>>;
  } {
    let meshes = 0;
    let active = 0;
    let fallbackMeshes = 0;
    let fallbackGroups = 0;
    for (const obj of this.objects.values()) {
      if (obj.visible) {
        active++;
        fallbackGroups++;
      }
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshes++;
          fallbackMeshes++;
        }
      });
    }
    const countsBySlug: Partial<Record<KilnResourceDropSkinSlug, number>> = {};
    for (const drop of this.currentDrops) {
      const slug = kilnSkinSlugForDrop(drop);
      if (slug) countsBySlug[slug] = (countsBySlug[slug] ?? 0) + 1;
    }
    let instancedMeshes = 0;
    let batchedInstances = 0;
    const kilnDropSkinsBySlug: Partial<Record<KilnResourceDropSkinSlug, DropSkinStats>> = {};
    const kilnSkinFits: Partial<Record<KilnResourceDropSkinSlug, KilnResourceDropSkinFitSnapshot>> = {};
    for (const [slug, batch] of this.skinBatches) {
      instancedMeshes += batch.meshes.length;
      batchedInstances += batch.count;
      meshes += batch.meshes.length;
      active += batch.count;
      kilnSkinFits[slug] = batch.template.fit;
    }
    let kilnSkinsLoaded = 0;
    let kilnSkinsPending = 0;
    let kilnSkinFallbacks = 0;
    const supportedSlugs = new Set(Object.values(KILN_DROP_SKIN_BY_ITEM) as KilnResourceDropSkinSlug[]);
    supportedSlugs.add('drop-creature-fiber');
    for (const slug of supportedSlugs) {
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
      kilnDropSkinsBySlug[slug] = {
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
      fallbackGroups,
      fallbackMeshes,
      kilnSkinsLoaded,
      kilnSkinsPending,
      kilnSkinFallbacks,
      instancedMeshes,
      instancedDrawCalls: instancedMeshes,
      batchedInstances,
      kilnDropSkinsBySlug,
      kilnSkinFits,
    };
  }
}
