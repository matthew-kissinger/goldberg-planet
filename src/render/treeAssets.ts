import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { ChunkInfo } from '../world/chunks';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import { treeTangentFrame, type Trees, type TreeVisualKind } from '../world/trees';
import type {
  KilnTreeSkinFitSnapshot,
  KilnTreeSkinSlug,
  KilnTreeSkinTemplate,
  TreeSkinProvider,
} from './kilnAssets';

export const KILN_TREE_SKIN_SLUGS: readonly KilnTreeSkinSlug[] = ['tree-pine', 'tree-broadleaf', 'tree-dead-snag', 'tree-shrub'];

const KILN_TREE_SKIN_BY_KIND: Record<TreeVisualKind, KilnTreeSkinSlug> = {
  pine: 'tree-pine',
  broadleaf: 'tree-broadleaf',
  deadSnag: 'tree-dead-snag',
  shrub: 'tree-shrub',
};

const TREE_ANIMATION_LOD_DISTANCE = 96;

type TreeSkinStatus = 'pending' | 'loaded' | 'fallback';

interface TreeAssetSite {
  tile: number;
  slug: KilnTreeSkinSlug;
  kind: TreeVisualKind;
}

interface TreeSkinBatch {
  slug: KilnTreeSkinSlug;
  group: THREE.Group;
  template: KilnTreeSkinTemplate;
  meshes: THREE.InstancedMesh[];
  capacity: number;
  count: number;
}

interface TreeSkinStats {
  loaded: number;
  pending: number;
  fallback: number;
  batchedInstances: number;
  instancedMeshes: number;
}

function capacityForTreeCount(count: number): number {
  let capacity = 64;
  while (capacity < count) capacity *= 2;
  return capacity;
}

function makeTreeSkinBatch(template: KilnTreeSkinTemplate, capacity: number): TreeSkinBatch {
  const group = new THREE.Group();
  group.name = `kiln-tree-batch-${template.slug}`;
  group.userData.kilnAssetSlug = template.slug;
  group.userData.kilnTreeKind = template.kind;
  group.userData.kilnTreeSkinFit = template.fit;
  const meshes = template.parts.map((part, index) => {
    const instanced = new THREE.InstancedMesh(part.geometry, part.material, capacity);
    instanced.name = `${part.name}-tree-batch`;
    instanced.count = 0;
    instanced.frustumCulled = false;
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanced.userData.kilnAssetSlug = template.slug;
    instanced.userData.kilnTreeKind = template.kind;
    instanced.userData.kilnSourceMeshNames = part.sourceMeshNames;
    instanced.userData.kilnSourceMeshCount = part.sourceMeshCount;
    instanced.userData.kilnBatchPartIndex = index;
    group.add(instanced);
    return instanced;
  });
  return { slug: template.slug, group, template, meshes, capacity, count: 0 };
}

function treeScale(kind: TreeVisualKind, fit: KilnTreeSkinFitSnapshot, params: ReturnType<Trees['paramsFor']>): number {
  const sourceHeight = Math.max(0.001, fit.normalizedBboxSize[1] ?? 1);
  const targetHeight =
    kind === 'shrub' ? Math.max(1.25, params.trunk * 0.42 + params.canopy * 0.28)
    : kind === 'deadSnag' ? Math.max(3.1, params.trunk + params.canopy * 0.38)
    : params.trunk + params.canopy * 0.92;
  return Math.max(0.45, Math.min(4.2, targetHeight / sourceHeight));
}

export class TreeAssetRenderer {
  readonly group = new THREE.Group();
  private readonly skinTemplates = new Map<KilnTreeSkinSlug, KilnTreeSkinTemplate>();
  private readonly skinBatches = new Map<KilnTreeSkinSlug, TreeSkinBatch>();
  private readonly skinStatus = new Map<KilnTreeSkinSlug, TreeSkinStatus>();
  private readonly skinPromises = new Map<KilnTreeSkinSlug, Promise<KilnTreeSkinTemplate | null>>();
  private readonly frameScratch = new Float64Array(6);
  private currentSites: TreeAssetSite[] = [];
  private chunks = 0;
  private renderEnabled = false;
  private proceduralFallbackActive = true;

  constructor(scene: THREE.Scene, private readonly treeSkins?: TreeSkinProvider) {
    this.group.name = 'kiln-tree-assets';
    scene.add(this.group);
    for (const slug of KILN_TREE_SKIN_SLUGS) this.ensureSkin(slug, 1);
  }

  setRenderEnabled(enabled: boolean): void {
    this.renderEnabled = enabled;
    this.group.visible = enabled;
  }

  setProceduralFallbackActive(active: boolean): void {
    this.proceduralFallbackActive = active;
  }

