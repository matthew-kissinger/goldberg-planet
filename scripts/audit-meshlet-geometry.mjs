// Offline compatibility evidence, using installed r187 code and actual M192 terrain.
// No renderer/browser/GPU is created. Times describe this diagnostic process only.
import { createServer } from 'vite';
import { BufferGeometry, BufferAttribute } from 'three';
import { createMeshlets, ready } from 'three/addons/utils/MeshletGeometryUtils.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const [{ Goldberg }, { buildSolarSystemConfigs }, { buildLayers }, { Terrain }, { Columns }, { Trees }, { createExpeditionHabitat }, { enumerateChunks, chunkKeyOfTile }, { buildChunkMesh }] = await Promise.all([
    '/src/geo/goldberg.ts', '/src/world/planetConfig.ts', '/src/world/layers.ts', '/src/world/terrain.ts',
    '/src/world/columns.ts', '/src/world/trees.ts', '/src/world/expeditionHabitat.ts', '/src/world/chunks.ts', '/src/render/mesher.ts',
  ].map(path => server.ssrLoadModule(path)));
  await ready;
  const geo = new Goldberg(192), config = buildSolarSystemConfigs('GP192-01')[0], layers = buildLayers(config);
  const columns = new Columns(geo, layers, new Terrain(config)), trees = new Trees(geo, columns, columns.terrain, config.seed);
  const recipe = createExpeditionHabitat(geo, config), chunks = enumerateChunks(geo);
  const keys = [...new Set(recipe.route.map(tile => chunkKeyOfTile(geo, tile)))];
  const results = [];
  for (const key of keys) {
    const chunk = chunks.get(key), source = buildChunkMesh(chunk, geo, layers, columns, trees);
    if (!source) continue;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(source.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(source.normals, 3));
    geometry.setAttribute('color', new BufferAttribute(source.colors, 3));
    geometry.setAttribute('packedMat', new BufferAttribute(source.packedMat, 1));
    const start = performance.now(), data = createMeshlets(geometry), buildMs = performance.now() - start;
    const offset = data.attributeLayout.get('packedMat').offset * 4;
    const packed = vertex => data.vertexArray[vertex * data.stride * 4 + offset] >>> 0;
    let first = 0;
    const lods = data.lodTriangleEnds.map((last, lod) => {
      let triangles = 0, mixedMaterial = 0, mixedWall = 0, mixedMetadata = 0;
      for (let t = first; t < last; t++) {
        const a = data.indexArray[t * 3], b = data.indexArray[t * 3 + 1], c = data.indexArray[t * 3 + 2];
        if (a === b || b === c || a === c) continue;
        const pa = packed(a), pb = packed(b), pc = packed(c);
        triangles++;
        if ((pa & 255) !== (pb & 255) || (pa & 255) !== (pc & 255)) mixedMaterial++;
        if ((pa & 256) !== (pb & 256) || (pa & 256) !== (pc & 256)) mixedWall++;
        if (pa !== pb || pa !== pc) mixedMetadata++;
      }
      first = last;
      return { lod, triangles, mixedMaterial, mixedWall, mixedMetadata };
    });
    results.push({ chunk: key, sourceTriangles: source.positions.length / 9, buildMs, bytes: data.vertexArray.byteLength + data.indexArray.byteLength + data.chunkArray.byteLength, lods });
    geometry.dispose();
  }
  const report = { three: '0.187.0', seed: config.seed, m: geo.m, recipe: config.expeditionRecipe, scope: 'Offline geometry preprocessing only; not GPU/frame performance', results };
  await mkdir(resolve('output/meshlet-evaluation'), { recursive: true });
  await writeFile(resolve('output/meshlet-evaluation/geometry-audit.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await server.close(); }
