import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { pentagonTileIds } from '../src/sim/landmarks';
import { makeSurfaceBasisFromYaw } from '../src/render/surfaceFrame';

function determinant(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3): number {
  return x.dot(new THREE.Vector3().crossVectors(y, z));
}

describe('surface frame basis', () => {
  it('keeps y-up assets right-handed on curved planet tiles', () => {
    const geo = new Goldberg(8);
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    const z = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const bx = new THREE.Vector3();
    const by = new THREE.Vector3();
    const bz = new THREE.Vector3();

    for (const [i, tile] of pentagonTileIds(geo).entries()) {
      const frame = geo.frameOf(tile);
      makeSurfaceBasisFromYaw(frame, i * 0.31, matrix, x, y, z);
      bx.setFromMatrixColumn(matrix, 0);
      by.setFromMatrixColumn(matrix, 1);
      bz.setFromMatrixColumn(matrix, 2);
      const normal = new THREE.Vector3(...frame.normal);
      expect(determinant(bx, by, bz)).toBeGreaterThan(0.995);
      expect(by.dot(normal)).toBeGreaterThan(0.995);
    }
  });
});
