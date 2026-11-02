import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildFaunaKit, FAUNA_RECIPES } from '../src/render/faunaKit';
import { AureliaFauna, solveFaunaLeg } from '../src/render/aureliaFauna';
import type { Goldberg } from '../src/geo/goldberg';
import type { Columns } from '../src/world/columns';
import type { Terrain } from '../src/world/terrain';
import { makeDefaultPlanetConfig } from '../src/world/planetConfig';
import type { AureliaSpecies } from '../src/world/aureliaFauna';

function fixture(species: AureliaSpecies, step = 0) {
  const scene = new THREE.Scene();
  const config = makeDefaultPlanetConfig('fauna-rig-test'); config.radius = 100; config.ocean.hasOcean = false;
  const geo = { tileOf(x: number) { return step && x > .015 ? 1 : 0; } } as unknown as Goldberg;
  const columns = { layers: { planetRadius: 100, waterSurface: 98, topRadius(k: number) { return 100 + k * step; } }, topLayerOf(tile: number) { return tile; } } as unknown as Columns;
  const terrain = { config, seed: config.seed, aurelia: null, moistureAt() { return .5; }, forestAt() { return .3; } } as unknown as Terrain;
  const fauna = new AureliaFauna(scene, geo, columns, terrain, { zones: [{ id: 'test-herd', species, direction: [0, 1, 0] }] });
  const c = fauna.population.residents[0];
  for (const other of fauna.population.residents.slice(1)) other.hp = 0;
  c.position.set(0, 100, 0); c.home.copy(c.position); c.forward.set(1, 0, 0); c.headingTarget.copy(c.forward); c.behavior = 'forage'; c.timer = 100; c.phase = 0;
  return { scene, fauna, c };
}

