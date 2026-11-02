/** Whole-tree felling keeps the authored canopy and releases transient merged geometry. */
import * as THREE from 'three/webgpu';
import { treeTangentFrame, type TreeParams } from '../world/trees';
import { HABITAT_FORWARD, habitatDirection } from '../world/expeditionHabitat';
import { GeometryKit } from './campKit';
import { bakeAureliaTree, treeCutColor } from './vegetationKit';
import {
  BROADLEAF_COLOR,
  CACTUS_COLOR,
  CRYSTAL_FLORA_COLOR,
  FUNGAL_CAP_COLOR,
  FUNGAL_STEM_COLOR,
  LEAF_COLOR,
  TRUNK_COLOR,
} from './palette';

export interface ActiveFallingTree {
  tile: number;
  bx: number;
  by: number;
  bz: number;
  ux: number;
  uy: number;
  uz: number;
  fallAxisX: number;
  fallAxisY: number;
  fallAxisZ: number;
  ageSec: number;
  durationSec: number;
  meshGroup: THREE.Group;
  stumpGroup: THREE.Group;
  baseQuaternion: THREE.Quaternion;
}

const frameScratch = new Float64Array(6);

export class FallingTreeRenderer {
  readonly group = new THREE.Group();
  readonly active: ActiveFallingTree[] = [];
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'fallingTrees';
    scene.add(this.group);
  }

  /**
   * Spawn an animated falling tree (plus a temporary cut stump) at `tile` when felled.
   */
  spawn(
    tile: number,
    ux: number,
    uy: number,
    uz: number,
    rG: number,
    params: TreeParams,
    fallDirX?: number,
    fallDirY?: number,
    fallDirZ?: number,
  ): void {
    if (params.habitat) {
      [ux, uy, uz] = habitatDirection(params.habitat.x, params.habitat.z, params.planetRadius ?? rG);
      rG += 0.025;
    }
    treeTangentFrame(ux, uy, uz, frameScratch);
    const t1x = frameScratch[0], t1y = frameScratch[1], t1z = frameScratch[2];
    const t2x = frameScratch[3], t2y = frameScratch[4], t2z = frameScratch[5];

    const bx = ux * rG + t1x * params.offA + t2x * params.offB;
    const by = uy * rG + t1y * params.offA + t2y * params.offB;
    const bz = uz * rG + t1z * params.offA + t2z * params.offB;

    // Hinge rotation axis = cross(up, fallDirection)
    let fdx = fallDirX ?? t1x;
    let fdy = fallDirY ?? t1y;
    let fdz = fallDirZ ?? t1z;
    // Project onto tangent plane
    const dotU = fdx * ux + fdy * uy + fdz * uz;
    fdx -= dotU * ux;
    fdy -= dotU * uy;
    fdz -= dotU * uz;
    const fl = Math.hypot(fdx, fdy, fdz);
    if (fl < 1e-8) { fdx = t1x; fdy = t1y; fdz = t1z; }
    else { fdx /= fl; fdy /= fl; fdz /= fl; }

    const axisX = uy * fdz - uz * fdy;
    const axisY = uz * fdx - ux * fdz;
    const axisZ = ux * fdy - uy * fdx;

    const stumpH = 0.36;
    const stumpGroup = new THREE.Group(), meshGroup = new THREE.Group();
    const stump = new GeometryKit(), upper = new GeometryKit();
    const kind = params.kind ?? 'conifer';
    const broadleaf = kind === 'broadleaf';
    const trunkBase = kind === 'cactus' ? CACTUS_COLOR : kind === 'fungal' || kind === 'spore_bulb' ? FUNGAL_STEM_COLOR : kind === 'crystal_spire' || kind === 'ice_willow' ? CRYSTAL_FLORA_COLOR : TRUNK_COLOR;
    const canopyBase = broadleaf ? BROADLEAF_COLOR : kind === 'cactus' ? CACTUS_COLOR : kind === 'fungal' || kind === 'spore_bulb' ? FUNGAL_CAP_COLOR : kind === 'crystal_spire' || kind === 'ice_willow' ? CRYSTAL_FLORA_COLOR : LEAF_COLOR;
    const trunkColor = params.aurelia || params.growth
      ? new THREE.Color(treeCutColor(params)).multiplyScalar(params.tint)
      : params.habitat ? new THREE.Color(0x665446) : new THREE.Color(...trunkBase).multiplyScalar(params.tint);
    const canopyColor = new THREE.Color(...canopyBase).multiplyScalar(0.75 + params.tint * 0.35);
    stump.cylinder(trunkColor, [0, stumpH * 0.5, 0], params.girth, params.girth * 1.08, stumpH, 7);
    stump.cylinder(params.growth ? trunkColor.clone().multiplyScalar(1.2) : 0xc4a77b, [0, stumpH + 0.006, 0], params.girth * 0.92, params.girth * 0.92, 0.012, 7);

    if (params.aurelia || params.growth) {
      // Shared kit is baked below, preserving every living branch and crown.
    } else if (broadleaf) {
      const sx = params.spread / 5.3, sy = (params.trunk + params.canopy) / 8;
      const point = (x: number, y: number, z: number): [number, number, number] => [x * sx, y * sy, z * sx];
      const width = params.girth / 0.48;
      upper.beam(trunkColor, [0, stumpH, 0], point(0.15, 2.5, 0.1), 0.51 * width);
      upper.beam(trunkColor, point(0.15, 2.3, 0.1), point(0.45, 4.3, -0.1), 0.36 * width);
      upper.beam(trunkColor, point(0.45, 4.1, -0.1), point(0.1, 5.7, 0.3), 0.24 * width);
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 0.4 + 0.2;
        upper.beam(trunkColor, point(0.25, 3.2 + (i % 2) * 0.4, 0), point(Math.cos(a) * 3.1, 5.1 + (i % 2) * 0.55, Math.sin(a) * 3.1), 0.17 * width);
      }
      const palette = params.habitat?.community === 'shore' ? [0x839d59, 0x96ac62, 0x6e914f] : [0x5e8650, 0x789a59, 0x8aa764];
      upper.crown(palette[1], point(0, 6.3, 0), [3.1 * sx, 1.5 * sy, 2.9 * sx], 1);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI * 0.25;
        upper.crown(palette[i % 3], point(Math.cos(a) * 2.9, 5.65 + (i % 3) * 0.35, Math.sin(a) * 2.8), [2.25 * sx, (1.05 + (i % 2) * 0.22) * sy, 2.1 * sx], 1);
      }
    } else if (kind === 'cactus') {
      upper.cylinder(trunkColor, [0, (stumpH + params.trunk + params.canopy * 0.55) * 0.5, 0], params.girth * 0.75, params.girth * 1.2, params.trunk + params.canopy * 0.55 - stumpH, 7);
      for (const side of [-1, 1]) {
        upper.beam(trunkColor, [0, params.trunk * 0.7, 0], [side * params.spread * 0.5, params.trunk * 0.85, 0], params.girth * 0.65);
        upper.beam(canopyColor, [side * params.spread * 0.5, params.trunk * 0.85, 0], [side * params.spread * 0.5, params.trunk + params.canopy * 0.3, 0], params.girth * 0.6);
      }
    } else if (kind === 'crystal_spire') {
      upper.cylinder(canopyColor, [0, (stumpH + params.trunk + params.canopy) * 0.5, 0], 0, params.spread * 0.6, params.trunk + params.canopy - stumpH, 5);
      for (const side of [-1, 1]) upper.cylinder(canopyColor.clone().multiplyScalar(0.8), [side * params.spread * 0.46, params.trunk * 0.8, 0], 0, params.spread * 0.3, params.trunk * 1.25, 5, [0, 0, side * -0.22]);
    } else {
      upper.cylinder(trunkColor, [0, (stumpH + params.trunk) * 0.5, 0], params.girth * 0.72, params.girth, Math.max(0.1, params.trunk - stumpH), 7);
      if (kind === 'fungal' || kind === 'spore_bulb') {
        upper.crown(canopyColor, [0, params.trunk + params.canopy * 0.17, 0], [params.spread * 1.3, params.canopy * 0.3, params.spread * 1.3], 1);
        upper.cylinder(0xdbd1b5, [0, params.trunk + 0.02, 0], params.spread * 0.92, params.spread * 0.92, 0.08, 9);
      } else if (kind === 'palm' || kind === 'weeping_willow' || kind === 'ice_willow') {
        for (let i = 0; i < 7; i++) {
          const a = i * Math.PI * 2 / 7;
          upper.add(new THREE.IcosahedronGeometry(1, 0), canopyColor, [Math.cos(a) * params.spread * 0.52, params.trunk + params.canopy * 0.2, Math.sin(a) * params.spread * 0.52], [params.spread * 0.67, params.canopy * 0.25, params.spread * 0.23], [0, -a, -0.15]);
        }
      } else {
        for (let i = 0; i < 3; i++) upper.cylinder(canopyColor.clone().multiplyScalar(0.86 + i * 0.08), [0, params.trunk + params.canopy * (0.12 + i * 0.28), 0], 0.08, params.spread * (1 - i * 0.25), params.canopy * 0.63, 8);
      }
    }
    const stumpGeometry = stump.finish(), upperGeometry = params.aurelia || params.growth ? bakeAureliaTree(params, stumpH) : upper.finish();
    if (!params.aurelia && !params.growth) upperGeometry.translate(0, -stumpH, 0);
    upperGeometry.computeBoundingSphere();
    const stumpMesh = new THREE.Mesh(stumpGeometry, this.material), treeMesh = new THREE.Mesh(upperGeometry, this.material);
    stumpMesh.castShadow = treeMesh.castShadow = true;
    stumpMesh.receiveShadow = treeMesh.receiveShadow = true;
    stumpGroup.add(stumpMesh); meshGroup.add(treeMesh);

    // Preserve the exact habitat heading; generic trees use the shared tree tangent frame.
    const upVec = new THREE.Vector3(ux, uy, uz).normalize();
    const forward = params.habitat ? new THREE.Vector3(...HABITAT_FORWARD) : new THREE.Vector3(t2x, t2y, t2z);
    forward.addScaledVector(upVec, -forward.dot(upVec)).normalize();
    const right = new THREE.Vector3().crossVectors(upVec, forward).normalize();
    forward.crossVectors(right, upVec).normalize();
    const baseQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upVec, forward));
    if (params.habitat) baseQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), params.habitat.yaw));
    stumpGroup.quaternion.copy(baseQuaternion); meshGroup.quaternion.copy(baseQuaternion);

    this.group.add(stumpGroup, meshGroup);
    this.active.push({
      tile,
      bx,
      by,
      bz,
      ux,
      uy,
      uz,
      fallAxisX: axisX,
      fallAxisY: axisY,
      fallAxisZ: axisZ,
      ageSec: 0,
      durationSec: 2.2,
      meshGroup,
      stumpGroup,
      baseQuaternion,
    });
  }

  private release(item: ActiveFallingTree): void {
    this.group.remove(item.meshGroup, item.stumpGroup);
    for (const root of [item.meshGroup, item.stumpGroup]) root.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) (node as THREE.Mesh).geometry.dispose();
    });
  }

  /** Also used on planet changes; a falling tree belongs to its original world. */
  clear(): void {
    for (const item of this.active) this.release(item);
    this.active.length = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear(); this.group.removeFromParent(); this.material.dispose();
  }

  /**
   * Step all falling trees and position them relative to the floating-origin camera `(camX, camY, camZ)`.
   */
  update(dt: number, camX: number, camY: number, camZ: number): void {
    if (this.active.length === 0) return;

    const axisVec = new THREE.Vector3();
    const baseQuat = new THREE.Quaternion();
    const tiltQuat = new THREE.Quaternion();

    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i]!;
      item.ageSec += dt;
      if (item.ageSec >= item.durationSec) {
        this.release(item);
        this.active.splice(i, 1);
        continue;
      }

      const p = item.ageSec / item.durationSec;
      // Gravity fall curve: accelerates quadratically up to p = 0.72 (88 deg), then slight ground bounce
      let angleRad = 0;
      const maxAngle = (88 * Math.PI) / 180;
      if (p < 0.72) {
        const norm = p / 0.72;
        angleRad = maxAngle * (0.18 * norm + 0.82 * norm * norm);
      } else {
        const post = (p - 0.72) / 0.28;
        const bounce = Math.sin(post * Math.PI) * 0.12 * (1 - post);
        angleRad = maxAngle - bounce;
        if (post > 0.65) {
          const shrink = Math.max(0.1, 1 - (post - 0.65) * 2.2);
          item.meshGroup.scale.setScalar(shrink);
        }
      }

      baseQuat.copy(item.baseQuaternion);

      axisVec.set(item.fallAxisX, item.fallAxisY, item.fallAxisZ).normalize();
      tiltQuat.setFromAxisAngle(axisVec, angleRad);

      item.stumpGroup.position.set(item.bx - camX, item.by - camY, item.bz - camZ);
      item.stumpGroup.quaternion.copy(baseQuat);

      const hingeOffset = 0.36;
      item.meshGroup.position.set(
        item.bx + item.ux * hingeOffset - camX,
        item.by + item.uy * hingeOffset - camY,
        item.bz + item.uz * hingeOffset - camZ,
      );
      item.meshGroup.quaternion.copy(baseQuat).premultiply(tiltQuat);
    }
  }
}
