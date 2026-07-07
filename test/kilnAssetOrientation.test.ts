import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { makeInstancedAssetParts } from '../src/render/kilnAssets';

function sidewaysAsset(): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x79a85b }),
  );
  mesh.name = 'sideways-stem';
  root.add(mesh);
  return root;
}

describe('Kiln instanced asset orientation normalization', () => {
  it('can rotate the dominant source axis into local Y before pivoting and instancing', () => {
    const normalized = makeInstancedAssetParts(sidewaysAsset(), 'test-sideways-tree', 'longest-axis-to-y');

    expect(normalized.orientation).toMatchObject({
      policy: 'longest-axis-to-y',
      sourceUpAxis: 'x',
      axisCorrection: [0, 0, 1.570796],
    });
    expect(normalized.runtimeSourceBboxSize).toEqual([4, 1, 1]);
    expect(normalized.orientedSourceBboxSize).toEqual([1, 4, 1]);
    expect(normalized.normalizedBboxSize).toEqual([1, 4, 1]);
    expect(normalized.parts).toHaveLength(1);
    const box = normalized.parts[0].geometry.boundingBox;
    expect(box?.min.y).toBeCloseTo(0, 5);
    expect(box?.max.y).toBeCloseTo(4, 5);
  });

  it('preserves authored Y-up assets for squat props and drops', () => {
    const normalized = makeInstancedAssetParts(sidewaysAsset(), 'test-sideways-prop', 'preserve-y-up');

    expect(normalized.orientation).toMatchObject({
      policy: 'preserve-y-up',
      sourceUpAxis: 'y',
      axisCorrection: [0, 0, 0],
    });
    expect(normalized.runtimeSourceBboxSize).toEqual([4, 1, 1]);
    expect(normalized.orientedSourceBboxSize).toEqual([4, 1, 1]);
    expect(normalized.normalizedBboxSize).toEqual([4, 1, 1]);
  });
});
