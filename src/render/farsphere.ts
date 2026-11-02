/**
 * Whole-planet far view (`FarSphere`) and distant planet impostor builder.
 *
 * - `FarSphere`: coarse geodesic mesh (frequency 96, ~92k verts / ~184k tris) sampling
 *   the active planet's terrain field and palette. Expedition proxies sit one fine
 *   layer below the quantized surface; legacy proxies use FAR_MARGIN.
 * - Reuses topology and updates vertex attributes in-place when switching active planets.
 *   Terrain sampling and buffer updates are synchronous; their cost depends on the world.
 * - Also provides `buildImpostorGroup` (`Goldberg(24)`) for distant planets in the sky.
 */

import * as THREE from 'three/webgpu';
import { cameraPosition, float, normalWorld, positionWorld, smoothstep } from 'three/tsl';
import { Goldberg } from '../geo/goldberg';
import { PLANET_RADIUS } from '../world/layers';
import { HEIGHT_MAX, MAT, type Terrain } from '../world/terrain';
import { checkPreparation, prepareInSlices, type PreparationOptions } from '../world/preparation';
import { materialColor } from './palette';
import { encodePackedMat } from './mesher';
import { chunkKeyOfTile } from '../world/chunks';
import { createPlanetRing } from './planetRing';

export const FAR_MARGIN = 12;
/** Keep low dry coasts above liquid instead of sinking the entire coastline.
 * Very shallow beaches retain their raw height; this is not a stitched LOD boundary.
 */
export function farTerrainRadius(terrain: Terrain, height: number, radius: number): number {
  const config = terrain.config;
  // Current landscapes use fine columns. Match their layer datum and keep
  // the proxy one layer below it, rather than exposing a 12m drop at residency
  // boundaries. Legacy saves keep their established proxy contract.
  if (terrain.aurelia || terrain.expeditionWorld) {
    const step = config.layerH;
    const quantized = 130 - Math.floor((130 - height) / step) * step;
    const sink = Math.max(step, .625);
    const submerged = !config.ocean.hasOcean || height <= config.waterSurfaceOffset;
    return radius + (submerged ? quantized - sink : Math.max(height > config.waterSurfaceOffset + .5 ? config.waterSurfaceOffset + .5 : height, quantized - sink));
  }
  const margin = config.ocean.hasOcean && height > config.waterSurfaceOffset
    ? Math.min(FAR_MARGIN, Math.max(0, height - config.waterSurfaceOffset - 0.5))
    : FAR_MARGIN;
  return radius + height - margin;
}
const MAX_CHUNK_KEY = 20 * 4096;

interface FarTerrainSnapshot {
  radius: number;
  positions: Float32Array;
  colors: Float32Array;
  packedMat: Float32Array;
}

function buildGoldbergTriIndex(geo: Goldberg): Uint32Array {
  const N = geo.count;
  const c = geo.centers;
  const triSet = new Set<number>();
  const tris: number[] = [];
  for (let id = 0; id < N; id++) {
    const deg = geo.degreeOf(id);
    for (let k = 0; k < deg; k++) {
      const a = geo.neighbor(id, k);
      const b = geo.neighbor(id, (k + 1) % deg);
      let s0 = id, s1 = a, s2 = b, tmp;
      if (s0 > s1) { tmp = s0; s0 = s1; s1 = tmp; }
      if (s1 > s2) { tmp = s1; s1 = s2; s2 = tmp; }
      if (s0 > s1) { tmp = s0; s0 = s1; s1 = tmp; }
      const key = (s0 * N + s1) * N + s2;
      if (triSet.has(key)) continue;
      triSet.add(key);
      const ax = c[s0 * 3], ay = c[s0 * 3 + 1], az = c[s0 * 3 + 2];
      const bx = c[s1 * 3], by = c[s1 * 3 + 1], bz = c[s1 * 3 + 2];
      const cx = c[s2 * 3], cy = c[s2 * 3 + 1], cz = c[s2 * 3 + 2];
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (nx * ax + ny * ay + nz * az >= 0) tris.push(s0, s1, s2);
      else tris.push(s0, s2, s1);
    }
  }
  return Uint32Array.from(tris);
}

export class FarSphere {
  readonly mesh: THREE.Mesh;
  readonly triangles: number;
  private readonly coarse: Goldberg;
  private readonly fullIndex: Uint32Array;
  private readonly triChunkKey: Uint32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly pmatAttr: THREE.BufferAttribute;
  private readonly indexAttr: THREE.BufferAttribute;
  private readonly residentLut = new Uint8Array(MAX_CHUNK_KEY);
  // Terrain instances represent fixed seeded worlds. Keep sampled attributes for revisits.
  private readonly terrainCache = new WeakMap<Terrain, FarTerrainSnapshot>();
  private activeTerrain: Terrain;
  private activeRadius: number;
  readonly buildMs: number;

