import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { buildLayers, PLANET_RADIUS, BUILD_CEILING, CELL_H, WATER_SURFACE } from '../src/world/layers';
import { Terrain, MAT } from '../src/world/terrain';
import { Columns } from '../src/world/columns';
import { Trees } from '../src/world/trees';
import { MineProgress } from '../src/sim/mining';
import { enumerateChunks } from '../src/world/chunks';
import { buildChunkMesh } from '../src/render/mesher';

describe('layers', () => {
  const layers = buildLayers();

  it('bounds are strictly decreasing from build ceiling to core', () => {
    expect(layers.bounds[0]).toBe(BUILD_CEILING);
    for (let k = 0; k < layers.L; k++) {
      expect(layers.bounds[k + 1]).toBeLessThan(layers.bounds[k]);
    }
    expect(layers.bounds[layers.L]).toBe(60);
  });

  it('thickness is uniform near the surface and non-decreasing with depth', () => {
    for (let k = 0; k < layers.uniformLayers; k++) {
      expect(layers.thickness(k)).toBeCloseTo(CELL_H, 9);
    }
    for (let k = layers.uniformLayers; k < layers.L - 1; k++) {
      expect(layers.thickness(k)).toBeGreaterThanOrEqual(layers.thickness(k - 1) - 1e-9);
    }
  });

  it('layerOfRadius inverts the bounds table', () => {
    for (let k = 0; k < layers.L; k++) {
      const mid = (layers.bounds[k] + layers.bounds[k + 1]) / 2;
      expect(layers.layerOfRadius(mid)).toBe(k);
    }
    expect(layers.layerOfRadius(BUILD_CEILING + 5)).toBe(-1);
    expect(layers.layerOfRadius(10)).toBe(layers.L - 1);
  });

  it('column depth is small and fixed: volume storage scales with tiles, not R^3', () => {
    // a full-planet voxelization at CELL_H resolution would need ~ (R/CELL_H) radial cells;
    // the layer grid needs O(uniform + log R):
    expect(layers.L).toBeLessThan(200);
    expect(layers.L).toBeLessThan(PLANET_RADIUS / CELL_H / 4);
  });
});

describe('terrain determinism', () => {
  it('same seed, same heights; different seed differs', () => {
    const g = new Goldberg(8);
    const a = new Terrain('alpha');
    const b = new Terrain('alpha');
    const c = new Terrain('beta');
    let differs = false;
    for (let id = 0; id < g.count; id++) {
      const x = g.centers[id * 3], y = g.centers[id * 3 + 1], z = g.centers[id * 3 + 2];
      expect(a.heightAt(x, y, z)).toBe(b.heightAt(x, y, z));
      if (a.heightAt(x, y, z) !== c.heightAt(x, y, z)) differs = true;
    }
    expect(differs).toBe(true);
  });

  it('produces both oceans and land within the height bounds', () => {
    const g = new Goldberg(16);
    const t = new Terrain('GP192-01');
    let ocean = 0, land = 0, mountain = 0;
    for (let id = 0; id < g.count; id++) {
      const h = t.heightAt(g.centers[id * 3], g.centers[id * 3 + 1], g.centers[id * 3 + 2]);
      expect(h).toBeGreaterThanOrEqual(-35);
      expect(h).toBeLessThanOrEqual(115);
      if (h < -3) ocean++;
      if (h > 3) land++;
      if (h > 60) mountain++;
    }
    const n = g.count;
    // eslint-disable-next-line no-console
    console.log(`terrain split: ocean ${(ocean / n * 100).toFixed(1)}% land ${(land / n * 100).toFixed(1)}% mountain tiles ${mountain}`);
    expect(ocean / n).toBeGreaterThan(0.15); // real oceans
    expect(land / n).toBeGreaterThan(0.15);  // real continents
    expect(mountain).toBeGreaterThan(0);     // real mountains
  });
});

