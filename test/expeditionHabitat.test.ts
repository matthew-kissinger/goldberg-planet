import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Goldberg } from '../src/geo/goldberg';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';
import { buildLayers } from '../src/world/layers';
import { Terrain, MAT } from '../src/world/terrain';
import { Columns } from '../src/world/columns';
import { Trees } from '../src/world/trees';
import { createExpeditionHabitat, expeditionHeight, habitatDirection, habitatPathDistance, habitatX, habitatZ, HABITAT_BLEND_RADIUS } from '../src/world/expeditionHabitat';
import { HabitatRenderer } from '../src/render/habitat';
import { findSpawnTile } from '../src/game/spawn';

const geo = new Goldberg(96);
function world(seed = 'GP192-01') {
  const config = buildSolarSystemConfigs(seed)[0];
  const layers = buildLayers(config), terrain = new Terrain(config), columns = new Columns(geo, layers, terrain);
  const trees = new Trees(geo, columns, terrain, seed);
  const recipe = createExpeditionHabitat(geo, config)!;
  return { config, layers, terrain, columns, trees, recipe };
}

describe('Aurelia expedition composition', () => {
  it('keeps the fine layer band through the seabed after reducing walking steps', () => {
    const { layers } = world();
    expect(layers.cellH).toBe(0.625);
    expect(layers.bounds[layers.uniformLayers]).toBe(845);
    for (let h = -50; h < 115; h++) expect(layers.thickness(layers.layerOfRadius(900 + h))).toBe(0.625);
  });

  it('is repeatable, keeps distinct communities and reserves a clear trail', () => {
    const a = world(), b = world();
    expect(a.recipe).toBe(b.recipe);
    expect(a.recipe.trees.length).toBeGreaterThanOrEqual(14);
    expect(a.recipe.plants.length).toBeGreaterThan(180);
    expect(a.recipe.plants.length).toBeLessThan(400);
    for (const p of a.recipe.plants) expect(habitatPathDistance(p.x, p.z)).toBeGreaterThanOrEqual(4.5);
    for (const tree of a.recipe.trees) expect(habitatPathDistance(tree.x, tree.z)).toBeGreaterThanOrEqual(8);
    expect(a.recipe.plants.filter(p => p.community === 'grove' && p.kind === 'fern').length).toBeGreaterThan(80);
    expect(a.recipe.plants.filter(p => p.community === 'shore' && p.kind === 'grass').length).toBeGreaterThan(50);
    expect(world('another-seed').recipe.plants).not.toEqual(a.recipe.plants);
  });

  it('keeps the recipe local and the shoreline open to sky', () => {
    const { terrain, columns, recipe, trees } = world();
    expect(expeditionHeight(HABITAT_BLEND_RADIUS, 0, 42)).toBe(42);
    const sea = habitatDirection(65, -40, 900), land = habitatDirection(-35, -40, 900);
    expect(terrain.heightAt(...sea)).toBeLessThan(-3);
    expect(terrain.heightAt(...land)).toBeGreaterThan(3);
    expect(columns.skyIslandRange(recipe.spawnTile)).toBeNull();
    expect(trees.hasTree(recipe.spawnTile)).toBe(false);
    expect(findSpawnTile(geo, columns, trees)).toBe(recipe.spawnTile);
    expect(terrain.surfaceMaterial(5, ...habitatDirection(-6, 0, 900))).toBe(MAT.LIMESTONE);
  });

  it('has a connected walkable route at the shipped topology', () => {
    const shipped = new Goldberg(192), config = buildSolarSystemConfigs('GP192-01')[0];
    const layers = buildLayers(config), columns = new Columns(shipped, layers, new Terrain(config));
    const recipe = createExpeditionHabitat(shipped, config)!;
    expect(recipe.route.length).toBeGreaterThan(25);
    let maxStep = 0;
    for (let i = 1; i < recipe.route.length; i++) {
      const a = recipe.route[i - 1], b = recipe.route[i];
      expect(Array.from(shipped.nbrs.subarray(a * 6, a * 6 + shipped.degreeOf(a)))).toContain(b);
      const delta = Math.abs(layers.topRadius(columns.topLayerOf(a)) - layers.topRadius(columns.topLayerOf(b)));
      maxStep = Math.max(maxStep, delta);
    }
    expect(maxStep).toBeLessThanOrEqual(0.625);
  });

  it('preserves tree interaction and bounds resident art without rebuilding geometry', () => {
    const { columns, trees, recipe } = world();
    const scene = new THREE.Scene(), renderer = new HabitatRenderer(scene, geo, columns, trees, recipe);
    const d = habitatDirection(-10, -44, 900);
    const player = { px: d[0] * 905, py: d[1] * 905, pz: d[2] * 905 };
    const camera = { x: player.px, y: player.py, z: player.pz };
    renderer.update(1 / 60, 0, player, camera);
    expect(renderer.stats().active).toBe(true);
    expect(renderer.stats().visiblePlants).toBeGreaterThan(0);
    const visibleBeforeMine = renderer.stats().visiblePlants;
    const plant = recipe.plants.find(p => Math.hypot(p.x + 10, p.z + 44) < 25 && !recipe.treeByTile.has(geo.tileOf(...habitatDirection(p.x, p.z, 900))))!;
    const plantTile = geo.tileOf(...habitatDirection(plant.x, plant.z, 900));
    expect(columns.mine(plantTile, columns.topLayerOf(plantTile))).toBe(true);
    renderer.update(1 / 60, 0.1, player, camera);
    expect(renderer.stats().visiblePlants).toBeLessThan(visibleBeforeMine);
    expect(renderer.stats().geometryCount).toBeLessThanOrEqual(8);
    const tree = recipe.trees[0];
    expect(trees.hasTree(tree.tile)).toBe(true);
    expect(trees.chop(tree.tile)).toBe(true);
    renderer.update(1 / 60, 1, player, camera);
    expect(renderer.stats().trees).toBe(recipe.trees.length - 1);
    expect(renderer.stats().geometryCount).toBe(8);
    const c = geo.centers, o = recipe.spawnTile * 3;
    expect(Number.isFinite(habitatX(c[o], c[o + 1], c[o + 2], 900))).toBe(true);
    expect(Number.isFinite(habitatZ(c[o], c[o + 1], c[o + 2], 900))).toBe(true);
    renderer.update(1 / 60, 2, player, camera, false);
    expect(renderer.group.visible).toBe(false);
    expect(renderer.stats().visiblePlants).toBe(0);
    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('renders player-seeded trees in the new family without replacing designed trees or rebuilding geometry', () => {
    const { columns, trees, recipe } = world();
    const scene = new THREE.Scene(), renderer = new HabitatRenderer(scene, geo, columns, trees, recipe);
    const wood = renderer.group.children.find(child => child instanceof THREE.InstancedMesh && child.geometry.type === 'CylinderGeometry') as THREE.InstancedMesh;
    const geometry = wood.geometry, instanceBuffer = wood.instanceMatrix;
    for (const tree of recipe.trees) columns.seedEcosystem(tree.tile, false);
    for (const tree of recipe.trees) expect(trees.hasTree(tree.tile)).toBe(true);
    columns.seedEcosystem(recipe.spawnTile, true);
    const seeded = [...columns.seededEcoTiles].filter(tile => !recipe.treeByTile.has(tile) && trees.hasTree(tile));
    expect(seeded.length).toBeGreaterThan(0);
    const d = habitatDirection(-10, -44, 900);
    const player = { px: d[0] * 905, py: d[1] * 905, pz: d[2] * 905 };
    const camera = { x: player.px, y: player.py, z: player.pz };
    renderer.update(0.3, 1, player, camera);
    expect(renderer.stats().trees).toBe(recipe.trees.length + seeded.length);
    expect(wood.count).toBe((recipe.trees.length + seeded.length) * 8);
    for (const tile of seeded) {
      expect(trees.paramsFor(tile).habitat?.tile).toBe(tile);
      expect(trees.paramsFor(tile).kind).toBe('broadleaf');
      expect(trees.groveTreesFor(tile)).toHaveLength(1);
    }
    const before = renderer.stats().trees;
    trees.chop(seeded[0]);
    renderer.update(1 / 60, 2, player, camera);
    expect(renderer.stats().trees).toBe(before - 1);
    expect(wood.geometry).toBe(geometry);
    expect(wood.instanceMatrix).toBe(instanceBuffer);
    renderer.dispose();
  });

  it('caps dense seeded residency and submits no unused spare instances', () => {
    const { columns, trees, recipe } = world();
    for (let x = -150; x <= 75; x += 5) for (let z = -130; z <= 160; z += 5) {
      columns.seedEcosystem(geo.tileOf(...habitatDirection(x, z, 900)), false);
    }
    const renderer = new HabitatRenderer(new THREE.Scene(), geo, columns, trees, recipe);
    const d = habitatDirection(-25, 20, 900);
    const player = { px: d[0] * 905, py: d[1] * 905, pz: d[2] * 905 };
    renderer.update(0.3, 1, player, { x: 0, y: 0, z: 0 });
    expect(renderer.stats().trees).toBe(recipe.trees.length + 128);
    expect(renderer.stats().geometryCount).toBe(8);
    columns.seededEcoTiles.clear();
    renderer.update(0.3, 2, player, { x: 0, y: 0, z: 0 });
    expect(renderer.stats().trees).toBe(recipe.trees.length);
    const wood = renderer.group.children.find(child => child instanceof THREE.InstancedMesh && child.geometry.type === 'CylinderGeometry') as THREE.InstancedMesh;
    expect(wood.count).toBe(recipe.trees.length * 8);
    renderer.dispose();
  });
});
