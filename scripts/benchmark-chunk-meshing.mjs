/** Reproducible CPU-only meshing microbenchmark; this does not measure browser FPS or GPU uploads. */
import { createServer } from 'vite';
import { cpus, totalmem, platform, release, arch } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const seed = process.env.BENCH_SEED ?? 'GP192-01';
const frequency = Number(process.env.BENCH_M ?? 192);
const sampleCount = Number(process.env.BENCH_SAMPLES ?? 16);
const outputPath = resolve(process.argv[2] ?? 'output/performance/chunk-meshing.json');
const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const [{ Goldberg }, { Terrain }, { Columns }, { Trees }, { buildLayers }, { buildSolarSystemConfigs }, { enumerateChunks }, { buildChunkMesh }] =
    await Promise.all([
      '/src/geo/goldberg.ts', '/src/world/terrain.ts', '/src/world/columns.ts', '/src/world/trees.ts',
      '/src/world/layers.ts', '/src/world/planetConfig.ts', '/src/world/chunks.ts', '/src/render/mesher.ts',
    ].map(path => server.ssrLoadModule(path)));
  const geo = new Goldberg(frequency);
  const chunks = [...enumerateChunks(geo).values()];
  const sample = Array.from({ length: sampleCount }, (_, i) => chunks[Math.floor((i + 0.5) * chunks.length / sampleCount)]);
  const results = [];
  const summarize = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1), over4_5ms: values.filter(v => v > 4.5).length };
  };
  for (const config of buildSolarSystemConfigs(seed)) {
    const layers = buildLayers(config), terrain = new Terrain(config);
    const columns = new Columns(geo, layers, terrain), trees = new Trees(geo, columns, terrain, config.seed);
    const coldMs = [], warmMs = [], triangles = [];
    for (const chunk of sample) {
      const start = performance.now();
      const mesh = buildChunkMesh(chunk, geo, layers, columns, trees);
      coldMs.push(performance.now() - start);
      triangles.push(mesh?.triangles ?? 0);
    }
    for (const chunk of sample) {
      const start = performance.now();
      buildChunkMesh(chunk, geo, layers, columns, trees);
      warmMs.push(performance.now() - start);
    }
    results.push({ planet: config.archetype, hasFloatingIslands: Boolean(config.hasFloatingIslands), coldMs, warmMs, triangles, coldSummaryMs: summarize(coldMs), warmSummaryMs: summarize(warmMs) });
  }
  const report = {
    measuredAt: new Date().toISOString(),
    kind: 'CPU-only direct mesh generation; no rendering, no browser, no worker transfer',
    caveats: ['One cold-column pass and one warm-column pass; JIT is not reset between worlds.', 'Evenly spaced chunk samples include small seam chunks.', 'Ambient system load is not controlled; compare repeated runs, not isolated maxima.'],
    sourceGitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceChanges: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim().split('\n'),
    environment: { node: process.version, versions: process.versions, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCpuCount: cpus().length, totalMemoryBytes: totalmem(), dependencies: packageInfo.dependencies, devDependencies: packageInfo.devDependencies },
    seed, frequency, chunkCount: chunks.length, sampleChunkKeys: sample.map(c => c.key), results,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ outputPath, frequency, sampleCount, results: results.map(({ planet, coldSummaryMs, warmSummaryMs }) => ({ planet, coldSummaryMs, warmSummaryMs })) }, null, 2));
} finally {
  await server.close();
}
