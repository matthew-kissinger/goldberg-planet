import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { FishSchoolReport } from '../sim/fishing';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import { WATER_SURFACE } from '../world/layers';
import { makeSurfaceBasisFromYaw } from './surfaceFrame';

export interface FishSchoolVisualSite {
  id: number;
  tile: number;
  school: FishSchoolReport;
}

// This slug set used to select which Kiln GLB body to load per fish-school kind. The
// runtime Kiln loader is gone (game ships plain three.js geometry only — see the
// controlled-burn step 14 plan), but the slug still usefully tags which fallback
// color/motion style a school renders with, so it stays local to this renderer.
export type KilnFishSkinSlug =
  | 'fish-shore-minnow'
  | 'fish-storm-runner'
  | 'fish-cave-shimmer'
  | 'creature-driftjelly'
  | 'fish-reed-fry';

type FishMotionBand = 'nearBoids' | 'frozenCloud' | 'hidden';

// Distance bands for the plain-geometry point-sprite school: inside NEAR_BOIDS the sprites
// animate as a swimming boid cluster with a visible swim path; beyond that (out to VISIBLE)
// they freeze in place as a static cloud; beyond VISIBLE the whole school is hidden.
const FISH_NEAR_BOIDS_RADIUS = 110;
const FISH_VISIBLE_RADIUS = 230;

