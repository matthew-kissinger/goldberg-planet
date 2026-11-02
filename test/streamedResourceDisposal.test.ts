import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import type { Player } from '../src/player/player';
import { WaterfallRenderer } from '../src/render/waterfalls';
import { WildlifeManager } from '../src/render/wildlife';
import { Columns } from '../src/world/columns';
import { buildLayers } from '../src/world/layers';
import { makeDefaultPlanetConfig } from '../src/world/planetConfig';
import { Terrain } from '../src/world/terrain';

function fixture() {
  const geo = new Goldberg(4);
  const config = makeDefaultPlanetConfig('streamed-resource-disposal');
  config.ocean.hasOcean = false;
  config.hasFlowingRivers = true;
  config.hasFloatingIslands = false;
  const layers = buildLayers(config);
  const columns = new Columns(geo, layers, new Terrain(config));
  // One spring with a 10 m cliff gives a deterministic visible waterfall.
  vi.spyOn(columns, 'topLayerOf').mockImplementation((tile) => layers.layerOfRadius(tile === 0 ? 910 : 900));
  vi.spyOn(columns, 'heightOf').mockImplementation((tile) => tile === 0 ? 10 : 0);
  const player = {
    px: geo.centers[0] * 910,
    py: geo.centers[1] * 910,
    pz: geo.centers[2] * 910,
    tile: 0,
    inSpaceCruise: true,
  } as Player;
  return { geo, config, layers, columns, player };
}

function observeDisposal(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    geometries.add(part.geometry);
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
  });
  expect(geometries.size).toBeGreaterThan(0);
  expect(materials.size).toBeGreaterThan(0);
  return {
    geometries: [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose')),
    materials: [...materials].map((material) => vi.spyOn(material, 'dispose')),
    materialObjects: materials,
  };
}

describe('streamed resource lifetime', () => {
  it('releases killed wildlife exactly once without releasing another creature resources', () => {
    const { geo, layers, columns } = fixture();
    const wildlife = new WildlifeManager(new THREE.Scene());
    const removed = wildlife.spawnOnTile(geo, layers, columns, 0)!;
    const retained = wildlife.spawnOnTile(geo, layers, columns, 1)!;
    const removedResources = observeDisposal(removed.meshGroup);
    const retainedResources = observeDisposal(retained.meshGroup);

    expect(wildlife.strikeNearest(removed.px, removed.py, removed.pz, 1, 0, 0, 1000).killed).toBe(true);
    expect(wildlife.creatures).toEqual([retained]);
    expect(removed.meshGroup.parent).toBeNull();
    for (const dispose of [...removedResources.geometries, ...removedResources.materials]) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of [...retainedResources.geometries, ...retainedResources.materials]) expect(dispose).not.toHaveBeenCalled();

    wildlife.clear();
    wildlife.clear();
    expect(wildlife.group.children).toHaveLength(0);
    for (const dispose of [...removedResources.geometries, ...removedResources.materials, ...retainedResources.geometries, ...retainedResources.materials]) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
  });

  it('releases wildlife resources when moving beyond the population radius', () => {
    const { geo, layers, columns, player } = fixture();
    const wildlife = new WildlifeManager(new THREE.Scene());
    const creature = wildlife.spawnOnTile(geo, layers, columns, 0)!;
    const resources = observeDisposal(creature.meshGroup);
    player.px += 1000;

    wildlife.update(0, geo, layers, columns, player, 0, 0, 0);
    expect(wildlife.creatures).toHaveLength(0);
    expect(creature.meshGroup.parent).toBeNull();
    for (const dispose of [...resources.geometries, ...resources.materials]) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('releases waterfall geometry on clear and keeps shared materials available for the next scan', () => {
    const { geo, layers, columns, player } = fixture();
    const waterfalls = new WaterfallRenderer(new THREE.Scene());
    waterfalls.update(0, geo, layers, columns, player, 0, 0, 0);
    const resources = observeDisposal(waterfalls.group);

    waterfalls.clear();
    waterfalls.clear();
    expect(waterfalls.group.children).toHaveLength(0);
    for (const dispose of resources.geometries) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of resources.materials) expect(dispose).not.toHaveBeenCalled();

    waterfalls.update(3, geo, layers, columns, player, 0, 0, 0);
    const next = observeDisposal(waterfalls.group);
    expect(next.materialObjects).toEqual(resources.materialObjects);
    waterfalls.clear();
    for (const dispose of next.geometries) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('releases waterfall geometry on distance pruning and planet changes, preserving renderer materials', () => {
    const { geo, config, layers, columns, player } = fixture();
    const waterfalls = new WaterfallRenderer(new THREE.Scene());
    waterfalls.update(0, geo, layers, columns, player, 0, 0, 0);
    const distant = observeDisposal(waterfalls.group);

    config.hasFlowingRivers = false;
    waterfalls.update(3, geo, layers, columns, { ...player, px: player.px + 1000 } as Player, 0, 0, 0);
    expect(waterfalls.group.children).toHaveLength(0);
    for (const dispose of distant.geometries) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of distant.materials) expect(dispose).not.toHaveBeenCalled();

    config.hasFlowingRivers = true;
    waterfalls.update(3, geo, layers, columns, player, 0, 0, 0);
    const previousPlanet = observeDisposal(waterfalls.group);
    config.id = 'other-planet';
    config.hasFlowingRivers = false;
    waterfalls.update(0, geo, layers, columns, player, 0, 0, 0);
    expect(waterfalls.group.children).toHaveLength(0);
    for (const dispose of previousPlanet.geometries) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of previousPlanet.materials) expect(dispose).not.toHaveBeenCalled();
  });
});
