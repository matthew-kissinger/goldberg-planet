import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { FarSphere, FAR_MARGIN, farTerrainRadius } from '../src/render/farsphere';
import { materialColor } from '../src/render/palette';
import { chunkKeyOfTile } from '../src/world/chunks';
import { makeDefaultPlanetConfig, buildSolarSystemConfigs } from '../src/world/planetConfig';
import { MAT, Terrain } from '../src/world/terrain';

function distantFixture(hasOcean = true) {
  const geo = new Goldberg(24);
  const config = makeDefaultPlanetConfig('distant-surface');
  config.ocean.hasOcean = hasOcean;
  config.atmosphere.density = 0;
  const terrain = new Terrain(config);
  vi.spyOn(terrain, 'heightAt').mockImplementation((x) => x > 0 ? 10 : -30);
  vi.spyOn(terrain, 'surfaceMaterial').mockReturnValue(MAT.ROCK);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const group = FarSphere.buildImpostorGroup(geo, terrain, material);
  return { geo, config, terrain, material, group };
}

describe('distant planet surface', () => {
  it('keeps all six current proxies within one fine layer of unedited collision tops', () => {
    for (const config of buildSolarSystemConfigs('transition-regression')) {
      const terrain = new Terrain(config);
      for (let height = -30; height < 100; height += .37) {
        const fineTop = 130 - Math.floor((130 - height) / config.layerH) * config.layerH;
        const proxy = farTerrainRadius(terrain, height, config.radius) - config.radius;
        expect(proxy).toBeLessThanOrEqual(fineTop + 1e-9);
        expect(fineTop - proxy).toBeLessThanOrEqual(Math.max(config.layerH, .625) + 1e-9);
      }
    }
  });
  it('uses one closed opaque mesh for land and sea, with no intersecting ocean shell', () => {
    const { geo, config, material, group } = distantFixture();
    expect(group.children).toHaveLength(1);
    const surface = group.children[0] as THREE.Mesh;
    expect(surface.material).toBe(material);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    const positions = surface.geometry.getAttribute('position');
    const colors = surface.geometry.getAttribute('color');
    const index = surface.geometry.getIndex()!;
    expect(positions.count).toBe(geo.count);
    expect(index.count / 3).toBe(2 * geo.count - 4);

    let landVertices = 0;
    let waterVertices = 0;
    let maxRadiusError = 0;
    let maxColorError = 0;
    const landColor = new Float32Array(3);
    for (let id = 0; id < geo.count; id++) {
      const onLand = geo.centers[id * 3] > 0;
      if (onLand) landVertices++;
      else waterVertices++;
      const expectedRadius = config.radius + (onLand ? 10 : config.waterSurfaceOffset);
      const radius = Math.hypot(positions.getX(id), positions.getY(id), positions.getZ(id));
      maxRadiusError = Math.max(maxRadiusError, Math.abs(radius - expectedRadius));
      materialColor(MAT.ROCK, id, geo.degreeOf(id) === 5, landColor);
      const expectedColor = onLand ? landColor : config.ocean.deepColor;
      maxColorError = Math.max(maxColorError,
        Math.abs(colors.getX(id) - expectedColor[0]),
        Math.abs(colors.getY(id) - expectedColor[1]),
        Math.abs(colors.getZ(id) - expectedColor[2]));
    }
    expect(landVertices).toBeGreaterThan(0);
    expect(waterVertices).toBeGreaterThan(0);
    expect(maxRadiusError).toBeLessThan(0.0001);
    expect(maxColorError).toBeLessThan(0.000001);

    // Every edge belongs to exactly two triangles, including the land/sea boundary.
    const edges = new Map<string, number>();
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      for (let edge = 0; edge < 3; edge++) {
        const a = ids[edge], b = ids[(edge + 1) % 3];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    expect(geo.count - edges.size + index.count / 3).toBe(2);
  });

  it('retains below-sea terrain and its land palette on an airless world without an ocean', () => {
    const { geo, config, group } = distantFixture(false);
    expect(group.children).toHaveLength(1);
    const geometry = (group.children[0] as THREE.Mesh).geometry;
    const positions = geometry.getAttribute('position');
    const colors = geometry.getAttribute('color');
    const lowId = Array.from({ length: geo.count }, (_, id) => id).find((id) => geo.centers[id * 3] <= 0)!;
    expect(Math.hypot(positions.getX(lowId), positions.getY(lowId), positions.getZ(lowId))).toBeCloseTo(config.radius - 30, 3);
    const expected = new Float32Array(3);
    materialColor(MAT.ROCK, lowId, geo.degreeOf(lowId) === 5, expected);
    expect([colors.getX(lowId), colors.getY(lowId), colors.getZ(lowId)]).toEqual([...expected]);
  });
});

describe('far terrain revisit cache', () => {
  it('keeps dry low coasts above ocean in initial, prepared and synchronous proxies', async () => {
    const geo = new Goldberg(4), first = new Terrain('coast-first'), prepared = new Terrain('coast-prepared'), sync = new Terrain('coast-sync');
    for (const terrain of [first, prepared, sync]) vi.spyOn(terrain, 'heightAt').mockImplementation(x => x > 0.5 ? 4 : x > 0 ? 30 : -10);
    const far = await FarSphere.build(geo, geo, first, new THREE.MeshStandardMaterial());
    expect((far.mesh.material as THREE.Material).polygonOffset).toBe(false);
    const check = (terrain: Terrain) => {
      const positions = far.mesh.geometry.getAttribute('position');
      for (let i = 0; i < geo.count; i++) {
        const h = terrain.heightAt(geo.centers[i * 3], geo.centers[i * 3 + 1], geo.centers[i * 3 + 2]);
        const r = Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i));
        expect(r).toBeCloseTo(farTerrainRadius(terrain, h, terrain.config.radius), 3);
        if (h === 4) expect(r).toBeGreaterThan(terrain.config.radius + terrain.config.waterSurfaceOffset + 0.49);
        if (h === 30 || h < 0) expect(r).toBeCloseTo(terrain.config.radius + h - FAR_MARGIN, 3);
      }
    };
    check(first);
    await far.prepareTerrain(prepared);
    far.rebindTerrain(prepared); check(prepared);
    far.rebindTerrain(sync); check(sync);
    expect((far.mesh.material as THREE.Material).polygonOffset).toBe(false);
    expect(farTerrainRadius(first, -0.2, 900)).toBeCloseTo(899.8);
    const dry = new Terrain('no-ocean'); dry.config.ocean.hasOcean = false;
    expect(farTerrainRadius(dry, 4, 900)).toBe(892);
  });

  it('restores coarse coverage synchronously when a fine chunk is released', async () => {
    const fine = new Goldberg(20), coarse = new Goldberg(10);
    const far = await FarSphere.build(coarse, fine, new Terrain('ownership'), new THREE.MeshStandardMaterial());
    const geometry = far.mesh.geometry, original = Array.from(geometry.getIndex()!.array);
    const owners = Array.from({ length: coarse.count }, (_, id) => chunkKeyOfTile(fine,
      fine.tileOf(coarse.centers[id * 3], coarse.centers[id * 3 + 1], coarse.centers[id * 3 + 2])));
    const resident = new Set(owners);
    far.setResidentChunks(resident);
    expect(geometry.drawRange.count).toBe(0);
    const released = owners[Math.floor(owners.length / 2)];
    resident.delete(released);
    far.setResidentChunks(resident);
    const restored = Array.from(geometry.getIndex()!.array).slice(0, geometry.drawRange.count);
    const expected: number[] = [];
    for (let i = 0; i < original.length; i += 3) {
      if (owners[original[i]] === released || owners[original[i + 1]] === released || owners[original[i + 2]] === released) expected.push(original[i], original[i + 1], original[i + 2]);
    }
    expect(restored.length).toBeGreaterThan(0);
    expect(restored).toEqual(expected);
  });

  it('prepares a detached destination incrementally and only changes the live mesh on commit', async () => {
    const geo = new Goldberg(4);
    const home = new Terrain('preparation-home'), away = new Terrain('preparation-away');
    const far = await FarSphere.build(geo, geo, home, new THREE.MeshStandardMaterial());
    const before = far.mesh.geometry.getAttribute('position').array.slice();
    const sample = vi.spyOn(away, 'heightAt');
    const preparing = far.prepareTerrain(away);
    expect(sample).not.toHaveBeenCalled();
    expect(far.hasPreparedTerrain(away)).toBe(false);
    expect(far.mesh.geometry.getAttribute('position').array).toEqual(before);
    await preparing;
    expect(far.hasPreparedTerrain(away)).toBe(true);
    expect(far.mesh.geometry.getAttribute('position').array).toEqual(before);
    sample.mockClear();
    far.rebindTerrain(away);
    expect(sample).not.toHaveBeenCalled();
    expect(far.mesh.geometry.getAttribute('position').array).not.toEqual(before);
    expect(far.mesh.geometry.boundingSphere!.radius).toBeGreaterThan(away.config.radius);
  });

  it('does not cache or attach cancelled partial preparation', async () => {
    const geo = new Goldberg(4);
    const home = new Terrain('cancel-home'), away = new Terrain('cancel-away');
    const far = await FarSphere.build(geo, geo, home, new THREE.MeshStandardMaterial());
    const before = far.mesh.geometry.getAttribute('position').array.slice();
    const controller = new AbortController();
    await expect(far.prepareTerrain(away, away.config.radius, {
      signal: controller.signal, onProgress: () => controller.abort(),
    })).rejects.toThrow();
    expect(far.hasPreparedTerrain(away)).toBe(false);
    expect(far.mesh.geometry.getAttribute('position').array).toEqual(before);
  });

  it('reuses sampled worlds, restores attributes and full coverage, and respects radius changes', async () => {
    const geo = new Goldberg(4);
    const first = new Terrain('first-cache-world');
    const second = new Terrain('second-cache-world');
    const firstSample = vi.spyOn(first, 'heightAt');
    const secondSample = vi.spyOn(second, 'heightAt');
    const far = await FarSphere.build(geo, geo, first, new THREE.MeshStandardMaterial());
    const geometry = far.mesh.geometry;
    const index = geometry.getIndex();
    const names = ['position', 'color', 'packedMat'];
    const original = names.map((name) => Array.from(geometry.getAttribute(name).array));
    firstSample.mockClear();
    far.rebindTerrain(first);
    expect(firstSample).not.toHaveBeenCalled();

    far.rebindTerrain(second);
    expect(secondSample).toHaveBeenCalledTimes(geo.count);
    const secondPositions = Array.from(geometry.getAttribute('position').array);
    expect(secondPositions).not.toEqual(original[0]);
    secondSample.mockClear();
    far.setResidentChunks(new Set(Array.from({ length: geo.count }, (_, id) => chunkKeyOfTile(geo, id))));
    expect(geometry.drawRange.count).toBe(0);

    far.rebindTerrain(first);
    expect(firstSample).not.toHaveBeenCalled();
    expect(names.map((name) => Array.from(geometry.getAttribute(name).array))).toEqual(original);
    expect(geometry.getIndex()).toBe(index);
    expect(geometry.drawRange.count).toBe(far.triangles * 3);
    far.rebindTerrain(second);
    expect(secondSample).not.toHaveBeenCalled();
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(secondPositions);

    far.rebindTerrain(second, 1000);
    expect(secondSample).toHaveBeenCalledTimes(geo.count);
    const pos = geometry.getAttribute('position');
    const h = second.heightAt(geo.centers[0], geo.centers[1], geo.centers[2]);
    expect(Math.hypot(pos.getX(0), pos.getY(0), pos.getZ(0))).toBeCloseTo(farTerrainRadius(second, h, 1000), 3);
  });
});
