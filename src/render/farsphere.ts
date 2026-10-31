/**
 * Whole-planet far view (`FarSphere`) and distant planet impostor builder.
 *
 * - `FarSphere`: coarse geodesic mesh (frequency 96, ~92k verts / ~184k tris) sampling
 *   the active planet's terrain field and palette, sunk 6 m below the true surface so
 *   near chunks always draw on top.
 * - Supports instant `< 8 ms` `rebindTerrain(terrain, planetRadius)` when switching active
 *   planets by reusing the cached topological index and updating vertex attributes in-place.
 * - Also provides `buildImpostorMesh` (`Goldberg(24)`) for distant planets hanging in the sky.
 */

import * as THREE from 'three/webgpu';
import { Goldberg } from '../geo/goldberg';
import { PLANET_RADIUS } from '../world/layers';
import type { Terrain } from '../world/terrain';
import { materialColor } from './palette';
import { encodePackedMat } from './mesher';
import { chunkKeyOfTile } from '../world/chunks';

export const FAR_MARGIN = 6;
const MAX_CHUNK_KEY = 20 * 4096;

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
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.buildMs = buildMs;
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
        const r = planetRadius + h - FAR_MARGIN;
        positions[id * 3] = x * r;
        positions[id * 3 + 1] = y * r;
        positions[id * 3 + 2] = z * r;
        normals[id * 3] = x; normals[id * 3 + 1] = y; normals[id * 3 + 2] = z;
        const matId = terrain.surfaceMaterial(h, x, y, z);
        const isPent = coarse.degreeOf(id) === 5;
        materialColor(matId, id, isPent, colScratch);
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
    );
  }

  /**
   * Re-evaluate the FarSphere vertex heights, colors, and packed materials in-place
   * when entering a new planet's Sphere of Influence (~6 ms, zero index re-allocation).
   */
  rebindTerrain(terrain: Terrain, planetRadius = terrain.config?.radius ?? PLANET_RADIUS): void {
    const N = this.coarse.count;
    const c = this.coarse.centers;
    const positions = this.posAttr.array as Float32Array;
    const colors = this.colAttr.array as Float32Array;
    const packedMat = this.pmatAttr.array as Float32Array;
    const colScratch = new Float32Array(3);

    for (let id = 0; id < N; id++) {
      const x = c[id * 3], y = c[id * 3 + 1], z = c[id * 3 + 2];
      const h = terrain.heightAt(x, y, z);
      const r = planetRadius + h - FAR_MARGIN;
      positions[id * 3] = x * r;
      positions[id * 3 + 1] = y * r;
      positions[id * 3 + 2] = z * r;
      const matId = terrain.surfaceMaterial(h, x, y, z);
      const isPent = this.coarse.degreeOf(id) === 5;
      materialColor(matId, id, isPent, colScratch);
      colors[id * 3] = colScratch[0];
      colors[id * 3 + 1] = colScratch[1];
      colors[id * 3 + 2] = colScratch[2];
      packedMat[id] = encodePackedMat(matId, false, isPent, false, terrain.moistureAt(x, y, z));
    }

    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.pmatAttr.needsUpdate = true;
    this.geometry.computeBoundingSphere();
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
   * with true terrain heights, biome colors, ocean sphere, and optional planetary ring disc.
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
      const r = R + h;
      positions[id * 3] = x * r;
      positions[id * 3 + 1] = y * r;
      positions[id * 3 + 2] = z * r;
      normals[id * 3] = x; normals[id * 3 + 1] = y; normals[id * 3 + 2] = z;
      const matId = terrain.surfaceMaterial(h, x, y, z);
      const isPent = impostorGeo.degreeOf(id) === 5;
      materialColor(matId, id, isPent, colScratch);
      colors[id * 3] = colScratch[0];
      colors[id * 3 + 1] = colScratch[1];
      colors[id * 3 + 2] = colScratch[2];
      packedMat[id] = encodePackedMat(matId, false, isPent, false, 0.5);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setAttribute('packedMat', new THREE.BufferAttribute(packedMat, 1));
    geom.setIndex(new THREE.BufferAttribute(buildGoldbergTriIndex(impostorGeo), 1));
    geom.computeBoundingSphere();

    const terrainMesh = new THREE.Mesh(geom, material);
    terrainMesh.frustumCulled = false;
    group.add(terrainMesh);

    // Distant ocean shell if the planet has an ocean
    if (cfg.ocean.hasOcean) {
      const oceanGeom = new THREE.IcosahedronGeometry(R + cfg.waterSurfaceOffset, 4);
      const oceanMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cfg.ocean.shallowColor[0], cfg.ocean.shallowColor[1], cfg.ocean.shallowColor[2]),
        roughness: cfg.ocean.kind === 'magma' ? 0.35 : 0.15,
        metalness: 0.08,
        emissive: new THREE.Color(
          cfg.ocean.shallowColor[0] * cfg.ocean.emissiveIntensity * 0.4,
          cfg.ocean.shallowColor[1] * cfg.ocean.emissiveIntensity * 0.4,
          cfg.ocean.shallowColor[2] * cfg.ocean.emissiveIntensity * 0.4,
        ),
      });
      const oceanMesh = new THREE.Mesh(oceanGeom, oceanMat);
      oceanMesh.frustumCulled = false;
      group.add(oceanMesh);
    }

    // Distant atmosphere halo shell
    if (cfg.atmosphere.density > 0.05) {
      const atmoGeom = new THREE.IcosahedronGeometry(R + cfg.atmosphere.thickness * 0.55, 3);
      const atmoMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(
          cfg.atmosphere.horizonColor[0],
          cfg.atmosphere.horizonColor[1],
          cfg.atmosphere.horizonColor[2],
        ),
        transparent: true,
        opacity: Math.min(0.28, cfg.atmosphere.density * 0.18),
        side: THREE.BackSide,
        depthWrite: false,
      });
      const atmoMesh = new THREE.Mesh(atmoGeom, atmoMat);
      atmoMesh.frustumCulled = false;
      group.add(atmoMesh);
    }

    // Distant planetary ring disc if the planet has rings
    if (cfg.rings) {
      const ringGeom = new THREE.RingGeometry(cfg.rings.innerRadius, cfg.rings.outerRadius, 64, 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(cfg.rings.colorInner[0], cfg.rings.colorInner[1], cfg.rings.colorInner[2]),
        transparent: true,
        opacity: cfg.rings.opacity * 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      const up = new THREE.Vector3(0, 0, 1);
      const targetN = new THREE.Vector3(cfg.rings.normal[0], cfg.rings.normal[1], cfg.rings.normal[2]).normalize();
      ringMesh.quaternion.setFromUnitVectors(up, targetN);
      ringMesh.frustumCulled = false;
      group.add(ringMesh);
    }

    return group;
  }
}
