import { describe, expect, it, vi } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { AureliaWorld, aureliaSites, type AureliaBiome } from '../src/world/aurelia';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';
import { Terrain, MAT } from '../src/world/terrain';
import { Columns } from '../src/world/columns';
import { buildLayers } from '../src/world/layers';
import { Trees } from '../src/world/trees';
import { habitatDirection } from '../src/world/expeditionHabitat';

function direction(i: number, n: number): [number, number, number] {
  const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963229728653;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

describe('complete Aurelia world', () => {
  it('samples all six habitats on both hemispheres with no legacy height fallback', () => {
    const config = buildSolarSystemConfigs('GP192-01')[0], terrain = new Terrain(config);
    const legacy = vi.spyOn(terrain as unknown as { heightTerran(x: number, y: number, z: number): number }, 'heightTerran').mockImplementation(() => { throw new Error('legacy fallback'); });
    const biomes = new Map<AureliaBiome, number>();
    let wet = 0, land = 0;
    for (let i = 0; i < 4096; i++) {
      const d = direction(i, 4096), h = terrain.heightAt(...d), m = terrain.moistureAt(...d), f = terrain.forestAt(...d);
      expect(h).toBeGreaterThanOrEqual(-35); expect(h).toBeLessThanOrEqual(80);
      expect(m).toBeGreaterThanOrEqual(0); expect(m).toBeLessThanOrEqual(1);
      expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1);
      expect(terrain.surfaceMaterial(h, ...d)).toBeGreaterThanOrEqual(0);
      const biome = terrain.aurelia!.biomeAt(...d); biomes.set(biome, (biomes.get(biome) ?? 0) + 1);
      if (h < -0.35) wet++; else land++;
    }
    expect([...biomes.keys()].sort()).toEqual(['coast', 'dryland', 'highland', 'meadow', 'wetland', 'woodland']);
    for (const count of biomes.values()) expect(count).toBeGreaterThan(40);
    expect(wet).toBeGreaterThan(400); expect(land).toBeGreaterThan(1000);
    expect(legacy).not.toHaveBeenCalled();
  });

  it('is exactly repeatable after worker-style config serialization and changes with seed', () => {
    const config = buildSolarSystemConfigs('GP192-01')[0];
    const a = new Terrain(config), b = new Terrain(JSON.parse(JSON.stringify(config))), changed = new Terrain({ ...config, seed: 'another-aurelia' });
    let different = 0;
    for (let i = 0; i < 512; i++) {
      const d = direction(i, 512);
      const height = a.heightAt(...d);
      expect(b.heightAt(...d)).toBe(height);
      expect(b.moistureAt(...d)).toBe(a.moistureAt(...d));
      expect(b.forestAt(...d)).toBe(a.forestAt(...d));
      expect(b.aurelia!.biomeAt(...d)).toBe(a.aurelia!.biomeAt(...d));
      expect(b.surfaceMaterial(height, ...d)).toBe(a.surfaceMaterial(height, ...d));
      if (changed.heightAt(...d) !== height) different++;
    }
    expect(different).toBeGreaterThan(450);
    expect(new Terrain(buildSolarSystemConfigs('GP192-01')[1]).aurelia).toBeNull();
  });

  it('keeps six stable land destinations and gently traversable local approaches', () => {
    const config = buildSolarSystemConfigs('GP192-01')[0], world = new AureliaWorld(config), layers = buildLayers(config);
    const sites = aureliaSites(config);
    expect(sites).toBe(aureliaSites(config)); expect(new Set(sites.map(s => s.id)).size).toBe(6);
    for (const site of sites) {
      const [x, y, z] = site.direction;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
      expect(world.heightAt(x, y, z), site.name).toBeGreaterThan(2.5);
      expect(world.biomeAt(x, y, z), site.name).toBe(site.biome);
      const length = Math.hypot(z, x), tx = z / length, tz = -x / length;
      let prior = 0;
      for (let metres = -35; metres <= 35; metres += 5) {
        const px = x * config.radius + tx * metres, py = y * config.radius, pz = z * config.radius + tz * metres;
        const inv = 1 / Math.hypot(px, py, pz), h = world.heightAt(px * inv, py * inv, pz * inv);
        const top = layers.topRadius(layers.layerOfRadius(config.radius + h));
        if (metres > -35) expect(Math.abs(top - prior), site.name).toBeLessThanOrEqual(1.25);
        prior = top;
      }
    }
  });

  it('retains the composed starter shore while joining the new spherical field continuously', () => {
    const world = new AureliaWorld(buildSolarSystemConfigs('GP192-01')[0]);
    expect(world.heightAt(...habitatDirection(65, -40, 900))).toBeLessThan(-3);
    expect(world.heightAt(...habitatDirection(-35, -40, 900))).toBeGreaterThan(3);
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16;
      const inner = habitatDirection(Math.cos(a) * 319.9, Math.sin(a) * 319.9, 900);
      const outer = habitatDirection(Math.cos(a) * 320.1, Math.sin(a) * 320.1, 900);
      expect(Math.abs(world.heightAt(...inner) - world.heightAt(...outer))).toBeLessThan(0.15);
    }
  });

  it('uses the Aurelia geology and planted ground globally without legacy wonders or floating islands', () => {
    const config = buildSolarSystemConfigs('GP192-01')[0]; config.hasFloatingIslands = true;
    const geo = new Goldberg(8), layers = buildLayers(config), columns = new Columns(geo, layers, new Terrain(config));
    for (const site of aureliaSites(config)) {
      const tile = geo.tileOf(...site.direction), top = columns.topLayerOf(tile);
      columns.seedEcosystem(tile, false);
      expect(columns.materialAt(tile, top)).not.toBe(MAT.MYCELIUM);
      expect(columns.materialAt(tile, top + 4)).toBe(MAT.LIMESTONE);
      expect(columns.skyIslandRange(tile)).toBeNull();
      expect(columns.materialAt(tile, layers.L - 1)).toBe(MAT.LIMESTONE);
      expect(columns.mine(tile, layers.L - 1)).toBe(false);
    }
    for (let tile = 0; tile < 12; tile++) expect(columns.pentagonWonderOf(tile)).toMatchObject({ ringLevel: -1, heightDelta: 0, updraftAccel: 0 });
  });

  it('places only the new deterministic tree family and preserves chopping, edits and planting', () => {
    const config = buildSolarSystemConfigs('GP192-01')[0], geo = new Goldberg(48), layers = buildLayers(config);
    const terrain = new Terrain(config), columns = new Columns(geo, layers, terrain), trees = new Trees(geo, columns, terrain, config.seed);
    const twin = new Trees(geo, new Columns(geo, layers, new Terrain(JSON.parse(JSON.stringify(config)))), new Terrain(config), config.seed);
    const species = new Set<string>(); let chosen = -1, live = 0;
    for (let tile = 0; tile < geo.count; tile++) if (trees.hasTree(tile)) {
      const p = trees.paramsFor(tile); expect(p.aurelia).toBeDefined(); expect(twin.paramsFor(tile)).toEqual(p);
      expect(trees.groveTreesFor(tile)).toHaveLength(1); species.add(p.aurelia!.species); live++; chosen = tile;
    }
    expect(live).toBeGreaterThan(50); expect(species.size).toBe(5);
    expect(trees.strike(chosen).hit).toBe(true); expect(trees.damageOf(chosen)).toBeGreaterThan(0);
    expect(trees.chop(chosen)).toBe(true); expect(trees.hasTree(chosen)).toBe(false);
    trees.chopped.delete(chosen); columns.mine(chosen, columns.topLayerOf(chosen)); expect(trees.hasTree(chosen)).toBe(false);
    const site = aureliaSites(config)[1], centre = geo.tileOf(...site.direction);
    columns.seedEcosystem(centre, true);
    const planted = [...columns.seededEcoTiles].filter(tile => trees.hasTree(tile));
    expect(planted.length).toBeGreaterThan(0);
    for (const tile of planted) expect(trees.paramsFor(tile).aurelia).toBeDefined();
  });
});
