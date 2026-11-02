/** Chunk residency with bounded worker generation and main-thread mesh installation. */
import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Layers } from './layers';
import type { Columns } from './columns';
import type { Trees } from './trees';
import { chunkKeyOfTile, enumerateChunks, type ChunkInfo } from './chunks';
import { buildChunkMesh, type ChunkMeshData } from '../render/mesher';
import { HEIGHT_MAX } from './terrain';
import { MeshWorkerPool, type MeshBuildPool, type PlanetMeshDeltas } from './workerPool';

const THETA_MIN = 0.55;
const THETA_CAP = 0.88;
const RELEASE_FACTOR = 1.12;
const RELEASE_PAD = 0.05;
const BUILD_BUDGET_MS = 4.5;
const BUILD_BUDGET_COUNT = 4;
const DETAIL_HIDE_DISTANCE = 1000;
const DETAIL_SHOW_DISTANCE = 800;

interface Resident {
  mesh: THREE.Mesh | null;
  info: ChunkInfo;
  triangles: number;
}

interface MeshJob {
  info: ChunkInfo;
  generation: number;
  revision: number;
}
interface CompletedMesh extends MeshJob { data: ChunkMeshData | null }

export class Streamer {
  readonly all: Map<number, ChunkInfo>;
  readonly list: ChunkInfo[];
  readonly resident = new Map<number, Resident>();
  private queue: ChunkInfo[] = [];
  private queued = new Set<number>();
  private desired = new Set<number>();
  private readonly revisions = new Map<number, number>();
  private readonly dirty = new Set<number>();
  // Includes old-generation work until it settles, so planet changes cannot flood workers.
  private readonly pending = new Set<MeshJob>();
  private readonly inFlight = new Map<number, MeshJob>();
  private readonly ready: CompletedMesh[] = [];
  private generation = 0;
  private workerDirty = false;
  private disposed = false;
  private renderDetails = true;
  private eyeX = 0;
  private eyeY = 0;
  private eyeZ = 0;
  residencyDirty = true;
  loads = 0;
  releases = 0;
  /** Main-thread installation, or complete synchronous build in fallback mode. */
  buildSamples: number[] = [];
  lastTheta = THETA_MIN;

  constructor(
    private readonly geo: Goldberg,
    private layers: Layers,
    private columns: Columns,
    private readonly scene: THREE.Scene,
    private readonly material: THREE.Material,
    private trees?: Trees,
    private readonly workerPool: MeshBuildPool = new MeshWorkerPool(),
  ) {
    this.all = enumerateChunks(geo);
    this.list = [...this.all.values()];
    this.initWorkerPlanet();
  }

  get workerBuildSamples(): readonly number[] { return this.workerPool.buildSamples; }
  get detailedRendering(): boolean { return this.renderDetails; }

  /** Render ownership only: keep chunks/edits/collision resident when zoomed out.
   * The caller must update the far mask in the same frame when this returns true.
   */
  updateRenderDistance(distance: number): boolean {
    if (!Number.isFinite(distance) || this.disposed) return false;
    const show = this.renderDetails ? distance < DETAIL_HIDE_DISTANCE : distance <= DETAIL_SHOW_DISTANCE;
    if (show === this.renderDetails) return false;
    this.renderDetails = show;
    for (const resident of this.resident.values()) if (resident.mesh) resident.mesh.visible = show;
    this.residencyDirty = true;
    return true;
  }

  private deltaSnapshot(): PlanetMeshDeltas {
    return {
      edits: this.columns.exportEdits(),
      choppedTrees: [...(this.trees?.chopped ?? [])],
      treeDamage: [...(this.trees?.chopProgress ?? [])],
      seededEcoTiles: [...this.columns.seededEcoTiles],
    };
  }

  private initWorkerPlanet(): void {
    if (this.workerPool.isThreaded) {
      const config = this.columns.terrain.config;
      this.workerPool.initPlanet(config.id, this.geo.m, config, this.deltaSnapshot());
    }
    this.workerDirty = false;
  }

  rebindPlanet(layers: Layers, columns: Columns, trees?: Trees): void {
    this.clearAllResident();
    this.layers = layers;
    this.columns = columns;
    this.trees = trees;
    this.initWorkerPlanet();
  }

  clearAllResident(): void {
    this.generation++;
    this.queue.length = 0;
    this.queued.clear();
    this.desired.clear();
    this.ready.length = 0;
    this.inFlight.clear();
    this.revisions.clear();
    this.dirty.clear();
    for (const [key, res] of this.resident) this.disposeResident(key, res);
    this.residencyDirty = true;
  }

  dispose(): void {
    this.disposed = true;
    this.clearAllResident();
    this.workerPool.dispose();
  }

