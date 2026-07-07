import { describe, expect, it } from 'vitest';
import { MineProgress, miningPowerForTool, miningStagesForMaterial, normalizeMineProgress } from '../src/sim/mining';
import { bestToolForMaterial } from '../src/sim/tools';

describe('staged terrain mining', () => {
  it('cracks material cells before the final mined hit', () => {
    const mining = new MineProgress();
    const needed = miningStagesForMaterial('rock');

    const first = mining.strike(12, 4, 1, needed);
    expect(first).toMatchObject({ hit: true, mined: false, remaining: 3 });
    expect(mining.damageOf(12, 4)).toBeCloseTo(0.25);

    const second = mining.strike(12, 4, 1, needed);
    expect(second.mined).toBe(false);
    expect(second.damage).toBeCloseTo(0.5);

    const third = mining.strike(12, 4, 2, needed);
    expect(third.mined).toBe(true);
    expect(mining.damageOf(12, 4)).toBe(0);
  });

  it('lets matching tools reduce visible strike count without changing material rules', () => {
    const hands = bestToolForMaterial('rock', {});
    const pick = bestToolForMaterial('rock', { stonePick: 1 });
    const echo = bestToolForMaterial('rock', { echoPick: 1 });

    expect(miningStagesForMaterial('dirt')).toBe(2);
    expect(miningStagesForMaterial('wood')).toBe(3);
    expect(miningStagesForMaterial('rock')).toBe(4);
    expect(miningPowerForTool('rock', hands)).toBe(1);
    expect(miningPowerForTool('rock', pick)).toBeGreaterThan(1);
    expect(miningPowerForTool('rock', echo)).toBeGreaterThan(miningPowerForTool('rock', pick));
  });

  it('normalizes save data and filters mined or invalid cells', () => {
    const normalized = normalizeMineProgress([
      { tile: 4, layer: 2, progress: 1.4, needed: 4 },
      { tile: 4, layer: 2, progress: 2.4 },
      { tile: 5, layer: 2, progress: 99, needed: 99 },
      { tile: 6, layer: 2, progress: -1 },
      { tile: 99, layer: 2, progress: 1 },
    ], 10, 8, (tile) => tile !== 5);

    expect(normalized).toEqual([
      { tile: 4, layer: 2, progress: 1.4, needed: 4 },
    ]);
  });
});
