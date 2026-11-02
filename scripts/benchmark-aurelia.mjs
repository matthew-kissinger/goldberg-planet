/** CPU sampler check only; no renderer, GPU, workers or gameplay frame-rate claim. */
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cpus, platform, release, totalmem } from 'node:os';
const output = resolve(process.argv[2] ?? 'output/performance/aurelia-sampler.json');
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { Terrain } = await server.ssrLoadModule('/src/world/terrain.ts');
  const { buildSolarSystemConfigs, makeDefaultPlanetConfig } = await server.ssrLoadModule('/src/world/planetConfig.ts');
  const { aureliaSites } = await server.ssrLoadModule('/src/world/aurelia.ts');
  const config = buildSolarSystemConfigs('GP192-01')[0], current = new Terrain(config), legacy = new Terrain(makeDefaultPlanetConfig('GP192-01'));
  const count = 100000, directions = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + 0.5) / count, r = Math.sqrt(1 - y * y), a = i * 2.399963229728653;
    directions[i * 3] = Math.cos(a) * r; directions[i * 3 + 1] = y; directions[i * 3 + 2] = Math.sin(a) * r;
  }
  const measure = terrain => {
    let checksum = 0; const start = performance.now();
    for (let i = 0; i < count; i++) {
      const x = directions[i * 3], y = directions[i * 3 + 1], z = directions[i * 3 + 2];
      const h = terrain.heightAt(x, y, z);
      checksum += h + terrain.surfaceMaterial(h, x, y, z) + terrain.moistureAt(x, y, z) + terrain.forestAt(x, y, z);
    }
    return { elapsedMs: performance.now() - start, checksum };
  };
  measure(current); measure(legacy);
  const runs = [];
  for (let pass = 0; pass < 3; pass++) runs.push({ aurelia: measure(current), legacyTerran: measure(legacy) });
  const coverage = {}, heights = []; let sea = 0;
  for (let i = 0; i < count; i++) {
    const x = directions[i * 3], y = directions[i * 3 + 1], z = directions[i * 3 + 2], h = current.heightAt(x, y, z), biome = current.aurelia.biomeAt(x, y, z);
    coverage[biome] = (coverage[biome] ?? 0) + 1; heights.push(h); if (h < config.waterSurfaceOffset) sea++;
  }
  heights.sort((a, b) => a - b);
  const result = {
    measuredAt: new Date().toISOString(), scope: 'CPU field evaluation: height + material + moisture + forest for identical 100000 unit directions per pass; unrelated agent work may be active; not an isolated frame-rate benchmark.',
    environment: { node: process.version, platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem() },
    seed: config.seed, recipe: config.expeditionRecipe, count, runs, coverage,
    seaFraction: sea / count, heights: { min: heights[0], median: heights[Math.floor(count / 2)], max: heights.at(-1) },
    sites: aureliaSites(config).map(site => ({ ...site, height: current.heightAt(...site.direction), sampledBiome: current.aurelia.biomeAt(...site.direction) })),
  };
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, runs, coverage, seaFraction: result.seaFraction, heights: result.heights }));
} finally { await server.close(); }