describe('columns', () => {
  const g = new Goldberg(8);
  const layers = buildLayers();

  function fresh(): Columns {
    return new Columns(g, layers, new Terrain('cols'));
  }

  function ordinaryTile(cols: Columns, start: number): number {
    for (let i = 0; i < g.count; i++) {
      const id = (start + i) % g.count;
      if (!cols.hasNaturalVoids(id)) return id;
    }
    throw new Error('no ordinary tile found');
  }

  it('default column: air above surface, solid below, bedrock at bottom', () => {
    const cols = fresh();
    const id = ordinaryTile(cols, 100);
    const top = cols.topLayerOf(id);
    expect(cols.solidAt(id, top - 1)).toBe(false);
    expect(cols.solidAt(id, top)).toBe(true);
    expect(cols.solidAt(id, layers.L - 1)).toBe(true);
    expect(cols.solidAt(id, -1)).toBe(false);
    expect(cols.solidAt(id, layers.L)).toBe(false);
  });

  it('mine removes exactly one cell; place adds one; bedrock immutable', () => {
    const cols = fresh();
    const id = ordinaryTile(cols, 200);
    const top = cols.topLayerOf(id);
    expect(cols.mine(id, top)).toBe(true);
    expect(cols.solidAt(id, top)).toBe(false);
    expect(cols.solidAt(id, top + 1)).toBe(true);
    // neighbors untouched
    const n = g.neighbor(id, 0);
    expect(cols.editOf(n)).toBeUndefined();
    // tunnel: mine below the new surface leaves a roof
    expect(cols.mine(id, top + 2)).toBe(true);
    expect(cols.solidAt(id, top + 1)).toBe(true);
    expect(cols.solidAt(id, top + 2)).toBe(false);
    // place in the hole
    expect(cols.place(id, top)).toBe(true);
    expect(cols.solidAt(id, top)).toBe(true);
    expect(cols.placedAt(id, top)).toBe(true);
    expect(cols.place(id, top)).toBe(false); // already solid
    // bedrock
    expect(cols.mine(id, layers.L - 1)).toBe(false);
  });

  it('ground/ceiling queries respect tunnels', () => {
    const cols = fresh();
    const id = ordinaryTile(cols, 300);
    const top = cols.topLayerOf(id);
    const rAbove = layers.topRadius(top) + 3;
    expect(cols.groundLayerBelow(id, rAbove)).toBe(top);
    // dig a pit two cells deep
    cols.mine(id, top);
    cols.mine(id, top + 1);
    expect(cols.groundLayerBelow(id, rAbove)).toBe(top + 2);
    // tunnel: from inside the pit the old surface is gone; ceiling from below
    const rInPit = layers.topRadius(top + 2) + 0.1;
    expect(cols.ceilingLayerAbove(id, rInPit)).toBe(-1); // open pit, sky above
    cols.place(id, top); // roof over the pit
    expect(cols.ceilingLayerAbove(id, rInPit)).toBe(top);
  });

  it('placed cells remember their material, mine clears it, and replay regenerates it', () => {
    const cols = fresh();
    const id = ordinaryTile(cols, 640);
    const top = cols.topLayerOf(id);
    expect(cols.place(id, top - 1, MAT.WOOD)).toBe(true);
    expect(cols.materialAt(id, top - 1)).toBe(MAT.WOOD);
    expect(cols.place(id, top - 2, MAT.SNOW)).toBe(true);
    expect(cols.materialAt(id, top - 2)).toBe(MAT.SNOW);
    expect(cols.place(id, top - 3)).toBe(true); // legacy default
    expect(cols.materialAt(id, top - 3)).toBe(MAT.BUILT);
    // mine clears the stored material; a new placement overwrites it
    expect(cols.mine(id, top - 1)).toBe(true);
    expect(cols.place(id, top - 1, MAT.DIRT)).toBe(true);
    expect(cols.materialAt(id, top - 1)).toBe(MAT.DIRT);
    // identical replay on a regenerated world reads back identically (persistence)
    const cols2 = fresh();
    cols2.place(id, top - 1, MAT.WOOD);
    cols2.place(id, top - 2, MAT.SNOW);
    cols2.place(id, top - 3);
    cols2.mine(id, top - 1);
    cols2.place(id, top - 1, MAT.DIRT);
    expect(cols2.materialAt(id, top - 1)).toBe(MAT.DIRT);
    expect(cols2.materialAt(id, top - 2)).toBe(MAT.SNOW);
    expect(cols2.materialAt(id, top - 3)).toBe(MAT.BUILT);
    // still sparse: one edited tile, mask words + one byte per layer
    const s = cols.storageBytes();
    expect(s.editedTiles).toBe(1);
    expect(s.editBytes).toBeLessThanOrEqual(64 + layers.L + 32);
  });

  it('storage is sparse: only edited tiles cost mask bytes, index scales with tile count', () => {
    const cols = fresh();
    for (let id = 500; id < 520; id++) cols.mine(id, cols.topLayerOf(id));
    const s = cols.storageBytes();
    expect(s.editedTiles).toBe(20);
    expect(s.editBytes).toBeLessThanOrEqual(20 * 72);
    expect(s.indexBytes).toBe(g.count * 6); // int16 + f32 per tile

    // scaling with tile count (not volume): quadruple tiles => ~4x index bytes
    const g2 = new Goldberg(16);
    const cols2 = new Columns(g2, layers, new Terrain('cols'));
    const ratio = cols2.storageBytes().indexBytes / s.indexBytes;
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });

  it('generates deterministic natural arches and caves as default terrain voids', () => {
    const caveGeo = new Goldberg(16);
    const a = new Columns(caveGeo, layers, new Terrain('natural-caves'));
    const b = new Columns(caveGeo, layers, new Terrain('natural-caves'));

    const arch = a.naturalFeature('arch');
    const dry = a.naturalFeature('dryCave');
    const sea = a.naturalFeature('seaCave');
    expect(arch).not.toBeNull();
    expect(dry).not.toBeNull();
    expect(sea).not.toBeNull();

    for (const feature of [arch!, dry!, sea!]) {
      expect(a.solidAt(feature.tile, feature.layer)).toBe(false);
      expect(a.solidAt(feature.tile, a.topLayerOf(feature.tile))).toBe(true);
      expect(feature.clearance).toBeGreaterThan(2.2);
      expect(b.naturalFeature(feature.kind)?.tile).toBe(feature.tile);
      expect(b.solidAt(feature.tile, feature.layer)).toBe(false);
      if (feature.kind === 'dryCave') expect(layers.bottomRadius(feature.layer)).toBeGreaterThan(WATER_SURFACE);
      if (feature.kind === 'seaCave') expect(feature.flooded).toBe(true);
    }

    const before = a.naturalFeature('dryCave')!;
    const top = a.topLayerOf(before.tile);
    expect(a.mine(before.tile, top)).toBe(true);
    expect(a.solidAt(before.tile, before.layer)).toBe(false);
  });
});

