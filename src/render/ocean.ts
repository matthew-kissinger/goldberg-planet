/**
 * The ocean shell: one geodesic sphere at sea level with TSL swells, a depth tint,
 * a foam band that follows the stepped coastline the mesher draws, and dynamic
 * `PlanetConfig` rebinding (water, volcanic magma seas, cryo-brine, and biolagoons).
 */

import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  float,
  fwidth,
  mix,
  normalWorld,
  normalize,
  positionLocal,
  positionWorld,
  smoothstep,
  time,
  uniform,
  vec3,
} from 'three/tsl';
import { buildGeodesic } from './geodesic';
import { type Layers } from '../world/layers';
import type { Terrain } from '../world/terrain';
import type { PlanetConfig } from '../world/planetConfig';
import { checkPreparation, prepareInSlices, type PreparationOptions } from '../world/preparation';
import { planetVisualProfile } from './planetVisualProfile';

const SLICE = 24576;

interface OceanSamples {
  layers: Layers;
  planetRadius: number;
  waterSurface: number;
  positions: Float32Array;
  shore: Float32Array;
}

export interface OceanMesh extends THREE.Mesh {
  /** Camera distance from the surface; distant water conceals detailed seabed ownership. */
  setViewDistance(distance: number): void;
  rebindPlanet(terrain: Terrain, layers: Layers, config?: PlanetConfig): void;
  hasPreparedPlanet(terrain: Terrain, layers: Layers): boolean;
  preparePlanet(terrain: Terrain, layers: Layers, options?: PreparationOptions): Promise<void>;
}

