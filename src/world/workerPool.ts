/**
 * Web Worker Pool for off-thread chunk mesh generation (`MeshWorkerPool`).
 *
 * Automatically falls back to synchronous in-process execution inside Vitest (`MODE === 'test'`)
 * or environments without `Worker` support.
 */

import type { ChunkMeshData } from '../render/mesher';
import type { PlanetConfig } from './planetConfig';
import type { SerializedColumnEdit } from './columns';
import {
  handleWorkerMessage,
  type MeshWorkerRequest,
  type MeshWorkerResponse,
  type WorkerInitPlanetMsg,
  type WorkerUpdatePlanetMsg,
} from './meshWorker';

export class MeshWorkerPool {
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, (mesh: ChunkMeshData | null) => void>();
  private nextReqId = 1;
  private roundRobin = 0;
  readonly isThreaded: boolean;

  constructor(maxWorkers = 2) {
    const isTest =
      typeof process !== 'undefined' && Boolean((process as { env?: Record<string, string> }).env?.VITEST);
    const canSpawnWorker = typeof Worker !== 'undefined' && !isTest;

    if (canSpawnWorker) {
      const count = Math.max(1, Math.min(maxWorkers, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? Math.floor(navigator.hardwareConcurrency / 2) : 2));
      try {
        for (let i = 0; i < count; i++) {
          const w = new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
          w.onmessage = (ev: MessageEvent<MeshWorkerResponse>) => {
            const msg = ev.data;
            if (msg.type === 'chunk_built') {
              const cb = this.pending.get(msg.reqId);
              if (cb) {
                this.pending.delete(msg.reqId);
                cb(msg.mesh);
              }
            }
          };
          this.workers.push(w);
        }
      } catch {
        // Fallback to in-process execution if bundler/runtime Worker instantiation fails
        this.workers.length = 0;
      }
    }

    this.isThreaded = this.workers.length > 0;
  }

  initPlanet(
    planetId: string,
    m: number,
    config: PlanetConfig,
    deltas?: {
      edits?: SerializedColumnEdit[];
      choppedTrees?: number[];
      treeDamage?: Array<[number, number]>;
      seededEcoTiles?: number[];
    },
  ): void {
    const msg: WorkerInitPlanetMsg = {
      type: 'init_planet',
      planetId,
      m,
      config,
      ...deltas,
    };
    if (this.isThreaded) {
      for (const w of this.workers) w.postMessage(msg);
    } else {
      handleWorkerMessage(msg);
    }
  }

  updatePlanet(
    planetId: string,
    deltas: {
      edits?: SerializedColumnEdit[];
      choppedTrees?: number[];
      treeDamage?: Array<[number, number]>;
      seededEcoTiles?: number[];
    },
  ): void {
    const msg: WorkerUpdatePlanetMsg = {
      type: 'update_planet',
      planetId,
      ...deltas,
    };
    if (this.isThreaded) {
      for (const w of this.workers) w.postMessage(msg);
    } else {
      handleWorkerMessage(msg);
    }
  }

  buildChunkAsync(planetId: string, chunkKey: number): Promise<ChunkMeshData | null> {
    const reqId = this.nextReqId++;
    const req: MeshWorkerRequest = {
      type: 'build_chunk',
      reqId,
      planetId,
      chunkKey,
    };

    if (!this.isThreaded) {
      const res = handleWorkerMessage(req);
      return Promise.resolve(res?.mesh ?? null);
    }

    return new Promise((resolve) => {
      this.pending.set(reqId, resolve);
      const w = this.workers[this.roundRobin % this.workers.length];
      this.roundRobin++;
      w.postMessage(req);
    });
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers.length = 0;
    this.pending.clear();
  }
}
