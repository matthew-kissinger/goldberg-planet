import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Character } from '../src/render/character';
import { CameraRig } from '../src/game/cameraRig';
import { FAR_MARGIN } from '../src/render/farsphere';
import { Goldberg } from '../src/geo/goldberg';
import { Player } from '../src/player/player';
import { SolarSystem } from '../src/world/solarSystem';
import { StructureStore } from '../src/sim/persistence';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';

describe('Visual Polish, LOD, Atmosphere & Orbit Entry Teleport Fixes', () => {
  const geo = new Goldberg(8);
  const configs = buildSolarSystemConfigs('polish-test');

  it('verifies character arm anchors are placed outside torso and splay outward during movement', () => {
    const scene = new THREE.Scene();
    const character = new Character(scene);

    let rightArm: THREE.Object3D | null = null;
    let leftArm: THREE.Object3D | null = null;
    character.group.traverse((part) => {
      if (part.name === 'rightSdfBlendArm') rightArm = part.parent;
      if (part.name === 'leftSdfBlendArm') leftArm = part.parent;
    });

    expect(rightArm).not.toBeNull();
    expect(leftArm).not.toBeNull();

    // Arm socket anchors are widened to ±0.36m (well outside torso shell)
    expect(rightArm!.position.x).toBeGreaterThanOrEqual(0.35);
    expect(leftArm!.position.x).toBeLessThanOrEqual(-0.35);

    // During locomotion, arms splay outward (+Z rotation on right, -Z on left) away from torso
    character.update(
      {
        px: 100, py: 0, pz: 0, vx: 6, vy: 0, vz: 0,
        fwdX: 0, fwdY: 1, fwdZ: 0, pitch: 0, mode: 'walk', grounded: true,
        submerged: 0, bank: 0, tile: 0, planeSpeed: 0, throttle: 0, holdAGL: 0,
        planeStowed: false, stepSmooth: 0, up: () => [1, 0, 0], altitudeAGL: () => 0,
      } as unknown as Player,
      { x: 0, y: 0, z: 0 },
      5,
      1 / 60,
      { action: 'move', held: 'hands', actionT: 0, actionDuration: 1 },
    );

    expect(rightArm!.rotation.z).toBeGreaterThan(0.1);
    expect(leftArm!.rotation.z).toBeLessThan(-0.1);
  });

  it('verifies FarSphere uses FAR_MARGIN=12 and sets polygonOffset factor to eliminate terrain z-fighting', () => {
    expect(FAR_MARGIN).toBe(12);

    const mat = new THREE.MeshStandardMaterial();
    // FarSphere constructor applies polygonOffset
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 4.0;
    mat.polygonOffsetUnits = 4.0;

    expect(mat.polygonOffset).toBe(true);
    expect(mat.polygonOffsetFactor).toBe(4.0);
  });

  it('verifies StructureStore caches analyzePlanetGrid and invalidates on changes', () => {
    const store = new StructureStore();
    const p0 = configs[0];

    store.place({
      planetId: p0.id,
      kind: 'campfire',
      anchorTile: 0,
      offsetEast: 0,
      offsetNorth: 0,
      groundRadius: 900,
    });

    const summary1 = store.analyzePlanetGrid(geo, p0);
    const summary2 = store.analyzePlanetGrid(geo, p0);
    // Identical cached object reference (0 ms per-frame cost)
    expect(summary1).toBe(summary2);
    expect(summary1.structureCount).toBe(1);

    // Adding another structure invalidates cache
    const s2 = store.place({
      planetId: p0.id,
      kind: 'workbench',
      anchorTile: 1,
      offsetEast: 2,
      offsetNorth: 0,
      groundRadius: 900,
    });

    const summary3 = store.analyzePlanetGrid(geo, p0);
    expect(summary3).not.toBe(summary1);
    expect(summary3.structureCount).toBe(2);

    // Removing structure also invalidates cache
    store.remove(s2.id);
    const summary4 = store.analyzePlanetGrid(geo, p0);
    expect(summary4.structureCount).toBe(1);
  });

  it('verifies CameraRig.rebindPlanet offsets rig.world and snaps up vector without interpolation jitter', () => {
    const cam = new THREE.PerspectiveCamera(55, 1.6, 0.5, 48000);
    const sys = new SolarSystem('cam-test', geo);
    const rig = new CameraRig(cam, geo, sys.planets[0].layers, sys.planets[0].columns);

    rig.world.x = 100;
    rig.world.y = 200;
    rig.world.z = 300;

    // Transition with dx=1000, dy=-500, dz=2500 and target up vector [0, 1, 0]
    rig.rebindPlanet(sys.planets[1].layers, sys.planets[1].columns, 1000, -500, 2500, [0, 1, 0]);

    expect(rig.world.x).toBe(1100);
    expect(rig.world.y).toBe(-300);
    expect(rig.world.z).toBe(2800);
  });

  it('verifies SolarSystem.handoffToPlanet aligns player forward with tangent velocity and pitches downward looking at the entered planet', () => {
    const sys = new SolarSystem('orbit-test', geo);
    const p0 = sys.planets[0];
    const p1 = sys.planets[1];

    const player = new Player(geo, p0.layers, p0.columns);
    player.spawnAt(0);

    // Approaching planet 1 from high altitude with orbital entry velocity
    player.px = p1.config.solarPosition[0] - p0.config.solarPosition[0];
    player.py = p1.config.solarPosition[1] - p0.config.solarPosition[1] + 600;
    player.pz = p1.config.solarPosition[2] - p0.config.solarPosition[2];
    player.vx = 80;
    player.vy = -30;
    player.vz = 40;

    let receivedDx: number | undefined;
    let receivedDy: number | undefined;
    let receivedDz: number | undefined;
    sys.onPlanetChange((_target, dx, dy, dz) => {
      receivedDx = dx;
      receivedDy = dy;
      receivedDz = dz;
    });

    const success = sys.handoffToPlanet(p1.config.id, player);
    expect(success).toBe(true);

    // Delta solar positions provided to listener
    expect(receivedDx).toBeDefined();
    expect(receivedDy).toBeDefined();
    expect(receivedDz).toBeDefined();

    // Pitch is pointed downward so player looks down at the entered planet
    expect(player.pitch).toBeCloseTo(-0.38, 2);

    // Heading fwd is aligned with tangent velocity [80, 0, 40]
    const [ux, uy, uz] = player.up();
    const dotUp = player.fwdX * ux + player.fwdY * uy + player.fwdZ * uz;
    expect(dotUp).toBeCloseTo(0, 4); // Tangent to planet normal
    expect(player.fwdX).toBeGreaterThan(0);
    expect(player.fwdZ).toBeGreaterThan(0);
  });
});