  private constructor(
    coarse: Goldberg,
    geometry: THREE.BufferGeometry,
    posAttr: THREE.BufferAttribute,
    colAttr: THREE.BufferAttribute,
    pmatAttr: THREE.BufferAttribute,
    indexAttr: THREE.BufferAttribute,
    fullIndex: Uint32Array,
    triChunkKey: Uint32Array,
    material: THREE.Material,
    buildMs: number,
    terrain: Terrain,
    planetRadius: number,
  ) {
    this.coarse = coarse;
    this.geometry = geometry;
    this.posAttr = posAttr;
    this.colAttr = colAttr;
    this.pmatAttr = pmatAttr;
    this.indexAttr = indexAttr;
    this.fullIndex = fullIndex;
    this.triChunkKey = triChunkKey;
    this.triangles = fullIndex.length / 3;
    // Geometry already sits below the fine surface. A depth-buffer offset would
    // grow with distance and can push dry coastal vertices behind the ocean.
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.buildMs = buildMs;
    this.activeTerrain = terrain;
    this.activeRadius = planetRadius;
    this.cacheTerrain(terrain, planetRadius);
  }

  private cacheTerrain(terrain: Terrain, radius: number): void {
    this.terrainCache.set(terrain, {
      radius,
      positions: (this.posAttr.array as Float32Array).slice(),
      colors: (this.colAttr.array as Float32Array).slice(),
      packedMat: (this.pmatAttr.array as Float32Array).slice(),
    });
  }

  hasPreparedTerrain(terrain: Terrain, radius = terrain.config.radius): boolean {
    return this.terrainCache.get(terrain)?.radius === radius;
  }

  /** Prepare a destination without touching the current GPU attributes or residency. */
  async prepareTerrain(terrain: Terrain, radius = terrain.config.radius, options: PreparationOptions = {}): Promise<void> {
    checkPreparation(options);
    if (this.hasPreparedTerrain(terrain, radius)) { options.onProgress?.(1); return; }
    const count = this.coarse.count;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const packedMat = new Float32Array(count);
    const scratch = new Float32Array(3);
    const c = this.coarse.centers;
    await prepareInSlices(count, id => {
      const x = c[id * 3], y = c[id * 3 + 1], z = c[id * 3 + 2];
      const h = terrain.heightAt(x, y, z);
      const r = farTerrainRadius(terrain, h, radius);
      positions[id * 3] = x * r;
      positions[id * 3 + 1] = y * r;
      positions[id * 3 + 2] = z * r;
      const matId = terrain.surfaceMaterial(h, x, y, z);
      const isPent = this.coarse.degreeOf(id) === 5;
      materialColor(matId, id, isPent, scratch, 0, terrain.archetype);
      colors[id * 3] = scratch[0];
      colors[id * 3 + 1] = scratch[1];
      colors[id * 3 + 2] = scratch[2];
      packedMat[id] = encodePackedMat(matId, false, isPent, false, terrain.moistureAt(x, y, z));
    }, options);
    checkPreparation(options);
    this.terrainCache.set(terrain, { radius, positions, colors, packedMat });
  }

