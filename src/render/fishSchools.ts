import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { FishSchoolReport } from '../sim/fishing';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import { WATER_SURFACE } from '../world/layers';
import {
  FISH_ACTIVE_MIXER_RADIUS,
  FISH_FROZEN_MIXER_RADIUS,
  FISH_LOW_RATE_MIXER_RADIUS,
  type FishSkinProvider,
  type KilnFishSkinFitSnapshot,
  type KilnFishSkinSlug,
  type KilnFishSkinTemplate,
} from './kilnAssets';
import { makeSurfaceBasisFromYaw } from './surfaceFrame';

export interface FishSchoolVisualSite {
  id: number;
  tile: number;
  school: FishSchoolReport;
}

type FishSkinStatus = 'pending' | 'loaded' | 'fallback';
type FishAnimationBand = 'active' | 'lowRate' | 'frozen' | 'hidden';

interface FishAnchorRecord {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  actions: Map<string, THREE.AnimationAction>;
  currentClip: string | null;
  lastMixerSeconds: number;
  lastLowRateStepSeconds: number;
  band: FishAnimationBand;
}

export const KILN_FISH_SKIN_SLUGS: readonly KilnFishSkinSlug[] = [
  'fish-shore-minnow',
  'fish-storm-runner',
  'fish-cave-shimmer',
  'creature-driftjelly',
  'fish-reed-fry',
];

const MAX_POINT_SPRITES = 32;

function schoolColor(slug: KilnFishSkinSlug): number {
  if (slug === 'fish-storm-runner') return 0xa3e2f2;
  if (slug === 'fish-cave-shimmer') return 0x72d6ce;
  if (slug === 'creature-driftjelly') return 0xb38bed;
  if (slug === 'fish-reed-fry') return 0x9dcc7a;
  return 0x8bb7c8;
}

export function kilnFishSkinForSchool(school: FishSchoolReport): KilnFishSkinSlug | null {
  if (school.kind === 'none' || school.catchCount <= 0) return null;
  if (school.kind === 'cave') return 'fish-cave-shimmer';
  if (school.kind === 'storm') return 'fish-storm-runner';
  if (school.kind === 'run') {
    const label = school.label.toLowerCase();
    if (label.includes('salt') || label.includes('tide')) return 'creature-driftjelly';
    if (label.includes('reed') || label.includes('water')) return 'fish-reed-fry';
    return 'fish-storm-runner';
  }
  return 'fish-shore-minnow';
}

function mat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02, emissive: color, emissiveIntensity: 0.04 });
}

const fishBody = new THREE.SphereGeometry(0.5, 9, 6);
const fishTail = new THREE.ConeGeometry(0.5, 0.8, 7);

function makeFallbackFish(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fish-school-fallback-body';
  const body = new THREE.Mesh(fishBody, mat(0x8bb7c8));
  body.name = 'fallbackFishBody';
  body.scale.set(0.28, 0.16, 0.42);
  const tail = new THREE.Mesh(fishTail, mat(0x5f8da5));
  tail.name = 'fallbackFishTail';
  tail.position.set(0, 0, 0.42);
  tail.scale.set(0.11, 0.22, 0.11);
  tail.rotation.x = Math.PI / 2;
  group.add(body, tail);
  group.visible = false;
  return group;
}

