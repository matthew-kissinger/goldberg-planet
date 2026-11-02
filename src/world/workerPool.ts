/** Off-thread mesh generation. Failures settle every request; callers can use a measured fallback. */
import type { ChunkMeshData } from '../render/mesher';
import type { PlanetConfig } from './planetConfig';
import {
  createMeshWorkerHandler,
  type MeshWorkerRequest,
  type MeshWorkerResponse,
  type WorkerInitPlanetMsg,
  type WorkerUpdatePlanetMsg,
} from './meshWorker';

export type PlanetMeshDeltas = Pick<WorkerInitPlanetMsg, 'edits' | 'choppedTrees' | 'treeDamage' | 'seededEcoTiles'>;

export interface MeshBuildPool {
  readonly isThreaded: boolean;
  readonly concurrency: number;
  readonly buildSamples: number[];
  initPlanet(planetId: string, m: number, config: PlanetConfig, deltas?: PlanetMeshDeltas): void;
  updatePlanet(planetId: string, deltas: PlanetMeshDeltas): void;
  buildChunkAsync(planetId: string, chunkKey: number): Promise<ChunkMeshData | null>;
  dispose(): void;
}

interface PendingBuild {
  resolve: (mesh: ChunkMeshData | null) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  worker: Worker;
}

export class MeshWorkerPool implements MeshBuildPool {
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, PendingBuild>();
  private readonly busy = new Set<Worker>();
  private nextReqId = 1;
  private roundRobin = 0;
  private disposed = false;
  private readonly snapshots = new Map<string, WorkerInitPlanetMsg>();
  private fallback: ReturnType<typeof createMeshWorkerHandler> | null = null;
  readonly buildSamples: number[] = [];
  failure: string | null = null;

  constructor(maxWorkers = 2, workerFactory?: () => Worker) {
    const isTest = typeof process !== 'undefined' && Boolean(process.env?.VITEST);
    if (!workerFactory && (typeof Worker === 'undefined' || isTest)) return;
    const count = Math.max(1, Math.min(maxWorkers, typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? Math.floor(navigator.hardwareConcurrency / 2) : 2));
    try {
      for (let i = 0; i < count; i++) {
        const worker = workerFactory ? workerFactory() : new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
        this.workers.push(worker);
        worker.onmessage = (ev: MessageEvent<MeshWorkerResponse>) => {
          const msg = ev.data;
          if (msg.type === 'worker_error') {
            this.fail(new Error(msg.message));
            return;
          }
          const pending = this.pending.get(msg.reqId);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(msg.reqId);
          this.busy.delete(pending.worker);
          if (this.buildSamples.length < 5000) this.buildSamples.push(msg.buildMs);
          pending.resolve(msg.mesh);
        };
        worker.onerror = (event) => {
          event.preventDefault?.();
          this.fail(new Error(event.message || 'Mesh worker failed'));
        };
        worker.onmessageerror = () => this.fail(new Error('Mesh worker response could not be decoded'));
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  get isThreaded(): boolean { return this.workers.length > 0; }
  get concurrency(): number { return Math.max(1, this.workers.length); }

  private fail(error: Error): void {
    this.failure = error.message;
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.busy.clear();
  }

  private broadcast(msg: MeshWorkerRequest): void {
    try {
      for (const worker of this.workers) worker.postMessage(msg);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  initPlanet(planetId: string, m: number, config: PlanetConfig, deltas?: PlanetMeshDeltas): void {
    if (this.disposed) return;
    const msg: WorkerInitPlanetMsg = { type: 'init_planet', planetId, m, config, ...deltas };
    // Only the current planet is meshed. Workers likewise retain only the latest binding.
    this.snapshots.clear();
    this.snapshots.set(planetId, msg);
    if (this.isThreaded) this.broadcast(msg);
    else this.fallback?.(msg);
  }

  updatePlanet(planetId: string, deltas: PlanetMeshDeltas): void {
    if (this.disposed) return;
    const snapshot = this.snapshots.get(planetId);
    if (snapshot) Object.assign(snapshot, deltas);
    const msg: WorkerUpdatePlanetMsg = { type: 'update_planet', planetId, ...deltas };
    if (this.isThreaded) this.broadcast(msg);
    else this.fallback?.(msg);
  }

  buildChunkAsync(planetId: string, chunkKey: number): Promise<ChunkMeshData | null> {
    if (this.disposed) return Promise.reject(new Error('Mesh worker pool disposed'));
    const reqId = this.nextReqId++;
    const req: MeshWorkerRequest = { type: 'build_chunk', reqId, planetId, chunkKey };
    if (!this.isThreaded) {
      // Standalone callers retain compatibility. Streamer directly uses its live columns
      // for fallback, avoiding a second topology and making its synchronous cost explicit.
      try {
        if (!this.fallback) {
          this.fallback = createMeshWorkerHandler();
          for (const snapshot of this.snapshots.values()) this.fallback(snapshot);
        }
        const response = this.fallback(req);
        return Promise.resolve(response?.type === 'chunk_built' ? response.mesh : null);
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('Mesh worker timed out')), 30_000);
      const worker = this.workers.find(candidate => !this.busy.has(candidate)) ??
        this.workers[this.roundRobin++ % this.workers.length];
      this.pending.set(reqId, { resolve, reject, timer, worker });
      this.busy.add(worker);
      try {
        worker.postMessage(req);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    this.fail(new Error('Mesh worker pool disposed'));
    this.snapshots.clear();
    this.fallback = null;
  }
}
