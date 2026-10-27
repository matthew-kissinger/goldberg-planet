/**
 * Goldberg Planet: walk a hex-tiled planet, chop trees for wood, craft a plane, fly it.
 * This file boots the world behind the splash, then runs the frame loop:
 * input -> player -> camera -> streaming -> chopping -> save -> HUD -> render.
 */

import * as THREE from 'three/webgpu';
import { Goldberg } from './geo/goldberg';
import { buildLayers, PLANET_RADIUS } from './world/layers';
import { Terrain } from './world/terrain';
import { Columns } from './world/columns';
import { Trees } from './world/trees';
import { Streamer } from './world/streamer';
import { pickTree, type TreePick } from './world/pick';
import { FarSphere } from './render/farsphere';
import { Sky } from './render/sky';
import { Character } from './render/character';
import { ResourceDropRenderer } from './render/resourceDrops';
import { buildOcean } from './render/ocean';
import { addStars } from './render/stars';
import { TileHighlight } from './render/tileHighlight';
import { Player } from './player/player';
import { UxManager } from './player/ux';
import { FrameStats } from './demo/frameStats';
import { Hud, splash, hideSplash } from './demo/hud';
import { GameAudio } from './audio/gameAudio';
import {
  applyChoppedTrees,
  applyPlayerSave,
  applyTreeChopProgress,
  captureWorldSave,
  clearStoredWorldSave,
  loadStoredWorldSave,
  saveSlotKey,
} from './sim/save';
import { ITEM_DEFS, PLANE_WOOD_COST, normalizeInventory } from './sim/crafting';
import { normalizeResourceDrops } from './sim/resourceDrops';
import { CameraRig } from './game/cameraRig';
import { Controls, type FrameIntent } from './game/controls';
import { CoreLoop, CHOP_COOLDOWN } from './game/coreLoop';
import { Autosave } from './game/autosave';
import { findSpawnTile } from './game/spawn';
import { craftKeyLabel, helpText, hintDevice, openingHint, type HintDevice } from './game/hints';

const params = new URLSearchParams(location.search);
const SEED = params.get('seed') ?? 'GP192-01';
const M = Number.parseInt(params.get('m') ?? '192', 10);
const COARSE_M = 96;
const SUN = new THREE.Vector3(0.62, 0.55, 0.56).normalize();
/** chop reach from the eye, metres */
const REACH = 9.5;
/** beyond this boom length the view is too far out to aim at trees */
const AIM_MAX_CAM_DIST = 120;
const saveKey = saveSlotKey(SEED, M);
const saveEnabled = params.get('nosave') !== '1';
if (params.get('reset') === '1') clearStoredWorldSave(saveKey);

