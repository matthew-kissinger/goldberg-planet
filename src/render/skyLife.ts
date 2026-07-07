import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { SkyLifeKind, SkyLifeSite } from '../sim/skyLife';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import { WATER_SURFACE } from '../world/layers';
import {
  BIRD_ACTIVE_MIXER_RADIUS,
  BIRD_FROZEN_MIXER_RADIUS,
  BIRD_LOW_RATE_MIXER_RADIUS,
  type BirdSkinProvider,
  type KilnBirdSkinFitSnapshot,
  type KilnBirdSkinSlug,
  type KilnBirdSkinTemplate,
} from './kilnAssets';

type BirdSkinStatus = 'pending' | 'loaded' | 'fallback';
type BirdAnimationBand = 'active' | 'lowRate' | 'frozen' | 'hidden';

interface BirdAnchorRecord {
  key: string;
  siteId: number;
  slug: KilnBirdSkinSlug;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  actions: Map<string, THREE.AnimationAction>;
  currentClip: string | null;
  lastMixerSeconds: number;
  lastLowRateStepSeconds: number;
  band: BirdAnimationBand;
}

interface FallbackBirdRecord {
  key: string;
  siteId: number;
  slug: KilnBirdSkinSlug;
  root: THREE.Group;
  band: BirdAnimationBand;
}

interface SiteFrame {
  base: THREE.Vector3;
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  distance: number;
}

export const KILN_BIRD_SKIN_SLUGS: readonly KilnBirdSkinSlug[] = [
  'bird-sky-kite',
  'bird-shore-gull',
  'bird-forest-flutter',
  'bird-storm-finch',
];

const MAX_POINT_BIRDS = 64;

export function kilnBirdSkinForSite(site: SkyLifeSite): KilnBirdSkinSlug {
  if (site.kind === 'shore') return 'bird-shore-gull';
  if (site.kind === 'forest') return 'bird-forest-flutter';
  if (site.kind === 'storm') return 'bird-storm-finch';
  return 'bird-sky-kite';
}

function altitudeFor(kind: SkyLifeKind, intensity: number): number {
  if (kind === 'shore') return 5.2 + intensity * 2.5;
  if (kind === 'forest') return 6.2 + intensity * 2.8;
  if (kind === 'storm') return 8.4 + intensity * 4.8;
  return 12.5 + intensity * 5.5;
}

function spreadFor(kind: SkyLifeKind, intensity: number): number {
  if (kind === 'shore') return 3.2 + intensity * 1.2;
  if (kind === 'forest') return 2.4 + intensity * 1.0;
  if (kind === 'storm') return 4.6 + intensity * 2.2;
  return 5.6 + intensity * 2.8;
}

function pointCountFor(kind: SkyLifeKind, intensity: number): number {
  if (kind === 'forest') return 8 + Math.trunc(intensity * 5);
  if (kind === 'shore') return 10 + Math.trunc(intensity * 6);
  if (kind === 'storm') return 12 + Math.trunc(intensity * 8);
  return 13 + Math.trunc(intensity * 9);
}

function mat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.02, emissive: color, emissiveIntensity: 0.05 });
}

function makeFallbackBird(slug: KilnBirdSkinSlug): THREE.Group {
  const group = new THREE.Group();
  group.name = `bird-fallback-${slug}`;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), mat(0xb6d7ff));
  body.name = 'fallbackBirdBody';
  body.scale.set(1.1, 0.58, 0.78);
  const wingGeom = new THREE.ConeGeometry(0.12, 0.48, 5);
  const leftWing = new THREE.Mesh(wingGeom, mat(0xe8edf2));
  leftWing.name = 'fallbackBirdLeftWing';
  leftWing.position.set(-0.27, 0, 0);
  leftWing.rotation.z = Math.PI / 2;
  const rightWing = leftWing.clone();
  rightWing.name = 'fallbackBirdRightWing';
  rightWing.position.x = 0.27;
  rightWing.rotation.z = -Math.PI / 2;
  group.add(body, leftWing, rightWing);
  group.visible = false;
  return group;
}

