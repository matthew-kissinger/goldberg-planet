import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';
import { Terrain, MAT } from '../src/world/terrain';
import { Columns } from '../src/world/columns';
import { Trees, type TreeParams } from '../src/world/trees';
import { buildLayers } from '../src/world/layers';
import { GROWTH_SPECIES, type WorldGrowthSpecies } from '../src/world/growthSpecies';
import { worldSites } from '../src/world/expeditionWorlds';
import { AureliaVegetationRenderer, WORLD_VEGETATION_MODULES, VEGETATION_BUDGET } from '../src/render/aureliaVegetation';
import { aureliaTreeMatrix, bakeAureliaTree, pickAureliaTree, plantModuleGeometry, treePartGeometry, treeWindWeight, visitVegetationTreeParts, type TreePartShape } from '../src/render/vegetationKit';
import { buildChunkMesh } from '../src/render/mesher';

const geo = new Goldberg(96), configs = buildSolarSystemConfigs('expedition-kit-contract');
function params(species: WorldGrowthSpecies): TreeParams {
  const p = GROWTH_SPECIES[species];
  return { kind: p.kind, trunk: p.trunk, canopy: p.canopy, spread: p.spread, girth: p.girth, offA: 0.3, offB: -0.25, tint: 1,
    growth: { species, age: 0.6, seed: 123456789 } };
}
function world(index: number) {
  const config = configs[index], terrain = new Terrain(config), layers = buildLayers(config), columns = new Columns(geo, layers, terrain);
  return { config, terrain, layers, columns, trees: new Trees(geo, columns, terrain, config.seed) };
}
function settle(renderer: AureliaVegetationRenderer, direction: readonly number[], radius: number) {
  const player = { px: direction[0] * radius, py: direction[1] * radius, pz: direction[2] * radius }, camera = { x: player.px, y: player.py, z: player.pz };
  for (let i = 0; i < 250; i++) {
    renderer.update(1 / 60, i / 60, player, camera);
    if (!renderer.stats().pending && renderer.stats().refreshes) return { player, camera };
  }
  throw new Error('Expedition vegetation did not finish its bounded scan');
}

