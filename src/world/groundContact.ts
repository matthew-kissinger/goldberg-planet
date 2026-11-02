import { Vector3 } from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from './columns';

/** Persistent planet coordinates, independent of the render camera's floating origin. */
export interface GroundContact {
  point: Vector3;
  normal: Vector3;
  tile: number;
}

export interface GroundProbe {
  readonly worldId: object;
  probe(point: Vector3, maxRise: number, maxDrop: number, out: GroundContact): boolean;
}

/** Samples the same edited column collision model as Player, including cave floors. */
export class ColumnGroundProbe implements GroundProbe {
  constructor(private readonly geo: Goldberg, private columns: Columns) {}

  get worldId(): object { return this.columns; }
  rebind(columns: Columns): void { this.columns = columns; }

  probe(point: Vector3, maxRise: number, maxDrop: number, out: GroundContact): boolean {
    const r = point.length();
    if (r < 1 || !Number.isFinite(r)) return false;
    const tile = this.geo.tileOf(point.x, point.y, point.z);
    const layers = this.columns.layers;
    const start = Math.min(layers.bounds[0] - 0.001, r + maxRise);
    const layer = this.columns.groundLayerBelow(tile, start);
    const radius = layers.topRadius(layer);
    if (radius > r + maxRise + 0.002 || radius < r - maxDrop) return false;
    // Liquid is not a grounded surface for the biped's contact solver.
    if (this.columns.terrain.config.ocean.hasOcean && radius < layers.waterSurface - 0.04) return false;
    out.normal.copy(point).multiplyScalar(1 / r);
    out.point.copy(out.normal).multiplyScalar(radius);
    out.tile = tile;
    return true;
  }
}
