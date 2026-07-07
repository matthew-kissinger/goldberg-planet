import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  makeInstancedAssetParts,
  type KilnInstancedOrientationPolicy,
  type KilnInstancedOrientationSnapshot,
} from '../render/kilnAssets';

type KilnViewerFamily = 'structures' | 'drops' | 'nodes' | 'trees' | 'creatures' | 'fish' | 'birds' | 'wonders' | 'adopted' | 'ready' | 'generated';

interface KilnManifestAsset {
  slug: string;
  title?: string;
  category?: string;
  role?: string;
  footprint?: string;
  status: 'ready' | 'unused' | 'missing';
  file: string | null;
  modularKit?: boolean;
  wiringRisk?: string;
  geometry?: {
    bboxLocal?: { size?: number[] };
    triangles?: number;
    meshCount?: number;
    materialCount?: number;
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

interface ViewerAssetRecord {
  slug: string;
  family: KilnViewerFamily;
  title: string;
  category?: string;
  role?: string;
  status: 'loaded' | 'failed';
  sourceUrl: string;
  orientation: KilnInstancedOrientationSnapshot;
  runtimeSourceBboxSize: readonly number[];
  orientedSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  socketScale: number;
  socketFootprint: number;
  socketTargetHeight: number;
  socketRole: string;
  socketGrid: string;
  hexFlatToFlatWorldUnits: number;
  placementFrame: {
    up: '+Y local planet normal';
    forward: '+Z local tangent';
    right: '+X local tangent';
    pivot: 'center-xz-bottom-y';
  };
  meshCount: number;
  materialCount?: number;
  triangleCount?: number;
  animationClips?: readonly string[];
  warnings: string[];
  error?: string;
}

interface KilnSocketProfile {
  role: string;
  grid: string;
  footprint: number;
  height: number;
  ringColor: number;
}

const HEX_FLAT_TO_FLAT_WORLD_UNITS = 5.6;
const HEX_RADIUS_WORLD_UNITS = HEX_FLAT_TO_FLAT_WORLD_UNITS / Math.sqrt(3);

const SHRINE_SOCKET_PROFILES: Record<string, { footprint: number; height: number }> = {
  'shrine-first-hearth': { footprint: 4.6, height: 3.0 },
  'shrine-rainward-gate': { footprint: 4.4, height: 4.2 },
  'shrine-salt-mirror': { footprint: 4.6, height: 3.3 },
  'shrine-high-lantern': { footprint: 3.6, height: 7.4 },
  'shrine-root-vault': { footprint: 4.4, height: 3.5 },
  'shrine-red-cairn': { footprint: 4.2, height: 3.2 },
  'shrine-snow-dial': { footprint: 4.6, height: 4.6 },
  'shrine-glass-shoal': { footprint: 4.6, height: 3.0 },
  'shrine-storm-seat': { footprint: 4.2, height: 5.6 },
  'shrine-reed-crown': { footprint: 4.6, height: 4.2 },
  'shrine-deep-bell': { footprint: 4.4, height: 5.2 },
  'shrine-last-horizon': { footprint: 4.0, height: 6.8 },
};

const FAMILY_SLUGS: Record<KilnViewerFamily, readonly string[]> = {
  structures: [
    'waystone',
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
    'cave-anchor',
    'dock-segment',
    'fish-trap',
    'shore-net',
    'drying-rack',
    'weather-vane',
    'lantern-post',
  ],
  drops: ['drop-wood-logs', 'drop-ore-chunk'],
  nodes: [
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
  ],
  trees: ['tree-pine', 'tree-broadleaf', 'tree-dead-snag', 'tree-shrub'],
  creatures: [
    'creature-moss-puff',
    'creature-shell-skitter',
    'creature-reedback-grazer',
    'creature-cave-blinker',
    'creature-brambleback',
    'creature-cave-belljaw',
    'creature-scree-snapper',
    'creature-storm-burr',
    'creature-tide-lurker',
  ],
  fish: [
    'fish-shore-minnow',
    'fish-storm-runner',
    'fish-cave-shimmer',
    'creature-driftjelly',
    'fish-reed-fry',
  ],
  birds: [
    'bird-sky-kite',
    'bird-shore-gull',
    'bird-forest-flutter',
    'bird-storm-finch',
  ],
  wonders: [
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
    'crater-emberfall',
    'crater-glassrain',
    'crater-starbloom',
    'cave-mouth-arch',
    'cave-mouth-dry',
    'cave-mouth-sea',
  ],
  adopted: [],
  ready: [],
  generated: [],
};

FAMILY_SLUGS.adopted = [
  ...FAMILY_SLUGS.structures,
  ...FAMILY_SLUGS.drops,
  ...FAMILY_SLUGS.nodes,
  ...FAMILY_SLUGS.trees,
  ...FAMILY_SLUGS.creatures,
  ...FAMILY_SLUGS.fish,
  ...FAMILY_SLUGS.birds,
  ...FAMILY_SLUGS.wonders,
];

function publicAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${relativePath.replace(/^\/+/, '')}`;
}

function selectedFamily(params: URLSearchParams): KilnViewerFamily {
  const raw = params.get('family') ?? 'ready';
  return raw === 'structures' || raw === 'drops' || raw === 'nodes' || raw === 'trees' || raw === 'creatures' || raw === 'fish' || raw === 'birds' || raw === 'wonders' || raw === 'adopted' || raw === 'ready' || raw === 'generated'
    ? raw
    : 'ready';
}

function familyForSlug(slug: string): KilnViewerFamily {
  for (const family of ['structures', 'drops', 'nodes', 'trees', 'creatures', 'fish', 'birds', 'wonders'] as KilnViewerFamily[]) {
    if (FAMILY_SLUGS[family].includes(slug)) return family;
  }
  return 'ready';
}

function orientationPolicyFor(slug: string, asset?: KilnManifestAsset): KilnInstancedOrientationPolicy {
  if (slug === 'tree-pine' || slug === 'tree-broadleaf' || slug === 'tree-dead-snag') return 'longest-axis-to-y';
  if (slug === 'lantern-post' || slug === 'weather-vane') return 'longest-axis-to-y';
  if (slug.startsWith('shrine-') || slug.startsWith('cave-mouth-')) return 'preserve-y-up-x-front-to-z';
  if (slug.startsWith('creature-') && slug !== 'creature-driftjelly') return 'preserve-y-up-neg-x-front-to-z';
  void asset;
  return 'preserve-y-up';
}

function socketProfileFor(slug: string, family: KilnViewerFamily, asset?: KilnManifestAsset): KilnSocketProfile {
  if (slug.startsWith('tree-')) {
    return slug === 'tree-shrub'
      ? { role: 'low vegetation on one hex', grid: 'single-hex scatter', footprint: 1.55, height: 1.05, ringColor: 0x7ccf7a }
      : { role: 'upright tree on one hex', grid: 'single-hex scatter', footprint: 3.1, height: 4.4, ringColor: 0x7ccf7a };
  }
  if (slug.startsWith('fish-') || slug === 'creature-driftjelly') {
    return { role: 'instanced aquatic body', grid: 'waterline/underwater school anchor socket', footprint: 1.65, height: 1.0, ringColor: 0x87d9e8 };
  }
  if (slug.startsWith('bird-')) {
    return { role: 'instanced sky-life body', grid: 'sky-life/flock anchor socket', footprint: 1.8, height: 1.15, ringColor: 0xb6d7ff };
  }
  if (slug.startsWith('creature-') || family === 'creatures') {
    return { role: 'tile-anchored native creature', grid: 'single-hex occupied tile', footprint: 1.75, height: 1.25, ringColor: 0xe4a85c };
  }
  if (family === 'generated') {
    return { role: 'generated quarantine review', grid: 'review socket before cataloging', footprint: 1.65, height: 1.0, ringColor: 0xcfc7ff };
  }
  if (slug.startsWith('drop-') || family === 'drops') {
    return { role: 'ground pickup', grid: 'single-hex loose item', footprint: 1.05, height: 0.55, ringColor: 0xf1d27a };
  }
  if (slug.startsWith('node-') || family === 'nodes') {
    return { role: 'harvest/resource node', grid: 'single-hex interactable node', footprint: 1.5, height: 1.35, ringColor: 0x94d6ff };
  }
  if (slug.startsWith('shrine-')) {
    const socket = SHRINE_SOCKET_PROFILES[slug] ?? { footprint: 4.6, height: 4.2 };
    return { role: 'wonder landmark', grid: 'single-hex landmark socket', footprint: socket.footprint, height: socket.height, ringColor: 0xd7c3ff };
  }
  if (slug.startsWith('crater-')) {
    return { role: 'skyfall crater shell', grid: 'single-hex terrain dressing', footprint: 5.25, height: 1.15, ringColor: 0xffbd75 };
  }
  if (slug.startsWith('cave-mouth-')) {
    const height = slug === 'cave-mouth-arch' ? 1.35 : slug === 'cave-mouth-sea' ? 1.05 : 1.0;
    const footprint = slug === 'cave-mouth-arch' ? 2.55 : slug === 'cave-mouth-sea' ? 2.35 : 2.2;
    return { role: 'cave-mouth dressing skin', grid: 'carved cave signal socket', footprint, height, ringColor: 0x88d7d0 };
  }
  if (slug === 'shore-net') return { role: 'shoreline utility', grid: 'edge-aligned shore socket', footprint: 3.6, height: 2.4, ringColor: 0x87d9e8 };
  if (slug === 'dock-segment') return { role: 'waterline build socket', grid: 'edge-aligned shore socket', footprint: 4.7, height: 1.8, ringColor: 0x87d9e8 };
  if (slug === 'fish-trap') return { role: 'waterline trap', grid: 'edge-aligned shore socket', footprint: 2.2, height: 1.4, ringColor: 0x87d9e8 };
  if (slug === 'compost-bin') return { role: 'compost-station decorative skin', grid: 'code-authored center prop socket', footprint: 2.35, height: 1.75, ringColor: 0x9bd77b };
  if (slug === 'rain-cistern') return { role: 'water-cistern decorative skin', grid: 'code-authored center prop socket', footprint: 2.05, height: 2.25, ringColor: 0x87d9e8 };
  if (slug === 'root-cellar') return { role: 'provision-cache decorative shell', grid: 'code-authored center prop socket', footprint: 3.2, height: 1.55, ringColor: 0xc9d7a1 };
  if (slug === 'lantern-post') return { role: 'light-post decorative skin', grid: 'code-authored center prop socket', footprint: 1.25, height: 2.45, ringColor: 0xffd889 };
  if (slug === 'workbench') return { role: 'crafting-station decorative skin', grid: 'code-authored center prop socket', footprint: 2.7, height: 1.6, ringColor: 0xc9d7a1 };
  if (slug === 'campfire') return { role: 'warmth-station decorative skin', grid: 'code-authored center prop socket', footprint: 2.25, height: 0.8, ringColor: 0xffb578 };
  if (slug === 'chest') return { role: 'storage-station decorative skin', grid: 'code-authored center prop socket', footprint: 2.1, height: 1.4, ringColor: 0xc9d7a1 };
  if (slug === 'bedroll') return { role: 'home-rest decorative skin', grid: 'code-authored center prop socket', footprint: 2.45, height: 0.65, ringColor: 0xc9d7a1 };
  if (slug === 'crop-plot') return { role: 'food-plot decorative skin', grid: 'code-authored center prop socket', footprint: 2.75, height: 0.9, ringColor: 0x9bd77b };
  if (slug === 'drying-rack') return { role: 'food-preserve decorative skin', grid: 'code-authored center prop socket', footprint: 2.55, height: 2.2, ringColor: 0xc9d7a1 };
  if (slug === 'weather-vane') return { role: 'weather-readback decorative skin', grid: 'code-authored center prop socket', footprint: 1.4, height: 2.4, ringColor: 0xaad7ff };
  if (slug === 'door-kit') return { role: 'wall opening decorative skin', grid: 'code-authored wall socket', footprint: 2.25, height: 3.25, ringColor: 0xf2c27b };
  if (slug === 'window-frame') return { role: 'wall light decorative skin', grid: 'code-authored wall socket', footprint: 2.1, height: 2.45, ringColor: 0xf2c27b };
  if (slug === 'roof-bundle') return { role: 'roof cap decorative skin', grid: 'code-authored roof socket', footprint: 4.6, height: 1.85, ringColor: 0xf2c27b };
  if (slug === 'waystone' || slug === 'cave-anchor') return { role: 'route marker', grid: 'single-hex landmark socket', footprint: 2.0, height: 2.4, ringColor: 0xaad7ff };
  if (asset?.modularKit) return { role: asset.role ?? 'modular kit decoration', grid: 'code-authored snap socket', footprint: 4.2, height: 2.5, ringColor: 0xf2c27b };
  if (asset?.footprint === 'small') return { role: asset.role ?? 'small prop', grid: 'single-hex prop socket', footprint: 1.75, height: 1.1, ringColor: 0xc9d7a1 };
  if (asset?.footprint === 'landmark') return { role: asset.role ?? 'landmark', grid: 'single-hex landmark socket', footprint: 4.7, height: 3.4, ringColor: 0xd7c3ff };
  return { role: asset?.role ?? 'single-hex prop', grid: 'single-hex prop socket', footprint: 3.15, height: 2.1, ringColor: 0xc9d7a1 };
}

function readyManifestSlugs(manifest: KilnManifest): string[] {
  return (manifest.assets ?? [])
    .filter((asset) => asset.status === 'ready' && !!asset.file)
    .map((asset) => asset.slug);
}

function generatedSlugsFromParams(params: URLSearchParams): string[] {
  const raw = params.get('slugs');
  if (!raw) return [...FAMILY_SLUGS.generated];
  return raw.split(',')
    .map((slug) => slug.trim())
    .filter((slug) => /^[a-zA-Z0-9_-]+$/.test(slug));
}

function slugsForSelection(family: KilnViewerFamily, manifest: KilnManifest, requestedSlug: string | null, params: URLSearchParams): string[] {
  if (requestedSlug) return [requestedSlug];
  if (family === 'generated') return generatedSlugsFromParams(params);
  if (family === 'ready') return readyManifestSlugs(manifest);
  return [...FAMILY_SLUGS[family]];
}

async function generatedReviewAsset(slug: string): Promise<KilnManifestAsset> {
  let meta: any = null;
  try {
    const res = await fetch(publicAssetUrl(`assets/kiln/generated/${slug}/asset.json`));
    if (res.ok) meta = await res.json();
  } catch {
    meta = null;
  }
  const requested = meta?.requestedItem ?? {};
  const animationNames = Array.isArray(requested.animationClips)
    ? requested.animationClips.filter((name: unknown) => typeof name === 'string')
    : [];
  return {
    slug,
    title: requested.name ?? meta?.name ?? slug,
    category: meta?.category ?? requested.category,
    role: meta?.role ?? requested.role ?? 'generated-review',
    status: 'ready',
    file: `generated/${slug}/model.glb`,
    wiringRisk: 'generated quarantine: review before catalog, promotion, and runtime wiring',
    geometry: {
      triangles: typeof meta?.quality?.tris === 'number' ? meta.quality.tris : undefined,
      materialCount: typeof meta?.quality?.optimizedPalette?.materialsAfter === 'number'
        ? meta.quality.optimizedPalette.materialsAfter
        : undefined,
    },
    animations: animationNames.map((name: string) => ({ name })),
  };
}

function bboxSizeOfObject(object: THREE.Object3D): number[] {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return [0, 0, 0];
  const size = new THREE.Vector3();
  box.getSize(size);
  return [size.x, size.y, size.z].map((value) => Number(value.toFixed(3)));
}

function scaleForSocket(size: readonly number[], target: { footprint: number; height: number }): number {
  const xz = Math.max(0.001, size[0] ?? 0, size[2] ?? 0);
  const y = Math.max(0.001, size[1] ?? 0);
  return Number(Math.min(target.footprint / xz, target.height / y).toFixed(4));
}

function makeLabel(text: string, width = 512): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '24px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
  ctx.fillRect(10, 18, canvas.width - 20, 58);
  ctx.strokeStyle = 'rgba(185, 204, 220, 0.34)';
  ctx.strokeRect(10.5, 18.5, canvas.width - 21, 57);
  ctx.fillStyle = '#dfe8ef';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 36);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(3.2, 0.6, 1);
  return sprite;
}

function makeFlatHexMesh(radius: number, color: number, opacity: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.045, 6, 1),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, transparent: opacity < 1, opacity }),
  );
  mesh.rotation.y = Math.PI / 6;
  mesh.position.y = -0.025;
  return mesh;
}

function addHexEdges(group: THREE.Group, mesh: THREE.Mesh, color: number, opacity: number): void {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  edges.rotation.copy(mesh.rotation);
  edges.position.copy(mesh.position);
  group.add(edges);
}

function makeSocketFootprintRing(profile: KilnSocketProfile): THREE.Group {
  const group = new THREE.Group();
  const radius = Math.max(0.08, profile.footprint * 0.5);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.94, radius, 72),
    new THREE.MeshBasicMaterial({ color: profile.ringColor, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  group.add(ring);

  const targetHeight = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(-radius, 0.03, radius),
    Math.max(0.2, profile.height),
    profile.ringColor,
    0.16,
    0.08,
  );
  targetHeight.name = 'socket-target-height';
  group.add(targetHeight);
  return group;
}

function makeHexSocket(profile: KilnSocketProfile, showNeighbors = true): THREE.Group {
  const group = new THREE.Group();
  const base = makeFlatHexMesh(HEX_RADIUS_WORLD_UNITS, 0x425946, 0.42);
  group.add(base);
  addHexEdges(group, base, 0xa9c6b3, 0.7);

  const neighborOffsets = [
    [HEX_RADIUS_WORLD_UNITS * 1.5, HEX_FLAT_TO_FLAT_WORLD_UNITS * 0.5],
    [0, HEX_FLAT_TO_FLAT_WORLD_UNITS],
    [-HEX_RADIUS_WORLD_UNITS * 1.5, HEX_FLAT_TO_FLAT_WORLD_UNITS * 0.5],
    [-HEX_RADIUS_WORLD_UNITS * 1.5, -HEX_FLAT_TO_FLAT_WORLD_UNITS * 0.5],
    [0, -HEX_FLAT_TO_FLAT_WORLD_UNITS],
    [HEX_RADIUS_WORLD_UNITS * 1.5, -HEX_FLAT_TO_FLAT_WORLD_UNITS * 0.5],
  ];
  if (showNeighbors) {
    for (const [x, z] of neighborOffsets) {
      const neighbor = makeFlatHexMesh(HEX_RADIUS_WORLD_UNITS, 0x26323c, 0.14);
      neighbor.position.x = x;
      neighbor.position.z = z;
      group.add(neighbor);
      addHexEdges(group, neighbor, 0x6d8290, 0.32);
    }
  }

  group.add(makeSocketFootprintRing(profile));

  const up = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(HEX_RADIUS_WORLD_UNITS * 0.78, 0.03, -HEX_RADIUS_WORLD_UNITS * 0.7), 1.15, 0x79d28c, 0.16, 0.08);
  up.name = 'planet-normal-plus-y';
  group.add(up);
  const forward = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.04, 0), HEX_RADIUS_WORLD_UNITS * 0.68, 0x7fb8ff, 0.14, 0.07);
  forward.name = 'tile-forward-plus-z';
  group.add(forward);
  const right = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.05, 0), HEX_RADIUS_WORLD_UNITS * 0.68, 0xffc979, 0.14, 0.07);
  right.name = 'tile-right-plus-x';
  group.add(right);
  return group;
}

function makeNormalizedStaticObject(
  source: THREE.Object3D,
  slug: string,
  profile: KilnSocketProfile,
  asset?: KilnManifestAsset,
): { object: THREE.Object3D; record: Pick<ViewerAssetRecord, 'orientation' | 'runtimeSourceBboxSize' | 'orientedSourceBboxSize' | 'normalizedBboxSize' | 'socketScale' | 'socketFootprint' | 'socketTargetHeight' | 'meshCount'> } {
  const normalized = makeInstancedAssetParts(source, slug, orientationPolicyFor(slug, asset));
  const root = new THREE.Group();
  root.name = `viewer-normalized-${slug}`;
  for (const part of normalized.parts) {
    const mesh = new THREE.Mesh(part.geometry, Array.isArray(part.material) ? part.material.map((mat) => mat.clone()) : part.material.clone());
    mesh.name = `${part.name}-viewer`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const scale = scaleForSocket(normalized.normalizedBboxSize, profile);
  root.scale.setScalar(scale);
  return {
    object: root,
    record: {
      orientation: normalized.orientation,
      runtimeSourceBboxSize: normalized.runtimeSourceBboxSize,
      orientedSourceBboxSize: normalized.orientedSourceBboxSize,
      normalizedBboxSize: normalized.normalizedBboxSize,
      socketScale: scale,
      socketFootprint: profile.footprint,
      socketTargetHeight: profile.height,
      meshCount: normalized.sourceMeshCount,
    },
  };
}

function makeNormalizedAnimatedObject(
  source: THREE.Object3D,
  slug: string,
  profile: KilnSocketProfile,
): { object: THREE.Object3D; record: Pick<ViewerAssetRecord, 'orientation' | 'runtimeSourceBboxSize' | 'orientedSourceBboxSize' | 'normalizedBboxSize' | 'socketScale' | 'socketFootprint' | 'socketTargetHeight' | 'meshCount'> } {
  source.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(source);
  const sourceSize = new THREE.Vector3();
  sourceBox.getSize(sourceSize);
  const policy = orientationPolicyFor(slug);
  const axisCorrection: [number, number, number] = policy === 'preserve-y-up-neg-x-front-to-z'
    ? [0, Number((Math.PI / 2).toFixed(6)), 0]
    : [0, 0, 0];
  const orientation = policy === 'preserve-y-up-neg-x-front-to-z'
    ? { policy, sourceUpAxis: 'y' as const, sourceForwardAxis: '-x' as const, axisCorrection }
    : { policy: 'preserve-y-up' as const, sourceUpAxis: 'y' as const, axisCorrection };
  const body = source.clone(true);
  body.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  });
  const root = new THREE.Group();
  root.name = `viewer-normalized-${slug}`;
  const offset = new THREE.Group();
  offset.name = `viewer-pivot-${slug}`;
  const corrected = new THREE.Group();
  corrected.name = `viewer-forward-${slug}`;
  corrected.rotation.set(...axisCorrection);
  corrected.add(body);
  offset.add(corrected);
  root.add(offset);

  root.updateMatrixWorld(true);
  const orientedBox = new THREE.Box3().setFromObject(corrected);
  const orientedCenter = new THREE.Vector3();
  orientedBox.getCenter(orientedCenter);
  offset.position.set(-orientedCenter.x, -orientedBox.min.y, -orientedCenter.z);
  root.updateMatrixWorld(true);
  const orientedSize = bboxSizeOfObject(corrected);
  const normalizedSize = bboxSizeOfObject(root);
  const scale = scaleForSocket(normalizedSize, profile);
  root.scale.setScalar(scale);
  let meshCount = 0;
  source.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshCount += 1;
  });
  const size = [sourceSize.x, sourceSize.y, sourceSize.z].map((value) => Number(value.toFixed(3)));
  return {
    object: root,
    record: {
      orientation,
      runtimeSourceBboxSize: size,
      orientedSourceBboxSize: orientedSize,
      normalizedBboxSize: normalizedSize,
      socketScale: scale,
      socketFootprint: profile.footprint,
      socketTargetHeight: profile.height,
      meshCount,
    },
  };
}

function defaultColumnsFor(family: KilnViewerFamily, count: number): number {
  if (count <= 2) return count;
  if (family === 'structures') return Math.min(6, count);
  if (family === 'trees') return count;
  if (family === 'wonders') return Math.min(3, count);
  if (family === 'ready') return Math.min(8, count);
  if (family === 'adopted') return Math.min(6, count);
  return Math.min(4, count);
}

function selectedColumns(params: URLSearchParams, family: KilnViewerFamily, count: number): number {
  const requested = Number(params.get('columns'));
  if (Number.isFinite(requested) && requested >= 1) return Math.min(count, Math.max(1, Math.floor(requested)));
  return defaultColumnsFor(family, count);
}

function selectedSpacing(params: URLSearchParams): number {
  const requested = Number(params.get('spacing'));
  return Number.isFinite(requested) && requested >= 2 ? Math.min(12, requested) : 7.2;
}

function gridPosition(index: number, columns: number, spacing: number): THREE.Vector3 {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = (col - (columns - 1) / 2) * spacing + (row % 2) * spacing * 0.5;
  const z = row * spacing * 0.86;
  return new THREE.Vector3(x, 0, z);
}

function placementWarnings(asset: KilnManifestAsset | undefined, record: Pick<ViewerAssetRecord, 'orientation' | 'normalizedBboxSize' | 'socketScale' | 'meshCount'>, profile: KilnSocketProfile): string[] {
  const warnings: string[] = [];
  if (!asset) warnings.push('manifest record missing');
  if (asset?.modularKit) warnings.push('modular kit: use code-authored socket/collider as the dimensional contract');
  if (asset?.wiringRisk) warnings.push(asset.wiringRisk);
  if ((asset?.geometry?.meshCount ?? 0) >= 80) warnings.push('high mesh count: prefer merged or instanced runtime path');
  if ((asset?.geometry?.materialCount ?? 0) >= 4) warnings.push('material count needs palette/material consolidation review');
  if ((asset?.geometry?.triangles ?? 0) >= 6000) warnings.push('triangle budget needs LOD or simplification review');
  if (record.orientation.sourceUpAxis !== 'y') warnings.push(`axis corrected from local ${record.orientation.sourceUpAxis.toUpperCase()} into +Y planet normal`);
  const xz = Math.max(record.normalizedBboxSize[0] ?? 0, record.normalizedBboxSize[2] ?? 0);
  const y = record.normalizedBboxSize[1] ?? 0;
  if (profile.role.includes('upright') && y < xz * 0.8) warnings.push('upright socket still reads squat after normalization');
  if (profile.role.includes('crater') && y > xz * 0.45) warnings.push('crater shell reads tall; verify it sits as terrain dressing');
  if (record.socketScale <= 0) warnings.push('invalid socket scale');
  return warnings;
}

function installViewerStyle(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.hud, #splash')) el.style.display = 'none';
  const style = document.createElement('style');
  style.textContent = `
    body.asset-viewer { background: #0d1218; }
    #asset-viewer-panel {
      position: fixed; left: 12px; top: 10px; z-index: 20;
      font: 12px/1.45 Consolas, ui-monospace, monospace; color: #dbe5ed;
      background: rgba(9, 13, 18, 0.68); border: 1px solid rgba(195, 215, 230, 0.22);
      border-radius: 8px; padding: 8px 10px; pointer-events: none; white-space: pre;
      text-shadow: 0 1px 1px rgba(0,0,0,0.75);
    }
  `;
  document.head.appendChild(style);
  document.body.classList.add('asset-viewer');
}

function frameCamera(camera: THREE.PerspectiveCamera, root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const span = Math.max(4, size.x, size.z, size.y * 1.2);
  camera.position.set(center.x + span * 0.42, Math.max(3.1, size.y + 3.2), center.z + span * 0.92);
  camera.lookAt(center.x, Math.max(0.55, center.y + size.y * 0.2), center.z);
  camera.near = 0.05;
  camera.far = Math.max(80, span * 8);
  camera.updateProjectionMatrix();
}

export async function bootKilnAssetViewer(): Promise<void> {
  installViewerStyle();
  const params = new URLSearchParams(window.location.search);
  const family = selectedFamily(params);
  const requestedSlug = params.get('slug');
  const app = document.getElementById('app') ?? document.body;
  app.innerHTML = '';

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.get('gpu') !== 'webgpu' });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111923);
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.05, 120);
  scene.add(new THREE.AmbientLight(0x9fb4c8, 1.45));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(4, 8, 5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8eb7ff, 0.7);
  fill.position.set(-3, 2, -4);
  scene.add(fill);

  const panel = document.createElement('div');
  panel.id = 'asset-viewer-panel';
  panel.textContent = `Kiln alignment viewer\nfamily ${family}\nloading manifest`;
  document.body.appendChild(panel);

  const manifest = await fetch(publicAssetUrl('assets/kiln/ASSET_MANIFEST.json')).then((res) => res.json() as Promise<KilnManifest>);
  const bySlug = new Map((manifest.assets ?? []).map((asset) => [asset.slug, asset]));
  const slugs = slugsForSelection(family, manifest, requestedSlug, params);
  panel.textContent = `Kiln alignment viewer\nfamily ${family}\nloading ${slugs.length} asset${slugs.length === 1 ? '' : 's'}`;
  const loader = new GLTFLoader();
  const content = new THREE.Group();
  content.name = `kiln-asset-viewer-${family}`;
  scene.add(content);

  const columns = selectedColumns(params, family, slugs.length);
  const spacing = selectedSpacing(params);
  const records: ViewerAssetRecord[] = [];
  const mixers: THREE.AnimationMixer[] = [];
  for (let i = 0; i < slugs.length; i += 1) {
    const slug = slugs[i];
    const asset = bySlug.get(slug) ?? (family === 'generated' ? await generatedReviewAsset(slug) : undefined);
    const assetFamily = family === 'generated' ? 'generated' : familyForSlug(slug);
    const profile = socketProfileFor(slug, assetFamily, asset);
    const cell = new THREE.Group();
    cell.name = `viewer-cell-${slug}`;
    cell.position.copy(gridPosition(i, columns, spacing));
    cell.add(makeHexSocket(profile, !requestedSlug || params.get('neighbors') === '1'));
    const label = makeLabel(slug);
    label.position.set(0, 0.08, HEX_RADIUS_WORLD_UNITS + 0.82);
    cell.add(label);
    content.add(cell);

    if (!asset || asset.status !== 'ready' || !asset.file) {
      records.push({
        slug,
        family: requestedSlug ? assetFamily : family,
        title: asset?.title ?? slug,
        category: asset?.category,
        role: asset?.role,
        status: 'failed',
        sourceUrl: '',
        orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
        runtimeSourceBboxSize: [],
        orientedSourceBboxSize: [],
        normalizedBboxSize: [],
        socketScale: 0,
        socketFootprint: profile.footprint,
        socketTargetHeight: profile.height,
        socketRole: profile.role,
        socketGrid: profile.grid,
        hexFlatToFlatWorldUnits: HEX_FLAT_TO_FLAT_WORLD_UNITS,
        placementFrame: {
          up: '+Y local planet normal',
          forward: '+Z local tangent',
          right: '+X local tangent',
          pivot: 'center-xz-bottom-y',
        },
        meshCount: 0,
        materialCount: asset?.geometry?.materialCount,
        triangleCount: asset?.geometry?.triangles,
        animationClips: asset?.animations?.map((clip) => clip.name ?? '').filter(Boolean),
        warnings: placementWarnings(asset, {
          orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
          normalizedBboxSize: [],
          socketScale: 0,
          meshCount: 0,
        }, profile),
        error: 'missing ready manifest asset',
      });
      continue;
    }

    const sourceUrl = publicAssetUrl(`assets/kiln/${asset.file}`);
    try {
      const gltf = await loader.loadAsync(sourceUrl);
      const animatedBody = assetFamily === 'creatures' || assetFamily === 'birds';
      const built = animatedBody
        ? makeNormalizedAnimatedObject(gltf.scene as unknown as THREE.Object3D, slug, profile)
        : makeNormalizedStaticObject(gltf.scene as unknown as THREE.Object3D, slug, profile, asset);
      built.object.position.y = 0;
      cell.add(built.object);
      content.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(built.object);
      const helper = new THREE.Box3Helper(box, 0xd4eef8);
      helper.name = `viewer-bounds-${slug}`;
      content.add(helper);
      if (animatedBody && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(built.object);
        const clip = gltf.animations.find((entry) => entry.name === 'idle')
          ?? gltf.animations.find((entry) => entry.name === 'glide')
          ?? gltf.animations.find((entry) => entry.name === 'flap')
          ?? gltf.animations[0];
        mixer.clipAction(clip).play();
        mixers.push(mixer);
      }
      records.push({
        slug,
        family: assetFamily,
        title: asset.title ?? slug,
        category: asset.category,
        role: asset.role,
        status: 'loaded',
        sourceUrl,
        ...built.record,
        socketRole: profile.role,
        socketGrid: profile.grid,
        hexFlatToFlatWorldUnits: HEX_FLAT_TO_FLAT_WORLD_UNITS,
        placementFrame: {
          up: '+Y local planet normal',
          forward: '+Z local tangent',
          right: '+X local tangent',
          pivot: 'center-xz-bottom-y',
        },
        materialCount: asset.geometry?.materialCount,
        triangleCount: asset.geometry?.triangles,
        animationClips: gltf.animations.map((clip) => clip.name),
        warnings: placementWarnings(asset, built.record, profile),
      });
    } catch (err) {
      records.push({
        slug,
        family: requestedSlug ? assetFamily : family,
        title: asset.title ?? slug,
        category: asset.category,
        role: asset.role,
        status: 'failed',
        sourceUrl,
        orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
        runtimeSourceBboxSize: [],
        orientedSourceBboxSize: [],
        normalizedBboxSize: [],
        socketScale: 0,
        socketFootprint: profile.footprint,
        socketTargetHeight: profile.height,
        socketRole: profile.role,
        socketGrid: profile.grid,
        hexFlatToFlatWorldUnits: HEX_FLAT_TO_FLAT_WORLD_UNITS,
        placementFrame: {
          up: '+Y local planet normal',
          forward: '+Z local tangent',
          right: '+X local tangent',
          pivot: 'center-xz-bottom-y',
        },
        meshCount: 0,
        materialCount: asset.geometry?.materialCount,
        triangleCount: asset.geometry?.triangles,
        animationClips: asset.animations?.map((clip) => clip.name ?? '').filter(Boolean),
        warnings: placementWarnings(asset, {
          orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
          normalizedBboxSize: [],
          socketScale: 0,
          meshCount: 0,
        }, profile),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  frameCamera(camera, content);
  const controls = new OrbitControls(camera, renderer.domElement);
  const contentBox = new THREE.Box3().setFromObject(content);
  const target = new THREE.Vector3();
  contentBox.getCenter(target);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();
  const state = {
    ready: true,
    family,
    requestedSlug,
    slugs,
    columns,
    spacing,
    manifestReadyCount: readyManifestSlugs(manifest).length,
    records,
    coordinateSystem: {
      up: '+Y local planet normal',
      forward: '+Z local tangent',
      right: '+X local tangent',
      pivot: 'center-xz-bottom-y',
      hexFlatToFlatWorldUnits: HEX_FLAT_TO_FLAT_WORLD_UNITS,
      note: 'Raw GLB units are normalized into a code-authored socket; the socket, not the GLB, owns placement scale.',
    },
    screenshotPlan: records.map((record) => ({
      slug: record.slug,
      url: `/?assetViewer=kiln&slug=${encodeURIComponent(record.slug)}&gpu=gl`,
      file: `output/playwright/kiln-asset-viewer/assets/${record.slug}.png`,
      status: record.status,
      warnings: record.warnings,
    })),
  };
  (window as any).__assetViewer = state;
  (window as any).render_game_to_text = () => JSON.stringify(state);
  panel.textContent = `Kiln alignment viewer\nfamily ${family}${requestedSlug ? ` · ${requestedSlug}` : ''}\nloaded ${records.filter((record) => record.status === 'loaded').length}/${records.length}\ncolumns ${columns} spacing ${spacing.toFixed(2)}\nhex flat-to-flat ${HEX_FLAT_TO_FLAT_WORLD_UNITS.toFixed(1)}wu\n+Y is planet-normal sky; +Z is tile-forward tangent`;

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    frameCamera(camera, content);
  });

  let last = performance.now();
  (window as any).advanceTime = (ms = 16) => {
    const dt = Math.max(0, Math.min(0.05, Number(ms) / 1000));
    for (const mixer of mixers) mixer.update(dt);
    controls.update();
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    for (const mixer of mixers) mixer.update(dt);
    controls.update();
    renderer.render(scene, camera);
  });
}