describe('five-world growth kit', () => {
  it('encloses fungal caps with outward faces and attaches their undersides to stems', () => {
    const geometry = treePartGeometry('parasol'), material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide }), mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld(true);
    const top = new THREE.Raycaster(new THREE.Vector3(0.55, 2, 0), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
    const bottom = new THREE.Raycaster(new THREE.Vector3(0.55, -2, 0), new THREE.Vector3(0, 1, 0)).intersectObject(mesh)[0];
    expect(top).toBeDefined(); expect(bottom).toBeDefined();
    expect(top.point.y).toBeGreaterThan(0.25); expect(top.face!.normal.y).toBeGreaterThan(0);
    expect(bottom.point.y).toBeLessThan(0); expect(bottom.face!.normal.y).toBeLessThan(0);
    geometry.dispose(); material.dispose();
    for (const age of [0.15, 0.6, 0.96]) {
      const p = params('fungalParasol'); p.growth!.age = age;
      const cap = new THREE.Vector3();
      visitVegetationTreeParts(p, false, (shape, _paint, x, y, z, _sx, sy) => {
        if (shape === 'parasol' && Math.abs(x - p.spread * 0.12) < 0.001 && Math.abs(z) < 0.001) cap.set(x, y + 0.02 * sy, z);
      });
      // The main stem endpoint is h: the closed center of the underside must
      // meet or slightly overlap it, never leave the cap suspended above it.
      expect(cap.y).toBeLessThanOrEqual(p.trunk); expect(p.trunk - cap.y).toBeLessThan(0.1);
    }
    const crystal = treePartGeometry('crystal'), normals = crystal.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 5);
    crystal.dispose();
  });

  it('authors distinct assemblies with bounded detail and immutable mineral forms', () => {
    const signatures = new Set<string>();
    for (const species of Object.keys(GROWTH_SPECIES) as WorldGrowthSpecies[]) {
      const p = params(species), parts: unknown[][] = [], simple: unknown[][] = [];
      visitVegetationTreeParts(p, false, (...part) => parts.push(part));
      visitVegetationTreeParts(p, true, (...part) => simple.push(part));
      expect(parts.length).toBeLessThanOrEqual(14); expect(simple.length).toBeLessThan(parts.length);
      signatures.add(JSON.stringify(parts.map(part => [part[0], ...part.slice(2)])));
      const full = bakeAureliaTree(p), cut = bakeAureliaTree(p, 0.36);
      expect(full.getAttribute('position').count / 3).toBeLessThan(1100);
      expect(Array.from(full.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
      expect(cut.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.00001);
      expect(cut.boundingBox!.max.y + 0.36).toBeCloseTo(full.boundingBox!.max.y, 4);
      full.dispose(); cut.dispose();
    }
    expect(signatures.size).toBe(11);
    expect(treeWindWeight(params('crystalFan'))).toBe(0); expect(treeWindWeight(params('iceFan'))).toBe(0);
    expect(treeWindWeight(params('charCoral'))).toBe(0); expect(treeWindWeight(params('desertPalm'))).toBeGreaterThan(0);
  });

  it('matches the exported triangles when picking every family on a rotated spherical base', () => {
    const up = new THREE.Vector3(0.6, 0.4, 0.5).normalize();
    for (const species of Object.keys(GROWTH_SPECIES) as WorldGrowthSpecies[]) {
      const p = params(species), base = aureliaTreeMatrix(p, up.x, up.y, up.z, 520, new THREE.Matrix4());
      const geometry = bakeAureliaTree(p), mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      mesh.matrix.copy(base); mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
      let hits = 0;
      for (const height of [0.2, 0.5, 0.85]) {
        const origin = new THREE.Vector3(0, (p.trunk + p.canopy) * height, 12).applyMatrix4(base), direction = new THREE.Vector3(0, 0, -1).transformDirection(base);
        const reference = new THREE.Raycaster(origin, direction, 0, 24).intersectObject(mesh)[0]?.distance ?? null;
        const actual = pickAureliaTree(p, up.x, up.y, up.z, 520, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, 24);
        if (reference === null) expect(actual).toBeNull(); else { hits++; expect(actual).toBeCloseTo(reference, 4); }
      }
      expect(hits).toBeGreaterThan(0); geometry.dispose(); (mesh.material as THREE.Material).dispose();
    }
  });

  it('uses separate planet modules rather than Earth understory recolors', () => {
    const all = new Set<string>();
    for (const [archetype, profile] of Object.entries(WORLD_VEGETATION_MODULES)) {
      if (archetype === 'terran') continue;
      expect(profile.plants).toHaveLength(3);
      for (const kind of profile.plants) {
        expect(all.has(kind)).toBe(false); all.add(kind);
        const geometry = plantModuleGeometry(kind);
        expect(geometry.getAttribute('position').count / 3).toBeLessThan(400);
        expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
        geometry.dispose();
      }
    }
    expect(all.size).toBe(15);
  });

  it('keeps all 15 named arrivals clear while admitting bounded surrounding communities', () => {
    for (let index = 1; index < configs.length; index++) {
      const w = world(index), scene = new THREE.Scene(), renderer = new AureliaVegetationRenderer(scene, geo, w.columns, w.trees, w.terrain);
      const resourceCount = renderer.stats().geometryCount, treeCounts: number[] = [];
      for (const site of worldSites(w.config)) {
        const centerTile = geo.tileOf(...site.direction);
        expect(w.trees.hasTree(centerTile)).toBe(false);
        const pose = settle(renderer, site.direction, w.config.radius + w.terrain.heightAt(...site.direction) + 2);
        const stats = renderer.stats(); treeCounts.push(stats.trees);
        expect(stats.residentTiles).toBeLessThanOrEqual(VEGETATION_BUDGET.tiles);
        expect(stats.trees).toBeLessThanOrEqual(VEGETATION_BUDGET.trees + VEGETATION_BUDGET.outerTrees);
        expect(stats.visiblePlants).toBeLessThanOrEqual(VEGETATION_BUDGET.plants);
        expect(stats.geometryCount).toBe(resourceCount);
        expect(stats.landmarks).toBeGreaterThan(0);
        const height = vi.spyOn(w.terrain, 'heightAt');
        for (let i = 0; i < 20; i++) renderer.update(1 / 60, 20 + i / 60, pose.player, pose.camera);
        expect(height).not.toHaveBeenCalled(); height.mockRestore();
        renderer.update(0, 21, pose.player, pose.camera, false); expect(renderer.group.visible).toBe(false);
      }
      expect(treeCounts.some(count => count > 0)).toBe(true);
      renderer.dispose(); expect(scene.children).not.toContain(renderer.group);
    }
  });

  it('preserves seeded species, exact single-tree identities and exclusive kit ownership', () => {
    for (let index = 1; index < configs.length; index++) {
      const w = world(index), site = worldSites(w.config)[0], center = geo.tileOf(...site.direction);
      const ids = [center, ...Array.from(geo.nbrs.subarray(center * 6, center * 6 + geo.degreeOf(center)))];
      for (const tile of ids) w.columns.seedEcosystem(tile, false);
      const seeded = ids.filter(id => w.trees.hasTree(id)); expect(seeded.length).toBeGreaterThan(0);
      for (const id of seeded) {
        const p = w.trees.paramsFor(id); expect(p.growth).toBeDefined(); expect(p.aurelia).toBeUndefined();
        expect(GROWTH_SPECIES[p.growth!.species].world).toBe(w.config.archetype);
        expect(p.growth!.age).toBeLessThanOrEqual(0.25); expect(w.trees.groveTreesFor(id)).toHaveLength(1);
      }
      const chunk = { key: 1, f: 0, ci: 0, cj: 0, tiles: Int32Array.from(ids), cx: site.direction[0], cy: site.direction[1], cz: site.direction[2], angRadius: 0.1 };
      const a = buildChunkMesh(chunk, geo, w.layers, w.columns, w.trees)!, b = buildChunkMesh(chunk, geo, w.layers, w.columns)!;
      expect(a.positions).toEqual(b.positions);
      expect(Array.from(a.packedMat).some(value => ((value >>> 8) & 4) !== 0)).toBe(false);
      expect(Array.from(a.packedMat).some(value => (value & 255) === MAT.WOOD)).toBe(false);
    }
  });

  it('allocates enough shape slots for the worst full/simple part count in each family', () => {
    const maximum: Partial<Record<TreePartShape, number>> = {};
    for (const species of Object.keys(GROWTH_SPECIES) as WorldGrowthSpecies[]) {
      const counts = new Map<TreePartShape, number>();
      visitVegetationTreeParts(params(species), false, shape => counts.set(shape, (counts.get(shape) ?? 0) + 1));
      for (const [shape, count] of counts) maximum[shape] = Math.max(maximum[shape] ?? 0, count);
    }
    for (let index = 1; index < configs.length; index++) {
      const w = world(index), renderer = new AureliaVegetationRenderer(new THREE.Scene(), geo, w.columns, w.trees, w.terrain);
      const restore = renderer.prepareWarmup();
      for (const node of renderer.group.children) if ((node as THREE.InstancedMesh).isInstancedMesh) {
        const mesh = node as THREE.InstancedMesh;
        expect(mesh.instanceColor).not.toBeNull(); expect(mesh.geometry.getAttribute('windWeight')).toBeDefined();
        expect(mesh.count).toBe(1);
      }
      expect(maximum.crystal).toBe(6); expect(maximum.frond).toBe(8); expect(maximum.stem).toBe(9);
      restore(); renderer.dispose();
    }
  });
});
