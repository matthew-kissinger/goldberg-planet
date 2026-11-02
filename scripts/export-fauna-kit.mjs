/** Portable review/export of the same editable profiles used by runtime pools.
 * This GLB is a rest-pose kit, not a claim of baked animation or a Kiln export. */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildFaunaKit, FAUNA_RECIPES } = await vite.ssrLoadModule('/src/render/faunaKit.ts');
  const { solveFaunaLeg } = await vite.ssrLoadModule('/src/render/aureliaFauna.ts');
  const kit = buildFaunaKit(), root = new THREE.Group(); root.name = 'Expedition modular fauna kit';
  const materials = new Map();
  const material = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .9, vertexColors: true }));
    return materials.get(color);
  };
  const add = (parent, geometry, name, position = [0, 0, 0], color = 0xffffff) => {
    const mesh = new THREE.Mesh(geometry, material(color)); mesh.name = name; mesh.position.fromArray(position); parent.add(mesh); return mesh;
  };
  const report = [];
  for (const [index, recipe] of Object.values(FAUNA_RECIPES).entries()) {
    const group = new THREE.Group(); group.name = recipe.species; group.position.set((index % 3) * 3.8, 0, Math.floor(index / 3) * 4);
    group.userData = { species: recipe.species, bodyPlan: recipe.bodyPlan, units: 'metres', up: '+Y', forward: '-Z', recipe };
    root.add(group);
    const parts = kit.species[recipe.species];
    add(group, parts.body, `${recipe.species}.body`);
    add(group, parts.head, `${recipe.species}.head`, recipe.head);
    add(group, parts.tail, `${recipe.species}.tail`, recipe.tail);
    for (const [i, leg] of recipe.legs.entries()) {
      const hip = new THREE.Vector3().fromArray(leg.hip), foot = new THREE.Vector3(leg.hip[0], leg.foot[1] * .5, leg.hip[2]);
      const knee = new THREE.Vector3(), ankle = new THREE.Vector3();
      solveFaunaLeg(hip, foot, new THREE.Vector3(0, 0, -leg.bend), leg.upper, leg.lower, knee, ankle);
      for (const [name, a, b, radius, color] of [['upper', hip, knee, leg.radius, recipe.palette.coat], ['lower', knee, ankle, leg.radius * .69, recipe.palette.dark]]) {
        const segment = add(group, kit.limb, `${recipe.species}.leg${i}.${name}`, a.clone().add(b).multiplyScalar(.5).toArray(), color);
        segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        segment.scale.set(radius, a.distanceTo(b), radius);
        segment.userData = { module: 'two-bone-limb', joint: name, length: a.distanceTo(b), bend: leg.bend };
      }
      const paw = add(group, kit.foot, `${recipe.species}.leg${i}.foot`, ankle.toArray(), recipe.palette.dark); paw.scale.fromArray(leg.foot);
    }
    if (parts.wing) for (const side of [-1, 1]) {
      const fish = recipe.bodyPlan === 'fish';
      const wing = add(group, parts.wing, `${recipe.species}.${side < 0 ? 'left' : 'right'}Wing`, [side * (fish ? .13 : .14), fish ? .12 : .38, fish ? -.05 : -.02]);
      if (side < 0) wing.rotation.z = Math.PI;
    }
    let vertices = 0, triangles = 0, meshes = 0;
    group.traverse(node => { if (node.isMesh) { meshes++; vertices += node.geometry.getAttribute('position').count; triangles += node.geometry.index.count / 3; } });
    report.push({ species: recipe.species, bodyPlan: recipe.bodyPlan, legs: recipe.legs.length, meshes, vertices, triangles });
  }
  root.userData = { source: 'src/render/faunaKit.ts', version: 1, pipeline: 'direct code-authored rest-pose kit / Three GLTFExporter', runtime: 'shared instanced articulated parts; procedural stance contacts and behavior', animations: 'runtime, not baked in this review GLB' };
  root.updateMatrixWorld(true);
  const data = Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true }));
  const directory = fileURLToPath(new URL('../assets/fauna/', import.meta.url)); await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/fauna-kit.glb`, data);
  const source = await readFile(new URL('../src/render/faunaKit.ts', import.meta.url));
  const receipt = { version: 1, source: 'src/render/faunaKit.ts', sourceSha256: createHash('sha256').update(source).digest('hex'),
    exporter: 'Three GLTFExporter', three: THREE.REVISION, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'),
    purpose: 'portable rest-pose art kit; game uses the same source profiles in fixed instance pools', bakedAnimationClips: 0, species: report };
  await writeFile(`${directory}/fauna-kit.receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2)); kit.dispose(); for (const m of materials.values()) m.dispose();
} finally { await vite.close(); }
