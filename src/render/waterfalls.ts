/**
 * Gravity-Driven Downhill Rivers, Cliff Waterfalls & Sky-Island Cascades (`WaterfallRenderer`).
 *
 * Dynamically traces steepest-descent downhill hydrology (`tileA -> argmin_{nbr} height(nbr)`)
 * around the player's active region and renders:
 *  1. Flowing River Channels along downhill hex paths (`drop < 1.8 m`)
 *  2. Cascading Cliff Waterfalls + Foaming Plunge Pools where water drops down stepped hex cliffs (`drop >= 1.8 m`)
 *  3. Sky-Island Waterfalls pouring off the rims of Volumetric Floating Sky-Islands (`30–55 m` vertical drop!)
 */

import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import type { Player } from '../player/player';

interface HydroNode {
  tile: number;
  wx: number;
  wy: number;
  wz: number;
  mesh: THREE.Group;
  scrollParts: THREE.Mesh[];
  foamRing: THREE.Mesh | null;
}

export class WaterfallRenderer {
  readonly group = new THREE.Group();
  private readonly nodes = new Map<string, HydroNode>();
  private scanTimer = 0;
  private lastPlanetId = '';
  private timeAccum = 0;

  private readonly waterMat = new THREE.MeshStandardMaterial({
    color: 0x38d6f5,
    roughness: 0.18,
    metalness: 0.08,
    emissive: 0x0c7ca8,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.84,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  private readonly foamMat = new THREE.MeshStandardMaterial({
    color: 0xeafaff,
    roughness: 0.35,
    metalness: 0.02,
    emissive: 0x6ce5ff,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.88,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  constructor(scene: THREE.Scene) {
    this.group.name = 'planetaryHydrology';
    scene.add(this.group);
  }

  clear(): void {
    for (const node of this.nodes.values()) {
      this.group.remove(node.mesh);
    }
    this.nodes.clear();
  }

  private syncPalette(columns: Columns): void {
    const ocean = columns.terrain.config.ocean;
    if (ocean.kind === 'magma') {
      this.waterMat.color.setRGB(1.0, 0.42, 0.06);
      this.waterMat.emissive.setRGB(0.95, 0.25, 0.02);
      this.foamMat.color.setRGB(1.0, 0.85, 0.32);
      this.foamMat.emissive.setRGB(1.0, 0.55, 0.10);
    } else if (ocean.kind === 'biolagoon') {
      this.waterMat.color.setRGB(0.16, 0.94, 0.82);
      this.waterMat.emissive.setRGB(0.08, 0.68, 0.58);
      this.foamMat.color.setRGB(0.75, 1.0, 0.95);
      this.foamMat.emissive.setRGB(0.28, 0.95, 0.82);
    } else {
      this.waterMat.color.setRGB(0.22, 0.78, 0.94);
      this.waterMat.emissive.setRGB(0.06, 0.42, 0.62);
      this.foamMat.color.setRGB(0.92, 0.98, 1.0);
      this.foamMat.emissive.setRGB(0.38, 0.82, 0.96);
    }
  }

  /**
   * Build a 3D river/waterfall segment from `tileA` (`rA`) flowing downhill to `tileB` (`rB`).
   */
  private addRiverOrWaterfallSegment(
    key: string,
    geo: Goldberg,
    tileA: number,
    tileB: number,
    rA: number,
    rB: number,
    isSkyCascade = false,
  ): void {
    if (this.nodes.has(key)) return;

    const c = geo.centers;
    const ax = c[tileA * 3] * rA, ay = c[tileA * 3 + 1] * rA, az = c[tileA * 3 + 2] * rA;
    const ux = c[tileA * 3], uy = c[tileA * 3 + 1], uz = c[tileA * 3 + 2];

    const meshGroup = new THREE.Group();
    const scrollParts: THREE.Mesh[] = [];
    let foamRing: THREE.Mesh | null = null;

    // Tangent direction from A toward B
    let dx = c[tileB * 3] * rA - ax;
    let dy = c[tileB * 3 + 1] * rA - ay;
    let dz = c[tileB * 3 + 2] * rA - az;
    const dotU = dx * ux + dy * uy + dz * uz;
    dx -= dotU * ux; dy -= dotU * uy; dz -= dotU * uz;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;

    const upVec = new THREE.Vector3(ux, uy, uz);
    const fwdVec = new THREE.Vector3(dx, dy, dz);
    const rightVec = new THREE.Vector3().crossVectors(upVec, fwdVec).normalize();
    const basis = new THREE.Matrix4().makeBasis(rightVec, upVec, fwdVec);
    meshGroup.quaternion.setFromRotationMatrix(basis);

    const drop = Math.max(0, rA - rB);

    // 1. Horizontal stream channel across tileA toward tileB's edge (2.6m long)
    const stream = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.10, 2.75), this.waterMat);
    stream.position.set(0, 0.06, 1.25);
    meshGroup.add(stream);

    for (let i = 0; i < 2; i++) {
      const ripple = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.32), this.foamMat);
      ripple.position.set(0, 0.08, 0.4 + i * 1.1);
      meshGroup.add(ripple);
      scrollParts.push(ripple);
    }

    // 2. If there is a vertical drop (cliff step or sky-island edge), emit a cascading waterfall sheet!
    if (drop >= 1.2 || isSkyCascade) {
      const fallHeight = isSkyCascade ? Math.min(44, Math.max(18, drop)) : drop + 0.25;
      const fallSheet = new THREE.Mesh(
        new THREE.BoxGeometry(isSkyCascade ? 1.55 : 1.38, fallHeight, 0.24),
        this.waterMat,
      );
      fallSheet.position.set(0, -fallHeight * 0.5 + 0.05, 2.55);
      meshGroup.add(fallSheet);

      // Animated falling foam streaks down the waterfall face
      const streakCount = Math.min(5, Math.max(2, Math.floor(fallHeight / 3.5)));
      for (let s = 0; s < streakCount; s++) {
        const streak = new THREE.Mesh(
          new THREE.BoxGeometry(0.92, Math.min(2.2, fallHeight * 0.28), 0.28),
          this.foamMat,
        );
        streak.position.set(0, -(s / streakCount) * fallHeight, 2.56);
        streak.userData.fallHeight = fallHeight;
        streak.userData.phaseOffset = s / streakCount;
        meshGroup.add(streak);
        scrollParts.push(streak);
      }

      // Plunge pool foam ring at the bottom of the waterfall
      foamRing = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.35, 0.14, 8),
        this.foamMat,
      );
      foamRing.position.set(0, -fallHeight + 0.08, 2.65);
      meshGroup.add(foamRing);
    }

    this.group.add(meshGroup);
    this.nodes.set(key, {
      tile: tileA,
      wx: ax,
      wy: ay,
      wz: az,
      mesh: meshGroup,
      scrollParts,
      foamRing,
    });
  }

  /**
   * Scan nearby tiles around the player and trace gravity-driven downhill rivers & sky-island cascades.
   */
  private scanLocalHydrology(geo: Goldberg, layers: Layers, columns: Columns, player: Player): void {
    // Prune far-away river/waterfall nodes (> 135m)
    for (const [key, node] of this.nodes) {
      const d = Math.hypot(node.wx - player.px, node.wy - player.py, node.wz - player.pz);
      if (d > 135) {
        this.group.remove(node.mesh);
        this.nodes.delete(key);
      }
    }

    if (!columns.terrain.config.hasFlowingRivers && !columns.terrain.config.hasFloatingIslands) {
      return;
    }

    this.syncPalette(columns);

    // Gather tiles within BFS ring 1..8 around player.tile
    const seen = new Set<number>([player.tile]);
    let frontier = [player.tile];
    const localTiles: number[] = [player.tile];

    for (let ring = 1; ring <= 8; ring++) {
      const next: number[] = [];
      for (const t of frontier) {
        const deg = geo.degreeOf(t);
        for (let e = 0; e < deg; e++) {
          const n = geo.neighbor(t, e);
          if (seen.has(n)) continue;
          seen.add(n);
          next.push(n);
          localTiles.push(n);
        }
      }
      frontier = next;
    }

    // 1. Sky-Island Rim Waterfalls: pour off the outer edge of floating sky-islands!
    if (columns.terrain.config.hasFloatingIslands) {
      for (const t of localTiles) {
        if (t % 3 !== 0) continue;
        const sky = columns.skyIslandRange(t);
        if (!sky || !sky.isRim) continue;
        const deg = geo.degreeOf(t);
        for (let e = 0; e < deg; e++) {
          const n = geo.neighbor(t, e);
          if (!columns.skyIslandRange(n)) {
            const rSky = layers.topRadius(sky.topK);
            const rGround = Math.max(layers.topRadius(columns.topLayerOf(n)), layers.waterSurface);
            this.addRiverOrWaterfallSegment(`sky-${t}-${n}`, geo, t, n, rSky, rGround, true);
            break;
          }
        }
      }
    }

    // 2. Gravity-Driven Downhill Surface Rivers & Cliff Waterfalls:
    // Seed springs on elevated tiles (`h >= 7.5 m` and deterministic hash) and trace steepest descent!
    if (columns.terrain.config.hasFlowingRivers) {
      for (const seedTile of localTiles) {
        if ((seedTile * 2654435761 >>> 0) % 19 !== 0) continue;
        const h0 = columns.heightOf(seedTile);
        if (h0 < 7.5) continue;

        let cur = seedTile;
        for (let step = 0; step < 8; step++) {
          const curK = columns.topLayerOf(cur);
          const curR = layers.topRadius(curK);
          if (curR <= layers.waterSurface + 0.3) break;

          // Find steepest downhill neighbor (gravity pulls water to the lowest adjacent tile)
          let lowestNbr = -1;
          let lowestR = curR;
          const deg = geo.degreeOf(cur);
          for (let e = 0; e < deg; e++) {
            const n = geo.neighbor(cur, e);
            const nR = layers.topRadius(columns.topLayerOf(n));
            if (nR < lowestR - 0.01 || (nR <= lowestR && lowestNbr === -1 && n < cur)) {
              lowestR = nR;
              lowestNbr = n;
            }
          }

          if (lowestNbr === -1) break;
          this.addRiverOrWaterfallSegment(
            `river-${cur}-${lowestNbr}`,
            geo,
            cur,
            lowestNbr,
            curR,
            Math.max(lowestR, layers.waterSurface),
            false,
          );
          cur = lowestNbr;
        }
      }
    }
  }

  update(
    dt: number,
    geo: Goldberg,
    layers: Layers,
    columns: Columns,
    player: Player,
    camX: number,
    camY: number,
    camZ: number,
  ): void {
    const planetId = columns.terrain.config.id;
    if (planetId !== this.lastPlanetId) {
      this.clear();
      this.lastPlanetId = planetId;
      this.scanTimer = 0;
    }

    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 1.2;
      this.scanLocalHydrology(geo, layers, columns, player);
    }

    this.timeAccum += dt;

    for (const node of this.nodes.values()) {
      node.mesh.position.set(node.wx - camX, node.wy - camY, node.wz - camZ);
      for (const part of node.scrollParts) {
        const fallH = part.userData.fallHeight as number | undefined;
        if (fallH) {
          const phase = ((this.timeAccum * 1.35 + (part.userData.phaseOffset as number)) % 1);
          part.position.y = -phase * fallH;
        } else {
          const zPhase = ((this.timeAccum * 1.8) % 1.2);
          part.position.z = 0.35 + zPhase * 1.6;
        }
      }
      if (node.foamRing) {
        const s = 0.92 + Math.sin(this.timeAccum * 4.5 + node.tile) * 0.14;
        node.foamRing.scale.set(s, 1, s);
      }
    }
  }
}
