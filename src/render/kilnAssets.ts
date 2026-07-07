import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DomainResourceKind } from '../sim/domainResources';
import type { NativeCreatureKind } from '../sim/nativeLife';
import type { TreeVisualKind } from '../world/trees';

export type KilnStructureSkinSlug = 'waystone' | 'door-kit' | 'window-frame' | 'roof-bundle';
export type KilnResourceDropSkinSlug = 'drop-wood-logs' | 'drop-ore-chunk';
export type KilnDomainResourceSkinSlug =
  | 'node-hearth-coal'
  | 'node-rain-reed'
  | 'node-salt-shell'
  | 'node-lantern-shard'
  | 'node-root-pod'
  | 'node-red-nodule'
  | 'node-snow-bloom'
  | 'node-glass-shard'
  | 'node-storm-amber'
  | 'node-reed-kelp'
  | 'node-bell-crystal'
  | 'node-horizon-shard';
export type KilnTreeSkinSlug = 'tree-pine' | 'tree-broadleaf' | 'tree-dead-snag' | 'tree-shrub';
export type KilnCreatureSkinSlug =
  | 'creature-moss-puff'
  | 'creature-brambleback'
  | 'creature-shell-skitter'
  | 'creature-reedback-grazer'
  | 'creature-cave-belljaw'
  | 'creature-cave-blinker'
  | 'creature-scree-snapper'
  | 'creature-storm-burr'
  | 'creature-tide-lurker';

type KilnAssetStatus = 'ready' | 'unused' | 'missing';

interface KilnManifestAsset {
  slug: string;
  status: KilnAssetStatus;
  file: string | null;
  bytes?: number;
  title?: string;
  category?: string;
  role?: string;
  instanceability?: string;
  modularKit?: boolean;
  wiringRisk?: string;
  geometry?: {
    triangles?: number;
    meshCount?: number;
    nodeCount?: number;
    materialCount?: number;
    bboxLocal?: { size?: number[] };
  };
  animations?: {
    name?: string;
    channels?: number;
    durationSec?: number;
  }[];
}

interface KilnManifest {
  assets?: KilnManifestAsset[];
}

interface KilnSkinTransform {
  scale: number | [number, number, number];
  fitSourceSize?: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  hideProceduralNames: readonly string[];
  socket: {
    item: string;
    role: string;
    gridWidth: number;
    gridDepth: number;
    height: number;
    loadBearing: 'code-socket';
    glbPolicy: 'decorative-skin-after-normalization';
  };
  acceptanceNote: string;
}

interface LoadedKilnAsset {
  slug: KilnStructureSkinSlug;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  template: THREE.Object3D;
  transform: KilnSkinTransform;
}

export interface KilnStructureSkin {
  slug: KilnStructureSkinSlug;
  object: THREE.Group;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  hideProceduralNames: readonly string[];
  fit: KilnSkinFitSnapshot;
}

export interface KilnSkinFitSnapshot {
  slug: KilnStructureSkinSlug;
  item: string;
  socketRole: string;
  sourceBboxSize: readonly number[];
  fittedBboxSize: readonly number[];
  scale: number | readonly [number, number, number];
  runtimeSourceBboxSize?: readonly number[];
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  loadBearing: 'code-socket';
  glbPolicy: 'decorative-skin-after-normalization';
  instanceability?: string;
  modularKit?: boolean;
  acceptanceNote: string;
  sourceUrl: string;
}

export interface KilnAssetSnapshot {
  enabled: readonly KilnStructureSkinSlug[];
  manifestUrl: string;
  modelRequests: readonly string[];
  manifestLoaded: boolean;
  loaded: readonly KilnStructureSkinSlug[];
  failed: readonly string[];
  structureSkins: Partial<Record<KilnStructureSkinSlug, Omit<KilnSkinFitSnapshot, 'fittedBboxSize' | 'sourceUrl'>>>;
  resourceDropSkins?: {
    enabled: readonly KilnResourceDropSkinSlug[];
    loaded: readonly KilnResourceDropSkinSlug[];
  };
  domainResourceSkins?: {
    enabled: readonly KilnDomainResourceSkinSlug[];
    loaded: readonly KilnDomainResourceSkinSlug[];
  };
  treeSkins?: {
    enabled: readonly KilnTreeSkinSlug[];
    loaded: readonly KilnTreeSkinSlug[];
  };
  creatureSkins?: {
    enabled: readonly KilnCreatureSkinSlug[];
    loaded: readonly KilnCreatureSkinSlug[];
  };
}

export interface StructureSkinProvider {
  createStructureSkin(slug: KilnStructureSkinSlug): Promise<KilnStructureSkin | null>;
  snapshot?(): KilnAssetSnapshot;
}