  thetaFor(altitude: number): number {
    const R = this.layers.planetRadius;
    const peakHorizon = Math.acos(Math.min(1, R / (R + HEIGHT_MAX)));
    const h = Math.max(2, altitude);
    const horizon = Math.acos(Math.min(1, R / (R + h)));
    return Math.min(THETA_CAP, Math.max(THETA_MIN, horizon + peakHorizon));
  }

  refreshDesired(px: number, py: number, pz: number, altitude: number): void {
    if (this.disposed) return;
    const theta = this.thetaFor(altitude);
    this.lastTheta = theta;
    const releaseTheta = theta * RELEASE_FACTOR + RELEASE_PAD;
    const cosRelease = Math.cos(releaseTheta);
    for (const [key, res] of this.resident) {
      const info = res.info;
      const d = info.cx * px + info.cy * py + info.cz * pz;
      if (d < cosRelease - Math.sin(releaseTheta) * info.angRadius) {
        this.disposeResident(key, res);
        this.dirty.delete(key);
      }
    }
    const wanted: { info: ChunkInfo; ang: number }[] = [];
    this.desired.clear();
    for (const info of this.list) {
      const d = info.cx * px + info.cy * py + info.cz * pz;
      const ang = Math.acos(Math.min(1, Math.max(-1, d)));
      if (ang - info.angRadius < theta) {
        this.desired.add(info.key);
        if (!this.resident.has(info.key) || this.dirty.has(info.key)) wanted.push({ info, ang });
      } else if (this.dirty.has(info.key) && this.resident.has(info.key)) {
        wanted.push({ info, ang });
      }
    }
    wanted.sort((a, b) => Number(this.dirty.has(b.info.key)) - Number(this.dirty.has(a.info.key)) || a.ang - b.ang);
    this.queue = wanted.map(w => w.info);
    this.queued = new Set(this.queue.map(c => c.key));
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

  private stillWanted(job: MeshJob): boolean {
    return !this.disposed && job.generation === this.generation &&
      (this.desired.has(job.info.key) || this.resident.has(job.info.key));
  }

  private enqueue(info: ChunkInfo, priority = false): void {
    if (this.queued.has(info.key)) return;
    this.queued.add(info.key);
    if (priority) this.queue.unshift(info);
    else this.queue.push(info);
  }

  /** Install bounded completions, then dispatch at most one job per available worker. */
  pump(maxMs = BUILD_BUDGET_MS, maxCount = BUILD_BUDGET_COUNT): number {
    // Hidden fine meshes do not upload until their first draw. Building hundreds
    // in orbit turned descent into one large deferred GPU upload. Keep the small
    // completion queue and existing residents; admit new geometry on the surface.
    if (this.disposed || !this.renderDetails || maxMs <= 0 || maxCount <= 0) return 0;
    const start = performance.now();
    let built = 0;
    while (this.ready.length > 0 && built < maxCount && performance.now() - start < maxMs) {
      const ready = this.ready.shift()!;
      if (!this.stillWanted(ready)) continue;
      if (ready.revision !== (this.revisions.get(ready.info.key) ?? 0)) {
        this.enqueue(ready.info, true);
        continue;
      }
      this.install(ready.info, ready.data);
      built++;
    }

    if (this.workerPool.isThreaded && this.workerDirty) {
      this.workerPool.updatePlanet(this.columns.terrain.config.id, this.deltaSnapshot());
      this.workerDirty = false;
    }

    let dispatched = 0;
    while (this.queue.length > 0 && performance.now() - start < maxMs) {
      if (this.workerPool.isThreaded) {
        if (this.pending.size + this.ready.length >= this.workerPool.concurrency || dispatched >= maxCount) break;
      } else if (built >= maxCount) break;
      const index = this.queue.findIndex(info => !this.inFlight.has(info.key));
      if (index < 0) break;
      const info = this.queue.splice(index, 1)[0];
      this.queued.delete(info.key);
      if ((!this.desired.has(info.key) && !this.resident.has(info.key)) ||
          (this.resident.has(info.key) && !this.dirty.has(info.key))) continue;
      if (!this.workerPool.isThreaded) {
        // No Worker or worker failure: explicit non-preemptible fallback. The budget
        // bounds admission, but a single chunk can still exceed it on this route.
        const t0 = performance.now();
        const data = buildChunkMesh(info, this.geo, this.layers, this.columns, this.trees);
        this.install(info, data, t0);
        built++;
        continue;
      }
      const job: MeshJob = { info, generation: this.generation, revision: this.revisions.get(info.key) ?? 0 };
      this.pending.add(job);
      this.inFlight.set(info.key, job);
      dispatched++;
      void this.workerPool.buildChunkAsync(this.columns.terrain.config.id, info.key).then(data => {
        this.settle(job);
        if (!this.stillWanted(job)) return;
        if (job.revision !== (this.revisions.get(info.key) ?? 0)) this.enqueue(info, true);
        else this.ready.push({ ...job, data });
      }, () => {
        this.settle(job);
        if (this.stillWanted(job)) this.enqueue(info, true);
      });
    }
    return built;
  }

  private settle(job: MeshJob): void {
    this.pending.delete(job);
    if (this.inFlight.get(job.info.key) === job) this.inFlight.delete(job.info.key);
  }

  private install(info: ChunkInfo, data: ChunkMeshData | null, start = performance.now()): void {
    const previous = this.resident.get(info.key);
    let mesh: THREE.Mesh | null = null;
    if (data) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geom.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
      geom.setAttribute('packedMat', new THREE.BufferAttribute(data.packedMat, 1));
      geom.computeBoundingSphere();
      mesh = new THREE.Mesh(geom, this.material);
        // Three allocates vertex buffers on first draw, after frustum culling.
        // Prime each admitted chunk in this frame even when looking away, so
        // turning toward hundreds of residents cannot allocate them all at once.
        mesh.frustumCulled = false;
        mesh.onAfterRender = (_renderer, _scene, _camera, _geometry, material) => {
          if (material !== this.material) return; // shadow passes do not bind every surface attribute
          mesh!.frustumCulled = true;
          mesh!.onAfterRender = THREE.Object3D.prototype.onAfterRender;
        };
      mesh.visible = this.renderDetails;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.anchor = data.anchor;
      mesh.position.set(data.anchor[0] - this.eyeX, data.anchor[1] - this.eyeY, data.anchor[2] - this.eyeZ);
      this.scene.add(mesh);
    }
    if (previous?.mesh) {
      this.scene.remove(previous.mesh);
      previous.mesh.geometry.dispose();
    }
    this.resident.set(info.key, { mesh, info, triangles: data?.triangles ?? 0 });
    this.dirty.delete(info.key);
    if (!previous) {
      this.loads++;
      this.residencyDirty = true;
    }
    if (this.buildSamples.length < 5000) this.buildSamples.push(performance.now() - start);
  }

