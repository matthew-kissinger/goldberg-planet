/**
 * Chunk residency: generates chunk meshes on demand around the player and releases them
 * behind, with hysteresis and a per-frame build budget so motion never stalls.
 *
 * Supports dynamic `PlanetConfig` / `Layers` rebinding (`rebindPlanet`) when traveling
 * between worlds in the solar system, and border-tile neighbor chunk queuing so voxel
 * edits across chunk boundaries stay watertight at 144 fps.
 */

import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Layers } from './layers';
import type { Columns } from './columns';
import type { Trees } from './trees';
import { chunkKeyOfTile, enumerateChunks, type ChunkInfo } from './chunks';
import { buildChunkMesh } from '../render/mesher';
import { HEIGHT_MAX } from './terrain';

const THETA_MIN = 0.55;
const THETA_CAP = 0.88;
const RELEASE_FACTOR = 1.12;
const RELEASE_PAD = 0.05;
const BUILD_BUDGET_MS = 4.5;
const BUILD_BUDGET_COUNT = 4;

interface Resident {
  mesh: THREE.Mesh | null;
  info: ChunkInfo;
  triangles: number;
}

export class Streamer {
  readonly all: Map<number, ChunkInfo>;
  readonly list: ChunkInfo[];
  readonly resident = new Map<number, Resident>();
  private queue: ChunkInfo[] = [];
  private queued = new Set<number>();
  private neighborRebuildQueue: number[] = [];
  private eyeX = 0;
  private eyeY = 0;
  private eyeZ = 0;
  residencyDirty = true;

  // metrics
  loads = 0;
  releases = 0;
  buildSamples: number[] = [];
  lastTheta = THETA_MIN;

  constructor(
    private readonly geo: Goldberg,
    private layers: Layers,
    private columns: Columns,
    private readonly scene: THREE.Scene,
    private readonly material: THREE.Material,
    private trees?: Trees,
  ) {
    this.all = enumerateChunks(geo);
    this.list = [...this.all.values()];
  }

  /** Switch the streamer to a newly entered planet's layers, columns, and flora. */
  rebindPlanet(layers: Layers, columns: Columns, trees?: Trees): void {
    this.clearAllResident();
    this.layers = layers;
    this.columns = columns;
    this.trees = trees;
    this.queue.length = 0;
    this.queued.clear();
    this.neighborRebuildQueue.length = 0;
    this.residencyDirty = true;
  }

  /** Unload all resident chunks (e.g., when in deep interplanetary space or switching planets). */
  clearAllResident(): void {
    for (const [key, res] of [...this.resident.entries()]) {
      this.disposeResident(key, res);
    }
  }

  thetaFor(altitude: number): number {
    const R = this.layers.planetRadius;
    const peakHorizon = Math.acos(Math.min(1, R / (R + HEIGHT_MAX)));
    const h = Math.max(2, altitude);
    const horizon = Math.acos(Math.min(1, R / (R + h)));
    return Math.min(THETA_CAP, Math.max(THETA_MIN, horizon + peakHorizon));
  }

  /** Recompute desired set (cheap: ~900 dot products). Called every few frames. */
  refreshDesired(px: number, py: number, pz: number, altitude: number): void {
    const theta = this.thetaFor(altitude);
    this.lastTheta = theta;
    const releaseTheta = theta * RELEASE_FACTOR + RELEASE_PAD;
    const cosRelease = Math.cos(releaseTheta);

    // release far-behind chunks
    for (const [key, res] of this.resident) {
      const info = res.info;
      const d = info.cx * px + info.cy * py + info.cz * pz;
      if (d < cosRelease - Math.sin(releaseTheta) * info.angRadius) {
        this.disposeResident(key, res);
      }
    }

    // queue missing chunks, nearest first
    const wanted: { info: ChunkInfo; ang: number }[] = [];
    for (const info of this.list) {
      const d = info.cx * px + info.cy * py + info.cz * pz;
      const ang = Math.acos(Math.min(1, Math.max(-1, d)));
      if (ang - info.angRadius < theta && !this.resident.has(info.key)) {
        wanted.push({ info, ang });
      }
    }
    wanted.sort((a, b) => a.ang - b.ang);
    this.queue = wanted.map((w) => w.info);
    this.queued = new Set(this.queue.map((c) => c.key));
  }

