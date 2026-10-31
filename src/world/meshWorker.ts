/**
 * Web Worker for off-thread chunk mesh generation (`buildChunkMesh`).
 *
 * Caches shared `Goldberg(m)` topologies and per-planet `Columns`/`Trees` state so
 * chunk rebuilds transfer only zero-copy `Float32Array` vertex buffers back to the main thread.
 */

import { Goldberg } from '../geo/goldberg';
import { buildLayers, type Layers } from './layers';
import { Terrain } from './terrain';
import { Columns, type SerializedColumnEdit } from './columns';
import { Trees } from './trees';
import { enumerateChunks, type ChunkInfo } from './chunks';
import { buildChunkMesh, type ChunkMeshData } from '../render/mesher';
import type { PlanetConfig } from './planetConfig';

export interface WorkerInitPlanetMsg {
  type: 'init_planet';
  planetId: string;
  m: number;
  config: PlanetConfig;
  edits?: SerializedColumnEdit[];
  choppedTrees?: number[];
  treeDamage?: Array<[number, number]>;
  seededEcoTiles?: number[];
}

export interface WorkerUpdatePlanetMsg {
  type: 'update_planet';
  planetId: string;
  edits?: SerializedColumnEdit[];
  choppedTrees?: number[];
  treeDamage?: Array<[number, number]>;
  seededEcoTiles?: number[];
}

export interface WorkerBuildChunkMsg {
  type: 'build_chunk';
  reqId: number;
  planetId: string;
  chunkKey: number;
}

export type MeshWorkerRequest =
  | WorkerInitPlanetMsg
  | WorkerUpdatePlanetMsg
  | WorkerBuildChunkMsg;

export interface MeshWorkerResponse {
  type: 'chunk_built';
  reqId: number;
  mesh: ChunkMeshData | null;
}

interface CachedTopology {
  geo: Goldberg;
  chunks: Map<number, ChunkInfo>;
}

interface WorkerPlanetState {
  m: number;
  config: PlanetConfig;
  layers: Layers;
  terrain: Terrain;
  columns: Columns;
  trees: Trees;
}

const topologies = new Map<number, CachedTopology>();
const planets = new Map<string, WorkerPlanetState>();

function getTopology(m: number): CachedTopology {
  let cached = topologies.get(m);
  if (!cached) {
    const geo = new Goldberg(m);
    const chunks = enumerateChunks(geo);
    cached = { geo, chunks };
    topologies.set(m, cached);
  }
  return cached;
}

function applyDeltas(
  state: WorkerPlanetState,
  msg: Pick<WorkerInitPlanetMsg, 'edits' | 'choppedTrees' | 'treeDamage' | 'seededEcoTiles'>,
): void {
  if (msg.edits) {
    state.columns.importEdits(msg.edits);
  }
  if (msg.seededEcoTiles) {
    state.columns.seededEcoTiles.clear();
    for (const t of msg.seededEcoTiles) state.columns.seededEcoTiles.add(t);
  }
  if (msg.choppedTrees) {
    state.trees.chopped.clear();
    for (const t of msg.choppedTrees) state.trees.chopped.add(t);
  }
  if (msg.treeDamage) {
    state.trees.chopProgress.clear();
    for (const [t, dmg] of msg.treeDamage) state.trees.chopProgress.set(t, dmg);
  }
}

export function handleWorkerMessage(msg: MeshWorkerRequest): MeshWorkerResponse | null {
  if (msg.type === 'init_planet') {
    const { geo } = getTopology(msg.m);
    const layers = buildLayers(msg.config);
    const terrain = new Terrain(msg.config);
    const columns = new Columns(geo, layers, terrain);
    const trees = new Trees(geo, columns, terrain, msg.config.seed);
    const state: WorkerPlanetState = { m: msg.m, config: msg.config, layers, terrain, columns, trees };
    applyDeltas(state, msg);
    planets.set(msg.planetId, state);
    return null;
  }

  if (msg.type === 'update_planet') {
    const state = planets.get(msg.planetId);
    if (state) applyDeltas(state, msg);
    return null;
  }

  if (msg.type === 'build_chunk') {
    const state = planets.get(msg.planetId);
    if (!state) {
      return { type: 'chunk_built', reqId: msg.reqId, mesh: null };
    }
    const { geo, chunks } = getTopology(state.m);
    const chunk = chunks.get(msg.chunkKey);
    if (!chunk) {
      return { type: 'chunk_built', reqId: msg.reqId, mesh: null };
    }
    const mesh = buildChunkMesh(chunk, geo, state.layers, state.columns, state.trees);
    return { type: 'chunk_built', reqId: msg.reqId, mesh };
  }

  return null;
}

// Bind to Web Worker global scope if running inside a browser Worker
if (typeof self !== 'undefined' && typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function' && typeof window === 'undefined') {
  const workerSelf = self as unknown as {
    onmessage: ((ev: MessageEvent<MeshWorkerRequest>) => void) | null;
    postMessage: (message: MeshWorkerResponse, transfer?: Transferable[]) => void;
  };
  workerSelf.onmessage = (ev: MessageEvent<MeshWorkerRequest>) => {
    const res = handleWorkerMessage(ev.data);
    if (!res) return;
    if (res.mesh) {
      workerSelf.postMessage(res, [
        res.mesh.positions.buffer,
        res.mesh.normals.buffer,
        res.mesh.colors.buffer,
        res.mesh.packedMat.buffer,
      ]);
    } else {
      workerSelf.postMessage(res);
    }
  };
}
