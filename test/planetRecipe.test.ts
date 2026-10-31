import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import {
  billowFbm3D,
  craterProfile,
  domainWarp3D,
  fbm3D,
  makeSeededNoise3D,
  ridgedFbm3D,
  terrace,
  voronoiSphere3D,
} from '../src/world/noise';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';
import { classifyPentagonTile, evaluatePentagonWonder, queryTileResourceYield } from '../src/world/planetRecipe';
import { buildLayers } from '../src/world/layers';
import { MAT, Terrain } from '../src/world/terrain';
import { Columns } from '../src/world/columns';
import { Trees } from '../src/world/trees';
import { MeshWorkerPool } from '../src/world/workerPool';
import { enumerateChunks } from '../src/world/chunks';
import { generateCreatureDna } from '../src/world/wildlifePool';

describe('composable 3D spherical noise operators', () => {
  it('evaluates fbm, ridgedFbm, billowFbm, domainWarp, terrace, and voronoiSphere3D deterministically', () => {
    const n1 = makeSeededNoise3D('seed-a', '1');
    const n2 = makeSeededNoise3D('seed-a', '2');
    const n3 = makeSeededNoise3D('seed-a', '3');

    const f1 = fbm3D(n1, 0.5, 0.5, 0.707, 4);
    const f2 = fbm3D(n1, 0.5, 0.5, 0.707, 4);
    expect(f1).toBe(f2);
    expect(f1).toBeGreaterThanOrEqual(-1);
    expect(f1).toBeLessThanOrEqual(1);

    const r = ridgedFbm3D(n1, 0.3, -0.6, 0.74, 4, 2.0, 0.5, 2.4);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);

    const b = billowFbm3D(n2, -0.4, 0.2, 0.89, 3);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThanOrEqual(1);

    const warpOut = new Float64Array(3);
    domainWarp3D(n1, n2, n3, 1, 0, 0, 2.0, 0.25, warpOut);
    expect(Number.isFinite(warpOut[0])).toBe(true);
    expect(Math.hypot(warpOut[0] - 1, warpOut[1], warpOut[2])).toBeLessThan(0.5);

    expect(terrace(14.2, 5.0, 0.85)).toBeGreaterThanOrEqual(10);
    expect(terrace(14.2, 5.0, 0.85)).toBeLessThanOrEqual(15);

    const vorOut = new Float64Array(3);
    voronoiSphere3D(12345, 0.6, 0.8, 0.0, 3.0, vorOut);
    expect(vorOut[0]).toBeGreaterThanOrEqual(0);
    expect(vorOut[1]).toBeGreaterThanOrEqual(vorOut[0]);
    expect(vorOut[2]).toBeGreaterThanOrEqual(0);
    expect(vorOut[2]).toBeLessThan(1);

    // Crater profile: negative at center (d1=0), positive on rim (d1=radius)
    expect(craterProfile(0, 0.4, 0.15, 25, 10)).toBe(-25);
    expect(craterProfile(0.4, 0.4, 0.15, 25, 10)).toBe(10);
    expect(craterProfile(0.8, 0.4, 0.15, 25, 10)).toBe(0);
  });
});