  private disposeResident(key: number, res: Resident): void {
    if (res.mesh) {
      this.scene.remove(res.mesh);
      res.mesh.geometry.dispose();
    }
    this.resident.delete(key);
    this.releases++;
    this.residencyDirty = true;
  }

  /** Build queued chunks within the frame budget. Returns number built. */
  pump(maxMs = BUILD_BUDGET_MS, maxCount = BUILD_BUDGET_COUNT): number {
    // Drain 1 border-neighbor rebuild per frame so cross-chunk edits never spike frame time
    if (this.neighborRebuildQueue.length > 0) {
      const nKey = this.neighborRebuildQueue.shift()!;
      if (this.resident.has(nKey)) {
        this.rebuildNow(nKey);
      }
    }

    if (this.queue.length === 0) return 0;
    const t0 = performance.now();
    let built = 0;
    while (this.queue.length > 0 && built < maxCount && performance.now() - t0 < maxMs) {
      const info = this.queue.shift()!;
      this.queued.delete(info.key);
      if (this.resident.has(info.key)) continue;
      this.buildChunk(info);
      built++;
    }
    return built;
  }

  buildChunk(info: ChunkInfo): void {
    const t0 = performance.now();
    const data = buildChunkMesh(info, this.geo, this.layers, this.columns, this.trees);
    let mesh: THREE.Mesh | null = null;
    if (data) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geom.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
      geom.setAttribute('packedMat', new THREE.BufferAttribute(data.packedMat, 1));
      geom.computeBoundingSphere();
      mesh = new THREE.Mesh(geom, this.material);
      mesh.userData.anchor = data.anchor;
      mesh.position.set(data.anchor[0] - this.eyeX, data.anchor[1] - this.eyeY, data.anchor[2] - this.eyeZ);
      this.scene.add(mesh);
    }
    this.resident.set(info.key, { mesh, info, triangles: data ? data.triangles : 0 });
    this.loads++;
    this.residencyDirty = true;
    const ms = performance.now() - t0;
    if (this.buildSamples.length < 5000) this.buildSamples.push(ms);
  }

  /**
   * Rebuild one chunk immediately. The resident SET is unchanged by a rebuild,
   * so this must NOT dirty the far-sphere filter — that refilter is a 184k-tri scan plus
   * a full index re-upload.
   */
  rebuildNow(key: number): void {
    const res = this.resident.get(key);
    const info = this.all.get(key);
    if (!info) return;
    const wasDirty = this.residencyDirty;
    if (res) this.disposeResident(key, res);
    this.buildChunk(info);
    this.loads--;
    this.releases--;
    this.residencyDirty = wasDirty;
  }

  /**
   * Rebuild the chunk holding `tile` immediately, and queue any adjacent chunks if `tile`
   * sits on a chunk border (for watertight cross-chunk voxel mining/building).
   */
  rebuildTile(tile: number, includeNeighbors = false): void {
    const key = chunkKeyOfTile(this.geo, tile);
    if (this.resident.has(key)) this.rebuildNow(key);
    if (includeNeighbors) {
      const deg = this.geo.degrees[tile];
      for (let e = 0; e < deg; e++) {
        const nbr = this.geo.nbrs[tile * 6 + e];
        const nKey = chunkKeyOfTile(this.geo, nbr);
        if (nKey !== key && this.resident.has(nKey) && !this.neighborRebuildQueue.includes(nKey)) {
          this.neighborRebuildQueue.push(nKey);
        }
      }
    }
  }

  /** Per-frame: update camera-relative transforms (floating origin). */
  updateTransforms(eyeX: number, eyeY: number, eyeZ: number): void {
    this.eyeX = eyeX;
    this.eyeY = eyeY;
    this.eyeZ = eyeZ;
    for (const res of this.resident.values()) {
      if (!res.mesh) continue;
      const a = res.mesh.userData.anchor as [number, number, number];
      res.mesh.position.set(a[0] - eyeX, a[1] - eyeY, a[2] - eyeZ);
    }
  }

  residentKeys(): Set<number> {
    return new Set(this.resident.keys());
  }

  stats(): { resident: number; queued: number; triangles: number } {
    let tris = 0;
    for (const r of this.resident.values()) tris += r.triangles;
    return { resident: this.resident.size, queued: this.queue.length, triangles: tris };
  }
}