  readyForProceduralReplacement(): boolean {
    return KILN_TREE_SKIN_SLUGS.every((slug) => this.skinBatches.has(slug));
  }

  hasFailedTreeSkin(): boolean {
    return KILN_TREE_SKIN_SLUGS.some((slug) => this.skinStatus.get(slug) === 'fallback');
  }

  setChunks(chunks: readonly ChunkInfo[], geo: Goldberg, trees: Trees): void {
    this.chunks = chunks.length;
    const sites: TreeAssetSite[] = [];
    const wantedBySkin = new Map<KilnTreeSkinSlug, number>();
    for (const chunk of chunks) {
      for (const tile of chunk.tiles) {
        if (!trees.hasTree(tile)) continue;
        const kind = trees.visualKindFor(tile);
        const slug = KILN_TREE_SKIN_BY_KIND[kind];
        sites.push({ tile, slug, kind });
        wantedBySkin.set(slug, (wantedBySkin.get(slug) ?? 0) + 1);
      }
    }
    this.currentSites = sites;
    for (const slug of KILN_TREE_SKIN_SLUGS) this.ensureSkin(slug, Math.max(1, wantedBySkin.get(slug) ?? 0));
  }

  private ensureSkin(slug: KilnTreeSkinSlug, minCount: number): void {
    const template = this.skinTemplates.get(slug);
    if (template) {
      this.ensureBatch(slug, template, minCount);
      return;
    }
    if (!this.treeSkins) {
      this.skinStatus.set(slug, 'fallback');
      return;
    }
    if (this.skinPromises.has(slug)) {
      this.skinStatus.set(slug, 'pending');
      return;
    }
    this.skinStatus.set(slug, 'pending');
    const promise = this.treeSkins.createTreeSkinTemplate(slug)
      .then((loaded) => {
        this.skinPromises.delete(slug);
        if (!loaded) {
          this.skinStatus.set(slug, 'fallback');
          return null;
        }
        this.skinTemplates.set(slug, loaded);
        this.skinStatus.set(slug, 'loaded');
        const count = this.currentSites.filter((site) => site.slug === slug).length;
        this.ensureBatch(slug, loaded, Math.max(1, count));
        return loaded;
      })
      .catch(() => {
        this.skinPromises.delete(slug);
        this.skinStatus.set(slug, 'fallback');
        return null;
      });
    this.skinPromises.set(slug, promise);
  }

  private ensureBatch(slug: KilnTreeSkinSlug, template: KilnTreeSkinTemplate, minCount: number): void {
    const existing = this.skinBatches.get(slug);
    if (existing && existing.capacity >= Math.max(1, minCount)) return;
    if (existing) this.group.remove(existing.group);
    const batch = makeTreeSkinBatch(template, capacityForTreeCount(Math.max(1, minCount)));
    this.skinBatches.set(slug, batch);
    this.group.add(batch.group);
  }

  private writeBatchInstance(batch: TreeSkinBatch, matrix: THREE.Matrix4): void {
    if (batch.count >= batch.capacity) return;
    const index = batch.count;
    for (const mesh of batch.meshes) mesh.setMatrixAt(index, matrix);
    batch.count += 1;
  }

