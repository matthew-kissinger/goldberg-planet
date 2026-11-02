import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { Columns } from '../src/world/columns';
import { buildLayers } from '../src/world/layers';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';
import { Terrain } from '../src/world/terrain';
import { Trees } from '../src/world/trees';
import { Streamer } from '../src/world/streamer';
import { MeshWorkerPool, type MeshBuildPool, type PlanetMeshDeltas } from '../src/world/workerPool';
import type { MeshWorkerRequest, MeshWorkerResponse } from '../src/world/meshWorker';
import { createMeshWorkerHandler } from '../src/world/meshWorker';
import * as mesher from '../src/render/mesher';
import { FarSphere } from '../src/render/farsphere';

function meshData(triangles = 1): mesher.ChunkMeshData {
  return {
    positions: new Float32Array(triangles * 9), normals: new Float32Array(triangles * 9),
    colors: new Float32Array(triangles * 9), packedMat: new Float32Array(triangles * 3),
    anchor: [10, 20, 30], triangles,
  };
}

class ControlledPool implements MeshBuildPool {
  isThreaded = true;
  concurrency = 2;
  buildSamples: number[] = [];
  events: string[] = [];
  updates: PlanetMeshDeltas[] = [];
  jobs: Array<{ planetId: string; key: number; resolve: (mesh: mesher.ChunkMeshData | null) => void; reject: (err: Error) => void }> = [];
  initPlanet(planetId: string): void { this.events.push(`init:${planetId}`); }
  updatePlanet(_planetId: string, deltas: PlanetMeshDeltas): void {
    this.events.push('update'); this.updates.push(deltas);
  }
  buildChunkAsync(planetId: string, key: number): Promise<mesher.ChunkMeshData | null> {
    this.events.push('build');
    return new Promise((resolve, reject) => this.jobs.push({ planetId, key, resolve, reject }));
  }
  dispose(): void {
    for (const job of this.jobs) job.reject(new Error('disposed'));
  }
}