describe('authored modular fauna kit and grounded rigs', () => {
  it('has six distinct authored silhouettes, finite closed opaque geometry, and articulated recipes', () => {
    const kit = buildFaunaKit();
    expect(kit.material.transparent).toBe(false);
    expect(kit.material.vertexColors).toBe(true);
    const silhouettes = new Set<string>();
    for (const recipe of Object.values(FAUNA_RECIPES)) {
      const parts = kit.species[recipe.species];
      silhouettes.add(parts.body.boundingBox!.getSize(new THREE.Vector3()).toArray().join(','));
      for (const geometry of Object.values(parts)) if (geometry) {
        const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
        expect(positions.count).toBeGreaterThanOrEqual(6);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        for (let i = 0; i < normals.count; i++) expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 4);
      }
      if (recipe.bodyPlan === 'quadruped') expect(recipe.legs).toHaveLength(4);
      if (recipe.bodyPlan === 'wader') expect(recipe.legs).toHaveLength(2);
      for (const leg of recipe.legs) expect(leg.upper + leg.lower).toBeGreaterThan(leg.hip[1]);
    }
    expect(silhouettes.size).toBe(6);
    kit.dispose();
  });

  it('solves two real segments at rotated gravity and clamps unreachable targets', () => {
    const hip = new THREE.Vector3(100, .3, 0), target = new THREE.Vector3(99.2, .1, .15), pole = new THREE.Vector3(0, 0, -1);
    const knee = new THREE.Vector3(), ankle = new THREE.Vector3();
    expect(solveFaunaLeg(hip, target, pole, .5, .5, knee, ankle)).toBeLessThan(1e-6);
    expect(hip.distanceTo(knee)).toBeCloseTo(.5, 6); expect(knee.distanceTo(ankle)).toBeCloseTo(.5, 6);
    expect(knee.z).toBeLessThan(0);
    expect(solveFaunaLeg(hip, new THREE.Vector3(90, 0, 0), pole, .5, .5, knee, ankle)).toBeGreaterThan(8.9);
    expect(hip.distanceTo(ankle)).toBeLessThan(1);
  });

  it.each(['mantleback', 'reedrunner', 'ridgehook', 'duskprowler'] as const)('%s plants stance feet, articulates knees and preserves contacts across floating origins', species => {
    const { fauna, c } = fixture(species);
    const previous = new Map<number, number[]>(); let plantedSamples = 0, maximumError = 0;
    for (let frame = 0; frame < 300; frame++) {
      c.behavior = 'forage'; c.timer = 100;
      const player = { px: c.position.x, py: c.position.y, pz: c.position.z - 30 };
      fauna.update(1 / 60, frame / 60, player, { x: frame % 2 ? 105 : -204, y: 80, z: -55 }, true);
      for (const contact of fauna.contacts()) {
        maximumError = Math.max(maximumError, contact.error);
        if (contact.planted) {
          plantedSamples++;
          expect(new THREE.Vector3().fromArray(contact.anchor).distanceTo(new THREE.Vector3().fromArray(contact.endpoint))).toBeLessThan(.025);
          const old = previous.get(contact.leg);
          if (old) expect(contact.anchor).toEqual(old);
          previous.set(contact.leg, contact.anchor);
        } else previous.delete(contact.leg);
      }
    }
    expect(plantedSamples).toBeGreaterThan(100);
    expect(maximumError).toBeLessThan(.025);
    expect(c.position.x).toBeGreaterThan(.5);
    const paused = fauna.contacts();
    for (let i = 0; i < 20; i++) fauna.update(0, 50 + i, { px: 0, py: 100, pz: -30 }, { x: 0, y: 100, z: 10 }, true);
    expect(fauna.contacts()).toEqual(paused);
    expect(fauna.stats()).toMatchObject({ occupied: 1, pooledSlots: 48, species: 6, art: 'modular-fauna-v1' });
    fauna.dispose();
  });

  it.each([.25, .625])('adapts contacts on a %sm terrain step without stretching segment lengths', step => {
    const { fauna, c } = fixture('ridgehook', step);
    let contactCount = 0, maxError = 0;
    for (let frame = 0; frame < 600; frame++) {
      c.behavior = 'forage'; c.timer = 100;
      fauna.update(1 / 60, frame / 60, { px: c.position.x, py: c.position.y, pz: -30 }, { x: 0, y: 100, z: 0 }, true);
      for (const contact of fauna.contacts()) if (contact.planted) { contactCount++; maxError = Math.max(maxError, contact.error); }
    }
    expect(c.position.x).toBeGreaterThan(1.5);
    expect(contactCount).toBeGreaterThan(100);
    expect(maxError).toBeLessThan(.03);
    fauna.dispose();
  });

  it.each(['mantleback', 'reedrunner', 'ridgehook', 'duskprowler'] as const)('%s keeps contact under fleeing cadence and a heading change', species => {
    const { fauna, c } = fixture(species);
    let maxError = 0, planted = 0;
    for (let frame = 0; frame < 180; frame++) {
      c.behavior = 'flee'; c.timer = 100;
      fauna.update(1 / 60, frame / 60, { px: c.position.x, py: c.position.y, pz: c.position.z - 25 }, { x: 0, y: 100, z: 0 }, true);
      for (const foot of fauna.contacts()) if (foot.planted) { planted++; maxError = Math.max(maxError, foot.error); }
    }
    expect(c.speed).toBeGreaterThan(2);
    expect(planted).toBeGreaterThan(80);
    expect(maxError).toBeLessThan(.03);
    fauna.dispose();
  });

  it.each([.1, .3, .55, .8])('steps through a180-degree stalk-to-flee reversal at phase%s without dragging a planted leg', phase => {
    const { fauna, c } = fixture('duskprowler');
    for (let frame = 0; frame < 120; frame++) fauna.update(1 / 60, frame / 60, { px: c.position.x + 9, py: c.position.y, pz: c.position.z }, { x: 0, y: 100, z: 0 }, true);
    c.phase = phase; c.behavior = 'flee'; c.timer = 5;
    let maxError = 0, planted = 0, maxTurn = 0;
    const previous = c.forward.clone();
    for (let frame = 0; frame < 240; frame++) {
      previous.copy(c.forward);
      fauna.update(1 / 60, 2 + frame / 60, { px: c.position.x + 9, py: c.position.y, pz: c.position.z }, { x: 0, y: 100, z: 0 }, true);
      maxTurn = Math.max(maxTurn, previous.angleTo(c.forward));
      for (const contact of fauna.contacts()) if (contact.planted) { planted++; maxError = Math.max(maxError, contact.error); }
    }
    expect(maxTurn).toBeLessThan(.04);
    expect(c.forward.x).toBeLessThan(-.9);
    expect(planted).toBeGreaterThan(100);
    expect(maxError).toBeLessThan(.03);
    fauna.dispose();
  });

  it('releases instance resources once, retaining shared geometry until the final world releases it', () => {
    const a = fixture('mantleback'), b = fixture('ridgehook');
    const mesh = a.fauna.group.children[0] as THREE.InstancedMesh;
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose'), instanceDispose = vi.spyOn(mesh, 'dispose');
    a.fauna.dispose(); a.fauna.dispose();
    expect(instanceDispose).toHaveBeenCalledTimes(1); expect(geometryDispose).not.toHaveBeenCalled();
    expect(a.scene.children).toHaveLength(0);
    b.fauna.dispose(); expect(geometryDispose).toHaveBeenCalledTimes(1);
  });
});
