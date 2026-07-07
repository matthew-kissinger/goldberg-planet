import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DomainResourceKind } from '../sim/domainResources';
import type { FishSchoolKind } from '../sim/fishing';
import type { PentagonExpeditionSiteKind } from '../sim/landmarks';
import type { NativeCreatureKind } from '../sim/nativeLife';
import type { SkyfallKind } from '../sim/skyfall';
import type { NaturalVoidKind } from '../world/caves';
import type { TreeVisualKind } from '../world/trees';

export type KilnStructureSkinSlug =
  | 'waystone'
  | 'cave-anchor'
  | 'door-kit'
  | 'window-frame'
  | 'roof-bundle'
  | 'workbench'
  | 'campfire'
  | 'chest'
  | 'bedroll'
  | 'crop-plot'
  | 'compost-bin'
  | 'rain-cistern'
  | 'root-cellar'
  | 'dock-segment'
  | 'fish-trap'
  | 'shore-net'
  | 'drying-rack'
  | 'weather-vane'
  | 'lantern-post';
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
export type KilnFishSkinSlug =
  | 'fish-shore-minnow'
  | 'fish-storm-runner'
  | 'fish-cave-shimmer'
  | 'creature-driftjelly'
  | 'fish-reed-fry';
export type KilnBirdSkinSlug =
  | 'bird-sky-kite'
  | 'bird-shore-gull'
  | 'bird-forest-flutter'
  | 'bird-storm-finch';
export type KilnBirdKind = 'sky' | 'shore' | 'forest' | 'storm';
export type KilnSkyfallSkinSlug = 'crater-emberfall' | 'crater-glassrain' | 'crater-starbloom';
export type KilnLandmarkSkinSlug =
  | 'shrine-first-hearth'
  | 'shrine-rainward-gate'
  | 'shrine-salt-mirror'
  | 'shrine-high-lantern'
  | 'shrine-root-vault'
  | 'shrine-red-cairn'
  | 'shrine-snow-dial'
  | 'shrine-glass-shoal'
  | 'shrine-storm-seat'
  | 'shrine-reed-crown'
  | 'shrine-deep-bell'
  | 'shrine-last-horizon';
