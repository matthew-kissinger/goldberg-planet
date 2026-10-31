/**
 * Multi-Planet Solar System Manager (`SolarSystem`).
 *
 * Manages all 6 worlds in the solar system:
 *  - Shares a single `Goldberg(m)` fine topology across all planets' `Columns` and `Trees`
 *  - Renders all non-active planets in real time in the sky using `Goldberg(24)` impostor
 *    meshes with true terrain heights, biome colors, ocean shells, atmospheres, and rings
 *  - Performs seamless Floating-Origin Sphere of Influence (SOI) handoff when flying
 *    from one planet to another, conserving position and velocity vectors
 */

import * as THREE from 'three/webgpu';
import { Goldberg } from '../geo/goldberg';
import { buildLayers, type Layers } from './layers';
import { Terrain } from './terrain';
import { Columns } from './columns';
import { Trees } from './trees';
import { buildSolarSystemConfigs, type PlanetConfig } from './planetConfig';
import type { ResourceDropSave } from '../sim/resourceDrops';
import { FarSphere } from '../render/farsphere';
import type { Streamer } from './streamer';
import type { OceanMesh } from '../render/ocean';
import type { Sky } from '../render/sky';
import type { TerrainMaterialHandle } from '../render/terrainMaterial';
import type { GpuPlanetEffects } from '../render/gpuComputeParticles';
import type { Player } from '../player/player';

export interface PlanetState {
  index: number;
  config: PlanetConfig;
  layers: Layers;
  terrain: Terrain;
  columns: Columns;
  trees: Trees;
  drops: ResourceDropSave[];
  impostorGroup: THREE.Group | null;
}

export interface PlanetNavTarget {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  archetype: PlanetConfig['archetype'];
  distanceMeters: number;
  /** Unit direction vector from player to planet center in active planet's frame */
  dir: [number, number, number];
  isActive: boolean;
  primaryResource: string;
  hazard: string;
  radius: number;
}

export interface SolarSystemRenderBindings {
  streamer: Streamer;
  farSphere: FarSphere;
  ocean: OceanMesh;
  sky: Sky;
  terrainMaterial: TerrainMaterialHandle;
  gpuEffects?: GpuPlanetEffects;
}

export class SolarSystem {
  readonly universeSeed: string;
  readonly fineGeo: Goldberg;
  readonly impostorGeo: Goldberg;
  readonly planets: PlanetState[] = [];
  readonly planetById = new Map<string, PlanetState>();
  private activeIndex = 0;
  private bindings: SolarSystemRenderBindings | null = null;
  private readonly changeListeners: Array<(planet: PlanetState) => void> = [];

