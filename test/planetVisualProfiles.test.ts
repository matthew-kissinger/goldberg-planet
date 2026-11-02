import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';
import { MAT } from '../src/world/terrain';
import { materialColor } from '../src/render/palette';
import { planetVisualProfile } from '../src/render/planetVisualProfile';
import { ExpeditionLighting } from '../src/render/expeditionLighting';
import { Sky } from '../src/render/sky';
import { GpuPlanetEffects, RING_INSTANCE_COUNT, WEATHER_INSTANCE_COUNT } from '../src/render/gpuComputeParticles';
import { createPlanetRing } from '../src/render/planetRing';

const worlds = buildSolarSystemConfigs('visual-profile-regression');
const home = worlds.find(c => c.archetype === 'terran')!;
const moon = worlds.find(c => c.archetype === 'shattered')!;
const cryo = worlds.find(c => c.archetype === 'cryo')!;

describe('expedition world render profiles', () => {
  it('retains meaningful dust optical depth above mesas and uses extinction compositing', () => {
    const cfg = worlds.find(c => c.archetype === 'canyon')!;
    const sky = new Sky(new THREE.Scene(), new THREE.Vector3(0, 1, 0), 'low', true);
    sky.applyPlanetConfig(cfg);
    const p = planetVisualProfile(cfg).sky;
    // Analytic vertical integral through the same exponential medium, from a
    // 60m mesa to the top of the shell. The old fixed coefficient yielded <1%.
    const opticalDepth = sky.kGlow.value * p.scaleHeight * (Math.exp(-60 / p.scaleHeight) - Math.exp(-cfg.atmosphere.thickness / p.scaleHeight));
    const opacity = 1 - Math.exp(-opticalDepth);
    expect(opacity).toBeGreaterThan(.25);
    expect(opacity).toBeLessThan(.65);
    const material = sky.atmo.material as THREE.MeshBasicNodeMaterial;
    expect(material.blending).toBe(THREE.NormalBlending);
    expect(material.opacityNode).not.toBeNull();
    const before = sky.kGlow.value;
    sky.applyPlanetConfig({ ...cfg, waterSurfaceOffset: -90 });
    expect(sky.kGlow.value).toBe(before);
    sky.applyPlanetConfig(home);
    expect(sky.kGlow.value).toBeCloseTo(.0035 * home.atmosphere.density);
  });

  it('uses the same bounded soft ring recipe for any plane and preserves its layout on rebinding', () => {
    const ring = createPlanetRing();
    const material = ring.mesh.material as THREE.MeshBasicNodeMaterial;
    const graph = [material.positionNode, material.colorNode, material.opacityNode];
    for (const cfg of worlds.filter(c => c.rings)) {
      ring.apply(cfg.rings);
      expect(ring.mesh.visible).toBe(true);
      expect(new THREE.Vector3(0, 0, 1).applyQuaternion(ring.mesh.quaternion).distanceTo(new THREE.Vector3(...cfg.rings!.normal).normalize())).toBeLessThan(1e-7);
      expect(ring.mesh.geometry.index!.count / 3).toBe(4608);
      expect([material.positionNode, material.colorNode, material.opacityNode]).toEqual(graph);
      expect(material.depthWrite).toBe(false);
    }
    ring.apply(null); expect(ring.mesh.visible).toBe(false);
    ring.mesh.geometry.dispose(); material.dispose();
  });
  it('keeps tile colors deterministic and gives the same rock distinct authored identities', () => {
    const colors = new Map<string, string>();
    for (const cfg of worlds) {
      const a: number[] = [], b: number[] = [];
      materialColor(MAT.ROCK, 81, false, a, 0, cfg.archetype);
      materialColor(MAT.ROCK, 81, false, b, 0, cfg.archetype);
      expect(a).toEqual(b);
      expect(a.every(v => Number.isFinite(v) && v > 0 && v < 1)).toBe(true);
      colors.set(cfg.archetype, a.join(','));
    }
    expect(new Set(colors.values()).size).toBe(6);
    const defaultColor: number[] = [], explicitHome: number[] = [];
    materialColor(MAT.GRASS, 312, true, defaultColor);
    materialColor(MAT.GRASS, 312, true, explicitHome, 0, 'terran');
    expect(defaultColor).toEqual(explicitHome);
    const basalt: number[] = [];
    materialColor(MAT.BASALT, 81, false, basalt, 0, 'volcanic');
    expect(.2126 * basalt[0] + .7152 * basalt[1] + .0722 * basalt[2]).toBeGreaterThan(.08);
  });

  it('changes directional/fill response without adding lights, shadows, or scene objects', () => {
    const scene = new THREE.Scene();
    const renderer = { shadowMap: {} } as unknown as THREE.WebGPURenderer;
    const light = new ExpeditionLighting(scene, renderer, new THREE.Vector3(0, 1, 0), false);
    const initial = [...scene.children];
    for (const cfg of worlds) {
      light.setPlanet(cfg);
      light.update({ px: cfg.radius, py: 0, pz: 0 }, { x: 0, y: 0, z: 0 }, 2, 5);
      const p = planetVisualProfile(cfg).lighting;
      expect(light.sun.intensity).toBe(p.sunStrength);
      expect(light.sun.shadow.intensity).toBe(p.shadow);
      expect(renderer.toneMappingExposure).toBe(p.exposure);
      expect(scene.children).toEqual(initial);
      expect(scene.children.filter(o => o instanceof THREE.Light)).toHaveLength(3);
      expect(scene.children.filter(o => o instanceof THREE.Light && o.castShadow)).toHaveLength(1);
      const fill = scene.children.find(o => o instanceof THREE.HemisphereLight)!;
      expect(fill.position.toArray()).toEqual([1, 0, 0]);
    }
    light.setPlanet(home);
    expect(light.sun.intensity).toBe(2.6);
    expect(renderer.toneMappingExposure).toBe(1.12);
  });

  it('renders no atmospheric shells in vacuum and retains stars even on the day hemisphere', () => {
    const sky = new Sky(new THREE.Scene(), new THREE.Vector3(0, 1, 0), 'low', true);
    const atmoMaterial = sky.atmo.material, cloudsMaterial = sky.clouds!.material;
    const camera = new THREE.PerspectiveCamera();
    sky.applyPlanetConfig(home);
    sky.update(0, home.radius + 5, 0, camera);
    expect(sky.atmo.visible).toBe(true);
    expect(sky.stars.visible).toBe(false);
    // Even a malformed cloud setting must not synthesize an airless moon's clouds.
    sky.applyPlanetConfig({ ...moon, atmosphere: { ...moon.atmosphere, density: 0, cloudCoverage: 1 } });
    sky.update(0, moon.radius + 5, 0, camera);
    expect(sky.atmo.visible).toBe(false);
    expect(sky.clouds!.visible).toBe(false);
    expect(sky.stars.visible).toBe(true);
    expect((sky.stars.material as THREE.PointsMaterial).opacity).toBe(.72);
    for (const cfg of worlds) sky.applyPlanetConfig(cfg);
    expect(sky.atmo.material).toBe(atmoMaterial);
    expect(sky.clouds!.material).toBe(cloudsMaterial);
    expect(sky.stars.geometry.getAttribute('position').count).toBe(1400);
  });

  it('keeps weather radial at all poles and invariant under a floating-origin change', () => {
    const effects = new GpuPlanetEffects(new THREE.Scene());
    const compute = vi.fn();
    const renderer = { compute } as unknown as THREE.WebGPURenderer;
    effects.applyPlanetConfig(cryo);
    expect(effects.ringMesh.count).toBe(RING_INSTANCE_COUNT);
    expect(effects.weatherMesh.count).toBe(WEATHER_INSTANCE_COUNT);
    for (const unit of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0)]) {
      const player = unit.clone().multiplyScalar(cryo.radius + 10);
      effects.update(renderer, 20, 30, 40, player.x, player.y, player.z);
      const radial = new THREE.Vector3(0, 1, 0).applyQuaternion(effects.weatherMesh.quaternion);
      expect(radial.distanceTo(unit)).toBeLessThan(1e-7);
      const originalRotation = effects.weatherMesh.quaternion.clone();
      const localPoint = new THREE.Vector3(3, -2, 5).applyQuaternion(originalRotation).add(effects.weatherMesh.position).add(new THREE.Vector3(20, 30, 40));
      effects.update(renderer, -10, 100, -300, player.x, player.y, player.z);
      const shiftedPoint = new THREE.Vector3(3, -2, 5).applyQuaternion(effects.weatherMesh.quaternion).add(effects.weatherMesh.position).add(new THREE.Vector3(-10, 100, -300));
      expect(shiftedPoint.distanceTo(localPoint)).toBeLessThan(1e-7);
    }
    expect(compute).toHaveBeenCalled();
    effects.update(renderer, 0, 0, 0, 0, cryo.radius + cryo.atmosphere.thickness + 100, 0);
    expect(effects.weatherMesh.visible).toBe(false);
    effects.applyPlanetConfig({ ...moon, rings: null, atmosphere: { ...moon.atmosphere, density: 0, weatherKind: 'dust' } });
    compute.mockClear();
    effects.update(renderer, 0, 0, 0, 0, moon.radius + 10, 0);
    expect(effects.weatherMesh.visible).toBe(false);
    expect(compute).not.toHaveBeenCalled();
  });

  it('warms both bounded compute/render layouts and restores hidden state', async () => {
    const effects = new GpuPlanetEffects(new THREE.Scene());
    const compileComputeAsync = vi.fn(async () => {}), compute = vi.fn();
    await effects.precompile({ compileComputeAsync, compute } as unknown as THREE.WebGPURenderer);
    expect(compileComputeAsync).toHaveBeenCalledTimes(2);
    expect(compute).toHaveBeenCalledTimes(2);
    const restore = effects.prepareWarmup();
    expect(effects.ringMesh.visible && effects.weatherMesh.visible).toBe(true);
    expect(effects.ringBand.mesh.visible).toBe(true);
    restore();
    expect(effects.ringMesh.visible || effects.weatherMesh.visible).toBe(false);
    expect(effects.ringBand.mesh.visible).toBe(false);
  });
});