  static async build(
    coarse: Goldberg,
    fine: Goldberg,
    terrain: Terrain,
    material: THREE.Material,
    onProgress?: (frac: number) => Promise<void>,
    planetRadius = terrain.config?.radius ?? PLANET_RADIUS,
  ): Promise<FarSphere> {
    const t0 = performance.now();
    const N = coarse.count;
    const positions = new Float32Array(N * 3);
    const normals = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const packedMat = new Float32Array(N);
    const vertChunkKey = new Uint32Array(N);
    const c = coarse.centers;
    const colScratch = new Float32Array(3);
    const SLICE = 16384;
    for (let start = 0; start < N; start += SLICE) {
      const end = Math.min(N, start + SLICE);
      for (let id = start; id < end; id++) {
        const x = c[id * 3], y = c[id * 3 + 1], z = c[id * 3 + 2];
        const h = terrain.heightAt(x, y, z);
        const r = farTerrainRadius(terrain, h, planetRadius);
        positions[id * 3] = x * r;
        positions[id * 3 + 1] = y * r;
        positions[id * 3 + 2] = z * r;
        normals[id * 3] = x; normals[id * 3 + 1] = y; normals[id * 3 + 2] = z;
        const matId = terrain.surfaceMaterial(h, x, y, z);
        const isPent = coarse.degreeOf(id) === 5;
        materialColor(matId, id, isPent, colScratch, 0, terrain.archetype);
        colors[id * 3] = colScratch[0];
        colors[id * 3 + 1] = colScratch[1];
        colors[id * 3 + 2] = colScratch[2];
        packedMat[id] = encodePackedMat(matId, false, isPent, false, terrain.moistureAt(x, y, z));
        const fineTile = fine.tileOf(x, y, z);
        vertChunkKey[id] = chunkKeyOfTile(fine, fineTile);
      }
      if (onProgress) await onProgress(end / N * 0.8);
    }

    const fullIndex = buildGoldbergTriIndex(coarse);
    if (onProgress) await onProgress(0.92);
    const triCount = fullIndex.length / 3;
    const triChunkKey = new Uint32Array(triCount * 3);
    for (let t = 0; t < triCount; t++) {
      triChunkKey[t * 3] = vertChunkKey[fullIndex[t * 3]];
      triChunkKey[t * 3 + 1] = vertChunkKey[fullIndex[t * 3 + 1]];
      triChunkKey[t * 3 + 2] = vertChunkKey[fullIndex[t * 3 + 2]];
    }

    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    const pmatAttr = new THREE.BufferAttribute(packedMat, 1);
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', colAttr);
    geometry.setAttribute('packedMat', pmatAttr);
    const indexAttr = new THREE.BufferAttribute(fullIndex.slice(), 1);
    geometry.setIndex(indexAttr);
    geometry.computeBoundingSphere();
    if (onProgress) await onProgress(1);
    return new FarSphere(
      coarse,
      geometry,
      posAttr,
      colAttr,
      pmatAttr,
      indexAttr,
      fullIndex,
      triChunkKey,
      material,
      performance.now() - t0,
      terrain,
      planetRadius,
    );
  }

  /**
   * Re-evaluate the FarSphere vertex heights, colors, and packed materials in-place
   * when entering a new planet's Sphere of Influence, reusing the existing index buffer.
   * Previously visited terrain instances reuse sampled attributes; a first visit is synchronous.
   */
  rebindTerrain(terrain: Terrain, planetRadius = terrain.config?.radius ?? PLANET_RADIUS): void {
    if (terrain === this.activeTerrain && planetRadius === this.activeRadius) return;
    const N = this.coarse.count;
    const c = this.coarse.centers;
    const positions = this.posAttr.array as Float32Array;
    const colors = this.colAttr.array as Float32Array;
    const packedMat = this.pmatAttr.array as Float32Array;
    const colScratch = new Float32Array(3);
    const cached = this.terrainCache.get(terrain);
    if (cached?.radius === planetRadius) {
      positions.set(cached.positions);
      colors.set(cached.colors);
      packedMat.set(cached.packedMat);
    } else {
      for (let id = 0; id < N; id++) {
        const x = c[id * 3], y = c[id * 3 + 1], z = c[id * 3 + 2];
        const h = terrain.heightAt(x, y, z);
        const r = farTerrainRadius(terrain, h, planetRadius);
        positions[id * 3] = x * r;
        positions[id * 3 + 1] = y * r;
        positions[id * 3 + 2] = z * r;
        const matId = terrain.surfaceMaterial(h, x, y, z);
        const isPent = this.coarse.degreeOf(id) === 5;
        materialColor(matId, id, isPent, colScratch, 0, terrain.archetype);
        colors[id * 3] = colScratch[0];
        colors[id * 3 + 1] = colScratch[1];
        colors[id * 3 + 2] = colScratch[2];
        packedMat[id] = encodePackedMat(matId, false, isPent, false, terrain.moistureAt(x, y, z));
      }
      this.cacheTerrain(terrain, planetRadius);
    }

    this.activeTerrain = terrain;
    this.activeRadius = planetRadius;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.pmatAttr.needsUpdate = true;
    // Terrain heights are bounded; avoid scanning ~92k positions during atomic travel commit.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), planetRadius + HEIGHT_MAX + 1);
    this.setResidentChunks(new Set());
  }

  /** Hide coarse triangles fully underneath resident fine chunks. */
  setResidentChunks(keys: ReadonlySet<number>): void {
    this.residentLut.fill(0);
    for (const k of keys) if (k < MAX_CHUNK_KEY) this.residentLut[k] = 1;
    const lut = this.residentLut;
    const idx = this.indexAttr.array as Uint32Array;
    let n = 0;
    for (let t = 0; t < this.triangles; t++) {
      const covered =
        lut[this.triChunkKey[t * 3]] === 1 &&
        lut[this.triChunkKey[t * 3 + 1]] === 1 &&
        lut[this.triChunkKey[t * 3 + 2]] === 1;
      if (covered) continue;
      idx[n * 3] = this.fullIndex[t * 3];
      idx[n * 3 + 1] = this.fullIndex[t * 3 + 1];
      idx[n * 3 + 2] = this.fullIndex[t * 3 + 2];
      n++;
    }
    this.geometry.setDrawRange(0, n * 3);
    this.indexAttr.needsUpdate = true;
  }

