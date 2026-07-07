import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import { WATER_SURFACE } from '../world/layers';
import type { CaveMouthSignal } from '../sim/caveMouths';
import type {
  CaveMouthSkinProvider,
  KilnCaveMouthSkinFitSnapshot,
  KilnCaveMouthSkinSlug,
  KilnCaveMouthSkinTemplate,
} from './kilnAssets';
import { makeSurfaceBasisFromYaw } from './surfaceFrame';

function mat(color: number, roughness = 0.82, metalness = 0.03, emissive = 0x000000, intensity = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive === 0 ? 0 : intensity });
}

const stone = mat(0x4f5960, 0.9);
const dark = mat(0x20272c, 0.96);
const archGlow = mat(0x97b7c8, 0.65, 0.04, 0x4f7f95, 0.2);
const dryGlow = mat(0x70d6d1, 0.45, 0.08, 0x38d8d1, 0.9);
const seaGlow = mat(0x5faed2, 0.45, 0.05, 0x2a8eb8, 0.75);
const springGlow = mat(0x8fe8ff, 0.32, 0.04, 0x45cfe8, 0.85);
const moss = mat(0x526c50, 0.88);
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const cone6 = new THREE.ConeGeometry(0.5, 1, 6);
const sphere = new THREE.SphereGeometry(0.5, 10, 8);

const CAVE_MOUTH_VISUAL_POLICY = 'glb-skin-over-carved-void';
const CAVE_MOUTH_GLBS = ['cave-mouth-arch', 'cave-mouth-dry', 'cave-mouth-sea'] as const;
const PROCEDURAL_BODY_NAMES = new Set([
  'mouthTerrainArchRib',
  'mouthTerrainLintel',
  'mouthTerrainLip',
  'mouthTerrainMossSkirt',
]);
const PROCEDURAL_OVERLAY_NAMES = new Set([
  'mouthTerrainCut',
  'mouthRecessShadow',
  'mouthRouteGlyph',
  'mouthTideLine',
  'mouthSpringSeep',
  'mouthSpringDrop',
]);

