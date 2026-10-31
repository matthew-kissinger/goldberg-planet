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

const SLICE = 24576;

export interface OceanMesh extends THREE.Mesh {
  rebindPlanet(terrain: Terrain, layers: Layers, config?: PlanetConfig): void;
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

  const mat = new THREE.MeshStandardNodeMaterial();
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const fresnel = float(1.0).sub(normalWorld.dot(viewDir).abs()).max(0.0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shoreAttr = float(attribute('shore', 'float') as any);

  const p = positionLocal;
  const swell = p.dot(vec3(0.131, 0.112, 0.123)).add(time.mul(0.6)).sin()
    .add(p.dot(vec3(-0.104, 0.141, -0.092)).add(time.mul(0.97)).sin())
    .mul(0.08);
  const chop = p.dot(vec3(0.55, 0.48, 0.51)).add(time.mul(1.5)).sin().mul(0.035);
  const wave = swell.add(chop);
  mat.positionNode = p.add(p.normalize().mul(wave));

  const r1 = p.dot(vec3(1.31, 1.13, 1.27)).add(time.mul(2.1)).sin();
  const r2 = p.dot(vec3(-1.17, 1.29, -1.07)).add(time.mul(1.55)).sin();
  const ripple = r1.mul(r2).abs();

  const foam = smoothstep(float(0.86), float(0.99), shoreAttr.add(wave.mul(0.25)));
  const surfCol = mix(uDeep, uShallow, shoreAttr.pow(1.7)).add(uFoam.mul(foam).mul(0.5));
  mat.colorNode = surfCol;
  mat.emissiveNode = surfCol.mul(uEmissive);
  mat.opacityNode = float(0.82).add(fresnel.pow(2.0).mul(0.14)).sub(shoreAttr.pow(2.0).mul(0.28)).add(foam.mul(0.3)).min(0.96);
  mat.roughnessNode = float(0.09).add(ripple.mul(0.16)).add(foam.mul(0.4));
  mat.metalnessNode = float(0.02);
  mat.transparent = true;
  mat.depthWrite = false;
  const mesh = new THREE.Mesh(geom, mat) as unknown as OceanMesh;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;

  mesh.rebindPlanet = (nextTerrain: Terrain, nextLayers: Layers, config?: PlanetConfig): void => {
    const cfg = config ?? nextTerrain.config;
    if (!cfg.ocean.hasOcean) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    uDeep.value.set(cfg.ocean.deepColor[0], cfg.ocean.deepColor[1], cfg.ocean.deepColor[2]);
    uShallow.value.set(cfg.ocean.shallowColor[0], cfg.ocean.shallowColor[1], cfg.ocean.shallowColor[2]);
    uFoam.value.set(cfg.ocean.foamColor[0], cfg.ocean.foamColor[1], cfg.ocean.foamColor[2]);
    uEmissive.value = cfg.ocean.emissiveIntensity;

    const ws = nextLayers.waterSurface;
    const pr = nextLayers.planetRadius;
    const posArr = posAttr.array as Float32Array;
    const shoreArr = shoreBufferAttr.array as Float32Array;
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
    posAttr.needsUpdate = true;
    shoreBufferAttr.needsUpdate = true;
    geom.computeBoundingSphere();
  };

  scene.add(mesh);
  return mesh;
}
