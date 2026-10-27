import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';
import { TREE_CHOP_STAGES, Trees } from '../src/world/trees';

function fixtureWorld() {
  const geo = new Goldberg(24);
  const layers = buildLayers();
  const terrain = new Terrain('tree-chopping');
  const columns = new Columns(geo, layers, terrain);
  const trees = new Trees(geo, columns, terrain, 'tree-chopping');
  return { geo, trees };
}

function firstTree(trees: Trees, geo: Goldberg): number {
  for (let tile = 0; tile < geo.count; tile++) if (trees.hasTree(tile)) return tile;
  throw new Error('no trees generated');
}

describe('trees', () => {
  it('fells a tree only after the staged hits land, then it is gone', () => {
    const { geo, trees } = fixtureWorld();
    const tile = firstTree(trees, geo);
    for (let hit = 1; hit < TREE_CHOP_STAGES; hit++) {
      const r = trees.strike(tile);
      expect(r).toMatchObject({ hit: true, felled: false, progress: hit, remaining: TREE_CHOP_STAGES - hit });
      expect(trees.damageOf(tile)).toBeCloseTo(hit / TREE_CHOP_STAGES);
    }
    expect(trees.strike(tile)).toMatchObject({ hit: true, felled: true, remaining: 0 });
    expect(trees.hasTree(tile)).toBe(false);
    expect(trees.damageOf(tile)).toBe(0);
    expect(trees.strike(tile).hit).toBe(false);
  });

  it('generates the same tree field from the same seed', () => {
    const a = fixtureWorld();
    const b = fixtureWorld();
    const live = (t: Trees, g: Goldberg) => [...Array(g.count).keys()].filter((id) => t.hasTree(id));
    expect(live(a.trees, a.geo).length).toBeGreaterThan(50);
    expect(live(a.trees, a.geo)).toEqual(live(b.trees, b.geo));
  });
});
