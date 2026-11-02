import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { AURELIA_SPECIES, AureliaFaunaPopulation, FAUNA_BUDGET, faunaZones, type AureliaSpecies, type FaunaSurface, type FaunaZone } from '../src/world/aureliaFauna';
import type { AureliaBiome } from '../src/world/aurelia';

function surface(biome: AureliaBiome = 'meadow', radius = 100): FaunaSurface {
  return { radius: 100, waterRadius: 98, sample(_direction, out) { out.radius = radius; out.biome = biome; out.tile = 1; } };
}
function zones(species: AureliaSpecies, count = 1): FaunaZone[] {
  return Array.from({ length: count }, (_, i) => ({ id: `herd-${i}`, species, direction: [Math.sin(i * .002), Math.cos(i * .002), 0] }));
}
function playerAt(point: Vector3, distance = 0) { return { px: point.x + distance, py: point.y, pz: point.z }; }

describe('resident fauna simulation', () => {
  it('keeps deterministic IDs, coherent adult/young variation and terrain-appropriate species', () => {
    for (const biome of ['coast', 'meadow', 'woodland', 'wetland', 'highland', 'dryland'] as const) {
      const a = new AureliaFaunaPopulation('sample', surface(biome), faunaZones([]));
      const b = new AureliaFaunaPopulation('sample', surface(biome), faunaZones([]));
      expect(a.exportState()).toEqual(b.exportState());
      expect(a.residents.length).toBeGreaterThan(0);
      expect(a.residents.length).toBeLessThanOrEqual(FAUNA_BUDGET.residents);
      for (const c of a.residents) {
        expect(AURELIA_SPECIES[c.species].habitats).toContain(biome);
        expect(c.size).toBeGreaterThan(.65); expect(c.size).toBeLessThan(1.1);
      }
      expect(a.residents.some(c => c.age < .6)).toBe(true);
    }
    const fish = new AureliaFaunaPopulation('sample', surface('coast', 94), faunaZones([]));
    expect(fish.residents.length).toBeGreaterThan(0);
    expect(fish.residents.every(c => c.species === 'ribbonfin' && c.position.length() < 98)).toBe(true);
  });

  it('bounds AI/render residency and pauses without rerolling or catch-up bursts', () => {
    const allZones = ['mantleback', 'reedrunner', 'ridgehook', 'sailwing', 'duskprowler', 'ribbonfin'] as const;
    const population = new AureliaFaunaPopulation('limits', surface(), allZones.flatMap((species, i) => zones(species, 20).map(z => ({ ...z, id: `${i}-${z.id}` }))));
    const player = { px: 0, py: 100, pz: -30 };
    for (let i = 0; i < 60; i++) population.update(1 / 60, player);
    expect(population.active.length).toBeLessThanOrEqual(24);
    for (const species of allZones) expect(population.active.filter(c => c.species === species).length).toBeLessThanOrEqual(8);
    expect(population.stats().aiDecisions).toBeLessThanOrEqual(24 * 5);
    const before = population.exportState();
    population.update(1000, player, false);
    expect(population.exportState()).toEqual(before);
    population.update(0, { px: 0, py: -100, pz: 0 });
    expect(population.active).toHaveLength(0);
    population.update(0, player);
    expect(population.exportState()).toEqual(before);
    expect(population.active.length).toBeGreaterThan(0);
  });

  it('offers observation and bounded feeding, and persists trust, kills and cooldown', () => {
    const population = new AureliaFaunaPopulation('relations', surface(), zones('mantleback'));
    const c = population.residents[0], player = playerAt(c.position, 5);
    population.update(0, player);
    expect(population.nearbyObservation(player)?.species).toBe('mantleback');
    expect(population.observe(c.id)).toBe(true);
    expect(population.feed(c.id).accepted).toBe(true);
    expect(population.feed(c.id).accepted).toBe(false);
    expect(c.familiarity).toBeCloseTo(.35);
    const saved = population.exportState();
    const restored = new AureliaFaunaPopulation('relations', surface(), zones('mantleback'));
    expect(restored.importState(saved)).toBe(true);
    restored.update(0, player);
    expect(restored.feed(c.id).accepted).toBe(false);
    expect(restored.residents[0].observed).toBe(true);
    const victim = restored.residents[0];
    const center = victim.position.clone().addScaledVector(victim.position.clone().normalize(), .83 * victim.size * .85);
    const eye = center.clone().add(new Vector3(0, 0, -4)), direction = center.clone().sub(eye).normalize();
    const strike = restored.strikeNearest(eye.x, eye.y, eye.z, direction.x, direction.y, direction.z, 10, 7);
    expect(strike).toMatchObject({ hit: true, killed: true, creature: { id: victim.id, hp: 0 } });
    expect(strike.drops).toContainEqual({ item: 'raw_meat', count: 2 });
    const killedSave = restored.exportState();
    const revisit = new AureliaFaunaPopulation('relations', surface(), zones('mantleback'));
    revisit.importState(killedSave); revisit.update(0, player);
    expect(revisit.residents.find(r => r.id === victim.id)?.hp).toBe(0);
    expect(revisit.active.some(r => r.id === victim.id)).toBe(false);
    expect(revisit.importState({ ...saved, seed: 'wrong-planet' })).toBe(false);
  });

  it('responds to proximity with watch/flee/recover and keeps nonpredators harmless', () => {
    const population = new AureliaFaunaPopulation('behavior', surface(), zones('mantleback'));
    const c = population.residents[0];
    for (let i = 0; i < 4; i++) population.update(.1, playerAt(c.position, 10));
    expect(c.behavior).toBe('watch');
    for (let i = 0; i < 4; i++) expect(population.update(.1, playerAt(c.position, 1))).toBe(0);
    expect(c.behavior).toBe('flee');
    for (let i = 0; i < 30; i++) population.update(.1, playerAt(c.position, 35));
    expect(c.behavior).toBe('recover');
    for (let i = 0; i < 40; i++) population.update(.1, playerAt(c.position, 35));
    expect(c.behavior).not.toBe('flee');
  });

  it('makes predator harm explicit, bounded by cooldown, and pauses it with simulation', () => {
    const population = new AureliaFaunaPopulation('predator', surface('woodland'), zones('duskprowler'));
    const c = population.residents[0];
    for (const other of population.residents.slice(1)) other.hp = 0;
    let damage = 0;
    for (let i = 0; i < 10; i++) damage += population.update(.1, playerAt(c.position, 1));
    expect(damage).toBe(6);
    for (let i = 0; i < 20; i++) expect(population.update(0, playerAt(c.position, 1))).toBe(0);
    expect(population.update(1, playerAt(c.position, 1), false)).toBe(0);
  });
});