const disposables: Streamer[] = [];
afterEach(() => {
  for (const streamer of disposables.splice(0)) streamer.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture(pool = new ControlledPool()) {
  const geo = new Goldberg(8);
  const configs = buildSolarSystemConfigs('streaming-test');
  const terrain = new Terrain(configs[0]);
  const layers = buildLayers(configs[0]);
  const columns = new Columns(geo, layers, terrain);
  const trees = new Trees(geo, columns, terrain, configs[0].seed);
  const scene = new THREE.Scene();
  const streamer = new Streamer(geo, layers, columns, scene, new THREE.MeshBasicMaterial(), trees, pool);
  disposables.push(streamer);
  return { geo, configs, layers, columns, trees, scene, streamer, pool };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('bounded asynchronous terrain streaming', () => {
  it('primes admitted chunks before culling, retaining the prime through shadow-only draws', async () => {
    const { streamer, pool, scene } = fixture();
    const info = streamer.list[0];
    streamer.buildChunk(info); streamer.pump(100, 1);
    pool.jobs[0].resolve(meshData()); await flush(); streamer.pump(100, 1);
    const mesh = streamer.resident.get(info.key)!.mesh!;
    expect(mesh.frustumCulled).toBe(false);
    const shadowMaterial = new THREE.MeshBasicMaterial();
    mesh.onAfterRender(null!,scene,new THREE.PerspectiveCamera(),mesh.geometry,shadowMaterial,null!);
    expect(mesh.frustumCulled).toBe(false);
    mesh.onAfterRender(null!,scene,new THREE.PerspectiveCamera(),mesh.geometry,mesh.material as THREE.Material,null!);
    expect(mesh.frustumCulled).toBe(true);
    expect(mesh.onAfterRender).toBe(THREE.Object3D.prototype.onAfterRender);
    shadowMaterial.dispose();
  });
  it('holds completed fine geometry in orbit and resumes bounded admission on descent', async () => {
    const { streamer, pool } = fixture();
    streamer.buildChunk(streamer.list[0]); streamer.buildChunk(streamer.list[1]);
    streamer.pump(100, 2);
    expect(pool.jobs).toHaveLength(2);
    streamer.updateRenderDistance(1200);
    for (const job of pool.jobs) job.resolve(meshData());
    await flush();
    for (let frame = 0; frame < 10; frame++) expect(streamer.pump(100, 1)).toBe(0);
    expect(streamer.resident.size).toBe(0);
    expect(pool.jobs).toHaveLength(2);
    streamer.updateRenderDistance(800);
    expect(streamer.pump(100, 1)).toBe(1);
    expect(streamer.resident.size).toBe(1);
    expect(streamer.pump(100, 1)).toBe(1);
    expect(streamer.resident.size).toBe(2);
  });
  it('hands orbital coverage back to the far mesh while preserving resident edits and applying hysteresis', async () => {
    const { geo, columns, streamer, pool } = fixture();
    const info = streamer.list[0];
    streamer.buildChunk(info); streamer.pump(100, 1);
    pool.jobs[0].resolve(meshData()); await flush(); streamer.pump(100, 1);
    const resident = streamer.resident.get(info.key)!, originalMesh = resident.mesh!;
    const far = await FarSphere.build(geo, geo, columns.terrain, new THREE.MeshStandardMaterial());
    far.setResidentChunks(streamer.renderedKeys());
    const detailedCount = far.mesh.geometry.drawRange.count;
    expect(detailedCount).toBeLessThan(far.triangles * 3);
    const tile = info.tiles[0], layer = columns.topLayerOf(tile);
    expect(columns.mine(tile, layer)).toBe(true);
    const edit = columns.editOf(tile);
    expect(streamer.updateRenderDistance(1000)).toBe(true);
    far.setResidentChunks(streamer.renderedKeys());
    expect(far.mesh.geometry.drawRange.count).toBe(far.triangles * 3);
    expect(originalMesh.visible).toBe(false);
    expect(streamer.residentKeys().has(info.key)).toBe(true);
    expect(columns.editOf(tile)).toBe(edit);
    expect(columns.solidAt(tile, layer)).toBe(false);
    expect(streamer.updateRenderDistance(900)).toBe(false);
    expect(streamer.detailedRendering).toBe(false);
    expect(streamer.updateRenderDistance(800)).toBe(true);
    far.setResidentChunks(streamer.renderedKeys());
    expect(far.mesh.geometry.drawRange.count).toBe(detailedCount);
    expect(streamer.resident.get(info.key)!.mesh).toBe(originalMesh);
    expect(originalMesh.visible).toBe(true);
    expect(streamer.updateRenderDistance(900)).toBe(false);
    expect(streamer.detailedRendering).toBe(true);
  });

  it('holds delayed installs in orbit and rejects their stale revision after an edit', async () => {
    const { streamer, pool } = fixture();
    const info = streamer.list[0];
    streamer.buildChunk(info); streamer.pump(100, 1);
    streamer.updateRenderDistance(1100);
    pool.jobs[0].resolve(meshData()); await flush(); streamer.pump(100, 1);
    expect(streamer.resident.has(info.key)).toBe(false);
    expect(streamer.renderedKeys().size).toBe(0);
    streamer.rebuildNow(info.key); streamer.pump(100, 1);
    expect(pool.jobs).toHaveLength(1);
    streamer.updateRenderDistance(750);
    streamer.pump(100, 1);
    expect(streamer.resident.has(info.key)).toBe(false);
    pool.jobs[1].resolve(meshData(2)); await flush(); streamer.pump(100, 1);
    expect(streamer.resident.get(info.key)!.triangles).toBe(2);
    expect(streamer.resident.get(info.key)!.mesh!.visible).toBe(true);
  });

  it('dispatches off-thread with backpressure and installs only the requested completion count', async () => {
    const { streamer, pool } = fixture();
    const build = vi.spyOn(mesher, 'buildChunkMesh');
    for (const info of streamer.list.slice(0, 5)) streamer.buildChunk(info);
    expect(streamer.pump(100, 4)).toBe(0);
    expect(pool.jobs).toHaveLength(2);
    expect(streamer.stats()).toMatchObject({ queued: 5, pending: 2, ready: 0, resident: 0 });
    streamer.pump(100, 4);
    expect(pool.jobs).toHaveLength(2);
    pool.jobs[0].resolve(meshData());
    pool.jobs[1].resolve(meshData());
    await flush();
    expect(streamer.stats()).toMatchObject({ ready: 2, pending: 0, resident: 0 });
    expect(streamer.pump(100, 1)).toBe(1);
    expect(streamer.stats()).toMatchObject({ resident: 1, ready: 1, pending: 1 });
    expect(build).not.toHaveBeenCalled();
  });

  it('rejects a pre-edit result and synchronizes current edits before its replacement job', async () => {
    const { streamer, pool, columns, trees } = fixture();
    const info = streamer.list[0];
    const tile = info.tiles[0];
    streamer.buildChunk(info);
    streamer.pump(100, 1);
    columns.mine(tile, columns.topLayerOf(tile));
    trees.chopped.add(tile);
    columns.seededEcoTiles.add(tile);
    streamer.rebuildTile(tile);
    pool.jobs[0].resolve(meshData(1));
    await flush();
    expect(streamer.resident.size).toBe(0);
    streamer.pump(100, 1);
    expect(pool.events.slice(-2)).toEqual(['update', 'build']);
    expect(pool.updates.at(-1)).toMatchObject({ choppedTrees: [tile], seededEcoTiles: [tile] });
    expect(pool.updates.at(-1)!.edits).toHaveLength(1);
    pool.jobs[1].resolve(meshData(2));
    await flush();
    streamer.pump(100, 1);
    expect(streamer.stats().triangles).toBe(2);
  });

  it('retains the old mesh through a rebuild and swaps without changing proxy residency', async () => {
    const { streamer, pool } = fixture();
    const info = streamer.list[0];
    streamer.buildChunk(info);
    streamer.pump(100, 1);
    pool.jobs[0].resolve(meshData(1));
    await flush();
    streamer.pump(100, 1);
    const old = streamer.resident.get(info.key)!.mesh!;
    const dispose = vi.spyOn(old.geometry, 'dispose');
    streamer.residencyDirty = false;
    streamer.rebuildTile(info.tiles[0]);
    streamer.pump(100, 1);
    expect(streamer.resident.get(info.key)!.mesh).toBe(old);
    expect(dispose).not.toHaveBeenCalled();
    streamer.updateTransforms(4, 5, 6);
    pool.jobs[1].resolve(meshData(3));
    await flush();
    streamer.pump(100, 1);
    expect(dispose).toHaveBeenCalledOnce();
    expect(streamer.resident.get(info.key)!.mesh!.position.toArray()).toEqual([6, 15, 24]);
    expect(streamer.stats().triangles).toBe(3);
    expect(streamer.residencyDirty).toBe(false);
    expect(streamer.loads).toBe(1);
    expect(streamer.releases).toBe(0);
  });

  it('discards old-planet results even when the new planet requests the same chunk key', async () => {
    const { streamer, pool, configs, geo } = fixture();
    const info = streamer.list[0];
    streamer.buildChunk(info);
    streamer.pump(100, 1);
    const terrain = new Terrain(configs[1]);
    const layers = buildLayers(configs[1]);
    const columns = new Columns(geo, layers, terrain);
    streamer.rebindPlanet(layers, columns, new Trees(geo, columns, terrain, configs[1].seed));
    streamer.buildChunk(info);
    streamer.pump(100, 1);
    expect(pool.jobs).toHaveLength(2);
    pool.jobs[0].resolve(meshData(99));
    await flush();
    streamer.pump(100, 1);
    expect(streamer.resident.size).toBe(0);
    pool.jobs[1].resolve(meshData(2));
    await flush();
    streamer.pump(100, 1);
    expect(streamer.stats()).toMatchObject({ resident: 1, triangles: 2, queued: 0, pending: 0 });
  });

  it('invalidates resident and in-flight meshes after a full co-op snapshot', async () => {
    const { streamer, pool, trees } = fixture();
    const first = streamer.list[0], second = streamer.list[1];
    streamer.buildChunk(first);
    streamer.pump(100, 1);
    pool.jobs[0].resolve(meshData());
    await flush();
    streamer.pump(100, 1);
    const previous = streamer.resident.get(first.key)!.mesh;
    streamer.buildChunk(second);
    streamer.pump(100, 1);
    trees.chopped.add(first.tiles[0]);
    trees.chopped.add(second.tiles[0]);
    streamer.invalidateAll();
    expect(streamer.resident.get(first.key)!.mesh).toBe(previous);
    pool.jobs[1].resolve(meshData(99));
    await flush();
    streamer.pump(100, 4);
    expect(streamer.stats().triangles).toBe(1);
    expect(pool.updates.at(-1)!.choppedTrees).toEqual([...trees.chopped]);
    expect(pool.jobs).toHaveLength(4);
    pool.jobs[2].resolve(meshData(2));
    pool.jobs[3].resolve(meshData(3));
    await flush();
    streamer.pump(100, 4);
    expect(streamer.stats()).toMatchObject({ resident: 2, triangles: 5, queued: 0 });
  });

  it('invalidates pending residency on clear and settles worker failure into the explicit fallback', async () => {
    const { streamer, pool } = fixture();
    streamer.buildChunk(streamer.list[0]);
    streamer.pump(100, 1);
    streamer.clearAllResident();
    pool.jobs[0].resolve(meshData());
    await flush();
    streamer.pump(100, 1);
    expect(streamer.stats()).toMatchObject({ resident: 0, queued: 0 });
    streamer.buildChunk(streamer.list[0]);
    streamer.pump(100, 1);
    pool.isThreaded = false;
    pool.jobs[1].reject(new Error('worker unavailable'));
    await flush();
    expect(streamer.pump(100, 1)).toBe(1);
    expect(streamer.stats()).toMatchObject({ resident: 1, pending: 0, queued: 0, threaded: false });
  });
});

class FakeWorker {
  onmessage: ((ev: MessageEvent<MeshWorkerResponse>) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: MeshWorkerRequest[] = [];
  terminated = false;
  postMessage(msg: MeshWorkerRequest): void { this.messages.push(msg); }
  terminate(): void { this.terminated = true; }
  reply(data: MeshWorkerResponse): void { this.onmessage?.({ data } as MessageEvent<MeshWorkerResponse>); }
}

describe('mesh worker lifecycle', () => {
  it('produces byte-identical geometry to the live field after restoring sparse edits', () => {
    const { geo, configs, columns, trees, layers, streamer } = fixture();
    const info = streamer.list[0];
    const tile = info.tiles[0];
    columns.mine(tile, columns.topLayerOf(tile));
    columns.seededEcoTiles.add(info.tiles[1]);
    trees.chopped.add(info.tiles[2]);
    trees.chopProgress.set(info.tiles[3], 2);
    const handler = createMeshWorkerHandler();
    handler({ type: 'init_planet', planetId: configs[0].id, m: geo.m, config: configs[0] });
    handler({
      type: 'update_planet', planetId: configs[0].id, edits: columns.exportEdits(),
      seededEcoTiles: [...columns.seededEcoTiles], choppedTrees: [...trees.chopped], treeDamage: [...trees.chopProgress],
    });
    const worker = handler({ type: 'build_chunk', reqId: 1, planetId: configs[0].id, chunkKey: info.key })!.mesh!;
    const direct = mesher.buildChunkMesh(info, geo, layers, columns, trees)!;
    expect(worker.triangles).toBe(direct.triangles);
    expect(worker.anchor).toEqual(direct.anchor);
    for (const attr of ['positions', 'normals', 'colors', 'packedMat'] as const) {
      expect(Buffer.from(worker[attr].buffer).equals(Buffer.from(direct[attr].buffer)), attr).toBe(true);
    }
  });

  it('settles every pending request and terminates all workers on an asynchronous error', async () => {
    const workers: FakeWorker[] = [];
    const pool = new MeshWorkerPool(2, () => {
      const w = new FakeWorker(); workers.push(w); return w as unknown as Worker;
    });
    const first = pool.buildChunkAsync('planet-0', 0);
    const second = pool.buildChunkAsync('planet-0', 1);
    const results = Promise.allSettled([first, second]);
    workers[0].onerror?.({ message: 'failed', preventDefault() {} } as ErrorEvent);
    expect((await results).every(result => result.status === 'rejected')).toBe(true);
    expect(pool.isThreaded).toBe(false);
    expect(workers.every(worker => worker.terminated)).toBe(true);
    pool.dispose();
  });

  it('cleans up partially created pools, times out hung builds, and rejects pending work on disposal', async () => {
    const first = new FakeWorker();
    let calls = 0;
    const partial = new MeshWorkerPool(2, () => {
      if (++calls > 1) throw new Error('creation failed');
      return first as unknown as Worker;
    });
    expect(partial.isThreaded).toBe(false);
    expect(first.terminated).toBe(true);
    partial.dispose();

    vi.useFakeTimers();
    const hung = new FakeWorker();
    const pool = new MeshWorkerPool(1, () => hung as unknown as Worker);
    const timedOut = pool.buildChunkAsync('planet-0', 0).catch(error => error.message);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await timedOut).toContain('timed out');
    expect(hung.terminated).toBe(true);
    pool.dispose();

    const worker = new FakeWorker();
    const disposed = new MeshWorkerPool(1, () => worker as unknown as Worker);
    const pending = disposed.buildChunkAsync('planet-0', 0).catch(error => error.message);
    disposed.dispose();
    expect(await pending).toContain('disposed');
    await expect(disposed.buildChunkAsync('planet-0', 0)).rejects.toThrow('disposed');
  });

  it('records completed worker CPU timing and frees the worker for another request', async () => {
    const worker = new FakeWorker();
    const pool = new MeshWorkerPool(1, () => worker as unknown as Worker);
    const result = pool.buildChunkAsync('planet-0', 0);
    const req = worker.messages[0];
    if (req.type !== 'build_chunk') throw new Error('missing build request');
    worker.reply({ type: 'chunk_built', reqId: req.reqId, mesh: meshData(), buildMs: 42 });
    expect((await result)?.triangles).toBe(1);
    expect(pool.buildSamples).toEqual([42]);
    pool.dispose();
  });
});
