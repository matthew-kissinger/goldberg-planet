import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { SolarSystem } from '../src/world/solarSystem';
import { Player } from '../src/player/player';

describe('SolarSystem multi-planet state & Sphere of Influence (SOI) handoff', () => {
  const geo = new Goldberg(8);

  it('creates 6 isolated planets sharing one Goldberg topology and computes nav telemetry', () => {
    const sys = new SolarSystem('sys-seed', geo);
    expect(sys.planets.length).toBe(6);
    expect(sys.activePlanet.config.id).toBe('planet-0');

    const p0 = sys.planets[0];
    const p1 = sys.planets[1];
    // Editing a column on planet 0 never leaks to planet 1
    const top0 = p0.columns.topLayerOf(10);
    expect(p0.columns.mine(10, top0)).toBe(true);
    expect(p0.columns.editOf(10)).toBeDefined();
    expect(p1.columns.editOf(10)).toBeUndefined();

    const player = new Player(geo, p0.layers, p0.columns);
    player.spawnAt(0);
    const nav = sys.navTelemetry(player);
    expect(nav.length).toBe(6);
    expect(nav[0].isActive).toBe(true);
    expect(nav[1].isActive).toBe(false);
    expect(nav[1].distanceMeters).toBeGreaterThan(2000);
  });

  it('conserves solar-system position and velocity during SOI floating-origin handoff', () => {
    const sys = new SolarSystem('soi-seed', geo);
    const p0 = sys.planets[0];
    const p1 = sys.planets[1]; // Vespera Shard at [3600, 950, -2800]

    const player = new Player(geo, p0.layers, p0.columns);
    // Position the player just inside Vespera Shard's SOI (radius 420 * 2.15 = 903m)
    const offsetFromP1: [number, number, number] = [0, 620, 0];
    player.px = p1.config.solarPosition[0] - p0.config.solarPosition[0] + offsetFromP1[0];
    player.py = p1.config.solarPosition[1] - p0.config.solarPosition[1] + offsetFromP1[1];
    player.pz = p1.config.solarPosition[2] - p0.config.solarPosition[2] + offsetFromP1[2];
    player.vx = 140;
    player.vy = 25;
    player.vz = -95;

    const solarBefore = [
      p0.config.solarPosition[0] + player.px,
      p0.config.solarPosition[1] + player.py,
      p0.config.solarPosition[2] + player.pz,
    ];

    const switched = sys.update(player, 0, 0, 0);
    expect(switched).not.toBeNull();
    expect(switched!.config.id).toBe('planet-1');
    expect(sys.activePlanet.config.id).toBe('planet-1');

    const solarAfter = [
      p1.config.solarPosition[0] + player.px,
      p1.config.solarPosition[1] + player.py,
      p1.config.solarPosition[2] + player.pz,
    ];
    expect(solarAfter[0]).toBeCloseTo(solarBefore[0], 6);
    expect(solarAfter[1]).toBeCloseTo(solarBefore[1], 6);
    expect(solarAfter[2]).toBeCloseTo(solarBefore[2], 6);
    expect(player.px).toBeCloseTo(offsetFromP1[0], 6);
    expect(player.py).toBeCloseTo(offsetFromP1[1], 6);
    expect(player.pz).toBeCloseTo(offsetFromP1[2], 6);
    expect(player.vx).toBe(140);
  });

  it('transitions into 3D space cruise above karmanAGL and tracks survival shield hazards', () => {
    const sys = new SolarSystem('flight-seed', geo);
    const p1 = sys.planets[1]; // Vespera Shard (vacuum hazard, requiredSuitTier = 1, karmanAGL = 130)
    const player = new Player(geo, p1.layers, p1.columns);
    player.spawnAt(0); // Tile 0 is a Pentagon Wonder
    player.enterPlane();

    // Climb above karmanAGL (130m)
    const [ux, uy, uz] = player.up();
    player.px += ux * 180;
    player.py += uy * 180;
    player.pz += uz * 180;

    player.update(0.1, {
      forward: 1,
      strafe: 0,
      upDown: 0,
      sprint: true,
      jump: false,
      swimUp: false,
    });

    expect(player.inSpaceCruise).toBe(true);
    expect(player.onPentagonWonder).toBe(true);
    // Unshielded on vacuum moon drains suitShield
    expect(player.suitShield).toBeLessThan(100);

    // Upgrading suitTier or entering a powered dome recharges suitShield
    player.suitTier = 1;
    player.update(1.0, {
      forward: 0,
      strafe: 0,
      upDown: 0,
      sprint: false,
      jump: false,
      swimUp: false,
    });
    expect(player.suitShield).toBe(100);
  });
});