export class FishSchoolRenderer {
  readonly group = new THREE.Group();
  private readonly fallback = makeFallbackFish();
  private readonly pointPositions = new Float32Array(MAX_POINT_SPRITES * 3);
  private readonly pointsGeometry = new THREE.BufferGeometry();
  private readonly pointsMaterial = new THREE.PointsMaterial({
    color: 0x8bb7c8,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  private readonly points: THREE.Points;
  private readonly skinTemplates = new Map<KilnFishSkinSlug, KilnFishSkinTemplate>();
  private readonly skinPromises = new Map<KilnFishSkinSlug, Promise<KilnFishSkinTemplate | null>>();
  private readonly skinStatus = new Map<KilnFishSkinSlug, FishSkinStatus>();
  private readonly anchors: FishAnchorRecord[] = [];
  private currentSite: FishSchoolVisualSite | null = null;
  private currentSlug: KilnFishSkinSlug | null = null;
  private currentAnchorCount = 0;
  private visibleSlug: KilnFishSkinSlug | null = null;
  private pointSpriteCount = 0;

  constructor(scene: THREE.Scene, private readonly fishSkins?: FishSkinProvider) {
    this.group.name = 'fish-school-visuals';
    this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(this.pointPositions, 3));
    this.pointsGeometry.setDrawRange(0, 0);
    this.points = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
    this.points.name = 'fish-school-point-sprites';
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.group.add(this.fallback, this.points);
    this.group.visible = false;
    scene.add(this.group);
  }

  setSchool(site: FishSchoolVisualSite | null): void {
    this.currentSite = site && site.school.kind !== 'none' && site.school.catchCount > 0 ? site : null;
    if (!this.currentSite) {
      this.group.visible = false;
      this.points.visible = false;
      this.fallback.visible = false;
      return;
    }
    const slug = kilnFishSkinForSchool(this.currentSite.school);
    this.visibleSlug = slug;
    if (!slug) {
      this.group.visible = false;
      return;
    }
    this.pointsMaterial.color.setHex(schoolColor(slug));
    this.ensureSkin(slug);
    const template = this.skinTemplates.get(slug);
    if (template) {
      this.ensureAnchors(this.currentSite, template);
      this.fallback.visible = false;
    } else if (!this.fishSkins || this.skinStatus.get(slug) === 'fallback') {
      this.disposeAnchors();
      this.fallback.visible = true;
    }
  }

  private ensureSkin(slug: KilnFishSkinSlug): void {
    if (this.skinTemplates.has(slug)) {
      this.skinStatus.set(slug, 'loaded');
      return;
    }
    if (!this.fishSkins) {
      this.skinStatus.set(slug, 'fallback');
      return;
    }
    if (this.skinPromises.has(slug)) {
      this.skinStatus.set(slug, 'pending');
      return;
    }
    this.skinStatus.set(slug, 'pending');
    const promise = this.fishSkins.createFishSkinTemplate(slug)
      .then((template) => {
        this.skinPromises.delete(slug);
        if (!template) {
          this.skinStatus.set(slug, 'fallback');
          return null;
        }
        this.skinTemplates.set(slug, template);
        this.skinStatus.set(slug, 'loaded');
        return template;
      })
      .catch(() => {
        this.skinPromises.delete(slug);
        this.skinStatus.set(slug, 'fallback');
        return null;
      });
    this.skinPromises.set(slug, promise);
  }

  private disposeAnchors(): void {
    for (const record of this.anchors) {
      record.mixer.stopAllAction();
      record.mixer.uncacheRoot(record.root);
      this.group.remove(record.root);
    }
    this.anchors.length = 0;
    this.currentSlug = null;
    this.currentAnchorCount = 0;
  }

  private ensureAnchors(site: FishSchoolVisualSite, template: KilnFishSkinTemplate): void {
    const desired = Math.max(1, Math.min(2, Math.trunc(site.school.catchCount)));
    if (this.currentSlug === template.slug && this.currentAnchorCount === desired) return;
    this.disposeAnchors();
    this.currentSlug = template.slug;
    this.currentAnchorCount = desired;
    for (let i = 0; i < desired; i += 1) {
      const root = template.template.clone(true);
      root.name = `kiln-fish-${template.slug}-${i}`;
      root.userData.kilnAssetSlug = template.slug;
      root.userData.kilnFishSchoolKind = template.schoolKind;
      root.userData.kilnFishSkinFit = template.fit;
      root.traverse((child) => {
        child.userData.kilnAssetSlug = template.slug;
        child.userData.kilnFishSchoolKind = template.schoolKind;
      });
      const mixer = new THREE.AnimationMixer(root);
      const clips = new Map(template.clips.map((clip) => [clip.name, clip]));
      this.anchors.push({
        root,
        mixer,
        clips,
        actions: new Map(),
        currentClip: null,
        lastMixerSeconds: 0,
        lastLowRateStepSeconds: 0,
        band: 'hidden',
      });
      this.group.add(root);
    }
  }

  private updatePoints(site: FishSchoolVisualSite, seconds: number): void {
    const strength = Math.max(0, Math.min(1, site.school.strength));
    const count = Math.max(8, Math.min(MAX_POINT_SPRITES, 8 + Math.trunc(site.school.catchCount * 5 + strength * 10)));
    this.pointSpriteCount = count;
    for (let i = 0; i < count; i += 1) {
      const phase = site.id * 0.021 + i * 2.399 + seconds * (0.22 + (i % 5) * 0.025);
      const radius = 0.24 + (i % 6) * 0.045 + strength * 0.14;
      this.pointPositions[i * 3] = Math.cos(phase) * radius;
      this.pointPositions[i * 3 + 1] = -0.05 + Math.sin(seconds * 1.7 + i * 0.61) * 0.055;
      this.pointPositions[i * 3 + 2] = Math.sin(phase * 1.13) * radius * 0.72;
    }
    this.pointsGeometry.setDrawRange(0, count);
    this.pointsGeometry.attributes.position.needsUpdate = true;
    this.points.visible = true;
  }

  private updateAnchorAnimation(record: FishAnchorRecord, site: FishSchoolVisualSite, slug: KilnFishSkinSlug, distance: number, seconds: number): void {
    const desiredBand: FishAnimationBand =
      distance <= FISH_ACTIVE_MIXER_RADIUS ? 'active'
      : distance <= FISH_LOW_RATE_MIXER_RADIUS ? 'lowRate'
      : distance <= FISH_FROZEN_MIXER_RADIUS ? 'frozen'
      : 'hidden';
    record.band = desiredBand;
    record.root.visible = desiredBand !== 'hidden';
    const desiredClip = slug === 'creature-driftjelly'
      ? (site.school.strength >= 0.45 ? 'swim' : 'pulse')
      : site.school.catchCount <= 1 && site.school.strength < 0.45
      ? 'idle'
      : 'swim';
    const clip = record.clips.get(desiredClip)
      ?? record.clips.get('swim')
      ?? record.clips.get('pulse')
      ?? record.clips.get('idle')
      ?? [...record.clips.values()][0];
    if (!clip) return;
    let action = record.actions.get(clip.name);
    if (!action) {
      action = record.mixer.clipAction(clip);
      record.actions.set(clip.name, action);
    }
    if (record.currentClip !== clip.name) {
      if (record.currentClip) record.actions.get(record.currentClip)?.fadeOut(0.12);
      action.reset().fadeIn(0.12).play();
      record.currentClip = clip.name;
    }
    const dt = record.lastMixerSeconds > 0 ? Math.max(0, Math.min(0.05, seconds - record.lastMixerSeconds)) : 1 / 60;
    record.lastMixerSeconds = seconds;
    const shouldStepLowRate = desiredBand === 'lowRate' && seconds - record.lastLowRateStepSeconds >= 0.24;
    for (const ownedAction of record.actions.values()) ownedAction.paused = desiredBand !== 'active' && !shouldStepLowRate;
    if (desiredBand === 'active') {
      record.mixer.update(dt);
    } else if (shouldStepLowRate) {
      record.mixer.update(Math.min(0.08, Math.max(0.016, seconds - record.lastLowRateStepSeconds)));
      record.lastLowRateStepSeconds = seconds;
      for (const ownedAction of record.actions.values()) ownedAction.paused = true;
    }
  }

  update(
    site: FishSchoolVisualSite | null,
    geo: Goldberg,
    _layers: Layers,
    _columns: Columns,
    camWorld: { x: number; y: number; z: number },
    seconds: number,
  ): void {
    this.setSchool(site);
    if (!this.currentSite || !this.visibleSlug) return;
    const tile = Math.max(0, Math.min(geo.count - 1, Math.trunc(this.currentSite.tile)));
    const c = geo.centers;
    const frame = geo.frameOf(tile);
    const yaw = this.currentSite.id * 0.013 + seconds * 0.18;
    const vX = new THREE.Vector3();
    const vY = new THREE.Vector3();
    const vZ = new THREE.Vector3();
    this.group.setRotationFromMatrix(makeSurfaceBasisFromYaw(frame, yaw, new THREE.Matrix4(), vX, vY, vZ));
    const swimBob = Math.sin(seconds * 1.45 + this.currentSite.id * 0.17) * 0.035;
    const radius = WATER_SURFACE + 0.08 + swimBob;
    this.group.position.set(
      c[tile * 3] * radius - camWorld.x,
      c[tile * 3 + 1] * radius - camWorld.y,
      c[tile * 3 + 2] * radius - camWorld.z,
    );
    const distance = this.group.position.length();
    const active = distance <= FISH_FROZEN_MIXER_RADIUS;
    this.group.visible = active;
    if (!active) {
      this.points.visible = false;
      this.fallback.visible = false;
      for (const record of this.anchors) {
        record.band = 'hidden';
        record.root.visible = false;
      }
      return;
    }
    this.updatePoints(this.currentSite, seconds);
    if (this.fallback.visible) {
      this.fallback.position.set(0, -0.02, Math.sin(seconds * 1.3) * 0.08);
      this.fallback.rotation.y = Math.sin(seconds * 2.1) * 0.26;
      this.fallback.scale.setScalar(1 + Math.sin(seconds * 2.7) * 0.03);
    }
    for (let i = 0; i < this.anchors.length; i += 1) {
      const record = this.anchors[i];
      const phase = seconds * (1.05 + i * 0.17) + this.currentSite.id * 0.031 + i * 1.7;
      record.root.position.set(
        Math.cos(phase * 0.83) * (0.11 + i * 0.12),
        Math.sin(phase * 1.7) * 0.055,
        Math.sin(phase) * (0.14 + i * 0.1),
      );
      record.root.rotation.set(0, Math.sin(phase * 1.23) * 0.34 + i * 0.42, 0);
      record.root.scale.setScalar(1 + i * 0.08 + Math.sin(phase * 1.9) * 0.025);
      this.updateAnchorAnimation(record, this.currentSite, this.visibleSlug, distance, seconds);
    }
  }

  stats(): {
    active: number;
    slug: KilnFishSkinSlug | null;
    schoolKind: string;
    label: string;
    pointSchoolSprites: number;
    glbAnchors: number;
    glbAnchorsVisible: number;
    fallbackVisible: number;
    activeMixers: number;
    lowRateMixers: number;
    frozenMixers: number;
    hiddenFishSkins: number;
    activeMixerRadius: number;
    lowRateMixerRadius: number;
    frozenMixerRadius: number;
    kilnFishSkinsLoaded: number;
    kilnFishSkinsPending: number;
    kilnFishSkinFallbacks: number;
    kilnFishSkinsBySlug: Partial<Record<KilnFishSkinSlug, {
      loaded: number;
      pending: number;
      fallback: number;
      clips: readonly string[];
      activeMixers: number;
      lowRateMixers: number;
      frozenMixers: number;
      hidden: number;
      visibleAnchors: number;
    }>>;
    kilnFishSkinFits: Partial<Record<KilnFishSkinSlug, KilnFishSkinFitSnapshot>>;
  } {
    const bySlug: Partial<Record<KilnFishSkinSlug, {
      loaded: number;
      pending: number;
      fallback: number;
      clips: readonly string[];
      activeMixers: number;
      lowRateMixers: number;
      frozenMixers: number;
      hidden: number;
      visibleAnchors: number;
    }>> = {};
    const fits: Partial<Record<KilnFishSkinSlug, KilnFishSkinFitSnapshot>> = {};
    let activeMixers = 0;
    let lowRateMixers = 0;
    let frozenMixers = 0;
    let hiddenFishSkins = 0;
    let visibleAnchors = 0;
    for (const slug of KILN_FISH_SKIN_SLUGS) {
      const status = this.skinStatus.get(slug);
      const template = this.skinTemplates.get(slug);
      const records = this.currentSlug === slug ? this.anchors : [];
      const row = {
        loaded: template ? 1 : 0,
        pending: status === 'pending' ? 1 : 0,
        fallback: status === 'fallback' ? 1 : 0,
        clips: template?.clips.map((clip) => clip.name) ?? [],
        activeMixers: records.filter((record) => record.band === 'active').length,
        lowRateMixers: records.filter((record) => record.band === 'lowRate').length,
        frozenMixers: records.filter((record) => record.band === 'frozen').length,
        hidden: records.filter((record) => record.band === 'hidden').length,
        visibleAnchors: records.filter((record) => record.root.visible).length,
      };
      if (row.loaded || row.pending || row.fallback || records.length) bySlug[slug] = row;
      if (template) fits[slug] = template.fit;
      activeMixers += row.activeMixers;
      lowRateMixers += row.lowRateMixers;
      frozenMixers += row.frozenMixers;
      hiddenFishSkins += row.hidden;
      visibleAnchors += row.visibleAnchors;
    }
    return {
      active: this.group.visible ? 1 : 0,
      slug: this.visibleSlug,
      schoolKind: this.currentSite?.school.kind ?? 'none',
      label: this.currentSite?.school.label ?? '',
      pointSchoolSprites: this.points.visible ? this.pointSpriteCount : 0,
      glbAnchors: this.anchors.length,
      glbAnchorsVisible: visibleAnchors,
      fallbackVisible: this.fallback.visible ? 1 : 0,
      activeMixers,
      lowRateMixers,
      frozenMixers,
      hiddenFishSkins,
      activeMixerRadius: FISH_ACTIVE_MIXER_RADIUS,
      lowRateMixerRadius: FISH_LOW_RATE_MIXER_RADIUS,
      frozenMixerRadius: FISH_FROZEN_MIXER_RADIUS,
      kilnFishSkinsLoaded: [...this.skinTemplates.keys()].length,
      kilnFishSkinsPending: [...this.skinStatus.values()].filter((status) => status === 'pending').length,
      kilnFishSkinFallbacks: [...this.skinStatus.values()].filter((status) => status === 'fallback').length,
      kilnFishSkinsBySlug: bySlug,
      kilnFishSkinFits: fits,
    };
  }
}