export interface KilnInstancedAssetPart {
  name: string;
  sourceMeshNames: readonly string[];
  sourceMeshCount: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

export type KilnInstancedOrientationPolicy = 'preserve-y-up' | 'longest-axis-to-y';
export type KilnSourceUpAxis = 'x' | 'y' | 'z';

export interface KilnInstancedOrientationSnapshot {
  policy: KilnInstancedOrientationPolicy;
  sourceUpAxis: KilnSourceUpAxis;
  axisCorrection: readonly [number, number, number];
}

export interface KilnResourceDropSkinFitSnapshot {
  slug: KilnResourceDropSkinSlug;
  item: string;
  socketRole: 'ground-pickup';
  sourceBboxSize: readonly number[];
  runtimeSourceBboxSize: readonly number[];
  orientedSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  normalizePolicy: 'center-xz-bottom-y';
  orientation: KilnInstancedOrientationSnapshot;
  batchingPolicy: 'instanced-merged-by-material';
  animationPolicy: 'matrix-bob-only';
  sourceUrl: string;
  sourceMeshCount: number;
  instancedMeshCount: number;
  materialCount?: number;
  acceptanceNote: string;
}

export interface KilnResourceDropSkinTemplate {
  slug: KilnResourceDropSkinSlug;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  parts: readonly KilnInstancedAssetPart[];
  fit: KilnResourceDropSkinFitSnapshot;
}

export interface ResourceDropSkinProvider {
  createResourceDropSkinTemplate(slug: KilnResourceDropSkinSlug): Promise<KilnResourceDropSkinTemplate | null>;
  snapshot?(): KilnAssetSnapshot;
}

export interface KilnDomainResourceSkinFitSnapshot {
  slug: KilnDomainResourceSkinSlug;
  kind: DomainResourceKind;
  socketRole: 'domain-resource-node';
  sourceBboxSize: readonly number[];
  runtimeSourceBboxSize: readonly number[];
  orientedSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  normalizePolicy: 'center-xz-bottom-y';
  orientation: KilnInstancedOrientationSnapshot;
  batchingPolicy: 'instanced-merged-by-material';
  animationPolicy: 'matrix-pulse-only';
  sourceUrl: string;
  sourceMeshCount: number;
  instancedMeshCount: number;
  materialCount?: number;
  acceptanceNote: string;
}

export interface KilnDomainResourceSkinTemplate {
  slug: KilnDomainResourceSkinSlug;
  kind: DomainResourceKind;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  parts: readonly KilnInstancedAssetPart[];
  fit: KilnDomainResourceSkinFitSnapshot;
}

export interface DomainResourceSkinProvider {
  createDomainResourceSkinTemplate(slug: KilnDomainResourceSkinSlug): Promise<KilnDomainResourceSkinTemplate | null>;
  snapshot?(): KilnAssetSnapshot;
}

export interface KilnTreeSkinFitSnapshot {
  slug: KilnTreeSkinSlug;
  kind: TreeVisualKind;
  socketRole: 'tree-scatter';
  sourceBboxSize: readonly number[];
  runtimeSourceBboxSize: readonly number[];
  orientedSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  normalizePolicy: 'center-xz-bottom-y';
  orientation: KilnInstancedOrientationSnapshot;
  batchingPolicy: 'instanced-merged-by-material';
  animationPolicy: 'matrix-sway-near-and-damage-only';
  sourceUrl: string;
  sourceMeshCount: number;
  instancedMeshCount: number;
  materialCount?: number;
  acceptanceNote: string;
}

export interface KilnTreeSkinTemplate {
  slug: KilnTreeSkinSlug;
  kind: TreeVisualKind;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  parts: readonly KilnInstancedAssetPart[];
  fit: KilnTreeSkinFitSnapshot;
}

export interface TreeSkinProvider {
  createTreeSkinTemplate(slug: KilnTreeSkinSlug): Promise<KilnTreeSkinTemplate | null>;
  snapshot?(): KilnAssetSnapshot;
}

export interface KilnCreatureSkinFitSnapshot {
  slug: KilnCreatureSkinSlug;
  kind: NativeCreatureKind;
  socketRole: 'native-creature-body';
  sourceBboxSize: readonly number[];
  runtimeSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  normalizePolicy: 'center-xz-bottom-y-fit-height';
  animationPolicy: 'mixer-near-freeze-far';
  sourceUrl: string;
  sourceMeshCount: number;
  materialCount?: number;
  animationClips: readonly { name: string; channels: number; durationSec: number }[];
  activeMixerRadius: number;
  lowRateMixerRadius: number;
  frozenMixerRadius: number;
  acceptanceNote: string;
}

export interface KilnCreatureSkinTemplate {
  slug: KilnCreatureSkinSlug;
  kind: NativeCreatureKind;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  template: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
  fit: KilnCreatureSkinFitSnapshot;
}

export interface CreatureSkinProvider {
  createCreatureSkinTemplate(slug: KilnCreatureSkinSlug): Promise<KilnCreatureSkinTemplate | null>;
  snapshot?(): KilnAssetSnapshot;
}

const RUNTIME_STRUCTURE_SKINS: Record<KilnStructureSkinSlug, KilnSkinTransform> = {
  waystone: {
    scale: 1.45,
    position: [0, 0.22, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['waystoneBase', 'waystoneCore', 'waystoneBand'],
    socket: {
      item: 'waystone',
      role: 'route-marker',
      gridWidth: 0.62,
      gridDepth: 0.62,
      height: 1.25,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative route-marker shell; procedural glyph overlays remain authoritative',
  },
  'door-kit': {
    scale: [1, 1, 1],
    fitSourceSize: [1, 1.9, 0.22],
    position: [0, 0.95, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['leftJamb', 'rightJamb', 'lintel', 'doorSlab', 'knob'],
    socket: {
      item: 'doorKit',
      role: 'wall-opening',
      gridWidth: 1,
      gridDepth: 0.22,
      height: 1.9,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'conditionally accepted as flattened decorative door skin; snap, opening, and collider stay code-authored',
  },
  'window-frame': {
    scale: [1, 1, 1],
    fitSourceSize: [0.18, 1.45, 0.92],
    position: [0, 0.72, 0],
    rotation: [0, Math.PI / 2, 0],
    hideProceduralNames: ['topRail', 'bottomRail', 'leftRail', 'rightRail', 'glassPane'],
    socket: {
      item: 'windowFrame',
      role: 'wall-light',
      gridWidth: 0.92,
      gridDepth: 0.18,
      height: 1.45,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'conditionally accepted despite C instanceability by remapping wide local Z to wall width; warm-light overlay remains procedural',
  },
  'roof-bundle': {
    scale: [1, 1, 1],
    fitSourceSize: [1.12, 0.62, 1.12],
    position: [0, 0.54, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['leftRoofPlane', 'rightRoofPlane', 'ridgeBeam'],
    socket: {
      item: 'roofBundle',
      role: 'roof-cap',
      gridWidth: 1.12,
      gridDepth: 1.12,
      height: 0.62,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'conditionally accepted as roof-cap decoration only; shelter coverage and glow remain procedural proof surfaces',
  },
};

const RUNTIME_RESOURCE_DROP_SKINS: Record<KilnResourceDropSkinSlug, {
  item: string;
  acceptanceNote: string;
}> = {
  'drop-wood-logs': {
    item: 'wood',
    acceptanceNote: 'accepted as instanced ground pickup skin for chopped wood; collection timing and pickup glint remain code-authored',
  },
  'drop-ore-chunk': {
    item: 'rock',
    acceptanceNote: 'accepted as instanced ground pickup skin for mined rock; collection timing and pickup glint remain code-authored',
  },
};

const RUNTIME_DOMAIN_RESOURCE_SKINS: Record<KilnDomainResourceSkinSlug, {
  kind: DomainResourceKind;
  acceptanceNote: string;
}> = {
  'node-hearth-coal': {
    kind: 'hearthCoal',
    acceptanceNote: 'accepted as instanced hearth-coal body; warm cracks and harvest timing remain code-authored',
  },
  'node-rain-reed': {
    kind: 'rainReed',
    acceptanceNote: 'accepted as instanced rain-reed body; weather/resource signal glow remains code-authored',
  },
  'node-salt-shell': {
    kind: 'saltShell',
    acceptanceNote: 'accepted as instanced salt-shell body; shoreline reward state remains code-authored',
  },
  'node-lantern-shard': {
    kind: 'lanternShard',
    acceptanceNote: 'accepted as instanced lantern-shard body; light cue and harvest overlay remain code-authored',
  },
  'node-root-pod': {
    kind: 'rootPod',
    acceptanceNote: 'accepted as instanced root-pod body; seed reward/readability glow remains code-authored',
  },
  'node-red-nodule': {
    kind: 'redNodule',
    acceptanceNote: 'accepted after footprint normalization as instanced red-nodule body; mining reward state remains code-authored',
  },
  'node-snow-bloom': {
    kind: 'snowBloom',
    acceptanceNote: 'accepted as instanced snow-bloom body; cold herb cue remains code-authored',
  },
  'node-glass-shard': {
    kind: 'glassShard',
    acceptanceNote: 'accepted as instanced glass-shard body; sightline glint remains code-authored',
  },
  'node-storm-amber': {
    kind: 'stormAmber',
    acceptanceNote: 'accepted as instanced storm-amber body; storm pulse overlay remains code-authored',
  },
  'node-reed-kelp': {
    kind: 'reedKelp',
    acceptanceNote: 'accepted as instanced reed-kelp body; wet route cue remains code-authored',
  },
  'node-bell-crystal': {
    kind: 'bellCrystal',
    acceptanceNote: 'accepted as instanced bell-crystal body; resonance glow remains code-authored',
  },
  'node-horizon-shard': {
    kind: 'horizonShard',
    acceptanceNote: 'accepted as instanced horizon-shard body; route bearing overlay remains code-authored',
  },
};

const RUNTIME_TREE_SKINS: Record<KilnTreeSkinSlug, {
  kind: TreeVisualKind;
  orientationPolicy: KilnInstancedOrientationPolicy;
  acceptanceNote: string;
}> = {
  'tree-pine': {
    kind: 'pine',
    orientationPolicy: 'longest-axis-to-y',
    acceptanceNote: 'accepted as an instanced evergreen tree skin; chop state, hit proxy, and wood drops remain code-authored',
  },
  'tree-broadleaf': {
    kind: 'broadleaf',
    orientationPolicy: 'longest-axis-to-y',
    acceptanceNote: 'accepted as an instanced broadleaf tree skin; chop state, hit proxy, and wood drops remain code-authored',
  },
  'tree-dead-snag': {
    kind: 'deadSnag',
    orientationPolicy: 'longest-axis-to-y',
    acceptanceNote: 'accepted as an instanced dead-snag tree skin; chop state, hit proxy, and wood drops remain code-authored',
  },
  'tree-shrub': {
    kind: 'shrub',
    orientationPolicy: 'preserve-y-up',
    acceptanceNote: 'accepted as an instanced shrub/young-tree skin; chop state, hit proxy, and wood drops remain code-authored',
  },
};

export const CREATURE_ACTIVE_MIXER_RADIUS = 90;
export const CREATURE_LOW_RATE_MIXER_RADIUS = 135;
export const CREATURE_FROZEN_MIXER_RADIUS = 180;

const RUNTIME_CREATURE_SKINS: Record<KilnCreatureSkinSlug, {
  kind: NativeCreatureKind;
  fitHeight: number;
  acceptanceNote: string;
}> = {
  'creature-moss-puff': {
    kind: 'mossPuff',
    fitHeight: 0.86,
    acceptanceNote: 'accepted as an animated moss-puff body; tending rewards and seed-burr state remain code-authored',
  },
  'creature-brambleback': {
    kind: 'brambleback',
    fitHeight: 0.94,
    acceptanceNote: 'accepted as an animated brambleback body; crowding pressure, warding, and warning ring remain code-authored',
  },
  'creature-shell-skitter': {
    kind: 'shellSkitter',
    fitHeight: 0.62,
    acceptanceNote: 'accepted as an animated shell-skitter body; bait/kelp reward and shore cue remain code-authored',
  },
  'creature-reedback-grazer': {
    kind: 'reedbackGrazer',
    fitHeight: 0.82,
    acceptanceNote: 'accepted as an animated reedback-grazer body; compost reward and garden cue remain code-authored',
  },
  'creature-cave-belljaw': {
    kind: 'caveBelljaw',
    fitHeight: 0.94,
    acceptanceNote: 'accepted as an animated cave-belljaw body; cave pressure, weakness, and warning ring remain code-authored',
  },
  'creature-cave-blinker': {
    kind: 'caveBlinker',
    fitHeight: 0.9,
    acceptanceNote: 'accepted as an animated cave-blinker body; blink reward/focus loop remains code-authored',
  },
  'creature-scree-snapper': {
    kind: 'screeSnapper',
    fitHeight: 0.62,
    acceptanceNote: 'accepted as an animated scree-snapper body; mining wake-up, stun reward, and telegraph remain code-authored',
  },
  'creature-storm-burr': {
    kind: 'stormBurr',
    fitHeight: 0.86,
    acceptanceNote: 'accepted as an animated storm-burr body; weather pressure and gust telegraph remain code-authored',
  },
  'creature-tide-lurker': {
    kind: 'tideLurker',
    fitHeight: 0.76,
    acceptanceNote: 'accepted as an animated tide-lurker body; fishing pressure, warding, and splash telegraph remain code-authored',
  },
};

function publicAssetUrl(relativePath: string, base = import.meta.env.BASE_URL || '/'): string {
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${relativePath.replace(/^\/+/, '')}`;
}

function cloneTemplate(template: THREE.Object3D, slug: KilnStructureSkinSlug, transform: KilnSkinTransform): THREE.Group {
  const root = new THREE.Group();
  root.name = `kiln-skin-${slug}`;
  root.userData.kilnAssetSlug = slug;
  root.userData.kilnSocketItem = transform.socket.item;
  root.userData.kilnSocketRole = transform.socket.role;
  root.userData.kilnAcceptanceNote = transform.acceptanceNote;
  root.position.set(...transform.position);
  root.rotation.set(...transform.rotation);
  if (Array.isArray(transform.scale)) root.scale.set(...transform.scale);
  else root.scale.setScalar(transform.scale);

  const body = template.clone(true);
  body.name = `kiln-body-${slug}`;
  body.traverse((child) => {
    child.userData.kilnAssetSlug = slug;
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    }
  });
  root.add(body);
  return root;
}

function fittedSize(object: THREE.Object3D): number[] {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return [0, 0, 0];
  const size = new THREE.Vector3();
  box.getSize(size);
  return [size.x, size.y, size.z].map((value) => Number(value.toFixed(3)));
}

function resolveTransform(base: KilnSkinTransform, template: THREE.Object3D): KilnSkinTransform {
  if (!base.fitSourceSize) return base;
  const source = fittedSize(template);
  const scale = base.fitSourceSize.map((target, index) => {
    const size = source[index] ?? 0;
    return size > 0 ? Number((target / size).toFixed(4)) : 1;
  }) as [number, number, number];
  return { ...base, scale };
}

function sourceBboxSize(manifest: KilnManifestAsset): number[] {
  return manifest.geometry?.bboxLocal?.size?.map((value) => Number(value.toFixed(3))) ?? [];
}

function policySnapshot(
  slug: KilnStructureSkinSlug,
  transform: KilnSkinTransform,
  manifest: KilnManifestAsset,
  template?: THREE.Object3D,
): Omit<KilnSkinFitSnapshot, 'fittedBboxSize' | 'sourceUrl'> {
  return {
    slug,
    item: transform.socket.item,
    socketRole: transform.socket.role,
    sourceBboxSize: sourceBboxSize(manifest),
    runtimeSourceBboxSize: template ? fittedSize(template) : undefined,
    scale: transform.scale,
    position: transform.position,
    rotation: transform.rotation,
    loadBearing: transform.socket.loadBearing,
    glbPolicy: transform.socket.glbPolicy,
    instanceability: manifest.instanceability,
    modularKit: manifest.modularKit,
    acceptanceNote: transform.acceptanceNote,
  };
}

function cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  return Array.isArray(material) ? material.map((entry) => entry.clone()) : material.clone();
}

function bboxSizeOfBox(box: THREE.Box3): number[] {
  if (box.isEmpty()) return [0, 0, 0];
  const size = new THREE.Vector3();
  box.getSize(size);
  return [size.x, size.y, size.z].map((value) => Number(value.toFixed(3)));
}

function cloneFloatAttribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const array = new Float32Array(attribute.count * attribute.itemSize);
  const sourceArray = attribute instanceof THREE.BufferAttribute ? attribute.array : null;
  const normalizedScale = attribute.normalized
    ? sourceArray instanceof Uint8Array ? 1 / 255
    : sourceArray instanceof Int8Array ? 1 / 127
    : sourceArray instanceof Uint16Array ? 1 / 65535
    : sourceArray instanceof Int16Array ? 1 / 32767
    : 1
    : 1;
  for (let i = 0; i < attribute.count; i += 1) {
    for (let j = 0; j < attribute.itemSize; j += 1) {
      array[i * attribute.itemSize + j] = attribute.getComponent(i, j) * normalizedScale;
    }
  }
  return new THREE.BufferAttribute(array, attribute.itemSize, false);
}

function sanitizeInstancedGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const input = source.index ? source.toNonIndexed() : source.clone();
  const geometry = new THREE.BufferGeometry();
  for (const name of Object.keys(input.attributes)) {
    const attribute = input.getAttribute(name);
    if (!attribute) continue;
    geometry.setAttribute(name, cloneFloatAttribute(attribute));
  }
  if (!geometry.getAttribute('normal') && geometry.getAttribute('position')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function harmonizeMergeAttributes(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  if (geometries.length <= 1) return geometries;
  const common = new Map<string, number>();
  for (const name of Object.keys(geometries[0].attributes)) {
    const attribute = geometries[0].getAttribute(name);
    if (attribute) common.set(name, attribute.itemSize);
  }
  for (const geometry of geometries.slice(1)) {
    for (const [name, itemSize] of [...common]) {
      const attribute = geometry.getAttribute(name);
      if (!attribute || attribute.itemSize !== itemSize) common.delete(name);
    }
  }
  if (!common.has('position')) return geometries;
  return geometries.map((geometry) => {
    const copy = geometry.clone();
    for (const name of Object.keys(copy.attributes)) {
      if (!common.has(name)) copy.deleteAttribute(name);
    }
    return copy;
  });
}

function axisCorrectionFor(sourceUpAxis: KilnSourceUpAxis): { matrix: THREE.Matrix4; euler: [number, number, number] } {
  if (sourceUpAxis === 'x') {
    return {
      matrix: new THREE.Matrix4().makeRotationZ(Math.PI / 2),
      euler: [0, 0, Number((Math.PI / 2).toFixed(6))],
    };
  }
  if (sourceUpAxis === 'z') {
    return {
      matrix: new THREE.Matrix4().makeRotationX(-Math.PI / 2),
      euler: [Number((-Math.PI / 2).toFixed(6)), 0, 0],
    };
  }
  return {
    matrix: new THREE.Matrix4().identity(),
    euler: [0, 0, 0],
  };
}

function dominantAxis(size: THREE.Vector3, policy: KilnInstancedOrientationPolicy): KilnSourceUpAxis {
  if (policy !== 'longest-axis-to-y') return 'y';
  const axes: { axis: KilnSourceUpAxis; value: number }[] = [
    { axis: 'x', value: size.x },
    { axis: 'y', value: size.y },
    { axis: 'z', value: size.z },
  ];
  axes.sort((a, b) => b.value - a.value);
  const largest = axes[0];
  return largest.value > size.y * 1.12 ? largest.axis : 'y';
}

export function makeInstancedAssetParts(
  template: THREE.Object3D,
  slug: string,
  orientationPolicy: KilnInstancedOrientationPolicy = 'preserve-y-up',
): {
  parts: KilnInstancedAssetPart[];
  runtimeSourceBboxSize: number[];
  orientedSourceBboxSize: number[];
  normalizedBboxSize: number[];
  sourceMeshCount: number;
  orientation: KilnInstancedOrientationSnapshot;
} {
  template.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(template);
  const sourceSize = new THREE.Vector3();
  sourceBox.getSize(sourceSize);
  const sourceUpAxis = dominantAxis(sourceSize, orientationPolicy);
  const correction = axisCorrectionFor(sourceUpAxis);
  const orientedSourceBox = new THREE.Box3();
  const byMaterial = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; sourceMeshNames: string[] }>();
  const looseParts: KilnInstancedAssetPart[] = [];
  const correctedMeshes: {
    geometry: THREE.BufferGeometry;
    material: THREE.Material | THREE.Material[];
    sourceName: string;
  }[] = [];
  let sourceMeshCount = 0;

  template.traverse((child) => {
    const source = child as THREE.Mesh;
    if (!source.isMesh || !source.geometry) return;
    sourceMeshCount += 1;
    const geometry = source.geometry.clone();
    geometry.applyMatrix4(source.matrixWorld);
    geometry.applyMatrix4(correction.matrix);
    geometry.computeBoundingBox();
    if (geometry.boundingBox) orientedSourceBox.union(geometry.boundingBox);
    correctedMeshes.push({
      geometry,
      material: source.material,
      sourceName: source.name || `mesh-${sourceMeshCount}`,
    });
  });

  if (orientedSourceBox.isEmpty()) orientedSourceBox.copy(sourceBox);
  const center = new THREE.Vector3();
  orientedSourceBox.getCenter(center);
  const normalize = new THREE.Matrix4().makeTranslation(-center.x, -orientedSourceBox.min.y, -center.z);

  for (const corrected of correctedMeshes) {
    const geometry = corrected.geometry;
    geometry.applyMatrix4(normalize);
    const instancedGeometry = sanitizeInstancedGeometry(geometry);
    if (Array.isArray(corrected.material)) {
      looseParts.push({
        name: `kiln-instanced-${slug}-loose-${looseParts.length}`,
        sourceMeshNames: [corrected.sourceName],
        sourceMeshCount: 1,
        geometry: instancedGeometry,
        material: cloneMaterial(corrected.material),
      });
      continue;
    }
    const entry = byMaterial.get(corrected.material) ?? { geometries: [], sourceMeshNames: [] };
    entry.geometries.push(instancedGeometry);
    entry.sourceMeshNames.push(corrected.sourceName);
    byMaterial.set(corrected.material, entry);
  }

  const parts: KilnInstancedAssetPart[] = [];
  let materialIndex = 0;
  for (const [material, entry] of byMaterial) {
    let geometry: THREE.BufferGeometry | null = null;
    const geometries = harmonizeMergeAttributes(entry.geometries);
    try {
      geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    } catch {
      geometry = null;
    }
    if (geometry) {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      parts.push({
        name: `kiln-instanced-${slug}-material-${materialIndex}`,
        sourceMeshNames: entry.sourceMeshNames,
        sourceMeshCount: entry.sourceMeshNames.length,
        geometry,
        material: cloneMaterial(material),
      });
    } else {
      for (let i = 0; i < entry.geometries.length; i += 1) {
        parts.push({
          name: `kiln-instanced-${slug}-mesh-${materialIndex}-${i}`,
          sourceMeshNames: [entry.sourceMeshNames[i] ?? `mesh-${i}`],
          sourceMeshCount: 1,
          geometry: entry.geometries[i],
          material: cloneMaterial(material),
        });
      }
    }
    materialIndex += 1;
  }
  parts.push(...looseParts);

  const normalizedBox = new THREE.Box3();
  for (const part of parts) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    const box = part.geometry.boundingBox;
    if (box) normalizedBox.union(box);
  }

  return {
    parts,
    runtimeSourceBboxSize: bboxSizeOfBox(sourceBox),
    orientedSourceBboxSize: bboxSizeOfBox(orientedSourceBox),
    normalizedBboxSize: bboxSizeOfBox(normalizedBox),
    sourceMeshCount,
    orientation: {
      policy: orientationPolicy,
      sourceUpAxis,
      axisCorrection: correction.euler,
    },
  };
}

function normalizeCreatureTemplate(source: THREE.Object3D, slug: string, targetHeight: number): {
  template: THREE.Object3D;
  runtimeSourceBboxSize: number[];
  normalizedBboxSize: number[];
  sourceMeshCount: number;
} {
  source.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(source);
  const runtimeSourceBboxSize = bboxSizeOfBox(sourceBox);
  const size = new THREE.Vector3();
  sourceBox.getSize(size);
  const center = new THREE.Vector3();
  sourceBox.getCenter(center);
  const scale = size.y > 0 ? Math.max(0.01, targetHeight / size.y) : 1;
  const root = new THREE.Group();
  root.name = `kiln-creature-template-${slug}`;
  const body = source.clone(true);
  body.name = `kiln-creature-body-${slug}`;
  body.position.set(-center.x, -sourceBox.min.y, -center.z);
  body.scale.setScalar(scale);
  let sourceMeshCount = 0;
  body.traverse((child) => {
    child.userData.kilnAssetSlug = slug;
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      sourceMeshCount += 1;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  });
  root.add(body);
  root.updateMatrixWorld(true);
  const normalizedBboxSize = fittedSize(root);
  return { template: root, runtimeSourceBboxSize, normalizedBboxSize, sourceMeshCount };
}

export class KilnRuntimeAssets implements StructureSkinProvider, ResourceDropSkinProvider, DomainResourceSkinProvider, TreeSkinProvider, CreatureSkinProvider {
  private readonly enabled = new Set<KilnStructureSkinSlug>(['waystone', 'door-kit', 'window-frame', 'roof-bundle']);
  private readonly enabledResourceDrops = new Set<KilnResourceDropSkinSlug>(['drop-wood-logs', 'drop-ore-chunk']);
  private readonly enabledDomainResourceSkins = new Set<KilnDomainResourceSkinSlug>([
    'node-hearth-coal',
    'node-rain-reed',
    'node-salt-shell',
    'node-lantern-shard',
    'node-root-pod',
    'node-red-nodule',
    'node-snow-bloom',
    'node-glass-shard',
    'node-storm-amber',
    'node-reed-kelp',
    'node-bell-crystal',
    'node-horizon-shard',
  ]);
  private readonly enabledTreeSkins = new Set<KilnTreeSkinSlug>(['tree-pine', 'tree-broadleaf', 'tree-dead-snag', 'tree-shrub']);
  private readonly enabledCreatureSkins = new Set<KilnCreatureSkinSlug>([
    'creature-moss-puff',
    'creature-brambleback',
    'creature-shell-skitter',
    'creature-reedback-grazer',
    'creature-cave-belljaw',
    'creature-cave-blinker',
    'creature-scree-snapper',
    'creature-storm-burr',
    'creature-tide-lurker',
  ]);
  private readonly loader = new GLTFLoader();
  private readonly loaded = new Set<KilnStructureSkinSlug>();
  private readonly loadedResourceDrops = new Set<KilnResourceDropSkinSlug>();
  private readonly loadedDomainResourceSkins = new Set<KilnDomainResourceSkinSlug>();
  private readonly loadedTreeSkins = new Set<KilnTreeSkinSlug>();
  private readonly loadedCreatureSkins = new Set<KilnCreatureSkinSlug>();
  private readonly failed: string[] = [];
  private readonly modelRequests: string[] = [];
  private manifestPromise: Promise<KilnManifest | null> | null = null;
  private manifestLoaded = false;
  private readonly templates = new Map<KilnStructureSkinSlug, Promise<LoadedKilnAsset | null>>();
  private readonly resourceDropTemplates = new Map<KilnResourceDropSkinSlug, Promise<KilnResourceDropSkinTemplate | null>>();
  private readonly domainResourceTemplates = new Map<KilnDomainResourceSkinSlug, Promise<KilnDomainResourceSkinTemplate | null>>();
  private readonly treeTemplates = new Map<KilnTreeSkinSlug, Promise<KilnTreeSkinTemplate | null>>();
  private readonly creatureTemplates = new Map<KilnCreatureSkinSlug, Promise<KilnCreatureSkinTemplate | null>>();
  private readonly baseUrl: string;

  readonly manifestUrl: string;

  constructor(baseUrl = import.meta.env.BASE_URL || '/') {
    this.baseUrl = baseUrl;
    this.manifestUrl = publicAssetUrl('assets/kiln/ASSET_MANIFEST.json', baseUrl);
  }

  async createStructureSkin(slug: KilnStructureSkinSlug): Promise<KilnStructureSkin | null> {
    const loaded = await this.loadTemplate(slug);
    if (!loaded) return null;
    const object = cloneTemplate(loaded.template, slug, loaded.transform);
    object.userData.kilnAssetFile = loaded.manifest.file;
    object.userData.kilnAssetSourceUrl = loaded.sourceUrl;
    const fit: KilnSkinFitSnapshot = {
      ...policySnapshot(slug, loaded.transform, loaded.manifest, loaded.template),
      fittedBboxSize: fittedSize(object),
      sourceUrl: loaded.sourceUrl,
    };
    object.userData.kilnSkinFit = fit;
    return {
      slug,
      object,
      manifest: loaded.manifest,
      sourceUrl: loaded.sourceUrl,
      hideProceduralNames: loaded.transform.hideProceduralNames,
      fit,
    };
  }

  async createResourceDropSkinTemplate(slug: KilnResourceDropSkinSlug): Promise<KilnResourceDropSkinTemplate | null> {
    return this.loadResourceDropTemplate(slug);
  }

  async createDomainResourceSkinTemplate(slug: KilnDomainResourceSkinSlug): Promise<KilnDomainResourceSkinTemplate | null> {
    return this.loadDomainResourceTemplate(slug);
  }

  async createTreeSkinTemplate(slug: KilnTreeSkinSlug): Promise<KilnTreeSkinTemplate | null> {
    return this.loadTreeTemplate(slug);
  }

  async createCreatureSkinTemplate(slug: KilnCreatureSkinSlug): Promise<KilnCreatureSkinTemplate | null> {
    return this.loadCreatureTemplate(slug);
  }

  snapshot(): KilnAssetSnapshot {
    return {
      enabled: [...this.enabled],
      manifestUrl: this.manifestUrl,
      modelRequests: [...this.modelRequests],
      manifestLoaded: this.manifestLoaded,
      loaded: [...this.loaded],
      failed: [...this.failed],
      structureSkins: Object.fromEntries(
        [...this.enabled].map((slug) => {
          const transform = RUNTIME_STRUCTURE_SKINS[slug];
          return [slug, policySnapshot(slug, transform, { slug, status: 'ready', file: null })];
        }),
      ),
      resourceDropSkins: {
        enabled: [...this.enabledResourceDrops],
        loaded: [...this.loadedResourceDrops],
      },
      domainResourceSkins: {
        enabled: [...this.enabledDomainResourceSkins],
        loaded: [...this.loadedDomainResourceSkins],
      },
      treeSkins: {
        enabled: [...this.enabledTreeSkins],
        loaded: [...this.loadedTreeSkins],
      },
      creatureSkins: {
        enabled: [...this.enabledCreatureSkins],
        loaded: [...this.loadedCreatureSkins],
      },
    };
  }

  private async loadManifest(): Promise<KilnManifest | null> {
    if (!this.manifestPromise) {
      this.manifestPromise = fetch(this.manifestUrl, { cache: 'force-cache' })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Kiln manifest HTTP ${response.status}`);
          const manifest = await response.json() as KilnManifest;
          this.manifestLoaded = true;
          return manifest;
        })
        .catch((err: unknown) => {
          this.failed.push(`manifest: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        });
    }
    return this.manifestPromise;
  }

  private loadTemplate(slug: KilnStructureSkinSlug): Promise<LoadedKilnAsset | null> {
    if (!this.enabled.has(slug)) return Promise.resolve(null);
    const existing = this.templates.get(slug);
    if (existing) return existing;

    const promise = this.loadManifest()
      .then(async (manifest) => {
        const asset = manifest?.assets?.find((entry) => entry.slug === slug);
        if (!asset || asset.status !== 'ready' || !asset.file) {
          this.failed.push(`${slug}: missing ready manifest record`);
          return null;
        }
        const sourceUrl = publicAssetUrl(`assets/kiln/${asset.file}`, this.baseUrl);
        this.modelRequests.push(sourceUrl);
        const gltf = await this.loader.loadAsync(sourceUrl);
        const transform = resolveTransform(RUNTIME_STRUCTURE_SKINS[slug], gltf.scene as unknown as THREE.Object3D);
        this.loaded.add(slug);
        return {
          slug,
          manifest: asset,
          sourceUrl,
          template: gltf.scene as unknown as THREE.Object3D,
          transform,
        };
      })
      .catch((err: unknown) => {
        this.failed.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });

    this.templates.set(slug, promise);
    return promise;
  }

  private loadResourceDropTemplate(slug: KilnResourceDropSkinSlug): Promise<KilnResourceDropSkinTemplate | null> {
    if (!this.enabledResourceDrops.has(slug)) return Promise.resolve(null);
    const existing = this.resourceDropTemplates.get(slug);
    if (existing) return existing;

    const promise = this.loadManifest()
      .then(async (manifest) => {
        const asset = manifest?.assets?.find((entry) => entry.slug === slug);
        if (!asset || asset.status !== 'ready' || !asset.file) {
          this.failed.push(`${slug}: missing ready manifest record`);
          return null;
        }
        const sourceUrl = publicAssetUrl(`assets/kiln/${asset.file}`, this.baseUrl);
        this.modelRequests.push(sourceUrl);
        const gltf = await this.loader.loadAsync(sourceUrl);
        const template = gltf.scene as unknown as THREE.Object3D;
        const { parts, runtimeSourceBboxSize, orientedSourceBboxSize, normalizedBboxSize, sourceMeshCount, orientation } =
          makeInstancedAssetParts(template, slug);
        if (parts.length === 0) {
          this.failed.push(`${slug}: no mesh parts available for instancing`);
          return null;
        }
        this.loadedResourceDrops.add(slug);
        const drop = RUNTIME_RESOURCE_DROP_SKINS[slug];
        const fit: KilnResourceDropSkinFitSnapshot = {
          slug,
          item: drop.item,
          socketRole: 'ground-pickup',
          sourceBboxSize: sourceBboxSize(asset),
          runtimeSourceBboxSize,
          orientedSourceBboxSize,
          normalizedBboxSize,
          normalizePolicy: 'center-xz-bottom-y',
          orientation,
          batchingPolicy: 'instanced-merged-by-material',
          animationPolicy: 'matrix-bob-only',
          sourceUrl,
          sourceMeshCount,
          instancedMeshCount: parts.length,
          materialCount: asset.geometry?.materialCount,
          acceptanceNote: drop.acceptanceNote,
        };
        return {
          slug,
          manifest: asset,
          sourceUrl,
          parts,
          fit,
        };
      })
      .catch((err: unknown) => {
        this.failed.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });

    this.resourceDropTemplates.set(slug, promise);
    return promise;
  }

  private loadDomainResourceTemplate(slug: KilnDomainResourceSkinSlug): Promise<KilnDomainResourceSkinTemplate | null> {
    if (!this.enabledDomainResourceSkins.has(slug)) return Promise.resolve(null);
    const existing = this.domainResourceTemplates.get(slug);
    if (existing) return existing;

    const promise = this.loadManifest()
      .then(async (manifest) => {
        const asset = manifest?.assets?.find((entry) => entry.slug === slug);
        if (!asset || asset.status !== 'ready' || !asset.file) {
          this.failed.push(`${slug}: missing ready manifest record`);
          return null;
        }
        const sourceUrl = publicAssetUrl(`assets/kiln/${asset.file}`, this.baseUrl);
        this.modelRequests.push(sourceUrl);
        const gltf = await this.loader.loadAsync(sourceUrl);
        const template = gltf.scene as unknown as THREE.Object3D;
        const { parts, runtimeSourceBboxSize, orientedSourceBboxSize, normalizedBboxSize, sourceMeshCount, orientation } =
          makeInstancedAssetParts(template, slug);
        if (parts.length === 0) {
          this.failed.push(`${slug}: no mesh parts available for instancing`);
          return null;
        }
        this.loadedDomainResourceSkins.add(slug);
        const node = RUNTIME_DOMAIN_RESOURCE_SKINS[slug];
        const fit: KilnDomainResourceSkinFitSnapshot = {
          slug,
          kind: node.kind,
          socketRole: 'domain-resource-node',
          sourceBboxSize: sourceBboxSize(asset),
          runtimeSourceBboxSize,
          orientedSourceBboxSize,
          normalizedBboxSize,
          normalizePolicy: 'center-xz-bottom-y',
          orientation,
          batchingPolicy: 'instanced-merged-by-material',
          animationPolicy: 'matrix-pulse-only',
          sourceUrl,
          sourceMeshCount,
          instancedMeshCount: parts.length,
          materialCount: asset.geometry?.materialCount,
          acceptanceNote: node.acceptanceNote,
        };
        return {
          slug,
          kind: node.kind,
          manifest: asset,
          sourceUrl,
          parts,
          fit,
        };
      })
      .catch((err: unknown) => {
        this.failed.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });

    this.domainResourceTemplates.set(slug, promise);
    return promise;
  }

  private loadTreeTemplate(slug: KilnTreeSkinSlug): Promise<KilnTreeSkinTemplate | null> {
    if (!this.enabledTreeSkins.has(slug)) return Promise.resolve(null);
    const existing = this.treeTemplates.get(slug);
    if (existing) return existing;

    const promise = this.loadManifest()
      .then(async (manifest) => {
        const asset = manifest?.assets?.find((entry) => entry.slug === slug);
        if (!asset || asset.status !== 'ready' || !asset.file) {
          this.failed.push(`${slug}: missing ready manifest record`);
          return null;
        }
        const sourceUrl = publicAssetUrl(`assets/kiln/${asset.file}`, this.baseUrl);
        this.modelRequests.push(sourceUrl);
        const gltf = await this.loader.loadAsync(sourceUrl);
        const template = gltf.scene as unknown as THREE.Object3D;
        const tree = RUNTIME_TREE_SKINS[slug];
        const { parts, runtimeSourceBboxSize, orientedSourceBboxSize, normalizedBboxSize, sourceMeshCount, orientation } =
          makeInstancedAssetParts(template, slug, tree.orientationPolicy);
        if (parts.length === 0) {
          this.failed.push(`${slug}: no mesh parts available for instancing`);
          return null;
        }
        this.loadedTreeSkins.add(slug);
        const fit: KilnTreeSkinFitSnapshot = {
          slug,
          kind: tree.kind,
          socketRole: 'tree-scatter',
          sourceBboxSize: sourceBboxSize(asset),
          runtimeSourceBboxSize,
          orientedSourceBboxSize,
          normalizedBboxSize,
          normalizePolicy: 'center-xz-bottom-y',
          orientation,
          batchingPolicy: 'instanced-merged-by-material',
          animationPolicy: 'matrix-sway-near-and-damage-only',
          sourceUrl,
          sourceMeshCount,
          instancedMeshCount: parts.length,
          materialCount: asset.geometry?.materialCount,
          acceptanceNote: tree.acceptanceNote,
        };
        return {
          slug,
          kind: tree.kind,
          manifest: asset,
          sourceUrl,
          parts,
          fit,
        };
      })
      .catch((err: unknown) => {
        this.failed.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });

    this.treeTemplates.set(slug, promise);
    return promise;
  }

  private loadCreatureTemplate(slug: KilnCreatureSkinSlug): Promise<KilnCreatureSkinTemplate | null> {
    if (!this.enabledCreatureSkins.has(slug)) return Promise.resolve(null);
    const existing = this.creatureTemplates.get(slug);
    if (existing) return existing;

    const promise = this.loadManifest()
      .then(async (manifest) => {
        const asset = manifest?.assets?.find((entry) => entry.slug === slug);
        if (!asset || asset.status !== 'ready' || !asset.file) {
          this.failed.push(`${slug}: missing ready manifest record`);
          return null;
        }
        const sourceUrl = publicAssetUrl(`assets/kiln/${asset.file}`, this.baseUrl);
        this.modelRequests.push(sourceUrl);
        const gltf = await this.loader.loadAsync(sourceUrl);
        const creature = RUNTIME_CREATURE_SKINS[slug];
        const { template, runtimeSourceBboxSize, normalizedBboxSize, sourceMeshCount } =
          normalizeCreatureTemplate(gltf.scene as unknown as THREE.Object3D, slug, creature.fitHeight);
        const clips = gltf.animations ?? [];
        if (clips.length === 0) {
          this.failed.push(`${slug}: missing animation clips`);
          return null;
        }
        const loadedClipNames = new Set(clips.map((clip) => clip.name));
        if (!loadedClipNames.has('idle') || !loadedClipNames.has('walk')) {
          this.failed.push(`${slug}: missing required idle/walk clips`);
          return null;
        }
        const animationClips = (asset.animations ?? clips.map((clip) => ({ name: clip.name, durationSec: clip.duration, channels: 0 })))
          .filter((clip) => typeof clip.name === 'string')
          .map((clip) => ({
            name: String(clip.name),
            channels: Math.max(0, Math.trunc(clip.channels ?? 0)),
            durationSec: Number((Number(clip.durationSec ?? clips.find((loadedClip) => loadedClip.name === clip.name)?.duration ?? 0)).toFixed(3)),
          }));
        this.loadedCreatureSkins.add(slug);
        const fit: KilnCreatureSkinFitSnapshot = {
          slug,
          kind: creature.kind,
          socketRole: 'native-creature-body',
          sourceBboxSize: sourceBboxSize(asset),
          runtimeSourceBboxSize,
          normalizedBboxSize,
          normalizePolicy: 'center-xz-bottom-y-fit-height',
          animationPolicy: 'mixer-near-freeze-far',
          sourceUrl,
          sourceMeshCount,
          materialCount: asset.geometry?.materialCount,
          animationClips,
          activeMixerRadius: CREATURE_ACTIVE_MIXER_RADIUS,
          lowRateMixerRadius: CREATURE_LOW_RATE_MIXER_RADIUS,
          frozenMixerRadius: CREATURE_FROZEN_MIXER_RADIUS,
          acceptanceNote: creature.acceptanceNote,
        };
        return {
          slug,
          kind: creature.kind,
          manifest: asset,
          sourceUrl,
          template,
          clips,
          fit,
        };
      })
      .catch((err: unknown) => {
        this.failed.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });

    this.creatureTemplates.set(slug, promise);
    return promise;
  }
}