  /**
   * Build a lightweight distant planet impostor mesh (`Goldberg(24)`, ~5,762 verts)
   * with a single terrain/water surface and optional atmosphere and planetary ring disc.
   * Clamping submerged vertices to sea level avoids intersecting terrain and ocean shells.
   */
  static buildImpostorGroup(
    impostorGeo: Goldberg,
    terrain: Terrain,
    material: THREE.Material,
  ): THREE.Group {
    const group = new THREE.Group();
    const cfg = terrain.config;
    const R = cfg.radius;
    const N = impostorGeo.count;
    const c = impostorGeo.centers;
    const positions = new Float32Array(N * 3);
    const normals = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const packedMat = new Float32Array(N);
    const colScratch = new Float32Array(3);

    for (let id = 0; id < N; id++) {
      const x = c[id * 3], y = c[id * 3 + 1], z = c[id * 3 + 2];
      const h = terrain.heightAt(x, y, z);
      const waterDepth = cfg.waterSurfaceOffset - h;
      const isWater = cfg.ocean.hasOcean && waterDepth >= 0;
      const r = R + (isWater ? cfg.waterSurfaceOffset : h);
      positions[id * 3] = x * r;
      positions[id * 3 + 1] = y * r;
      positions[id * 3 + 2] = z * r;
      normals[id * 3] = x; normals[id * 3 + 1] = y; normals[id * 3 + 2] = z;
      const matId = isWater
        ? cfg.ocean.kind === 'magma' ? MAT.MAGMA : MAT.SEABED
        : terrain.surfaceMaterial(h, x, y, z);
      const isPent = impostorGeo.degreeOf(id) === 5;
      if (isWater) {
        // Match the ocean's depth palette without another surface, material, or draw call.
        const shore = Math.pow(Math.max(0, 1 - waterDepth / 22), 1.7);
        for (let channel = 0; channel < 3; channel++) {
          colScratch[channel] = cfg.ocean.deepColor[channel] * (1 - shore) + cfg.ocean.shallowColor[channel] * shore;
        }
      } else {
        materialColor(matId, id, isPent, colScratch, 0, terrain.archetype);
      }
      colors[id * 3] = colScratch[0];
      colors[id * 3 + 1] = colScratch[1];
      colors[id * 3 + 2] = colScratch[2];
      packedMat[id] = encodePackedMat(matId, false, isPent, false, isWater ? 1 : 0.5);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setAttribute('packedMat', new THREE.BufferAttribute(packedMat, 1));
    geom.setIndex(new THREE.BufferAttribute(buildGoldbergTriIndex(impostorGeo), 1));
    geom.computeBoundingSphere();

    const terrainMesh = new THREE.Mesh(geom, material);
    terrainMesh.name = 'distantPlanetSurface';
    terrainMesh.frustumCulled = false;
    group.add(terrainMesh);

    // Distant atmosphere halo shell
    if (cfg.atmosphere.density > 0.05) {
      const atmoGeom = new THREE.IcosahedronGeometry(R + cfg.atmosphere.thickness * 0.55, 3);
      const atmoMat = new THREE.MeshBasicNodeMaterial({
        color: new THREE.Color(
          cfg.atmosphere.horizonColor[0],
          cfg.atmosphere.horizonColor[1],
          cfg.atmosphere.horizonColor[2],
        ),
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
      });
      const view = cameraPosition.sub(positionWorld).normalize();
      const cosine = normalWorld.dot(view).abs();
      const impact = float(1).sub(cosine.mul(cosine)).max(0).sqrt();
      // Fade to zero at the *outer* silhouette; a constant-opacity back shell
      // was a flat grey cutout around the planet rather than a thin atmosphere.
      const limb = float(1).sub(smoothstep(R / (R + cfg.atmosphere.thickness * .55), 1, impact));
      atmoMat.opacityNode = limb.pow(2).mul(Math.min(.3, cfg.atmosphere.density * .22));
      const atmoMesh = new THREE.Mesh(atmoGeom, atmoMat);
      atmoMesh.name = 'distantPlanetAtmosphere';
      atmoMesh.frustumCulled = false;
      group.add(atmoMesh);
    }

    // Distant planetary ring disc if the planet has rings
    if (cfg.rings) {
      const ring = createPlanetRing();
      ring.apply(cfg.rings);
      group.add(ring.mesh);
    }

    return group;
  }
}
