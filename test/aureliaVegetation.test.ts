import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';
import { Terrain } from '../src/world/terrain';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Trees, type TreeParams } from '../src/world/trees';
import { aureliaSites, type AureliaTreeSpecies } from '../src/world/aurelia';
import { createExpeditionHabitat, habitatDirection } from '../src/world/expeditionHabitat';
import { AureliaVegetationRenderer, VEGETATION_BUDGET, aureliaPlantModule } from '../src/render/aureliaVegetation';
import { AURELIA_TREE_KIT, aureliaTreeMatrix, bakeAureliaTree, pickAureliaTree, plantModuleGeometry, visitAureliaTreeParts, type PlantModule } from '../src/render/vegetationKit';
import { FallingTreeRenderer } from '../src/render/fallingTrees';
import { buildChunkMesh } from '../src/render/mesher';

const geo = new Goldberg(96);
function world(seed = 'vegetation-contract') {
  const config = buildSolarSystemConfigs(seed)[0], layers = buildLayers(config), terrain = new Terrain(config);
  const columns = new Columns(geo, layers, terrain), trees = new Trees(geo, columns, terrain, seed);
  return { config, layers, terrain, columns, trees };
}
function params(species: AureliaTreeSpecies, age = 0.6): TreeParams {
  return { kind: 'broadleaf', trunk: 4.5, canopy: 3.5, spread: 4, girth: 0.4, offA: 0.4, offB: -0.2, tint: 1, aurelia: { species, age, seed: 123456789 } };
}
function settle(renderer: AureliaVegetationRenderer, direction: readonly number[], radius = 905): { player: { px: number; py: number; pz: number }; camera: THREE.Vector3 } {
  const player = { px: direction[0] * radius, py: direction[1] * radius, pz: direction[2] * radius };
  const camera = new THREE.Vector3(player.px, player.py, player.pz);
  for (let i = 0; i < 200; i++) {
    renderer.update(1 / 60, i / 60, player, camera);
    if (!renderer.stats().pending && renderer.stats().refreshes > 0) return { player, camera };
  }
  throw new Error('Bounded local discovery did not finish');
}
function activeMatrices(renderer: AureliaVegetationRenderer): number[][] {
  return renderer.group.children.filter((m): m is THREE.InstancedMesh => (m as THREE.InstancedMesh).isInstancedMesh)
    .map(m => Array.from(m.instanceMatrix.array.slice(0, m.count * 16)));
}

