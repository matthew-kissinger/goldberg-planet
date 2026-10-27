import * as THREE from 'three/webgpu';

/** A fixed, seeded starfield on a far shell around the planet. */
export function addStars(scene: THREE.Scene, count = 2600, radius = 11000): void {
  const pos = new Float32Array(count * 3);
  let sr = 1;
  const rand = (): number => {
    sr = (sr * 1103515245 + 12345) & 0x7fffffff;
    return sr / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    const z = rand() * 2 - 1;
    const ph = rand() * Math.PI * 2;
    const rr = Math.sqrt(Math.max(0, 1 - z * z));
    pos[i * 3] = rr * Math.cos(ph) * radius;
    pos[i * 3 + 1] = rr * Math.sin(ph) * radius;
    pos[i * 3 + 2] = z * radius;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfcbe0, size: 1.6, sizeAttenuation: false }));
  stars.frustumCulled = false;
  scene.add(stars);
}
