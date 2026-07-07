import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  makeInstancedAssetParts,
  type KilnInstancedOrientationPolicy,
  type KilnInstancedOrientationSnapshot,
} from '../render/kilnAssets';

type KilnViewerFamily = 'structures' | 'drops' | 'nodes' | 'trees' | 'creatures' | 'adopted';

interface KilnManifestAsset {
  slug: string;
  title?: string;
  category?: string;
  status: 'ready' | 'unused' | 'missing';
  file: string | null;
  geometry?: {
    bboxLocal?: { size?: number[] };
    triangles?: number;
    meshCount?: number;
    materialCount?: number;
  };
}

interface KilnManifest {
  assets?: KilnManifestAsset[];
}

interface ViewerAssetRecord {
  slug: string;
  family: KilnViewerFamily;
  title: string;
  status: 'loaded' | 'failed';
  sourceUrl: string;
  orientation: KilnInstancedOrientationSnapshot;
  runtimeSourceBboxSize: readonly number[];
  orientedSourceBboxSize: readonly number[];
  normalizedBboxSize: readonly number[];
  socketScale: number;
  socketFootprint: number;
  socketTargetHeight: number;
  meshCount: number;
  error?: string;
}

const FAMILY_SLUGS: Record<KilnViewerFamily, readonly string[]> = {
  structures: ['waystone', 'door-kit', 'window-frame', 'roof-bundle'],
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
  adopted: [],
};

FAMILY_SLUGS.adopted = [
  ...FAMILY_SLUGS.structures,
  ...FAMILY_SLUGS.drops,
  ...FAMILY_SLUGS.nodes,
  ...FAMILY_SLUGS.trees,
  ...FAMILY_SLUGS.creatures,
];

function publicAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${relativePath.replace(/^\/+/, '')}`;
}

function selectedFamily(params: URLSearchParams): KilnViewerFamily {
  const raw = params.get('family') ?? 'trees';
  return raw === 'structures' || raw === 'drops' || raw === 'nodes' || raw === 'trees' || raw === 'creatures' || raw === 'adopted'
    ? raw
    : 'trees';
}

function familyForSlug(slug: string): KilnViewerFamily {
  for (const family of ['structures', 'drops', 'nodes', 'trees', 'creatures'] as KilnViewerFamily[]) {
    if (FAMILY_SLUGS[family].includes(slug)) return family;
  }
  return 'adopted';
}

function orientationPolicyFor(slug: string): KilnInstancedOrientationPolicy {
  if (slug === 'tree-pine' || slug === 'tree-broadleaf' || slug === 'tree-dead-snag') return 'longest-axis-to-y';
  return 'preserve-y-up';
}

function socketTargetFor(family: KilnViewerFamily, slug: string): { footprint: number; height: number } {
  if (family === 'trees') return slug === 'tree-shrub' ? { footprint: 1.2, height: 0.9 } : { footprint: 1.55, height: 2.7 };
  if (family === 'creatures') return { footprint: 1.15, height: 0.95 };
  if (family === 'drops') return { footprint: 0.85, height: 0.38 };
  if (family === 'nodes') return { footprint: 1.05, height: 0.95 };
  return { footprint: 1.5, height: 1.25 };
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
  sprite.scale.set(1.6, 0.3, 1);
  return sprite;
}

function makeHexSocket(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.045, 6, 1),
    new THREE.MeshStandardMaterial({ color: 0x425946, roughness: 0.82, metalness: 0 }),
  );
  base.rotation.y = Math.PI / 6;
  base.position.y = -0.025;
  group.add(base);

  const ring = new THREE.LineSegments(
    new THREE.EdgesGeometry(base.geometry),
    new THREE.LineBasicMaterial({ color: 0xa9c6b3, transparent: true, opacity: 0.55 }),
  );
  ring.rotation.copy(base.rotation);
  ring.position.copy(base.position);
  group.add(ring);

  const up = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.86, 0.03, -0.76), 0.82, 0x79d28c, 0.12, 0.07);
  group.add(up);
  return group;
}

function makeNormalizedStaticObject(
  source: THREE.Object3D,
  slug: string,
  family: KilnViewerFamily,
): { object: THREE.Object3D; record: Pick<ViewerAssetRecord, 'orientation' | 'runtimeSourceBboxSize' | 'orientedSourceBboxSize' | 'normalizedBboxSize' | 'socketScale' | 'socketFootprint' | 'socketTargetHeight' | 'meshCount'> } {
  const normalized = makeInstancedAssetParts(source, slug, orientationPolicyFor(slug));
  const root = new THREE.Group();
  root.name = `viewer-normalized-${slug}`;
  for (const part of normalized.parts) {
    const mesh = new THREE.Mesh(part.geometry, Array.isArray(part.material) ? part.material.map((mat) => mat.clone()) : part.material.clone());
    mesh.name = `${part.name}-viewer`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const target = socketTargetFor(family, slug);
  const scale = scaleForSocket(normalized.normalizedBboxSize, target);
  root.scale.setScalar(scale);
  return {
    object: root,
    record: {
      orientation: normalized.orientation,
      runtimeSourceBboxSize: normalized.runtimeSourceBboxSize,
      orientedSourceBboxSize: normalized.orientedSourceBboxSize,
      normalizedBboxSize: normalized.normalizedBboxSize,
      socketScale: scale,
      socketFootprint: target.footprint,
      socketTargetHeight: target.height,
      meshCount: normalized.sourceMeshCount,
    },
  };
}

function makeNormalizedAnimatedObject(
  source: THREE.Object3D,
  slug: string,
  family: KilnViewerFamily,
): { object: THREE.Object3D; record: Pick<ViewerAssetRecord, 'orientation' | 'runtimeSourceBboxSize' | 'orientedSourceBboxSize' | 'normalizedBboxSize' | 'socketScale' | 'socketFootprint' | 'socketTargetHeight' | 'meshCount'> } {
  source.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(source);
  const sourceSize = new THREE.Vector3();
  const sourceCenter = new THREE.Vector3();
  sourceBox.getSize(sourceSize);
  sourceBox.getCenter(sourceCenter);
  const body = source.clone(true);
  body.position.set(-sourceCenter.x, -sourceBox.min.y, -sourceCenter.z);
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
  root.add(body);
  root.updateMatrixWorld(true);
  const normalizedSize = bboxSizeOfObject(root);
  const target = socketTargetFor(family, slug);
  const scale = scaleForSocket(normalizedSize, target);
  root.scale.setScalar(scale);
  let meshCount = 0;
  source.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshCount += 1;
  });
  const size = [sourceSize.x, sourceSize.y, sourceSize.z].map((value) => Number(value.toFixed(3)));
  return {
    object: root,
    record: {
      orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
      runtimeSourceBboxSize: size,
      orientedSourceBboxSize: size,
      normalizedBboxSize: normalizedSize,
      socketScale: scale,
      socketFootprint: target.footprint,
      socketTargetHeight: target.height,
      meshCount,
    },
  };
}

function defaultColumnsFor(family: KilnViewerFamily, count: number): number {
  if (count <= 2) return count;
  if (family === 'structures' || family === 'trees') return count;
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
  return Number.isFinite(requested) && requested >= 2 ? Math.min(8, requested) : 3.45;
}

function gridPosition(index: number, columns: number, spacing: number): THREE.Vector3 {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = (col - (columns - 1) / 2) * spacing + (row % 2) * spacing * 0.5;
  const z = row * spacing * 0.86;
  return new THREE.Vector3(x, 0, z);
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
  const slugs = requestedSlug ? [requestedSlug] : [...FAMILY_SLUGS[family]];
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
  panel.textContent = `Kiln alignment viewer\nfamily ${family}\nloading ${slugs.length} asset${slugs.length === 1 ? '' : 's'}`;
  document.body.appendChild(panel);

  const manifest = await fetch(publicAssetUrl('assets/kiln/ASSET_MANIFEST.json')).then((res) => res.json() as Promise<KilnManifest>);
  const bySlug = new Map((manifest.assets ?? []).map((asset) => [asset.slug, asset]));
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
    const asset = bySlug.get(slug);
    const cell = new THREE.Group();
    cell.name = `viewer-cell-${slug}`;
    cell.position.copy(gridPosition(i, columns, spacing));
    cell.add(makeHexSocket());
    const label = makeLabel(slug);
    label.position.set(0, 0.05, 1.28);
    cell.add(label);
    content.add(cell);

    if (!asset || asset.status !== 'ready' || !asset.file) {
      records.push({
        slug,
        family: requestedSlug ? familyForSlug(slug) : family,
        title: asset?.title ?? slug,
        status: 'failed',
        sourceUrl: '',
        orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
        runtimeSourceBboxSize: [],
        orientedSourceBboxSize: [],
        normalizedBboxSize: [],
        socketScale: 0,
        socketFootprint: 0,
        socketTargetHeight: 0,
        meshCount: 0,
        error: 'missing ready manifest asset',
      });
      continue;
    }

    const sourceUrl = publicAssetUrl(`assets/kiln/${asset.file}`);
    try {
      const gltf = await loader.loadAsync(sourceUrl);
      const assetFamily = familyForSlug(slug);
      const built = assetFamily === 'creatures'
        ? makeNormalizedAnimatedObject(gltf.scene as unknown as THREE.Object3D, slug, assetFamily)
        : makeNormalizedStaticObject(gltf.scene as unknown as THREE.Object3D, slug, assetFamily);
      built.object.position.y = 0;
      cell.add(built.object);
      content.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(built.object);
      const helper = new THREE.Box3Helper(box, 0xd4eef8);
      helper.name = `viewer-bounds-${slug}`;
      content.add(helper);
      if (assetFamily === 'creatures' && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(built.object);
        const clip = gltf.animations.find((entry) => entry.name === 'idle') ?? gltf.animations[0];
        mixer.clipAction(clip).play();
        mixers.push(mixer);
      }
      records.push({
        slug,
        family: assetFamily,
        title: asset.title ?? slug,
        status: 'loaded',
        sourceUrl,
        ...built.record,
      });
    } catch (err) {
      records.push({
        slug,
        family: requestedSlug ? familyForSlug(slug) : family,
        title: asset.title ?? slug,
        status: 'failed',
        sourceUrl,
        orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
        runtimeSourceBboxSize: [],
        orientedSourceBboxSize: [],
        normalizedBboxSize: [],
        socketScale: 0,
        socketFootprint: 0,
        socketTargetHeight: 0,
        meshCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  frameCamera(camera, content);
  const state = {
    ready: true,
    family,
    slugs,
    columns,
    spacing,
    records,
    coordinateSystem: 'viewer local Y is world/planet surface normal; each asset sits on a flat hex socket at y=0',
  };
  (window as any).__assetViewer = state;
  (window as any).render_game_to_text = () => JSON.stringify(state);
  panel.textContent = `Kiln alignment viewer\nfamily ${family}\nloaded ${records.filter((record) => record.status === 'loaded').length}/${records.length}\ncolumns ${columns} spacing ${spacing.toFixed(2)}\nY axis is the socket sky/up direction`;

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    frameCamera(camera, content);
  });

  let last = performance.now();
  (window as any).advanceTime = (ms = 16) => {
    const dt = Math.max(0, Math.min(0.05, Number(ms) / 1000));
    for (const mixer of mixers) mixer.update(dt);
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    for (const mixer of mixers) mixer.update(dt);
    renderer.render(scene, camera);
  });
}
