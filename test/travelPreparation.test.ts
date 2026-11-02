import { describe, expect, it, vi } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { SolarSystem, type SolarSystemRenderBindings } from '../src/world/solarSystem';
import { Player } from '../src/player/player';
import type { Terrain } from '../src/world/terrain';
import type { Layers } from '../src/world/layers';
import type { PreparationOptions } from '../src/world/preparation';

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  const geo = new Goldberg(4);
  const system = new SolarSystem('async-travel', geo);
  const home = system.activePlanet;
  const player = new Player(geo, home.layers, home.columns);
  player.spawnAt(0);
  const readyFar = new Set([home.terrain]), readyOcean = new Set([home.terrain]);
  const farGates = new Map(system.planets.map(p => [p.terrain, deferred()]));
  const oceanGates = new Map(system.planets.map(p => [p.terrain, deferred()]));
  const rebindFar = vi.fn(), rebindOcean = vi.fn(), rebindChunks = vi.fn();
  const bindings = {
    farSphere: {
      hasPreparedTerrain: (terrain: Terrain) => readyFar.has(terrain),
      prepareTerrain: async (terrain: Terrain, _radius: number, options: PreparationOptions) => {
        options.onProgress?.(0.25);
        await farGates.get(terrain)!.promise;
        // Deliberately permit a late completion: SolarSystem must independently reject it.
        readyFar.add(terrain);
        options.onSlice?.(1.5);
        options.onProgress?.(1);
      },
      rebindTerrain: rebindFar,
    },
    ocean: {
      hasPreparedPlanet: (terrain: Terrain) => readyOcean.has(terrain),
      preparePlanet: async (terrain: Terrain, _layers: Layers, options: PreparationOptions) => {
        await oceanGates.get(terrain)!.promise;
        readyOcean.add(terrain);
        options.onSlice?.(1.75);
        options.onProgress?.(1);
      },
      rebindPlanet: rebindOcean,
    },
    streamer: { rebindPlanet: rebindChunks },
    sky: { applyPlanetConfig: vi.fn() }, terrainMaterial: { applyPlanetConfig: vi.fn() },
  } as unknown as SolarSystemRenderBindings;
  system.bindRenderers(bindings);
  rebindFar.mockClear(); rebindOcean.mockClear(); rebindChunks.mockClear();
  return { system, player, home, farGates, oceanGates, rebindFar, rebindOcean, rebindChunks };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('atomic asynchronously prepared planet travel', () => {
  it('keeps world/player/render bindings unchanged until both destination fields are ready', async () => {
    const f = fixture(), target = f.system.planets[1];
    const before = [f.player.px, f.player.py, f.player.pz];
    const changed = vi.fn();
    f.system.onPlanetChange(changed);
    expect(f.system.warpToPlanet(target.config.id, f.player, 10, false)).toBe(true);
    const completion = f.system.whenTravelSettled();
    expect(f.system.travelState).toMatchObject({ pending: true, targetId: target.config.id, cached: false });
    expect(f.system.activePlanet).toBe(f.home);
    expect([f.player.px, f.player.py, f.player.pz]).toEqual(before);
    expect(f.rebindChunks).not.toHaveBeenCalled();
    f.farGates.get(target.terrain)!.resolve();
    await flush();
    expect(f.system.activePlanet).toBe(f.home);
    expect(f.rebindFar).not.toHaveBeenCalled();
    f.oceanGates.get(target.terrain)!.resolve();
    expect(await completion).toBe(true);
    expect(f.system.activePlanet).toBe(target);
    expect(f.player.tile).toBe(10);
    expect(f.rebindFar).toHaveBeenCalledOnce();
    expect(f.rebindOcean).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
    expect(f.system.travelState).toMatchObject({ pending: false, progress: 1, error: null, maxSliceMs: 1.75 });
    // The initial world was prepared at boot, so a return remains immediate.
    f.system.warpToPlanet(f.home.config.id, f.player, 0, false);
    expect(f.system.activePlanet).toBe(f.home);
    expect(f.system.travelState).toMatchObject({ pending: false, cached: true });
  });

  it('supersedes earlier travel and rejects its late completion', async () => {
    const f = fixture(), first = f.system.planets[1], second = f.system.planets[2];
    const changed = vi.fn();
    f.system.onPlanetChange(changed);
    f.system.warpToPlanet(first.config.id, f.player);
    const stale = f.system.whenTravelSettled();
    f.system.warpToPlanet(second.config.id, f.player);
    const current = f.system.whenTravelSettled();
    f.farGates.get(second.terrain)!.resolve();
    await flush();
    f.oceanGates.get(second.terrain)!.resolve();
    expect(await current).toBe(true);
    f.farGates.get(first.terrain)!.resolve();
    expect(await stale).toBe(false);
    expect(f.system.activePlanet).toBe(second);
    expect(changed).toHaveBeenCalledOnce();
    expect(f.system.travelState.targetId).toBe(second.config.id);
  });

  it('cancels or reports preparation failure without partially switching worlds', async () => {
    const f = fixture(), first = f.system.planets[1], second = f.system.planets[2];
    f.system.warpToPlanet(first.config.id, f.player);
    const cancelled = f.system.whenTravelSettled();
    f.system.cancelTravel();
    f.farGates.get(first.terrain)!.resolve();
    expect(await cancelled).toBe(false);
    expect(f.system.activePlanet).toBe(f.home);
    f.system.warpToPlanet(second.config.id, f.player);
    const failed = f.system.whenTravelSettled();
    f.farGates.get(second.terrain)!.reject(new Error('sample failed'));
    expect(await failed).toBe(false);
    expect(f.system.travelState).toMatchObject({ pending: false, error: 'sample failed' });
    expect(f.system.activePlanet).toBe(f.home);
    expect(f.rebindChunks).not.toHaveBeenCalled();
  });

  it('defers SOI handoff while preserving solar position and velocity across the ready swap', async () => {
    const f = fixture(), target = f.system.planets[1];
    f.player.px = target.config.solarPosition[0] - f.home.config.solarPosition[0];
    f.player.py = target.config.solarPosition[1] - f.home.config.solarPosition[1] + 620;
    f.player.pz = target.config.solarPosition[2] - f.home.config.solarPosition[2];
    f.player.vx = 140; f.player.vy = 25; f.player.vz = -95;
    const position = [f.player.px, f.player.py, f.player.pz];
    expect(f.system.update(f.player, 0, 0, 0)).toBeNull();
    const completion = f.system.whenTravelSettled();
    expect(f.system.travelState).toMatchObject({ pending: true, kind: 'handoff' });
    expect([f.player.px, f.player.py, f.player.pz]).toEqual(position);
    f.system.update(f.player, 0, 0, 0);
    expect(f.system.whenTravelSettled()).toBe(completion);
    f.farGates.get(target.terrain)!.resolve();
    await flush();
    f.oceanGates.get(target.terrain)!.resolve();
    expect(await completion).toBe(true);
    expect([f.player.px, f.player.py, f.player.pz]).toEqual([0, 620, 0]);
    expect([f.player.vx, f.player.vy, f.player.vz]).toEqual([140, 25, -95]);
  });
});
