/**
 * Goldberg Planet — spherical exploration prototype.
 *
 * Boots a 6-world procedural solar system behind the splash, then runs the frame loop:
 * input -> player -> solarSystem SOI -> camera -> streaming -> out-of-core automation ->
 * structures -> GPU compute particles -> multiplayer -> save -> HUD -> render.
 */

import * as THREE from 'three/webgpu';
import { Goldberg } from './geo/goldberg';
import { Streamer } from './world/streamer';
import { pick, pickTree, type TreePick } from './world/pick';
import { SolarSystem } from './world/solarSystem';
import type { PlanetConfig } from './world/planetConfig';
import { FarSphere } from './render/farsphere';
import { Sky } from './render/sky';
import { Character } from './render/character';
import { FootIk } from './render/footIk';
import { ColumnGroundProbe } from './world/groundContact';
import { AureliaVegetationRenderer } from './render/aureliaVegetation';
import { aureliaSites } from './world/aurelia';
import { worldSites } from './world/expeditionWorlds';
import { carryAureliaIntoWorldsV3 } from './sim/worldRecipeSave';
import { parseGameMode } from './sim/gameMode';
import { createExpeditionHabitat } from './world/expeditionHabitat';
import { ExpeditionLighting } from './render/expeditionLighting';
import { ResourceDropRenderer } from './render/resourceDrops';
import { buildOcean } from './render/ocean';
import { TileHighlight } from './render/tileHighlight';
import { createTerrainMaterial } from './render/terrainMaterial';
import { GpuPlanetEffects } from './render/gpuComputeParticles';
import { StructureRenderer } from './render/structures';
import { RemotePlayerRenderer } from './render/remotePlayers';
import { FallingTreeRenderer } from './render/fallingTrees';
import { AureliaFauna } from './render/aureliaFauna';
import { WaterfallRenderer } from './render/waterfalls';
import { Player } from './player/player';
import { UxManager } from './player/ux';
import { FrameStats } from './demo/frameStats';
import { RenderStats } from './demo/renderStats';
import { Hud, splash, hideSplash, type StructureBlueprintView } from './demo/hud';
import { GameAudio } from './audio/gameAudio';
import {
  applyChoppedTrees,
  applyPlanetDeltaSave,
  applyPlayerSave,
  applyTreeChopProgress,
  captureWorldSave,
  clearStoredWorldSave,
  loadStoredWorldSave,
  saveSlotKey,
  serializeChoppedTrees,
  serializeTreeChopProgress,
  type PlanetDeltaSave,
} from './sim/save';
import {
  ITEM_DEFS,
  PLANE_WOOD_COST,
  itemCount,
  normalizeInventory,
  type ItemId,
} from './sim/crafting';
import { normalizeResourceDrops } from './sim/resourceDrops';
import {
  STRUCTURE_DEFS,
  STRUCTURE_KINDS,
  StructureStore,
} from './sim/persistence';
import { MultiplayerClient } from './net/client';
import { CameraRig } from './game/cameraRig';
import { Controls, type FrameIntent } from './game/controls';
import { CoreLoop, CHOP_COOLDOWN } from './game/coreLoop';
import { Autosave } from './game/autosave';
import { findSpawnTile } from './game/spawn';
import { craftKeyLabel, helpText, hintDevice, openingHint, type HintDevice } from './game/hints';

const params = new URLSearchParams(location.search);
const SEED = params.get('seed') ?? 'GP192-01';
const M = Number.parseInt(params.get('m') ?? '192', 10);
const ROOM_ID = params.get('room');
const COARSE_M = 96;
const SUN = new THREE.Vector3(0.62, 0.55, 0.56).normalize();
/** chop / mine reach from the eye, metres */
const REACH = 9.5;
/** beyond this boom length the view is too far out to aim at trees */
const AIM_MAX_CAM_DIST = 120;
// The new terrain/layer recipe gets its own slot; original worlds remain untouched.
const gameMode = parseGameMode(params.get('mode'));
const creative = gameMode === 'creative';
const saveKey = `${saveSlotKey(SEED, M)}:worlds-v3:${gameMode}`;
const saveEnabled = params.get('nosave') !== '1';
if (params.get('reset') === '1') clearStoredWorldSave(saveKey);

const ALL_ITEM_IDS = Object.keys(ITEM_DEFS) as ItemId[];

function yieldFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function createRenderer(coarsePointer: boolean): Promise<THREE.WebGPURenderer> {
  let renderer: THREE.WebGPURenderer;
  try {
    renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.get('gpu') === 'gl', trackTimestamp: params.get('profilegpu') === '1' });
    await renderer.init();
  } catch (err) {
    console.warn('WebGPU init failed; falling back to WebGL2', err);
    renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: true });
    await renderer.init();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarsePointer ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer;
}

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;

  splash('goldberg topology…', 0.02);
  await yieldFrame();
  const geo = new Goldberg(M);
  splash(`${geo.count.toLocaleString()} tiles · ${geo.buildMs.toFixed(0)} ms`, 0.14);
  await yieldFrame();

  splash('starting renderer…', 0.18);
  await yieldFrame();
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches || params.get('touch') === '1';
  const renderer = await createRenderer(coarsePointer);
  const renderStats = new RenderStats();
  const isWebGPU = !!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060c);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 48000);
  const lighting = new ExpeditionLighting(scene, renderer, SUN, coarsePointer, params.get('shadows') !== '0');

  splash('forging 6-world solar system…', 0.22);
  await yieldFrame();
  const impostorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.04 });
  const solarSystem = new SolarSystem(SEED, geo, scene, impostorMat);
  const homePlanet = solarSystem.planets[0]!;
  const expedition = createExpeditionHabitat(geo, homePlanet.config);
  const structureStore = new StructureStore();

  const planetConfigMap = new Map<string, PlanetConfig>();
  for (const p of solarSystem.planets) {
    planetConfigMap.set(p.config.id, p.config);
  }

  // Restore saved solar-system state across all 6 worlds
  const currentSave = saveEnabled ? loadStoredWorldSave(saveKey, SEED, M) : null;
  const priorSave = saveEnabled && !currentSave && params.get('reset') !== '1'
    ? loadStoredWorldSave(`${saveSlotKey(SEED, M)}:aurelia-v2:${gameMode}`, SEED, M) : null;
  const carried = priorSave ? carryAureliaIntoWorldsV3(priorSave) : null;
  const save = currentSave ?? carried?.save ?? null;
  if (save) {
    if (save.structures) structureStore.importAll(save.structures);
    if (save.planetDeltas) {
      for (const p of solarSystem.planets) {
        const delta = save.planetDeltas[p.config.id];
        if (!delta) continue;
        applyPlanetDeltaSave(p, delta, geo.count);
      }
    } else {
      // Legacy single-planet save compatibility
      const home = solarSystem.planets[0]!;
      applyChoppedTrees(home.trees, save.choppedTrees, geo.count);
      applyTreeChopProgress(home.trees, save.treeChopProgress, geo.count);
      home.drops = normalizeResourceDrops(save.drops, geo.count);
    }
  }

  const startPlanet = (save?.activePlanetId ? solarSystem.planetById.get(save.activePlanetId) : undefined) ?? solarSystem.planets[0]!;
  lighting.setPlanet(startPlanet.config);
  const terrainMaterial = createTerrainMaterial(startPlanet.config);
  await terrainMaterial.loadSurfaceDetail();
  const streamer = new Streamer(geo, startPlanet.layers, startPlanet.columns, scene, terrainMaterial.material, startPlanet.trees);

  const farSphere = await FarSphere.build(
    new Goldberg(COARSE_M), geo, startPlanet.terrain,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0 }),
    async (frac) => {
      splash(`far side + horizon… ${Math.round(frac * 100)}%`, 0.25 + frac * 0.25);
      await yieldFrame();
    },
  );
  scene.add(farSphere.mesh);
  const water = await buildOcean(scene, startPlanet.terrain, startPlanet.layers, async (frac) => {
    splash(`filling the oceans… ${Math.round(frac * 100)}%`, 0.5 + 0.04 * frac);
    await yieldFrame();
  });
  const skyQuality = params.get('skyq') === 'high' ? 'high' : params.get('skyq') === 'low' || coarsePointer ? 'low' : 'high';
  const sky = new Sky(scene, SUN, skyQuality, params.get('clouds') !== '0');
  const gpuEffects = new GpuPlanetEffects(scene);
  await gpuEffects.precompile(renderer);
  gpuEffects.applyPlanetConfig(startPlanet.config);

  solarSystem.bindRenderers({
    streamer,
    farSphere,
    ocean: water,
    sky,
    terrainMaterial,
    gpuEffects,
  });

  const player = new Player(geo, startPlanet.layers, startPlanet.columns);
  player.creative = creative;
  if (save?.activePlanetId && save.activePlanetId !== solarSystem.activePlanet.config.id) {
    solarSystem.warpToPlanet(save.activePlanetId, player, 0, false);
    await solarSystem.whenTravelSettled();
  }
  if (!save || carried?.relocate || !applyPlayerSave(player, save.player, geo.count)) {
    player.spawnAt(findSpawnTile(geo, solarSystem.activePlanet.columns, solarSystem.activePlanet.trees));
    if (solarSystem.activePlanet === homePlanet && expedition) {
      [player.fwdX, player.fwdY, player.fwdZ] = expedition.heading;
      player.reorthonormalize();
    }
  }

  const controls = new Controls(renderer.domElement, app, params.get('touch') === '1');
  const ux = new UxManager();
  const hud = new Hud();
  hud.setGameMode(gameMode);
  const audio = new GameAudio();
  if (params.get('mute') === '1') audio.setMuted(true);
  const character = new Character(scene);
  await character.ready;
  character.setAppearance(save?.appearance);
  hud.setAppearance(character.getAppearance());
  const groundProbe = new ColumnGroundProbe(geo, solarSystem.activePlanet.columns);
  const footIk = character.rig ? new FootIk(character.rig) : null;
  character.setPoseModifier(context => footIk?.update(context, groundProbe));
  const vegetationByPlanet = new Map<string, AureliaVegetationRenderer>();
  for (const planet of solarSystem.planets) {
    vegetationByPlanet.set(planet.config.id, new AureliaVegetationRenderer(scene, geo, planet.columns, planet.trees, planet.terrain));
    await yieldFrame();
  }
  let habitat = vegetationByPlanet.get(solarSystem.activePlanet.config.id)!;
  const allSites = solarSystem.planets.flatMap(planet => (planet.terrain.aurelia ? aureliaSites(planet.config) : worldSites(planet.config))
    .map(site => ({ ...site, planetId: planet.config.id })));
  const sitesByPlanet = new Map(solarSystem.planets.map(planet => [planet.config.id, allSites.filter(site => site.planetId === planet.config.id)]));
  let sites = sitesByPlanet.get(solarSystem.activePlanet.config.id)!;
  const visitedSites = new Set<string>(Array.isArray(save?.journal?.visitedSites) ? save.journal.visitedSites.filter((id): id is string => typeof id === 'string' && allSites.some(s => s.id === id)) : []);
  let courseId: string | null = null;
  let courseSiteId: string | null = null;
  let navigationRevision = 0;
  const dropRenderer = new ResourceDropRenderer(scene);
  const structureRenderer = new StructureRenderer(scene);
  const fallingTrees = new FallingTreeRenderer(scene);
  const faunaByPlanet = new Map<string, AureliaFauna>();
  for (const planet of solarSystem.planets) {
    const fauna = new AureliaFauna(scene, geo, planet.columns, planet.terrain);
    fauna.importState(save?.faunaByPlanet?.[planet.config.id]);
    fauna.group.visible = false;
    faunaByPlanet.set(planet.config.id, fauna);
    await yieldFrame();
  }
  let wildlife = faunaByPlanet.get(solarSystem.activePlanet.config.id)!;
  const waterfalls = new WaterfallRenderer(scene);
  const remotePlayerRenderer = new RemotePlayerRenderer(scene);
  const highlight = new TileHighlight(scene);
  const rig = new CameraRig(camera, geo, solarSystem.activePlanet.layers, solarSystem.activePlanet.columns);
  const stats = new FrameStats();

  let device: HintDevice = 'keyboard';
  const syncDevice = (): void => {
    device = hintDevice(ux.update({ touchEnabled: controls.touch.enabled, gamepadActive: controls.gamepadActive() }).inputMode);
    hud.setHelpText(helpText(device));
    hud.setCraftKey(craftKeyLabel(device));
  };
  syncDevice();

  // Optional Multiplayer Co-op Room (`?room=<id>`)
  let mpClient: MultiplayerClient | null = null;
  let autosave: Autosave | null = null;

  const loop = new CoreLoop({
    creative,
    geo,
    layers: solarSystem.activePlanet.layers,
    columns: solarSystem.activePlanet.columns,
    trees: solarSystem.activePlanet.trees,
    streamer,
    player,
    hud,
    audio,
    drops: dropRenderer,
    device: () => device,
    changed: () => autosave?.markDirty(),
    structures: structureStore,
    activePlanetId: () => solarSystem.activePlanet.config.id,
    onStructurePlaced: (s) => {
      mpClient?.sendMutation({ type: 'structure_place', structure: s });
      if (s.kind === 'eco_dome') {
        mpClient?.sendMutation({ type: 'eco_seed', planetId: s.planetId, tile: s.anchorTile });
      }
    },
    onColumnEdited: (planetId, tile, layer, action, mat) => {
      mpClient?.sendMutation({ type: 'column_edit', planetId, tile, layer, action, mat });
    },
    onTreeStruck: (planetId, tile, felled, groveTrees, groundRadius) => {
      if (felled) {
        mpClient?.sendMutation({ type: 'tree_chop', planetId, tile });
        if (groveTrees && groundRadius !== undefined) {
          const c = geo.centers;
          const ux = c[tile * 3], uy = c[tile * 3 + 1], uz = c[tile * 3 + 2];
          // Tip diagonally-sideways relative to the player's look direction so the falling silhouette is dramatic and clear
          const rx = player.fwdY * uz - player.fwdZ * uy;
          const ry = player.fwdZ * ux - player.fwdX * uz;
          const rz = player.fwdX * uy - player.fwdY * ux;
          const fdx = player.fwdX * 0.25 + rx * 0.96;
          const fdy = player.fwdY * 0.25 + ry * 0.96;
          const fdz = player.fwdZ * 0.25 + rz * 0.96;
          for (const tp of groveTrees) {
            fallingTrees.spawn(tile, ux, uy, uz, groundRadius, tp, fdx, fdy, fdz);
          }
        }
      }
    },
  }, {
    inventory: normalizeInventory(save?.inventory),
    planeCrafted: save?.planeCrafted ?? params.get('plane') === '1',
    drops: solarSystem.activePlanet.drops,
  });

  if (ROOM_ID) {
    mpClient = new MultiplayerClient({
      roomId: `${ROOM_ID}:worlds-v3:${gameMode}`,
      universeSeed: SEED,
      callbacks: {
        onRoomInit: (state) => {
          for (const s of state.structures) structureStore.byId.set(s.id, s);
          for (const [pid, delta] of Object.entries(state.planetDeltas)) {
            const p = solarSystem.planetById.get(pid);
            if (!p) continue;
            for (const t of delta.choppedTrees) p.trees.chopped.add(t);
            if (delta.columnEdits?.length) p.columns.importEdits(delta.columnEdits);
            if (delta.seededEcoTiles?.length) {
              for (const t of delta.seededEcoTiles) p.columns.seededEcoTiles.add(t);
            }
          }
          streamer.invalidateAll();
          hud.flash(`connected to co-op room "${ROOM_ID}" (${state.peers.length} peer${state.peers.length === 1 ? '' : 's'})`, 3.5);
        },
        onWorldMutation: (mutation) => {
          if (mutation.type === 'structure_place') {
            structureStore.byId.set(mutation.structure.id, mutation.structure);
          } else if (mutation.type === 'structure_remove') {
            structureStore.remove(mutation.structureId);
          } else if (mutation.type === 'tree_chop') {
            const p = solarSystem.planetById.get(mutation.planetId);
            if (p) {
              p.trees.chopped.add(mutation.tile);
              if (p.config.id === solarSystem.activePlanet.config.id) streamer.rebuildTile(mutation.tile);
            }
          } else if (mutation.type === 'column_edit') {
            const p = solarSystem.planetById.get(mutation.planetId);
            if (p) {
              if (mutation.action === 'mine') p.columns.mine(mutation.tile, mutation.layer);
              else p.columns.place(mutation.tile, mutation.layer);
              if (p.config.id === solarSystem.activePlanet.config.id) streamer.rebuildTile(mutation.tile, true);
            }
          } else if (mutation.type === 'eco_seed') {
            const p = solarSystem.planetById.get(mutation.planetId);
            if (p) {
              const tiles = p.columns.seedEcosystem(mutation.tile, true);
              if (p.config.id === solarSystem.activePlanet.config.id) {
                for (const t of tiles) streamer.rebuildTile(t);
              }
            }
          }
        },
      },
    });
    mpClient.connect(undefined, params.get('ws') ?? undefined);
  }

  let loopPlanet = solarSystem.activePlanet;
  // Keep simulation state and rendering bindings synchronized through both
  // explicit visits and physical sphere-of-influence flight handoffs.
  solarSystem.onPlanetChange((nextPlanet, dx, dy, dz) => {
    loopPlanet.drops = loop.drops;
    loopPlanet = nextPlanet;
    groundProbe.rebind(nextPlanet.columns);
    footIk?.reset();
    loop.rebindPlanet(nextPlanet.layers, nextPlanet.columns, nextPlanet.trees, nextPlanet.drops);
    if (dx !== undefined && dy !== undefined && dz !== undefined) {
      rig.rebindPlanet(nextPlanet.layers, nextPlanet.columns, dx, dy, dz, player.up());
    } else {
      rig.rebindPlanet(nextPlanet.layers, nextPlanet.columns);
      rig.snapTo(player);
    }
    wildlife.group.visible = false;
    wildlife = faunaByPlanet.get(nextPlanet.config.id)!;
    habitat.group.visible = false;
    habitat = vegetationByPlanet.get(nextPlanet.config.id)!;
    sites = sitesByPlanet.get(nextPlanet.config.id)!;
    lighting.setPlanet(nextPlanet.config);
    fallingTrees.clear();
    waterfalls.clear();
    farSphere.setResidentChunks(streamer.renderedKeys());
    streamer.residencyDirty = false;
    hud.flash(`entered ${nextPlanet.config.name} — ${nextPlanet.config.subtitle}`, 3.8);
    autosave?.markDirty();
  });

  autosave = new Autosave(saveKey, saveEnabled, () => {
    solarSystem.activePlanet.drops = loop.drops;
    const planetDeltas: Record<string, PlanetDeltaSave> = {};
    for (const p of solarSystem.planets) {
      planetDeltas[p.config.id] = {
        choppedTrees: serializeChoppedTrees(p.trees),
        treeChopProgress: serializeTreeChopProgress(p.trees),
        columnEdits: p.columns.exportEdits(),
        seededEcoTiles: [...p.columns.seededEcoTiles].sort((a, b) => a - b),
        drops: p.drops,
      };
    }
    return captureWorldSave({
      seed: SEED,
      frequency: M,
      player,
      trees: solarSystem.activePlanet.trees,
      inventory: loop.inventory,
      drops: loop.drops,
      planeCrafted: loop.planeCrafted,
      activePlanetId: solarSystem.activePlanet.config.id,
      structures: structureStore.exportAll(),
      planetDeltas,
      mode: gameMode,
      journal: { version: 1, visitedSites: [...visitedSites] },
      appearance: { ...character.getAppearance() },
      faunaByPlanet: Object.fromEntries([...faunaByPlanet].map(([id, fauna]) => [id, fauna.exportState()])),
    });
  }, !save || !!carried);

  const unlockAudio = (): void => {
    void audio.unlock().then((ok) => {
      if (!ok) return;
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    });
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio);
  document.addEventListener('visibilitychange', () => audio.setPageVisible(document.visibilityState !== 'hidden'));

  let craftingOpen = false;
  let showBuildPreview = false;

  const structureBlueprints = (): StructureBlueprintView[] =>
    STRUCTURE_KINDS.map((kind) => {
      const def = STRUCTURE_DEFS[kind];
      const canBuild = creative || structureStore.canAfford(kind, loop.inventory);
      return {
        kind,
        name: def.name,
        description: def.description,
        powerKw: def.powerKw,
        canBuild,
        selected: loop.selectedStructureKind === kind,
        requirements: (Object.entries(def.cost) as [ItemId, number][]).map(([item, need]) => ({
          name: ITEM_DEFS[item].name.toLowerCase(),
          need: need ?? 0,
          have: itemCount(loop.inventory, item),
        })),
      };
    });

  const refreshCrafting = (): void => hud.setCrafting(loop.craftingRows(), craftingOpen, structureBlueprints());
  const toggleCrafting = (): void => {
    if (!craftingOpen) hud.setMenuOpen(false);
    craftingOpen = !craftingOpen;
    refreshCrafting();
    audio.playEvent(craftingOpen ? 'uiOpen' : 'uiConfirm');
  };
  controls.input.setWorldInputBlocked(() => craftingOpen || hud.isMenuOpen() || solarSystem.travelState.pending);
  hud.onCraftToggle = toggleCrafting;
  hud.onCraftClose = () => { if (craftingOpen) toggleCrafting(); };
  hud.onCraftSelect = (id) => {
    if (solarSystem.travelState.pending) return;
    if (loop.craft(id)) refreshCrafting();
  };

  // Determine the next destination planet for interplanetary Mass Drivers
  const defaultMassDriverTargetId = (): string => {
    const curIdx = solarSystem.activePlanet.index;
    const nextIdx = (curIdx + 1) % solarSystem.planets.length;
    return solarSystem.planets[nextIdx]!.config.id;
  };

  // Aimed tile or player tile for building / mining
  let target: TreePick | null = null;
  let aimedTile: number | null = null;
  let aimedLayer: number | null = null;

  const buildSelectedStructureNow = (): void => {
    if (solarSystem.travelState.pending) return;
    const tile = aimedTile ?? player.tile;
    const targetPlanet = loop.selectedStructureKind === 'mass_driver' ? defaultMassDriverTargetId() : undefined;
    if (loop.placeStructure(loop.selectedStructureKind, tile, undefined, undefined, loop.placementYaw, targetPlanet)) {
      refreshCrafting();
    }
  };

  hud.onStructureSelect = (kind) => {
    loop.selectedStructureKind = kind;
    showBuildPreview = true;
    if (craftingOpen) toggleCrafting();
    hud.flash(`${STRUCTURE_DEFS[kind].name} selected · choose a spot, then Q or tap the placement prompt`, 3);
    refreshCrafting();
  };

  hud.onBuildStripClick = () => {
    if (showBuildPreview) buildSelectedStructureNow();
    else toggleCrafting();
  };

  const triggerPlanetWarp = (planetId: string): void => {
    navigationRevision++;
    if (!solarSystem.planetById.has(planetId)) return;
    if (!creative) {
      courseId = planetId;
      const destination = solarSystem.navTelemetry(player).find(p => p.id === planetId)!;
      if (player.inSpaceCruise) {
        const up = player.up();
        player.pitch = Math.asin(THREE.MathUtils.clamp(destination.dir[0]*up[0]+destination.dir[1]*up[1]+destination.dir[2]*up[2], -.98,.98));
        [player.fwdX,player.fwdY,player.fwdZ] = destination.dir;
        player.reorthonormalize();
      }
      hud.flash(player.hasOrbitalThruster ? `Course: ${destination.name}. Board with E, climb into orbit, then choose the course again to align.` : 'Build a workbench and furnace. Smelt 2 iron, then craft the Starfarer to leave the planet.', 5);
      return;
    }
    if (planetId === solarSystem.activePlanet.config.id) {
      if (solarSystem.travelState.pending) solarSystem.cancelTravel();
      hud.flash(`already on ${solarSystem.activePlanet.config.name}`, 1.8);
      return;
    }
    solarSystem.activePlanet.drops = loop.drops;
    const destination = solarSystem.planetById.get(planetId)!;
    const arrival = sitesByPlanet.get(planetId)?.[0];
    const landingTile = destination === homePlanet && expedition ? expedition.spawnTile : arrival ? geo.tileOf(...arrival.direction) : findSpawnTile(geo, destination.columns, destination.trees);
    if (solarSystem.warpToPlanet(planetId, player, landingTile, false)) {
      audio.playEvent('craftConfirm');
    }
  };

  hud.onPlanetSelect = (planetId) => {
    triggerPlanetWarp(planetId);
  };
  hud.onGameModeSelect = mode => {
    if (mode === gameMode) return;
    autosave?.write(true);
    const url = new URL(location.href); url.searchParams.set('mode', mode);
    url.searchParams.delete('reset');
    location.assign(url.href);
  };
  hud.onAppearanceChange = patch => {
    character.setAppearance({ ...character.getAppearance(), ...patch });
    footIk?.reset();
    hud.setAppearance(character.getAppearance());
    autosave?.markDirty();
  };
  hud.onSiteSelect = id => {
    navigationRevision++;
    const site = allSites.find(s => s.id === id);
    if (!site) return;
    if (!creative) {
      courseSiteId = site.id;
      if (site.planetId !== solarSystem.activePlanet.config.id) courseId = site.planetId;
      hud.flash(`Route marked: ${site.name}. Follow the bearing in your field note.`, 4);
      return;
    }
    const land = (): void => {
      player.mode = 'walk'; player.inSpaceCruise = false;
      player.vx = 0; player.vy = 0; player.vz = 0;
      player.grounded = false; player.stepSmooth = 0;
      player.spawnAt(geo.tileOf(...site.direction));
      rig.snapTo(player); footIk?.reset();
      hud.setMenuOpen(false); autosave?.markDirty();
      hud.flash(`${site.name} · ${site.biome.replace(/[-_]/g, ' ')}`, 3);
    };
    if (solarSystem.activePlanet.config.id === site.planetId) {
      solarSystem.cancelTravel();
      land();
    }
    else {
      solarSystem.activePlanet.drops = loop.drops;
      solarSystem.warpToPlanet(site.planetId, player, geo.tileOf(...site.direction), false);
      const revision = navigationRevision;
      void solarSystem.whenTravelSettled().then(settled => {
        if (settled && revision === navigationRevision && solarSystem.activePlanet.config.id === site.planetId) land();
      });
    }
  };
  hud.onObserve = () => {
    const observation = wildlife.nearbyObservation(player);
    if (!observation) { hud.flash('Walk closer to an animal to observe it.', 2); return; }
    if (wildlife.observe(observation.id)) {
      autosave?.markDirty(); hud.flash(`${observation.name} recorded in your field notes.`, 3);
    }
  };
  hud.onFeed = () => {
    const observation = wildlife.nearbyObservation(player);
    if (!observation) { hud.flash('Approach a grazer slowly before offering forage.', 3); return; }
    if (!creative && itemCount(loop.inventory, 'fiber') < 1) { hud.flash('Gather 1 fiber to offer forage.', 3); return; }
    const result = wildlife.feed(observation.id);
    if (result.accepted && !creative) loop.inventory.fiber = itemCount(loop.inventory, 'fiber') - 1;
    hud.flash(result.reason, 3);
    if (result.accepted) autosave?.markDirty();
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    syncDevice();
  });

  // --- grow the terrain around spawn before the splash lifts ---
  {
    const [ux0, uy0, uz0] = player.up();
    streamer.refreshDesired(ux0, uy0, uz0, 2);
    const total = Math.max(1, streamer.stats().queued);
    while (streamer.stats().queued > 0) {
      streamer.pump(24, 64);
      const left = streamer.stats().queued;
      splash(`growing terrain around spawn… ${total - left}/${total}`, 0.55 + 0.4 * (1 - left / total));
      await yieldFrame();
    }
  }
  farSphere.setResidentChunks(streamer.renderedKeys());
  streamer.residencyDirty = false;

  // --- tree + terrain cell targeting & chopping ---
  let chopTimer = 0;
  const aimAt = (dx: number, dy: number, dz: number): void => {
    const w = rig.world;
    const active = solarSystem.activePlanet;
    target = pickTree(geo, active.layers, active.columns, active.trees, w.x, w.y, w.z, dx, dy, dz, REACH + rig.dist);
    const cellHit = pick(geo, active.layers, active.columns, w.x, w.y, w.z, dx, dy, dz, REACH + rig.dist + 8);
    if (cellHit) {
      aimedTile = cellHit.hitTile;
      aimedLayer = cellHit.hitLayer;
    } else {
      aimedTile = target ? target.tile : player.tile;
      aimedLayer = active.columns.topLayerOf(aimedTile);
    }
  };
  const rayV = new THREE.Vector3();
  const aimAtScreen = (x: number, y: number): void => {
    rayV.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5).unproject(camera).normalize();
    aimAt(rayV.x, rayV.y, rayV.z);
  };
  const chop = (): void => {
    const hasSpear = itemCount(loop.inventory, 'spear') > 0;
    const huntDmg = hasSpear ? 2 : 1;
    const huntRes = wildlife.strikeNearest(player.px, player.py, player.pz, rig.dir.x, rig.dir.y, rig.dir.z, huntDmg, 7.8);
    if (huntRes.hit && huntRes.creature) {
      loop.pose('chop', hasSpear ? 'spear' : 'hands', CHOP_COOLDOWN + 0.25);
      audio.playEvent('gatherSoft');
      chopTimer = CHOP_COOLDOWN;
      if (huntRes.killed) {
        for (const d of huntRes.drops) {
          loop.inventory[d.item] = (loop.inventory[d.item] ?? 0) + d.count;
        }
        const label = huntRes.creature.speciesName;
        hud.flash(`hunted ${label} · +2 raw meat, +hide & +bone (roast at a Campfire)`, 3.2);
        autosave?.markDirty();
      } else {
        const label = huntRes.creature.speciesName;
        hud.flash(`struck ${label} (${huntRes.creature.hp}/${huntRes.creature.maxHp} HP)`, 1.6);
      }
      return;
    }
    if (target && loop.strikeTree(target.tile)) {
      chopTimer = CHOP_COOLDOWN;
    }
  };

  const cycleStructure = (dir: 1 | -1): void => {
    const idx = STRUCTURE_KINDS.indexOf(loop.selectedStructureKind);
    const next = (idx + dir + STRUCTURE_KINDS.length) % STRUCTURE_KINDS.length;
    loop.selectedStructureKind = STRUCTURE_KINDS[next]!;
    showBuildPreview = true;
    const def = STRUCTURE_DEFS[loop.selectedStructureKind];
    hud.flash(`blueprint: ${def.name} · press Q to build (R rotates)`, 2.4);
    refreshCrafting();
  };

  const handleVerbs = (intent: FrameIntent): void => {
    if (solarSystem.travelState.pending) {
      if (intent.closePanel) solarSystem.cancelTravel();
      if (intent.diag) showDiag = !showDiag;
      return;
    }
    const panelWasOpen = craftingOpen || hud.isMenuOpen();
    if (intent.mute) hud.flash(audio.toggleMuted() ? 'sound muted' : 'sound on', 1.8);
    if (intent.diag) showDiag = !showDiag;
    if (intent.help) hud.toggleHelp();
    if (intent.closePanel || (craftingOpen && intent.toggleCrafting)) {
      if (craftingOpen) toggleCrafting();
      hud.setMenuOpen(false);
    } else if (intent.toggleCrafting) {
      toggleCrafting();
    }
    if (craftingOpen && intent.confirmCraft && loop.craft('plane_frame')) refreshCrafting();
    if (panelWasOpen || craftingOpen || hud.isMenuOpen()) return;
    if (intent.plane) loop.planeButton();
    if (intent.toggleFly && creative) {
      player.toggleFly();
      hud.flash(player.mode === 'fly' ? 'free-flight' : 'walk mode', 2);
    }
    if (intent.cycleStructurePrev) cycleStructure(-1);
    if (intent.cycleStructureNext) cycleStructure(1);
    if (intent.rotateStructure) {
      loop.placementYaw = (loop.placementYaw + Math.PI / 3) % (Math.PI * 2);
      showBuildPreview = true;
      hud.flash(`rotated ${STRUCTURE_DEFS[loop.selectedStructureKind].shortName} (${Math.round((loop.placementYaw * 180) / Math.PI)}°)`, 1.6);
    }
    if (intent.placeStructure) {
      buildSelectedStructureNow();
    }
    if (intent.mineCell) {
      const tile = aimedTile ?? player.tile;
      const layer = aimedLayer ?? solarSystem.activePlanet.columns.topLayerOf(tile);
      loop.mineCell(tile, layer);
    }
    if (intent.deployEcoPod) {
      if (loop.deployEcoPod(aimedTile ?? player.tile)) {
        mpClient?.sendMutation({ type: 'eco_seed', planetId: solarSystem.activePlanet.config.id, tile: aimedTile ?? player.tile });
      }
    }
    if (intent.eatFood && player.mode === 'walk') {
      loop.consumeFood();
    }
    if (intent.warpPlanetIndex >= 0 && intent.warpPlanetIndex < solarSystem.planets.length) {
      const targetPlanet = solarSystem.planets[intent.warpPlanetIndex]!;
      triggerPlanetWarp(targetPlanet.config.id);
    }
  };

  const updateTargeting = (intent: FrameIntent, dt: number): void => {
    if (solarSystem.travelState.pending) { target = null; highlight.hide(); return; }
    const active = solarSystem.activePlanet;
    const canAim = intent.aiming && rig.dist < AIM_MAX_CAM_DIST && player.mode !== 'plane';
    if (canAim && !controls.touch.enabled) aimAt(rig.dir.x, rig.dir.y, rig.dir.z);
    else if (!canAim) {
      target = null;
      aimedTile = player.tile;
      aimedLayer = active.columns.topLayerOf(player.tile);
    }
    if (canAim && controls.touch.enabled) {
      for (const tap of intent.chopTaps) {
        aimAtScreen(tap.x, tap.y);
        chop();
      }
      target = null;
    }
    chopTimer -= dt;
    if (intent.chop || (intent.chopHeld && chopTimer <= 0)) chop();
    if (target) {
      highlight.show(geo, target.tile, active.layers.topRadius(active.columns.topLayerOf(target.tile)) + 0.03, rig.world);
    } else if (showBuildPreview && aimedTile !== null) {
      highlight.show(geo, aimedTile, active.layers.topRadius(active.columns.topLayerOf(aimedTile)) + 0.03, rig.world);
    } else {
      highlight.hide();
    }
  };

  // Surface material lookup across all 6 worlds for background out-of-core extractors
  const surfaceMatLookup = (planetId: string, tile: number) => {
    const p = solarSystem.planetById.get(planetId);
    if (!p) return 2;
    return p.columns.materialAt(tile, p.columns.topLayerOf(tile));
  };

  // --- HUD ---
  let showDiag = params.get('debug') === '1';
  let hudTimer = 0;
  const updateHud = (): void => {
    const active = solarSystem.activePlanet;
    const up = player.up();
    {
      for (const site of sites) {
        const distance = active.config.radius * Math.acos(THREE.MathUtils.clamp(up[0]*site.direction[0]+up[1]*site.direction[1]+up[2]*site.direction[2],-1,1));
        if (distance < 38 && !visitedSites.has(site.id)) {
          visitedSites.add(site.id); autosave?.markDirty();
          hud.flash(`Discovered ${site.name}`, 3);
        }
      }
    }
    hud.setEcology({ world: active.config.name, description: active.config.subtitle,
      region: active.terrain.aurelia?.biomeAt(...up) ?? active.terrain.expeditionWorld?.biomeAt(...up) ?? active.config.archetype,
      sites: sites.map(site => ({ ...site, visited: visitedSites.has(site.id) })),
      observation: wildlife.nearbyObservation(player), observedCount: wildlife.stats().observed });
    const agl = player.altitudeAGL();
    const speed = Math.hypot(player.vx, player.vy, player.vz);
    const grid = structureStore.analyzePlanetGrid(geo, active.config);
    const shieldPct = Math.round(player.suitShield);
    const hpPct = Math.round(player.health);
    const hungerPct = Math.round(player.hunger);
    const wonder = active.columns.pentagonWonderOf(player.tile);

    hud.setVitalsStatus({
      fps: stats.fpsEma,
      planetName: active.config.name,
      healthPct: hpPct,
      hungerPct: hungerPct,
      shieldPct: shieldPct,
      isRegenerating: hungerPct >= 70 || player.inSafeAura,
      inSafeAura: player.inSafeAura,
      coopCount: mpClient?.connected ? mpClient.peers.size + 1 : undefined,
    });

    const routes: Record<PlanetConfig['archetype'], [string, string]> = {
      terran: ['Follow the shoreline', 'Look for a clearing where forest meets water. Gather timber along the way if you want to build a skiff.'],
      canyon: ['Read the layers of the canyon', 'Follow a terrace, look for a way down, and compare the sheltered ground with the exposed ridges.'],
      volcanic: ['Find a path through the basalt', 'Watch your suit and keep a return route in mind as you approach the molten lowlands.'],
      cryo: ['Cross the frozen ridges', 'Study the ice from a high point before choosing a descent. Shelter gives your suit time to recover.'],
      biolum: ['Walk among the luminous groves', 'Follow the light from the water toward the fungal growth. Look at how the world changes beneath its canopy.'],
      shattered: ['Read the impact basins', 'Follow the low crater rims toward crystal seams. The exposed ridges open onto a star-filled sky.'],
    };
    let [routeTitle, routeDescription] = routes[active.config.archetype];
    const destination = sites.find(s => s.id === courseSiteId);
    if (destination) {
      const dot = up[0]*destination.direction[0]+up[1]*destination.direction[1]+up[2]*destination.direction[2];
      const distance = active.config.radius*Math.acos(THREE.MathUtils.clamp(dot,-1,1));
      const east = [player.fwdY*up[2]-player.fwdZ*up[1], player.fwdZ*up[0]-player.fwdX*up[2], player.fwdX*up[1]-player.fwdY*up[0]];
      const bearing = Math.atan2(east[0]*destination.direction[0]+east[1]*destination.direction[1]+east[2]*destination.direction[2],player.fwdX*destination.direction[0]+player.fwdY*destination.direction[1]+player.fwdZ*destination.direction[2])*180/Math.PI;
      const heading = Math.abs(bearing)<12 ? 'Ahead' : `${Math.round(Math.abs(bearing))}° ${bearing>0?'right':'left'}`;
      routeTitle = distance < 38 ? `Arrived at ${destination.name}` : `${destination.name} · ${Math.round(distance)} m · ${heading}`;
      routeDescription = `${heading} · ${destination.description}`;
    }
    hud.setObjective({
      stageLabel: 'Field note',
      title: wonder.ringLevel >= 0 ? 'A five-sided landmark' : routeTitle,
      description: wonder.ringLevel >= 0 ? 'You are near one of this world’s twelve pentagonal formations. Explore the terraces around it.' : routeDescription,
      steps: [
        { label: loop.planeCrafted ? `${player.hasOrbitalThruster ? 'Starfarer' : 'Skiff'} packed. Board when you want another perspective.` : `Optional: gather ${PLANE_WOOD_COST} timber for a skiff (${loop.wood} packed).`, done: loop.planeCrafted },
        { label: creative ? 'All gear supplied. Field guide → Worlds offers free travel.' : 'Workbench → Furnace → 2 iron ingots → Starfarer. Board with E and climb into orbit.', done: player.hasOrbitalThruster },
      ],
    });

    const navTargets = solarSystem.navTelemetry(player);
    const hazardLabel =
      active.config.survival.hazard === 'none'
        ? 'Atmosphere Breathable'
        : `Hazard: ${active.config.survival.hazard.toUpperCase()} (${player.inSafeAura ? 'WARM/SHIELDED' : `${shieldPct}%`})`;
    const wonderLabel = wonder.ringLevel >= 0 ? ` · ★ Pentagon Ruin #${wonder.pentagonId + 1}` : '';
    hud.setPlanetBar(
      navTargets,
      `${courseId ? `Course: ${solarSystem.planetById.get(courseId)?.config.name} · ` : ''}${active.config.subtitle} · ${hazardLabel} · ${grid.structureCount} station${grid.structureCount === 1 ? '' : 's'}${wonderLabel}`,
    );

    const selDef = STRUCTURE_DEFS[loop.selectedStructureKind];
    const costStr = (Object.entries(selDef.cost) as [ItemId, number][])
      .map(([k, n]) => `${itemCount(loop.inventory, k)}/${n} ${ITEM_DEFS[k].name.toLowerCase()}`)
      .join(' · ');
    hud.setBuildStrip(showBuildPreview
      ? `${selDef.shortName} · ${costStr} · Q / tap to place · R rotate`
      : target ? `${device === 'touch' ? 'Tap' : device === 'gamepad' ? 'X' : 'LMB'} Gather timber · ${craftKeyLabel(device)} Satchel`
        : `${craftKeyLabel(device)} Satchel · ${device === 'keyboard' ? 'M Field guide' : 'Field guide for destinations'}`, showBuildPreview);

    hud.setFlight(
      player.inSpaceCruise
        ? `🚀 INTERPLANETARY CRUISE · ${speed.toFixed(0)} m/s · ${(agl / 1000).toFixed(2)} km AGL (aim at a planet)`
        : player.mode === 'plane'
          ? `${player.hasOrbitalThruster ? 'Starfarer' : 'Skiff'} · ${speed.toFixed(0)} m/s · ${agl.toFixed(0)} m AGL · ${player.hasOrbitalThruster ? `climb above ${active.config.karmanAGL} m for orbit` : 'atmospheric flight; upgrade for orbit'}`
          : player.mode === 'fly'
            ? `fly · ${agl.toFixed(0)} m`
            : null,
    );

    const slots: { name: string; css: string; count: number; goal?: string }[] = [
      {
        name: 'Wood',
        css: ITEM_DEFS.wood.css,
        count: loop.wood,
        goal: loop.planeCrafted ? undefined : `${loop.wood}/${PLANE_WOOD_COST}`,
      },
      ...(loop.planeCrafted ? [{ name: player.hasOrbitalThruster ? 'Starfarer' : 'Skiff', css: ITEM_DEFS[player.hasOrbitalThruster ? 'orbital_thruster' : 'planeFrame'].css, count: 1 }] : []),
    ];
    for (const id of ALL_ITEM_IDS) {
      if (id === 'wood' || id === 'planeFrame' || (id === 'orbital_thruster' && loop.planeCrafted)) continue;
      const cnt = itemCount(loop.inventory, id);
      if (cnt > 0) {
        slots.push({
          name: ITEM_DEFS[id].name.split(' ')[0] ?? ITEM_DEFS[id].name,
          css: ITEM_DEFS[id].css,
          count: cnt,
        });
      }
    }
    hud.setInventory(slots);

    refreshCrafting();
    controls.touch.setPlaneButton(
      player.mode === 'plane' ? 'flying' : loop.planeCrafted ? 'fly' : loop.wood > 0 ? 'craft' : 'hidden',
      !loop.planeCrafted && player.mode !== 'plane' ? `${Math.min(loop.wood, PLANE_WOOD_COST)}/${PLANE_WOOD_COST}` : '',
    );
    controls.touch.setDownVisible(player.mode !== 'walk');
    if (!showDiag) {
      hud.setDiag(null);
      return;
    }
    const s = streamer.stats();
    const timings = stats.snapshot();
    hud.setDiag([
      `${isWebGPU ? 'WebGPU' : 'WebGL2'} · ${stats.frameMsEma.toFixed(1)} ms · seed ${SEED} · planet ${active.config.id}`,
      `frame p95 ${timings.frameMs.p95.toFixed(1)} / p99 ${timings.frameMs.p99.toFixed(1)} / max ${timings.frameMs.max.toFixed(1)} ms · >50 ms ${timings.frameMs.over50}/${timings.frameMs.count}`,
      `CPU stream p95 ${timings.cpuMs.streaming?.p95.toFixed(1) ?? '0'} · render submit ${timings.cpuMs.renderSubmit?.p95.toFixed(1) ?? '0'} ms · draws ${renderStats.snapshot().drawCalls}`,
      `mode ${player.mode}${player.inSpaceCruise ? ' (orbital cruise)' : player.submerged > 0.4 ? ' (swimming)' : player.grounded ? ' (grounded)' : ''} · ${speed.toFixed(1)} m/s`,
      player.mode === 'plane' ? `throttle ${player.throttle.toFixed(0)} · holding ${player.holdAGL.toFixed(0)} m` : '',
      `alt ${agl.toFixed(1)} AGL · h ${(player.radius() - active.config.radius).toFixed(1)} · zoom ${rig.dist.toFixed(0)}`,
      `tile ${player.tile}${geo.degreeOf(player.tile) === 5 ? ' *pentagon*' : ''}${wonder.ringLevel >= 0 ? ` (wonder #${wonder.pentagonId + 1})` : ''} · GP(${M},0)`,
      `chunks ${s.resident} res / ${s.queued} q · ${(s.triangles / 1000).toFixed(0)}k tris · structures ${structureStore.byId.size}`,
      `wood ${loop.wood} · drops ${loop.drops.length} · trees felled ${active.trees.chopped.size}`,
    ].filter((l) => l !== ''));
  };

  const nearestTree = (): { tile: number; distance: number; bearing: number } | null => {
    const activeTrees = solarSystem.activePlanet.trees;
    const seen = new Set<number>([player.tile]);
    let ring = [player.tile];
    for (let r = 0; r <= 6 && ring.length > 0; r++) {
      let best: { tile: number; distance: number; bearing: number } | null = null;
      for (const tile of ring) {
        if (!activeTrees.hasTree(tile)) continue;
        const c = geo.centers;
        const R = player.radius();
        const vx = c[tile * 3] * R - player.px, vy = c[tile * 3 + 1] * R - player.py, vz = c[tile * 3 + 2] * R - player.pz;
        const [ux0, uy0, uz0] = player.up();
        const sx = uy0 * player.fwdZ - uz0 * player.fwdY, sy = uz0 * player.fwdX - ux0 * player.fwdZ, sz = ux0 * player.fwdY - uy0 * player.fwdX;
        const distance = Math.hypot(vx, vy, vz);
        if (!best || distance < best.distance) {
          best = { tile, distance, bearing: Math.atan2(vx * sx + vy * sy + vz * sz, vx * player.fwdX + vy * player.fwdY + vz * player.fwdZ) };
        }
      }
      if (best) return { tile: best.tile, distance: Math.round(best.distance * 10) / 10, bearing: Math.round(best.bearing * 1000) / 1000 };
      const next: number[] = [];
      for (const tile of ring) {
        for (let k = 0; k < geo.degreeOf(tile); k++) {
          const n = geo.neighbor(tile, k);
          if (!seen.has(n)) { seen.add(n); next.push(n); }
        }
      }
      ring = next;
    }
    return null;
  };

  // Read-only state for automated playtests (Playwright etc.)
  (window as unknown as { render_game_to_text: () => string }).render_game_to_text = () => {
    const active = solarSystem.activePlanet;
    return JSON.stringify({
      mode: player.mode,
      gameMode,
      activePlanet: active.config.id,
      activePlanetName: active.config.name,
      inSpaceCruise: player.inSpaceCruise,
      health: Math.round(player.health),
      hunger: Math.round(player.hunger),
      suitShield: Math.round(player.suitShield),
      tile: player.tile,
      altitudeAGL: Math.round(player.altitudeAGL() * 10) / 10,
      speed: Math.round(Math.hypot(player.vx, player.vy, player.vz) * 10) / 10,
      inventory: { ...loop.inventory },
      planeCrafted: loop.planeCrafted,
      selectedStructure: loop.selectedStructureKind,
      structuresCount: structureStore.byId.size,
      wildlifeCount: wildlife.population.active.length,
      fauna: wildlife.stats(),
      appearance: character.getAppearance(),
      journal: [...visitedSites],
      fallingTreesCount: fallingTrees.active.length,
      drops: loop.drops.length,
      target: target ? { tile: target.tile, damage: active.trees.damageOf(target.tile) } : null,
      nearestTree: nearestTree(),
      pitch: Math.round(player.pitch * 1000) / 1000,
      treesFelled: active.trees.chopped.size,
      craftingOpen,
      camDist: Math.round(rig.dist * 10) / 10,
      solarSystemPlanets: solarSystem.planets.map((p) => p.config.id),
      multiplayerRoom: ROOM_ID ?? null,
      renderer: isWebGPU ? 'webgpu' : 'webgl2',
      recipe: active.config.expeditionRecipe ?? 'legacy',
      character: character.stats(),
      footIk: footIk?.stats(),
      habitat: habitat?.stats(),
      travel: solarSystem.travelState,
      drawingPipeline: 'standard',
      surfaceRepresentation: streamer.detailedRendering ? 'detailed' : 'orbital',
      performance: { ...stats.snapshot(), autosave: autosave?.timings(), streaming: streamer.stats(), ...renderStats.snapshot() },
    });
  };

  (window as unknown as { __game: unknown }).__game = {
    player,
    loop,
    solarSystem,
    rig,
    structureStore,
    get wildlife() { return wildlife; },
    faunaByPlanet,
    gameMode,
    get sites() { return sites; },
    allSites,
    sitesByPlanet,
    expedition,
    triggerPlanetWarp,
    waterfalls,
    fallingTrees,
    controls,
    hud,
    streamer,
    geo,
    character,
    footIk,
    get habitat() { return habitat; },
    vegetationByPlanet,
    renderer,
    scene,
  };

  // --- frame loop ---
  let last = performance.now();
  let streamTimer = 0;
  let lastFarRefresh = 0;
  let maskedReleaseCount = streamer.releases;
  let simulationTime = 0;
  let reportedTravelError: string | null = null;
  const camVec = new THREE.Vector3();

  // Compile the actual starting view while the splash is still visible. Compute
  // precompilation alone does not prepare terrain, water, sky or character shaders.
  rig.snapTo(player);
  rig.update(0, player, 0, false);
  const origin = rig.world;
  const initialViewDistance = Math.max(rig.dist, Math.hypot(origin.x, origin.y, origin.z) - solarSystem.activePlanet.config.radius);
  if (streamer.updateRenderDistance(initialViewDistance)) {
    farSphere.setResidentChunks(streamer.renderedKeys());
    streamer.residencyDirty = false;
  }
  water.setViewDistance(initialViewDistance);
  streamer.updateTransforms(origin.x, origin.y, origin.z);
  farSphere.mesh.position.set(-origin.x, -origin.y, -origin.z);
  water.position.set(-origin.x, -origin.y, -origin.z);
  terrainMaterial.setCameraOrigin(origin.x, origin.y, origin.z);
  sky.update(origin.x, origin.y, origin.z, camera);
  solarSystem.update(player, origin.x, origin.y, origin.z);
  lighting.update(player, origin, player.altitudeAGL(), rig.dist);
  habitat.update(0, 0, player, origin, streamer.detailedRendering);
  while (habitat.stats().pending) {
    await yieldFrame();
    habitat.update(0, 0, player, origin, streamer.detailedRendering);
  }
  wildlife.update(0, 0, player, origin, streamer.detailedRendering);
  character.update(player, origin, rig.dist, 0, loop.characterVisualState());
  updateHud();
  splash('preparing the view…', 0.97);
  await yieldFrame();
  const restoreVegetation = [...vegetationByPlanet.values()].map(vegetation => vegetation.prepareWarmup());
  const restoreFauna = wildlife.prepareWarmup();
  const restoreEffects = gpuEffects.prepareWarmup();
  const restoreSky = sky.prepareWarmup();
  const waterWasVisible = water.visible;
  const waterWasCulled = water.frustumCulled;
  water.visible = true;
  water.frustumCulled = false;
  try { await character.warmup(renderer, scene, camera); }
  finally {
    for (const restore of restoreVegetation) restore();
    restoreFauna(); restoreEffects(); restoreSky();
    water.visible = waterWasVisible; water.frustumCulled = waterWasCulled;
  }
  // Warmup already compiled this scene. Recompiling after its covered render
  // would copy viewport depth from the default framebuffer on the GL backend.
  renderer.render(scene, camera);
  renderStats.capture(renderer.info);
  hideSplash();
  hud.flash(openingHint(device, !!save), 8);
  last = performance.now();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    // A background playtest tab should not consume a second game's GPU budget.
    if (document.hidden) { last = now; return; }
    const dtMs = now - last;
    last = now;
    const dt = Math.min(0.05, dtMs / 1000);
    const timeSec = now / 1000;
    stats.begin(now);

    const intent = controls.read(dt, craftingOpen || hud.isMenuOpen() || solarSystem.travelState.pending);
    handleVerbs(intent);
    const simDt = solarSystem.travelState.pending || (!mpClient && (craftingOpen || hud.isMenuOpen())) ? 0 : dt;
    simulationTime += simDt;
    const transit = solarSystem.travelState;
    hud.setTravelStatus(transit.pending ? solarSystem.planetById.get(transit.targetId!)?.config.name ?? 'another world' : null, transit.progress);
    if (transit.error && transit.error !== reportedTravelError) hud.flash('Passage could not be prepared. Choose the destination again to retry.', 5);
    reportedTravelError = transit.error;
    const notice = controls.gamepad.consumeNotice();
    if (notice) hud.flash(notice === 'gamepad disconnected' ? notice : 'gamepad ready', 2.4);

    if (intent.aiming && !transit.pending) player.applyLook(intent.lookX, intent.lookY);
    player.update(simDt, {
      forward: intent.forward,
      strafe: intent.strafe,
      upDown: player.mode !== 'walk' ? (intent.jump ? 1 : 0) - (intent.down ? 1 : 0) : 0,
      sprint: intent.sprint,
      jump: intent.jump,
      swimUp: intent.jump,
    });
    if (player.planeStowed) hud.flash(player.submerged > 0.2 ? 'splashdown' : 'touched down', 2);
    rig.update(dt, player, intent.wheel, intent.wheelTouched);

    // Check interplanetary Sphere of Influence (SOI) handoff & update distant planet impostors
    const w = rig.world;
    solarSystem.update(player, w.x, w.y, w.z);
    const active = solarSystem.activePlanet;
    stats.mark('playerAndTravel');

    // Streaming: refresh the wanted set a few times a second, build within budget
    streamTimer -= dt;
    if (streamTimer <= 0) {
      streamTimer = 0.18;
      streamer.refreshDesired(...player.up(), player.altitudeAGL());
    }
    const surfaceViewDistance = Math.max(rig.dist, Math.hypot(w.x, w.y, w.z) - active.config.radius);
    const surfaceOwnershipChanged = streamer.updateRenderDistance(surfaceViewDistance);
    streamer.pump();
    water.setViewDistance(surfaceViewDistance);
    // An added chunk can overlap the sunk proxy briefly. A released chunk must
    // restore its far coverage before this draw, or rapid travel exposes a hole.
    if (surfaceOwnershipChanged || (streamer.residencyDirty && (streamer.releases !== maskedReleaseCount || now - lastFarRefresh > 250))) {
      farSphere.setResidentChunks(streamer.renderedKeys());
      streamer.residencyDirty = false;
      lastFarRefresh = now;
      maskedReleaseCount = streamer.releases;
    }
    stats.mark('streaming');

    // Camera-relative transforms (floating origin: camera stays at 0,0,0)
    streamer.updateTransforms(w.x, w.y, w.z);
    farSphere.mesh.position.set(-w.x, -w.y, -w.z);
    water.position.set(-w.x, -w.y, -w.z);
    terrainMaterial.setCameraOrigin(w.x, w.y, w.z);
    sky.update(w.x, w.y, w.z, camera);
    lighting.update(player, w, player.altitudeAGL(), rig.dist);

    // Out-of-core background automation tick across all 6 planets + active planet structure meshes
    structureStore.tickAutomation(simDt, geo, planetConfigMap, surfaceMatLookup);
    const activeStructures = structureStore.list(active.config.id);
    const activeGrid = structureStore.analyzePlanetGrid(geo, active.config);
    structureRenderer.update(geo, activeStructures, activeGrid.links, w.x, w.y, w.z, timeSec);

    if (showBuildPreview) {
      const previewTile = aimedTile ?? player.tile;
      const previewR = active.layers.topRadius(active.columns.groundLayerBelow(previewTile, active.layers.bounds[0]));
      structureRenderer.updatePreview(
        geo,
        loop.selectedStructureKind,
        previewTile,
        0,
        0,
        previewR,
        loop.placementYaw,
        w.x,
        w.y,
        w.z,
      );
    } else {
      structureRenderer.updatePreview(geo, null, 0, 0, 0, 0, 0, w.x, w.y, w.z);
    }

    // WebGPU Compute shaders (Keplerian asteroid ring belt & spherical weather)
    gpuEffects.update(renderer, w.x, w.y, w.z, player.px, player.py, player.pz);

    // Multiplayer sync & remote co-op avatar rendering
    if (mpClient) {
      mpClient.tick(dt, {
        planetId: active.config.id,
        px: player.px,
        py: player.py,
        pz: player.pz,
        vx: player.vx,
        vy: player.vy,
        vz: player.vz,
        fwdX: player.fwdX,
        fwdY: player.fwdY,
        fwdZ: player.fwdZ,
        mode: player.mode,
        bank: player.bank,
        updatedAt: now,
      });
      camVec.set(w.x, w.y, w.z);
      remotePlayerRenderer.update(mpClient.getInterpolatedPeers(now), active.config.id, camVec, dt, timeSec);
    }
    stats.mark('sceneAndStructures');

    loop.tickDrops(simDt);
    fallingTrees.update(simDt, w.x, w.y, w.z);
    waterfalls.update(simDt, geo, active.layers, active.columns, player, w.x, w.y, w.z);
    const animalDamage = wildlife.update(simDt, simulationTime, player, w, streamer.detailedRendering);
    if (animalDamage > 0 && !creative) {
      player.takeDamage(animalDamage);
      audio.playEvent('uiDeny');
      hud.flash(`Duskprowler bite · ${animalDamage} health. Keep your distance or retreat to camp.`, 2.4);
    }
    stats.mark('worldActors');
    character.update(player, w, rig.dist, simDt, loop.characterVisualState());
    stats.mark('characterAndIk');
    habitat.update(simDt, simulationTime, player, w, streamer.detailedRendering);
    stats.mark('habitat');
    dropRenderer.update(loop.drops, geo, active.layers, active.columns, w, timeSec);
    stats.mark('resourceDrops');
    updateTargeting(intent, dt);
    autosave!.tick(dt);

    stats.frame(dtMs);
    hud.tick(dt);
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.25;
      syncDevice();
      updateHud();
    }
    stats.mark('interactionAndHud');
    renderer.render(scene, camera);
    renderStats.capture(renderer.info);
    stats.mark('renderSubmit');
  });
}

boot().catch((err) => {
  console.error(err);
  splash(`boot failed: ${err}`, 0);
});