export type KilnCaveMouthSkinSlug = 'cave-mouth-arch' | 'cave-mouth-dry' | 'cave-mouth-sea';

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
  hideGlbNames?: readonly string[];
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
  fishSkins?: {
    enabled: readonly KilnFishSkinSlug[];
    loaded: readonly KilnFishSkinSlug[];
  };
  birdSkins?: {
    enabled: readonly KilnBirdSkinSlug[];
    loaded: readonly KilnBirdSkinSlug[];
  };
  skyfallSkins?: {
    enabled: readonly KilnSkyfallSkinSlug[];
    loaded: readonly KilnSkyfallSkinSlug[];
  };
  landmarkSkins?: {
    enabled: readonly KilnLandmarkSkinSlug[];
    loaded: readonly KilnLandmarkSkinSlug[];
  };
  caveMouthSkins?: {
    enabled: readonly KilnCaveMouthSkinSlug[];
    loaded: readonly KilnCaveMouthSkinSlug[];
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

export type KilnInstancedOrientationPolicy = 'preserve-y-up' | 'preserve-y-up-x-front-to-z' | 'preserve-y-up-neg-x-front-to-z' | 'longest-axis-to-y' | 'longest-axis-to-z';
export type KilnSourceUpAxis = 'x' | 'y' | 'z';
export type KilnSourceForwardAxis = '+x' | '-x' | '+z';

export interface KilnInstancedOrientationSnapshot {
  policy: KilnInstancedOrientationPolicy;
  sourceUpAxis: KilnSourceUpAxis;
  sourceForwardAxis?: KilnSourceForwardAxis;
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
  animationPolicy: 'root-anchored-sway-near-and-damage-tilt';
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
  orientedSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  normalizePolicy: 'center-xz-bottom-y-fit-height';
  orientation: KilnInstancedOrientationSnapshot;
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

export interface KilnFishSkinFitSnapshot {
  slug: KilnFishSkinSlug;
  schoolKind: FishSchoolKind;
  socketRole: 'fish-school-body';
  sourceBboxSize: readonly number[];
  runtimeSourceBboxSize: readonly number[];
  orientedSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  normalizePolicy: 'center-xyz-fit-length-longest-axis-forward';
  orientation: KilnInstancedOrientationSnapshot;
  animationPolicy: 'single-animated-anchors-plus-point-school-near-freeze-far';
  sourceUrl: string;
  sourceMeshCount: number;
  materialCount?: number;
  animationClips: readonly { name: string; channels: number; durationSec: number }[];
  activeMixerRadius: number;
  lowRateMixerRadius: number;
  frozenMixerRadius: number;
  acceptanceNote: string;
}

export interface KilnFishSkinTemplate {
  slug: KilnFishSkinSlug;
  schoolKind: FishSchoolKind;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  template: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
  fit: KilnFishSkinFitSnapshot;
}

export interface FishSkinProvider {
  createFishSkinTemplate(slug: KilnFishSkinSlug): Promise<KilnFishSkinTemplate | null>;
  snapshot?(): KilnAssetSnapshot;
}

export interface KilnBirdSkinFitSnapshot {
  slug: KilnBirdSkinSlug;
  kind: KilnBirdKind;
  socketRole: 'sky-life-body';
  sourceBboxSize: readonly number[];
  runtimeSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  normalizePolicy: 'center-xyz-fit-span-preserve-y-up';
  orientation: KilnInstancedOrientationSnapshot;
  animationPolicy: 'single-animated-anchors-plus-point-flock-near-freeze-far';
  sourceUrl: string;
  sourceMeshCount: number;
  materialCount?: number;
  animationClips: readonly { name: string; channels: number; durationSec: number }[];
  activeMixerRadius: number;
  lowRateMixerRadius: number;
  frozenMixerRadius: number;
  acceptanceNote: string;
}

export interface KilnBirdSkinTemplate {
  slug: KilnBirdSkinSlug;
  kind: KilnBirdKind;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  template: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
  fit: KilnBirdSkinFitSnapshot;
}

export interface BirdSkinProvider {
  createBirdSkinTemplate(slug: KilnBirdSkinSlug): Promise<KilnBirdSkinTemplate | null>;
  snapshot?(): KilnAssetSnapshot;
}

export interface KilnSkyfallSkinFitSnapshot {
  slug: KilnSkyfallSkinSlug;
  kind: SkyfallKind;
  socketRole: 'skyfall-crater-shell';
  sourceBboxSize: readonly number[];
  runtimeSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  normalizePolicy: 'center-xz-bottom-y-fit-footprint-height';
  orientation: KilnInstancedOrientationSnapshot;
  animationPolicy: 'static-shell-with-procedural-omen-overlays';
  sourceUrl: string;
  sourceMeshCount: number;
  materialCount?: number;
  targetFootprint: number;
  targetHeight: number;
  acceptanceNote: string;
}

export interface KilnSkyfallSkinTemplate {
  slug: KilnSkyfallSkinSlug;
  kind: SkyfallKind;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  template: THREE.Object3D;
  fit: KilnSkyfallSkinFitSnapshot;
}

export interface SkyfallSkinProvider {
  createSkyfallSkinTemplate(slug: KilnSkyfallSkinSlug): Promise<KilnSkyfallSkinTemplate | null>;
  snapshot?(): KilnAssetSnapshot;
}

export interface KilnLandmarkSkinFitSnapshot {
  slug: KilnLandmarkSkinSlug;
  kind: PentagonExpeditionSiteKind;
  socketRole: 'pentagon-landmark-shell';
  sourceBboxSize: readonly number[];
  runtimeSourceBboxSize: readonly number[];
  orientedSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  normalizePolicy: 'center-xz-bottom-y-fit-footprint-height';
  orientation: KilnInstancedOrientationSnapshot;
  animationPolicy: 'static-shell-with-procedural-threshold-overlays';
  sourceUrl: string;
  sourceMeshCount: number;
  materialCount?: number;
  targetFootprint: number;
  targetHeight: number;
  hiddenGlbNames: readonly string[];
  acceptanceNote: string;
}

export interface KilnLandmarkSkinTemplate {
  slug: KilnLandmarkSkinSlug;
  kind: PentagonExpeditionSiteKind;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  template: THREE.Object3D;
  fit: KilnLandmarkSkinFitSnapshot;
}

export interface LandmarkSkinProvider {
  createLandmarkSkinTemplate(slug: KilnLandmarkSkinSlug): Promise<KilnLandmarkSkinTemplate | null>;
  snapshot?(): KilnAssetSnapshot;
}

export interface KilnCaveMouthSkinFitSnapshot {
  slug: KilnCaveMouthSkinSlug;
  kind: NaturalVoidKind;
  socketRole: 'cave-mouth-dressing';
  sourceBboxSize: readonly number[];
  runtimeSourceBboxSize: readonly number[];
  orientedSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  normalizePolicy: 'center-xz-bottom-y-fit-footprint-height';
  orientation: KilnInstancedOrientationSnapshot;
  animationPolicy: 'static-glb-with-procedural-route-overlays';
  sourceUrl: string;
  sourceMeshCount: number;
  materialCount?: number;
  targetFootprint: number;
  targetHeight: number;
  acceptanceNote: string;
}

export interface KilnCaveMouthSkinTemplate {
  slug: KilnCaveMouthSkinSlug;
  kind: NaturalVoidKind;
  manifest: KilnManifestAsset;
  sourceUrl: string;
  template: THREE.Object3D;
  fit: KilnCaveMouthSkinFitSnapshot;
}

export interface CaveMouthSkinProvider {
  createCaveMouthSkinTemplate(slug: KilnCaveMouthSkinSlug): Promise<KilnCaveMouthSkinTemplate | null>;
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
  'cave-anchor': {
    scale: [1, 1, 1],
    fitSourceSize: [1.2, 1.12, 1.2],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['caveAnchorStoneBase', 'caveAnchorCairnStone', 'caveAnchorPost', 'caveAnchorRopeRail'],
    socket: {
      item: 'caveAnchor',
      role: 'route-marker',
      gridWidth: 1.2,
      gridDepth: 1.2,
      height: 1.12,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative cave-route marker shell; glyph, rope-pulse, flood, spring, and active glow overlays remain procedural',
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
  workbench: {
    scale: [1, 1, 1],
    fitSourceSize: [0.74, 0.78, 1.34],
    position: [0, 0.02, 0],
    rotation: [0, Math.PI / 2, 0],
    hideProceduralNames: ['benchTop', 'toolBlock', 'metalVise', 'benchLeg'],
    socket: {
      item: 'workbench',
      role: 'crafting-station',
      gridWidth: 1.34,
      gridDepth: 0.74,
      height: 0.78,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative workbench body; crafting station rules and HUD readback remain code-authored',
  },
  campfire: {
    scale: [1, 1, 1],
    fitSourceSize: [1.08, 0.22, 1.08],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['fireRingStone', 'crossedLog'],
    socket: {
      item: 'campfire',
      role: 'warmth-station',
      gridWidth: 1.08,
      gridDepth: 1.08,
      height: 0.22,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative unlit hearth body; flame, smoke, warmth halo, and lit state remain procedural',
  },
  chest: {
    scale: [1, 1, 1],
    fitSourceSize: [0.88, 0.64, 0.72],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['chestBox', 'chestLid', 'leftBand', 'rightBand'],
    socket: {
      item: 'chest',
      role: 'storage-station',
      gridWidth: 0.88,
      gridDepth: 0.72,
      height: 0.64,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative chest body; storage inventory and latch readiness overlay remain code-authored',
  },
  bedroll: {
    scale: [1, 1, 1],
    fitSourceSize: [1.18, 0.18, 0.62],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['sleepMat', 'rolledBlanket', 'strap'],
    socket: {
      item: 'bedroll',
      role: 'home-rest',
      gridWidth: 1.18,
      gridDepth: 0.62,
      height: 0.18,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative bedroll body; home marker, comfort ring, and rest state remain procedural',
  },
  'crop-plot': {
    scale: [1, 1, 1],
    fitSourceSize: [1.32, 0.3, 0.9],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['woodFrame', 'tilledSoil'],
    socket: {
      item: 'cropPlot',
      role: 'food-plot',
      gridWidth: 1.32,
      gridDepth: 0.9,
      height: 0.3,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative crop-plot bed; crop growth plants, fertility, and harvest state remain procedural',
  },
  'drying-rack': {
    scale: [1, 1, 1],
    fitSourceSize: [0.56, 1.05, 1.2],
    position: [0, 0.04, 0],
    rotation: [0, Math.PI / 2, 0],
    hideProceduralNames: ['dryingRackLeg', 'dryingRackRail', 'dryingRackBrace'],
    socket: {
      item: 'dryingRack',
      role: 'food-preserve',
      gridWidth: 1.2,
      gridDepth: 0.56,
      height: 1.05,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative drying-rack frame; hanging food and preservation readiness remain procedural',
  },
  'weather-vane': {
    scale: [1, 1, 1],
    fitSourceSize: [0.5, 1.25, 0.5],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['weatherVaneStoneBase', 'weatherVanePost', 'weatherVaneCompassDisk', 'weatherVaneCompassTick'],
    socket: {
      item: 'weatherVane',
      role: 'weather-readback',
      gridWidth: 0.5,
      gridDepth: 0.5,
      height: 1.25,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative weather-vane body; spinning needle, ribbons, storm glow, and forecast state remain procedural',
  },
  'compost-bin': {
    scale: [1, 1, 1],
    fitSourceSize: [1.08, 0.92, 1.08],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['compostBinBase', 'compostBinPost', 'compostBinSlat', 'compostBinSideSlat', 'compostBinFrontLip'],
    socket: {
      item: 'compostBin',
      role: 'compost-station',
      gridWidth: 1.08,
      gridDepth: 1.08,
      height: 0.92,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative compost station body; compost heap, scraps, steam, and recipe state remain procedural',
  },
  'rain-cistern': {
    scale: [1, 1, 1],
    fitSourceSize: [0.95, 1.05, 0.76],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['rainCisternStoneBase', 'rainCisternBarrel', 'rainCisternRim', 'rainCisternStave', 'rainCisternGutter', 'rainCisternSpout'],
    hideGlbNames: ['Mesh_WaterInside', 'Mesh_GutterWater', 'Mesh_BucketWater', 'Mesh_WaterDrip'],
    socket: {
      item: 'rainCistern',
      role: 'water-cistern',
      gridWidth: 0.95,
      gridDepth: 0.76,
      height: 1.05,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative cistern body with baked GLB water hidden; water fill, ripple rings, weather collection, and crop irrigation remain procedural',
  },
  'root-cellar': {
    scale: [1, 1, 1],
    fitSourceSize: [1.28, 0.76, 1.12],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['rootCellarStoneLip', 'rootCellarDarkMouth', 'rootCellarLadderRung', 'rootCellarCoolStone', 'rootCellarBrace'],
    hideGlbNames: ['CellarRoom', 'EntranceStairs', 'Joint_Shelf', 'Joint_Barrel', 'Joint_Lantern'],
    socket: {
      item: 'rootCellar',
      role: 'provision-cache',
      gridWidth: 1.28,
      gridDepth: 1.12,
      height: 0.76,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative cellar mouth shell with internal-room groups hidden; hatch angle, cool glow, provision bundles, and route food accounting remain procedural',
  },
  'dock-segment': {
    scale: [1, 1, 1],
    fitSourceSize: [1.5, 0.72, 0.86],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['dockDeckPlank', 'dockLeftStringer', 'dockRightStringer', 'dockPiling', 'dockRopeRail'],
    socket: {
      item: 'dockSegment',
      role: 'shore-edge',
      gridWidth: 1.5,
      gridDepth: 0.86,
      height: 0.72,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative dock skin; waterline placement, fishing casts, edge socket, and dock marker remain code-authored',
  },
  'fish-trap': {
    scale: [1, 1, 1],
    fitSourceSize: [1.0, 0.45, 0.62],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['fishTrapSkid', 'fishTrapHoop', 'fishTrapLongSlat', 'fishTrapSideSlat', 'fishTrapFunnel'],
    socket: {
      item: 'fishTrap',
      role: 'shore-edge',
      gridWidth: 1.0,
      gridDepth: 0.62,
      height: 0.45,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative fish-trap body; bait, float, tether, soak rings, catches, and waterline rules remain procedural',
  },
  'shore-net': {
    scale: [1, 1, 1],
    fitSourceSize: [0.22, 0.96, 1.12],
    position: [0, 0.02, 0],
    rotation: [0, Math.PI / 2, 0],
    hideProceduralNames: ['shoreNetFootRail', 'shoreNetPole', 'shoreNetTopCord', 'shoreNetStrand', 'shoreNetCrossCord'],
    socket: {
      item: 'shoreNet',
      role: 'shore-edge',
      gridWidth: 1.12,
      gridDepth: 0.22,
      height: 0.96,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted with 90-degree Y correction as decorative shore-net body; floats, soak rings, catch scraps, and combing state remain procedural',
  },
  'lantern-post': {
    scale: [1, 1, 1],
    fitSourceSize: [0.45, 1.25, 0.45],
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    hideProceduralNames: ['lanternPost', 'arm', 'lanternCage'],
    hideGlbNames: ['Mesh_LanternGlow'],
    socket: {
      item: 'lantern',
      role: 'light-post',
      gridWidth: 0.45,
      gridDepth: 0.45,
      height: 1.25,
      loadBearing: 'code-socket',
      glbPolicy: 'decorative-skin-after-normalization',
    },
    acceptanceNote: 'accepted as decorative lantern-post body with baked GLB glow hidden; lit glow, shelter light accounting, and douse/toggle state remain procedural',
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
export const FISH_ACTIVE_MIXER_RADIUS = 110;
export const FISH_LOW_RATE_MIXER_RADIUS = 165;
export const FISH_FROZEN_MIXER_RADIUS = 230;
export const BIRD_ACTIVE_MIXER_RADIUS = 150;
export const BIRD_LOW_RATE_MIXER_RADIUS = 230;
export const BIRD_FROZEN_MIXER_RADIUS = 330;

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

const RUNTIME_FISH_SKINS: Record<KilnFishSkinSlug, {
  schoolKind: FishSchoolKind;
  fitLength: number;
  acceptanceNote: string;
}> = {
  'fish-shore-minnow': {
    schoolKind: 'shore',
    fitLength: 0.72,
    acceptanceNote: 'accepted as the animated singleton shore-fish body; school count, water placement, points, and catch rules remain code-authored',
  },
  'fish-storm-runner': {
    schoolKind: 'storm',
    fitLength: 0.86,
    acceptanceNote: 'accepted as the animated singleton storm-run body; surge timing, rarity, and catch payout remain code-authored',
  },
  'fish-cave-shimmer': {
    schoolKind: 'cave',
    fitLength: 0.78,
    acceptanceNote: 'accepted as the animated singleton cave-shimmer body; sea-cave hazard and fishing pressure remain code-authored',
  },
  'creature-driftjelly': {
    schoolKind: 'run',
    fitLength: 0.84,
    acceptanceNote: 'accepted as the animated singleton tide-run driftjelly body; flocking and tide-domain selection remain code-authored',
  },
  'fish-reed-fry': {
    schoolKind: 'run',
    fitLength: 0.52,
    acceptanceNote: 'accepted as the animated singleton reed-fry body; school size and bait behavior remain code-authored',
  },
};

const RUNTIME_BIRD_SKINS: Record<KilnBirdSkinSlug, {
  kind: KilnBirdKind;
  fitSpan: number;
  acceptanceNote: string;
}> = {
  'bird-sky-kite': {
    kind: 'sky',
    fitSpan: 0.86,
    acceptanceNote: 'accepted as a singleton sky-kite body; flock paths, altitude, route meaning, and spawn rules remain code-authored',
  },
  'bird-shore-gull': {
    kind: 'shore',
    fitSpan: 0.72,
    acceptanceNote: 'accepted as a singleton shore-gull body; shore flocking and waterline hints remain code-authored',
  },
  'bird-forest-flutter': {
    kind: 'forest',
    fitSpan: 0.62,
    acceptanceNote: 'accepted as a singleton forest-flutter body; perching, tree interest, and flock size remain code-authored',
  },
  'bird-storm-finch': {
    kind: 'storm',
    fitSpan: 0.58,
    acceptanceNote: 'accepted as a singleton storm-finch body; storm timing and weather signal behavior remain code-authored',
  },
};

const RUNTIME_SKYFALL_SKINS: Record<KilnSkyfallSkinSlug, {
  kind: SkyfallKind;
  targetFootprint: number;
  targetHeight: number;
  acceptanceNote: string;
}> = {
  'crater-emberfall': {
    kind: 'emberFall',
    targetFootprint: 5.25 / 2.8,
    targetHeight: 1.15 / 2.8,
    acceptanceNote: 'accepted as skyfall crater shell; omen beams, harvest glow, sparks, and reward timing remain code-authored',
  },
  'crater-glassrain': {
    kind: 'glassRain',
    targetFootprint: 5.25 / 2.8,
    targetHeight: 1.15 / 2.8,
    acceptanceNote: 'accepted as skyfall glass-rain crater shell; cyan beams, harvest glow, sparks, and reward timing remain code-authored',
  },
  'crater-starbloom': {
    kind: 'starBloom',
    targetFootprint: 5.25 / 2.8,
    targetHeight: 1.15 / 2.8,
    acceptanceNote: 'accepted as skyfall starbloom crater shell; bloom omen, glow core, sparks, and reward timing remain code-authored',
  },
};

const shrineGlowDots = Array.from({ length: 12 }, (_, i) => `Mesh_GlowDot${i}`);

const RUNTIME_LANDMARK_SKINS: Record<KilnLandmarkSkinSlug, {
  kind: PentagonExpeditionSiteKind;
  targetFootprint: number;
  targetHeight: number;
  hideGlbNames: readonly string[];
  acceptanceNote: string;
}> = {
  'shrine-first-hearth': {
    kind: 'hearthNiche',
    targetFootprint: 4.6,
    targetHeight: 3.0,
    hideGlbNames: ['Mesh_HearthEmbers', 'Mesh_LanternGlow'],
    acceptanceNote: 'accepted as First Hearth landmark shell; discovery glow, domain halo, home threshold, and warmth state remain code-authored',
  },
  'shrine-rainward-gate': {
    kind: 'rainBlind',
    targetFootprint: 4.4,
    targetHeight: 4.2,
    hideGlbNames: ['Mesh_LanternGlow'],
    acceptanceNote: 'accepted as Rainward Gate landmark shell; wind pocket threshold and readable weather glow remain code-authored',
  },
  'shrine-salt-mirror': {
    kind: 'tideDock',
    targetFootprint: 4.6,
    targetHeight: 3.3,
    hideGlbNames: ['Mesh_AltarWater'],
    acceptanceNote: 'accepted as Salt Mirror landmark shell; tide waterline, fish-route effects, and active water cues remain code-authored',
  },
  'shrine-high-lantern': {
    kind: 'lanternLookout',
    targetFootprint: 3.6,
    targetHeight: 7.4,
    hideGlbNames: ['Mesh_GlowCore', 'Mesh_SpirePeakGlow', 'Mesh_LanternGlow1', 'Mesh_LanternGlow2'],
    acceptanceNote: 'accepted as High Lantern landmark shell; signal beam, route light, and threshold shaft state remain code-authored',
  },
  'shrine-root-vault': {
    kind: 'rootShelter',
    targetFootprint: 4.4,
    targetHeight: 3.5,
    hideGlbNames: [],
    acceptanceNote: 'accepted as Root Vault landmark shell; root-room threshold, cache state, and forage bonuses remain code-authored',
  },
  'shrine-red-cairn': {
    kind: 'screeCut',
    targetFootprint: 4.2,
    targetHeight: 3.2,
    hideGlbNames: ['Mesh_GlowL', 'Mesh_GlowR'],
    acceptanceNote: 'accepted as Red Cairn landmark shell; tool-pass threshold, red-stone seam, and active glow remain code-authored',
  },
  'shrine-snow-dial': {
    kind: 'snowClock',
    targetFootprint: 4.6,
    targetHeight: 4.6,
    hideGlbNames: shrineGlowDots,
    acceptanceNote: 'accepted as Snow Dial landmark shell; cold-rest threshold and time/readiness glow remain code-authored',
  },
  'shrine-glass-shoal': {
    kind: 'glassTerrace',
    targetFootprint: 4.6,
    targetHeight: 3.0,
    hideGlbNames: ['Mesh_CoreFlame', 'Mesh_CoreGlowOrb'],
    acceptanceNote: 'accepted as Glass Shoal landmark shell; sightline threshold and route glow remain code-authored',
  },
  'shrine-storm-seat': {
    kind: 'stormBlind',
    targetFootprint: 4.2,
    targetHeight: 5.6,
    hideGlbNames: ['Mesh_RuneGlowVertical', 'Mesh_RuneGlowCross1', 'Mesh_RuneGlowCross2', 'Mesh_RoofOrb', 'Mesh_Orb'],
    acceptanceNote: 'accepted as Storm Seat landmark shell; storm-pocket threshold and weather timing signals remain code-authored',
  },
  'shrine-reed-crown': {
    kind: 'reedSpring',
    targetFootprint: 4.6,
    targetHeight: 4.2,
    hideGlbNames: ['Mesh_SpringWater', 'Mesh_AltarGlow', 'Mesh_PedestalLGlow', 'Mesh_PedestalRGlow', 'Mesh_LanternGlow'],
    acceptanceNote: 'accepted as Reed Crown landmark shell; spring-mouth water, reed route state, and fish/forage boosts remain code-authored',
  },
  'shrine-deep-bell': {
    kind: 'bellCave',
    targetFootprint: 4.4,
    targetHeight: 5.2,
    hideGlbNames: ['Mesh_StepPillarGlowL', 'Mesh_StepPillarGlowR', 'Mesh_ResonantGlow', 'Mesh_GlowCrystalL', 'Mesh_GlowCrystalR'],
    acceptanceNote: 'accepted as Deep Bell landmark shell; bell-chamber threshold, cave pressure, and resonance glow remain code-authored',
  },
  'shrine-last-horizon': {
    kind: 'horizonGate',
    targetFootprint: 4.0,
    targetHeight: 6.8,
    hideGlbNames: [
      'Mesh_BrazierGlow_0',
      'Mesh_BrazierGlow_1',
      'Mesh_BrazierGlow_2',
      'Mesh_BrazierGlow_3',
      'Mesh_HubGlow_-1',
      'Mesh_HubGlow_1',
      'Mesh_ArchKeystoneGlow_F',
      'Mesh_ArchKeystoneGlow_B',
      'Mesh_LanternGlow_0',
      'Mesh_LanternGlow_1',
      'Mesh_EternalFlame',
      'Mesh_OfferingGlow_L',
      'Mesh_OfferingGlow_R',
    ],
    acceptanceNote: 'accepted as Last Horizon landmark shell; return-gate threshold, route beam, and long-route state remain code-authored',
  },
};

const RUNTIME_CAVE_MOUTH_SKINS: Record<KilnCaveMouthSkinSlug, {
  kind: NaturalVoidKind;
  targetFootprint: number;
  targetHeight: number;
  acceptanceNote: string;
}> = {
  'cave-mouth-arch': {
    kind: 'arch',
    targetFootprint: 2.55,
    targetHeight: 1.35,
    acceptanceNote: 'accepted as land-arch cave-mouth shell; carved void, route glyph, spring/tide cues, and traversal state remain code-authored',
  },
  'cave-mouth-dry': {
    kind: 'dryCave',
    targetFootprint: 2.2,
    targetHeight: 1.0,
    acceptanceNote: 'accepted as dry-cave mouth shell; carved void, spring seep, route glyph, and cave-pressure state remain code-authored',
  },
  'cave-mouth-sea': {
    kind: 'seaCave',
    targetFootprint: 2.35,
    targetHeight: 1.05,
    acceptanceNote: 'accepted as sea-cave mouth shell; flooded opening, tide line, route glyph, and waterline state remain code-authored',
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
  const hiddenGlbNames = new Set(transform.hideGlbNames ?? []);
  body.traverse((child) => {
    child.userData.kilnAssetSlug = slug;
    if (hiddenGlbNames.has(child.name)) child.visible = false;
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

function orientationCorrectionFor(
  sourceUpAxis: KilnSourceUpAxis,
  policy: KilnInstancedOrientationPolicy,
): { matrix: THREE.Matrix4; euler: [number, number, number]; sourceForwardAxis?: KilnSourceForwardAxis } {
  const up = axisCorrectionFor(sourceUpAxis);
  if (policy === 'preserve-y-up-x-front-to-z') {
    const forward = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
    return {
      matrix: forward.multiply(up.matrix),
      euler: [0, Number((-Math.PI / 2).toFixed(6)), 0],
      sourceForwardAxis: '+x',
    };
  }
  if (policy === 'preserve-y-up-neg-x-front-to-z') {
    const forward = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    return {
      matrix: forward.multiply(up.matrix),
      euler: [0, Number((Math.PI / 2).toFixed(6)), 0],
      sourceForwardAxis: '-x',
    };
  }
  return up;
}

function axisCorrectionToForward(sourceAxis: KilnSourceUpAxis): { euler: [number, number, number] } {
  if (sourceAxis === 'x') return { euler: [0, Number((-Math.PI / 2).toFixed(6)), 0] };
  if (sourceAxis === 'y') return { euler: [Number((Math.PI / 2).toFixed(6)), 0, 0] };
  return { euler: [0, 0, 0] };
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

function longestAxis(size: THREE.Vector3): KilnSourceUpAxis {
  const axes: { axis: KilnSourceUpAxis; value: number }[] = [
    { axis: 'x', value: size.x },
    { axis: 'y', value: size.y },
    { axis: 'z', value: size.z },
  ];
  axes.sort((a, b) => b.value - a.value);
  return axes[0]?.axis ?? 'z';
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
  const correction = orientationCorrectionFor(sourceUpAxis, orientationPolicy);
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
      sourceForwardAxis: correction.sourceForwardAxis,
      axisCorrection: correction.euler,
    },
  };
}

function normalizeCreatureTemplate(source: THREE.Object3D, slug: string, targetHeight: number): {
  template: THREE.Object3D;
  runtimeSourceBboxSize: number[];
  orientedSourceBboxSize: number[];
  normalizedBboxSize: number[];
  sourceMeshCount: number;
  orientation: KilnInstancedOrientationSnapshot;
} {
  source.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(source);
  const runtimeSourceBboxSize = bboxSizeOfBox(sourceBox);
  const correction = orientationCorrectionFor('y', 'preserve-y-up-neg-x-front-to-z');
  const root = new THREE.Group();
  root.name = `kiln-creature-template-${slug}`;
  const scaled = new THREE.Group();
  scaled.name = `kiln-creature-scale-${slug}`;
  const offset = new THREE.Group();
  offset.name = `kiln-creature-pivot-${slug}`;
  const corrected = new THREE.Group();
  corrected.name = `kiln-creature-forward-${slug}`;
  corrected.rotation.set(...correction.euler);
  const body = source.clone(true);
  body.name = `kiln-creature-body-${slug}`;
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
  corrected.add(body);
  offset.add(corrected);
  scaled.add(offset);
  root.add(scaled);

  root.updateMatrixWorld(true);
  const orientedBox = new THREE.Box3().setFromObject(corrected);
  const orientedSourceBboxSize = bboxSizeOfBox(orientedBox);
  const orientedSize = new THREE.Vector3();
  orientedBox.getSize(orientedSize);
  const orientedCenter = new THREE.Vector3();
  orientedBox.getCenter(orientedCenter);
  const scale = orientedSize.y > 0 ? Math.max(0.01, targetHeight / orientedSize.y) : 1;
  offset.position.set(-orientedCenter.x, -orientedBox.min.y, -orientedCenter.z);
  scaled.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const normalizedBboxSize = fittedSize(root);
  return {
    template: root,
    runtimeSourceBboxSize,
    orientedSourceBboxSize,
    normalizedBboxSize,
    sourceMeshCount,
    orientation: {
      policy: 'preserve-y-up-neg-x-front-to-z',
      sourceUpAxis: 'y',
      sourceForwardAxis: correction.sourceForwardAxis,
      axisCorrection: correction.euler,
    },
  };
}

function normalizeFishTemplate(source: THREE.Object3D, slug: string, targetLength: number): {
  template: THREE.Object3D;
  runtimeSourceBboxSize: number[];
  orientedSourceBboxSize: number[];
  normalizedBboxSize: number[];
  sourceMeshCount: number;
  orientation: KilnInstancedOrientationSnapshot;
} {
  source.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(source);
  const runtimeSourceBboxSize = bboxSizeOfBox(sourceBox);
  const sourceSize = new THREE.Vector3();
  sourceBox.getSize(sourceSize);
  const sourceUpAxis = longestAxis(sourceSize);
  const correction = axisCorrectionToForward(sourceUpAxis);

  const root = new THREE.Group();
  root.name = `kiln-fish-template-${slug}`;
  const scaled = new THREE.Group();
  scaled.name = `kiln-fish-scale-${slug}`;
  const offset = new THREE.Group();
  offset.name = `kiln-fish-center-${slug}`;
  const corrected = new THREE.Group();
  corrected.name = `kiln-fish-forward-${slug}`;
  corrected.rotation.set(...correction.euler);
  const body = source.clone(true);
  body.name = `kiln-fish-body-${slug}`;
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
  corrected.add(body);
  offset.add(corrected);
  scaled.add(offset);
  root.add(scaled);

  root.updateMatrixWorld(true);
  const orientedBox = new THREE.Box3().setFromObject(corrected);
  const orientedSourceBboxSize = bboxSizeOfBox(orientedBox);
  const orientedSize = new THREE.Vector3();
  orientedBox.getSize(orientedSize);
  const orientedCenter = new THREE.Vector3();
  orientedBox.getCenter(orientedCenter);
  const forwardLength = Math.max(orientedSize.z, orientedSize.x, orientedSize.y);
  const scale = forwardLength > 0 ? Math.max(0.01, targetLength / forwardLength) : 1;
  offset.position.set(-orientedCenter.x, -orientedCenter.y, -orientedCenter.z);
  scaled.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const normalizedBboxSize = fittedSize(root);
  return {
    template: root,
    runtimeSourceBboxSize,
    orientedSourceBboxSize,
    normalizedBboxSize,
    sourceMeshCount,
    orientation: {
      policy: 'longest-axis-to-z',
      sourceUpAxis,
      axisCorrection: correction.euler,
    },
  };
}

function normalizeBirdTemplate(source: THREE.Object3D, slug: string, targetSpan: number): {
  template: THREE.Object3D;
  runtimeSourceBboxSize: number[];
  normalizedBboxSize: number[];
  sourceMeshCount: number;
  orientation: KilnInstancedOrientationSnapshot;
} {
  source.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(source);
  const runtimeSourceBboxSize = bboxSizeOfBox(sourceBox);
  const size = new THREE.Vector3();
  sourceBox.getSize(size);
  const center = new THREE.Vector3();
  sourceBox.getCenter(center);
  const span = Math.max(size.x, size.y, size.z);
  const scale = span > 0 ? Math.max(0.01, targetSpan / span) : 1;
  const root = new THREE.Group();
  root.name = `kiln-bird-template-${slug}`;
  const body = source.clone(true);
  body.name = `kiln-bird-body-${slug}`;
  body.position.set(-center.x, -center.y, -center.z);
  body.scale.setScalar(scale);
  let sourceMeshCount = 0;
  body.traverse((child) => {
    child.userData.kilnAssetSlug = slug;
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      sourceMeshCount += 1;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
    }
  });
  root.add(body);
  root.updateMatrixWorld(true);
  const normalizedBboxSize = fittedSize(root);
  return {
    template: root,
    runtimeSourceBboxSize,
    normalizedBboxSize,
    sourceMeshCount,
    orientation: {
      policy: 'preserve-y-up',
      sourceUpAxis: 'y',
      axisCorrection: [0, 0, 0],
    },
  };
}

function normalizeSkyfallTemplate(source: THREE.Object3D, slug: string, targetFootprint: number, targetHeight: number): {
  template: THREE.Object3D;
  runtimeSourceBboxSize: number[];
  normalizedBboxSize: number[];
  sourceMeshCount: number;
  orientation: KilnInstancedOrientationSnapshot;
} {
  source.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(source);
  const runtimeSourceBboxSize = bboxSizeOfBox(sourceBox);
  const size = new THREE.Vector3();
  sourceBox.getSize(size);
  const center = new THREE.Vector3();
  sourceBox.getCenter(center);
  const footprint = Math.max(size.x, size.z);
  const footprintScale = footprint > 0 ? targetFootprint / footprint : 1;
  const heightScale = size.y > 0 ? targetHeight / size.y : 1;
  const scale = Math.max(0.01, Math.min(footprintScale, heightScale));
  const root = new THREE.Group();
  root.name = `kiln-skyfall-template-${slug}`;
  const scaled = new THREE.Group();
  scaled.name = `kiln-skyfall-scale-${slug}`;
  scaled.scale.setScalar(scale);
  const body = source.clone(true);
  body.name = `kiln-skyfall-body-${slug}`;
  body.position.set(-center.x, -sourceBox.min.y, -center.z);
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
  scaled.add(body);
  root.add(scaled);
  root.updateMatrixWorld(true);
  const normalizedBboxSize = fittedSize(root);
  return {
    template: root,
    runtimeSourceBboxSize,
    normalizedBboxSize,
    sourceMeshCount,
    orientation: {
      policy: 'preserve-y-up',
      sourceUpAxis: 'y',
      axisCorrection: [0, 0, 0],
    },
  };
}

function normalizeLandmarkTemplate(source: THREE.Object3D, slug: string, targetFootprint: number, targetHeight: number, hideGlbNames: readonly string[]): {
  template: THREE.Object3D;
  runtimeSourceBboxSize: number[];
  orientedSourceBboxSize: number[];
  normalizedBboxSize: number[];
  sourceMeshCount: number;
  orientation: KilnInstancedOrientationSnapshot;
} {
  source.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(source);
  const runtimeSourceBboxSize = bboxSizeOfBox(sourceBox);
  const correction = orientationCorrectionFor('y', 'preserve-y-up-x-front-to-z');
  const root = new THREE.Group();
  root.name = `kiln-landmark-template-${slug}`;
  const scaled = new THREE.Group();
  scaled.name = `kiln-landmark-scale-${slug}`;
  const offset = new THREE.Group();
  offset.name = `kiln-landmark-center-${slug}`;
  const oriented = new THREE.Group();
  oriented.name = `kiln-landmark-front-${slug}`;
  oriented.rotation.set(...correction.euler);
  const body = source.clone(true);
  body.name = `kiln-landmark-body-${slug}`;
  const hiddenGlbNames = new Set(hideGlbNames);
  let sourceMeshCount = 0;
  body.traverse((child) => {
    child.userData.kilnAssetSlug = slug;
    if (hiddenGlbNames.has(child.name)) child.visible = false;
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      sourceMeshCount += 1;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  });
  oriented.add(body);
  oriented.updateMatrixWorld(true);
  const orientedBox = new THREE.Box3().setFromObject(oriented);
  const orientedSize = new THREE.Vector3();
  const orientedCenter = new THREE.Vector3();
  orientedBox.getSize(orientedSize);
  orientedBox.getCenter(orientedCenter);
  const footprint = Math.max(orientedSize.x, orientedSize.z);
  const footprintScale = footprint > 0 ? targetFootprint / footprint : 1;
  const heightScale = orientedSize.y > 0 ? targetHeight / orientedSize.y : 1;
  const scale = Math.max(0.01, Math.min(footprintScale, heightScale));
  offset.position.set(-orientedCenter.x, -orientedBox.min.y, -orientedCenter.z);
  scaled.scale.setScalar(scale);
  offset.add(oriented);
  scaled.add(offset);
  root.add(scaled);
  root.updateMatrixWorld(true);
  const normalizedBboxSize = fittedSize(root);
  return {
    template: root,
    runtimeSourceBboxSize,
    orientedSourceBboxSize: bboxSizeOfBox(orientedBox),
    normalizedBboxSize,
    sourceMeshCount,
    orientation: {
      policy: 'preserve-y-up-x-front-to-z',
      sourceUpAxis: 'y',
      sourceForwardAxis: correction.sourceForwardAxis,
      axisCorrection: correction.euler,
    },
  };
}

export class KilnRuntimeAssets implements StructureSkinProvider, ResourceDropSkinProvider, DomainResourceSkinProvider, TreeSkinProvider, CreatureSkinProvider, FishSkinProvider, BirdSkinProvider, SkyfallSkinProvider, LandmarkSkinProvider, CaveMouthSkinProvider {
  private readonly enabled = new Set<KilnStructureSkinSlug>([
    'waystone',
    'cave-anchor',
    'door-kit',
    'window-frame',
    'roof-bundle',
    'workbench',
    'campfire',
    'chest',
    'bedroll',
    'crop-plot',
    'compost-bin',
    'rain-cistern',
    'root-cellar',
    'dock-segment',
    'fish-trap',
    'shore-net',
    'drying-rack',
    'weather-vane',
    'lantern-post',
  ]);
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
  private readonly enabledFishSkins = new Set<KilnFishSkinSlug>([
    'fish-shore-minnow',
    'fish-storm-runner',
    'fish-cave-shimmer',
    'creature-driftjelly',
    'fish-reed-fry',
  ]);
  private readonly enabledBirdSkins = new Set<KilnBirdSkinSlug>([
    'bird-sky-kite',
    'bird-shore-gull',
    'bird-forest-flutter',
    'bird-storm-finch',
  ]);
  private readonly enabledSkyfallSkins = new Set<KilnSkyfallSkinSlug>([
    'crater-emberfall',
    'crater-glassrain',
    'crater-starbloom',
  ]);
  private readonly enabledLandmarkSkins = new Set<KilnLandmarkSkinSlug>([
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
  ]);
  private readonly enabledCaveMouthSkins = new Set<KilnCaveMouthSkinSlug>([
    'cave-mouth-arch',
    'cave-mouth-dry',
    'cave-mouth-sea',
  ]);
  private readonly loader = new GLTFLoader();
  private readonly loaded = new Set<KilnStructureSkinSlug>();
  private readonly loadedResourceDrops = new Set<KilnResourceDropSkinSlug>();
  private readonly loadedDomainResourceSkins = new Set<KilnDomainResourceSkinSlug>();
  private readonly loadedTreeSkins = new Set<KilnTreeSkinSlug>();
  private readonly loadedCreatureSkins = new Set<KilnCreatureSkinSlug>();
  private readonly loadedFishSkins = new Set<KilnFishSkinSlug>();
  private readonly loadedBirdSkins = new Set<KilnBirdSkinSlug>();
  private readonly loadedSkyfallSkins = new Set<KilnSkyfallSkinSlug>();
  private readonly loadedLandmarkSkins = new Set<KilnLandmarkSkinSlug>();
  private readonly loadedCaveMouthSkins = new Set<KilnCaveMouthSkinSlug>();
  private readonly failed: string[] = [];
  private readonly modelRequests: string[] = [];
  private manifestPromise: Promise<KilnManifest | null> | null = null;
  private manifestLoaded = false;
  private readonly templates = new Map<KilnStructureSkinSlug, Promise<LoadedKilnAsset | null>>();
  private readonly resourceDropTemplates = new Map<KilnResourceDropSkinSlug, Promise<KilnResourceDropSkinTemplate | null>>();
  private readonly domainResourceTemplates = new Map<KilnDomainResourceSkinSlug, Promise<KilnDomainResourceSkinTemplate | null>>();
  private readonly treeTemplates = new Map<KilnTreeSkinSlug, Promise<KilnTreeSkinTemplate | null>>();
  private readonly creatureTemplates = new Map<KilnCreatureSkinSlug, Promise<KilnCreatureSkinTemplate | null>>();
  private readonly fishTemplates = new Map<KilnFishSkinSlug, Promise<KilnFishSkinTemplate | null>>();
  private readonly birdTemplates = new Map<KilnBirdSkinSlug, Promise<KilnBirdSkinTemplate | null>>();
  private readonly skyfallTemplates = new Map<KilnSkyfallSkinSlug, Promise<KilnSkyfallSkinTemplate | null>>();
  private readonly landmarkTemplates = new Map<KilnLandmarkSkinSlug, Promise<KilnLandmarkSkinTemplate | null>>();
  private readonly caveMouthTemplates = new Map<KilnCaveMouthSkinSlug, Promise<KilnCaveMouthSkinTemplate | null>>();
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

  async createFishSkinTemplate(slug: KilnFishSkinSlug): Promise<KilnFishSkinTemplate | null> {
    return this.loadFishTemplate(slug);
  }

  async createBirdSkinTemplate(slug: KilnBirdSkinSlug): Promise<KilnBirdSkinTemplate | null> {
    return this.loadBirdTemplate(slug);
  }

  async createSkyfallSkinTemplate(slug: KilnSkyfallSkinSlug): Promise<KilnSkyfallSkinTemplate | null> {
    return this.loadSkyfallTemplate(slug);
  }

  async createLandmarkSkinTemplate(slug: KilnLandmarkSkinSlug): Promise<KilnLandmarkSkinTemplate | null> {
    return this.loadLandmarkTemplate(slug);
  }

  async createCaveMouthSkinTemplate(slug: KilnCaveMouthSkinSlug): Promise<KilnCaveMouthSkinTemplate | null> {
    return this.loadCaveMouthTemplate(slug);
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
      fishSkins: {
        enabled: [...this.enabledFishSkins],
        loaded: [...this.loadedFishSkins],
      },
      birdSkins: {
        enabled: [...this.enabledBirdSkins],
        loaded: [...this.loadedBirdSkins],
      },
      skyfallSkins: {
        enabled: [...this.enabledSkyfallSkins],
        loaded: [...this.loadedSkyfallSkins],
      },
      landmarkSkins: {
        enabled: [...this.enabledLandmarkSkins],
        loaded: [...this.loadedLandmarkSkins],
      },
      caveMouthSkins: {
        enabled: [...this.enabledCaveMouthSkins],
        loaded: [...this.loadedCaveMouthSkins],
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
          animationPolicy: 'root-anchored-sway-near-and-damage-tilt',
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
        const { template, runtimeSourceBboxSize, orientedSourceBboxSize, normalizedBboxSize, sourceMeshCount, orientation } =
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
          orientedSourceBboxSize,
          normalizedBboxSize,
          normalizePolicy: 'center-xz-bottom-y-fit-height',
          orientation,
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

  private loadFishTemplate(slug: KilnFishSkinSlug): Promise<KilnFishSkinTemplate | null> {
    if (!this.enabledFishSkins.has(slug)) return Promise.resolve(null);
    const existing = this.fishTemplates.get(slug);
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
        const fish = RUNTIME_FISH_SKINS[slug];
        const { template, runtimeSourceBboxSize, orientedSourceBboxSize, normalizedBboxSize, sourceMeshCount, orientation } =
          normalizeFishTemplate(gltf.scene as unknown as THREE.Object3D, slug, fish.fitLength);
        const clips = gltf.animations ?? [];
        if (clips.length === 0) {
          this.failed.push(`${slug}: missing animation clips`);
          return null;
        }
        const loadedClipNames = new Set(clips.map((clip) => clip.name));
        if (!loadedClipNames.has('idle') || (!loadedClipNames.has('swim') && !loadedClipNames.has('pulse'))) {
          this.failed.push(`${slug}: missing required idle plus swim/pulse clips`);
          return null;
        }
        const animationClips = (asset.animations ?? clips.map((clip) => ({ name: clip.name, durationSec: clip.duration, channels: 0 })))
          .filter((clip) => typeof clip.name === 'string')
          .map((clip) => ({
            name: String(clip.name),
            channels: Math.max(0, Math.trunc(clip.channels ?? 0)),
            durationSec: Number((Number(clip.durationSec ?? clips.find((loadedClip) => loadedClip.name === clip.name)?.duration ?? 0)).toFixed(3)),
          }));
        this.loadedFishSkins.add(slug);
        const fit: KilnFishSkinFitSnapshot = {
          slug,
          schoolKind: fish.schoolKind,
          socketRole: 'fish-school-body',
          sourceBboxSize: sourceBboxSize(asset),
          runtimeSourceBboxSize,
          orientedSourceBboxSize,
          normalizedBboxSize,
          normalizePolicy: 'center-xyz-fit-length-longest-axis-forward',
          orientation,
          animationPolicy: 'single-animated-anchors-plus-point-school-near-freeze-far',
          sourceUrl,
          sourceMeshCount,
          materialCount: asset.geometry?.materialCount,
          animationClips,
          activeMixerRadius: FISH_ACTIVE_MIXER_RADIUS,
          lowRateMixerRadius: FISH_LOW_RATE_MIXER_RADIUS,
          frozenMixerRadius: FISH_FROZEN_MIXER_RADIUS,
          acceptanceNote: fish.acceptanceNote,
        };
        return {
          slug,
          schoolKind: fish.schoolKind,
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

    this.fishTemplates.set(slug, promise);
    return promise;
  }

  private loadBirdTemplate(slug: KilnBirdSkinSlug): Promise<KilnBirdSkinTemplate | null> {
    if (!this.enabledBirdSkins.has(slug)) return Promise.resolve(null);
    const existing = this.birdTemplates.get(slug);
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
        const bird = RUNTIME_BIRD_SKINS[slug];
        const { template, runtimeSourceBboxSize, normalizedBboxSize, sourceMeshCount, orientation } =
          normalizeBirdTemplate(gltf.scene as unknown as THREE.Object3D, slug, bird.fitSpan);
        const clips = gltf.animations ?? [];
        if (clips.length === 0) {
          this.failed.push(`${slug}: missing animation clips`);
          return null;
        }
        const loadedClipNames = new Set(clips.map((clip) => clip.name));
        if (!loadedClipNames.has('idle') || (!loadedClipNames.has('flap') && !loadedClipNames.has('glide'))) {
          this.failed.push(`${slug}: missing required idle plus flap/glide clips`);
          return null;
        }
        const animationClips = (asset.animations ?? clips.map((clip) => ({ name: clip.name, durationSec: clip.duration, channels: 0 })))
          .filter((clip) => typeof clip.name === 'string')
          .map((clip) => ({
            name: String(clip.name),
            channels: Math.max(0, Math.trunc(clip.channels ?? 0)),
            durationSec: Number((Number(clip.durationSec ?? clips.find((loadedClip) => loadedClip.name === clip.name)?.duration ?? 0)).toFixed(3)),
          }));
        this.loadedBirdSkins.add(slug);
        const fit: KilnBirdSkinFitSnapshot = {
          slug,
          kind: bird.kind,
          socketRole: 'sky-life-body',
          sourceBboxSize: sourceBboxSize(asset),
          runtimeSourceBboxSize,
          normalizedBboxSize,
          normalizePolicy: 'center-xyz-fit-span-preserve-y-up',
          orientation,
          animationPolicy: 'single-animated-anchors-plus-point-flock-near-freeze-far',
          sourceUrl,
          sourceMeshCount,
          materialCount: asset.geometry?.materialCount,
          animationClips,
          activeMixerRadius: BIRD_ACTIVE_MIXER_RADIUS,
          lowRateMixerRadius: BIRD_LOW_RATE_MIXER_RADIUS,
          frozenMixerRadius: BIRD_FROZEN_MIXER_RADIUS,
          acceptanceNote: bird.acceptanceNote,
        };
        return {
          slug,
          kind: bird.kind,
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

    this.birdTemplates.set(slug, promise);
    return promise;
  }

  private loadSkyfallTemplate(slug: KilnSkyfallSkinSlug): Promise<KilnSkyfallSkinTemplate | null> {
    if (!this.enabledSkyfallSkins.has(slug)) return Promise.resolve(null);
    const existing = this.skyfallTemplates.get(slug);
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
        const skyfall = RUNTIME_SKYFALL_SKINS[slug];
        const { template, runtimeSourceBboxSize, normalizedBboxSize, sourceMeshCount, orientation } =
          normalizeSkyfallTemplate(gltf.scene as unknown as THREE.Object3D, slug, skyfall.targetFootprint, skyfall.targetHeight);
        this.loadedSkyfallSkins.add(slug);
        const fit: KilnSkyfallSkinFitSnapshot = {
          slug,
          kind: skyfall.kind,
          socketRole: 'skyfall-crater-shell',
          sourceBboxSize: sourceBboxSize(asset),
          runtimeSourceBboxSize,
          normalizedBboxSize,
          normalizePolicy: 'center-xz-bottom-y-fit-footprint-height',
          orientation,
          animationPolicy: 'static-shell-with-procedural-omen-overlays',
          sourceUrl,
          sourceMeshCount,
          materialCount: asset.geometry?.materialCount,
          targetFootprint: skyfall.targetFootprint,
          targetHeight: skyfall.targetHeight,
          acceptanceNote: skyfall.acceptanceNote,
        };
        return {
          slug,
          kind: skyfall.kind,
          manifest: asset,
          sourceUrl,
          template,
          fit,
        };
      })
      .catch((err: unknown) => {
        this.failed.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });

    this.skyfallTemplates.set(slug, promise);
    return promise;
  }

  private loadLandmarkTemplate(slug: KilnLandmarkSkinSlug): Promise<KilnLandmarkSkinTemplate | null> {
    if (!this.enabledLandmarkSkins.has(slug)) return Promise.resolve(null);
    const existing = this.landmarkTemplates.get(slug);
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
        const shrine = RUNTIME_LANDMARK_SKINS[slug];
        const { template, runtimeSourceBboxSize, orientedSourceBboxSize, normalizedBboxSize, sourceMeshCount, orientation } =
          normalizeLandmarkTemplate(gltf.scene as unknown as THREE.Object3D, slug, shrine.targetFootprint, shrine.targetHeight, shrine.hideGlbNames);
        this.loadedLandmarkSkins.add(slug);
        const fit: KilnLandmarkSkinFitSnapshot = {
          slug,
          kind: shrine.kind,
          socketRole: 'pentagon-landmark-shell',
          sourceBboxSize: sourceBboxSize(asset),
          runtimeSourceBboxSize,
          orientedSourceBboxSize,
          normalizedBboxSize,
          normalizePolicy: 'center-xz-bottom-y-fit-footprint-height',
          orientation,
          animationPolicy: 'static-shell-with-procedural-threshold-overlays',
          sourceUrl,
          sourceMeshCount,
          materialCount: asset.geometry?.materialCount,
          targetFootprint: shrine.targetFootprint,
          targetHeight: shrine.targetHeight,
          hiddenGlbNames: shrine.hideGlbNames,
          acceptanceNote: shrine.acceptanceNote,
        };
        return {
          slug,
          kind: shrine.kind,
          manifest: asset,
          sourceUrl,
          template,
          fit,
        };
      })
      .catch((err: unknown) => {
        this.failed.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });

    this.landmarkTemplates.set(slug, promise);
    return promise;
  }

  private loadCaveMouthTemplate(slug: KilnCaveMouthSkinSlug): Promise<KilnCaveMouthSkinTemplate | null> {
    if (!this.enabledCaveMouthSkins.has(slug)) return Promise.resolve(null);
    const existing = this.caveMouthTemplates.get(slug);
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
        const mouth = RUNTIME_CAVE_MOUTH_SKINS[slug];
        const { template, runtimeSourceBboxSize, orientedSourceBboxSize, normalizedBboxSize, sourceMeshCount, orientation } =
          normalizeLandmarkTemplate(gltf.scene as unknown as THREE.Object3D, slug, mouth.targetFootprint, mouth.targetHeight, []);
        this.loadedCaveMouthSkins.add(slug);
        const fit: KilnCaveMouthSkinFitSnapshot = {
          slug,
          kind: mouth.kind,
          socketRole: 'cave-mouth-dressing',
          sourceBboxSize: sourceBboxSize(asset),
          runtimeSourceBboxSize,
          orientedSourceBboxSize,
          normalizedBboxSize,
          normalizePolicy: 'center-xz-bottom-y-fit-footprint-height',
          orientation,
          animationPolicy: 'static-glb-with-procedural-route-overlays',
          sourceUrl,
          sourceMeshCount,
          materialCount: asset.geometry?.materialCount,
          targetFootprint: mouth.targetFootprint,
          targetHeight: mouth.targetHeight,
          acceptanceNote: mouth.acceptanceNote,
        };
        return {
          slug,
          kind: mouth.kind,
          manifest: asset,
          sourceUrl,
          template,
          fit,
        };
      })
      .catch((err: unknown) => {
        this.failed.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });

    this.caveMouthTemplates.set(slug, promise);
    return promise;
  }
}
