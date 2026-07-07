import { describe, expect, it } from 'vitest';
import {
  ageResourceDrops,
  collectReadyResourceDrops,
  nextResourceDropId,
  normalizeResourceDrops,
  spawnItemDrops,
  spawnMinedItemDrops,
  spawnTreeWoodDrops,
} from '../src/sim/resourceDrops';

describe('resource drop pickups', () => {
  it('spawns deterministic tree wood stacks with stable ids and offsets', () => {
    const a = spawnTreeWoodDrops(42, 10, 6);
    const b = spawnTreeWoodDrops(42, 10, 6);
    expect(a).toEqual(b);
    expect(a.nextId).toBe(13);
    expect(a.drops.map((drop) => drop.count)).toEqual([2, 2, 2]);
    expect(a.drops.reduce((sum, drop) => sum + drop.count, 0)).toBe(6);
    expect(nextResourceDropId(a.drops)).toBe(13);
  });

  it('normalizes save data and drops malformed or duplicate entries', () => {
    const drops = normalizeResourceDrops([
      { id: 3, item: 'wood', count: 2.8, tile: 5, offsetA: 99, offsetB: -99, age: 0.5, source: 'tree' },
      { id: 3, item: 'wood', count: 1, tile: 6 },
      { id: 4, item: 'notAnItem', count: 1, tile: 5 },
      { id: 5, item: 'rock', count: 1, tile: 99 },
      { id: 6, item: 'berries', count: 1, tile: 7, age: -2, source: 'creature' },
    ], 20);
    expect(drops).toEqual([
      { id: 3, item: 'wood', count: 2, tile: 5, offsetA: 2.4, offsetB: -2.4, age: 0.5, source: 'tree' },
      { id: 6, item: 'berries', count: 1, tile: 7, offsetA: 0, offsetB: 0, age: 0, source: 'creature' },
    ]);
  });

  it('ages drops and collects only ready drops on nearby tiles', () => {
    const start = spawnTreeWoodDrops(12, 1, 3).drops;
    const aged = ageResourceDrops(start, 0.95);
    const early = collectReadyResourceDrops(start, new Set([12]));
    expect(early.collected).toHaveLength(0);
    const result = collectReadyResourceDrops(aged, new Set([12]));
    expect(result.remaining).toHaveLength(0);
    expect(result.collected.map((drop) => drop.item)).toEqual(['wood', 'wood', 'wood']);
  });

  it('spawns creature item pickups through the generic drop path', () => {
    const spawned = spawnItemDrops(77, 4, 'seeds', 2, 'creature', 1);
    expect(spawned.nextId).toBe(5);
    expect(spawned.drops).toMatchObject([
      { id: 4, item: 'seeds', count: 2, tile: 77, age: 0, source: 'creature' },
    ]);
  });

  it('spawns mined material and cave-part pickups through the same delayed collection path', () => {
    const rock = spawnMinedItemDrops(18, 20, 'rock', 1);
    expect(rock.nextId).toBe(21);
    expect(rock.drops).toMatchObject([
      { id: 20, item: 'rock', count: 1, tile: 18, age: 0, source: 'mine' },
    ]);

    const crystal = spawnMinedItemDrops(18, rock.nextId, 'glowCrystal', 2);
    expect(crystal.nextId).toBe(23);
    expect(crystal.drops.map((drop) => drop.count)).toEqual([1, 1]);
    expect(crystal.drops.every((drop) => drop.source === 'mine')).toBe(true);

    const early = collectReadyResourceDrops([...rock.drops, ...crystal.drops], new Set([18]));
    expect(early.collected).toHaveLength(0);
    const collected = collectReadyResourceDrops(ageResourceDrops([...rock.drops, ...crystal.drops], 1), new Set([18]));
    expect(collected.collected.map((drop) => drop.item)).toEqual(['rock', 'glowCrystal', 'glowCrystal']);
  });
});