describe('shared Aurelia vegetation kit', () => {
  it('gives every species a distinct crown, with bounded parts and real dead forms', () => {
    const silhouettes = new Set<string>();
    for (const species of Object.keys(AURELIA_TREE_KIT) as AureliaTreeSpecies[]) {
      const a: unknown[][] = [], b: unknown[][] = [], simple: unknown[][] = [], dead: string[] = [];
      visitAureliaTreeParts(params(species), false, (...part) => a.push(part));
      visitAureliaTreeParts(params(species), false, (...part) => b.push(part));
      visitAureliaTreeParts(params(species), true, (...part) => simple.push(part));
      visitAureliaTreeParts(params(species, 0.98), false, shape => dead.push(shape));
      expect(a).toEqual(b); expect(a.length).toBeLessThanOrEqual(13);
      expect(simple.length).toBeLessThan(a.length); expect(dead.every(shape => shape === 'stem')).toBe(true);
      expect(dead.length).toBeLessThanOrEqual(9);
      silhouettes.add(JSON.stringify(a.map(part => [part[0], ...part.slice(2)])));
    }
    expect(silhouettes.size).toBe(5);
  });

  it('builds distinct closed leaf/flower modules with finite normals and bounded detail', () => {
    const signatures = new Set<string>();
    for (const kind of ['fern', 'reed', 'grass', 'drygrass', 'rosette', 'bell', 'spike', 'shrub'] as PlantModule[]) {
      const geometry = plantModuleGeometry(kind), points = geometry.getAttribute('position');
      expect(points.count / 3).toBeLessThan(400);
      expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
      signatures.add(`${points.count}:${geometry.boundingBox?.max.y}`);
      geometry.dispose();
    }
    expect(signatures.size).toBe(8);
    expect(aureliaPlantModule('wetland', 0.9, 0.7, 0.4, 0.5)).toBe('reed');
    expect(aureliaPlantModule('woodland', 0.8, 0.9, 0.4, 0.5)).toBe('fern');
    expect(aureliaPlantModule('dryland', 0.1, 0.2, 0.4, 0.5)).toBe('drygrass');
    expect(aureliaPlantModule('meadow', 0.5, 0.3, 0.7, 0.3)).toBe('rosette');
  });

  it('picks the same transformed triangles as the live/falling kit, including wide canopy sides', () => {
    const p = params('umbrella'), base = aureliaTreeMatrix(p, 0, 1, 0, 904, new THREE.Matrix4());
    const geometry = bakeAureliaTree(p), mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.matrix.copy(base); mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
    for (const local of [[0, 1.5, 10], [2.2, 6.1, 10], [-2.2, 6.2, 10], [9, 6, 10]]) {
      const origin = new THREE.Vector3(...local).applyMatrix4(base), direction = new THREE.Vector3(0, 0, -1).transformDirection(base);
      const reference = new THREE.Raycaster(origin, direction, 0, 30).intersectObject(mesh)[0]?.distance ?? null;
      const actual = pickAureliaTree(p, 0, 1, 0, 904, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, 30);
      if (reference === null) expect(actual).toBeNull(); else expect(actual).toBeCloseTo(reference, 5);
    }
    geometry.dispose(); (mesh.material as THREE.Material).dispose();
  });

  it('preserves authored pose and crown extent when felling, with the cut trunk above its hinge', () => {
    const p = params('cypress'); p.habitat = { tile: 2, x: -30, z: 70, scale: 1, yaw: 1.2, community: 'grove' }; p.planetRadius = 900;
    const base = aureliaTreeMatrix(p, 0, 1, 0, 906, new THREE.Matrix4()), renderer = new FallingTreeRenderer(new THREE.Scene());
    renderer.spawn(2, 0, 1, 0, 906, p); renderer.update(0, 0, 0, 0);
    const item = renderer.active[0], origin = new THREE.Vector3().setFromMatrixPosition(base), rotation = new THREE.Quaternion().setFromRotationMatrix(base);
    expect(item.stumpGroup.position.distanceTo(origin)).toBeLessThan(1e-8);
    expect(item.baseQuaternion.angleTo(rotation)).toBeLessThan(1e-7);
    const cut = (item.meshGroup.children[0] as THREE.Mesh).geometry, full = bakeAureliaTree(p);
    cut.computeBoundingBox(); full.computeBoundingBox();
    expect(cut.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.00001);
    expect(cut.boundingBox!.max.y + 0.36).toBeCloseTo(full.boundingBox!.max.y, 5);
    full.dispose(); renderer.dispose();
  });
});

