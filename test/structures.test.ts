import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { buildSolarSystemConfigs, type PlanetConfig } from '../src/world/planetConfig';
import {
  STRUCTURE_KINDS,
  StructureStore,
  structureWorldPosition,
} from '../src/sim/persistence';
import { StructureRenderer } from '../src/render/structures';
import { MAT } from '../src/world/terrain';

describe('Out-of-Core Structure Persistence & Planetary Automation Network', () => {
  const geo = new Goldberg(8);
  const configs = buildSolarSystemConfigs('automation-test');
  const configMap = new Map<string, PlanetConfig>(configs.map((c) => [c.id, c]));

  it('persists structures in spherical coordinates independent of hex chunk residency and links conduits within 42m', () => {
    const store = new StructureStore();
    const p0 = configs[0];

    const relay = store.place({
      planetId: p0.id,
      kind: 'solar_relay',
      anchorTile: 0, // Pentagon Wonder
      offsetEast: 0,
      offsetNorth: 0,
      groundRadius: 905,
    });
    const extractor = store.place({
      planetId: p0.id,
      kind: 'extractor',
      anchorTile: 0,
      offsetEast: 12,
      offsetNorth: 5,
      groundRadius: 905,
    });

    const relayPos = structureWorldPosition(geo, relay).pos;
    expect(Math.hypot(...relayPos)).toBeCloseTo(905, 5);

    // Safe survival shield aura covers the extractor 13m away
    const extPos = structureWorldPosition(geo, extractor).pos;
    expect(store.isInsideSafeAura(geo, p0.id, extPos[0], extPos[1], extPos[2])).toBe(true);

    const grid = store.analyzePlanetGrid(geo, p0);
    expect(grid.structureCount).toBe(2);
    expect(grid.links.length).toBe(1);
    // Pentagon Wonder gives 2.5x power boost (25 * 2.5 = 62.5 -> 63 kW)
    expect(grid.powerGeneratedKw).toBeGreaterThanOrEqual(62);
    expect(grid.powerEfficiency).toBeCloseTo(1.6, 5);
  });

  it('runs out-of-core extraction, synthesis, and interplanetary mass-driver transfers across planets', () => {
    const store = new StructureStore();
    const p0 = configs[0]; // Aurelia
    const p1 = configs[1]; // Vespera Shard (Crystal Moon)

    // Receiving landing pad on Aurelia (planet-0)
    const homePad = store.place({
      planetId: p0.id,
      kind: 'landing_pad',
      anchorTile: 15,
      groundRadius: 904,
    });

    // Automated outpost on Vespera Moon (planet-1) on Pentagon Wonder tile 0:
    // Solar Relay + Crystal Extractor + Synthesizer + Mass Driver beaming to planet-0
    store.place({
      planetId: p1.id,
      kind: 'solar_relay',
      anchorTile: 0,
      groundRadius: 425,
    });
    const moonExtractor = store.place({
      planetId: p1.id,
      kind: 'extractor',
      anchorTile: 0,
      offsetEast: 8,
      groundRadius: 425,
    });
    const moonSynth = store.place({
      planetId: p1.id,
      kind: 'synthesizer',
      anchorTile: 0,
      offsetEast: 16,
      groundRadius: 425,
    });
    store.place({
      planetId: p1.id,
      kind: 'mass_driver',
      anchorTile: 0,
      offsetEast: 24,
      groundRadius: 425,
      targetPlanetId: p0.id,
    });

    // Tick automation for 30 seconds while completely unstreamed
    for (let step = 0; step < 30; step++) {
      store.tickAutomation(1.0, geo, configMap, () => MAT.CRYSTAL);
    }

    // Moon extractor harvested crystal, synthesizer refined crystal_cell, and mass driver beamed items to homePad on planet-0!
    expect(moonExtractor.outputItem).toBe('crystal');
    expect(moonSynth.outputItem).toBe('crystal_cell');
    expect(homePad.storedCount).toBeGreaterThan(0);

    // Walk near homePad to collect delivered interplanetary cargo into inventory
    const padPos = structureWorldPosition(geo, homePad).pos;
    const inv = {};
    const picked = store.collectNearby(geo, p0.id, padPos[0], padPos[1], padPos[2], inv, 6.0);
    expect(picked.length).toBe(1);
    expect(homePad.storedCount).toBe(0);
  });

  it('renders procedural Floors-First meshes and conduit lines for all 6 structure kinds', () => {
    const scene = new THREE.Scene();
    const renderer = new StructureRenderer(scene);
    const store = new StructureStore();
    const p0 = configs[0];

    STRUCTURE_KINDS.forEach((kind, idx) => {
      store.place({
        planetId: p0.id,
        kind,
        anchorTile: idx,
        offsetEast: idx * 5,
        groundRadius: 904,
        storedCount: 4,
        outputItem: 'crystal',
      });
    });

    const structs = store.list(p0.id);
    const grid = store.analyzePlanetGrid(geo, p0);
    renderer.update(geo, structs, grid.links, 0, 0, 0, 1.5);
    expect(renderer.group.children.length).toBeGreaterThanOrEqual(structs.length + 2);
  });

  it('places Campfire, Workbench, Stone Furnace, and Storage Chest on distinct 7-slot hex sub-slots flush on the hex top cap', () => {
    const store = new StructureStore();
    const p0 = configs[0];
    const s0 = store.place({ planetId: p0.id, kind: 'campfire', anchorTile: 42, groundRadius: 906 });
    const s1 = store.place({ planetId: p0.id, kind: 'workbench', anchorTile: 42, groundRadius: 906 });
    const s2 = store.place({ planetId: p0.id, kind: 'furnace', anchorTile: 42, groundRadius: 906 });
    const s3 = store.place({ planetId: p0.id, kind: 'storage_chest', anchorTile: 42, groundRadius: 906 });

    expect(s0.subSlot).toBe(0);
    expect(s1.subSlot).toBe(1);
    expect(s2.subSlot).toBe(2);
    expect(s3.subSlot).toBe(3);

    // Every sub-slot stays well inside the 2.55m hex inradius and shares the exact tile normal
    const f0 = structureWorldPosition(geo, s0);
    const f1 = structureWorldPosition(geo, s1);
    const f2 = structureWorldPosition(geo, s2);
    expect(Math.hypot(s1.offsetEast, s1.offsetNorth)).toBeCloseTo(1.48, 2);
    expect(f0.up).toEqual(f1.up);
    expect(f1.up).toEqual(f2.up);
    // Survival stations do not emit industrial cyan conduit wires
    const grid = store.analyzePlanetGrid(geo, p0);
    expect(grid.links.length).toBe(0);
  });
});