function slugForKind(kind: CaveMouthSignal['kind']): KilnCaveMouthSkinSlug {
  return kind === 'arch' ? 'cave-mouth-arch'
    : kind === 'seaCave' ? 'cave-mouth-sea'
    : 'cave-mouth-dry';
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

function makeMouth(signal: CaveMouthSignal): THREE.Group {
  const g = new THREE.Group();
  g.name = `cave-mouth-${signal.kind}-${signal.id}`;
  g.userData.visualPolicy = CAVE_MOUTH_VISUAL_POLICY;
  g.userData.kilnCaveMouthSlugs = [...CAVE_MOUTH_GLBS];
  g.userData.caveMouthVisualRole = 'kiln cave-mouth shell with carved terrain overlays';
  const glow = signal.kind === 'dryCave' ? dryGlow : signal.kind === 'seaCave' ? seaGlow : archGlow;
  const threshold = mesh(cyl6, dark, [0, 0.032, 0], [0.88, 0.035, 0.58], 'mouthTerrainCut');
  threshold.userData.caveMouthDressingRole = 'shadowed carved void';
  g.add(threshold);
  if (signal.kind === 'arch') {
    const left = mesh(box, stone, [-0.42, 0.36, 0.02], [0.18, 0.72, 0.2], 'mouthTerrainArchRib');
    left.userData.caveMouthDressingRole = 'terrain arch rib';
    left.rotation.z = -0.18;
    const right = mesh(box, stone, [0.42, 0.36, 0.02], [0.18, 0.72, 0.2], 'mouthTerrainArchRib');
    right.userData.caveMouthDressingRole = 'terrain arch rib';
    right.rotation.z = 0.18;
    g.add(left, right);
    const lintel = mesh(box, stone, [0, 0.74, 0.02], [0.78, 0.13, 0.2], 'mouthTerrainLintel');
    lintel.userData.caveMouthDressingRole = 'terrain arch lintel';
    g.add(lintel);
    const guide = mesh(box, archGlow, [0, 0.18, 0.42], [0.42, 0.025, 0.055], 'mouthRouteGlyph');
    guide.rotation.z = 0.08;
    guide.userData.caveMouthDressingRole = 'low route glyph';
    g.add(guide);
  } else {
    const backShade = mesh(box, dark, [0, 0.105, -0.18], [0.6, 0.09, 0.22], 'mouthRecessShadow');
    backShade.userData.caveMouthDressingRole = 'recess into carved terrain';
    g.add(backShade);
    const leftLip = mesh(sphere, stone, [-0.38, 0.14, 0.02], [0.26, 0.12, 0.17], 'mouthTerrainLip');
    leftLip.userData.caveMouthDressingRole = 'terrain lip';
    leftLip.rotation.z = -0.2;
    const rightLip = mesh(sphere, stone, [0.33, 0.15, -0.02], [0.29, 0.13, 0.18], 'mouthTerrainLip');
    rightLip.userData.caveMouthDressingRole = 'terrain lip';
    rightLip.rotation.z = 0.14;
    const capLip = mesh(box, stone, [-0.02, 0.29, -0.05], [0.58, 0.07, 0.16], 'mouthTerrainLip');
    capLip.userData.caveMouthDressingRole = 'terrain lip';
    capLip.rotation.z = -0.08;
    const mossSkirt = mesh(box, moss, [0.06, 0.105, 0.26], [0.64, 0.025, 0.07], 'mouthTerrainMossSkirt');
    mossSkirt.userData.caveMouthDressingRole = 'terrain skirt';
    g.add(leftLip, rightLip, capLip, mossSkirt);
    const guide = mesh(signal.kind === 'seaCave' ? cone6 : box, glow, [0, 0.16, 0.42], signal.kind === 'seaCave' ? [0.12, 0.024, 0.08] : [0.34, 0.024, 0.055], 'mouthRouteGlyph');
    guide.rotation.x = signal.kind === 'seaCave' ? Math.PI / 2 : 0.06;
    guide.rotation.z = signal.kind === 'seaCave' ? 0.2 : -0.12;
    guide.userData.caveMouthDressingRole = signal.kind === 'seaCave' ? 'low tide route glyph' : 'low dry-cave route glyph';
    g.add(guide);
  }
  if (signal.kind === 'seaCave') {
    const tide = mesh(box, seaGlow, [0, 0.13, 0.26], [0.72, 0.025, 0.08], 'mouthTideLine');
    tide.userData.caveMouthDressingRole = 'low tide line';
    g.add(tide);
  }
  if (signal.spring) {
    const pool = mesh(cyl6, springGlow, [0, 0.13, 0.32], [0.34, 0.025, 0.18], 'mouthSpringSeep');
    pool.rotation.y = Math.PI / 6;
    pool.userData.caveMouthDressingRole = 'low spring seep';
    g.add(pool);
    const drop = mesh(sphere, springGlow, [-0.24, 0.22, 0.24], [0.04, 0.04, 0.04], 'mouthSpringDrop');
    drop.userData.caveMouthDressingRole = 'spring bead';
    g.add(drop);
  }
  return g;
}

export class CaveMouthRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();
  private readonly skinTemplates = new Map<KilnCaveMouthSkinSlug, KilnCaveMouthSkinTemplate>();
  private readonly skinPromises = new Map<KilnCaveMouthSkinSlug, Promise<KilnCaveMouthSkinTemplate | null>>();
  private readonly pendingSkins = new Map<number, KilnCaveMouthSkinSlug>();
  private readonly failedSkins = new Map<number, KilnCaveMouthSkinSlug>();
  private readonly skinRecords = new Map<number, {
    slug: KilnCaveMouthSkinSlug;
    object: THREE.Object3D;
    fit: KilnCaveMouthSkinFitSnapshot;
    sourceUrl: string;
  }>();

  constructor(scene: THREE.Scene, private readonly skinProvider?: CaveMouthSkinProvider) {
    this.group.name = 'cave-mouths';
    scene.add(this.group);
  }

  setMouths(mouths: readonly CaveMouthSignal[]): void {
    const wanted = new Set(mouths.map((mouth) => mouth.id));
    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.group.remove(obj);
        this.objects.delete(id);
        this.pendingSkins.delete(id);
        this.failedSkins.delete(id);
        this.skinRecords.delete(id);
      }
    }
    for (const mouth of mouths) {
      let obj = this.objects.get(mouth.id);
      if (!obj) {
        obj = makeMouth(mouth);
        obj.userData.caveMouthId = mouth.id;
        obj.userData.tile = mouth.tile;
        this.objects.set(mouth.id, obj);
        this.group.add(obj);
      }
      this.ensureSkin(mouth, obj);
    }
  }

  private ensureSkin(mouth: CaveMouthSignal, obj: THREE.Group): void {
    if (!this.skinProvider) return;
    const slug = slugForKind(mouth.kind);
    obj.userData.kilnCaveMouthSlug = slug;
    const existing = this.skinRecords.get(mouth.id);
    if (existing?.slug === slug) return;
    const cached = this.skinTemplates.get(slug);
    if (cached) {
      this.attachSkin(mouth.id, obj, cached);
      return;
    }
    if (this.pendingSkins.get(mouth.id) === slug) return;
    this.failedSkins.delete(mouth.id);
    this.pendingSkins.set(mouth.id, slug);
    let promise = this.skinPromises.get(slug);
    if (!promise) {
      promise = this.skinProvider.createCaveMouthSkinTemplate(slug);
      this.skinPromises.set(slug, promise);
    }
    promise.then((template) => {
      if (this.pendingSkins.get(mouth.id) !== slug) return;
      this.pendingSkins.delete(mouth.id);
      const live = this.objects.get(mouth.id);
      if (!live) return;
      if (!template) {
        this.failedSkins.set(mouth.id, slug);
        this.setProceduralBodyVisible(live, true);
        return;
      }
      this.skinTemplates.set(slug, template);
      this.attachSkin(mouth.id, live, template);
    }).catch(() => {
      this.pendingSkins.delete(mouth.id);
      this.failedSkins.set(mouth.id, slug);
      this.setProceduralBodyVisible(obj, true);
    });
  }

  private attachSkin(mouthId: number, obj: THREE.Group, template: KilnCaveMouthSkinTemplate): void {
    const previous = this.skinRecords.get(mouthId);
    if (previous) obj.remove(previous.object);
    const object = template.template.clone(true);
    object.name = `kiln-cave-mouth-skin-${template.slug}`;
    object.userData.kilnAssetSlug = template.slug;
    object.userData.kilnAssetSourceUrl = template.sourceUrl;
    object.userData.kilnCaveMouthFit = template.fit;
    object.traverse((child) => {
      child.userData.kilnAssetSlug = template.slug;
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });
    obj.add(object);
    this.setProceduralBodyVisible(obj, false);
    this.failedSkins.delete(mouthId);
    this.skinRecords.set(mouthId, {
      slug: template.slug,
      object,
      fit: template.fit,
      sourceUrl: template.sourceUrl,
    });
  }

  private setProceduralBodyVisible(obj: THREE.Group, visible: boolean): void {
    obj.traverse((child) => {
      if (PROCEDURAL_BODY_NAMES.has(child.name)) child.visible = visible;
      if (PROCEDURAL_OVERLAY_NAMES.has(child.name)) child.visible = true;
    });
  }

  update(
    mouths: readonly CaveMouthSignal[],
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
    for (const mouth of mouths) {
      const obj = this.objects.get(mouth.id);
      if (!obj) continue;
      const frame = geo.frameOf(mouth.tile);
      const yaw = mouth.id * 0.017;
      makeSurfaceBasisFromYaw(frame, yaw, m, vX, vY, vZ);
      obj.setRotationFromMatrix(m);
      const ground = layers.topRadius(columns.groundLayerBelow(mouth.tile, layers.bounds[0]));
      const r = Math.max(ground + 0.22, WATER_SURFACE + (mouth.flooded ? 0.34 : 0.18));
      obj.position.set(
        c[mouth.tile * 3] * r - camWorld.x,
        c[mouth.tile * 3 + 1] * r - camWorld.y,
        c[mouth.tile * 3 + 2] * r - camWorld.z,
      );
      const markerScale = mouth.kind === 'arch' ? 1.28 : mouth.kind === 'seaCave' ? 1.55 : 1.45;
      obj.scale.setScalar(markerScale);
      const pulse = 1 + Math.sin(seconds * 2.0 + mouth.id * 0.1) * 0.08;
      obj.traverse((child) => {
        if (child.name === 'mouthRouteGlyph' || child.name === 'mouthTideLine' || child.name === 'mouthSpringSeep' || child.name === 'mouthSpringDrop') {
          const base = child.userData.baseScale as [number, number, number] | undefined;
          if (base) child.scale.set(base[0] * pulse, base[1] * pulse, base[2] * pulse);
        }
      });
      obj.visible = true;
    }
  }

  stats(): {
    groups: number;
    meshes: number;
    active: number;
    terrainDressing: number;
    standingMarkers: number;
    visualPolicy: typeof CAVE_MOUTH_VISUAL_POLICY;
    kilnCaveMouthGlbs: readonly KilnCaveMouthSkinSlug[];
    kilnCaveMouthSkinsLoaded: number;
    kilnCaveMouthSkinsPending: number;
    kilnCaveMouthSkinFallbacks: number;
    kilnCaveMouthGlbVisible: number;
    proceduralFallbackVisible: number;
    kilnCaveMouthSkinsBySlug: Partial<Record<KilnCaveMouthSkinSlug, number>>;
    kilnCaveMouthSkinFits: Partial<Record<KilnCaveMouthSkinSlug, KilnCaveMouthSkinFitSnapshot>>;
  } {
    let meshes = 0;
    let active = 0;
    let terrainDressing = 0;
    let standingMarkers = 0;
    let kilnCaveMouthGlbVisible = 0;
    let proceduralFallbackVisible = 0;
    const kilnCaveMouthSkinsBySlug: Partial<Record<KilnCaveMouthSkinSlug, number>> = {};
    const kilnCaveMouthSkinFits: Partial<Record<KilnCaveMouthSkinSlug, KilnCaveMouthSkinFitSnapshot>> = {};
    for (const obj of this.objects.values()) {
      if (obj.visible) active++;
      if (obj.userData.visualPolicy === CAVE_MOUTH_VISUAL_POLICY) terrainDressing++;
      const record = this.skinRecords.get(obj.userData.caveMouthId as number);
      if (record && record.object.visible) {
        kilnCaveMouthGlbVisible++;
        kilnCaveMouthSkinsBySlug[record.slug] = (kilnCaveMouthSkinsBySlug[record.slug] ?? 0) + 1;
        kilnCaveMouthSkinFits[record.slug] = record.fit;
      } else if (obj.visible) {
        proceduralFallbackVisible++;
      }
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshes++;
        if (child.name === 'mouthCairnStone' || child.name === 'mouthGlow' || child.name === 'mouthGlyph') standingMarkers++;
      });
    }
    return {
      groups: this.objects.size,
      meshes,
      active,
      terrainDressing,
      standingMarkers,
      visualPolicy: CAVE_MOUTH_VISUAL_POLICY,
      kilnCaveMouthGlbs: CAVE_MOUTH_GLBS,
      kilnCaveMouthSkinsLoaded: this.skinRecords.size,
      kilnCaveMouthSkinsPending: this.pendingSkins.size,
      kilnCaveMouthSkinFallbacks: this.objects.size - this.skinRecords.size,
      kilnCaveMouthGlbVisible,
      proceduralFallbackVisible,
      kilnCaveMouthSkinsBySlug,
      kilnCaveMouthSkinFits,
    };
  }
}
