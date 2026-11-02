import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';
import { ColumnGroundProbe, type GroundContact } from '../src/world/groundContact';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';

describe('radial contact queries', () => {
  it('uses the floor below the foot instead of a higher overhang, and respects missing support', () => {
    const geo = new Goldberg(4), config = buildSolarSystemConfigs('contact-query')[0];
    const layers = buildLayers(config), columns = new Columns(geo, layers, new Terrain(config));
    const tile = 0, dir = new Vector3(...geo.centers.slice(0, 3));
    const top = columns.topLayerOf(tile);
    // Explicit exposed floor with a suspended cell several metres above it.
    for (let k = top - 12; k < top; k++) columns.mine(tile, k);
    columns.place(tile, top - 10);
    const r = layers.topRadius(top);
    const probe = new ColumnGroundProbe(geo, columns);
    const out: GroundContact = { point: new Vector3(), normal: new Vector3(), tile: -1 };
    // Probe around a surface above the liquid, independent of the natural seed.
    config.ocean.hasOcean = false;
    expect(probe.probe(dir.clone().multiplyScalar(r + 0.08), 0.3, 0.6, out)).toBe(true);
    expect(out.point.length()).toBeCloseTo(r, 6);
    expect(out.normal.distanceTo(dir)).toBeLessThan(1e-6);
    expect(probe.probe(dir.clone().multiplyScalar(r + 3), 0.3, 0.6, out)).toBe(false);
    const firstWorld = probe.worldId;
    const other = new Columns(geo, layers, new Terrain(config)); probe.rebind(other);
    expect(probe.worldId).not.toBe(firstWorld);
  });
});
