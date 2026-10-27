/**
 * The ocean shell: one geodesic sphere at sea level with TSL swells, a depth tint and a
 * foam band that follows the stepped coastline the mesher draws.
 */

import * as THREE from 'three/webgpu';
import { color, float, positionWorld, positionLocal, cameraPosition, normalWorld, normalize, attribute, vec3, time, mix, smoothstep } from 'three/tsl';
import { buildGeodesic } from './geodesic';
import { PLANET_RADIUS, WATER_SURFACE, type Layers } from '../world/layers';
import type { Terrain } from '../world/terrain';

const SLICE = 24576;

/** Builds the ocean in slices, awaiting `onProgress` between them so the splash can repaint. */
export async function buildOcean(
  scene: THREE.Scene,
  terrain: Terrain,
  layers: Layers,
  onProgress: (frac: number) => Promise<void>,
): Promise<THREE.Mesh> {
  // geodesic order 7: ~7.8 m triangle edges, close to tile scale, so the depth tint and
  // foam band resolve individual coastline hexes instead of smearing across 16 m tris
  const sphere = buildGeodesic(7);
  const n = sphere.dirs.length / 3;
  const positions = new Float32Array(sphere.dirs.length);
  const shore = new Float32Array(n);
  for (let start = 0; start < n; start += SLICE) {
    const end = Math.min(n, start + SLICE);
    for (let i = start; i < end; i++) {
      const x = sphere.dirs[i * 3], y = sphere.dirs[i * 3 + 1], z = sphere.dirs[i * 3 + 2];
      positions[i * 3] = x * WATER_SURFACE;
      positions[i * 3 + 1] = y * WATER_SURFACE;
      positions[i * 3 + 2] = z * WATER_SURFACE;
      // sample the SAME stepped surface the mesher draws — quantized to the layer grid —
      // so the waterline reads exactly against the rendered hex terraces
      const h = terrain.heightAt(x, y, z);
      const stepTop = layers.topRadius(layers.layerOfRadius(PLANET_RADIUS + h));
      const depth = WATER_SURFACE - stepTop; // >0 means submerged terrain here
      shore[i] = Math.max(0, Math.min(1, 1 - depth / 22));
    }
    await onProgress(end / n);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(sphere.dirs, 3));
  geom.setAttribute('shore', new THREE.BufferAttribute(shore, 1));
  geom.setIndex(new THREE.BufferAttribute(sphere.index, 1));
  geom.computeBoundingSphere();

  const mat = new THREE.MeshStandardNodeMaterial();
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const fresnel = float(1.0).sub(normalWorld.dot(viewDir).abs()).max(0.0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shoreAttr = float(attribute('shore', 'float') as any);

  // slow crossing swells (~40 m) plus a short chop (~7 m): ±19 cm of radial breathing
  const p = positionLocal;
  const swell = p.dot(vec3(0.131, 0.112, 0.123)).add(time.mul(0.6)).sin()
    .add(p.dot(vec3(-0.104, 0.141, -0.092)).add(time.mul(0.97)).sin())
    .mul(0.08);
  const chop = p.dot(vec3(0.55, 0.48, 0.51)).add(time.mul(1.5)).sin().mul(0.035);
  const wave = swell.add(chop);
  mat.positionNode = p.add(p.normalize().mul(wave));

  // fine moving ripple, used to break up the specular highlight (zen sparkle)
  const r1 = p.dot(vec3(1.31, 1.13, 1.27)).add(time.mul(2.1)).sin();
  const r2 = p.dot(vec3(-1.17, 1.29, -1.07)).add(time.mul(1.55)).sin();
  const ripple = r1.mul(r2).abs();

  const deep = color(0x0a2e52);
  const shallow = color(0x1d7a96);
  const foam = smoothstep(float(0.86), float(0.99), shoreAttr.add(wave.mul(0.25)));
  mat.colorNode = mix(deep, shallow, shoreAttr.pow(1.7)).add(color(0xcfe8ee).mul(foam).mul(0.5));
  mat.opacityNode = float(0.82).add(fresnel.pow(2.0).mul(0.14)).sub(shoreAttr.pow(2.0).mul(0.28)).add(foam.mul(0.3)).min(0.96);
  mat.roughnessNode = float(0.09).add(ripple.mul(0.16)).add(foam.mul(0.4));
  mat.metalnessNode = float(0.02);
  mat.transparent = true;
  mat.depthWrite = false;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  scene.add(mesh);
  return mesh;
}