  update(
    geo: Goldberg,
    layers: Layers,
    columns: Columns,
    trees: Trees,
    camWorld: { x: number; y: number; z: number },
    seconds: number,
  ): void {
    for (const batch of this.skinBatches.values()) {
      batch.count = 0;
      for (const mesh of batch.meshes) mesh.count = 0;
    }
    if (!this.renderEnabled) {
      for (const batch of this.skinBatches.values()) {
        for (const mesh of batch.meshes) mesh.instanceMatrix.needsUpdate = true;
      }
      return;
    }

    const c = geo.centers;
    const vX = new THREE.Vector3();
    const vY = new THREE.Vector3();
    const vZ = new THREE.Vector3();
    const basis = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const instanceMatrix = new THREE.Matrix4();
    for (const site of this.currentSites) {
      if (!trees.hasTree(site.tile)) continue;
      const batch = this.skinBatches.get(site.slug);
      if (!batch) continue;
      const ux = c[site.tile * 3];
      const uy = c[site.tile * 3 + 1];
      const uz = c[site.tile * 3 + 2];
      treeTangentFrame(ux, uy, uz, this.frameScratch);
      vX.set(this.frameScratch[0], this.frameScratch[1], this.frameScratch[2]);
      vY.set(ux, uy, uz);
      vZ.set(this.frameScratch[3], this.frameScratch[4], this.frameScratch[5]);
      basis.makeBasis(vX, vY, vZ);
      q.setFromRotationMatrix(basis);

      const params = trees.paramsFor(site.tile);
      const damage = trees.damageOf(site.tile);
      const phase = params.tint * 7.3;
      const leanA = Math.sin(phase) * 0.14 * damage;
      const leanB = Math.cos(phase * 1.3) * 0.12 * damage;
      const rG = layers.topRadius(columns.topLayerOf(site.tile));
      const baseX = ux * (rG - 0.2) + vX.x * (params.offA + leanA) + vZ.x * (params.offB + leanB);
      const baseY = uy * (rG - 0.2) + vX.y * (params.offA + leanA) + vZ.y * (params.offB + leanB);
      const baseZ = uz * (rG - 0.2) + vX.z * (params.offA + leanA) + vZ.z * (params.offB + leanB);
      const distToCamera = Math.hypot(baseX - camWorld.x, baseY - camWorld.y, baseZ - camWorld.z);
      const sway = distToCamera <= TREE_ANIMATION_LOD_DISTANCE
        ? Math.sin(seconds * 0.8 + site.tile * 0.013) * 0.025 * (site.kind === 'deadSnag' ? 0.35 : 1)
        : 0;
      pos.set(
        baseX + vX.x * sway - camWorld.x,
        baseY + vX.y * sway - camWorld.y,
        baseZ + vX.z * sway - camWorld.z,
      );
      const damageScale = 1 - damage * (site.kind === 'shrub' ? 0.08 : 0.12);
      scale.setScalar(treeScale(site.kind, batch.template.fit, params) * damageScale);
      instanceMatrix.compose(pos, q, scale);
      this.writeBatchInstance(batch, instanceMatrix);
    }
    for (const batch of this.skinBatches.values()) {
      for (const mesh of batch.meshes) {
        mesh.count = batch.count;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  stats(): {
    chunks: number;
    currentTrees: number;
    proceduralFallbackActive: boolean;
    renderEnabled: boolean;
    readyForProceduralReplacement: boolean;
    kilnTreeSkinsLoaded: number;
    kilnTreeSkinsPending: number;
    kilnTreeSkinFallbacks: number;
    instancedMeshes: number;
    instancedDrawCalls: number;
    batchedInstances: number;
    animationLodDistance: number;
    kilnTreeSkinsBySlug: Partial<Record<KilnTreeSkinSlug, TreeSkinStats>>;
    kilnTreeSkinFits: Partial<Record<KilnTreeSkinSlug, KilnTreeSkinFitSnapshot>>;
  } {
    const countsBySlug: Partial<Record<KilnTreeSkinSlug, number>> = {};
    for (const site of this.currentSites) countsBySlug[site.slug] = (countsBySlug[site.slug] ?? 0) + 1;
    let instancedMeshes = 0;
    let batchedInstances = 0;
    const kilnTreeSkinFits: Partial<Record<KilnTreeSkinSlug, KilnTreeSkinFitSnapshot>> = {};
    for (const [slug, batch] of this.skinBatches) {
      instancedMeshes += batch.meshes.length;
      batchedInstances += batch.count;
      kilnTreeSkinFits[slug] = batch.template.fit;
    }
    let kilnTreeSkinsLoaded = 0;
    let kilnTreeSkinsPending = 0;
    let kilnTreeSkinFallbacks = 0;
    const kilnTreeSkinsBySlug: Partial<Record<KilnTreeSkinSlug, TreeSkinStats>> = {};
    for (const slug of KILN_TREE_SKIN_SLUGS) {
      const count = countsBySlug[slug] ?? 0;
      const batch = this.skinBatches.get(slug);
      const status = this.skinStatus.get(slug);
      const loaded = batch ? count : 0;
      const pending = status === 'pending' ? Math.max(1, count) : 0;
      const fallback = !batch && status === 'fallback' ? Math.max(1, count) : 0;
      kilnTreeSkinsLoaded += loaded;
      kilnTreeSkinsPending += pending;
      kilnTreeSkinFallbacks += fallback;
      kilnTreeSkinsBySlug[slug] = {
        loaded,
        pending,
        fallback,
        batchedInstances: batch?.count ?? 0,
        instancedMeshes: batch?.meshes.length ?? 0,
      };
    }
    return {
      chunks: this.chunks,
      currentTrees: this.currentSites.length,
      proceduralFallbackActive: this.proceduralFallbackActive,
      renderEnabled: this.renderEnabled,
      readyForProceduralReplacement: this.readyForProceduralReplacement(),
      kilnTreeSkinsLoaded,
      kilnTreeSkinsPending,
      kilnTreeSkinFallbacks,
      instancedMeshes,
      instancedDrawCalls: instancedMeshes,
      batchedInstances,
      animationLodDistance: TREE_ANIMATION_LOD_DISTANCE,
      kilnTreeSkinsBySlug,
      kilnTreeSkinFits,
    };
  }
}