describe('multi-planet archetypes, 12 Pentagon Wonders, and ecosystem seeding', () => {
  const geo = new Goldberg(8);
  const configs = buildSolarSystemConfigs('solar-test');

  it('generates 6 distinct planets with valid height bounds, biome materials, and flora', () => {
    expect(configs.length).toBe(6);
    const seenMaterials = new Set<number>();

    for (const cfg of configs) {
      const layers = buildLayers(cfg);
      const terrain = new Terrain(cfg);
      const columns = new Columns(geo, layers, terrain);
      const trees = new Trees(geo, columns, terrain, cfg.seed);

      expect(layers.planetRadius).toBe(cfg.radius);

      let minH = Infinity;
      let maxH = -Infinity;
      for (let id = 0; id < geo.count; id++) {
        const h = columns.heightOf(id);
        expect(Number.isFinite(h)).toBe(true);
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
        const top = columns.topLayerOf(id);
        seenMaterials.add(columns.materialAt(id, top));
      }
      expect(maxH - minH).toBeGreaterThan(15);

      // Verify flora params produce valid archetype silhouettes across all 9 flora types
      const p0 = trees.paramsFor(15);
      expect([
        'conifer', 'broadleaf', 'palm', 'weeping_willow', 'cactus',
        'fungal', 'spore_bulb', 'crystal_spire', 'ice_willow',
      ]).toContain(p0.kind);
    }

    // New archetype materials (CRYSTAL, BASALT, TERRACOTTA, ICE, MAGMA, MYCELIUM) appear across the system
    expect(seenMaterials.has(MAT.CRYSTAL)).toBe(true);
    expect(seenMaterials.has(MAT.TERRACOTTA) || seenMaterials.has(MAT.BASALT)).toBe(true);
    expect(seenMaterials.has(MAT.ICE) || seenMaterials.has(MAT.MYCELIUM)).toBe(true);
  });

  it('classifies the 12 Goldberg pentagons (tiles 0..11) as Pentagon Wonders with 2.5x automation yield', () => {
    const moonCfg = configs[1]; // Vespera Shard
    for (let p = 0; p < 12; p++) {
      expect(geo.degrees[p]).toBe(5);
      const cls = classifyPentagonTile(geo, p);
      expect(cls).toEqual({ ringLevel: 0, pentagonId: p });
      const wonder = evaluatePentagonWonder(geo, p, moonCfg.pentagonWonder);
      expect(wonder.updraftAccel).toBeGreaterThan(20);
      expect(wonder.automationMultiplier).toBe(2.5);
      const yieldInfo = queryTileResourceYield(geo, moonCfg, p, MAT.CRYSTAL);
      expect(yieldInfo.isPentagonBoosted).toBe(true);
      expect(yieldInfo.resource).toBe('crystal');
    }
  });

  it('allows seeding cross-planet ecosystems on barren moon tiles and round-trips column edits via MeshWorkerPool', async () => {
    const moonCfg = configs[1];
    const layers = buildLayers(moonCfg);
    const terrain = new Terrain(moonCfg);
    const columns = new Columns(geo, layers, terrain);

    const targetTile = 42;
    const seeded = columns.seedEcosystem(targetTile, true);
    expect(seeded.length).toBeGreaterThan(1);
    expect(columns.materialAt(targetTile, columns.topLayerOf(targetTile))).toBe(MAT.MYCELIUM);

    // Edit column and verify export/import round-trip
    const top = columns.topLayerOf(targetTile);
    expect(columns.place(targetTile, top - 1, MAT.CRYSTAL)).toBe(true);
    const exported = columns.exportEdits();
    expect(exported.length).toBe(1);

    const pool = new MeshWorkerPool();
    pool.initPlanet(moonCfg.id, geo.m, moonCfg, {
      edits: exported,
      seededEcoTiles: [...columns.seededEcoTiles],
    });
    const firstChunkKey = [...enumerateChunks(geo).keys()][0];
    const mesh = await pool.buildChunkAsync(moonCfg.id, firstChunkKey);
    expect(mesh).not.toBeNull();
    expect(mesh!.packedMat.length).toBe(mesh!.positions.length / 3);
    pool.dispose();
  });

  it('synthesizes deterministic procedural creature DNA across quadruped, biped, avian, and aquatic guilds', () => {
    const seenHeadOrnaments = new Set<string>();
    const seenDorsals = new Set<string>();
    const seenTails = new Set<string>();

    for (const cfg of configs) {
      for (const locomotion of ['quadruped', 'biped', 'avian', 'aquatic'] as const) {
        for (let variant = 0; variant < 6; variant++) {
          const diet = variant % 2 === 0 ? 'herbivore' : 'predator';
          const dnaA = generateCreatureDna(cfg.seed, cfg.archetype, locomotion, diet, variant);
          const dnaB = generateCreatureDna(cfg.seed, cfg.archetype, locomotion, diet, variant);
          expect(dnaA).toEqual(dnaB);
          expect(dnaA.locomotion).toBe(locomotion);
          expect(dnaA.name.length).toBeGreaterThan(4);
          expect(dnaA.scale).toBeGreaterThan(0.5);
          seenHeadOrnaments.add(dnaA.hornStyle);
          seenDorsals.add(dnaA.dorsalStyle);
          seenTails.add(dnaA.tailStyle);
        }
      }
    }
    expect(seenHeadOrnaments.size).toBeGreaterThanOrEqual(4);
    expect(seenDorsals.size).toBeGreaterThanOrEqual(3);
    expect(seenTails.size).toBeGreaterThanOrEqual(3);
  });
});