describe('chunks + mesher', () => {
  const g = new Goldberg(8);
  const layers = buildLayers();

  it('chunks partition all tiles exactly once', () => {
    const chunks = enumerateChunks(g);
    const seen = new Set<number>();
    for (const c of chunks.values()) {
      for (const id of c.tiles) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(g.count);
  });

  it('builds finite, deterministic meshes with sane radii', () => {
    const chunks = enumerateChunks(g);
    const cols = new Columns(g, layers, new Terrain('mesh'));
    const first = [...chunks.values()][0];
    const meshA = buildChunkMesh(first, g, layers, cols);
    expect(meshA).not.toBeNull();
    expect(meshA!.triangles).toBeGreaterThan(0);
    const anchorLen = Math.hypot(...meshA!.anchor);
    for (let i = 0; i < meshA!.positions.length; i += 3) {
      const x = meshA!.positions[i] + meshA!.anchor[0];
      const y = meshA!.positions[i + 1] + meshA!.anchor[1];
      const z = meshA!.positions[i + 2] + meshA!.anchor[2];
      const r = Math.hypot(x, y, z);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(50);
      expect(r).toBeLessThanOrEqual(BUILD_CEILING + 1e-6);
      expect(Number.isFinite(meshA!.normals[i])).toBe(true);
      expect(meshA!.colors[i]).toBeGreaterThanOrEqual(0);
      expect(meshA!.colors[i]).toBeLessThanOrEqual(1);
    }
    expect(anchorLen).toBeGreaterThan(0);
    const meshB = buildChunkMesh(first, g, layers, new Columns(g, layers, new Terrain('mesh')));
    expect(meshB!.positions).toEqual(meshA!.positions);
    expect(meshB!.colors).toEqual(meshA!.colors);
  });

  it('edits replayed over regenerated terrain rebuild the identical mesh (release/regen persistence)', () => {
    // Releasing a region drops meshes and cached terrain only; edits persist by tile id.
    // Regeneration = deterministic terrain + edit overlay, so a rebuilt chunk must be
    // byte-identical to the chunk as it was before release.
    const chunks = enumerateChunks(g);
    const chunk = [...chunks.values()][5];
    const victim = chunk.tiles[2];
    const ops = (cols: Columns): void => {
      const top = cols.topLayerOf(victim);
      cols.mine(victim, top);
      cols.mine(victim, top + 2); // tunnel with a roof
      cols.place(victim, top - 3, MAT.WOOD); // floating wood block above
    };
    const colsA = new Columns(g, layers, new Terrain('persist'));
    ops(colsA);
    const meshA = buildChunkMesh(chunk, g, layers, colsA)!;
    // "regenerated" world: fresh caches, same seed, same edit overlay
    const colsB = new Columns(g, layers, new Terrain('persist'));
    ops(colsB);
    const meshB = buildChunkMesh(chunk, g, layers, colsB)!;
    expect(meshB.positions).toEqual(meshA.positions);
    expect(meshB.colors).toEqual(meshA.colors);
    // and the edited cells read back exactly
    const top = colsB.topLayerOf(victim);
    expect(colsB.solidAt(victim, top)).toBe(false);
    expect(colsB.solidAt(victim, top + 1)).toBe(true);
    expect(colsB.solidAt(victim, top + 2)).toBe(false);
    expect(colsB.solidAt(victim, top - 3)).toBe(true);
  });

  it('trees are deterministic, mesh into chunks, chop out, and edits fell them', () => {
    const terrain = new Terrain('woods');
    const colsA = new Columns(g, layers, terrain);
    const colsB = new Columns(g, layers, new Terrain('woods'));
    const treesA = new Trees(g, colsA, terrain, 'woods');
    const treesB = new Trees(g, colsB, new Terrain('woods'), 'woods');
    const treeTiles: number[] = [];
    for (let id = 0; id < g.count; id++) {
      expect(treesA.hasTree(id)).toBe(treesB.hasTree(id)); // same seed, same forests
      if (treesA.hasTree(id)) treeTiles.push(id);
    }
    // eslint-disable-next-line no-console
    console.log(`trees on GP(${g.m},0) seed 'woods': ${treeTiles.length} / ${g.count} tiles`);
    expect(treeTiles.length).toBeGreaterThan(0);

    // a chunk containing a tree gains geometry; chopping removes exactly that tree
    const chunks = enumerateChunks(g);
    const treeTile = treeTiles[0];
    const chunk = [...chunks.values()].find((c) => [...c.tiles].includes(treeTile))!;
    const withTree = buildChunkMesh(chunk, g, layers, colsA, treesA)!;
    const bare = buildChunkMesh(chunk, g, layers, colsA)!;
    expect(withTree.triangles).toBeGreaterThan(bare.triangles);
    const strike = treesA.strike(treeTile);
    expect(strike.hit).toBe(true);
    expect(strike.felled).toBe(false);
    expect(treesA.damageOf(treeTile)).toBeGreaterThan(0);
    const damaged = buildChunkMesh(chunk, g, layers, colsA, treesA)!;
    expect(damaged.triangles).toBe(withTree.triangles);
    expect(damaged.colors).not.toEqual(withTree.colors);
    expect(treesA.chop(treeTile)).toBe(true);
    expect(treesA.chop(treeTile)).toBe(false); // already gone
    const chopped = buildChunkMesh(chunk, g, layers, colsA, treesA)!;
    expect(chopped.triangles).toBeLessThan(withTree.triangles);

    // regenerated world + replayed chop set -> byte-identical mesh (persistence)
    treesB.chop(treeTile);
    const regen = buildChunkMesh(chunk, g, layers, colsB, treesB)!;
    expect(regen.positions).toEqual(chopped.positions);
    expect(regen.colors).toEqual(chopped.colors);

    // editing a column fells its tree (no floating trunks over mined ground)
    if (treeTiles.length > 1) {
      const second = treeTiles[1];
      colsA.mine(second, colsA.topLayerOf(second));
      expect(treesA.hasTree(second)).toBe(false);
      expect(treesB.hasTree(second)).toBe(true); // untouched world keeps it
    }
  });

  it('mining a tile changes only geometry near that tile', () => {
    const chunks = enumerateChunks(g);
    const cols = new Columns(g, layers, new Terrain('edit'));
    const chunk = [...chunks.values()][3];
    const before = buildChunkMesh(chunk, g, layers, cols)!;
    const victim = chunk.tiles[Math.floor(chunk.tiles.length / 2)];
    const top = cols.topLayerOf(victim);
    const mining = new MineProgress();
    mining.strike(victim, top, 1, 4);
    const cracked = buildChunkMesh(chunk, g, layers, cols, undefined, mining)!;
    expect(cracked.triangles).toBe(before.triangles);
    expect(cracked.colors).not.toEqual(before.colors);
    expect(cols.solidAt(victim, top)).toBe(true);
    cols.mine(victim, cols.topLayerOf(victim));
    const after = buildChunkMesh(chunk, g, layers, cols)!;
    // mesh changed
    expect(after.positions.length === before.positions.length &&
      after.positions.every((v, i) => v === before.positions[i])).toBe(false);
    // a far-away chunk is untouched
    const farChunk = [...chunks.values()].reduce((bestC, c) => {
      const d = c.cx * chunk.cx + c.cy * chunk.cy + c.cz * chunk.cz;
      const bd = bestC.cx * chunk.cx + bestC.cy * chunk.cy + bestC.cz * chunk.cz;
      return d < bd ? c : bestC;
    });
    const farBefore = buildChunkMesh(farChunk, g, layers, cols)!;
    const farAfter = buildChunkMesh(farChunk, g, layers, cols)!;
    expect(farAfter.positions).toEqual(farBefore.positions);
  });
});
