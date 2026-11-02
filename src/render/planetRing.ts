import * as THREE from 'three/webgpu';
import { float, mix, positionGeometry, smoothstep, uniform, vec3 } from 'three/tsl';
import type { PlanetRingConfig } from '../world/planetConfig';

/** Shared active/distant ring recipe: one soft annulus, 4,608 triangles.
 * Fine radial bands replace the previous solid opaque-looking flat disc. */
export function createPlanetRing(): { mesh: THREE.Mesh; apply(config: PlanetRingConfig | null): void } {
  const inner = uniform(1080), outer = uniform(1680), opacity = uniform(.2);
  const colorA = uniform(new THREE.Vector3()), colorB = uniform(new THREE.Vector3());
  const p = positionGeometry;
  const radius = p.xy.length();
  const f = radius.sub(1).clamp(0, 1);
  const band = f.mul(145).sin().mul(.12).add(.68).add(f.mul(39).sin().mul(.12));
  const edge = smoothstep(0, .065, f).mul(float(1).sub(smoothstep(.90, 1, f)));
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  material.positionNode = vec3(p.xy.div(radius).mul(mix(inner, outer, f)), 0);
  material.colorNode = mix(colorA, colorB, smoothstep(.15, .9, f));
  material.opacityNode = edge.mul(band).mul(opacity);
  const mesh = new THREE.Mesh(new THREE.RingGeometry(1, 2, 96, 24), material);
  mesh.name = 'planetRingBand';
  mesh.frustumCulled = false;
  // Draw behind atmospheric compositing, which attenuates the orbital belt.
  mesh.renderOrder = 1;
  mesh.visible = false;
  const forward = new THREE.Vector3(0, 0, 1), target = new THREE.Vector3();
  return { mesh, apply(config) {
    mesh.visible = !!config;
    if (!config) return;
    inner.value = config.innerRadius; outer.value = config.outerRadius;
    opacity.value = config.opacity * .36;
    colorA.value.set(...config.colorInner); colorB.value.set(...config.colorOuter);
    mesh.quaternion.setFromUnitVectors(forward, target.set(...config.normal).normalize());
  } };
}