function desiredClipFor(site: SkyLifeSite): string {
  if (site.kind === 'storm' || site.kind === 'forest') return 'flap';
  if (site.kind === 'shore') return site.intensity > 0.68 ? 'flap' : 'glide';
  return site.intensity > 0.8 ? 'turn' : 'glide';
}

function bandForDistance(distance: number): BirdAnimationBand {
  if (distance <= BIRD_ACTIVE_MIXER_RADIUS) return 'active';
  if (distance <= BIRD_LOW_RATE_MIXER_RADIUS) return 'lowRate';
  if (distance <= BIRD_FROZEN_MIXER_RADIUS) return 'frozen';
  return 'hidden';
}

function orientationFrom(up: THREE.Vector3, forward: THREE.Vector3): THREE.Matrix4 {
  const fwd = forward.clone().normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
  const trueForward = new THREE.Vector3().crossVectors(right, up).normalize();
  return new THREE.Matrix4().makeBasis(right, up, trueForward);
}

export class SkyLifeRenderer {
  readonly group = new THREE.Group();
  private readonly pointPositions = new Float32Array(MAX_POINT_BIRDS * 3);
  private readonly pointsGeometry = new THREE.BufferGeometry();
  private readonly pointsMaterial = new THREE.PointsMaterial({
    color: 0xd8ecff,
    size: 0.13,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  private readonly points: THREE.Points;
  private readonly skinTemplates = new Map<KilnBirdSkinSlug, KilnBirdSkinTemplate>();
  private readonly skinPromises = new Map<KilnBirdSkinSlug, Promise<KilnBirdSkinTemplate | null>>();
  private readonly skinStatus = new Map<KilnBirdSkinSlug, BirdSkinStatus>();
  private readonly anchors: BirdAnchorRecord[] = [];
  private readonly fallbacks: FallbackBirdRecord[] = [];
  private readonly currentSites = new Map<number, SkyLifeSite>();
  private signature = '';
  private visibleSiteCount = 0;
  private pointBirdCount = 0;

  constructor(scene: THREE.Scene, private readonly birdSkins?: BirdSkinProvider) {
    this.group.name = 'sky-life-visuals';
    this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(this.pointPositions, 3));
    this.pointsGeometry.setDrawRange(0, 0);
    this.points = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
    this.points.name = 'sky-life-point-flock';
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.group.add(this.points);
    scene.add(this.group);
  }

  private ensureSkin(slug: KilnBirdSkinSlug): void {
    if (this.skinTemplates.has(slug)) {
      this.skinStatus.set(slug, 'loaded');
      return;
    }
    if (!this.birdSkins) {
      this.skinStatus.set(slug, 'fallback');
      return;
    }
    if (this.skinPromises.has(slug)) {
      this.skinStatus.set(slug, 'pending');
      return;
    }
    this.skinStatus.set(slug, 'pending');
    const promise = this.birdSkins.createBirdSkinTemplate(slug)
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

  private disposeBirds(): void {
    for (const record of this.anchors) {
      record.mixer.stopAllAction();
      record.mixer.uncacheRoot(record.root);
      this.group.remove(record.root);
    }
    for (const record of this.fallbacks) this.group.remove(record.root);
    this.anchors.length = 0;
    this.fallbacks.length = 0;
  }

  private desiredSlots(sites: readonly SkyLifeSite[]): { key: string; site: SkyLifeSite; slug: KilnBirdSkinSlug; index: number }[] {
    const slots: { key: string; site: SkyLifeSite; slug: KilnBirdSkinSlug; index: number }[] = [];
    for (const site of sites) {
      const slug = kilnBirdSkinForSite(site);
      const count = site.kind === 'sky' || site.kind === 'storm' ? 2 : 1;
      for (let i = 0; i < count; i += 1) slots.push({ key: `${site.id}:${slug}:${i}`, site, slug, index: i });
    }
    return slots.slice(0, 6);
  }

  private rebuildBirds(sites: readonly SkyLifeSite[]): void {
    const slots = this.desiredSlots(sites);
    const nextSignature = slots
      .map((slot) => `${slot.key}:${this.skinTemplates.has(slot.slug) ? 'loaded' : this.skinStatus.get(slot.slug) ?? 'new'}`)
      .join('|');
    if (nextSignature === this.signature) return;
    this.signature = nextSignature;
    this.disposeBirds();
    for (const slot of slots) {
      const template = this.skinTemplates.get(slot.slug);
      if (!template) {
        if (this.skinStatus.get(slot.slug) !== 'pending') {
          const root = makeFallbackBird(slot.slug);
          this.fallbacks.push({ key: slot.key, siteId: slot.site.id, slug: slot.slug, root, band: 'hidden' });
          this.group.add(root);
        }
        continue;
      }
      const root = template.template.clone(true);
      root.name = `kiln-bird-${template.slug}-${slot.site.id}-${slot.index}`;
      root.userData.kilnAssetSlug = template.slug;
      root.userData.kilnBirdKind = template.kind;
      root.userData.kilnBirdSkinFit = template.fit;
      root.traverse((child) => {
        child.userData.kilnAssetSlug = template.slug;
        child.userData.kilnBirdKind = template.kind;
      });
      const mixer = new THREE.AnimationMixer(root);
      const clips = new Map(template.clips.map((clip) => [clip.name, clip]));
      this.anchors.push({
        key: slot.key,
        siteId: slot.site.id,
        slug: slot.slug,
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

  private siteFrame(site: SkyLifeSite, geo: Goldberg, layers: Layers, columns: Columns, camWorld: { x: number; y: number; z: number }, seconds: number): SiteFrame {
    const tile = Math.max(0, Math.min(geo.count - 1, Math.trunc(site.tile)));
    const c = geo.centers;
    const frame = geo.frameOf(tile);
    const ground = layers.topRadius(columns.groundLayerBelow(tile, layers.bounds[0]));
    const bob = Math.sin(seconds * 0.33 + site.id * 0.011) * 0.5;
    const radius = Math.max(ground + altitudeFor(site.kind, site.intensity) + bob, WATER_SURFACE + 4.5);
    const base = new THREE.Vector3(
      c[tile * 3] * radius - camWorld.x,
      c[tile * 3 + 1] * radius - camWorld.y,
      c[tile * 3 + 2] * radius - camWorld.z,
    );
    return {
      base,
      up: new THREE.Vector3(...frame.normal).normalize(),
      east: new THREE.Vector3(...frame.east).normalize(),
      north: new THREE.Vector3(...frame.north).normalize(),
      distance: base.length(),
    };
  }

  private updatePoints(sites: readonly SkyLifeSite[], frames: Map<number, SiteFrame>, seconds: number): void {
    let count = 0;
    for (const site of sites) {
      const frame = frames.get(site.id);
      if (!frame || frame.distance > BIRD_FROZEN_MIXER_RADIUS || count >= MAX_POINT_BIRDS) continue;
      const total = Math.min(pointCountFor(site.kind, site.intensity), MAX_POINT_BIRDS - count);
      const spread = spreadFor(site.kind, site.intensity);
      for (let i = 0; i < total; i += 1) {
        const phase = site.id * 0.013 + i * 2.17 + seconds * (0.18 + (i % 4) * 0.025);
        const orbit = spread * (0.32 + (i % 7) * 0.1);
        const vertical = Math.sin(seconds * 0.9 + i * 0.73 + site.id * 0.019) * (0.5 + site.intensity * 0.7);
        const pos = frame.base.clone()
          .addScaledVector(frame.east, Math.cos(phase) * orbit)
          .addScaledVector(frame.north, Math.sin(phase * 1.13) * orbit * 0.72)
          .addScaledVector(frame.up, vertical);
        this.pointPositions[count * 3] = pos.x;
        this.pointPositions[count * 3 + 1] = pos.y;
        this.pointPositions[count * 3 + 2] = pos.z;
        count += 1;
      }
    }
    this.pointBirdCount = count;
    this.pointsGeometry.setDrawRange(0, count);
    this.pointsGeometry.attributes.position.needsUpdate = true;
    this.points.visible = count > 0;
  }

  private updateAnchorAnimation(record: BirdAnchorRecord, site: SkyLifeSite, distance: number, seconds: number): void {
    const desiredBand = bandForDistance(distance);
    record.band = desiredBand;
    record.root.visible = desiredBand !== 'hidden';
    const desired = desiredClipFor(site);
    const clip = record.clips.get(desired)
      ?? record.clips.get('glide')
      ?? record.clips.get('flap')
      ?? record.clips.get('turn')
      ?? record.clips.get('idle')
      ?? [...record.clips.values()][0];
    if (!clip) return;
    let action = record.actions.get(clip.name);
    if (!action) {
      action = record.mixer.clipAction(clip);
      record.actions.set(clip.name, action);
    }
    if (record.currentClip !== clip.name) {
      if (record.currentClip) record.actions.get(record.currentClip)?.fadeOut(0.14);
      action.reset().fadeIn(0.14).play();
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

  private placeBird(root: THREE.Object3D, site: SkyLifeSite, frame: SiteFrame, seconds: number, indexSalt: number): void {
    const phase = site.id * 0.017 + indexSalt * 1.91 + seconds * (site.kind === 'storm' ? 0.78 : 0.42);
    const spread = spreadFor(site.kind, site.intensity);
    const radial = frame.east.clone().multiplyScalar(Math.cos(phase))
      .addScaledVector(frame.north, Math.sin(phase));
    const tangent = frame.east.clone().multiplyScalar(-Math.sin(phase))
      .addScaledVector(frame.north, Math.cos(phase));
    root.position.copy(frame.base)
      .addScaledVector(radial, spread * (0.22 + indexSalt * 0.11))
      .addScaledVector(frame.up, Math.sin(seconds * 1.2 + indexSalt) * 0.35);
    root.setRotationFromMatrix(orientationFrom(frame.up, tangent));
    const scale = 1 + site.intensity * 0.08 + indexSalt * 0.05;
    root.scale.setScalar(scale);
  }

  update(
    sites: readonly SkyLifeSite[],
    geo: Goldberg,
    layers: Layers,
    columns: Columns,
    camWorld: { x: number; y: number; z: number },
    seconds: number,
  ): void {
    this.currentSites.clear();
    const activeSites = sites.slice(0, 4);
    for (const site of activeSites) {
      this.currentSites.set(site.id, site);
      this.ensureSkin(kilnBirdSkinForSite(site));
    }
    this.rebuildBirds(activeSites);
    const frames = new Map<number, SiteFrame>();
    this.visibleSiteCount = 0;
    for (const site of activeSites) {
      const frame = this.siteFrame(site, geo, layers, columns, camWorld, seconds);
      frames.set(site.id, frame);
      if (frame.distance <= BIRD_FROZEN_MIXER_RADIUS) this.visibleSiteCount += 1;
    }
    this.updatePoints(activeSites, frames, seconds);
    for (let i = 0; i < this.anchors.length; i += 1) {
      const record = this.anchors[i];
      const site = this.currentSites.get(record.siteId);
      const frame = site ? frames.get(site.id) : undefined;
      if (!site || !frame) {
        record.band = 'hidden';
        record.root.visible = false;
        continue;
      }
      this.placeBird(record.root, site, frame, seconds, i % 3);
      this.updateAnchorAnimation(record, site, frame.distance, seconds);
    }
    for (let i = 0; i < this.fallbacks.length; i += 1) {
      const record = this.fallbacks[i];
      const site = this.currentSites.get(record.siteId);
      const frame = site ? frames.get(site.id) : undefined;
      if (!site || !frame) {
        record.band = 'hidden';
        record.root.visible = false;
        continue;
      }
      record.band = bandForDistance(frame.distance);
      record.root.visible = record.band !== 'hidden';
      this.placeBird(record.root, site, frame, seconds, i % 3);
      record.root.children.forEach((child, childIndex) => {
        child.rotation.z += Math.sin(seconds * 4.5 + childIndex) * 0.01;
      });
    }
    this.group.visible = this.visibleSiteCount > 0 || this.anchors.some((record) => record.root.visible) || this.fallbacks.some((record) => record.root.visible);
  }

  stats(): {
    active: number;
    sites: number;
    visibleSites: number;
    slugs: readonly KilnBirdSkinSlug[];
    kinds: readonly SkyLifeKind[];
    labels: readonly string[];
    pointFlockSprites: number;
    glbBirds: number;
    glbBirdsVisible: number;
    fallbackVisible: number;
    activeMixers: number;
    lowRateMixers: number;
    frozenMixers: number;
    hiddenBirds: number;
    activeMixerRadius: number;
    lowRateMixerRadius: number;
    frozenMixerRadius: number;
    kilnBirdSkinsLoaded: number;
    kilnBirdSkinsPending: number;
    kilnBirdSkinFallbacks: number;
    kilnBirdSkinsBySlug: Partial<Record<KilnBirdSkinSlug, {
      loaded: number;
      pending: number;
      fallback: number;
      clips: readonly string[];
      activeMixers: number;
      lowRateMixers: number;
      frozenMixers: number;
      hidden: number;
      visibleBirds: number;
    }>>;
    kilnBirdSkinFits: Partial<Record<KilnBirdSkinSlug, KilnBirdSkinFitSnapshot>>;
  } {
    const bySlug: Partial<Record<KilnBirdSkinSlug, {
      loaded: number;
      pending: number;
      fallback: number;
      clips: readonly string[];
      activeMixers: number;
      lowRateMixers: number;
      frozenMixers: number;
      hidden: number;
      visibleBirds: number;
    }>> = {};
    const fits: Partial<Record<KilnBirdSkinSlug, KilnBirdSkinFitSnapshot>> = {};
    let activeMixers = 0;
    let lowRateMixers = 0;
    let frozenMixers = 0;
    let hiddenBirds = 0;
    let visibleBirds = 0;
    for (const slug of KILN_BIRD_SKIN_SLUGS) {
      const status = this.skinStatus.get(slug);
      const template = this.skinTemplates.get(slug);
      const records = this.anchors.filter((record) => record.slug === slug);
      const fallbacks = this.fallbacks.filter((record) => record.slug === slug);
      const row = {
        loaded: template ? 1 : 0,
        pending: status === 'pending' ? 1 : 0,
        fallback: status === 'fallback' ? 1 : 0,
        clips: template?.clips.map((clip) => clip.name) ?? [],
        activeMixers: records.filter((record) => record.band === 'active').length,
        lowRateMixers: records.filter((record) => record.band === 'lowRate').length,
        frozenMixers: records.filter((record) => record.band === 'frozen').length,
        hidden: records.filter((record) => record.band === 'hidden').length + fallbacks.filter((record) => record.band === 'hidden').length,
        visibleBirds: records.filter((record) => record.root.visible).length + fallbacks.filter((record) => record.root.visible).length,
      };
      if (row.loaded || row.pending || row.fallback || records.length || fallbacks.length) bySlug[slug] = row;
      if (template) fits[slug] = template.fit;
      activeMixers += row.activeMixers;
      lowRateMixers += row.lowRateMixers;
      frozenMixers += row.frozenMixers;
      hiddenBirds += row.hidden;
      visibleBirds += row.visibleBirds;
    }
    const siteList = [...this.currentSites.values()];
    return {
      active: this.group.visible ? 1 : 0,
      sites: siteList.length,
      visibleSites: this.visibleSiteCount,
      slugs: siteList.map(kilnBirdSkinForSite),
      kinds: siteList.map((site) => site.kind),
      labels: siteList.map((site) => site.label),
      pointFlockSprites: this.points.visible ? this.pointBirdCount : 0,
      glbBirds: this.anchors.length,
      glbBirdsVisible: this.anchors.filter((record) => record.root.visible).length,
      fallbackVisible: this.fallbacks.filter((record) => record.root.visible).length,
      activeMixers,
      lowRateMixers,
      frozenMixers,
      hiddenBirds,
      activeMixerRadius: BIRD_ACTIVE_MIXER_RADIUS,
      lowRateMixerRadius: BIRD_LOW_RATE_MIXER_RADIUS,
      frozenMixerRadius: BIRD_FROZEN_MIXER_RADIUS,
      kilnBirdSkinsLoaded: [...this.skinTemplates.keys()].length,
      kilnBirdSkinsPending: [...this.skinStatus.values()].filter((status) => status === 'pending').length,
      kilnBirdSkinFallbacks: [...this.skinStatus.values()].filter((status) => status === 'fallback').length,
      kilnBirdSkinsBySlug: bySlug,
      kilnBirdSkinFits: fits,
    };
  }
}
