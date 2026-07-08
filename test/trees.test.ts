import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';
import { Trees, type TreeVisualKind } from '../src/world/trees';

function fixtureWorld() {
  const geo = new Goldberg(24);
  const layers = buildLayers();
  const terrain = new Terrain('tree-classification');
  const columns = new Columns(geo, layers, terrain);
  const trees = new Trees(geo, columns, terrain, 'tree-classification');
  return { geo, trees };
}

function firstLiveTreeByKind(trees: Trees, geo: Goldberg): Map<TreeVisualKind, number> {
  const byKind = new Map<TreeVisualKind, number>();
  for (let tile = 0; tile < geo.count; tile += 1) {
    if (!trees.hasTree(tile)) continue;
    const kind = trees.visualKindFor(tile);
    if (!byKind.has(kind)) byKind.set(kind, tile);
  }
  return byKind;
}

describe('trees', () => {
  it('classifies the generated tree field into the four approved visual kinds', () => {
    const { geo, trees } = fixtureWorld();
    const byKind = firstLiveTreeByKind(trees, geo);

    expect([...byKind.keys()].sort()).toEqual(['broadleaf', 'deadSnag', 'pine', 'shrub']);
  });
});