/** Builds the ocean in slices, awaiting `onProgress` between them so the splash can repaint. */
export async function buildOcean(
  scene: THREE.Scene,
  terrain: Terrain,
  layers: Layers,
  onProgress: (frac: number) => Promise<void>,
): Promise<OceanMesh> {
  const sphere = buildGeodesic(7);
  const n = sphere.dirs.length / 3;
  const positions = new Float32Array(sphere.dirs.length);
  const shore = new Float32Array(n);
  const waterSurface = layers.waterSurface;
  const planetRadius = layers.planetRadius;

  for (let start = 0; start < n; start += SLICE) {
    const end = Math.min(n, start + SLICE);
    for (let i = start; i < end; i++) {
      const x = sphere.dirs[i * 3], y = sphere.dirs[i * 3 + 1], z = sphere.dirs[i * 3 + 2];
      positions[i * 3] = x * waterSurface;
      positions[i * 3 + 1] = y * waterSurface;
      positions[i * 3 + 2] = z * waterSurface;
      const h = terrain.heightAt(x, y, z);
      const stepTop = layers.topRadius(layers.layerOfRadius(planetRadius + h));
      const depth = waterSurface - stepTop;
      shore[i] = Math.max(0, Math.min(1, 1 - depth / 22));
    }
    await onProgress(end / n);
  }

  // Keep one immutable sample snapshot per terrain, replacing it if the layer grid
  // changes. The live GPU attribute arrays are reused on every planet handoff.
  const samples = new WeakMap<Terrain, OceanSamples>();
  samples.set(terrain, {
    layers, planetRadius, waterSurface,
    positions: positions.slice(), shore: shore.slice(),
  });
  const geom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const shoreBufferAttr = new THREE.BufferAttribute(shore, 1);
  geom.setAttribute('position', posAttr);
  geom.setAttribute('normal', new THREE.BufferAttribute(sphere.dirs, 3));
  geom.setAttribute('shore', shoreBufferAttr);
  geom.setIndex(new THREE.BufferAttribute(sphere.index, 1));
  geom.computeBoundingSphere();

  const uDeep = uniform(new THREE.Vector3(0.03, 0.16, 0.34));
  const uShallow = uniform(new THREE.Vector3(0.14, 0.62, 0.68));
  const uFoam = uniform(new THREE.Vector3(0.92, 0.96, 0.98));
  const uEmissive = uniform(0.0);
  const uDistanceOpacity = uniform(0.0);
  const uAmplitude = uniform(1), uSpeed = uniform(1), uRoughness = uniform(.09);
  const uFoamStrength = uniform(.5), uOpacity = uniform(.82);
  const uCrust = uniform(0), uShorelineGlow = uniform(0);
  const surfaceDetail = float(1).sub(uDistanceOpacity);

  const mat = new THREE.MeshStandardNodeMaterial();
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const fresnel = float(1.0).sub(normalWorld.dot(viewDir).abs()).max(0.0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Interpolation can undershoot zero by a few ulps along the depth-band edge.
  // Fractional pow(negative, 1.7) is NaN, even in a mix branch with zero weight.
  const shoreAttr = float(attribute('shore', 'float') as any).clamp(0, 1);

  const p = positionLocal;
  const clock = time.mul(uSpeed);
  const swell = p.dot(vec3(0.131, 0.112, 0.123)).add(clock.mul(0.6)).sin()
    .add(p.dot(vec3(-0.104, 0.141, -0.092)).add(clock.mul(0.97)).sin())
    .mul(0.08);
  const chop = p.dot(vec3(0.55, 0.48, 0.51)).add(clock.mul(1.5)).sin().mul(0.035);
  const wave = swell.add(chop).mul(uAmplitude);
  mat.positionNode = p.add(p.normalize().mul(wave).mul(surfaceDetail));

  const r1 = p.dot(vec3(1.31, 1.13, 1.27)).add(clock.mul(2.1)).sin();
  const r2 = p.dot(vec3(-1.17, 1.29, -1.07)).add(clock.mul(1.55)).sin();
  const ripple = r1.mul(r2).abs();

  const foam = smoothstep(float(0.86), float(0.99), shoreAttr.add(wave.mul(0.25).mul(surfaceDetail)));
  const surfCol = mix(uDeep, uShallow, shoreAttr.pow(1.7)).add(uFoam.mul(foam).mul(uFoamStrength));
  // Molten seams follow the broad swell field, not metre-sized water ripples.
  // Filter in screen space and converge by each fragment's distance, including
  // far water visible from a ground camera; camera zoom alone misses that case.
  const lavaField = swell.mul(6.25).abs();
  const lavaPixel = fwidth(lavaField);
  const seamWidth = lavaPixel.mul(1.5).clamp(.005, .3);
  const filteredSeams = float(1).sub(smoothstep(float(.06).sub(seamWidth), float(.18).add(seamWidth), lavaField));
  const seamDetail = float(1).sub(smoothstep(55, 190, positionWorld.length()))
    .mul(float(1).sub(smoothstep(.08, .22, lavaPixel)));
  const hotSeams = mix(float(.12), filteredSeams, seamDetail);
  const moltenColor = mix(vec3(.085, .065, .06), mix(uDeep, uShallow, hotSeams), hotSeams);
  mat.colorNode = mix(surfCol, moltenColor, uCrust);
  const glow = mix(float(1), shoreAttr.pow(3).mul(.7).add(.08), uShorelineGlow);
  mat.emissiveNode = mix(surfCol.mul(glow), mix(uDeep, uShallow, hotSeams).mul(hotSeams), uCrust).mul(uEmissive);
  const waterOpacity = uOpacity.add(fresnel.pow(2.0).mul(0.14)).sub(shoreAttr.pow(2.0).mul(0.28)).add(foam.mul(0.3)).min(0.96);
  const surfaceOpacity = mix(waterOpacity, float(1), uCrust);
  mat.opacityNode = mix(surfaceOpacity, float(1), uDistanceOpacity);
  // Subpixel ripples converge to their middle roughness rather than sparkling in orbit.
  mat.roughnessNode = uRoughness.add(mix(ripple.mul(0.16), float(0.08), uDistanceOpacity)).add(foam.mul(uFoamStrength).mul(0.8)).clamp(.06, .98);
  mat.metalnessNode = float(0.02);
  mat.transparent = true;
  mat.depthWrite = false;
  const mesh = new THREE.Mesh(geom, mat) as unknown as OceanMesh;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.setViewDistance = distance => {
    if (!Number.isFinite(distance)) return;
    const t = Math.max(0, Math.min(1, (distance - 200) / 600));
    uDistanceOpacity.value = t * t * (3 - 2 * t);
  };

  mesh.hasPreparedPlanet = (nextTerrain, nextLayers) => {
    if (!nextTerrain.config.ocean.hasOcean) return true;
    const cached = samples.get(nextTerrain);
    return cached?.layers === nextLayers && cached.planetRadius === nextLayers.planetRadius &&
      cached.waterSurface === nextLayers.waterSurface;
  };

  mesh.preparePlanet = async (nextTerrain, nextLayers, options = {}) => {
    checkPreparation(options);
    if (mesh.hasPreparedPlanet(nextTerrain, nextLayers)) { options.onProgress?.(1); return; }
    const pr = nextLayers.planetRadius, ws = nextLayers.waterSurface;
    const nextPositions = new Float32Array(positions.length);
    const nextShore = new Float32Array(shore.length);
    await prepareInSlices(n, i => {
      const x = sphere.dirs[i * 3], y = sphere.dirs[i * 3 + 1], z = sphere.dirs[i * 3 + 2];
      nextPositions[i * 3] = x * ws;
      nextPositions[i * 3 + 1] = y * ws;
      nextPositions[i * 3 + 2] = z * ws;
      const h = nextTerrain.heightAt(x, y, z);
      const stepTop = nextLayers.topRadius(nextLayers.layerOfRadius(pr + h));
      nextShore[i] = Math.max(0, Math.min(1, 1 - (ws - stepTop) / 22));
    }, options);
    checkPreparation(options);
    samples.set(nextTerrain, { layers: nextLayers, planetRadius: pr, waterSurface: ws, positions: nextPositions, shore: nextShore });
  };

  mesh.rebindPlanet = (nextTerrain: Terrain, nextLayers: Layers, config?: PlanetConfig): void => {
    const cfg = config ?? nextTerrain.config;
    mesh.visible = cfg.ocean.hasOcean;
    uDeep.value.set(cfg.ocean.deepColor[0], cfg.ocean.deepColor[1], cfg.ocean.deepColor[2]);
    uShallow.value.set(cfg.ocean.shallowColor[0], cfg.ocean.shallowColor[1], cfg.ocean.shallowColor[2]);
    uFoam.value.set(cfg.ocean.foamColor[0], cfg.ocean.foamColor[1], cfg.ocean.foamColor[2]);
    uEmissive.value = cfg.ocean.emissiveIntensity;
    const profile = planetVisualProfile(cfg).ocean;
    uAmplitude.value = profile.amplitude; uSpeed.value = profile.speed; uRoughness.value = profile.roughness;
    uFoamStrength.value = profile.foam; uOpacity.value = profile.opacity;
    uCrust.value = profile.crust; uShorelineGlow.value = profile.shorelineGlow;
    if (!mesh.visible) return;

    const ws = nextLayers.waterSurface;
    const pr = nextLayers.planetRadius;
    const posArr = posAttr.array as Float32Array;
    const shoreArr = shoreBufferAttr.array as Float32Array;
    const cached = samples.get(nextTerrain);
    if (cached?.layers === nextLayers && cached.planetRadius === pr && cached.waterSurface === ws) {
      posArr.set(cached.positions);
      shoreArr.set(cached.shore);
    } else {
      // First visit still samples synchronously; subsequent visits reuse the snapshot.
      for (let i = 0; i < n; i++) {
        const x = sphere.dirs[i * 3], y = sphere.dirs[i * 3 + 1], z = sphere.dirs[i * 3 + 2];
        posArr[i * 3] = x * ws;
        posArr[i * 3 + 1] = y * ws;
        posArr[i * 3 + 2] = z * ws;
        const h = nextTerrain.heightAt(x, y, z);
        const stepTop = nextLayers.topRadius(nextLayers.layerOfRadius(pr + h));
        const depth = ws - stepTop;
        shoreArr[i] = Math.max(0, Math.min(1, 1 - depth / 22));
      }
      samples.set(nextTerrain, {
        layers: nextLayers, planetRadius: pr, waterSurface: ws,
        positions: posArr.slice(), shore: shoreArr.slice(),
      });
    }
    posAttr.needsUpdate = true;
    shoreBufferAttr.needsUpdate = true;
    // All ocean vertices lie at this radius, with less than 0.2 m shader displacement.
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), ws + 1);
  };

  mesh.rebindPlanet(terrain, layers);
  scene.add(mesh);
  return mesh;
}
