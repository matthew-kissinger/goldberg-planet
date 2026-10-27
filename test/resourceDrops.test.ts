import { describe, expect, it } from 'vitest';
import {
  RESOURCE_DROP_DESPAWN_AGE,
  ageResourceDrops,
  collectReadyResourceDrops,
  despawnAgedResourceDrops,
  nextResourceDropId,
  normalizeResourceDrops,
  spawnItemDrops,
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
    expect(spawnItemDrops(5, 1, Number.NaN, 'wood', 1, 1).drops[0].groundRadius).toBe(0);
    expect(spawnItemDrops(5, 1, -10, 'wood', 1, 1).drops[0].groundRadius).toBe(0);
  });

  it('splits a stack across at most maxStacks drops', () => {
    const spawned = spawnItemDrops(77, 4, 908.2, 'wood', 5, 2);
    expect(spawned.nextId).toBe(6);
    expect(spawned.drops.map((drop) => drop.count)).toEqual([3, 2]);
    expect(spawned.drops.every((drop) => drop.groundRadius === 908.2 && drop.age === 0)).toBe(true);
  });

  it('normalizes save data and drops malformed, duplicate, or retired-item entries', () => {
    const drops = normalizeResourceDrops([
      { id: 3, item: 'wood', count: 2.8, tile: 5, offsetA: 99, offsetB: -99, groundRadius: 910.4, age: 0.5, source: 'tree' },
      { id: 3, item: 'wood', count: 1, tile: 6 },
      { id: 4, item: 'notAnItem', count: 1, tile: 5 },
      { id: 5, item: 'wood', count: 1, tile: 99 },
      { id: 6, item: 'berries', count: 1, tile: 7 },
      { id: 7, item: 'planeFrame', count: 1, tile: 8, age: -2, groundRadius: -5 },
    ], 20);
    expect(drops).toEqual([
      { id: 3, item: 'wood', count: 2, tile: 5, offsetA: 2.4, offsetB: -2.4, groundRadius: 910.4, age: 0.5 },
      { id: 7, item: 'planeFrame', count: 1, tile: 8, offsetA: 0, offsetB: 0, groundRadius: 0, age: 0 },
    ]);
  });

  it('ages drops and collects only ready drops on nearby tiles', () => {
    const start = spawnTreeWoodDrops(12, 1, 903, 3).drops;
    expect(collectReadyResourceDrops(start, new Set([12])).collected).toHaveLength(0);
    const aged = ageResourceDrops(start, 0.95);
    expect(collectReadyResourceDrops(aged, new Set([13])).collected).toHaveLength(0);
    const result = collectReadyResourceDrops(aged, new Set([12]));
    expect(result.remaining).toHaveLength(0);
    expect(result.collected.map((drop) => drop.item)).toEqual(['wood', 'wood', 'wood']);
  });

  it('despawns drops that sit uncollected past the despawn age, leaving fresher drops alone', () => {
    const old = spawnTreeWoodDrops(12, 1, 903, 1).drops;
    const fresh = spawnTreeWoodDrops(13, nextResourceDropId(old), 903, 1).drops;
    const result = despawnAgedResourceDrops([
      ...ageResourceDrops(old, RESOURCE_DROP_DESPAWN_AGE),
      ...ageResourceDrops(fresh, RESOURCE_DROP_DESPAWN_AGE - 10),
    ]);
    expect(result.despawned.map((drop) => drop.tile)).toEqual([12]);
    expect(result.remaining.map((drop) => drop.tile)).toEqual([13]);
  });
});
