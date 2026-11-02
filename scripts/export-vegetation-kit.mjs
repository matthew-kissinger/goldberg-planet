/** Offline review/export adapter for the very same kit used by runtime instances.
 * Run node scripts/export-vegetation-kit.mjs; no browser, GPU or Kiln host required. */
import { createServer } from 'vite';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const output = resolve('assets/vegetation-kit'), manifest = [];
try {
  const { AURELIA_TREE_KIT, WORLD_GROWTH_COLORS, VEGETATION_MODULES, visitVegetationTreeParts, treePartGeometry, plantModuleGeometry, PLANT_COLORS } = await server.ssrLoadModule('/src/render/vegetationKit.ts');
  const { GROWTH_SPECIES } = await server.ssrLoadModule('/src/world/growthSpecies.ts');
  await mkdir(output, { recursive: true });
  const exporter = new GLTFExporter();
  async function save(name, root, metadata) {
    root.name = name; root.userData = { ...metadata, source: 'src/render/vegetationKit.ts', units: 'metres', up: '+Y' };
    root.updateMatrixWorld(true);
    const binary = await exporter.parseAsync(root, { binary: true, onlyVisible: true });
    const buffer = Buffer.from(binary), file = `${name}.glb`;
    let triangles = 0, meshes = 0; const materials = new Set();
    root.traverse(node => { if (node.isMesh) { triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; meshes++; materials.add(node.material); } });
    await writeFile(resolve(output, file), buffer);
    manifest.push({ file, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), triangles, meshes, materials: materials.size, ...metadata });
    root.traverse(node => { if (node.isMesh) node.geometry.dispose(); });
    for (const material of materials) material.dispose();
  }
  async function saveFamily(species, params, family, world) {
    const root = new THREE.Group(), paints = new Map(); let index = 0;
    visitVegetationTreeParts(params, false, (shape, paint, x, y, z, sx, sy, sz, qx, qy, qz, qw) => {
      const mineral = shape === 'crystal' || species === 'iceFan', key = `${paint}:${mineral}`;
      let material = paints.get(key);
      if (!material) { material = new THREE.MeshStandardMaterial({ color: paint, roughness: mineral ? .35 : .88, metalness: mineral ? .09 : 0 }); paints.set(key, material); }
      const geometry = treePartGeometry(shape); geometry.deleteAttribute('uv');
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = index === 0 ? `root-${shape}` : `${shape}-${index}`; index++;
      mesh.userData = { module: shape, ...VEGETATION_MODULES[shape] };
      mesh.position.set(x, y, z); mesh.quaternion.set(qx, qy, qz, qw); mesh.scale.set(sx, sy, sz); root.add(mesh);
    });
    await save(`tree-${species}`, root, { category: 'tall-growth', world, species, stage: 'mature', parameters: params, family, runtime: 'shared part instancing; exported nodes preserve editable modules; wind remains a runtime shader behavior' });
  }
  const dimensions = { umbrella: [4.4, 3.8, 4.8, .43], cypress: [5.4, 4.2, 1.8, .34], birch: [4.9, 3.6, 2.5, .23], pine: [5.2, 5.1, 2.8, .34], scrub: [1.6, 2.3, 2.7, .19] };
  for (const species of Object.keys(AURELIA_TREE_KIT)) {
    const [trunk, canopy, spread, girth] = dimensions[species];
    const params = { kind: 'broadleaf', trunk, canopy, spread, girth, offA: 0, offB: 0, tint: 1, aurelia: { species, age: .6, seed: 123456789 } };
    await saveFamily(species, params, AURELIA_TREE_KIT[species], 'terran');
  }
  for (const [species, family] of Object.entries(GROWTH_SPECIES)) {
    const { kind, trunk, canopy, spread, girth } = family;
    const params = { kind, trunk, canopy, spread, girth, offA: 0, offB: 0, tint: 1, growth: { species, age: .6, seed: 123456789 } };
    await saveFamily(species, params, { ...family, colors: WORLD_GROWTH_COLORS[species] }, family.world);
  }
  for (const kind of Object.keys(PLANT_COLORS)) {
    const geometry = plantModuleGeometry(kind); geometry.deleteAttribute('uv');
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88 }));
    await save(`plant-${kind}`, mesh, { category: 'understory', module: kind, ...VEGETATION_MODULES.understory, runtime: 'shared module instancing with height/spread/tint and wind-phase variation' });
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ version: 2, authoring: 'Repository-authored geometry; exported directly with three GLTFExporter. Kiln was evaluated but is not used by this adapter.', modules: VEGETATION_MODULES, assets: manifest }, null, 2) + '\n');
  console.log(JSON.stringify({ output, assets: manifest.length, triangles: manifest.reduce((n, a) => n + a.triangles, 0), bytes: manifest.reduce((n, a) => n + a.bytes, 0) }));
} finally { await server.close(); }
