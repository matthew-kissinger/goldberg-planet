/**
 * Goldberg Planet — Multi-Planet Survival, Automation & Interplanetary Sandbox.
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
import { ResourceDropRenderer } from './render/resourceDrops';
import { buildOcean } from './render/ocean';
import { addStars } from './render/stars';
import { TileHighlight } from './render/tileHighlight';
import { createTerrainMaterial } from './render/terrainMaterial';
import { GpuPlanetEffects } from './render/gpuComputeParticles';
import { StructureRenderer } from './render/structures';
import { RemotePlayerRenderer } from './render/remotePlayers';
import { FallingTreeRenderer } from './render/fallingTrees';
import { WildlifeManager } from './render/wildlife';
import { WaterfallRenderer } from './render/waterfalls';
import { Player } from './player/player';
import { UxManager } from './player/ux';
import { FrameStats } from './demo/frameStats';
import { Hud, splash, hideSplash, type StructureBlueprintView } from './demo/hud';
import { GameAudio } from './audio/gameAudio';
import {
  applyChoppedTrees,
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
const saveKey = saveSlotKey(SEED, M);
const saveEnabled = params.get('nosave') !== '1';
if (params.get('reset') === '1') clearStoredWorldSave(saveKey);

const ALL_ITEM_IDS = Object.keys(ITEM_DEFS) as ItemId[];

function yieldFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function createRenderer(coarsePointer: boolean): Promise<THREE.WebGPURenderer> {
  let renderer: THREE.WebGPURenderer;
  try {
    renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.get('gpu') === 'gl' });
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
  const isWebGPU = !!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060c);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 48000);
  const sun = new THREE.DirectionalLight(0xfff2e0, 3.0);
  const sunTarget = new THREE.Object3D();
  sun.target = sunTarget;
  scene.add(sun, sunTarget, new THREE.HemisphereLight(0x8fb4dd, 0x2c2418, 0.5), new THREE.AmbientLight(0x404a58, 0.35));

  splash('forging 6-world solar system…', 0.22);
  await yieldFrame();
  const impostorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.04 });
  const solarSystem = new SolarSystem(SEED, geo, scene, impostorMat);
  const structureStore = new StructureStore();

  const planetConfigMap = new Map<string, PlanetConfig>();
  for (const p of solarSystem.planets) {
    planetConfigMap.set(p.config.id, p.config);
  }

  // Restore saved solar-system state across all 6 worlds
  const save = saveEnabled ? loadStoredWorldSave(saveKey, SEED, M) : null;
  if (save) {
    if (save.structures) structureStore.importAll(save.structures);
    if (save.planetDeltas) {
      for (const p of solarSystem.planets) {
        const delta = save.planetDeltas[p.config.id];
        if (!delta) continue;
        applyChoppedTrees(p.trees, delta.choppedTrees, geo.count);
        applyTreeChopProgress(p.trees, delta.treeChopProgress, geo.count);
        if (delta.columnEdits?.length) p.columns.importEdits(delta.columnEdits);
        if (delta.seededEcoTiles?.length) {
          for (const t of delta.seededEcoTiles) p.columns.seededEcoTiles.add(t);
        }
        if (delta.drops?.length) p.drops = normalizeResourceDrops(delta.drops, geo.count);
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
  const terrainMaterial = createTerrainMaterial(startPlanet.config);
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
  addStars(scene);
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
  if (save?.activePlanetId && save.activePlanetId !== solarSystem.activePlanet.config.id) {
    solarSystem.warpToPlanet(save.activePlanetId, player, 0, false);
  }
  if (!save || !applyPlayerSave(player, save.player, geo.count)) {
    player.spawnAt(findSpawnTile(geo, solarSystem.activePlanet.columns, solarSystem.activePlanet.trees));
  }

  const controls = new Controls(renderer.domElement, app, params.get('touch') === '1');
  const ux = new UxManager();
  const hud = new Hud();
  const audio = new GameAudio();
  if (params.get('mute') === '1') audio.setMuted(true);
  const character = new Character(scene);
  const dropRenderer = new ResourceDropRenderer(scene);
  const structureRenderer = new StructureRenderer(scene);
  const fallingTrees = new FallingTreeRenderer(scene);
  const wildlife = new WildlifeManager(scene);
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
      roomId: ROOM_ID,
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

  // Keep `CoreLoop`, `CameraRig`, `WildlifeManager`, and `FarSphere` synchronized whenever the active planet changes
  solarSystem.onPlanetChange((nextPlanet) => {
    loop.rebindPlanet(nextPlanet.layers, nextPlanet.columns, nextPlanet.trees, nextPlanet.drops);
    rig.rebindPlanet(nextPlanet.layers, nextPlanet.columns);
    wildlife.clear();
    farSphere.setResidentChunks(streamer.residentKeys());
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
    });
  }, !save);

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
      const canBuild = structureStore.canAfford(kind, loop.inventory);
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
    craftingOpen = !craftingOpen;
    refreshCrafting();
    audio.playEvent(craftingOpen ? 'uiOpen' : 'uiConfirm');
  };
  controls.input.setWorldInputBlocked(() => craftingOpen);
  hud.onCraftSelect = (id) => {
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
    const tile = aimedTile ?? player.tile;
    const targetPlanet = loop.selectedStructureKind === 'mass_driver' ? defaultMassDriverTargetId() : undefined;
    if (loop.placeStructure(loop.selectedStructureKind, tile, undefined, undefined, loop.placementYaw, targetPlanet)) {
      refreshCrafting();
    }
  };

  hud.onStructureSelect = (kind) => {
    loop.selectedStructureKind = kind;
    showBuildPreview = true;
    buildSelectedStructureNow();
    refreshCrafting();
  };

  hud.onBuildStripClick = () => {
    buildSelectedStructureNow();
  };

  const triggerPlanetWarp = (planetId: string): void => {
    if (planetId === solarSystem.activePlanet.config.id) {
      hud.flash(`already on ${solarSystem.activePlanet.config.name}`, 1.8);
      return;
    }
    solarSystem.activePlanet.drops = loop.drops;
    if (solarSystem.warpToPlanet(planetId, player, 0, loop.planeCrafted || player.mode !== 'walk')) {
      audio.playEvent('craftConfirm');
    }
  };

  hud.onPlanetSelect = (planetId) => {
    triggerPlanetWarp(planetId);
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
  farSphere.setResidentChunks(streamer.residentKeys());
  streamer.residencyDirty = false;
  hideSplash();
  hud.flash(openingHint(device, !!save), 9);

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
        hud.flash(`hunted ${label} · +2 raw venison, +hide & +bone! (build a Campfire to roast)`, 3.2);
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
    if (intent.closePanel || (craftingOpen && intent.toggleCrafting)) {
      if (craftingOpen) toggleCrafting();
    } else if (intent.toggleCrafting) {
      toggleCrafting();
    }
    if (intent.confirmCraft && loop.craft('plane_frame')) refreshCrafting();
    if (intent.plane) loop.planeButton();
    if (intent.toggleFly) {
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
    if (intent.mute) hud.flash(audio.toggleMuted() ? 'sound muted' : 'sound on', 1.8);
    if (intent.diag) showDiag = !showDiag;
    if (intent.help) hud.toggleHelp();
  };

  const updateTargeting = (intent: FrameIntent, dt: number): void => {
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

    const activeStructs = structureStore.list(active.config.id);
    const hasCampfire = activeStructs.some((s) => s.kind === 'campfire');
    const hasWorkbench = activeStructs.some((s) => s.kind === 'workbench');
    const hasFurnace = activeStructs.some((s) => s.kind === 'furnace');
    const hasTools = itemCount(loop.inventory, 'hatchet') > 0 || itemCount(loop.inventory, 'spear') > 0;
    const hasCooked = itemCount(loop.inventory, 'cooked_meat') > 0 || hungerPct >= 88;
    const hasStarship = itemCount(loop.inventory, 'orbital_thruster') > 0;

    if (!hasCampfire && !loop.planeCrafted) {
      hud.setObjective({
        stageLabel: 'Phase 1 / 4 · Wilderness Survival',
        title: 'Gather Timber, Hunt & Build Camp',
        description: 'Chop multi-tree groves (LMB), mine stone/flint (V), and build a Campfire on a flat hex plot.',
        steps: [
          { label: `Gather Wood (${loop.wood}/3) & Stone (${itemCount(loop.inventory, 'stone')}/2)`, done: loop.wood >= 3 && itemCount(loop.inventory, 'stone') >= 2 },
          { label: 'Forge Flint Hatchet or Hunting Spear [B]', done: hasTools },
          { label: 'Place Campfire on Hex Plot [Z/X + Q]', done: hasCampfire },
        ],
      });
    } else if (!loop.planeCrafted) {
      hud.setObjective({
        stageLabel: 'Phase 2 / 4 · Homestead & Sky-Hopper',
        title: 'Roast Venison & Craft Sky-Hopper Skiff',
        description: 'Roast meat at your Campfire and eat (C) for Well-Fed Health Regen, then build a Workbench.',
        steps: [
          { label: 'Roast Venison [B] & Eat [C] (Hunger ≥ 70%)', done: hasCooked },
          { label: 'Build Timber Workbench on Hex Plot [Q]', done: hasWorkbench },
          { label: `Craft Twin-Rotor Sky-Hopper (${loop.wood}/${PLANE_WOOD_COST} Wood) [B]`, done: loop.planeCrafted },
        ],
      });
    } else if (!hasStarship) {
      hud.setObjective({
        stageLabel: 'Phase 3 / 4 · Atmospheric Explorer',
        title: 'Explore Sky-Islands & Forge Starfarer',
        description: 'Press E to fly the Sky-Hopper to Floating Sky-Islands & Waterfalls, and smelt Iron for orbital flight.',
        steps: [
          { label: 'Fly Sky-Hopper Skiff [E] to Sky-Islands', done: player.mode === 'plane' || agl > 15 },
          { label: 'Build Stone Smelting Furnace [Z/X + Q]', done: hasFurnace },
          { label: 'Forge Starfarer Interplanetary Starship [B]', done: hasStarship },
        ],
      });
    } else {
      hud.setObjective({
        stageLabel: 'Phase 4 / 4 · Interplanetary Pioneer',
        title: 'Voyage Across the 6-World Solar System',
        description: 'Board your Starfarer Starship (E), climb >140m AGL into Space Cruise, or warp with [1–6].',
        steps: [
          { label: 'Starfarer Interplanetary Starship Ready', done: true },
          { label: 'Explore Floating Islands & Abyssal Caverns', done: active.config.id !== 'planet-0' || agl > 30 },
          { label: `Visit Off-World Planets [1–6] (${active.config.name})`, done: active.config.id !== 'planet-0' },
        ],
      });
    }

    const navTargets = solarSystem.navTelemetry(player);
    const hazardLabel =
      active.config.survival.hazard === 'none'
        ? 'Atmosphere Breathable'
        : `Hazard: ${active.config.survival.hazard.toUpperCase()} (${player.inSafeAura ? 'WARM/SHIELDED' : `${shieldPct}%`})`;
    const wonderLabel = wonder.ringLevel >= 0 ? ` · ★ Pentagon Ruin #${wonder.pentagonId + 1}` : '';
    hud.setPlanetBar(
      navTargets,
      `${active.config.subtitle} · ${hazardLabel} · ${grid.structureCount} station${grid.structureCount === 1 ? '' : 's'}${wonderLabel}`,
    );

    const selDef = STRUCTURE_DEFS[loop.selectedStructureKind];
    const costStr = (Object.entries(selDef.cost) as [ItemId, number][])
      .map(([k, n]) => `${itemCount(loop.inventory, k)}/${n} ${ITEM_DEFS[k].name.toLowerCase()}`)
      .join(' · ');
    hud.setBuildStrip(`[Z/X] ${selDef.shortName} (${costStr}) · [Q] Build · [V] Mine · [C] Eat Meat`);

    hud.setFlight(
      player.inSpaceCruise
        ? `🚀 INTERPLANETARY CRUISE · ${speed.toFixed(0)} m/s · ${(agl / 1000).toFixed(2)} km AGL (aim at a planet or press 1-6)`
        : player.mode === 'plane'
          ? `✈ ${speed.toFixed(0)} m/s · ${agl.toFixed(0)} m AGL (climb >${active.config.karmanAGL}m for orbit)`
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
      ...(loop.planeCrafted ? [{ name: 'Skiff', css: ITEM_DEFS.planeFrame.css, count: 1 }] : []),
    ];
    for (const id of ALL_ITEM_IDS) {
      if (id === 'wood' || id === 'planeFrame') continue;
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
    hud.setDiag([
      `${isWebGPU ? 'WebGPU' : 'WebGL2'} · ${stats.frameMsEma.toFixed(1)} ms · seed ${SEED} · planet ${active.config.id}`,
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
      wildlifeCount: wildlife.creatures.length,
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
    });
  };

  (window as unknown as { __game: unknown }).__game = {
    player,
    loop,
    solarSystem,
    rig,
    structureStore,
    wildlife,
    waterfalls,
    fallingTrees,
    controls,
    hud,
    streamer,
    geo,
  };

  // --- frame loop ---
  let last = performance.now();
  let streamTimer = 0;
  let lastFarRefresh = 0;
  const camVec = new THREE.Vector3();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dtMs = now - last;
    last = now;
    const dt = Math.min(0.05, dtMs / 1000);
    const timeSec = now / 1000;

    const intent = controls.read(dt, craftingOpen);
    handleVerbs(intent);
    const notice = controls.gamepad.consumeNotice();
    if (notice) hud.flash(notice === 'gamepad disconnected' ? notice : 'gamepad ready', 2.4);

    if (intent.aiming) player.applyLook(intent.lookX, intent.lookY);
    player.update(dt, {
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

    // Streaming: refresh the wanted set a few times a second, build within budget
    streamTimer -= dt;
    if (streamTimer <= 0) {
      streamTimer = 0.18;
      streamer.refreshDesired(...player.up(), player.altitudeAGL());
    }
    const built = streamer.pump();
    if (streamer.residencyDirty && built === 0 && now - lastFarRefresh > 250) {
      farSphere.setResidentChunks(streamer.residentKeys());
      streamer.residencyDirty = false;
      lastFarRefresh = now;
    }

    // Camera-relative transforms (floating origin: camera stays at 0,0,0)
    streamer.updateTransforms(w.x, w.y, w.z);
    farSphere.mesh.position.set(-w.x, -w.y, -w.z);
    water.position.set(-w.x, -w.y, -w.z);
    sky.update(w.x, w.y, w.z, camera);
    sun.position.set(SUN.x * 11000 - w.x, SUN.y * 11000 - w.y, SUN.z * 11000 - w.z);
    sunTarget.position.set(-w.x, -w.y, -w.z);

    // Out-of-core background automation tick across all 6 planets + active planet structure meshes
    structureStore.tickAutomation(dt, geo, planetConfigMap, surfaceMatLookup);
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

    loop.tickDrops(dt);
    fallingTrees.update(dt, w.x, w.y, w.z);
    waterfalls.update(dt, geo, active.layers, active.columns, player, w.x, w.y, w.z);
    const wildlifeStep = wildlife.update(dt, geo, active.layers, active.columns, player, w.x, w.y, w.z);
    if (wildlifeStep.playerDamage > 0) {
      player.takeDamage(wildlifeStep.playerDamage);
      audio.playEvent('uiDeny');
      hud.flash(`bitten by ${wildlifeStep.attackerName ?? 'predator'}! -${wildlifeStep.playerDamage} HP (eat roasted meat or rest by a Campfire)`, 2.4);
    }
    character.update(player, w, rig.dist, dt, loop.characterVisualState());
    dropRenderer.update(loop.drops, geo, active.layers, active.columns, w, timeSec);
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
    renderer.render(scene, camera);
  });
}

boot().catch((err) => {
  console.error(err);
  splash(`boot failed: ${err}`, 0);
});
