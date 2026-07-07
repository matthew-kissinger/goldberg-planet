import { describe, expect, it } from 'vitest';
import { caveResourceAt, type CaveResourceColumns } from '../src/sim/caveResources';

function columnsWith(kind: 'arch' | 'dryCave' | 'seaCave' | null): CaveResourceColumns {
  return {
    naturalVoidAt: (_tile, layer) => {
      if (layer !== 9 || !kind) return null;
      return {
        kind,
        depth: kind === 'dryCave' ? 12 : 5,
        flooded: kind === 'seaCave',
      };
    },
  };
}

describe('Hearth and Horizon cave resource rules', () => {
  it('only drops cave crystals from rock adjacent to real cave voids', () => {
    expect(caveResourceAt(columnsWith('dryCave'), 1, 10, 'dirt')).toBeNull();
    expect(caveResourceAt(columnsWith('arch'), 1, 10, 'rock')).toBeNull();
    expect(caveResourceAt(columnsWith(null), 1, 10, 'rock')).toBeNull();
  });

  it('drops more glow crystal from dry caves than shoreline sea caves', () => {
    expect(caveResourceAt(columnsWith('dryCave'), 1, 10, 'rock')).toMatchObject({
      item: 'glowCrystal',
      amount: 2,
      caveKind: 'dryCave',
      depth: 12,
    });
    expect(caveResourceAt(columnsWith('seaCave'), 1, 10, 'rock')).toMatchObject({
      item: 'glowCrystal',
      amount: 1,
      caveKind: 'seaCave',
      depth: 5,
    });
  });
});