  /** Explicit requests also follow the queue; geometry construction never runs in an input callback. */
  buildChunk(info: ChunkInfo): void {
    if (this.disposed) return;
    this.desired.add(info.key);
    this.rebuildNow(info.key);
  }

  /** Compatibility name: schedules a replacement, retaining the current mesh until ready. */
  rebuildNow(key: number): void {
    if (this.disposed) return;
    const info = this.all.get(key);
    if (!info) return;
    this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
    this.workerDirty = true;
    this.dirty.add(key);
    if (this.resident.has(key) || this.desired.has(key)) this.enqueue(info, true);
  }

  rebuildTile(tile: number, includeNeighbors = false): void {
    this.rebuildNow(chunkKeyOfTile(this.geo, tile));
    if (includeNeighbors) {
      const keys = new Set<number>();
      for (let e = 0; e < this.geo.degrees[tile]; e++) {
        keys.add(chunkKeyOfTile(this.geo, this.geo.nbrs[tile * 6 + e]));
      }
      keys.delete(chunkKeyOfTile(this.geo, tile));
      for (const key of keys) this.rebuildNow(key);
    }
  }

  /** Apply a restored/co-op snapshot without dropping already visible geometry. */
  invalidateAll(): void {
    this.workerDirty = true;
    const keys = new Set([...this.desired, ...this.resident.keys()]);
    for (const key of keys) this.rebuildNow(key);
  }

  updateTransforms(eyeX: number, eyeY: number, eyeZ: number): void {
    this.eyeX = eyeX; this.eyeY = eyeY; this.eyeZ = eyeZ;
    for (const res of this.resident.values()) {
      if (!res.mesh) continue;
      const a = res.mesh.userData.anchor as [number, number, number];
      res.mesh.position.set(a[0] - eyeX, a[1] - eyeY, a[2] - eyeZ);
    }
  }

  residentKeys(): Set<number> { return new Set(this.resident.keys()); }
  /** Coarse coverage is removed only for chunks whose detail representation is enabled. */
  renderedKeys(): Set<number> { return this.renderDetails ? this.residentKeys() : new Set<number>(); }

  stats(): { resident: number; queued: number; triangles: number; pending: number; ready: number; threaded: boolean } {
    let triangles = 0;
    for (const resident of this.resident.values()) triangles += resident.triangles;
    const outstanding = new Set(this.queue.map(info => info.key));
    for (const job of this.pending) if (job.generation === this.generation) outstanding.add(job.info.key);
    for (const job of this.ready) outstanding.add(job.info.key);
    return {
      resident: this.resident.size, queued: outstanding.size, triangles,
      pending: this.pending.size, ready: this.ready.length, threaded: this.workerPool.isThreaded,
    };
  }
}