  constructor(
    universeSeed: string,
    fineGeo: Goldberg,
    scene?: THREE.Scene,
    impostorMaterial?: THREE.Material,
  ) {
    this.universeSeed = universeSeed;
    this.fineGeo = fineGeo;
    this.impostorGeo = new Goldberg(Math.min(24, fineGeo.m));

    const configs = buildSolarSystemConfigs(universeSeed);
    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      const layers = buildLayers(config);
      const terrain = new Terrain(config);
      const columns = new Columns(fineGeo, layers, terrain);
      const trees = new Trees(fineGeo, columns, terrain, config.seed);
      const drops: ResourceDropSave[] = [];

      let impostorGroup: THREE.Group | null = null;
      if (scene && impostorMaterial) {
        impostorGroup = FarSphere.buildImpostorGroup(this.impostorGeo, terrain, impostorMaterial);
        impostorGroup.visible = i !== 0;
        scene.add(impostorGroup);
      }

      const state: PlanetState = {
        index: i,
        config,
        layers,
        terrain,
        columns,
        trees,
        drops,
        impostorGroup,
      };
      this.planets.push(state);
      this.planetById.set(config.id, state);
    }
  }

  get activePlanet(): PlanetState {
    return this.planets[this.activeIndex];
  }

  bindRenderers(bindings: SolarSystemRenderBindings): void {
    this.bindings = bindings;
    this.syncBindingsToActive();
  }

  onPlanetChange(listener: (planet: PlanetState) => void): void {
    this.changeListeners.push(listener);
  }

  private syncBindingsToActive(): void {
    if (!this.bindings) return;
    const p = this.activePlanet;
    const { streamer, farSphere, ocean, sky, terrainMaterial, gpuEffects } = this.bindings;
    terrainMaterial.applyPlanetConfig(p.config);
    streamer.rebindPlanet(p.layers, p.columns, p.trees);
    farSphere.rebindTerrain(p.terrain, p.config.radius);
    ocean.rebindPlanet(p.terrain, p.layers, p.config);
    sky.applyPlanetConfig(p.config);
    gpuEffects?.applyPlanetConfig(p.config);

    for (let i = 0; i < this.planets.length; i++) {
      const imp = this.planets[i].impostorGroup;
      if (imp) imp.visible = i !== this.activeIndex;
    }
  }

  /**
   * Perform a floating-origin Sphere of Influence (SOI) handoff from the current active
   * planet to `targetId`, preserving the player's solar-system position and velocity.
   */
  handoffToPlanet(targetId: string, player: Player): boolean {
    const target = this.planetById.get(targetId);
    if (!target || target.index === this.activeIndex) return false;

    const prev = this.activePlanet;
    const dx = prev.config.solarPosition[0] - target.config.solarPosition[0];
    const dy = prev.config.solarPosition[1] - target.config.solarPosition[1];
    const dz = prev.config.solarPosition[2] - target.config.solarPosition[2];

    // Transform player position into the target planet's center frame (velocity is unchanged!)
    player.px += dx;
    player.py += dy;
    player.pz += dz;

    this.activeIndex = target.index;
    player.rebindPlanet(target.layers, target.columns);
    this.syncBindingsToActive();

    for (const cb of this.changeListeners) cb(target);
    return true;
  }

  /**
   * Directly warp/land the player into high atmospheric approach or surface spawn on `targetId`.
   */
  warpToPlanet(targetId: string, player: Player, landingTile = 0, enterFlight = true): boolean {
    const target = this.planetById.get(targetId);
    if (!target) return false;
    this.activeIndex = target.index;
    player.rebindPlanet(target.layers, target.columns);
    player.spawnAt(landingTile);
    if (enterFlight) {
      const [ux, uy, uz] = player.up();
      player.px += ux * 65;
      player.py += uy * 65;
      player.pz += uz * 65;
      player.enterPlane();
      player.inSpaceCruise = false;
      player.holdAGL = 65;
    }
    this.syncBindingsToActive();
    for (const cb of this.changeListeners) cb(target);
    return true;
  }

  /**
   * Per-frame update: checks if the player has crossed into another planet's Sphere of
   * Influence (`dist < target.radius * 2.15`) and updates distant planet impostor positions.
   */
  update(player: Player, camX: number, camY: number, camZ: number): PlanetState | null {
    const active = this.activePlanet;
    const ax = active.config.solarPosition[0];
    const ay = active.config.solarPosition[1];
    const az = active.config.solarPosition[2];

    // Solar-system coordinates of the player
    const sx = ax + player.px;
    const sy = ay + player.py;
    const sz = az + player.pz;

    let switchedTo: PlanetState | null = null;
    for (let i = 0; i < this.planets.length; i++) {
      if (i === this.activeIndex) continue;
      const cand = this.planets[i];
      const cx = cand.config.solarPosition[0];
      const cy = cand.config.solarPosition[1];
      const cz = cand.config.solarPosition[2];
      const dist = Math.hypot(sx - cx, sy - cy, sz - cz);
      const soiRadius = cand.config.radius * 2.15;
      if (dist < soiRadius) {
        this.handoffToPlanet(cand.config.id, player);
        switchedTo = cand;
        break;
      }
    }

    // Update distant impostor transforms relative to the current active planet & floating-origin camera
    const curActive = this.activePlanet;
    const curAx = curActive.config.solarPosition[0];
    const curAy = curActive.config.solarPosition[1];
    const curAz = curActive.config.solarPosition[2];

    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i];
      if (!p.impostorGroup) continue;
      if (i === this.activeIndex) {
        p.impostorGroup.visible = false;
        continue;
      }
      p.impostorGroup.visible = true;
      p.impostorGroup.position.set(
        p.config.solarPosition[0] - curAx - camX,
        p.config.solarPosition[1] - curAy - camY,
        p.config.solarPosition[2] - curAz - camZ,
      );
    }

    return switchedTo;
  }

  /**
   * Compute navigation telemetry for all planets relative to the player's current position.
   */
  navTelemetry(player: Player): PlanetNavTarget[] {
    const active = this.activePlanet;
    const ax = active.config.solarPosition[0];
    const ay = active.config.solarPosition[1];
    const az = active.config.solarPosition[2];

    return this.planets.map((p) => {
      if (p.index === this.activeIndex) {
        const r = Math.hypot(player.px, player.py, player.pz) || 1;
        return {
          id: p.config.id,
          index: p.index,
          name: p.config.name,
          subtitle: p.config.subtitle,
          archetype: p.config.archetype,
          distanceMeters: Math.max(0, Math.round(r - p.config.radius)),
          dir: [-player.px / r, -player.py / r, -player.pz / r],
          isActive: true,
          primaryResource: p.config.survival.primaryResource,
          hazard: p.config.survival.hazard,
          radius: p.config.radius,
        };
      }
      const dx = p.config.solarPosition[0] - ax - player.px;
      const dy = p.config.solarPosition[1] - ay - player.py;
      const dz = p.config.solarPosition[2] - az - player.pz;
      const dist = Math.hypot(dx, dy, dz) || 1;
      return {
        id: p.config.id,
        index: p.index,
        name: p.config.name,
        subtitle: p.config.subtitle,
        archetype: p.config.archetype,
        distanceMeters: Math.max(0, Math.round(dist - p.config.radius)),
        dir: [dx / dist, dy / dist, dz / dist],
        isActive: false,
        primaryResource: p.config.survival.primaryResource,
        hazard: p.config.survival.hazard,
        radius: p.config.radius,
      };
    });
  }
}
