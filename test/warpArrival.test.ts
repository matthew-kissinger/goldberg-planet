import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { Player } from '../src/player/player';
import { SolarSystem } from '../src/world/solarSystem';

describe('deliberate warp arrival state', () => {
  it('brakes dismount velocity in the local gravity frame without moving the player', () => {
    const geo = new Goldberg(4), system = new SolarSystem('dismount-brake', geo), home = system.activePlanet;
    const player = new Player(geo, home.layers, home.columns); player.spawnAt(7);
    const position = [player.px, player.py, player.pz];
    Object.assign(player, { mode: 'plane', inSpaceCruise: true, vx: 1200, vy: -850, vz: 700 });
    player.exitPlane();
    expect(player.mode).toBe('walk'); expect(player.inSpaceCruise).toBe(false);
    expect([player.px, player.py, player.pz]).toEqual(position);
    const u = player.up(), radial = player.vx*u[0]+player.vy*u[1]+player.vz*u[2];
    expect(radial).toBeGreaterThanOrEqual(-8.000001); expect(radial).toBeLessThanOrEqual(4.000001);
    expect(Math.hypot(player.vx,player.vy,player.vz)).toBeLessThan(10);
  });
  it.each(['plane', 'fly'] as const)('lands a former %s traveler at rest without retaining cruise or water state', mode => {
    const geo = new Goldberg(4), system = new SolarSystem('arrival-reset', geo), home = system.activePlanet;
    const player = new Player(geo, home.layers, home.columns);
    player.spawnAt(0);
    Object.assign(player, { mode, vx: 800, vy: -400, vz: 150, pitch: 1.2, inSpaceCruise: true,
      planeSpeed: 950, throttle: 500, holdAGL: 1200, grounded: true, submerged: 3, bank: .6,
      planeStowed: true, stepSmooth: .4, inSafeAura: true, onPentagonWonder: true });
    expect(system.warpToPlanet('planet-1', player, 3, false)).toBe(true);
    expect(system.activePlanet.config.id).toBe('planet-1');
    expect(player.tile).toBe(3);
    expect([player.vx, player.vy, player.vz, player.planeSpeed, player.throttle, player.submerged, player.bank, player.stepSmooth]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(player.mode).toBe('walk'); expect(player.inSpaceCruise).toBe(false);
    expect(player.planeStowed).toBe(false); expect(player.grounded).toBe(false);
    expect(player.inSafeAura).toBe(false); expect(player.onPentagonWonder).toBe(false);
    expect(player.altitudeAGL()).toBeCloseTo(.05, 5);
  });

  it('starts an explicit flight arrival at launch speed even after orbital flight or swimming', () => {
    const geo = new Goldberg(4), system = new SolarSystem('flight-arrival-reset', geo), home = system.activePlanet;
    const player = new Player(geo, home.layers, home.columns); player.spawnAt(0);
    Object.assign(player, { mode: 'plane', vx: 1800, vy: -200, vz: 300, inSpaceCruise: true,
      planeSpeed: 1900, throttle: 1200, submerged: 5 });
    expect(system.warpToPlanet('planet-1', player, 3, true)).toBe(true);
    expect(player.mode).toBe('plane'); expect(player.inSpaceCruise).toBe(false);
    expect(player.planeSpeed).toBeLessThan(30); expect(player.throttle).toBeLessThan(60);
    expect(Math.hypot(player.vx, player.vy, player.vz)).toBeLessThan(30);
    expect(player.holdAGL).toBe(65); expect(player.altitudeAGL()).toBeCloseTo(65.05, 5);
  });
});
