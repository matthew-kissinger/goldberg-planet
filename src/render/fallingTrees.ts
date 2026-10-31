/**
 * Whole-Tree Felling Physics & Animation Renderer (`FallingTreeRenderer`).
 *
 * When a tree is chopped (`trees.strike(tile)` returns `felled: true`), the chunk mesher
 * removes the static tree geometry and `FallingTreeRenderer.spawnFelledTree(...)` spawns
 * an animated 3D tree at the exact base hinge (`Y = 0` on the hex surface).
 *
 * Physics curve:
 *  - Accelerates under gravity from `0°` to `88°` around the tangent axis perpendicular
 *    to the chop direction (`0.0 s -> 0.88 s`).
 *  - Hits the ground at `t = 0.88 s` with a slight damped bounce (`88° -> 82° -> 88°`)
 *    and bursts into harvestable wood logs (`0.88 s -> 1.15 s`).
 */

import * as THREE from 'three/webgpu';
import { treeTangentFrame, type TreeParams } from '../world/trees';
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
}

const frameScratch = new Float64Array(6);

export class FallingTreeRenderer {
  readonly group = new THREE.Group();
  readonly active: ActiveFallingTree[] = [];

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
    const fl = Math.hypot(fdx, fdy, fdz) || 1;
    fdx /= fl; fdy /= fl; fdz /= fl;

    const axisX = uy * fdz - uz * fdy;
    const axisY = uz * fdx - ux * fdz;
    const axisZ = ux * fdy - uy * fdx;

    const kind = params.kind ?? 'conifer';
    const trunkBase =
      kind === 'cactus'
        ? CACTUS_COLOR
        : kind === 'fungal'
          ? FUNGAL_STEM_COLOR
          : kind === 'crystal_spire'
            ? CRYSTAL_FLORA_COLOR
            : TRUNK_COLOR;
    const canopyBase =
      kind === 'broadleaf'
        ? BROADLEAF_COLOR
        : kind === 'cactus'
          ? CACTUS_COLOR
          : kind === 'fungal'
            ? FUNGAL_CAP_COLOR
            : kind === 'crystal_spire'
              ? CRYSTAL_FLORA_COLOR
              : LEAF_COLOR;

    const trunkColor = new THREE.Color(
      Math.min(1, trunkBase[0] * params.tint),
      Math.min(1, trunkBase[1] * params.tint),
      Math.min(1, trunkBase[2] * params.tint),
    );
    const canopyColor = new THREE.Color(
      Math.min(1, canopyBase[0] * (0.75 + params.tint * 0.35)),
      Math.min(1, canopyBase[1] * (0.75 + params.tint * 0.35)),
      Math.min(1, canopyBase[2] * (0.75 + params.tint * 0.35)),
    );

    const trunkMat = new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 0.85, metalness: 0.04 });
    const cutWoodMat = new THREE.MeshStandardMaterial({ color: 0xd8a868, roughness: 0.75, metalness: 0.02 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: canopyColor, roughness: 0.78, metalness: 0.05 });

    // 1. Cut Stump left on the ground during the fall
    const stumpGroup = new THREE.Group();
    const stumpH = 0.36;
    const stumpMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(params.girth * 0.96, params.girth * 1.12, stumpH, 6),
      trunkMat,
    );
    stumpMesh.position.y = stumpH * 0.5;
    const stumpTop = new THREE.Mesh(
      new THREE.CylinderGeometry(params.girth * 0.9, params.girth * 0.9, 0.04, 6),
      cutWoodMat,
    );
    stumpTop.position.y = stumpH + 0.01;
    stumpGroup.add(stumpMesh, stumpTop);

    // 2. Hinged Upper Tree Group (pivots around Y = stumpH)
    const meshGroup = new THREE.Group();
    const upperTrunkH = Math.max(0.8, params.trunk - stumpH);
    const trunkMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(params.girth * 0.82, params.girth * 0.98, upperTrunkH, 6),
      trunkMat,
    );
    trunkMesh.position.y = upperTrunkH * 0.5;
    meshGroup.add(trunkMesh);

    const ringR =
      kind === 'cactus'
        ? params.spread * 0.45
        : kind === 'fungal'
          ? params.spread * 1.35
          : kind === 'crystal_spire'
            ? params.spread * 0.65
            : params.spread;
    const canopyH =
      kind === 'fungal'
        ? params.canopy * 0.42
        : kind === 'cactus'
          ? params.canopy * 0.5
          : params.canopy;
    const canopyMesh = new THREE.Mesh(
      new THREE.ConeGeometry(ringR, canopyH, 6),
      canopyMat,
    );
    canopyMesh.position.y = upperTrunkH + canopyH * 0.45;
    meshGroup.add(canopyMesh);

    // Orient initial local +Y along surface normal `u` with a strict right-handed basis (det = +1)
    const upVec = new THREE.Vector3(ux, uy, uz).normalize();
    const t2Vec = new THREE.Vector3(t2x, t2y, t2z).normalize();
    const rightVec = new THREE.Vector3().crossVectors(upVec, t2Vec).normalize();
    t2Vec.crossVectors(rightVec, upVec).normalize();
    const basis = new THREE.Matrix4().makeBasis(rightVec, upVec, t2Vec);
    stumpGroup.quaternion.setFromRotationMatrix(basis);
    meshGroup.quaternion.setFromRotationMatrix(basis);

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
    });
  }

  /**
   * Step all falling trees and position them relative to the floating-origin camera `(camX, camY, camZ)`.
   */
  update(dt: number, camX: number, camY: number, camZ: number): void {
    if (this.active.length === 0) return;

    const upVec = new THREE.Vector3();
    const rightVec = new THREE.Vector3();
    const t2Vec = new THREE.Vector3();
    const axisVec = new THREE.Vector3();
    const baseQuat = new THREE.Quaternion();
    const tiltQuat = new THREE.Quaternion();
    const basisMat = new THREE.Matrix4();

    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i]!;
      item.ageSec += dt;
      if (item.ageSec >= item.durationSec) {
        this.group.remove(item.meshGroup, item.stumpGroup);
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

      treeTangentFrame(item.ux, item.uy, item.uz, frameScratch);
      upVec.set(item.ux, item.uy, item.uz).normalize();
      t2Vec.set(frameScratch[3], frameScratch[4], frameScratch[5]).normalize();
      rightVec.crossVectors(upVec, t2Vec).normalize();
      t2Vec.crossVectors(rightVec, upVec).normalize();
      basisMat.makeBasis(rightVec, upVec, t2Vec);
      baseQuat.setFromRotationMatrix(basisMat);

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