// boot-time yield: setTimeout, not rAF — rAF never fires in a backgrounded tab and
// would stall boot; timers keep it moving and the splash repaints whenever visible
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
  // coarse-pointer devices get a lower pixel-ratio cap
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

  const layers = buildLayers();
  const terrain = new Terrain(SEED);
  const columns = new Columns(geo, layers, terrain);
  const trees = new Trees(geo, columns, terrain, SEED);
  const save = saveEnabled ? loadStoredWorldSave(saveKey, SEED, M) : null;
  if (save) {
    applyChoppedTrees(trees, save.choppedTrees, geo.count);
    applyTreeChopProgress(trees, save.treeChopProgress, geo.count);
  }

  splash('starting renderer…', 0.18);
  await yieldFrame();
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches || params.get('touch') === '1';
  const renderer = await createRenderer(coarsePointer);
  const isWebGPU = !!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060c);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 14000);
  const sun = new THREE.DirectionalLight(0xfff2e0, 3.0);
  const sunTarget = new THREE.Object3D();
  sun.target = sunTarget;
  scene.add(sun, sunTarget, new THREE.HemisphereLight(0x8fb4dd, 0x2c2418, 0.5), new THREE.AmbientLight(0x404a58, 0.35));

  // trees are meshed into terrain chunks, so they stream and release together
  const chunkMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const streamer = new Streamer(geo, layers, columns, scene, chunkMaterial, trees);
  const farSphere = await FarSphere.build(
    new Goldberg(COARSE_M), geo, terrain,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0 }),
    async (frac) => {
      splash(`far side + horizon… ${Math.round(frac * 100)}%`, 0.2 + frac * 0.3);
      await yieldFrame();
    },
  );
  scene.add(farSphere.mesh);
  const water = await buildOcean(scene, terrain, layers, async (frac) => {
    splash(`filling the oceans… ${Math.round(frac * 100)}%`, 0.5 + 0.04 * frac);
    await yieldFrame();
  });
  addStars(scene);
  const skyQuality = params.get('skyq') === 'high' ? 'high' : params.get('skyq') === 'low' || coarsePointer ? 'low' : 'high';
  const sky = new Sky(scene, SUN, skyQuality, params.get('clouds') !== '0');

  const player = new Player(geo, layers, columns);
  if (!save || !applyPlayerSave(player, save.player, geo.count)) player.spawnAt(findSpawnTile(geo, columns, trees));

  const controls = new Controls(renderer.domElement, app, params.get('touch') === '1');
  const ux = new UxManager();
  const hud = new Hud();
  const audio = new GameAudio();
  if (params.get('mute') === '1') audio.setMuted(true);
  const character = new Character(scene);
  const dropRenderer = new ResourceDropRenderer(scene);
  const highlight = new TileHighlight(scene);
  const rig = new CameraRig(camera, geo, layers, columns);
  const stats = new FrameStats();

  let device: HintDevice = 'keyboard';
  const syncDevice = (): void => {
    device = hintDevice(ux.update({ touchEnabled: controls.touch.enabled, gamepadActive: controls.gamepadActive() }).inputMode);
    hud.setHelpText(helpText(device));
    hud.setCraftKey(craftKeyLabel(device));
  };
  syncDevice();

  let autosave: Autosave | null = null;
  const loop = new CoreLoop({
    geo, layers, columns, trees, streamer, player, hud, audio, drops: dropRenderer,
    device: () => device,
    changed: () => autosave?.markDirty(),
  }, {
    inventory: normalizeInventory(save?.inventory),
    planeCrafted: save?.planeCrafted ?? params.get('plane') === '1',
    drops: normalizeResourceDrops(save?.drops, geo.count),
  });
  autosave = new Autosave(saveKey, saveEnabled, () => captureWorldSave({
    seed: SEED, frequency: M, player, trees,
    inventory: loop.inventory, drops: loop.drops, planeCrafted: loop.planeCrafted,
  }), !save);

  // first gesture unlocks browser audio; unbind afterwards so later clicks don't keep
  // resetting the soundtrack's between-track gap
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
  const refreshCrafting = (): void => hud.setCrafting(loop.craftingRows(), craftingOpen);
  const toggleCrafting = (): void => {
    craftingOpen = !craftingOpen;
    refreshCrafting();
    audio.playEvent(craftingOpen ? 'uiOpen' : 'uiConfirm');
  };
  controls.input.setWorldInputBlocked(() => craftingOpen);
  hud.onCraftSelect = (id) => {
    if (loop.craft(id)) refreshCrafting();
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

  // --- tree targeting + chopping ---
  let target: TreePick | null = null;
  let chopTimer = 0;
  const aimAt = (dx: number, dy: number, dz: number): void => {
    const w = rig.world;
    target = pickTree(geo, layers, columns, trees, w.x, w.y, w.z, dx, dy, dz, REACH + rig.dist);
  };
  const rayV = new THREE.Vector3();
  const aimAtScreen = (x: number, y: number): void => {
    rayV.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5).unproject(camera).normalize();
    aimAt(rayV.x, rayV.y, rayV.z);
  };
  const chop = (): void => {
    if (target && loop.strikeTree(target.tile)) chopTimer = CHOP_COOLDOWN;
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
    if (intent.mute) hud.flash(audio.toggleMuted() ? 'sound muted' : 'sound on', 1.8);
    if (intent.diag) showDiag = !showDiag;
    if (intent.help) hud.toggleHelp();
  };

  const updateTargeting = (intent: FrameIntent, dt: number): void => {
    const canAim = intent.aiming && rig.dist < AIM_MAX_CAM_DIST && player.mode !== 'plane';
    if (canAim && !controls.touch.enabled) aimAt(rig.dir.x, rig.dir.y, rig.dir.z);
    else if (!canAim) target = null;
    // touch: each tap aims a ray at the tapped point and swings once
    if (canAim && controls.touch.enabled) {
      for (const tap of intent.chopTaps) {
        aimAtScreen(tap.x, tap.y);
        chop();
      }
      target = null;
    }
    chopTimer -= dt;
    if (intent.chop || (intent.chopHeld && chopTimer <= 0)) chop();
    if (target) highlight.show(geo, target.tile, layers.topRadius(columns.topLayerOf(target.tile)) + 0.03, rig.world);
    else highlight.hide();
  };

  // --- HUD ---
  let showDiag = params.get('debug') === '1';
  let hudTimer = 0;
  const updateHud = (): void => {
    const agl = player.altitudeAGL();
    const speed = Math.hypot(player.vx, player.vy, player.vz);
    hud.setVitals(`${stats.fpsEma.toFixed(0)} fps`);
    hud.setFlight(player.mode === 'plane' ? `✈ ${speed.toFixed(0)} m/s · ${agl.toFixed(0)} m`
      : player.mode === 'fly' ? `fly · ${agl.toFixed(0)} m` : null);
    hud.setInventory([
      { name: 'wood', css: ITEM_DEFS.wood.css, count: loop.wood, goal: loop.planeCrafted ? undefined : `${loop.wood}/${PLANE_WOOD_COST}` },
      ...(loop.planeCrafted ? [{ name: 'plane', css: ITEM_DEFS.planeFrame.css, count: 1 }] : []),
    ]);
    refreshCrafting();
    controls.touch.setPlaneButton(
      player.mode === 'plane' ? 'flying' : loop.planeCrafted ? 'fly' : loop.wood > 0 ? 'craft' : 'hidden',
      !loop.planeCrafted && player.mode !== 'plane' ? `${Math.min(loop.wood, PLANE_WOOD_COST)}/${PLANE_WOOD_COST}` : '');
    controls.touch.setDownVisible(player.mode !== 'walk');
    if (!showDiag) {
      hud.setDiag(null);
      return;
    }
    const s = streamer.stats();
    hud.setDiag([
      `${isWebGPU ? 'WebGPU' : 'WebGL2'} · ${stats.frameMsEma.toFixed(1)} ms · seed ${SEED}`,
      `mode ${player.mode}${player.submerged > 0.4 ? ' (swimming)' : player.grounded ? ' (grounded)' : ''} · ${speed.toFixed(1)} m/s`,
      player.mode === 'plane' ? `throttle ${player.throttle.toFixed(0)} · holding ${player.holdAGL.toFixed(0)} m` : '',
      `alt ${agl.toFixed(1)} AGL · h ${(player.radius() - PLANET_RADIUS).toFixed(1)} · zoom ${rig.dist.toFixed(0)}`,
      `tile ${player.tile}${geo.degreeOf(player.tile) === 5 ? ' *pentagon*' : ''} · GP(${M},0)`,
      `chunks ${s.resident} res / ${s.queued} q · ${(s.triangles / 1000).toFixed(0)}k tris`,
      `wood ${loop.wood} · drops ${loop.drops.length} · trees felled ${trees.chopped.size}`,
    ].filter((l) => l !== ''));
  };

  /**
   * Nearest live tree within a few rings: ground distance and the bearing (radians) that
   * player.applyLook would have to yaw by to face it. Lets playtests steer without setters.
   */
  const nearestTree = (): { tile: number; distance: number; bearing: number } | null => {
    const seen = new Set<number>([player.tile]);
    let ring = [player.tile];
    for (let r = 0; r <= 6 && ring.length > 0; r++) {
      let best: { tile: number; distance: number; bearing: number } | null = null;
      for (const tile of ring) {
        if (!trees.hasTree(tile)) continue;
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

  // read-only state for automated playtests (Playwright etc.)
  (window as unknown as { render_game_to_text: () => string }).render_game_to_text = () => JSON.stringify({
    mode: player.mode,
    tile: player.tile,
    altitudeAGL: Math.round(player.altitudeAGL() * 10) / 10,
    speed: Math.round(Math.hypot(player.vx, player.vy, player.vz) * 10) / 10,
    inventory: { ...loop.inventory },
    planeCrafted: loop.planeCrafted,
    drops: loop.drops.length,
    target: target ? { tile: target.tile, damage: trees.damageOf(target.tile) } : null,
    nearestTree: nearestTree(),
    pitch: Math.round(player.pitch * 1000) / 1000,
    treesFelled: trees.chopped.size,
    craftingOpen,
    camDist: Math.round(rig.dist * 10) / 10,
    renderer: isWebGPU ? 'webgpu' : 'webgl2',
  });

  // --- frame loop ---
  let last = performance.now();
  let streamTimer = 0;
  let lastFarRefresh = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dtMs = now - last;
    last = now;
    const dt = Math.min(0.05, dtMs / 1000);

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

    // streaming: refresh the wanted set a few times a second, build within budget
    streamTimer -= dt;
    if (streamTimer <= 0) {
      streamTimer = 0.18;
      streamer.refreshDesired(...player.up(), player.altitudeAGL());
    }
    const built = streamer.pump();
    // far-sphere refilter is a 184k-tri scan + index re-upload: keep it off build frames
    // and cap it at 4 Hz — a briefly unfiltered far tri sits 6 m under a loaded chunk, invisible
    if (streamer.residencyDirty && built === 0 && now - lastFarRefresh > 250) {
      farSphere.setResidentChunks(streamer.residentKeys());
      streamer.residencyDirty = false;
      lastFarRefresh = now;
    }

    // camera-relative transforms (floating origin: camera stays at 0,0,0)
    const w = rig.world;
    streamer.updateTransforms(w.x, w.y, w.z);
    farSphere.mesh.position.set(-w.x, -w.y, -w.z);
    water.position.set(-w.x, -w.y, -w.z);
    sky.update(w.x, w.y, w.z, camera);
    sun.position.set(SUN.x * 11000 - w.x, SUN.y * 11000 - w.y, SUN.z * 11000 - w.z);
    sunTarget.position.set(-w.x, -w.y, -w.z);

    loop.tickDrops(dt);
    character.update(player, w, rig.dist, dt, loop.characterVisualState());
    dropRenderer.update(loop.drops, geo, layers, columns, w, now / 1000);
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
