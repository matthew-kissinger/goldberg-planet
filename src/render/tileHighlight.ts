import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';

/**
 * Hex outline around the targeted tile. A Line with an explicit closing vertex, because
 * LineLoop is unsupported on WebGPURenderer.
 */
export class TileHighlight {
  private readonly geom = new THREE.BufferGeometry();
  private readonly pos = new THREE.BufferAttribute(new Float32Array(8 * 3), 3);
  private readonly line: THREE.Line;
  private readonly corner = new Float64Array(3);

  constructor(scene: THREE.Scene) {
    this.geom.setAttribute('position', this.pos);
    this.line = new THREE.Line(
      this.geom,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: true }),
    );
    this.line.visible = false;
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  /** outline `tile` at world radius `r`, camera-relative */
  show(geo: Goldberg, tile: number, r: number, camWorld: { x: number; y: number; z: number }): void {
    const deg = geo.degreeOf(tile);
    for (let k = 0; k < deg; k++) {
      geo.cornerUnit(tile, k, this.corner);
      this.pos.setXYZ(k, this.corner[0] * r - camWorld.x, this.corner[1] * r - camWorld.y, this.corner[2] * r - camWorld.z);
    }
    this.pos.setXYZ(deg, this.pos.getX(0), this.pos.getY(0), this.pos.getZ(0));
    this.pos.needsUpdate = true;
    this.geom.setDrawRange(0, deg + 1);
    this.line.visible = true;
  }

  hide(): void {
    this.line.visible = false;
  }
}
