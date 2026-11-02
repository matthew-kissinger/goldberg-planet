import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { buildOcean } from '../src/render/ocean';
import { buildLayers } from '../src/world/layers';
import { makeDefaultPlanetConfig, buildSolarSystemConfigs } from '../src/world/planetConfig';
import { planetVisualProfile } from '../src/render/planetVisualProfile';
import { Terrain } from '../src/world/terrain';

// Exercise the actual sampling/cache and GPU-buffer contract on a small sphere.
vi.mock('../src/render/geodesic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/render/geodesic')>();
  return { ...actual, buildGeodesic: () => actual.buildGeodesic(0) };
});

function planet(seed: string, height: number, radius = 900) {
  const config = { ...makeDefaultPlanetConfig(seed), radius };
  const terrain = new Terrain(config);
  const sample = vi.spyOn(terrain, 'heightAt').mockReturnValue(height);
  return { config, terrain, sample, layers: buildLayers(config) };
}

describe('ocean planet sample cache', () => {
  it('clamps interpolated shore undershoot before fractional powers so a zero-weight water branch cannot poison magma', async () => {
    const home = planet('ocean-shore-undershoot', -8);
    const ocean = await buildOcean(new THREE.Scene(), home.terrain, home.layers, async () => {});
    const material = ocean.material as THREE.MeshStandardNodeMaterial;
    // Follow the actual graph feeding shore^1.7; exercise the GPU interpolation
    // boundary values which previously produced a black offshore perimeter.
    type N = { constructor: { name: string }; method?: string; value?: unknown; node?: N; aNode?: N; bNode?: N; cNode?: N; _attributeName?: string };
    let power: N | undefined;
    material.colorNode!.traverse(node => { const n = node as unknown as N; if (n.method === 'pow' && n.bNode?.value === 1.7) power = n; });
    expect(power).toBeDefined();
    const evaluate = (node: N, shore: number): number => {
      if (node.constructor.name === 'ConstNode') return Number(node.value);
      if (node._attributeName === 'shore') return shore;
      if (node.constructor.name === 'ConvertNode') return evaluate(node.node!, shore);
      if (node.method === 'clamp') return Math.min(evaluate(node.cNode!, shore), Math.max(evaluate(node.bNode!, shore), evaluate(node.aNode!, shore)));
      throw new Error(`Unexpected shore node ${node.constructor.name}/${node.method}`);
    };
    for (const value of [-1e-7, 0, .5, 1, 1.0000001]) {
      const clamped = evaluate(power!.aNode!, value);
      expect(clamped).toBe(Math.max(0, Math.min(1, value)));
      expect(Number.isFinite(Math.pow(clamped, 1.7))).toBe(true);
    }
    ocean.geometry.dispose(); material.dispose();
  });
  it('changes water motion, surface response, and molten crust through uniforms without a new shader', async () => {
    const home = planet('ocean-profile', -8);
    const ocean = await buildOcean(new THREE.Scene(), home.terrain, home.layers, async () => {});
    const material = ocean.material as THREE.MeshStandardNodeMaterial;
    const outputs = [material.positionNode, material.colorNode, material.roughnessNode, material.emissiveNode, material.opacityNode];
    const version = material.version;
    const roughnessValues: unknown[] = [], positionValues: unknown[] = [];
    const collect = (node: THREE.Node | null, values: unknown[]) => node!.traverse(n => {
      const candidate = n as unknown as { isUniformNode?: boolean; value: unknown };
      if (candidate.isUniformNode) values.push(candidate.value);
    });
    for (const cfg of buildSolarSystemConfigs('ocean-profile-worlds')) {
      ocean.rebindPlanet(home.terrain, home.layers, cfg);
      roughnessValues.length = positionValues.length = 0;
      collect(material.roughnessNode, roughnessValues); collect(material.positionNode, positionValues);
      const p = planetVisualProfile(cfg).ocean;
      expect(roughnessValues).toContain(p.roughness);
      expect(positionValues).toContain(p.amplitude);
      expect(positionValues).toContain(p.speed);
      expect([material.positionNode, material.colorNode, material.roughnessNode, material.emissiveNode, material.opacityNode]).toEqual(outputs);
      expect(material.version).toBe(version);
    }
    ocean.geometry.dispose(); material.dispose();
  });
  it('fades the material to distant opacity without changing buffers or rebuilding the shader', async () => {
    const home = planet('ocean-distance', -8);
    const ocean = await buildOcean(new THREE.Scene(), home.terrain, home.layers, async () => {});
    const material = ocean.material as THREE.MeshStandardNodeMaterial;
    const opacityNode = material.opacityNode, version = material.version;
    const position = ocean.geometry.getAttribute('position') as THREE.BufferAttribute, bufferVersion = position.version;
    const numericUniforms = () => {
      const values: number[] = [];
      material.opacityNode!.traverse(node => {
        const candidate = node as unknown as { isUniformNode?: boolean; value: unknown };
        if (candidate.isUniformNode && typeof candidate.value === 'number') values.push(candidate.value);
      });
      return values;
    };
    ocean.setViewDistance(500);
    expect(numericUniforms()).toContain(0.5);
    ocean.setViewDistance(800);
    expect(numericUniforms()).toContain(1);
    expect(numericUniforms()).not.toContain(0.5);
    ocean.setViewDistance(200);
    expect(numericUniforms()).toContain(0);
    expect(material.opacityNode).toBe(opacityNode);
    expect(material.version).toBe(version);
    expect(ocean.geometry.getAttribute('position')).toBe(position);
    expect(position.version).toBe(bufferVersion);
  });

  it('prepares destination samples without moving or recoloring the active ocean until commit', async () => {
    const home = planet('prepare-ocean-home', -16), away = planet('prepare-ocean-away', -4, 620);
    const ocean = await buildOcean(new THREE.Scene(), home.terrain, home.layers, async () => {});
    const positions = ocean.geometry.getAttribute('position').array;
    const before = positions.slice();
    const preparing = ocean.preparePlanet(away.terrain, away.layers);
    expect(away.sample).not.toHaveBeenCalled();
    expect(ocean.hasPreparedPlanet(away.terrain, away.layers)).toBe(false);
    await preparing;
    expect(ocean.hasPreparedPlanet(away.terrain, away.layers)).toBe(true);
    expect(positions).toEqual(before);
    const calls = away.sample.mock.calls.length;
    ocean.rebindPlanet(away.terrain, away.layers);
    expect(away.sample).toHaveBeenCalledTimes(calls);
    expect(ocean.geometry.getAttribute('position').array).toBe(positions);
    expect(positions).not.toEqual(before);
  });

  it('discards aborted destination preparation and retains current attributes', async () => {
    const home = planet('ocean-abort-home', -16), away = planet('ocean-abort-away', -4);
    const ocean = await buildOcean(new THREE.Scene(), home.terrain, home.layers, async () => {});
    const before = ocean.geometry.getAttribute('position').array.slice();
    const controller = new AbortController();
    await expect(ocean.preparePlanet(away.terrain, away.layers, {
      signal: controller.signal, onProgress: () => controller.abort(),
    })).rejects.toThrow();
    expect(ocean.hasPreparedPlanet(away.terrain, away.layers)).toBe(false);
    expect(ocean.geometry.getAttribute('position').array).toEqual(before);
  });

  it('seeds the initial cache and restores complete earlier samples into the same GPU arrays', async () => {
    const home = planet('ocean-home', -16);
    const away = planet('ocean-away', -4, 620);
    const ocean = await buildOcean(new THREE.Scene(), home.terrain, home.layers, async () => {});
    const position = ocean.geometry.getAttribute('position');
    const shore = ocean.geometry.getAttribute('shore');
    const originalPositions = position.array.slice();
    const originalShore = shore.array.slice();
    const homeCalls = home.sample.mock.calls.length;
    expect(homeCalls).toBe(position.count);

    ocean.rebindPlanet(home.terrain, home.layers);
    expect(home.sample).toHaveBeenCalledTimes(homeCalls);
    ocean.rebindPlanet(away.terrain, away.layers);
    expect(away.sample).toHaveBeenCalledTimes(position.count);
    expect(position.array).not.toEqual(originalPositions);
    expect(shore.array).not.toEqual(originalShore);
    const awayPositions = position.array.slice();
    const awayShore = shore.array.slice();

    ocean.rebindPlanet(home.terrain, home.layers);
    expect(home.sample).toHaveBeenCalledTimes(homeCalls);
    expect(ocean.geometry.getAttribute('position')).toBe(position);
    expect(ocean.geometry.getAttribute('shore')).toBe(shore);
    expect(position.array).toEqual(originalPositions);
    expect(shore.array).toEqual(originalShore);
    ocean.rebindPlanet(away.terrain, away.layers);
    expect(away.sample).toHaveBeenCalledTimes(position.count);
    expect(position.array).toEqual(awayPositions);
    expect(shore.array).toEqual(awayShore);
    ocean.geometry.dispose();
    (ocean.material as THREE.Material).dispose();
  });

  it('invalidates the terrain snapshot for a different layer grid, sea level, or radius', async () => {
    const home = planet('ocean-grid', -9);
    const ocean = await buildOcean(new THREE.Scene(), home.terrain, home.layers, async () => {});
    const n = ocean.geometry.getAttribute('position').count;
    const otherLayers = buildLayers({ ...home.config, layerH: 2 });
    ocean.rebindPlanet(home.terrain, otherLayers);
    expect(home.sample).toHaveBeenCalledTimes(n * 2);
    otherLayers.waterSurface += 2;
    ocean.rebindPlanet(home.terrain, otherLayers);
    expect(home.sample).toHaveBeenCalledTimes(n * 3);
    otherLayers.planetRadius += 1;
    ocean.rebindPlanet(home.terrain, otherLayers);
    expect(home.sample).toHaveBeenCalledTimes(n * 4);
    ocean.rebindPlanet(home.terrain, otherLayers);
    expect(home.sample).toHaveBeenCalledTimes(n * 4);
    ocean.geometry.dispose();
    (ocean.material as THREE.Material).dispose();
  });

  it('updates visibility and material uniforms even when geometry is cached or the ocean is hidden', async () => {
    const home = planet('ocean-style', -8);
    const ocean = await buildOcean(new THREE.Scene(), home.terrain, home.layers, async () => {});
    const n = home.sample.mock.calls.length;
    const config = {
      ...home.config,
      ocean: {
        ...home.config.ocean,
        hasOcean: false,
        shallowColor: [0.123, 0.234, 0.678] as [number, number, number],
        emissiveIntensity: 1.234,
      },
    };
    const uniformValues = (): unknown[] => {
      const values: unknown[] = [];
      (ocean.material as THREE.MeshStandardNodeMaterial).emissiveNode!.traverse((node) => {
        const candidate = node as unknown as { isUniformNode?: boolean; value: unknown };
        if (candidate.isUniformNode) values.push(candidate.value);
      });
      return values;
    };
    ocean.rebindPlanet(home.terrain, home.layers, config);
    expect(ocean.visible).toBe(false);
    expect(home.sample).toHaveBeenCalledTimes(n);
    expect(uniformValues()).toContain(1.234);
    expect(uniformValues().some((v) => v instanceof THREE.Vector3 && v.equals(new THREE.Vector3(...config.ocean.shallowColor)))).toBe(true);
    ocean.rebindPlanet(home.terrain, home.layers, home.config);
    expect(ocean.visible).toBe(true);
    expect(home.sample).toHaveBeenCalledTimes(n);
    expect(uniformValues()).not.toContain(1.234);
    ocean.geometry.dispose();
    (ocean.material as THREE.Material).dispose();
  });
});