describe('bounded planet-wide vegetation residency', () => {
  it('warms every layout with initialized attributes, then restores empty resident slots', () => {
    const w = world(), renderer = new AureliaVegetationRenderer(new THREE.Scene(), geo, w.columns, w.trees, w.terrain);
    const restore = renderer.prepareWarmup();
    expect(renderer.group.visible).toBe(true);
    for (const child of renderer.group.children) if ((child as THREE.InstancedMesh).isInstancedMesh) {
      const mesh = child as THREE.InstancedMesh;
      expect(mesh.count).toBe(1); expect(mesh.frustumCulled).toBe(false);
      expect(mesh.instanceColor).not.toBeNull(); expect(mesh.geometry.getAttribute('windPhase').itemSize).toBe(1);
    }
    restore(); expect(renderer.group.visible).toBe(false);
    for (const child of renderer.group.children) if ((child as THREE.InstancedMesh).isInstancedMesh) expect((child as THREE.InstancedMesh).count).toBe(0);
    renderer.dispose();
  });

  it('is deterministic, submits active slots only, and does no repeated terrain sampling while standing', () => {
    const w = world(), a = new AureliaVegetationRenderer(new THREE.Scene(), geo, w.columns, w.trees, w.terrain);
    const other = world(), b = new AureliaVegetationRenderer(new THREE.Scene(), geo, other.columns, other.trees, other.terrain);
    const d = habitatDirection(-10, -44, 900), pose = settle(a, d); settle(b, d);
    expect(a.stats().trees).toBeGreaterThan(3); expect(a.stats().visiblePlants).toBeGreaterThan(20);
    expect(activeMatrices(a)).toEqual(activeMatrices(b));
    const height = vi.spyOn(w.terrain, 'heightAt'), refreshes = a.stats().refreshes;
    for (let i = 0; i < 120; i++) a.update(1 / 60, 10 + i / 60, pose.player, pose.camera);
    expect(a.stats().refreshes).toBe(refreshes); expect(height).not.toHaveBeenCalled();
    for (const values of activeMatrices(a)) for (let i = 0; i < values.length; i += 16) {
      expect(values.slice(i, i + 16).every(Number.isFinite)).toBe(true);
      expect(Math.hypot(values[i], values[i + 1], values[i + 2])).toBeGreaterThan(0);
    }
    a.dispose(); b.dispose();
  });

  it('removes a chopped tree and mined plants immediately, before incremental resampling finishes', () => {
    const w = world(), renderer = new AureliaVegetationRenderer(new THREE.Scene(), geo, w.columns, w.trees, w.terrain);
    const d = habitatDirection(-10, -44, 900), pose = settle(renderer, d), recipe = createExpeditionHabitat(geo, w.config)!;
    const before = renderer.stats();
    const tree = recipe.trees.find(t => Math.hypot(t.x + 10, t.z + 44) < 45)!;
    expect(w.trees.chop(tree.tile)).toBe(true);
    renderer.update(1 / 60, 11, pose.player, pose.camera);
    expect(renderer.stats().trees).toBe(before.trees - 1);
    const plant = recipe.plants.find(p => Math.hypot(p.x + 10, p.z + 44) < 40)!;
    const tile = geo.tileOf(...habitatDirection(plant.x, plant.z, 900));
    w.columns.mine(tile, w.columns.topLayerOf(tile));
    renderer.update(1 / 60, 12, pose.player, pose.camera);
    expect(renderer.stats().visiblePlants).toBeLessThan(before.visiblePlants);
    renderer.dispose();
  });

  it('moves through all six habitats with fixed resources, bounded discovery and disposal', () => {
    const w = world(), scene = new THREE.Scene(), renderer = new AureliaVegetationRenderer(scene, geo, w.columns, w.trees, w.terrain);
    const geometryCount = renderer.stats().geometryCount, counts: number[] = [];
    for (const site of aureliaSites(w.config)) {
      const pose = settle(renderer, site.direction, 900 + w.terrain.heightAt(...site.direction) + 2);
      counts.push(renderer.stats().trees);
      expect(renderer.stats().geometryCount).toBe(geometryCount);
      expect(renderer.stats().trees).toBeLessThanOrEqual(VEGETATION_BUDGET.trees + VEGETATION_BUDGET.outerTrees);
      expect(renderer.stats().visiblePlants).toBeLessThanOrEqual(VEGETATION_BUDGET.plants);
      expect(renderer.stats().residentTiles).toBeLessThanOrEqual(VEGETATION_BUDGET.tiles);
      expect(renderer.stats().landmarks).toBeGreaterThan(0);
      renderer.update(1 / 60, 20, pose.player, pose.camera, false); expect(renderer.group.visible).toBe(false);
    }
    expect(counts.every(n => n > 0)).toBe(true);
    const geometries = new Set<THREE.BufferGeometry>(); renderer.group.traverse(object => { if ((object as THREE.Mesh).isMesh) geometries.add((object as THREE.Mesh).geometry); });
    const disposed = [...geometries].map(g => vi.spyOn(g, 'dispose'));
    renderer.dispose(); renderer.dispose(); expect(scene.children).not.toContain(renderer.group);
    for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('leaves all Aurelia tree rendering to the kit, including globally seeded tiles', () => {
    const w = world(), site = aureliaSites(w.config)[2], tile = geo.tileOf(...site.direction);
    w.columns.seedEcosystem(tile);
    const ids = [tile, ...Array.from(geo.nbrs.subarray(tile * 6, tile * 6 + geo.degreeOf(tile)))];
    const chunk = { key: 1, f: 0, ci: 0, cj: 0, tiles: Int32Array.from(ids), cx: site.direction[0], cy: site.direction[1], cz: site.direction[2], angRadius: 0.1 };
    const withTrees = buildChunkMesh(chunk, geo, w.layers, w.columns, w.trees)!, terrainOnly = buildChunkMesh(chunk, geo, w.layers, w.columns)!;
    expect(withTrees.positions).toEqual(terrainOnly.positions);
    expect(Array.from(withTrees.packedMat).some(value => ((value >>> 8) & 4) !== 0)).toBe(false);
  });
});
