import { describe, expect, it } from 'vitest';
import {
  RESOURCE_DROP_DESPAWN_AGE,
  ageResourceDrops,
  collectReadyResourceDrops,
  despawnAgedResourceDrops,
  nextResourceDropId,
  normalizeResourceDrops,
  spawnItemDrops,
  spawnMinedItemDrops,
  spawnTreeWoodDrops,
} from '../src/sim/resourceDrops';

describe('resource drop pickups', () => {
  it('spawns deterministic tree wood stacks with stable ids and offsets', () => {
    const a = spawnTreeWoodDrops(42, 10, 905.5, 6);
    const b = spawnTreeWoodDrops(42, 10, 905.5, 6);
    expect(a).toEqual(b);
    expect(a.nextId).toBe(13);
    expect(a.drops.map((drop) => drop.count)).toEqual([2, 2, 2]);
    expect(a.drops.reduce((sum, drop) => sum + drop.count, 0)).toBe(6);
    expect(nextResourceDropId(a.drops)).toBe(13);
  });

  it('caches the ground radius passed at spawn time onto every stack (no live recompute later)', () => {
    const spawned = spawnTreeWoodDrops(42, 10, 912.75, 6);
    expect(spawned.drops.every((drop) => drop.groundRadius === 912.75)).toBe(true);
    // an invalid/omitted radius normalizes to the "not cached yet" sentinel (0), never NaN
    // or a negative value that could put a drop inside the planet.
    const invalid = spawnItemDrops(5, 1, Number.NaN, 'rock', 1, 'mine', 1);
    expect(invalid.drops[0].groundRadius).toBe(0);
    const negative = spawnItemDrops(5, 1, -10, 'rock', 1, 'mine', 1);
    expect(negative.drops[0].groundRadius).toBe(0);
  });

  it('normalizes save data and drops malformed or duplicate entries', () => {
    const drops = normalizeResourceDrops([
      { id: 3, item: 'wood', count: 2.8, tile: 5, offsetA: 99, offsetB: -99, groundRadius: 910.4, age: 0.5, source: 'tree' },
      { id: 3, item: 'wood', count: 1, tile: 6 },
      { id: 4, item: 'notAnItem', count: 1, tile: 5 },
      { id: 5, item: 'rock', count: 1, tile: 99 },
      { id: 6, item: 'berries', count: 1, tile: 7, age: -2, source: 'creature' },
      { id: 7, item: 'rock', count: 1, tile: 8, groundRadius: -5 },
    ], 20);
    expect(drops).toEqual([
      { id: 3, item: 'wood', count: 2, tile: 5, offsetA: 2.4, offsetB: -2.4, groundRadius: 910.4, age: 0.5, source: 'tree' },
      { id: 6, item: 'berries', count: 1, tile: 7, offsetA: 0, offsetB: 0, groundRadius: 0, age: 0, source: 'creature' },
      { id: 7, item: 'rock', count: 1, tile: 8, offsetA: 0, offsetB: 0, groundRadius: 0, age: 0, source: 'tree' },
    ]);
  });

  it('ages drops and collects only ready drops on nearby tiles', () => {
    const start = spawnTreeWoodDrops(12, 1, 903, 3).drops;
    const aged = ageResourceDrops(start, 0.95);
    const early = collectReadyResourceDrops(start, new Set([12]));
    expect(early.collected).toHaveLength(0);
    const result = collectReadyResourceDrops(aged, new Set([12]));
    expect(result.remaining).toHaveLength(0);
    expect(result.collected.map((drop) => drop.item)).toEqual(['wood', 'wood', 'wood']);
  });

  it('despawns drops that sit uncollected past the despawn age, leaving fresher drops alone', () => {
    const old = spawnTreeWoodDrops(12, 1, 903, 1).drops;
    const fresh = spawnMinedItemDrops(13, nextResourceDropId(old), 903, 'rock', 1).drops;
    const aged = [
      ...ageResourceDrops(old, RESOURCE_DROP_DESPAWN_AGE),
      ...ageResourceDrops(fresh, RESOURCE_DROP_DESPAWN_AGE - 10),
    ];
    const result = despawnAgedResourceDrops(aged);
    expect(result.despawned.map((drop) => drop.item)).toEqual(['wood']);
    expect(result.remaining.map((drop) => drop.item)).toEqual(['rock']);
  });

  it('does not despawn drops before they reach the despawn age', () => {
    const drops = ageResourceDrops(spawnMinedItemDrops(9, 1, 903, 'rock', 1).drops, RESOURCE_DROP_DESPAWN_AGE - 1);
    const result = despawnAgedResourceDrops(drops);
    expect(result.despawned).toHaveLength(0);
    expect(result.remaining).toHaveLength(1);
  });

  it('spawns creature item pickups through the generic drop path', () => {
    const spawned = spawnItemDrops(77, 4, 908.2, 'seeds', 2, 'creature', 1);
    expect(spawned.nextId).toBe(5);
    expect(spawned.drops).toMatchObject([
      { id: 4, item: 'seeds', count: 2, tile: 77, groundRadius: 908.2, age: 0, source: 'creature' },
    ]);
  });

  it('spawns mined material and cave-part pickups through the same delayed collection path', () => {
    const rock = spawnMinedItemDrops(18, 20, 906, 'rock', 1);
    expect(rock.nextId).toBe(21);
    expect(rock.drops).toMatchObject([
      { id: 20, item: 'rock', count: 1, tile: 18, groundRadius: 906, age: 0, source: 'mine' },
    ]);

    const crystal = spawnMinedItemDrops(18, rock.nextId, 906, 'glowCrystal', 2);
    expect(crystal.nextId).toBe(23);
    expect(crystal.drops.map((drop) => drop.count)).toEqual([1, 1]);
    expect(crystal.drops.every((drop) => drop.source === 'mine')).toBe(true);

    const early = collectReadyResourceDrops([...rock.drops, ...crystal.drops], new Set([18]));
    expect(early.collected).toHaveLength(0);
    const collected = collectReadyResourceDrops(ageResourceDrops([...rock.drops, ...crystal.drops], 1), new Set([18]));
    expect(collected.collected.map((drop) => drop.item)).toEqual(['rock', 'glowCrystal', 'glowCrystal']);
  });
});