const MAX_POINT_SPRITES = 32;
const MAX_SWIM_PATH_BEADS = 14;
const FISH_MOTION_POLICY = 'point-school-near-boids-freeze-far' as const;

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
  private readonly swimPathPositions = new Float32Array(MAX_SWIM_PATH_BEADS * 3);
  private readonly pointsGeometry = new THREE.BufferGeometry();
  private readonly swimPathGeometry = new THREE.BufferGeometry();
  private readonly pointsMaterial = new THREE.PointsMaterial({
    color: 0x8bb7c8,
    size: 0.13,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  private readonly swimPathMaterial = new THREE.PointsMaterial({
    color: 0x8bb7c8,
    size: 0.22,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.66,
    depthWrite: false,
  });
  private readonly points: THREE.Points;
  private readonly swimPath: THREE.Points;
  private currentSite: FishSchoolVisualSite | null = null;
  private visibleSlug: KilnFishSkinSlug | null = null;
  private pointSpriteCount = 0;
  private nearBoidSpriteCount = 0;
  private swimPathBeadCount = 0;
  private motionBand: FishMotionBand = 'hidden';
  private swimPathLength = 0;
  private schoolSpread = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'fish-school-visuals';
    this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(this.pointPositions, 3));
    this.pointsGeometry.setDrawRange(0, 0);
    this.swimPathGeometry.setAttribute('position', new THREE.BufferAttribute(this.swimPathPositions, 3));
    this.swimPathGeometry.setDrawRange(0, 0);
    this.swimPath = new THREE.Points(this.swimPathGeometry, this.swimPathMaterial);
    this.swimPath.name = 'fish-school-swim-path-beads';
    this.swimPath.frustumCulled = false;
    this.swimPath.visible = false;
    this.points = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
    this.points.name = 'fish-school-point-sprites';
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.group.add(this.swimPath, this.fallback, this.points);
    this.group.visible = false;
    scene.add(this.group);
  }

  setSchool(site: FishSchoolVisualSite | null): void {
    this.currentSite = site && site.school.kind !== 'none' && site.school.catchCount > 0 ? site : null;
    if (!this.currentSite) {
      this.group.visible = false;
      this.points.visible = false;
      this.swimPath.visible = false;
      this.fallback.visible = false;
      this.pointSpriteCount = 0;
      this.nearBoidSpriteCount = 0;
      this.swimPathBeadCount = 0;
      this.motionBand = 'hidden';
      return;
    }
    const slug = kilnFishSkinForSchool(this.currentSite.school);
    this.visibleSlug = slug;
    if (!slug) {
      this.group.visible = false;
      return;
    }
    this.pointsMaterial.color.setHex(schoolColor(slug));
    this.swimPathMaterial.color.setHex(schoolColor(slug));
    this.updateFallbackColor(slug);
    this.fallback.visible = true;
  }

  /** Recolors the shared plain-geometry fallback body so each fish-school kind still reads
   * as visually distinct (there is no other visual for fish schools). */
  private updateFallbackColor(slug: KilnFishSkinSlug): void {
    const bodyColor = schoolColor(slug);
    const tailColor = new THREE.Color(bodyColor).multiplyScalar(0.68).getHex();
    const body = this.fallback.getObjectByName('fallbackFishBody') as THREE.Mesh | null;
    const tail = this.fallback.getObjectByName('fallbackFishTail') as THREE.Mesh | null;
    if (body) {
      const material = body.material as THREE.MeshStandardMaterial;
      material.color.setHex(bodyColor);
      material.emissive.setHex(bodyColor);
    }
    if (tail) {
      const material = tail.material as THREE.MeshStandardMaterial;
      material.color.setHex(tailColor);
      material.emissive.setHex(tailColor);
    }
  }

  private updateSwimPath(site: FishSchoolVisualSite, flowSeconds: number, pathLength: number, spread: number, visible: boolean): void {
    if (!visible) {
      this.swimPathGeometry.setDrawRange(0, 0);
      this.swimPath.visible = false;
      this.swimPathBeadCount = 0;
      return;
    }
    const count = MAX_SWIM_PATH_BEADS;
    this.swimPathBeadCount = count;
    for (let i = 0; i < count; i += 1) {
      const t = count > 1 ? i / (count - 1) : 0.5;
      const phase = site.id * 0.018 + i * 0.57 + flowSeconds * 0.82;
      this.swimPathPositions[i * 3] = Math.sin(phase) * spread * 0.18;
      this.swimPathPositions[i * 3 + 1] = 0.04 + Math.cos(phase * 1.3) * 0.022;
      this.swimPathPositions[i * 3 + 2] = (t - 0.5) * pathLength;
    }
    this.swimPathGeometry.setDrawRange(0, count);
    this.swimPathGeometry.attributes.position.needsUpdate = true;
    this.swimPath.visible = true;
  }

  private updatePoints(site: FishSchoolVisualSite, slug: KilnFishSkinSlug, seconds: number, distance: number): void {
    const strength = Math.max(0, Math.min(1, site.school.strength));
    const count = Math.max(8, Math.min(MAX_POINT_SPRITES, 8 + Math.trunc(site.school.catchCount * 5 + strength * 10)));
    const nearBoids = distance <= FISH_NEAR_BOIDS_RADIUS;
    const flowSeconds = nearBoids ? seconds : 0;
    const drift = slug === 'creature-driftjelly';
    const pathLength = (drift ? 0.42 : 0.64) + strength * (drift ? 0.28 : 0.46) + Math.min(0.28, site.school.catchCount * 0.045);
    const spread = (drift ? 0.2 : 0.16) + strength * 0.18 + Math.min(0.12, site.school.catchCount * 0.018);
    const schoolTurn = Math.sin(flowSeconds * 0.41 + site.id * 0.017) * (nearBoids ? 0.18 : 0);
    this.swimPathLength = pathLength;
    this.schoolSpread = spread;
    this.motionBand = nearBoids ? 'nearBoids' : 'frozenCloud';
    this.nearBoidSpriteCount = nearBoids ? count : 0;
    this.pointSpriteCount = count;
    this.updateSwimPath(site, flowSeconds, pathLength, spread, nearBoids);
    for (let i = 0; i < count; i += 1) {
      const lane = (i % 7) - 3;
      const row = Math.floor(i / 7);
      const t = count > 1 ? i / (count - 1) : 0.5;
      const phase = site.id * 0.021 + i * 1.713 + flowSeconds * (0.72 + strength * 0.34 + (i % 5) * 0.018);
      const laneOffset = lane * spread * 0.2;
      const separation = Math.sin(phase * 1.43) * spread * 0.08;
      const cohesion = Math.cos(flowSeconds * 0.27 + row * 0.83 + site.id * 0.007) * spread * 0.09;
      const vertical = drift
        ? Math.sin(phase * 1.12 + row) * (0.04 + strength * 0.04)
        : Math.sin(phase * 1.7 + i * 0.17) * (0.035 + strength * 0.03);
      this.pointPositions[i * 3] = laneOffset + separation + cohesion;
      this.pointPositions[i * 3 + 1] = 0.02 + vertical + row * 0.004;
      this.pointPositions[i * 3 + 2] = (t - 0.5) * pathLength + Math.cos(phase) * spread * 0.18 + lane * schoolTurn * 0.035;
    }
    this.pointsGeometry.setDrawRange(0, count);
    this.pointsGeometry.attributes.position.needsUpdate = true;
    this.points.visible = true;
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
    const swimBob = Math.sin(seconds * 1.45 + this.currentSite.id * 0.17) * 0.035;
    const radius = WATER_SURFACE + 0.08 + swimBob;
    this.group.position.set(
      c[tile * 3] * radius - camWorld.x,
      c[tile * 3 + 1] * radius - camWorld.y,
      c[tile * 3 + 2] * radius - camWorld.z,
    );
    const distance = this.group.position.length();
    const active = distance <= FISH_VISIBLE_RADIUS;
    this.group.visible = active;
    if (!active) {
      this.points.visible = false;
      this.swimPath.visible = false;
      this.fallback.visible = false;
      this.group.scale.setScalar(1);
      this.pointSpriteCount = 0;
      this.nearBoidSpriteCount = 0;
      this.swimPathBeadCount = 0;
      this.motionBand = 'hidden';
      return;
    }
    const nearBoids = distance <= FISH_NEAR_BOIDS_RADIUS;
    const flowSeconds = nearBoids ? seconds : 0;
    this.group.scale.setScalar(nearBoids ? 1.55 : 1);
    const yaw = this.currentSite.id * 0.013 + flowSeconds * 0.18;
    const vX = new THREE.Vector3();
    const vY = new THREE.Vector3();
    const vZ = new THREE.Vector3();
    this.group.setRotationFromMatrix(makeSurfaceBasisFromYaw(frame, yaw, new THREE.Matrix4(), vX, vY, vZ));
    this.updatePoints(this.currentSite, this.visibleSlug, seconds, distance);
    this.fallback.position.set(0, 0.04, Math.sin(flowSeconds * 1.3) * 0.08);
    this.fallback.rotation.y = Math.sin(flowSeconds * 2.1) * 0.26;
    this.fallback.scale.setScalar(1 + Math.sin(flowSeconds * 2.7) * 0.03);
  }

  stats(): {
    active: number;
    slug: KilnFishSkinSlug | null;
    schoolKind: string;
    label: string;
    motionPolicy: typeof FISH_MOTION_POLICY;
    motionBand: FishMotionBand;
    pointSchoolSprites: number;
    nearBoidSprites: number;
    swimPathVisible: number;
    swimPathBeads: number;
    swimPathLength: number;
    schoolSpread: number;
    fallbackVisible: number;
    nearBoidsRadius: number;
    visibleRadius: number;
  } {
    return {
      active: this.group.visible ? 1 : 0,
      slug: this.visibleSlug,
      schoolKind: this.currentSite?.school.kind ?? 'none',
      label: this.currentSite?.school.label ?? '',
      motionPolicy: FISH_MOTION_POLICY,
      motionBand: this.motionBand,
      pointSchoolSprites: this.points.visible ? this.pointSpriteCount : 0,
      nearBoidSprites: this.nearBoidSpriteCount,
      swimPathVisible: this.swimPath.visible ? 1 : 0,
      swimPathBeads: this.swimPath.visible ? this.swimPathBeadCount : 0,
      swimPathLength: this.points.visible ? this.swimPathLength : 0,
      schoolSpread: this.points.visible ? this.schoolSpread : 0,
      fallbackVisible: this.fallback.visible ? 1 : 0,
      nearBoidsRadius: FISH_NEAR_BOIDS_RADIUS,
      visibleRadius: FISH_VISIBLE_RADIUS,
    };
  }
}
