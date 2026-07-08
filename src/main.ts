import * as THREE from 'three/webgpu';
import { color, float, positionWorld, positionLocal, cameraPosition, normalWorld, normalize, attribute, vec3, time, mix, smoothstep as tslSmoothstep } from 'three/tsl';
import { Goldberg } from './geo/goldberg';
import { buildLayers, PLANET_RADIUS, WATER_SURFACE } from './world/layers';
import { NATURAL_VOID_SCAN_LAYERS, type NaturalVoidKind } from './world/caves';
import { Terrain, MAT, type MaterialId } from './world/terrain';
import { Columns } from './world/columns';
import { Trees, type TreeVisualKind } from './world/trees';
import { Streamer } from './world/streamer';
import { chunkKeyOfTile } from './world/chunks';
import { FarSphere } from './render/farsphere';
import { buildGeodesic } from './render/geodesic';
import { Sky } from './render/sky';
import { Character } from './render/character';
import { StructureRenderer } from './render/structures';
import { LandmarkRenderer } from './render/landmarks';
import { ResourceDropRenderer } from './render/resourceDrops';
import { FishSchoolRenderer, kilnFishSkinForSchool, type FishSchoolVisualSite, type KilnFishSkinSlug } from './render/fishSchools';
import { Player } from './player/player';
import { Input } from './player/input';
import { TouchControls } from './player/touch';
import { GamepadControls, type GamepadFrame } from './player/gamepad';
import { UxManager, type UxInputMode, type UxProfile } from './player/ux';
import { panelOwnershipSnapshot, type PanelOwnershipSnapshot } from './player/panelOwnership';
import { pick, pickTree, type PickResult, type TreePick } from './edit/pick';
import { Metrics } from './demo/metrics';
import { Autopilot, OrbitDemo } from './demo/autopilot';
import { Hud, splash, hideSplash, type ChestStoragePanelView, type CraftingRecipeView } from './demo/hud';
import { GameAudio } from './audio/gameAudio';
import {
  audioEventForCraft,
  audioEventForFoodAction,
  audioEventForPlacement,
  audioEventForStructure,
  type AudioEventId,
} from './audio/events';
import {
  applyChoppedTrees,
  applyColumnEdits,
  applyPlayerSave,
  applyTreeChopProgress,
  captureWorldSave,
  clearStoredWorldSave,
  loadStoredWorldSave,
  parseWorldSaveJson,
  saveSlotKey,
  storeWorldSave,
} from './sim/save';
import { MineProgress, miningPowerForTool, miningStagesForMaterial, normalizeMineProgress } from './sim/mining';
import { ITEM_DEFS, allRecipeStatuses, craftRecipe, itemCount, normalizeInventory, type InventoryItems, type ItemId, type MaterialItemId } from './sim/crafting';
import {
  ageResourceDrops,
  collectReadyResourceDrops,
  despawnAgedResourceDrops,
  nextResourceDropId,
  normalizeResourceDrops,
  spawnItemDrops,
  spawnMinedItemDrops,
  spawnTreeWoodDrops,
  RESOURCE_DROP_DESPAWN_AGE,
  type ResourceDropSave,
  type ResourceDropSource,
} from './sim/resourceDrops';
import { buildInventoryLedger, packBurdenForInventory, packCapacityBonusForInventory } from './sim/inventoryLedger';
import { applyFishingCatch, fishingCueForSchool, fishSchoolAt } from './sim/fishing';
import { applyForage, forageAt } from './sim/forage';
import {
  packStructureCommand,
  placeStructureCommand,
  previewPlaceStructureCommand,
  previewRelocateStructureCommand,
  relocateStructureCommand,
  rotatePlacedStructureCommand,
  rotateSelectedPlacementCommand,
  selectStructurePlacementCommand,
  useStructureInteractionCommand,
  type StructureCommandResult,
  type StructureSnapPreview,
} from './sim/buildCommands';
import {
  PLACEABLE_ITEM_IDS,
  STRUCTURE_YAW_STEP,
  chestStorageView,
  homeScore,
  isPlaceableItemId,
  nearestStructureOnTiles,
  normalizeStructureSaves,
  placeableName,
  spendRootCellarProvision,
  structureDismantleBlockers,
  structureSocketCatalog,
  structureSocketOccupancy,
  structureYawTurn,
  structureStationInventory,
  transferChestMaterial,
  type ChestTransferAction,
  type FishTrapContext,
  type PlaceableItemId,
  type RainCisternContext,
  type StructureSave,
  type WaystoneContext,
  type WeatherVaneContext,
} from './sim/structures';
import {
  allPentagonLandmarks,
  discoverPentagon,
  nearestPentagonOnTiles,
  normalizePentagonDiscoveries,
  pentagonLandmark,
  pentagonProgress,
  pentagonTileIds,
} from './sim/landmarks';
import {
  backPropsForInventory,
  characterActionForLocomotion,
  defaultHeldProp,
  miningPropForMaterial,
  pickupPropForItem,
  propForStructureInteraction,
  type CharacterAction,
  type CharacterPropId,
  type CharacterVisualState,
} from './sim/equipment';
import {
  bestToolForMaterial,
  bestToolForTree,
  maxReachBonus,
  normalizeToolWear,
  toolSummary,
  useTool,
  type ToolEffect,
  type ToolWear,
} from './sim/tools';
import {
  advanceTime as advanceSurvivalTime,
  eatBestFood,
  isExposureCritical,
  isExposureWarning,
  normalizeSurvivalState,
  normalizeTimeState,
  normalizeWeatherState,
  prepareHearthSupper,
  recoverFromCollapse,
  restAtShelter,
  survivalReport,
  updateSurvival,
  weatherProtectionForInventory,
  weatherAt,
} from './sim/survival';

interface TileRingEntry {
  tile: number;
  ring: number;
}

const params = new URLSearchParams(location.search);
const SEED = params.get('seed') ?? 'GP192-01';
const M = Number.parseInt(params.get('m') ?? '192', 10);
const COARSE_M = 96;
const creativeActive = params.get('creative') === '1';
const saveKey = saveSlotKey(SEED, M);
const saveEnabled = !creativeActive && params.get('nosave') !== '1';
if (params.get('resetSave') === '1' || params.get('reset') === '1') clearStoredWorldSave(saveKey);

const DIST_MIN = 2.4;
const DIST_MAX = 4200;
const PLANE_CAM_EXP = Math.log(15 / DIST_MIN) / Math.log(DIST_MAX / DIST_MIN);
const SUN = new THREE.Vector3(0.62, 0.55, 0.56).normalize();
const PLANE_WOOD_COST = 12;
const WOOD_PER_TREE = 6;
const SEA_LEVEL_HEIGHT = WATER_SURFACE - PLANET_RADIUS;

// hotbar: placeable materials, mined/chopped resources feed the counts
const SLOTS: { name: MaterialItemId; mat: MaterialId; css: string }[] = [
  { name: 'dirt', mat: MAT.DIRT, css: '#8a6242' },
  { name: 'rock', mat: MAT.ROCK, css: '#7d7f85' },
  { name: 'sand', mat: MAT.SAND, css: '#d8c48a' },
  { name: 'snow', mat: MAT.SNOW, css: '#eef2f5' },
  { name: 'wood', mat: MAT.WOOD, css: '#a8763f' },
];
const WOOD_SLOT = 4;
const STORAGE_FOCUS_ACTIONS: ChestTransferAction[] = ['depositOne', 'depositAll', 'withdrawOne', 'withdrawAll'];

const KEYBOARD_HELP = `WASD move · space jump · shift sprint · wheel zoom
LMB mine + chop trees · RMB build · Z/X rotate build/prop · 1-5 pick block · Q eat
Plane: chop 2 trees for 12 wood · B craft · R use/open chest/farm/fish/forage · Shift+R pack prop · V/Shift+E move prop · E board/stow
F free-flight · F3 stats · H help`;

const TOUCH_HELP = `Touch: left stick move · drag to look · pinch zoom
Tap terrain to mine/chop · hold terrain to build/drop moved prop · move grabs/drops nearby prop · hold use packs prop
Craft opens recipes/pack · plane boards/stows`;

const GAMEPAD_HELP = `Gamepad: LS move · RS look · full stick/RB sprint · LB+RS zoom
A jump/swim · LT descend · X mine/chop · RT build · D-pad hotbar
B use · LB+B pack prop · LB+RT move/drop prop · Y craft · LB+D-pad rotates selected build/move · Start board/stow`;

function inputHelpText(mode: UxInputMode): string {
  if (mode === 'gamepad' || mode === 'hybrid') return GAMEPAD_HELP;
  if (mode === 'touch') return TOUCH_HELP;
  return KEYBOARD_HELP;
}

function hudLabelsForInput(mode: UxInputMode): { craft: string; hotbar: string[] } {
  if (mode === 'gamepad' || mode === 'hybrid') return { craft: 'Y', hotbar: ['1', '2', '3', '4', '5'] };
  if (mode === 'touch') return { craft: 'craft', hotbar: ['1', '2', '3', '4', '5'] };
  return { craft: 'B', hotbar: ['1', '2', '3', '4', '5'] };
}

/** which hotbar slot a mined cell's material feeds (grass crumbles to dirt, etc.) */
function yieldSlot(mat: number): number {
  switch (mat) {
    case MAT.GRASS: case MAT.DIRT: return 0;
    case MAT.ROCK: case MAT.BUILT: return 1;
    case MAT.SAND: case MAT.SEABED: return 2;
    case MAT.SNOW: return 3;
    case MAT.WOOD: return 4;
    default: return -1;
  }
}

// boot-time yield: setTimeout, not rAF — rAF never fires in a backgrounded tab and
// would stall boot; timers keep it moving and the splash repaints whenever visible
function raf(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;

  splash('goldberg topology…', 0.02);
  await raf(); await raf();
  const geo = new Goldberg(M);
  const pentagonTiles = pentagonTileIds(geo);
  splash(`${geo.count.toLocaleString()} tiles · ${geo.buildMs.toFixed(0)} ms`, 0.14);
  await raf();

  const layers = buildLayers();
  const terrain = new Terrain(SEED);
  const columns = new Columns(geo, layers, terrain);

  // World-space radius of the ground surface at a tile, right now. Used to cache a
  // resource drop's rest height once at spawn (or once on load, for legacy saves) —
  // never on every render frame — so later terrain edits nearby don't make it snap.
  const groundRadiusAt = (tile: number): number => layers.topRadius(columns.groundLayerBelow(tile, layers.bounds[0]));
  const backfillDropGroundRadius = (drops: readonly ResourceDropSave[]): ResourceDropSave[] =>
    drops.map((drop) => (drop.groundRadius > 0 ? drop : { ...drop, groundRadius: groundRadiusAt(drop.tile) }));

  // --- renderer: WebGPU first, WebGL fallback ---
  splash('starting renderer…', 0.18);
  await raf();
  let renderer: THREE.WebGPURenderer;
  const forceGL = params.get('gpu') === 'gl'; // test hook for the fallback path
  try {
    renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: forceGL });
    await renderer.init();
  } catch (err) {
    console.warn('WebGPU init failed; falling back to WebGL2', err);
    renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: true });
    await renderer.init();
  }
  const isWebGPU = !!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
  // coarse-pointer devices get a lower pixel-ratio cap and cheaper sky march
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches || params.get('touch') === '1';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarsePointer ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060c);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 14000);

  // --- lights ---
  const sun = new THREE.DirectionalLight(0xfff2e0, 3.0);
  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sun.target = sunTarget;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0x8fb4dd, 0x2c2418, 0.5);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0x404a58, 0.35));

  // --- materials ---
  const chunkMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const farMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0 });

  // --- trees + streaming (trees are meshed into chunks, so they stream/release together) ---
  const trees = new Trees(geo, columns, terrain, SEED);
  const loadedSave = saveEnabled ? loadStoredWorldSave(saveKey, SEED, M) : null;
  if (loadedSave) {
    applyColumnEdits(columns, loadedSave.columns);
    applyChoppedTrees(trees, loadedSave.choppedTrees, geo.count);
    applyTreeChopProgress(trees, loadedSave.treeChopProgress, geo.count);
  }
  const mining = new MineProgress(normalizeMineProgress(loadedSave?.mineProgress, geo.count, layers.L, (tile, layer) => columns.solidAt(tile, layer)));
  let resourceDrops: ResourceDropSave[] = backfillDropGroundRadius(normalizeResourceDrops(loadedSave?.drops, geo.count));
  let nextDropId = nextResourceDropId(resourceDrops);
  const streamer = new Streamer(geo, layers, columns, scene, chunkMaterial, trees, mining);

  // --- far sphere (sliced build behind the splash) ---
  const coarse = new Goldberg(COARSE_M);
  const farSphere = await FarSphere.build(coarse, geo, terrain, farMaterial, async (frac) => {
    splash(`far side + horizon… ${Math.round(frac * 100)}%`, 0.2 + frac * 0.3);
    await raf();
  });
  scene.add(farSphere.mesh);

  // --- ocean ---
  splash('filling the oceans…', 0.52);
  await raf();
  const water = await (async () => {
    // geodesic order 7: ~7.8 m triangle edges, close to tile scale, so the depth tint and
    // foam band resolve individual coastline hexes instead of smearing across 16 m tris
    const sphere = buildGeodesic(7);
    const n = sphere.dirs.length / 3;
    const positions = new Float32Array(sphere.dirs.length);
    const shore = new Float32Array(n);
    const SLICE = 24576;
    for (let start = 0; start < n; start += SLICE) {
      const end = Math.min(n, start + SLICE);
      for (let i = start; i < end; i++) {
        const x = sphere.dirs[i * 3], y = sphere.dirs[i * 3 + 1], z = sphere.dirs[i * 3 + 2];
        positions[i * 3] = x * WATER_SURFACE;
        positions[i * 3 + 1] = y * WATER_SURFACE;
        positions[i * 3 + 2] = z * WATER_SURFACE;
        // sample the SAME stepped surface the mesher draws — quantized to the layer grid —
        // so the waterline reads exactly against the rendered hex terraces
        const h = terrain.heightAt(x, y, z);
        const stepTop = layers.topRadius(layers.layerOfRadius(PLANET_RADIUS + h));
        const depth = WATER_SURFACE - stepTop; // >0 means submerged terrain here
        shore[i] = Math.max(0, Math.min(1, 1 - depth / 22));
      }
      splash(`filling the oceans… ${Math.round(end / n * 100)}%`, 0.5 + 0.04 * (end / n));
      await raf();
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(sphere.dirs, 3));
    geom.setAttribute('shore', new THREE.BufferAttribute(shore, 1));
    geom.setIndex(new THREE.BufferAttribute(sphere.index, 1));
    geom.computeBoundingSphere();

    const mat = new THREE.MeshStandardNodeMaterial();
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const fresnel = float(1.0).sub(normalWorld.dot(viewDir).abs()).max(0.0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shoreAttr = float(attribute('shore', 'float') as any);

    // slow crossing swells (~40 m) plus a short chop (~7 m): ±19 cm of radial breathing
    const p = positionLocal;
    const swell = p.dot(vec3(0.131, 0.112, 0.123)).add(time.mul(0.6)).sin()
      .add(p.dot(vec3(-0.104, 0.141, -0.092)).add(time.mul(0.97)).sin())
      .mul(0.08);
    const chop = p.dot(vec3(0.55, 0.48, 0.51)).add(time.mul(1.5)).sin().mul(0.035);
    const wave = swell.add(chop);
    mat.positionNode = p.add(p.normalize().mul(wave));

    // fine moving ripple, used to break up the specular highlight (zen sparkle)
    const r1 = p.dot(vec3(1.31, 1.13, 1.27)).add(time.mul(2.1)).sin();
    const r2 = p.dot(vec3(-1.17, 1.29, -1.07)).add(time.mul(1.55)).sin();
    const ripple = r1.mul(r2).abs();

    const deep = color(0x0a2e52);
    const shallow = color(0x1d7a96);
    const foam = tslSmoothstep(float(0.86), float(0.99), shoreAttr.add(wave.mul(0.25)));
    mat.colorNode = mix(deep, shallow, shoreAttr.pow(1.7)).add(color(0xcfe8ee).mul(foam).mul(0.5));
    mat.opacityNode = float(0.82).add(fresnel.pow(2.0).mul(0.14)).sub(shoreAttr.pow(2.0).mul(0.28)).add(foam.mul(0.3)).min(0.96);
    mat.roughnessNode = float(0.09).add(ripple.mul(0.16)).add(foam.mul(0.4));
    mat.metalnessNode = float(0.02);
    mat.transparent = true;
    mat.depthWrite = false;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    scene.add(mesh);
    return mesh;
  })();

  // --- stars ---
  {
    const starCount = 2600;
    const pos = new Float32Array(starCount * 3);
    let sr = 1;
    const rand = (): number => {
      sr = (sr * 1103515245 + 12345) & 0x7fffffff;
      return sr / 0x7fffffff;
    };
    for (let i = 0; i < starCount; i++) {
      const z = rand() * 2 - 1;
      const ph = rand() * Math.PI * 2;
      const rr = Math.sqrt(Math.max(0, 1 - z * z));
      pos[i * 3] = rr * Math.cos(ph) * 11000;
      pos[i * 3 + 1] = rr * Math.sin(ph) * 11000;
      pos[i * 3 + 2] = z * 11000;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xbfcbe0, size: 1.6, sizeAttenuation: false });
    const stars = new THREE.Points(g, mat);
    stars.frustumCulled = false;
    scene.add(stars);
  }

  // --- atmosphere + voxel clouds (raymarched, depth-aware) ---
  const skyQuality: 'high' | 'low' =
    params.get('skyq') === 'high' ? 'high'
    : params.get('skyq') === 'low' ? 'low'
    : coarsePointer ? 'low' : 'high';
  const sky = new Sky(scene, SUN, skyQuality, params.get('clouds') !== '0');

  // --- player + input + demos ---
  const player = new Player(geo, layers, columns);

  // spawn on land near pentagon 0: BFS outward for comfortable grass altitude, preferring
  // a clearing at the edge of a wood so the survival loop (chop -> craft) is in view.
  const spawnTile = (() => {
    const seen = new Set<number>([0]);
    const queue = [0];
    let fallback = -1;
    while (queue.length > 0) {
      const t = queue.shift()!;
      const h = columns.heightOf(t);
      if (h > 4 && h < 30) {
        if (fallback < 0) fallback = t;
        let near = 0;
        const deg = geo.degreeOf(t);
        outer: for (let k = 0; k < deg; k++) {
          const nb = geo.neighbor(t, k);
          const dn = geo.degreeOf(nb);
          for (let q = 0; q < dn; q++) {
            if (trees.hasTree(geo.neighbor(nb, q)) && ++near >= 2) break outer;
          }
        }
        if (near >= 2 && !trees.hasTree(t)) return t;
      }
      const deg = geo.degreeOf(t);
      for (let k = 0; k < deg; k++) {
        const n = geo.neighbor(t, k);
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
      if (seen.size > 40000) break;
    }
    return fallback >= 0 ? fallback : 0;
  })();
  if (!loadedSave || !applyPlayerSave(player, loadedSave.player, geo.count)) player.spawnAt(spawnTile);
  const input = new Input(renderer.domElement);
  const touch = new TouchControls(input, app, params.get('touch') === '1');
  const gamepad = new GamepadControls();
  const uxManager = new UxManager();
  const hud = new Hud();
  const audio = new GameAudio();
  if (params.get('mute') === '1') audio.setMuted(true);
  // Only needs to fire once (first gesture satisfies the browser's audio-unlock
  // requirement) — leaving these bound would call audio.unlock() -> resumeMusic() on
  // every mine/build click for the rest of the session, repeatedly resetting the
  // soundtrack's between-track gap timer and starving it of a chance to ever fire.
  const unlockAudio = (): void => {
    void audio.unlock().then((ok) => {
      if (!ok) return;
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    });
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio);
  const playAudio = (id: AudioEventId): void => { audio.playEvent(id); };
  let currentUxProfile = uxManager.update({ touchEnabled: touch.enabled, gamepadActive: gamepad.active() });
  const syncHudUx = (profile: UxProfile): void => {
    hud.setControlLabels(hudLabelsForInput(profile.inputMode));
    hud.setHelpText(inputHelpText(profile.inputMode));
  };
  syncHudUx(currentUxProfile);
  const metrics = new Metrics(() => {
    const s = streamer.stats();
    return { loads: streamer.loads, releases: streamer.releases, buildSamples: streamer.buildSamples, resident: s.resident, triangles: s.triangles };
  });
  const autopilot = new Autopilot(geo, layers, columns, metrics, (msg) => hud.flash(msg, 10));
  const orbitDemo = new OrbitDemo(metrics, (msg) => hud.flash(msg, 10));
  const character = new Character(scene);
  const structures: StructureSave[] = normalizeStructureSaves(loadedSave?.structures, geo.count, layers.L);
  const structureRenderer = new StructureRenderer(scene);
  structureRenderer.setStructures(structures);
  const discoveredPentagons = new Set(normalizePentagonDiscoveries(loadedSave?.progression?.pentagons, pentagonTiles));
  const landmarkRenderer = new LandmarkRenderer(scene, pentagonTiles);
  const resourceDropRenderer = new ResourceDropRenderer(scene);
  const fishSchoolRenderer = new FishSchoolRenderer(scene);
  resourceDropRenderer.setDrops(resourceDrops);
  let fishVisualOverride: FishSchoolVisualSite | null = null;

  // --- highlight (Line with an explicit closing vertex; LineLoop is unsupported on WebGPURenderer) ---
  const highlightGeom = new THREE.BufferGeometry();
  const highlightPos = new THREE.BufferAttribute(new Float32Array(8 * 3), 3);
  highlightGeom.setAttribute('position', highlightPos);
  const highlight = new THREE.Line(
    highlightGeom,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: true }),
  );
  highlight.visible = false;
  highlight.frustumCulled = false;
  scene.add(highlight);

  // --- initial ring ---
  {
    const [ux, uy, uz] = player.up();
    streamer.refreshDesired(ux, uy, uz, 2);
    let total = Math.max(1, streamer.stats().queued);
    while (streamer.stats().queued > 0) {
      streamer.pump(24, 64);
      splash(`growing terrain around spawn… ${total - streamer.stats().queued}/${total}`, 0.55 + 0.4 * (1 - streamer.stats().queued / total));
      await raf();
    }
  }
  farSphere.setResidentChunks(streamer.residentKeys());
  streamer.residencyDirty = false;

  hideSplash();
  hud.flash(loadedSave
    ? 'Hearth and Horizon save restored'
    : creativeActive
    ? touch.enabled
      ? 'Creative: full hotbar · drag to look · tap/hold to edit · plane button toggles walk/free-flight'
      : 'Creative: full hotbar · F toggles walk/free-flight · E boards the plane'
    : touch.enabled
      ? `Plane hint: tap trees for wood · ${PLANE_WOOD_COST} wood crafts the plane button`
      : `Plane hint: chop 2 trees for ${PLANE_WOOD_COST} wood · B opens crafting · E boards`, 9);

  // --- camera state ---
  let zoomExp = 0;
  let zoomExpTarget = 0;
  let zoomHold = false;       // scripted zoom: ignore wheel until released
  let planeAutoZoom = false;  // pulled back automatically when boarding the plane
  let camDist = 0;
  let camObstruct = Infinity; // obstruction cap on the camera boom (smoothly regrows)
  const camUp = new THREE.Vector3(0, 1, 0);
  const camWorld = { x: 0, y: 0, z: 0 };
  const rayV = new THREE.Vector3();

  // --- inventory + edit state ---
  const counts = SLOTS.map((_, i) => Math.max(0, Math.trunc(loadedSave?.inventory[i] ?? 0)));
  const craftedItems: InventoryItems = normalizeInventory(loadedSave?.craftedItems);
  let hotbarSel = Math.max(0, Math.min(SLOTS.length - 1, Math.trunc(loadedSave?.hotbarSel ?? 0)));
  let planeCrafted = loadedSave?.planeCrafted ?? params.get('plane') === '1';
  if ((craftedItems.planeFrame ?? 0) > 0) planeCrafted = true;
  if (creativeActive) {
    for (let i = 0; i < counts.length; i++) counts[i] = 999;
    for (const item of PLACEABLE_ITEM_IDS) craftedItems[item] = Math.max(craftedItems[item] ?? 0, 99);
    planeCrafted = true;
    player.mode = 'fly';
  }
  let craftingOpen = false;
  let craftingFocusIndex = 0;
  let craftingFocusAction: 'craft' | 'place' = 'craft';
  let openChestId: number | null = null;
  let storageFocusIndex = 0;
  let storageFocusAction: ChestTransferAction = 'depositOne';
  let selectedStructureItem: PlaceableItemId | null = null;
  let placementYawTurns = 0;
  let relocationCursor: {
    id: number;
    item: PlaceableItemId;
    fromTile: number;
    fromLayer: number;
    originalTurn: number;
    source: BuildCommandSource;
  } | null = null;
  let lastStructureAction = '';
  type BuildCommandSource = 'keyboard' | 'pointer' | 'touch' | 'gamepad' | 'debug';
  type BuildCommandVerb = 'select' | 'rotate' | 'place' | 'relocate' | 'use' | 'pack';
  type BuildCommandTarget = 'placement' | 'structure' | 'none';
  interface RuntimeBuildCommandRecord {
    index: number;
    source: BuildCommandSource;
    verb: BuildCommandVerb;
    target: BuildCommandTarget;
    ok: boolean;
    action: string;
    message: string;
    item?: PlaceableItemId;
    id?: number;
    tile?: number;
    fromTile?: number;
    fromLayer?: number;
    toTile?: number;
    toLayer?: number;
    turn?: number;
    mode?: string;
    blockers?: string[];
    inventoryBefore?: number;
    inventoryAfter?: number;
  }
  let buildCommandIndex = 0;
  const buildCommandLog: RuntimeBuildCommandRecord[] = [];
  let lastFoodAction = '';
  let lastLandmarkAction = '';
  let lastToolAction = '';
  let lastCaveAction = '';
  let lastSurvivalAction = '';
  let exposureWarningActive = false;
  let exposureCriticalActive = false;
  let lastPickupAction = '';
  let toolWear: ToolWear = normalizeToolWear(loadedSave?.progression?.toolWear);
  const timeState = normalizeTimeState(loadedSave?.time);
  const weatherState = normalizeWeatherState(loadedSave?.weather);
  const survivalState = normalizeSurvivalState(loadedSave?.survival);
  let characterAction: { action: CharacterAction; held: CharacterPropId; started: number; duration: number } = {
    action: 'idle',
    held: 'hands',
    started: 0,
    duration: 0,
  };
  let lastPick: PickResult | null = null;
  let treePick: TreePick | null = null;
  let debugPickHoldUntil = 0;
  let mineTimer = 0;
  let nextMineCooldown = 0.17;
  let placeTimer = 0;
  let edits = columns.edits.size;
  let lastEditMs = 0;
  let saveDirty = !loadedSave && saveEnabled;
  let saveTimer = 0;
  let lastSaveMs = 0;

  const markSaveDirty = (): void => {
    if (saveEnabled) saveDirty = true;
  };

  const hasInventoryItem = (id: ItemId): boolean => itemCount(counts, craftedItems, id) > 0;

  const packCapacityBonus = () => packCapacityBonusForInventory(craftedItems);
  const packBurden = () => packBurdenForInventory(counts, craftedItems, { creative: creativeActive, capacityBonus: packCapacityBonus() });
  const packLedger = () => buildInventoryLedger(counts, craftedItems, toolWear, { creative: creativeActive, capacityBonus: packCapacityBonus() });

  function refreshCraftingHud(): void {
    hud.setCrafting(craftingRows(), craftingOpen, packLedger());
  }

  const triggerCharacterAction = (action: CharacterAction, held: CharacterPropId = 'hands', duration = 0.5): void => {
    characterAction = {
      action,
      held,
      started: performance.now() / 1000,
      duration,
    };
  };

  const toolPoseDuration = (tool: ToolEffect, baseDuration: number): number => {
    return tool.tool?.startsWith('echo') ? Math.max(baseDuration, 0.72) : baseDuration;
  };

  const applyToolUse = (tool: ToolEffect, context: string): void => {
    if (!tool.tool || creativeActive) return;
    const result = useTool(tool.tool, craftedItems, toolWear);
    toolWear = result.wear;
    for (const key of Object.keys(craftedItems) as ItemId[]) delete craftedItems[key];
    Object.assign(craftedItems, result.craftedItems);
    const nextWear = tool.tool ? Math.max(0, Math.trunc(result.wear[tool.tool] ?? 0)) : 0;
    lastToolAction = result.message ?? `${tool.name.toLowerCase()} ${tool.durability - nextWear}/${tool.durability} · ${context}`;
    if (result.repaired) {
      triggerCharacterAction('interact', 'repairKit', 1.8);
      playAudio('craftConfirm');
      hud.flash(result.message ?? 'field repair kit used', 2.8);
      refreshCraftingHud();
    } else if (result.broke) {
      hud.flash(result.message ?? 'tool broke', 2.8);
      refreshCraftingHud();
    }
    markSaveDirty();
  };

  const materialItemForMaterial = (material: MaterialId): MaterialItemId => {
    const slot = yieldSlot(material);
    return slot >= 0 ? SLOTS[slot].name : 'rock';
  };

  const materialPropForMinedMaterial = (material: MaterialId): CharacterPropId => {
    return miningPropForMaterial(materialItemForMaterial(material), hasInventoryItem);
  };

  const materialSlotForItem = (item: ItemId): number => SLOTS.findIndex((slot) => slot.name === item);

  const addResourceDropToInventory = (drop: ResourceDropSave): void => {
    const amount = Math.max(1, Math.trunc(drop.count));
    const slot = materialSlotForItem(drop.item);
    if (slot >= 0) counts[slot] += amount;
    else craftedItems[drop.item] = Math.max(0, Math.trunc(craftedItems[drop.item] ?? 0) + amount);
  };

  const tileSetAround = (centerTile: number, rings = 1): Set<number> => {
    const center = Math.max(0, Math.min(geo.count - 1, Math.trunc(centerTile)));
    const seen = new Set<number>([center]);
    const queue: { tile: number; ring: number }[] = [{ tile: center, ring: 0 }];
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      if (entry.ring >= rings) continue;
      const deg = geo.degreeOf(entry.tile);
      for (let k = 0; k < deg; k++) {
        const n = geo.neighbor(entry.tile, k);
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push({ tile: n, ring: entry.ring + 1 });
      }
    }
    return seen;
  };

  const resourceDropDiagnostics = () => ({
    count: resourceDrops.length,
    wood: resourceDrops.filter((drop) => drop.item === 'wood').reduce((sum, drop) => sum + drop.count, 0),
    byItem: resourceDrops.reduce((totals, drop) => {
      totals[drop.item] = (totals[drop.item] ?? 0) + drop.count;
      return totals;
    }, {} as Partial<Record<ItemId, number>>),
    ready: resourceDrops.filter((drop) => drop.age >= 0.9).length,
    despawnAge: RESOURCE_DROP_DESPAWN_AGE,
    lastPickup: lastPickupAction,
    items: resourceDrops.slice(0, 12).map((drop) => ({
      id: drop.id,
      item: drop.item,
      count: drop.count,
      tile: drop.tile,
      age: Math.round(drop.age * 100) / 100,
      groundRadius: Math.round(drop.groundRadius * 100) / 100,
      source: drop.source,
    })),
    renderer: resourceDropRenderer.stats(),
  });

  const treeAssetDiagnostics = () => ({
    proceduralChunkTrees: streamer.proceduralTreesActive(),
    chop: {
      active: trees.chopProgress.size,
      target: treePick ? {
        tile: treePick.tile,
        damage: trees.damageOf(treePick.tile),
        kind: trees.visualKindFor(treePick.tile),
      } : null,
    },
  });

  const mineProgressDiagnostics = () => ({
    active: mining.progress.size,
    target: lastPick ? {
      tile: lastPick.hitTile,
      layer: lastPick.hitLayer,
      damage: Math.round(mining.damageOf(lastPick.hitTile, lastPick.hitLayer) * 100) / 100,
    } : null,
    cells: [...mining.progress.values()].slice(0, 12).map((entry) => ({
      tile: entry.tile,
      layer: entry.layer,
      progress: Math.round(entry.progress * 100) / 100,
      needed: entry.needed ? Math.round(entry.needed * 100) / 100 : undefined,
      damage: Math.round(mining.damageOf(entry.tile, entry.layer) * 100) / 100,
    })),
  });

  const flashCollectedDrops = (collected: readonly ResourceDropSave[]): void => {
    const totals = new Map<ItemId, number>();
    for (const drop of collected) totals.set(drop.item, (totals.get(drop.item) ?? 0) + drop.count);
    const wood = totals.get('wood') ?? 0;
    if (wood > 0 && !planeCrafted) {
      if (counts[WOOD_SLOT] >= PLANE_WOOD_COST) {
        hud.flash(touch.enabled
          ? `${counts[WOOD_SLOT]}/${PLANE_WOOD_COST} wood · tap the plane button to craft + fly`
          : `${counts[WOOD_SLOT]}/${PLANE_WOOD_COST} wood · press B to craft the plane frame`, 4);
      } else {
        const remainingTrees = Math.ceil((PLANE_WOOD_COST - counts[WOOD_SLOT]) / WOOD_PER_TREE);
        hud.flash(`picked up +${wood} wood · ${counts[WOOD_SLOT]}/${PLANE_WOOD_COST} for plane · ${remainingTrees} tree${remainingTrees === 1 ? '' : 's'} left`, 3);
      }
      return;
    }
    const label = [...totals.entries()]
      .map(([item, count]) => `+${count} ${ITEM_DEFS[item].name.toLowerCase()}`)
      .join(' · ');
    hud.flash(`picked up ${label}`, 2.4);
  };

  const triggerPickupHandoff = (collected: readonly ResourceDropSave[]): void => {
    const totals = new Map<ItemId, number>();
    for (const drop of collected) totals.set(drop.item, (totals.get(drop.item) ?? 0) + drop.count);
    let primary: ItemId | null = null;
    let primaryCount = -1;
    for (const [item, count] of totals) {
      if (count > primaryCount) {
        primary = item;
        primaryCount = count;
      }
    }
    if (!primary) return;
    const totalCount = [...totals.values()].reduce((sum, count) => sum + count, 0);
    lastPickupAction = `picked up ${totalCount} item${totalCount === 1 ? '' : 's'}; showing ${ITEM_DEFS[primary].name.toLowerCase()}`;
    triggerCharacterAction('pickup', pickupPropForItem(primary), 0.64);
  };

  const tickResourceDrops = (dt: number): void => {
    if (resourceDrops.length === 0) return;
    resourceDrops = ageResourceDrops(resourceDrops, dt);
    // Uncollected drops disappear after RESOURCE_DROP_DESPAWN_AGE so the world doesn't
    // accumulate infinite ground clutter from unpicked wood, ore chips, forage, etc.
    const despawn = despawnAgedResourceDrops(resourceDrops);
    if (despawn.despawned.length > 0) {
      resourceDrops = despawn.remaining;
      markSaveDirty();
    }
    const result = collectReadyResourceDrops(resourceDrops, tileSetAround(player.tile, 1));
    if (result.collected.length === 0) {
      if (despawn.despawned.length > 0) resourceDropRenderer.setDrops(resourceDrops);
      return;
    }
    resourceDrops = result.remaining;
    for (const drop of result.collected) addResourceDropToInventory(drop);
    resourceDropRenderer.setDrops(resourceDrops);
    triggerPickupHandoff(result.collected);
    flashCollectedDrops(result.collected);
    playAudio('gatherSoft');
    markSaveDirty();
    refreshCraftingHud();
    refreshUseButton();
  };

  const characterVisualState = (): CharacterVisualState => {
    const now = performance.now() / 1000;
    const actionT = Math.max(0, now - characterAction.started);
    const active = characterAction.action !== 'idle' && actionT < characterAction.duration;
    const speed = Math.hypot(player.vx, player.vy, player.vz);
    return {
      action: active ? characterAction.action : characterActionForLocomotion({
        mode: player.mode,
        speed,
        grounded: player.grounded,
        submerged: player.submerged,
        sprinting: player.mode === 'walk' && player.grounded && speed > 7.2,
      }),
      held: active
        ? characterAction.held
        : defaultHeldProp(selectedStructureItem, SLOTS[hotbarSel]?.name ?? 'dirt', counts[hotbarSel] ?? 0),
      backProps: backPropsForInventory(hasInventoryItem),
      actionT: active ? actionT : 0,
      actionDuration: active ? characterAction.duration : 0,
    };
  };

  const writeSave = (force = false): boolean => {
    if (!saveEnabled || (!force && !saveDirty)) return false;
    const ok = storeWorldSave(saveKey, captureWorldSave({
      seed: SEED,
      frequency: M,
      player,
      columns,
      trees,
      mining,
      inventory: counts,
      craftedItems,
      drops: resourceDrops,
      structures,
      progression: { pentagons: [...discoveredPentagons], toolWear },
      time: timeState,
      weather: weatherState,
      survival: survivalState,
      hotbarSel,
      planeCrafted,
    }));
    if (ok) {
      saveDirty = false;
      lastSaveMs = performance.now();
    }
    return ok;
  };

  window.addEventListener('beforeunload', () => writeSave(true));
  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState !== 'hidden';
    if (!visible) writeSave(true);
    audio.setPageVisible(visible);
  });

  // border-neighbor chunks only change seam walls, so they rebuild one per frame
  // instead of stacking onto the edit frame (their lag is 7-20 ms — invisible)
  const pendingRebuilds: number[] = [];
  const rebuildAround = (tileId: number): void => {
    const t0 = performance.now();
    const primary = chunkKeyOfTile(geo, tileId);
    if (streamer.resident.has(primary)) streamer.rebuildNow(primary);
    const deg = geo.degreeOf(tileId);
    for (let k = 0; k < deg; k++) {
      const key = chunkKeyOfTile(geo, geo.neighbor(tileId, k));
      if (key !== primary && streamer.resident.has(key) && !pendingRebuilds.includes(key)) {
        pendingRebuilds.push(key);
      }
    }
    lastEditMs = performance.now() - t0;
  };

  const treeChopPower = (tool: ToolEffect): number => {
    if (tool.tool === 'echoAxe') return 2.35;
    if (tool.tool === 'stoneAxe') return 1.65;
    if (tool.tool === 'stoneHatchet') return 1.35;
    return 1;
  };

  const spawnTreeDrops = (tile: number): ResourceDropSave[] => {
    const spawned = spawnTreeWoodDrops(tile, nextDropId, groundRadiusAt(tile), WOOD_PER_TREE);
    nextDropId = spawned.nextId;
    resourceDrops = [...resourceDrops, ...spawned.drops];
    resourceDropRenderer.setDrops(resourceDrops);
    return spawned.drops;
  };

  const spawnMineDrops = (tile: number, item: ItemId, count = 1): ResourceDropSave[] => {
    const spawned = spawnMinedItemDrops(tile, nextDropId, groundRadiusAt(tile), item, count);
    nextDropId = spawned.nextId;
    resourceDrops = [...resourceDrops, ...spawned.drops];
    resourceDropRenderer.setDrops(resourceDrops);
    return spawned.drops;
  };

  const nearestTreeTileAround = (centerTile = player.tile, rings = 5): number | null => {
    const center = Math.max(0, Math.min(geo.count - 1, Math.trunc(centerTile)));
    const seen = new Set<number>([center]);
    const queue: { tile: number; ring: number }[] = [{ tile: center, ring: 0 }];
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      if (trees.hasTree(entry.tile)) return entry.tile;
      if (entry.ring >= rings) continue;
      const deg = geo.degreeOf(entry.tile);
      for (let k = 0; k < deg; k++) {
        const n = geo.neighbor(entry.tile, k);
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push({ tile: n, ring: entry.ring + 1 });
      }
    }
    return null;
  };

  const treeVisualKinds: readonly TreeVisualKind[] = ['pine', 'broadleaf', 'deadSnag', 'shrub'];

  const normalizeTreeVisualKind = (kind: unknown): TreeVisualKind | null => {
    const text = String(kind ?? '').trim();
    return treeVisualKinds.includes(text as TreeVisualKind) ? text as TreeVisualKind : null;
  };

  const findTreeTileOfKind = (kind: TreeVisualKind, startTile = player.tile): number | null => {
    const start = Math.max(0, Math.min(geo.count - 1, Math.trunc(Number.isFinite(startTile) ? startTile : player.tile)));
    for (let offset = 0; offset < geo.count; offset += 1) {
      const tile = (start + offset) % geo.count;
      if (trees.hasTree(tile) && trees.visualKindFor(tile) === kind) return tile;
    }
    return null;
  };

  const spawnAtTreeTile = (target: number): { treeTile: number; standTile: number; kind: TreeVisualKind; damage: number; treeAssets: ReturnType<typeof treeAssetDiagnostics> } | null => {
    if (target < 0 || target >= geo.count || !trees.hasTree(target)) return null;
    let stand = target;
    const deg = geo.degreeOf(target);
    for (let k = 0; k < deg; k++) {
      const nb = geo.neighbor(target, k);
      if (!trees.hasTree(nb)) { stand = nb; break; }
    }
    player.spawnAt(stand);
    facePlayerTowardTile(target);
    player.mode = 'walk';
    player.vx = 0; player.vy = 0; player.vz = 0;
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    updatePicks(player.fwdX, player.fwdY, player.fwdZ);
    return {
      treeTile: target,
      standTile: stand,
      kind: trees.visualKindFor(target),
      damage: trees.damageOf(target),
      treeAssets: treeAssetDiagnostics(),
    };
  };

  const strikeTreeTile = (tile: number): ReturnType<Trees['strike']> | null => {
    if (!trees.hasTree(tile)) return null;
    const tool = bestToolForTree(craftedItems, toolWear);
    const result = trees.strike(tile, treeChopPower(tool));
    if (!result.hit) return result;
    nextMineCooldown = tool.cooldown;
    triggerCharacterAction('chop', tool.tool ?? 'hands', toolPoseDuration(tool, tool.cooldown + 0.28));
    applyToolUse(tool, 'chop');
    rebuildAround(tile);
    markSaveDirty();
    if (result.felled) {
      const drops = spawnTreeDrops(tile);
      const droppedWood = drops.reduce((sum, drop) => sum + (drop.item === 'wood' ? drop.count : 0), 0);
      playAudio('gatherSoft');
      hud.flash(`tree felled · ${droppedWood} wood dropped`, 2.6);
    } else {
      playAudio('gatherSoft');
      const remaining = Math.max(1, Math.ceil(result.remaining));
      hud.flash(`tree cracking · ${remaining} more hit${remaining === 1 ? '' : 's'}`, 1.7);
    }
    return result;
  };

  const playerReach = (): number => (player.mode === 'fly' ? 60 : 9.5 + maxReachBonus(craftedItems));

  // shared by the center-crosshair pick and touch-tap picks
  const updatePicks = (dirx: number, diry: number, dirz: number): void => {
    const reach = playerReach();
    const p = pick(geo, layers, columns, camWorld.x, camWorld.y, camWorld.z, dirx, diry, dirz, reach + camDist);
    if (p) {
      const hitR = layers.topRadius(p.hitLayer);
      const c = geo.centers;
      const hx = c[p.hitTile * 3] * hitR - player.px;
      const hy = c[p.hitTile * 3 + 1] * hitR - player.py;
      const hz = c[p.hitTile * 3 + 2] * hitR - player.pz;
      lastPick = Math.hypot(hx, hy, hz) > reach ? null : p;
    } else {
      lastPick = null;
    }
    treePick = pickTree(geo, layers, columns, trees, camWorld.x, camWorld.y, camWorld.z, dirx, diry, dirz, reach + camDist);
  };

  const strikeMineCell = (tile: number, layer: number) => {
    const targetTile = Math.max(0, Math.min(geo.count - 1, Math.trunc(tile)));
    const targetLayer = Math.max(0, Math.min(layers.L - 1, Math.trunc(layer)));
    if (!columns.solidAt(targetTile, targetLayer)) {
      mining.clear(targetTile, targetLayer);
      return { ok: false, reason: 'not solid', tile: targetTile, layer: targetLayer, mineProgress: mineProgressDiagnostics() };
    }
    const mat = columns.materialAt(targetTile, targetLayer);
    const materialItem = materialItemForMaterial(mat);
    const tool = bestToolForMaterial(materialItem, craftedItems, toolWear);
    const needed = miningStagesForMaterial(materialItem);
    const strike = mining.strike(targetTile, targetLayer, miningPowerForTool(materialItem, tool), needed);
    nextMineCooldown = tool.cooldown;
    triggerCharacterAction('mine', tool.tool ?? materialPropForMinedMaterial(mat), toolPoseDuration(tool, tool.cooldown + 0.3));
    applyToolUse(tool, strike.mined ? 'mine' : 'crack');
    markSaveDirty();
    rebuildAround(targetTile);
    if (!strike.mined) {
      playAudio('gatherSoft');
      const remaining = Math.max(1, Math.ceil(strike.remaining));
      hud.flash(`${ITEM_DEFS[materialItem].name.toLowerCase()} cracking · ${remaining} more hit${remaining === 1 ? '' : 's'}`, 1.5);
      return { ok: true, tile: targetTile, layer: targetLayer, materialItem, strike, mined: false, mineProgress: mineProgressDiagnostics(), resourceDrops: resourceDropDiagnostics() };
    }
    const mined = columns.mine(targetTile, targetLayer);
    if (!mined) {
      mining.clear(targetTile, targetLayer);
      return { ok: false, reason: 'mine failed', tile: targetTile, layer: targetLayer, materialItem, strike, mineProgress: mineProgressDiagnostics() };
    }
    const slot = yieldSlot(mat);
    const materialDrops = slot >= 0 ? spawnMineDrops(targetTile, materialItem, 1) : [];
    playAudio('gatherSoft');
    if (materialDrops.length > 0) hud.flash(`${ITEM_DEFS[materialItem].name.toLowerCase()} chip dropped`, 1.6);
    edits++;
    rebuildAround(targetTile);
    return { ok: true, tile: targetTile, layer: targetLayer, materialItem, strike, mined: true, resourceDrops: resourceDropDiagnostics(), mineProgress: mineProgressDiagnostics() };
  };

  const tryMine = (): void => {
    nextMineCooldown = 0.17;
    // a tree in front of the terrain hit gets chopped instead
    if (treePick && (!lastPick || treePick.dist < lastPick.dist)) {
      strikeTreeTile(treePick.tile);
      treePick = null;
      return;
    }
    if (!lastPick) return;
    strikeMineCell(lastPick.hitTile, lastPick.hitLayer);
  };

  const tryPlace = (source: BuildCommandSource = 'pointer'): void => {
    if (relocationCursor) { confirmRelocationCursor(source); return; }
    if (selectedStructureItem) { tryPlaceStructure(source); return; }
    if (!lastPick || lastPick.prevTile < 0 || lastPick.prevLayer < 0) return;
    if (lastPick.prevTile === player.tile) {
      const feetK = layers.layerOfRadius(player.radius() + 0.05);
      const headK = Math.max(0, layers.layerOfRadius(player.radius() + 1.75));
      if (lastPick.prevLayer >= headK && lastPick.prevLayer <= feetK) return;
    }
    if (counts[hotbarSel] <= 0) {
      playAudio('uiDeny');
      hud.flash(`out of ${SLOTS[hotbarSel].name}`, 2);
      return;
    }
    if (columns.place(lastPick.prevTile, lastPick.prevLayer, SLOTS[hotbarSel].mat)) {
      triggerCharacterAction('build', SLOTS[hotbarSel].name, 0.42);
      playAudio('structurePlace');
      counts[hotbarSel]--;
      edits++;
      markSaveDirty();
      rebuildAround(lastPick.prevTile);
    }
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    currentUxProfile = uxManager.update({ touchEnabled: touch.enabled, gamepadActive: gamepad.active() });
    syncHudUx(currentUxProfile);
  });

  let fWas = false, gWas = false, oWas = false, eWas = false, vWas = false, bWas = false, rWas = false, qWas = false, nWas = false, zWas = false, xWas = false, escWas = false, f3Was = false, hWas = false;
  let showDiag = params.get('debug') === '1';
  let prevSel = -1;
  let lockHinted = false;
  hud.onSlotSelect = (i) => {
    hotbarSel = i;
    if (selectedStructureItem) {
      selectedStructureItem = null;
      refreshCraftingHud();
    }
  };

  const handlePlaneKey = (): void => {
    if (player.mode === 'plane') {
      player.exitPlane();
      playAudio('uiConfirm');
      hud.flash('plane stowed', 2);
      return;
    }
    if (!planeCrafted) {
      if (counts[WOOD_SLOT] >= PLANE_WOOD_COST) {
        counts[WOOD_SLOT] -= PLANE_WOOD_COST;
        planeCrafted = true;
        markSaveDirty();
        triggerCharacterAction('craft', 'planeFrame', 0.65);
        playAudio('craftConfirm');
        if (player.enterPlane()) {
          playAudio('structurePlace');
          hud.flash(currentUxProfile.inputMode === 'gamepad' || currentUxProfile.inputMode === 'hybrid'
            ? 'plane crafted + boarded · LS throttles · RS steers · Start stows'
            : touch.enabled
            ? 'plane crafted + boarded · left stick throttles · drag-look steers · plane button stows'
            : 'plane crafted + boarded · W/S throttle · look steers · E stows', 6);
        }
      } else {
        playAudio('uiDeny');
        hud.flash(currentUxProfile.inputMode === 'gamepad' || currentUxProfile.inputMode === 'hybrid'
          ? `plane needs ${PLANE_WOOD_COST} wood · ${counts[WOOD_SLOT]}/${PLANE_WOOD_COST} · X chops trees`
          : touch.enabled
          ? `plane needs ${PLANE_WOOD_COST} wood · ${counts[WOOD_SLOT]}/${PLANE_WOOD_COST} · tap trees to chop`
          : `plane needs ${PLANE_WOOD_COST} wood · ${counts[WOOD_SLOT]}/${PLANE_WOOD_COST} · chop trees with LMB`, 4);
      }
      return;
    }
    if (player.enterPlane()) playAudio('structurePlace');
    else {
      playAudio('uiDeny');
      hud.flash("can't take off from water", 2.5);
    }
  };

  const stationItems = (): InventoryItems => structureStationInventory(structures);
  const progressionState = () => pentagonProgress(discoveredPentagons, pentagonTiles);
  const facePlayerTowardTile = (tile: number): void => {
    const [ux, uy, uz] = player.up();
    const c = geo.centers;
    let fx = c[tile * 3];
    let fy = c[tile * 3 + 1];
    let fz = c[tile * 3 + 2];
    const d = fx * ux + fy * uy + fz * uz;
    fx -= ux * d;
    fy -= uy * d;
    fz -= uz * d;
    const l = Math.hypot(fx, fy, fz);
    if (l > 1e-6) {
      player.fwdX = fx / l;
      player.fwdY = fy / l;
      player.fwdZ = fz / l;
      player.pitch = 0;
      player.reorthonormalize();
    }
  };
  const shouldShowUseButton = (): boolean =>
    structures.length > 0 ||
    itemCount(counts, craftedItems, 'fishingRod') > 0 ||
    itemCount(counts, craftedItems, 'echoLantern') > 0 ||
    nearestPentagonOnTiles(nearbyTiles(1), pentagonTiles) !== null;
  const nearbyMovableStructure = (): StructureSave | null =>
    nearestStructureOnTiles(structures.filter((s) => structureDismantleBlockers(s).length === 0), nearbyStructureTiles());
  const shouldShowMoveButton = (): boolean => relocationCursor !== null || nearbyMovableStructure() !== null;
  const refreshUseButton = (): void => {
    touch.setUseVisible(shouldShowUseButton());
    touch.setMoveButton(shouldShowMoveButton(), relocationCursor !== null);
  };

  const craftingRows = (): CraftingRecipeView[] => {
    const statuses = allRecipeStatuses(counts, craftedItems, stationItems());
    craftingFocusIndex = Math.max(0, Math.min(Math.max(0, statuses.length - 1), craftingFocusIndex));
    return statuses.map((status, index) => {
      const recipe = status.recipe;
      const planeAlready = recipe.id === 'plane_frame' && planeCrafted;
      const packFrameAlready = recipe.id === 'pack_frame' && itemCount(counts, craftedItems, 'packFrame') > 0;
      const stormCloakAlready = recipe.id === 'storm_cloak' && itemCount(counts, craftedItems, 'stormCloak') > 0;
      const placeable = isPlaceableItemId(recipe.result);
      return {
        id: recipe.id,
        result: recipe.result,
        name: recipe.name,
        description: planeAlready ? 'Plane built. Press E to board or stow it.'
          : packFrameAlready ? `Pack frame fitted. Capacity +${packCapacityBonus()} is active.`
            : stormCloakAlready ? 'Storm cloak fitted. Bad-weather exposure is softened.'
            : recipe.description,
        count: recipe.count,
        owned: itemCount(counts, craftedItems, recipe.result),
        canCraft: status.canCraft && !planeAlready && !packFrameAlready && !stormCloakAlready,
        canPlace: placeable && itemCount(counts, craftedItems, recipe.result) > 0,
        selected: placeable && selectedStructureItem === recipe.result,
        focused: craftingOpen && index === craftingFocusIndex,
        focusAction: craftingFocusAction,
        station: status.station && status.station.have < status.station.need
          ? `${status.station.name} ${status.station.have}/${status.station.need}`
          : undefined,
        requirements: status.requirements.map((req) => ({ name: req.name, need: req.need, have: req.have })),
      };
    });
  };

  const craftSelected = (recipeId: string): boolean => {
    if (recipeId === 'plane_frame' && planeCrafted) {
      playAudio('uiDeny');
      hud.flash('plane already crafted · press E to board', 2.5);
      return false;
    }
    if (recipeId === 'pack_frame' && itemCount(counts, craftedItems, 'packFrame') > 0) {
      playAudio('uiDeny');
      hud.flash(`pack frame already fitted · capacity +${packCapacityBonus()}`, 2.5);
      return false;
    }
    if (recipeId === 'storm_cloak' && itemCount(counts, craftedItems, 'stormCloak') > 0) {
      playAudio('uiDeny');
      hud.flash('storm cloak already fitted', 2.5);
      return false;
    }
    const result = craftRecipe(recipeId, counts, craftedItems, stationItems());
    if (!result.ok || !result.recipe) {
      playAudio(audioEventForCraft(false));
      if (result.stationMissing) {
        hud.flash(`needs ${result.stationMissing.name.toLowerCase()}`, 2.5);
      } else if (result.missing.length > 0) {
        hud.flash(`missing ${result.missing.map((m) => `${m.name} ${m.have}/${m.need}`).join(' · ')}`, 3);
      } else {
        hud.flash('recipe unavailable', 2);
      }
      return false;
    }
    if (recipeId === 'plane_frame') {
      planeCrafted = true;
      hud.flash('plane frame crafted · press E to board', 4);
    } else if (recipeId === 'pack_frame') {
      hud.flash(`pack frame fitted · capacity ${packBurden().capacity}`, 3.5);
    } else if (recipeId === 'storm_cloak') {
      hud.flash('storm cloak fitted · bad weather softened', 3.5);
    } else {
      hud.flash(`crafted ${result.recipe.name}`, 2.5);
    }
    playAudio(audioEventForCraft(true));
    triggerCharacterAction('craft', result.recipe.result as CharacterPropId, 0.65);
    markSaveDirty();
    refreshCraftingHud();
    refreshUseButton();
    return true;
  };

  hud.onCraftSelect = craftSelected;

  const yawForTile = (tile: number): number => {
    const frame = geo.frameOf(tile);
    return Math.atan2(
      player.fwdX * frame.north[0] + player.fwdY * frame.north[1] + player.fwdZ * frame.north[2],
      player.fwdX * frame.east[0] + player.fwdY * frame.east[1] + player.fwdZ * frame.east[2],
    );
  };

  const structureSnapTarget = (_item: PlaceableItemId, tile: number, layer?: number): { layer: number; blocker: string | null } => {
    const k = layer ?? columns.groundLayerBelow(tile, layers.bounds[0]);
    const blocker: string | null = !columns.solidAt(tile, k) ? 'needs solid ground' : null;
    return { layer: k, blocker };
  };

  const placementYawOffset = (): number => placementYawTurns * STRUCTURE_YAW_STEP;
  const currentStructureSnapPreview = (): StructureSnapPreview | null => {
    if (currentPanelOwnership().worldInputBlocked || autopilot.active || !lastPick) return null;
    if (relocationCursor) {
      const target = relocationTargetStructure();
      if (!target) return null;
      const snap = structureSnapTarget(target.item, lastPick.hitTile, lastPick.hitLayer);
      return previewRelocateStructureCommand({
        structures,
        target,
        tile: lastPick.hitTile,
        layer: snap.layer,
        yaw: yawForTile(lastPick.hitTile) + placementYawOffset(),
        playerTile: player.tile,
        blocker: snap.blocker,
        topology: geo,
      });
    }
    if (selectedStructureItem) {
      const snap = structureSnapTarget(selectedStructureItem, lastPick.hitTile, lastPick.hitLayer);
      return previewPlaceStructureCommand({
        structures,
        item: selectedStructureItem,
        tile: lastPick.hitTile,
        layer: snap.layer,
        yaw: yawForTile(lastPick.hitTile) + placementYawOffset(),
        placementTurn: placementYawTurns,
        materialCounts: counts,
        craftedItems,
        creative: creativeActive,
        playerTile: player.tile,
        blocker: snap.blocker,
        topology: geo,
      });
    }
    return null;
  };

  const placementDiagnostics = () => ({
    selected: selectedStructureItem,
    turn: placementYawTurns,
    degrees: placementYawTurns * 60,
    offset: placementYawOffset(),
    targetTile: lastPick?.hitTile ?? null,
    preview: currentStructureSnapPreview(),
    relocating: relocationCursor ? {
      id: relocationCursor.id,
      item: relocationCursor.item,
      fromTile: relocationCursor.fromTile,
      turn: placementYawTurns,
    } : null,
  });

  const recordBuildCommand = (
    source: BuildCommandSource,
    verb: BuildCommandVerb,
    target: BuildCommandTarget,
    result: StructureCommandResult,
    targetStructure?: StructureSave | null,
    inventoryBefore?: number,
    inventoryAfter?: number,
  ): RuntimeBuildCommandRecord => {
    const record: RuntimeBuildCommandRecord = {
      index: ++buildCommandIndex,
      source,
      verb,
      target,
      ok: result.ok,
      action: result.action,
      message: result.message,
      item: result.item,
      id: result.id,
      tile: result.toTile ?? result.placed?.tile ?? targetStructure?.tile,
      fromTile: result.fromTile,
      fromLayer: result.fromLayer,
      toTile: result.toTile,
      toLayer: result.toLayer,
      turn: result.turn,
      mode: result.mode,
      blockers: result.blockers,
      inventoryBefore,
      inventoryAfter,
    };
    buildCommandLog.push(record);
    if (buildCommandLog.length > 80) buildCommandLog.shift();
    return record;
  };

  const buildCommandDiagnostics = () => ({
    last: buildCommandLog[buildCommandLog.length - 1] ?? null,
    log: buildCommandLog.map((entry) => ({ ...entry, blockers: entry.blockers ? [...entry.blockers] : undefined })),
  });

  const rotateBuildFacing = (turns = 1, id?: number, source: BuildCommandSource = 'debug'): boolean => {
    const delta = Math.trunc(Number.isFinite(turns) ? turns : 1);
    if (relocationCursor && id === undefined) {
      return rotateRelocationCursor(delta, source);
    }
    if (selectedStructureItem && id === undefined) {
      const result = rotateSelectedPlacementCommand(selectedStructureItem, placementYawTurns, delta);
      placementYawTurns = result.turn ?? placementYawTurns;
      lastStructureAction = result.action;
      recordBuildCommand(source, 'rotate', 'placement', result);
      hud.slotName(`place ${placeableName(selectedStructureItem)} · face ${placementYawTurns + 1}`);
      hud.flash(result.message, 1.8);
      triggerCharacterAction('build', selectedStructureItem, 0.38);
      refreshCraftingHud();
      return result.ok;
    }
    const target = id !== undefined
      ? structures.find((s) => s.id === Math.trunc(id)) ?? null
      : nearestStructureFacing(structures, nearbyStructureTiles());
    const result = rotatePlacedStructureCommand(structures, target, delta, geo);
    lastStructureAction = result.action;
    recordBuildCommand(source, 'rotate', target ? 'structure' : 'none', result, target);
    if (!result.ok) {
      playAudio('uiDeny');
      hud.flash(result.message, 1.8);
      return false;
    }
    structureRenderer.setStructures(structures);
    triggerCharacterAction('build', result.item, 0.38);
    playAudio('uiConfirm');
    markSaveDirty();
    hud.flash(result.message, 1.8);
    return true;
  };

  const placeStructureAt = (item: PlaceableItemId, tile: number, layer?: number, yaw?: number, source: BuildCommandSource = 'debug'): boolean => {
    const snap = structureSnapTarget(item, tile, layer);
    const inventoryBefore = itemCount(counts, craftedItems, item);
    const result = placeStructureCommand({
      structures,
      item,
      tile,
      layer: snap.layer,
      yaw: yaw ?? yawForTile(tile) + placementYawOffset(),
      placementTurn: placementYawTurns,
      materialCounts: counts,
      craftedItems,
      creative: creativeActive,
      playerTile: player.tile,
      blocker: snap.blocker,
      topology: geo,
    });
    recordBuildCommand(source, 'place', 'placement', result, result.placed, inventoryBefore, itemCount(counts, craftedItems, item));
    if (!result.ok || !result.placed) {
      playAudio(audioEventForPlacement(false));
      hud.flash(result.message, 2.5);
      return false;
    }
    structureRenderer.setStructures(structures);
    selectedStructureItem = result.selected ?? null;
    triggerCharacterAction('build', item, 0.52);
    playAudio(audioEventForPlacement(true));
    markSaveDirty();
    lastStructureAction = result.action;
    const score = homeScore(structures, geo);
    hud.flash(`${result.message}${score.hasHearth ? ' · hearth ready' : ''}`, 3);
    refreshCraftingHud();
    refreshUseButton();
    return true;
  };

  const tryPlaceStructure = (source: BuildCommandSource = 'pointer'): boolean => {
    if (!selectedStructureItem || !lastPick) return false;
    return placeStructureAt(selectedStructureItem, lastPick.hitTile, lastPick.hitLayer, undefined, source);
  };

  const relocateStructureAt = (id: number, tile: number, layer?: number, yaw?: number, source: BuildCommandSource = 'debug'): boolean => {
    const target = structures.find((s) => s.id === Math.trunc(id)) ?? null;
    const snap = target ? structureSnapTarget(target.item, tile, layer) : { layer: layer ?? 0, blocker: null };
    const result = relocateStructureCommand({
      structures,
      target,
      tile,
      layer: snap.layer,
      yaw,
      playerTile: player.tile,
      blocker: snap.blocker,
      topology: geo,
    });
    lastStructureAction = result.action;
    recordBuildCommand(source, 'relocate', target ? 'structure' : 'none', result, target);
    if (!result.ok || !result.item) {
      playAudio('uiDeny');
      hud.flash(result.message, 2.8);
      return false;
    }
    if (target && openChestId === target.id) closeStorage();
    structureRenderer.setStructures(structures);
    triggerCharacterAction('build', result.item, 0.52);
    playAudio(audioEventForPlacement(true));
    markSaveDirty();
    refreshUseButton();
    hud.flash(`${result.message} · ${placeableName(result.item)} stays ${result.turn !== undefined ? `face ${result.turn + 1}` : 'aligned'}`, 2.8);
    return true;
  };

  const relocationTargetStructure = (): StructureSave | null => {
    if (!relocationCursor) return null;
    return structures.find((s) => s.id === relocationCursor!.id) ?? null;
  };

  const relocationDiagnostics = () => {
    const target = relocationTargetStructure();
    const snap = target && lastPick ? structureSnapTarget(target.item, lastPick.hitTile, lastPick.hitLayer) : null;
    return {
      active: !!target,
      cursor: relocationCursor ? {
        id: relocationCursor.id,
        item: relocationCursor.item,
        fromTile: relocationCursor.fromTile,
        fromLayer: relocationCursor.fromLayer,
        originalTurn: relocationCursor.originalTurn,
        source: relocationCursor.source,
      } : null,
      turn: placementYawTurns,
      degrees: placementYawTurns * 60,
      targetTile: lastPick?.hitTile ?? null,
      targetLayer: snap?.layer ?? lastPick?.hitLayer ?? null,
      targetBlocker: snap?.blocker ?? null,
      preview: currentStructureSnapPreview(),
    };
  };

  const cancelRelocationCursor = (source: BuildCommandSource = 'keyboard'): boolean => {
    if (!relocationCursor) return false;
    const item = relocationCursor.item;
    lastStructureAction = `${item}:relocate:cancel`;
    relocationCursor = null;
    playAudio('uiConfirm');
    hud.slotName(selectedStructureItem ? `place ${placeableName(selectedStructureItem)}` : SLOTS[hotbarSel].name);
    hud.flash(`move cancelled · ${placeableName(item)} left in place`, 2);
    recordBuildCommand(source, 'relocate', 'structure', {
      ok: false,
      command: 'relocate',
      item,
      message: 'move cancelled',
      action: `${item}:relocate:cancel`,
    });
    refreshUseButton();
    return true;
  };

  const beginRelocationCursor = (id?: number, source: BuildCommandSource = 'keyboard'): boolean => {
    const target = id !== undefined
      ? structures.find((s) => s.id === Math.trunc(id)) ?? null
      : nearestStructureFacing(structures, nearbyStructureTiles());
    if (!target) {
      const result = relocateStructureCommand({
        structures,
        target: null,
        tile: player.tile,
        layer: columns.groundLayerBelow(player.tile, layers.bounds[0]),
        playerTile: player.tile,
        topology: geo,
      });
      lastStructureAction = result.action;
      recordBuildCommand(source, 'relocate', 'none', result);
      playAudio('uiDeny');
      hud.flash(result.message, 2.2);
      return false;
    }
    const blockers = structureDismantleBlockers(target);
    if (blockers.length > 0) {
      const result: StructureCommandResult = {
        ok: false,
        command: 'relocate',
        item: target.item,
        id: target.id,
        fromTile: target.tile,
        fromLayer: target.layer,
        message: `${placeableName(target.item).toLowerCase()} cannot be moved · ${blockers[0]}`,
        action: `${target.item}:relocate:blocked:${blockers[0]}`,
        blockers,
      };
      lastStructureAction = result.action;
      recordBuildCommand(source, 'relocate', 'structure', result, target);
      playAudio('uiDeny');
      hud.flash(result.message, 2.8);
      return false;
    }
    if (openChestId === target.id) closeStorage();
    selectedStructureItem = null;
    placementYawTurns = structureYawTurn(target.yaw);
    relocationCursor = {
      id: target.id,
      item: target.item,
      fromTile: target.tile,
      fromLayer: target.layer,
      originalTurn: structureYawTurn(target.yaw),
      source,
    };
    const result: StructureCommandResult = {
      ok: true,
      command: 'relocate',
      item: target.item,
      id: target.id,
      fromTile: target.tile,
      fromLayer: target.layer,
      turn: placementYawTurns,
      yaw: target.yaw,
      message: `moving ${placeableName(target.item).toLowerCase()}`,
      action: `${target.item}:relocate:grabbed`,
    };
    lastStructureAction = result.action;
    recordBuildCommand(source, 'relocate', 'structure', result, target);
    refreshCraftingHud();
    refreshUseButton();
    hud.slotName(`move ${placeableName(target.item)} · face ${placementYawTurns + 1}`);
    hud.flash(touch.enabled ? 'hold terrain or tap drop to set it down' : 'aim at a snap hex · RMB/RT drops · Z/X rotates', 3);
    triggerCharacterAction('build', target.item, 0.38);
    playAudio('uiOpen');
    return true;
  };

  const rotateRelocationCursor = (turns = 1, source: BuildCommandSource = 'keyboard'): boolean => {
    const target = relocationTargetStructure();
    if (!target) return false;
    const result = rotateSelectedPlacementCommand(target.item, placementYawTurns, turns);
    placementYawTurns = result.turn ?? placementYawTurns;
    lastStructureAction = `${target.item}:relocate-facing:hex face ${placementYawTurns + 1}`;
    recordBuildCommand(source, 'rotate', 'placement', {
      ...result,
      id: target.id,
      fromTile: target.tile,
      fromLayer: target.layer,
      action: lastStructureAction,
      message: `move ${placeableName(target.item).toLowerCase()} facing hex face ${placementYawTurns + 1}`,
    }, target);
    hud.slotName(`move ${placeableName(target.item)} · face ${placementYawTurns + 1}`);
    hud.flash(`move facing hex face ${placementYawTurns + 1}`, 1.6);
    triggerCharacterAction('build', target.item, 0.32);
    refreshUseButton();
    return result.ok;
  };

  const confirmRelocationCursor = (source: BuildCommandSource = 'keyboard'): boolean => {
    const target = relocationTargetStructure();
    if (!relocationCursor || !target) {
      relocationCursor = null;
      refreshUseButton();
      return false;
    }
    if (!lastPick) {
      playAudio('uiDeny');
      hud.flash('aim at a snap hex to drop it', 2.2);
      return false;
    }
    const ok = relocateStructureAt(target.id, lastPick.hitTile, lastPick.hitLayer, yawForTile(lastPick.hitTile) + placementYawOffset(), source);
    if (ok) {
      relocationCursor = null;
      refreshUseButton();
      hud.slotName(SLOTS[hotbarSel].name);
    }
    return ok;
  };

  const tryRelocationCursor = (source: BuildCommandSource = 'keyboard'): boolean => {
    return relocationCursor ? confirmRelocationCursor(source) : beginRelocationCursor(undefined, source);
  };

  const selectStructureForPlacement = (id: string, source: BuildCommandSource = 'debug'): void => {
    const result = selectStructurePlacementCommand(counts, craftedItems, id);
    lastStructureAction = result.action;
    recordBuildCommand(source, 'select', result.ok ? 'placement' : 'none', result);
    if (!result.ok || !result.item) {
      playAudio('uiDeny');
      hud.flash(result.message, 2.5);
      return;
    }
    closeStorage();
    relocationCursor = null;
    selectedStructureItem = result.selected ?? result.item;
    craftingOpen = false;
    refreshCraftingHud();
    refreshUseButton();
    hud.slotName(result.message);
    playAudio('uiOpen');
    hud.flash(touch.enabled ? 'hold terrain to set it down' : 'RMB sets it · Z/X rotates facing', 3);
  };

  hud.onPlaceSelect = selectStructureForPlacement;

  const tileEntriesAroundTile = (centerTile: number, rings = 1): TileRingEntry[] => {
    const center = Math.max(0, Math.min(geo.count - 1, Math.trunc(centerTile)));
    const seen = new Set<number>([center]);
    const queue: { tile: number; ring: number }[] = [{ tile: center, ring: 0 }];
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      if (entry.ring >= rings) continue;
      const deg = geo.degreeOf(entry.tile);
      for (let k = 0; k < deg; k++) {
        const n = geo.neighbor(entry.tile, k);
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push({ tile: n, ring: entry.ring + 1 });
      }
    }
    return queue;
  };

  const tilesAroundTile = (centerTile: number, rings = 1): number[] => tileEntriesAroundTile(centerTile, rings).map((entry) => entry.tile);

  const nearbyTiles = (rings = 1): number[] => tilesAroundTile(player.tile, rings);

  // No surviving structure kind blocks player traversal (that was exclusively a wall-shell
  // house-kit behavior), so the old per-frame O(n) traversal-blocker scan is removed rather
  // than optimized: structureCollisionDiagnostics now reports a constant no-blocker result.
  const structureCollisionDiagnostics = (fromTile?: number, toTile?: number) => {
    const from = Math.max(0, Math.min(geo.count - 1, Math.trunc(Number.isFinite(fromTile) ? Number(fromTile) : player.tile)));
    const fallbackTo = geo.neighbor(from, 0);
    const to = Math.max(0, Math.min(geo.count - 1, Math.trunc(Number.isFinite(toTile) ? Number(toTile) : fallbackTo)));
    return {
      fromTile: from,
      toTile: to,
      blocker: null as null,
      last: null as null,
    };
  };

  const tileRingDistance = (origin: number, tile: number): number => {
    if (tile === origin) return 0;
    const deg = geo.degreeOf(origin);
    for (let edge = 0; edge < deg; edge++) if (geo.neighbor(origin, edge) === tile) return 1;
    return 2;
  };

  const nearbyStructureTiles = (): number[] => nearbyTiles(1);

  const nearbyLandmarkTile = (): number | null => nearestPentagonOnTiles(nearbyTiles(1), pentagonTiles);

  // cos(65°): interact-facing cone half-angle. Forgiving enough that you don't have to
  // pixel-aim, tight enough that something behind or off to the side can't steal focus from
  // whatever the player is actually facing.
  const INTERACT_FACING_COS = Math.cos((65 * Math.PI) / 180);

  // Bearing of `tile` relative to the player's facing: cosine of the angle between
  // player.fwdX/Y/Z and the tile's direction projected onto the player's tangent plane. Same
  // tangent-plane projection facePlayerTowardTile() uses to aim the player at a tile, just read
  // instead of applied.
  const facingCosToTile = (tile: number): number => {
    const [ux, uy, uz] = player.up();
    const c = geo.centers;
    let bx = c[tile * 3], by = c[tile * 3 + 1], bz = c[tile * 3 + 2];
    const d = bx * ux + by * uy + bz * uz;
    bx -= ux * d; by -= uy * d; bz -= uz * d;
    const l = Math.hypot(bx, by, bz);
    if (l < 1e-6) return 1; // tile is directly underfoot — treat as fully aligned
    return (bx * player.fwdX + by * player.fwdY + bz * player.fwdZ) / l;
  };

  /**
   * Facing-aware "which nearby structure did the player mean" resolution: among candidates on
   * nearby tiles, prefer whichever is most aligned with where the player is actually facing,
   * instead of picking whatever's nearest by tile-BFS order regardless of facing direction. See
   * edit/pick.ts for the equivalent ray-marched approach mining/chopping already use for "what
   * is the player looking at" — this is the tile-anchored analogue for structures, which don't
   * need a full ray-march since each one owns exactly one tile. Falls back to the plain
   * nearest-by-tiles pick when nothing sits inside the facing cone, so interaction still works
   * when nothing nearby is in front of the player.
   */
  const nearestStructureFacing = (candidates: readonly StructureSave[], tiles: readonly number[]): StructureSave | null => {
    const tileSet = new Set(tiles);
    let best: StructureSave | null = null;
    let bestCos = -Infinity;
    for (const s of candidates) {
      if (!tileSet.has(s.tile)) continue;
      const cos = facingCosToTile(s.tile);
      if (cos > bestCos) { bestCos = cos; best = s; }
    }
    return best && bestCos >= INTERACT_FACING_COS ? best : nearestStructureOnTiles(candidates, tiles);
  };

  const currentPanelOwnership = (): PanelOwnershipSnapshot => panelOwnershipSnapshot({
    craftingOpen,
    storageOpen: openChestId !== null,
  });
  const worldInputBlockedByPanel = (): boolean => currentPanelOwnership().worldInputBlocked;
  input.setWorldInputBlocked(worldInputBlockedByPanel);
  const panelOwnerClasses = ['panel-crafting', 'panel-storage'];
  const syncPanelOwnershipBody = (): void => {
    const owner = currentPanelOwnership().activePanel;
    document.body.classList.toggle('panel-open', owner !== null);
    for (const className of panelOwnerClasses) document.body.classList.toggle(className, className === `panel-${owner}`);
  };

  const useLandmark = (tile?: number): boolean => {
    const target = tile !== undefined ? Math.trunc(tile) : nearbyLandmarkTile();
    if (target === null || target === undefined) return false;
    const result = discoverPentagon(discoveredPentagons, target, pentagonTiles);
    if (!result.ok) return false;
    triggerCharacterAction('discover', 'map', result.alreadyKnown ? 0.75 : 1.1);
    playAudio(result.alreadyKnown ? 'routeSlate' : 'landmarkAwaken');
    lastLandmarkAction = result.message;
    if (!result.alreadyKnown) markSaveDirty();
    hud.flash(lastLandmarkAction, result.alreadyKnown ? 5 : 7);
    refreshCraftingHud();
    refreshUseButton();
    return true;
  };

  const spawnAtPentagon = (index = 0, standOffInput = 4.5) => {
    const i = Math.max(0, Math.min(pentagonTiles.length - 1, Math.trunc(index)));
    const tile = pentagonTiles[i];
    if (tile === undefined) return null;
    const approachTile = geo.degreeOf(tile) > 0 ? geo.neighbor(tile, 0) : tile;
    player.spawnAt(approachTile);
    const centers = geo.centers;
    const nx = centers[tile * 3];
    const ny = centers[tile * 3 + 1];
    const nz = centers[tile * 3 + 2];
    let ax = centers[approachTile * 3] - nx;
    let ay = centers[approachTile * 3 + 1] - ny;
    let az = centers[approachTile * 3 + 2] - nz;
    const radial = ax * nx + ay * ny + az * nz;
    ax -= radial * nx;
    ay -= radial * ny;
    az -= radial * nz;
    let al = Math.hypot(ax, ay, az);
    if (al < 1e-6) {
      const frame = geo.frameOf(tile);
      ax = frame.east[0];
      ay = frame.east[1];
      az = frame.east[2];
      al = 1;
    }
    ax /= al;
    ay /= al;
    az /= al;
    const ground = layers.topRadius(columns.groundLayerBelow(tile, layers.bounds[0]));
    const r = Math.max(ground + 0.08, WATER_SURFACE + 0.45);
    const standOff = Math.max(2.5, Math.min(12, Number.isFinite(standOffInput) ? Number(standOffInput) : 4.5));
    player.px = nx * r + ax * standOff;
    player.py = ny * r + ay * standOff;
    player.pz = nz * r + az * standOff;
    const pr = Math.hypot(player.px, player.py, player.pz) || 1;
    player.px *= r / pr;
    player.py *= r / pr;
    player.pz *= r / pr;
    player.tile = geo.tileOf(player.px, player.py, player.pz);
    player.fwdX = -ax;
    player.fwdY = -ay;
    player.fwdZ = -az;
    player.mode = 'walk';
    player.vx = 0; player.vy = 0; player.vz = 0;
    player.grounded = true;
    player.submerged = Math.max(0, WATER_SURFACE - player.radius());
    player.reorthonormalize();
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    refreshUseButton();
    return pentagonLandmark(tile, pentagonTiles, discoveredPentagons);
  };

  const waterNearTile = (tile: number, rings = 1): boolean =>
    tilesAroundTile(tile, rings).some((nearby) => columns.heightOf(nearby) <= SEA_LEVEL_HEIGHT + 0.9);

  const nearestFishingWaterTile = (tile: number, rings = 2): number | null => {
    let best: number | null = null;
    let bestDot = -Infinity;
    const origin = tile * 3;
    for (const nearby of tilesAroundTile(tile, rings)) {
      if (columns.heightOf(nearby) > SEA_LEVEL_HEIGHT + 0.9) continue;
      const dot = geo.centers[origin] * geo.centers[nearby * 3]
        + geo.centers[origin + 1] * geo.centers[nearby * 3 + 1]
        + geo.centers[origin + 2] * geo.centers[nearby * 3 + 2];
      if (dot > bestDot) {
        bestDot = dot;
        best = nearby;
      }
    }
    return best;
  };

  const dockNearTile = (tile: number, rings = 1): StructureSave | null => {
    const local = new Set(tilesAroundTile(tile, rings));
    return structures.find((s) => s.item === 'dockSegment' && local.has(s.tile)) ?? null;
  };

  const nearDock = (): boolean => dockNearTile(player.tile, 1) !== null;

  const nearFishingWater = (): boolean => waterNearTile(player.tile, 2) || nearDock();

  const addCraftedDebugItem = (item: ItemId, amount: number): void => {
    const n = Math.max(0, Math.trunc(amount));
    if (n <= 0) return;
    const materialSlot = SLOTS.findIndex((slot) => slot.name === item);
    if (materialSlot >= 0) {
      counts[materialSlot] = Math.max(0, Math.trunc(counts[materialSlot] ?? 0) + n);
    } else {
      craftedItems[item] = Math.max(0, Math.trunc(craftedItems[item] ?? 0) + n);
    }
    refreshUseButton();
  };

  const setDebugItemCount = (item: unknown, amount: unknown) => {
    if (typeof item !== 'string' || !(item in ITEM_DEFS)) return { ok: false, reason: 'unknown item', item };
    const id = item as ItemId;
    const next = Math.max(0, Math.trunc(Number.isFinite(amount) ? Number(amount) : 0));
    const materialSlot = SLOTS.findIndex((slot) => slot.name === id);
    if (materialSlot >= 0) {
      counts[materialSlot] = next;
    } else if (next > 0) {
      craftedItems[id] = next;
    } else {
      delete craftedItems[id];
    }
    refreshCraftingHud();
    refreshUseButton();
    markSaveDirty();
    return { ok: true, item: id, count: itemCount(counts, craftedItems, id) };
  };

  const foodCounts = () => ({
    bait: itemCount(counts, craftedItems, 'bait'),
    seeds: itemCount(counts, craftedItems, 'seeds'),
    compost: itemCount(counts, craftedItems, 'compost'),
    berries: itemCount(counts, craftedItems, 'berries'),
    caveMushroom: itemCount(counts, craftedItems, 'caveMushroom'),
    snowHerb: itemCount(counts, craftedItems, 'snowHerb'),
    kelp: itemCount(counts, craftedItems, 'kelp'),
    reeds: itemCount(counts, craftedItems, 'reeds'),
    rawFish: itemCount(counts, craftedItems, 'rawFish'),
    cookedFish: itemCount(counts, craftedItems, 'cookedFish'),
    campMeal: itemCount(counts, craftedItems, 'campMeal'),
    trailRation: itemCount(counts, craftedItems, 'trailRation'),
    expeditionStew: itemCount(counts, craftedItems, 'expeditionStew'),
  });

  const currentWeather = () => weatherAt(timeState, weatherState, player.tile, player.radius() - PLANET_RADIUS, player.submerged);

  const currentWeatherProtection = () => weatherProtectionForInventory(craftedItems, currentWeather());
  const survivalSnapshot = () => ({
    ...survivalReport(survivalState, currentWeather()),
    weatherProtection: currentWeatherProtection(),
  });

  const currentFishSchool = () => {
    return fishSchoolAt({
      tile: player.tile,
      day: timeState.day,
      minute: timeState.minute,
      nearWater: nearFishingWater(),
      dock: nearDock(),
      bait: itemCount(counts, craftedItems, 'bait'),
      weatherKind: currentWeather().kind,
      caveKind: currentNaturalVoid()?.kind ?? null,
    });
  };

  const fishVisualScenarioSlugs: readonly KilnFishSkinSlug[] = [
    'fish-shore-minnow',
    'fish-storm-runner',
    'fish-cave-shimmer',
    'creature-driftjelly',
    'fish-reed-fry',
  ];

  const debugFishVisualTile = () => {
    let visualTile = nearestFishingWaterTile(player.tile, 8) ?? player.tile;
    let standTile = visualTile;
    let standScore = Infinity;
    let bestScore = Infinity;
    for (const entry of tileEntriesAroundTile(player.tile, 8)) {
      const candidate = Math.max(0, Math.min(geo.count - 1, Math.trunc(entry.tile)));
      const waterHeight = columns.heightOf(candidate);
      if (waterHeight > SEA_LEVEL_HEIGHT + 0.9) continue;
      for (let edge = 0; edge < geo.degreeOf(candidate); edge += 1) {
        const neighbor = geo.neighbor(candidate, edge);
        const height = columns.heightOf(neighbor);
        if (height <= SEA_LEVEL_HEIGHT + 0.45) continue;
        const shoreHeight = Math.abs(height - (SEA_LEVEL_HEIGHT + 0.9));
        const waterDepth = Math.abs(waterHeight - SEA_LEVEL_HEIGHT);
        const treePenalty = trees.hasTree(neighbor) ? 2.5 : 0;
        const wallPenalty = height > SEA_LEVEL_HEIGHT + 5 ? 5 : 0;
        const score = entry.ring * 0.18 + shoreHeight + waterDepth * 0.35 + treePenalty + wallPenalty;
        if (score < bestScore) {
          bestScore = score;
          standScore = score;
          visualTile = candidate;
          standTile = neighbor;
        }
      }
    }
    if (standTile !== player.tile) {
      player.spawnAt(standTile);
      player.vx = 0; player.vy = 0; player.vz = 0;
      player.mode = 'walk';
      player.grounded = true;
      player.submerged = Math.max(0, WATER_SURFACE - player.radius());
      player.planeSpeed = 0;
      player.stepSmooth = 0;
    }
    facePlayerTowardTile(visualTile);
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    return { visualTile, standTile, standScore };
  };

  const debugSetFishVisualScenario = (target: unknown) => {
    const slug = fishVisualScenarioSlugs.includes(target as KilnFishSkinSlug) ? target as KilnFishSkinSlug : null;
    if (!slug) return { ok: false, reason: 'unknown fish skin slug', target, allowed: fishVisualScenarioSlugs };
    const visual = debugFishVisualTile();
    const contextFor = (tile: number, day: number, minute: number) => {
      if (slug === 'fish-cave-shimmer') {
        return fishSchoolAt({ tile, day, minute, nearWater: false, bait: 1, weatherKind: 'clear', caveKind: 'seaCave' });
      }
      if (slug === 'fish-storm-runner') {
        return fishSchoolAt({ tile, day, minute, nearWater: true, bait: 0, weatherKind: 'storm', caveKind: null });
      }
      if (slug === 'creature-driftjelly' || slug === 'fish-reed-fry') {
        return fishSchoolAt({ tile, day, minute, nearWater: true, bait: 0, weatherKind: 'clear', caveKind: null });
      }
      return fishSchoolAt({ tile, day, minute, nearWater: true, bait: 1, weatherKind: 'clear', caveKind: null });
    };
    for (let day = 0; day <= 3; day += 1) {
      for (let minute = 0; minute < 24 * 60; minute += 30) {
        const school = contextFor(visual.visualTile, day, minute);
        if (kilnFishSkinForSchool(school) !== slug) continue;
        fishVisualOverride = {
          id: 900000 + fishVisualScenarioSlugs.indexOf(slug) * 10000 + visual.visualTile,
          tile: visual.visualTile,
          school,
        };
        return { ok: true, slug, site: fishVisualOverride, context: { ...visual, day, minute } };
      }
    }
    return { ok: false, reason: 'no existing fishing context maps to target fish skin', slug };
  };

  const setDebugBaitCount = (amount: number): void => {
    const next = Math.max(0, Math.trunc(amount));
    if (next > 0) craftedItems.bait = next;
    else delete craftedItems.bait;
    refreshCraftingHud();
  };

  const debugSetLiveFishScenario = (target: unknown) => {
    const slug = fishVisualScenarioSlugs.includes(target as KilnFishSkinSlug) ? target as KilnFishSkinSlug : null;
    if (!slug) return { ok: false, reason: 'unknown fish skin slug', target, allowed: fishVisualScenarioSlugs };
    fishVisualOverride = null;
    const phaseSamples = Array.from({ length: 48 }, (_, i) => i / 48);
    const minuteSamples = [360, 480, 600, 720, 840, 960, 1080, 1260];
    const applyCandidate = (tile: number, day: number, minute: number, phase: number, bait: number) => {
      relocatePlayerToTile(tile);
      Object.assign(timeState, normalizeTimeState({ day, minute }));
      Object.assign(weatherState, normalizeWeatherState({ phase }));
      setDebugBaitCount(bait);
      const visualTile = nearestFishingWaterTile(player.tile, 2) ?? player.tile;
      facePlayerTowardTile(visualTile);
      streamer.refreshDesired(...player.up(), player.altitudeAGL());
      const school = currentFishSchool();
      const site = currentFishVisualSite();
      return {
        tile: player.tile,
        visualTile: site?.tile ?? visualTile,
        day: timeState.day,
        minute: timeState.minute,
        phase: weatherState.phase,
        bait: itemCount(counts, craftedItems, 'bait'),
        weather: currentWeather(),
        naturalVoid: currentNaturalVoid(),
        nearWater: nearFishingWater(),
        nearDock: nearDock(),
        school,
        site,
        mappedSlug: kilnFishSkinForSchool(school),
      };
    };

    if (slug === 'fish-cave-shimmer') {
      setDebugBaitCount(1);
      Object.assign(timeState, normalizeTimeState({ day: 0, minute: 720 }));
      Object.assign(weatherState, normalizeWeatherState({ phase: 0 }));
      const feature = spawnAtNaturalFeature('seaCave');
      if (!feature) return { ok: false, reason: 'no sea cave feature found for live fish setup', slug };
      facePlayerTowardTile(feature.tile);
      streamer.refreshDesired(...player.up(), player.altitudeAGL());
      const school = currentFishSchool();
      const site = currentFishVisualSite();
      const mappedSlug = kilnFishSkinForSchool(school);
      return {
        ok: mappedSlug === slug && !!site,
        slug,
        setup: 'live-sea-cave',
        feature,
        tile: player.tile,
        visualTile: site?.tile ?? player.tile,
        day: timeState.day,
        minute: timeState.minute,
        phase: weatherState.phase,
        bait: itemCount(counts, craftedItems, 'bait'),
        weather: currentWeather(),
        naturalVoid: currentNaturalVoid(),
        nearWater: nearFishingWater(),
        nearDock: nearDock(),
        school,
        site,
        mappedSlug,
      };
    }

    const bait = slug === 'fish-shore-minnow' ? 1 : 0;
    for (let tile = 0; tile < geo.count; tile += 1) {
      const height = columns.heightOf(tile);
      if (height <= SEA_LEVEL_HEIGHT + 0.35) continue;
      if (!waterNearTile(tile, 2)) continue;
      for (let day = 0; day <= 3; day += 1) {
        for (const minute of minuteSamples) {
          for (const phase of phaseSamples) {
            const probe = applyCandidate(tile, day, minute, phase, bait);
            if (slug === 'fish-storm-runner' && probe.weather.kind !== 'storm') continue;
            if (slug !== 'fish-storm-runner' && probe.weather.kind === 'storm') continue;
            if (probe.mappedSlug !== slug || !probe.site) continue;
            return { ok: true, slug, setup: 'live-current-fish-school', ...probe };
          }
        }
      }
    }
    return {
      ok: false,
      reason: 'no live tile/time/weather context reached requested fish skin',
      slug,
    };
  };

  const currentFishVisualSite = (): FishSchoolVisualSite | null => {
    if (fishVisualOverride) return fishVisualOverride;
    const school = currentFishSchool();
    if (school.kind === 'none' || school.catchCount <= 0) return null;
    const waterTile = nearestFishingWaterTile(player.tile, 2)
      ?? (school.kind === 'cave' ? player.tile : null)
      ?? dockNearTile(player.tile, 1)?.tile
      ?? null;
    if (waterTile === null) return null;
    return {
      id: waterTile * 17 + timeState.day * 131 + Math.trunc(timeState.minute / 30),
      tile: waterTile,
      school,
    };
  };

  const fishingCastLabel = (): string => {
    if (currentUxProfile.inputMode === 'gamepad' || currentUxProfile.inputMode === 'hybrid') return 'B cast';
    if (touch.enabled) return 'use cast';
    return 'R cast';
  };

  const currentFishingCue = () => {
    const nearWater = nearFishingWater();
    const dock = nearDock();
    const school = currentFishSchool();
    const cue = fishingCueForSchool(school, {
      hasRod: itemCount(counts, craftedItems, 'fishingRod') > 0,
      nearWater,
      nearDock: dock,
      inPlane: player.mode === 'plane',
      castLabel: fishingCastLabel(),
    });
    const renderer = fishSchoolRenderer.stats();
    const visibleSchool = renderer.active > 0
      && (renderer.fallbackVisible > 0 || renderer.pointSchoolSprites > 0);
    return {
      ...cue,
      nearWater,
      nearDock: dock,
      hasRod: itemCount(counts, craftedItems, 'fishingRod') > 0,
      inputLabel: fishingCastLabel(),
      visual: {
        slug: renderer.slug,
        visibleSchool,
        points: renderer.pointSchoolSprites,
        nearBoids: renderer.nearBoidSprites,
        swimPathBeads: renderer.swimPathBeads,
        motionBand: renderer.motionBand,
      },
    };
  };

  const currentForage = () => forageAt({
    tile: player.tile,
    day: timeState.day,
    minute: timeState.minute,
    height: player.radius() - PLANET_RADIUS,
    nearWater: nearFishingWater(),
    weatherKind: currentWeather().kind,
    caveKind: currentNaturalVoid()?.kind ?? null,
  });

  const nearLitWarmth = (): boolean => {
    const tiles = new Set(nearbyTiles(1));
    return structures.some((s) => s.item === 'campfire' && s.state?.lit === true && tiles.has(s.tile));
  };

  const shelterAtPlayer = () => {
    const home = homeScore(structures, geo);
    const inside = home.shelter.tiles.includes(player.tile);
    return {
      home,
      sheltered: inside && home.shelter.protected,
      functionalShelter: inside && home.shelter.functional,
    };
  };

  const tryEatPackedFood = (): boolean => {
    const result = eatBestFood(craftedItems, survivalState);
    lastSurvivalAction = result.message;
    if (!result.ok) {
      playAudio(audioEventForFoodAction('eat', false));
      hud.flash(result.message, 2.2);
      return false;
    }
    triggerCharacterAction('interact', result.item as CharacterPropId, 0.9);
    playAudio(audioEventForFoodAction('eat', true));
    markSaveDirty();
    hud.flash(result.message, 2.8);
    refreshCraftingHud();
    return true;
  };

  const tryForage = (): boolean => {
    if (player.mode === 'plane') {
      lastFoodAction = 'forage:in plane';
      return false;
    }
    const report = currentForage();
    const result = applyForage(craftedItems, report);
    lastFoodAction = `forage:${report.kind}:${result.message}`;
    if (!result.ok) {
      hud.flash(result.message, 2.2);
      return false;
    }
    triggerCharacterAction('farm', result.item as CharacterPropId, 0.7);
    playAudio(audioEventForFoodAction('forage', true));
    markSaveDirty();
    hud.flash(`${result.message} · ${report.label}`, 3);
    refreshCraftingHud();
    return true;
  };

  const currentNaturalVoid = () => {
    const eye = player.eye();
    const r = Math.hypot(eye[0], eye[1], eye[2]);
    const layer = layers.layerOfRadius(r);
    const sample = columns.naturalVoidAt(player.tile, layer);
    return sample ? { layer, ...sample } : null;
  };

  const caveKindLabel = (kind: NaturalVoidKind): string =>
    kind === 'dryCave' ? 'dry cave' : kind === 'seaCave' ? 'sea cave' : 'natural arch';

  type NearbyCaveSignal = {
    tile: number;
    distance: number;
    layer: number;
    kind: NaturalVoidKind;
    label?: string;
    depth: number;
    flooded: boolean;
    spring?: boolean;
    clearance?: number;
    mouth?: boolean;
  };

  const nearbyCaveSignal = (originTile = player.tile, originLayer?: number): NearbyCaveSignal | null => {
    const current = originTile === player.tile ? currentNaturalVoid() : null;
    if (current) {
      return { tile: originTile, distance: 0, layer: current.layer, kind: current.kind, depth: current.depth, flooded: current.flooded, spring: current.spring === true };
    }
    const playerLayer = originLayer ?? layers.layerOfRadius(layers.topRadius(columns.groundLayerBelow(originTile, layers.bounds[0])) + 0.2);
    let best: NearbyCaveSignal | null = null;
    const tiles = tilesAroundTile(originTile, 2);
    for (const tile of tiles) {
      const distance = tileRingDistance(originTile, tile);
      for (let dk = -8; dk <= NATURAL_VOID_SCAN_LAYERS; dk++) {
        const layer = playerLayer + dk;
        const sample = columns.naturalVoidAt(tile, layer);
        if (!sample) continue;
        const kindPenalty = sample.kind === 'arch' ? 250 : 0;
        const score = kindPenalty + distance * 100 + Math.abs(dk) - sample.depth * 0.05;
        const bestKindPenalty = best?.kind === 'arch' ? 250 : 0;
        const bestScore = best ? bestKindPenalty + best.distance * 100 + Math.abs(best.layer - playerLayer) - best.depth * 0.05 : Infinity;
        if (score < bestScore) best = { tile, distance, layer, kind: sample.kind, depth: sample.depth, flooded: sample.flooded, spring: sample.spring === true };
      }
    }
    return best;
  };

  const weatherReportForStructure = (structure: StructureSave) => {
    const height = layers.topRadius(Math.max(0, Math.min(layers.L - 1, structure.layer))) - PLANET_RADIUS;
    return weatherAt(timeState, weatherState, structure.tile, height, 0);
  };

  const rainCisternContextFor = (cistern: StructureSave): RainCisternContext => weatherReportForStructure(cistern);

  const waystoneContextFor = (stone: StructureSave): WaystoneContext => {
    const shelter = homeScore(structures, geo).shelter;
    const cave = nearbyCaveSignal(stone.tile, stone.layer);
    const height = layers.topRadius(Math.max(0, Math.min(layers.L - 1, stone.layer))) - PLANET_RADIUS;
    const nearWater = waterNearTile(stone.tile, 1);
    const weather = weatherReportForStructure(stone);
    const forage = forageAt({
      tile: stone.tile,
      day: timeState.day,
      minute: timeState.minute,
      height,
      nearWater,
      weatherKind: weather.kind,
      caveKind: cave?.kind ?? null,
    });
    return {
      home: shelter.tiles.includes(stone.tile) || structures.some((s) => s.item === 'bedroll' && s.state?.home === true && s.tile === stone.tile),
      cave: cave !== null && cave.distance <= 1,
      nearWater,
      forage: forage.kind !== 'none' && forage.strength > 0.18,
    };
  };

  const weatherVaneContextFor = (vane: StructureSave): WeatherVaneContext => {
    const weather = weatherReportForStructure(vane);
    return { kind: weather.kind, label: weather.label, intensity: weather.intensity };
  };

  const fishTrapContextFor = (trap: StructureSave): FishTrapContext => {
    const cave = nearbyCaveSignal(trap.tile, trap.layer);
    const nearWater = waterNearTile(trap.tile, 2) || dockNearTile(trap.tile, 1) !== null || cave?.kind === 'seaCave';
    const weather = weatherReportForStructure(trap);
    return {
      day: timeState.day,
      minute: timeState.minute,
      nearWater,
      school: fishSchoolAt({
        tile: trap.tile,
        day: timeState.day,
        minute: timeState.minute,
        nearWater,
        dock: dockNearTile(trap.tile, 1) !== null,
        bait: itemCount(counts, craftedItems, 'bait'),
        weatherKind: weather.kind,
        caveKind: cave?.kind ?? null,
      }),
    };
  };

  const currentChestStorage = (): ChestStoragePanelView | null => {
    if (openChestId === null) return null;
    const chest = structures.find((s) => s.id === openChestId && s.item === 'chest') ?? null;
    if (!chest) return null;
    const view = chestStorageView(chest, counts);
    if (!view) return null;
    storageFocusIndex = Math.max(0, Math.min(Math.max(0, view.rows.length - 1), storageFocusIndex));
    return {
      ...view,
      rows: view.rows.map((row, index) => ({
        ...row,
        focused: index === storageFocusIndex,
        focusAction: storageFocusAction,
      })),
    };
  };

  const closeStorage = (): void => {
    openChestId = null;
    hud.setStorage(null, false);
  };

  const refreshStorage = (): void => {
    if (openChestId === null) {
      hud.setStorage(null, false);
      return;
    }
    const view = currentChestStorage();
    if (!view) {
      closeStorage();
      return;
    }
    hud.setStorage(view, true);
  };

  const toggleCraftingPanel = (): void => {
    if (openChestId !== null) closeStorage();
    craftingOpen = !craftingOpen;
    if (craftingOpen) {
      craftingFocusIndex = 0;
      craftingFocusAction = 'craft';
    }
    refreshCraftingHud();
    playAudio(craftingOpen ? 'uiOpen' : 'uiConfirm');
    if (craftingOpen) hud.flash('crafting opened', 1.4);
  };

  const touchCraftButton = document.getElementById('btn-craft');
  touchCraftButton?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleCraftingPanel();
  });

  const openChestStorage = (id: number): boolean => {
    const chest = structures.find((s) => s.id === Math.trunc(id) && s.item === 'chest') ?? null;
    if (!chest) {
      playAudio('uiDeny');
      hud.flash('no chest to open', 2);
      return false;
    }
    openChestId = chest.id;
    storageFocusIndex = 0;
    storageFocusAction = 'depositOne';
    craftingOpen = false;
    refreshCraftingHud();
    refreshStorage();
    const view = currentChestStorage();
    lastStructureAction = `chest:open:${view?.summary ?? 'storage open'}`;
    triggerCharacterAction('interact', 'chest', 0.55);
    playAudio('uiOpen');
    hud.flash(view?.summary ?? 'chest opened', 2.2);
    return true;
  };

  const transferChestStorage = (chestId: number, item: string, action: ChestTransferAction): boolean => {
    const chest = structures.find((s) => s.id === Math.trunc(chestId) && s.item === 'chest') ?? null;
    if (!chest) {
      closeStorage();
      playAudio('uiDeny');
      hud.flash('chest is gone', 2);
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(ITEM_DEFS, item) || ITEM_DEFS[item as ItemId].kind !== 'material') {
      playAudio('uiDeny');
      hud.flash('chest only stores terrain materials', 2);
      return false;
    }
    const material = item as MaterialItemId;
    const result = transferChestMaterial(chest, counts, material, action);
    lastStructureAction = `chest:${result.mode ?? 'inspect'}:${result.message}`;
    if (result.ok) {
      triggerCharacterAction('interact', material, 0.45);
      playAudio(audioEventForStructure('chest', result.mode, true));
      markSaveDirty();
      refreshCraftingHud();
      structureRenderer.setStructures(structures);
      refreshStorage();
      hud.flash(result.message, 1.8);
      return true;
    }
    playAudio(audioEventForStructure('chest', result.mode, false));
    hud.flash(result.message, 1.8);
    refreshStorage();
    return false;
  };

  hud.onStorageClose = () => {
    closeStorage();
    playAudio('uiConfirm');
  };
  hud.onStorageTransfer = transferChestStorage;

  const storageActionEnabled = (row: ChestStoragePanelView['rows'][number], action: ChestTransferAction): boolean =>
    action === 'depositOne' || action === 'depositAll' ? row.canDeposit : row.canWithdraw;

  const handleGamepadPanelInput = (gp: GamepadFrame): boolean => {
    const hasPanelInput = gp.menuUp || gp.menuDown || gp.menuLeft || gp.menuRight || gp.confirm || gp.cancel;
    if (!hasPanelInput) return false;

    if (openChestId !== null) {
      const view = currentChestStorage();
      if (!view) {
        closeStorage();
        return true;
      }
      if (gp.cancel) {
        closeStorage();
        playAudio('uiConfirm');
        return true;
      }
      if (gp.menuUp || gp.menuDown) {
        storageFocusIndex = Math.max(0, Math.min(view.rows.length - 1, storageFocusIndex + (gp.menuDown ? 1 : -1)));
        refreshStorage();
        return true;
      }
      if (gp.menuLeft || gp.menuRight) {
        const index = Math.max(0, STORAGE_FOCUS_ACTIONS.indexOf(storageFocusAction));
        const delta = gp.menuRight ? 1 : -1;
        storageFocusAction = STORAGE_FOCUS_ACTIONS[(index + delta + STORAGE_FOCUS_ACTIONS.length) % STORAGE_FOCUS_ACTIONS.length];
        refreshStorage();
        return true;
      }
      if (gp.confirm) {
        const row = view.rows[storageFocusIndex];
        if (!row || !storageActionEnabled(row, storageFocusAction)) {
          playAudio('uiDeny');
          hud.flash('that chest move is unavailable', 1.8);
          return true;
        }
        transferChestStorage(view.id, row.item, storageFocusAction);
        return true;
      }
      return true;
    }

    if (craftingOpen) {
      const rows = craftingRows();
      if (gp.cancel) {
        craftingOpen = false;
        refreshCraftingHud();
        playAudio('uiConfirm');
        return true;
      }
      if (gp.menuUp || gp.menuDown) {
        craftingFocusIndex = Math.max(0, Math.min(rows.length - 1, craftingFocusIndex + (gp.menuDown ? 1 : -1)));
        refreshCraftingHud();
        return true;
      }
      if (gp.menuLeft || gp.menuRight) {
        craftingFocusAction = craftingFocusAction === 'craft' ? 'place' : 'craft';
        refreshCraftingHud();
        return true;
      }
      if (gp.confirm) {
        const row = rows[craftingFocusIndex];
        if (!row) return true;
        if (craftingFocusAction === 'place') selectStructureForPlacement(row.result);
        else craftSelected(row.id);
        refreshCraftingHud();
        return true;
      }
      return true;
    }

    return false;
  };

  const homeBedrollStructure = (): StructureSave | null =>
    structures.find((s) => s.item === 'bedroll' && s.state?.home === true) ?? null;

  const relocatePlayerToTile = (tile: number): void => {
    player.spawnAt(Math.max(0, Math.min(geo.count - 1, Math.trunc(tile))));
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.mode = 'walk';
    player.grounded = true;
    player.submerged = 0;
    player.planeSpeed = 0;
    player.stepSmooth = 0;
    player.reorthonormalize();
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    refreshUseButton();
  };

  const debugSetPlayerTile = (tile: number) => {
    relocatePlayerToTile(tile);
    return { tile: player.tile, mode: player.mode, grounded: player.grounded };
  };

  const debugWalkTowardTile = (tile: number, seconds = 1.35) => {
    const target = Math.max(0, Math.min(geo.count - 1, Math.trunc(Number.isFinite(tile) ? tile : player.tile)));
    const start = player.tile;
    facePlayerTowardTile(target);
    const frameDt = 1 / 60;
    const frames = Math.max(1, Math.min(240, Math.ceil(Math.max(0.05, Number.isFinite(seconds) ? seconds : 1.35) / frameDt)));
    for (let i = 0; i < frames; i++) {
      player.update(frameDt, {
        forward: 1,
        strafe: 0,
        upDown: 0,
        sprint: false,
        jump: false,
        swimUp: false,
      });
      if (player.tile !== start) break;
    }
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    return {
      startTile: start,
      targetTile: target,
      endTile: player.tile,
      crossed: player.tile !== start,
      blocked: false,
      collision: structureCollisionDiagnostics(start, target),
    };
  };

  // Debug/dev-only rescue: force-relocates the player home/to spawn. No longer called from the
  // animate loop — normal exposure pressure is a HUD warning + ongoing stamina drain (see
  // isExposureWarning/isExposureCritical below), never a silent automatic teleport. Reachable
  // only via the explicit debug.collapse(force) console hook.
  const triggerCollapseRecovery = (reason = 'exposure', force = false) => {
    if (!force && (creativeActive || !isExposureCritical(survivalState))) return null;
    const bedroll = homeBedrollStructure();
    const home = homeScore(structures, geo);
    const result = recoverFromCollapse(survivalState, timeState, weatherState, {
      ...home.shelter,
      hasHome: bedroll !== null,
    });
    relocatePlayerToTile(bedroll?.tile ?? spawnTile);
    closeStorage();
    craftingOpen = false;
    refreshCraftingHud();
    lastSurvivalAction = `${reason}:${result.message}`;
    triggerCharacterAction('sleep', bedroll ? 'bedroll' : 'hands', 1.05);
    playAudio(bedroll ? 'hearthRest' : 'uiDeny');
    markSaveDirty();
    hud.flash(result.message, 5);
    return result;
  };

  const useEchoLantern = (): boolean => {
    if (itemCount(counts, craftedItems, 'echoLantern') <= 0) return false;
    const signal = nearbyCaveSignal();
    if (!signal) return false;
    const label = signal.label ?? caveKindLabel(signal.kind);
    const clearance = signal.clearance !== undefined ? ` · clearance ${signal.clearance} cells` : '';
    const spring = signal.spring ? ' · spring seep' : '';
    lastCaveAction = `echo lantern: ${label} ${signal.distance === 0 ? 'here' : `${signal.distance} ring${signal.distance === 1 ? '' : 's'} away`}${signal.mouth ? ' · mouth' : ''}${spring}`;
    triggerCharacterAction('discover', 'echoLantern', 0.85);
    playAudio('caveRead');
    hud.flash(`${label} resonance · depth ${signal.depth.toFixed(1)} m${clearance}${signal.flooded ? ' · flooded' : ''}${spring}`, 3.5);
    return true;
  };

  const tryFish = (force = false): boolean => {
    if (player.mode === 'plane' && !force) {
      const cue = currentFishingCue();
      playAudio(audioEventForFoodAction('fish', false));
      hud.flash(cue.detail.replace(/\.$/, ''), 2);
      lastFoodAction = 'fish:in plane';
      return true;
    }
    if (!force && itemCount(counts, craftedItems, 'fishingRod') <= 0) {
      const cue = currentFishingCue();
      playAudio(audioEventForFoodAction('fish', false));
      hud.flash(cue.detail.replace(/\.$/, ''), 3);
      lastFoodAction = 'fish:no rod';
      return cue.showInVitals;
    }
    if (!force && !nearFishingWater()) {
      const cue = currentFishingCue();
      playAudio(audioEventForFoodAction('fish', false));
      hud.flash(cue.detail.replace(/\.$/, ''), 2.5);
      lastFoodAction = 'fish:no water';
      return false;
    }
    if (force) {
      addCraftedDebugItem('rawFish', 1);
      triggerCharacterAction('fish', 'fishingRod', 0.95);
      playAudio(audioEventForFoodAction('fish', true));
      lastFoodAction = 'fish:debug raw fish';
      markSaveDirty();
      hud.flash('caught raw fish · cook it at a lit campfire', 3);
      refreshCraftingHud();
      return true;
    }
    const school = currentFishSchool();
    const cue = currentFishingCue();
    const result = applyFishingCatch(craftedItems, school);
    lastFoodAction = `fish:${school.kind}:${result.message}`;
    if (!result.ok) {
      triggerCharacterAction('fish', 'fishingRod', 0.6);
      playAudio(audioEventForFoodAction('fish', false));
      hud.flash(cue.detail.replace(/\.$/, ''), 2.5);
      return true;
    }
    triggerCharacterAction('fish', 'fishingRod', 0.95);
    playAudio(audioEventForFoodAction('fish', true));
    markSaveDirty();
    refreshCraftingHud();
    hud.flash(`${result.message} · cook at a lit campfire`, 3.2);
    return true;
  };

  const naturalFeatureKind = (kind: unknown): NaturalVoidKind | undefined => {
    return kind === 'arch' || kind === 'dryCave' || kind === 'seaCave' ? kind : undefined;
  };

  const spawnAtNaturalFeature = (kind?: unknown) => {
    const feature = columns.naturalFeature(naturalFeatureKind(kind), player.tile) ?? columns.naturalFeature(naturalFeatureKind(kind), 0);
    if (!feature) return null;
    const floorK = columns.groundLayerBelow(feature.tile, layers.topRadius(feature.layerEnd + 1) + 0.02);
    const r = layers.topRadius(floorK) + 0.05;
    const c = geo.centers;
    player.px = c[feature.tile * 3] * r;
    player.py = c[feature.tile * 3 + 1] * r;
    player.pz = c[feature.tile * 3 + 2] * r;
    player.vx = 0; player.vy = 0; player.vz = 0;
    player.tile = feature.tile;
    player.mode = 'walk';
    player.grounded = true;
    player.submerged = Math.max(0, WATER_SURFACE - r);
    player.reorthonormalize();
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    return { ...feature, floorLayer: floorK, radius: r };
  };

  const spawnBesideNaturalFeature = (kind?: unknown) => {
    const feature = columns.naturalFeature(naturalFeatureKind(kind), player.tile) ?? columns.naturalFeature(naturalFeatureKind(kind), 0);
    if (!feature) return null;
    let stand = feature.tile;
    let score = Infinity;
    const featureHeight = columns.heightOf(feature.tile);
    for (const candidate of tilesAroundTile(feature.tile, 2)) {
      if (candidate === feature.tile) continue;
      const height = columns.heightOf(candidate);
      const waterPenalty = height < SEA_LEVEL_HEIGHT + 0.35 ? 8 : 0;
      const treePenalty = trees.hasTree(candidate) ? 5 : 0;
      const cavePenalty = columns.naturalVoidAt(candidate, feature.layer) ? 1.5 : 0;
      const s = Math.abs(height - featureHeight) + waterPenalty + treePenalty + cavePenalty;
      if (s < score) {
        score = s;
        stand = candidate;
      }
    }
    player.spawnAt(stand);
    player.vx = 0; player.vy = 0; player.vz = 0;
    player.mode = 'walk';
    player.grounded = true;
    player.submerged = Math.max(0, WATER_SURFACE - player.radius());
    player.planeSpeed = 0;
    player.stepSmooth = 0;
    facePlayerTowardTile(feature.tile);
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    updatePicks(player.fwdX, player.fwdY, player.fwdZ);
    return {
      ...feature,
      standTile: stand,
      standHeight: columns.heightOf(stand),
      standScore: score,
    };
  };

  const spawnAtSpring = () => {
    const feature = columns.naturalFeature('dryCave', player.tile, true) ?? columns.naturalFeature('dryCave', 0, true);
    if (!feature) return null;
    const floorK = columns.groundLayerBelow(feature.tile, layers.topRadius(feature.layerEnd + 1) + 0.02);
    const r = layers.topRadius(floorK) + 0.05;
    const c = geo.centers;
    player.px = c[feature.tile * 3] * r;
    player.py = c[feature.tile * 3 + 1] * r;
    player.pz = c[feature.tile * 3 + 2] * r;
    player.vx = 0; player.vy = 0; player.vz = 0;
    player.tile = feature.tile;
    player.mode = 'walk';
    player.grounded = true;
    player.submerged = Math.max(0, WATER_SURFACE - r);
    player.reorthonormalize();
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    return { ...feature, floorLayer: floorK, radius: r };
  };

  const tryDismantleStructure = (id?: number, source: BuildCommandSource = 'debug'): boolean => {
    const target = id !== undefined
      ? structures.find((s) => s.id === Math.trunc(id)) ?? null
      : nearestStructureFacing(structures, nearbyStructureTiles());
    const inventoryBefore = target ? itemCount(counts, craftedItems, target.item) : undefined;
    const result = packStructureCommand(structures, target, craftedItems, creativeActive);
    lastStructureAction = result.action;
    recordBuildCommand(source, 'pack', target ? 'structure' : 'none', result, target, inventoryBefore, result.item ? itemCount(counts, craftedItems, result.item) : inventoryBefore);
    if (!result.ok || !result.item) {
      playAudio('uiDeny');
      hud.flash(result.message, 2.8);
      return false;
    }
    if (target && openChestId === target.id) closeStorage();
    if (!creativeActive) {
      selectedStructureItem = result.selected ?? result.item;
    }
    structureRenderer.setStructures(structures);
    triggerCharacterAction('build', result.item, 0.52);
    playAudio(audioEventForPlacement(true));
    markSaveDirty();
    refreshCraftingHud();
    refreshUseButton();
    hud.flash(`${result.message}${result.inventoryReturned ? ' · returned to pack' : ''}`, 2.8);
    return true;
  };

  const useStructure = (id?: number, source: BuildCommandSource = 'debug'): boolean => {
    const target = id !== undefined
      ? structures.find((s) => s.id === Math.trunc(id)) ?? null
      : nearestStructureFacing(structures, nearbyStructureTiles());
    if (!target) {
      if (id === undefined) {
        const landmark = nearbyLandmarkTile();
        if (landmark !== null && !discoveredPentagons.has(landmark) && useLandmark(landmark)) return true;
        if (useLandmark()) return true;
        if (useEchoLantern()) return true;
        const fished = tryFish();
        if (fished) return true;
        const foraged = tryForage();
        if (foraged) return true;
        if (itemCount(counts, craftedItems, 'echoLantern') > 0) {
          lastCaveAction = 'echo lantern: quiet';
          triggerCharacterAction('discover', 'echoLantern', 0.55);
          playAudio('caveRead');
          hud.flash('echo lantern is quiet here', 2.5);
          return true;
        }
        return false;
      }
      const miss = useStructureInteractionCommand({ structures, target: null, materialCounts: counts, craftedItems });
      recordBuildCommand(source, 'use', 'none', miss);
      playAudio('uiDeny');
      hud.flash(miss.message, 2);
      lastStructureAction = miss.action;
      return false;
    }
    if (target.item === 'chest') {
      const opened = openChestStorage(target.id);
      recordBuildCommand(source, 'use', 'structure', {
        ok: opened,
        command: 'use',
        item: target.item,
        id: target.id,
        message: opened ? 'storage open' : 'storage unavailable',
        action: lastStructureAction,
        mode: 'inspect',
      }, target);
      return opened;
    }
    const command = useStructureInteractionCommand({
      structures,
      target,
      materialCounts: counts,
      craftedItems,
      topology: geo,
      waystoneContext: target.item === 'waystone' ? waystoneContextFor(target) : undefined,
      weatherVaneContext: target.item === 'weatherVane' ? weatherVaneContextFor(target) : undefined,
      rainCisternContext: target.item === 'rainCistern' ? rainCisternContextFor(target) : undefined,
      fishTrapContext: target.item === 'fishTrap' || target.item === 'shoreNet' ? fishTrapContextFor(target) : undefined,
    });
    const result = command.interaction!;
    let feedbackMessage = result.message;
    let hearthSupperPrepared = false;
    lastStructureAction = command.action;
    recordBuildCommand(source, 'use', 'structure', command, target);
    if (command.foodAction) lastFoodAction = command.foodAction;
    if (result.ok) {
      if (result.mode === 'home') {
        const homeBeforeRest = homeScore(structures, geo);
        const rest = restAtShelter(survivalState, timeState, weatherState, homeBeforeRest.shelter);
        feedbackMessage = rest.message;
        lastSurvivalAction = rest.message;
        lastStructureAction = `${target.item}:home:${result.message}:${rest.message}`;
        if (homeBeforeRest.shelter.functional && homeBeforeRest.shelter.cellarProvisions > 0) {
          const spend = spendRootCellarProvision(structures, geo);
          if (spend.ok) {
            const supper = prepareHearthSupper(survivalState, {
              ...homeBeforeRest.shelter,
              cellarProvisions: homeBeforeRest.shelter.cellarProvisions,
            });
            if (supper.ok) {
              hearthSupperPrepared = true;
              feedbackMessage = `${rest.message} · ${supper.message}`;
              lastSurvivalAction = `${rest.message} · ${supper.message}`;
              lastStructureAction = `${target.item}:home:${result.message}:${rest.message}:${supper.message}:cellar ${spend.remaining}`;
            }
          }
        }
      }
      const action: CharacterAction = result.mode === 'setTrap' || result.mode === 'checkTrap' || result.mode === 'collectTrap' || result.mode === 'setNet' || result.mode === 'checkNet' || result.mode === 'collectNet'
        ? 'fish'
        : result.mode === 'collectWater'
        ? 'farm'
        : result.mode === 'cook' || result.mode === 'preserve' || result.mode === 'cache' || result.mode === 'withdrawProvision'
        ? 'cook'
        : hearthSupperPrepared
        ? 'cook'
        : result.mode === 'home'
        ? 'sleep'
        : result.mode === 'forecast'
        ? 'discover'
        : 'interact';
      const movedProp = result.moved
        ? Object.keys(result.moved).find((id) => Object.prototype.hasOwnProperty.call(ITEM_DEFS, id)) as CharacterPropId | undefined
        : undefined;
      triggerCharacterAction(action, movedProp ?? (hearthSupperPrepared ? 'trailRation' : propForStructureInteraction(target.item, result.mode)), action === 'sleep' ? 0.85 : hearthSupperPrepared ? 0.95 : result.mode === 'forecast' ? 0.72 : 0.55);
      playAudio(audioEventForStructure(target.item, result.mode, true));
      markSaveDirty();
      structureRenderer.setStructures(structures);
      hud.flash(feedbackMessage, 3.2);
      refreshCraftingHud();
    } else {
      playAudio(audioEventForStructure(target.item, result.mode, false));
      hud.flash(result.message, 2);
    }
    return result.ok;
  };

  // --- debug/eval hooks ---
  const setZoom = (e: number | null): void => {
    if (e === null) { zoomHold = false; return; }
    zoomExpTarget = Math.max(0, Math.min(1, e));
    zoomHold = true;
  };

  (window as any).__world = {
    geo, layers, columns, streamer, player, metrics, terrain, trees, input,
    stats: () => ({
      backend: isWebGPU ? 'webgpu' : 'webgl2',
      topoMs: geo.buildMs,
      farMs: farSphere.buildMs,
      ...streamer.stats(),
      generated: columns.generatedCount,
      edits,
      save: { enabled: saveEnabled, loaded: !!loadedSave, dirty: saveDirty, key: saveKey, lastSaveMs },
      zoom: camDist,
      agl: player.altitudeAGL(),
      mode: player.mode,
      planeCrafted,
      creativeActive,
      wood: counts[WOOD_SLOT],
      rock: counts[1],
      resourceDrops: resourceDropDiagnostics(),
      mineProgress: mineProgressDiagnostics(),
      treeAssets: treeAssetDiagnostics(),
      treeChop: treeAssetDiagnostics().chop,
      craftedItems: { ...craftedItems },
      inventory: packLedger(),
      tools: { ...toolSummary(craftedItems, toolWear), wear: { ...toolWear }, lastAction: lastToolAction, reach: playerReach() },
      food: { ...foodCounts(), lastAction: lastFoodAction, nearWater: nearFishingWater(), nearDock: nearDock(), school: currentFishSchool(), fishingCue: currentFishingCue(), fishVisuals: fishSchoolRenderer.stats(), forage: currentForage() },
      audio: audio.state(),
      controls: { ux: uxManager.snapshot(), gamepad: gamepad.snapshot(), touch: touch.enabled, inputActive: input.active(), aimActive: input.active() || gamepad.active(), panels: currentPanelOwnership() },
      relocation: relocationDiagnostics(),
      structureCollision: structureCollisionDiagnostics(),
      survival: { ...survivalSnapshot(), time: { ...timeState }, state: { ...survivalState }, pack: packBurden(), lastAction: lastSurvivalAction },
      caves: { current: currentNaturalVoid(), signal: nearbyCaveSignal(), lastAction: lastCaveAction, echoLantern: itemCount(counts, craftedItems, 'echoLantern') },
      storage: { open: openChestId !== null, chestId: openChestId, state: currentChestStorage() },
      character: character.state(),
      characterIntent: characterVisualState(),
      characterRenderer: character.stats(),
      naturalVoid: currentNaturalVoid(),
      landmarks: { ...progressionState(), nearby: pentagonLandmark(nearbyLandmarkTile() ?? -1, pentagonTiles, discoveredPentagons), lastAction: lastLandmarkAction },
      structures: structures.length,
      home: homeScore(structures, geo),
      lastStructureAction,
      naturalFeatureNearSpawn: columns.naturalFeature(undefined, spawnTile),
      spawnTile,
    }),
    startTraversal: () => autopilot.toggle(player),
    startOrbit: () => orbitDemo.start(),
    setZoom,
    look: (yawRad: number, pitchRad: number) => { player.applyLook(yawRad / 0.0023, pitchRad / 0.0023); },
    setFly: (on: boolean) => { player.mode = on ? 'fly' : 'walk'; },
    characterState: () => character.state(),
    characterIntent: () => characterVisualState(),
    characterRenderer: () => character.stats(),
    audio: () => audio.state(),
    controls: () => ({ ux: uxManager.snapshot(), gamepad: gamepad.snapshot(), touch: touch.enabled, inputActive: input.active(), aimActive: input.active() || gamepad.active(), panels: currentPanelOwnership() }),
    debugForcePointerFallback: () => {
      input.cancelWorldInput();
      input.lockUnavailable = true;
      input.locked = false;
      return { controls: (window as any).__world.controls(), lockUnavailable: input.lockUnavailable };
    },
    injectGamepad: (frame: Partial<GamepadFrame>, frames = 2) => {
      gamepad.inject(frame, frames);
      return gamepad.snapshot();
    },
    unlockAudio: () => audio.unlock(),
    toggleMute: () => {
      const muted = audio.toggleMuted();
      hud.flash(muted ? 'sound muted' : 'sound on', 1.8);
      return audio.state();
    },
    triggerCharacterAction: (action: CharacterAction, held: CharacterPropId = 'hands', duration = 0.6) => triggerCharacterAction(action, held, duration),
    grantPlane: () => { planeCrafted = true; markSaveDirty(); },
    give: (slot: number, n: number) => { counts[slot] = (counts[slot] ?? 0) + n; markSaveDirty(); },
    giveItem: (item: string, n = 1) => {
      if (!(item in ITEM_DEFS)) return false;
      addCraftedDebugItem(item as ItemId, n);
      markSaveDirty();
      refreshCraftingHud();
      return true;
    },
    tools: () => ({ ...toolSummary(craftedItems, toolWear), wear: { ...toolWear }, lastAction: lastToolAction, reach: playerReach() }),
    nearbyTiles: (rings = 1) => [...tileSetAround(player.tile, Math.max(0, Math.trunc(Number.isFinite(rings) ? Number(rings) : 1)))],
    tileDegree: (tile?: number) => geo.degreeOf(Number.isFinite(tile) ? Math.max(0, Math.min(geo.count - 1, Math.trunc(tile!))) : player.tile),
    structureCollision: structureCollisionDiagnostics,
    debugSetPlayerTile,
    debugWalkTowardTile,
    resourceDrops: () => resourceDropDiagnostics(),
    treeAssets: () => treeAssetDiagnostics(),
    mineProgress: () => mineProgressDiagnostics(),
    debugStrikeMineTile: (tile?: number, layer?: number) => {
      const target = Number.isFinite(tile) ? Math.max(0, Math.min(geo.count - 1, Math.trunc(tile!))) : player.tile;
      const targetLayer = Number.isFinite(layer) ? Math.max(0, Math.min(layers.L - 1, Math.trunc(layer!))) : columns.groundLayerBelow(target, layers.bounds[0]);
      return strikeMineCell(target, targetLayer);
    },
    debugMineTile: (tile?: number) => {
      const target = Number.isFinite(tile) ? Math.max(0, Math.min(geo.count - 1, Math.trunc(tile!))) : player.tile;
      const layer = columns.groundLayerBelow(target, layers.bounds[0]);
      const mat = columns.materialAt(target, layer);
      const materialItem = materialItemForMaterial(mat);
      const before = { stamina: survivalState.stamina, exposure: survivalState.exposure };
      const ok = columns.mine(target, layer);
      if (ok) {
        mining.clear(target, layer);
        const slot = yieldSlot(mat);
        if (slot >= 0) spawnMineDrops(target, materialItem, 1);
        edits++;
        markSaveDirty();
        rebuildAround(target);
      }
      return {
        ok,
        tile: target,
        layer,
        materialItem,
        before,
        after: { stamina: survivalState.stamina, exposure: survivalState.exposure },
        resourceDrops: resourceDropDiagnostics(),
        mineProgress: mineProgressDiagnostics(),
      };
    },
    debugStrikeTree: (tile?: number) => {
      const target = Number.isFinite(tile) ? Math.trunc(tile!) : nearestTreeTileAround(player.tile, 6);
      if (target === null || target < 0 || target >= geo.count) return { ok: false, reason: 'no nearby tree', drops: resourceDropDiagnostics() };
      const woodBefore = counts[WOOD_SLOT];
      const result = strikeTreeTile(target);
      return {
        ok: !!result?.hit,
        tile: target,
        result,
        damage: trees.damageOf(target),
        woodBefore,
        woodAfter: counts[WOOD_SLOT],
        drops: resourceDropDiagnostics(),
      };
    },
    debugSpawnAtTreeKind: (kind: unknown = 'pine', startTile?: number) => {
      const targetKind = normalizeTreeVisualKind(kind);
      if (!targetKind) return { ok: false, reason: 'unknown tree kind', kind, allowed: treeVisualKinds };
      const target = findTreeTileOfKind(targetKind, Number.isFinite(startTile) ? Math.trunc(startTile!) : player.tile);
      const spawned = target === null ? null : spawnAtTreeTile(target);
      return spawned
        ? { ok: true, ...spawned }
        : { ok: false, reason: 'no live tree of kind', kind: targetKind, treeAssets: treeAssetDiagnostics() };
    },
    debugSpawnWoodDrops: (tile?: number) => {
      const target = Number.isFinite(tile) ? Math.trunc(tile!) : player.tile;
      const drops = spawnTreeDrops(Math.max(0, Math.min(geo.count - 1, target)));
      markSaveDirty();
      return { drops, diagnostics: resourceDropDiagnostics() };
    },
    debugSpawnResourceDrops: (item: string = 'rock', total = 1, tile?: number, source: ResourceDropSource = 'mine') => {
      if (!(item in ITEM_DEFS)) return { ok: false, reason: 'unknown item', item, diagnostics: resourceDropDiagnostics() };
      const target = Math.max(0, Math.min(geo.count - 1, Number.isFinite(tile) ? Math.trunc(tile!) : player.tile));
      const dropSource: ResourceDropSource = source === 'creature' || source === 'debug' || source === 'tree' ? source : 'mine';
      const spawned = spawnItemDrops(target, nextDropId, groundRadiusAt(target), item as ItemId, Math.max(1, Math.trunc(Number.isFinite(total) ? total : 1)), dropSource, Math.min(3, Math.max(1, Math.trunc(Number.isFinite(total) ? total : 1))));
      nextDropId = spawned.nextId;
      resourceDrops = [...resourceDrops, ...spawned.drops];
      resourceDropRenderer.setDrops(resourceDrops);
      markSaveDirty();
      return { ok: true, item, drops: spawned.drops, diagnostics: resourceDropDiagnostics() };
    },
    debugCollectDrops: (seconds = 1.2) => {
      tickResourceDrops(Math.max(0, Number.isFinite(seconds) ? seconds : 1.2));
      return { wood: counts[WOOD_SLOT], rock: counts[1], inventory: packLedger(), drops: resourceDropDiagnostics() };
    },
    spawnNearTree: (tile?: number) => {
      const target = Number.isFinite(tile) ? Math.trunc(tile!) : nearestTreeTileAround(player.tile, 8);
      if (target === null || target < 0 || target >= geo.count) return null;
      return spawnAtTreeTile(target);
    },
    setToolWear: (wear: unknown) => {
      toolWear = normalizeToolWear(wear);
      markSaveDirty();
      return { ...toolWear };
    },
    survival: () => ({ ...survivalSnapshot(), time: { ...timeState }, state: { ...survivalState }, pack: packBurden(), lastAction: lastSurvivalAction, shelter: shelterAtPlayer() }),
    setSurvival: (state: unknown) => {
      Object.assign(survivalState, normalizeSurvivalState(state));
      markSaveDirty();
      return { ...survivalState };
    },
    collapse: (force = true) => triggerCollapseRecovery('debug', force),
    setWeather: (state: unknown) => {
      Object.assign(weatherState, normalizeWeatherState(state));
      markSaveDirty();
      return { ...weatherState };
    },
    setTime: (state: unknown) => {
      Object.assign(timeState, normalizeTimeState(state));
      markSaveDirty();
      return { ...timeState };
    },
    debugSetItem: setDebugItemCount,
    eat: () => tryEatPackedFood(),
    fish: (force = false) => tryFish(force),
    fishSchool: () => currentFishSchool(),
    fishingCue: () => currentFishingCue(),
    fishVisuals: () => ({ site: currentFishVisualSite(), renderer: fishSchoolRenderer.stats() }),
    debugSetFishVisualScenario,
    debugSetLiveFishScenario,
    debugClearFishVisualScenario: () => { fishVisualOverride = null; return { ok: true }; },
    debugSpawnAtNaturalFeature: spawnAtNaturalFeature,
    debugSpawnBesideNaturalFeature: spawnBesideNaturalFeature,
    forage: () => currentForage(),
    gatherForage: () => tryForage(),
    caves: () => ({ current: currentNaturalVoid(), signal: nearbyCaveSignal(), lastAction: lastCaveAction, glowCrystal: itemCount(counts, craftedItems, 'glowCrystal'), echoLantern: itemCount(counts, craftedItems, 'echoLantern') }),
    echoLantern: () => useEchoLantern(),
    storage: () => ({ open: openChestId !== null, chestId: openChestId, state: currentChestStorage() }),
    openChest: (id?: number) => {
      const target = id !== undefined
        ? structures.find((s) => s.id === Math.trunc(id) && s.item === 'chest') ?? null
        : nearestStructureOnTiles(structures.filter((s) => s.item === 'chest'), nearbyStructureTiles());
      return target ? openChestStorage(target.id) : false;
    },
    closeStorage: () => { closeStorage(); return { open: openChestId !== null, chestId: openChestId, state: currentChestStorage() }; },
    transferChest: (id: number, item: string, action: ChestTransferAction = 'depositAll') => transferChestStorage(id, item, action),
    naturalFeature: (kind?: string, startTile?: number) => columns.naturalFeature(naturalFeatureKind(kind), startTile ?? player.tile),
    springFeature: (startTile?: number) => columns.naturalFeature('dryCave', startTile ?? player.tile, true) ?? columns.naturalFeature('dryCave', 0, true),
    spawnAtNaturalFeature,
    spawnAtSpring,
    useLandmark: (tile?: number) => useLandmark(tile),
    spawnAtPentagon,
    landmarks: () => ({
      items: allPentagonLandmarks(pentagonTiles, discoveredPentagons),
      progress: progressionState(),
      nearby: pentagonLandmark(nearbyLandmarkTile() ?? -1, pentagonTiles, discoveredPentagons),
      renderer: landmarkRenderer.stats(),
      lastAction: lastLandmarkAction,
    }),
    craft: (recipeId: string) => craftSelected(recipeId),
    crafting: () => ({ open: craftingOpen, crafted: { ...craftedItems }, recipes: craftingRows(), ledger: packLedger() }),
    structures: () => ({ items: structures.map((s) => ({ ...s, state: s.state ? { ...s.state } : undefined, turn: structureYawTurn(s.yaw), socket: structureSocketOccupancy(s) })), placement: placementDiagnostics(), relocation: relocationDiagnostics(), snapPreview: currentStructureSnapPreview(), commands: buildCommandDiagnostics(), sockets: { core: structureSocketCatalog() }, collision: structureCollisionDiagnostics(), storage: { open: openChestId !== null, chestId: openChestId, state: currentChestStorage() }, home: homeScore(structures, geo), renderer: structureRenderer.stats(), lastAction: lastStructureAction }),
    buildCommands: () => buildCommandDiagnostics(),
    selectStructure: (item: string) => selectStructureForPlacement(item),
    placeStructure: (item: string, tile?: number) => {
      if (!isPlaceableItemId(item)) return false;
      const target = tile ?? geo.neighbor(player.tile, 0);
      return placeStructureAt(item, target);
    },
    relocateStructure: (id: number, tile: number, layer?: number, yaw?: number) => relocateStructureAt(id, tile, layer, yaw),
    useStructure: (id?: number) => useStructure(id),
    dismantleStructure: (id?: number) => tryDismantleStructure(id),
    rotatePlacement: (turns = 1) => rotateBuildFacing(turns),
    rotateStructure: (id?: number, turns = 1) => rotateBuildFacing(turns, id),
    save: {
      key: saveKey,
      enabled: () => saveEnabled,
      loaded: () => !!loadedSave,
      dirty: () => saveDirty,
      write: () => writeSave(true),
      clear: () => {
        clearStoredWorldSave(saveKey);
        saveDirty = false;
        hud.flash('save slot cleared', 2);
      },
      export: () => JSON.stringify(captureWorldSave({
        seed: SEED,
        frequency: M,
        player,
        columns,
        trees,
        inventory: counts,
        craftedItems,
        drops: resourceDrops,
        structures,
        progression: { pentagons: [...discoveredPentagons], toolWear },
        time: timeState,
        weather: weatherState,
        survival: survivalState,
        hotbarSel,
        planeCrafted,
      })),
      import: (json: string) => {
        const save = parseWorldSaveJson(json);
        if (!save || save.seed !== SEED || save.frequency !== M) return false;
        applyColumnEdits(columns, save.columns);
        applyChoppedTrees(trees, save.choppedTrees, geo.count);
        applyTreeChopProgress(trees, save.treeChopProgress, geo.count);
        resourceDrops = backfillDropGroundRadius(normalizeResourceDrops(save.drops, geo.count));
        nextDropId = nextResourceDropId(resourceDrops);
        resourceDropRenderer.setDrops(resourceDrops);
        applyPlayerSave(player, save.player, geo.count);
        for (let i = 0; i < counts.length; i++) counts[i] = Math.max(0, Math.trunc(save.inventory[i] ?? 0));
        for (const key of Object.keys(craftedItems)) delete craftedItems[key as keyof InventoryItems];
        Object.assign(craftedItems, normalizeInventory(save.craftedItems));
        structures.splice(0, structures.length, ...normalizeStructureSaves(save.structures, geo.count, layers.L));
        structureRenderer.setStructures(structures);
        discoveredPentagons.clear();
        for (const tile of normalizePentagonDiscoveries(save.progression?.pentagons, pentagonTiles)) discoveredPentagons.add(tile);
        toolWear = normalizeToolWear(save.progression?.toolWear);
        Object.assign(timeState, normalizeTimeState(save.time));
        Object.assign(weatherState, normalizeWeatherState(save.weather));
        Object.assign(survivalState, normalizeSurvivalState(save.survival));
        refreshUseButton();
        hotbarSel = Math.max(0, Math.min(SLOTS.length - 1, save.hotbarSel));
        planeCrafted = save.planeCrafted;
        if ((craftedItems.planeFrame ?? 0) > 0) planeCrafted = true;
        streamer.releaseAll();
        streamer.refreshDesired(...player.up(), player.altitudeAGL());
        saveDirty = true;
        hud.flash('save imported', 2);
        return true;
      },
    },
    creative: {
      active: () => creativeActive,
      fill: () => {
        for (let i = 0; i < counts.length; i++) counts[i] = Math.max(counts[i], 999);
        planeCrafted = true;
        player.mode = 'fly';
        markSaveDirty();
      },
    },
    debugPick: () => ({ lastPick, treePick }),
    debugAimAtTile: (tile: number, layer?: number) => {
      const target = Math.max(0, Math.min(geo.count - 1, Math.trunc(Number.isFinite(tile) ? tile : player.tile)));
      const targetLayer = Math.max(0, Math.min(layers.L - 1, Math.trunc(Number.isFinite(layer) ? layer! : columns.groundLayerBelow(target, layers.bounds[0]))));
      facePlayerTowardTile(target);
      const c = geo.centers;
      const radius = layers.topRadius(targetLayer) + 0.08;
      const tx = c[target * 3] * radius;
      const ty = c[target * 3 + 1] * radius;
      const tz = c[target * 3 + 2] * radius;
      const dx = tx - camWorld.x;
      const dy = ty - camWorld.y;
      const dz = tz - camWorld.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      updatePicks(dx / len, dy / len, dz / len);
      if (!lastPick || lastPick.hitTile !== target) {
        lastPick = { hitTile: target, hitLayer: targetLayer, prevTile: -1, prevLayer: -1, dist: len };
        treePick = null;
      }
      debugPickHoldUntil = performance.now() + 1400;
      return { targetTile: target, targetLayer, pick: lastPick, treePick, relocation: relocationDiagnostics() };
    },
    screenPointForTile: (tile: number, layer?: number) => {
      const target = Math.max(0, Math.min(geo.count - 1, Math.trunc(Number.isFinite(tile) ? tile : player.tile)));
      const targetLayer = Math.max(0, Math.min(layers.L - 1, Math.trunc(Number.isFinite(layer) ? layer! : columns.groundLayerBelow(target, layers.bounds[0]))));
      const c = geo.centers;
      const radius = layers.topRadius(targetLayer) + 0.16;
      const point = new THREE.Vector3(
        c[target * 3] * radius - camWorld.x,
        c[target * 3 + 1] * radius - camWorld.y,
        c[target * 3 + 2] * radius - camWorld.z,
      );
      point.project(camera);
      return {
        tile: target,
        layer: targetLayer,
        x: (point.x * 0.5 + 0.5) * window.innerWidth,
        y: (-point.y * 0.5 + 0.5) * window.innerHeight,
        ndc: { x: point.x, y: point.y, z: point.z },
        visible: point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1.1 && Math.abs(point.y) <= 1.1,
      };
    },
    character,
    sky,
    camInfo: () => {
      const eye = player.eye();
      return {
        camDist,
        effDist: Math.hypot(camWorld.x - eye[0], camWorld.y - eye[1], camWorld.z - eye[2]),
        camR: Math.hypot(camWorld.x, camWorld.y, camWorld.z),
      };
    },

    /** scripted edit benchmark: dig a crater around the player and raise a small tower */
    editTest: () => {
      const times: number[] = [];
      const doEdit = (fn: () => boolean, tile: number): void => {
        const t0 = performance.now();
        if (fn()) { rebuildAround(tile); times.push(performance.now() - t0); edits++; markSaveDirty(); }
      };
      const ring0 = [player.tile];
      const ring1: number[] = [];
      const ring2: number[] = [];
      const deg0 = geo.degreeOf(player.tile);
      for (let k = 0; k < deg0; k++) ring1.push(geo.neighbor(player.tile, k));
      for (const t of ring1) {
        const d = geo.degreeOf(t);
        for (let k = 0; k < d; k++) {
          const n = geo.neighbor(t, k);
          if (n !== player.tile && !ring1.includes(n) && !ring2.includes(n)) ring2.push(n);
        }
      }
      for (const t of [...ring0, ...ring1, ...ring2]) {
        const top = columns.groundLayerBelow(t, layers.bounds[0]);
        doEdit(() => columns.mine(t, top), t);
        if (ring0.includes(t) || ring1.includes(t)) doEdit(() => columns.mine(t, top + 1), t);
      }
      const towerTile = ring2[0];
      const towerTop = columns.groundLayerBelow(towerTile, layers.bounds[0]);
      for (let i = 1; i <= 6; i++) doEdit(() => columns.place(towerTile, towerTop - i), towerTile);
      const sorted = [...times].sort((a, b) => a - b);
      return {
        edits: times.length,
        avgMs: times.reduce((a, b) => a + b, 0) / times.length,
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        maxMs: sorted[sorted.length - 1],
      };
    },

    /**
     * Edit persistence proof: edit, release EVERY chunk mesh on the planet, regenerate,
     * and compare the regenerated mesh bytes against the pre-release mesh.
     */
    persistTest: async () => {
      const T = player.tile;
      const top = columns.groundLayerBelow(T, layers.bounds[0]);
      columns.mine(T, top);
      columns.mine(T, top + 1);
      const nb = geo.neighbor(T, 0);
      const nbTop = columns.groundLayerBelow(nb, layers.bounds[0]);
      columns.place(nb, nbTop - 1);
      edits += 3;
      markSaveDirty();
      rebuildAround(T);
      rebuildAround(nb);
      const key = chunkKeyOfTile(geo, T);
      const hash = (fa: Float32Array | undefined): number => {
        if (!fa) return 0;
        let h = 2166136261 >>> 0;
        for (let i = 0; i < fa.length; i += 3) {
          h ^= (fa[i] * 8192) | 0;
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      };
      const meshBytes = (k: number) =>
        streamer.resident.get(k)?.mesh?.geometry.getAttribute('position')?.array as Float32Array | undefined;
      const beforeHash = hash(meshBytes(key));
      const maskBefore = Uint32Array.from(columns.editOf(T)!.solid);
      // depart: drop every mesh on the planet
      streamer.releaseAll();
      const editsSurviveRelease = !!columns.editOf(T);
      // return: regenerate the ring
      const [ux, uy, uz] = player.up();
      streamer.refreshDesired(ux, uy, uz, player.altitudeAGL());
      while (streamer.stats().queued > 0) {
        streamer.pump(50, 400);
        await new Promise((r) => setTimeout(r, 0));
      }
      const afterHash = hash(meshBytes(key));
      const maskAfter = Uint32Array.from(columns.editOf(T)!.solid);
      return {
        editsSurviveRelease,
        maskIdentical: maskBefore.length === maskAfter.length && maskBefore.every((v, i) => v === maskAfter[i]),
        meshByteIdentical: beforeHash !== 0 && beforeHash === afterHash,
        minedCellStillGone: !columns.solidAt(T, top),
        placedCellStillThere: columns.solidAt(nb, nbTop - 1),
      };
    },

    /** paced dig benchmark: mine a wandering line of tiles at hold-LMB cadence, capture frames */
    digTest: async (count = 14, periodMs = 190) => {
      let t = player.tile;
      const targets: number[] = [];
      for (let i = 0; i < count; i++) {
        t = geo.neighbor(t, i % geo.degreeOf(t));
        targets.push(t);
      }
      metrics.begin('dig');
      let mined = 0;
      for (const id of targets) {
        const top = columns.groundLayerBelow(id, layers.bounds[0]);
        if (columns.mine(id, top)) {
          mined++;
          edits++;
          markSaveDirty();
          rebuildAround(id);
        }
        await new Promise((r) => setTimeout(r, periodMs));
      }
      await new Promise((r) => setTimeout(r, 400)); // let deferred seam rebuilds drain
      return { mined, capture: metrics.end() };
    },

    /** board the plane and fly straight for a while, capturing frame metrics + terrain-follow behavior */
    planeTest: async (seconds = 20, throttle = 70) => {
      planeCrafted = true;
      if (!player.enterPlane()) return { error: 'in water' };
      player.throttle = throttle;
      player.pitch = 0;
      const start = [player.px, player.py, player.pz];
      metrics.begin('plane');
      const t0 = performance.now();
      let minAGL = Infinity, maxSpeed = 0, maxAGL = 0;
      const aglTrace: number[] = [];
      while (performance.now() - t0 < seconds * 1000) {
        await new Promise((r) => setTimeout(r, 250));
        const agl = player.altitudeAGL();
        aglTrace.push(Math.round(agl));
        minAGL = Math.min(minAGL, agl);
        maxAGL = Math.max(maxAGL, agl);
        maxSpeed = Math.max(maxSpeed, Math.hypot(player.vx, player.vy, player.vz));
        if (player.mode !== 'plane') break; // stowed itself (ground/water/wall)
      }
      const rep = metrics.end();
      const r1 = Math.hypot(...start), r2 = player.radius();
      const dot = (start[0] * player.px + start[1] * player.py + start[2] * player.pz) / (r1 * r2);
      const distance = Math.acos(Math.min(1, Math.max(-1, dot))) * (r1 + r2) / 2;
      return {
        distanceM: Math.round(distance),
        stillFlying: player.mode === 'plane',
        minAGL: Math.round(minAGL * 10) / 10,
        maxAGL: Math.round(maxAGL * 10) / 10,
        maxSpeed: Math.round(maxSpeed * 10) / 10,
        aglTrace,
        capture: rep,
      };
    },
  };

  (window as any).__THREE_GAME_DIAGNOSTICS__ = {
    renderer: renderer.info,
    get state() {
      return {
        backend: isWebGPU ? 'webgpu' : 'webgl2',
        mode: player.mode,
        speed: Math.hypot(player.vx, player.vy, player.vz),
        agl: player.altitudeAGL(),
        streamer: streamer.stats(),
        character: character.state(),
        characterIntent: characterVisualState(),
        landmarks: { ...progressionState(), nearby: pentagonLandmark(nearbyLandmarkTile() ?? -1, pentagonTiles, discoveredPentagons), lastAction: lastLandmarkAction },
        audio: audio.state(),
        controls: { ux: uxManager.snapshot(), gamepad: gamepad.snapshot(), touch: touch.enabled, panels: currentPanelOwnership() },
        characterRenderer: character.stats(),
        mineProgress: mineProgressDiagnostics(),
        treeAssets: treeAssetDiagnostics(),
        fishVisuals: fishSchoolRenderer.stats(),
        survival: { ...survivalSnapshot(), time: { ...timeState }, pack: packBurden() },
        structures: { relocation: relocationDiagnostics(), snapPreview: currentStructureSnapPreview(), commands: buildCommandDiagnostics() },
      };
    },
  };

  (window as any).render_game_to_text = () => JSON.stringify({
    coordinates: 'world origin at planet core; player radius/AGL are meters',
    mode: player.mode,
    panels: currentPanelOwnership(),
    player: {
      tile: player.tile,
      speed: Math.round(Math.hypot(player.vx, player.vy, player.vz) * 10) / 10,
      agl: Math.round(player.altitudeAGL() * 10) / 10,
    },
    inventory: {
      wood: counts[WOOD_SLOT],
      rock: counts[1],
      selected: SLOTS[hotbarSel]?.name ?? 'unknown',
      resourceDrops: resourceDropDiagnostics(),
      mineProgress: mineProgressDiagnostics(),
      treeAssets: treeAssetDiagnostics(),
      treeChop: {
        active: trees.chopProgress.size,
        target: treePick ? { tile: treePick.tile, damage: trees.damageOf(treePick.tile) } : null,
      },
      crafted: { ...craftedItems },
      ledger: packLedger(),
      tools: { ...toolSummary(craftedItems, toolWear), wear: { ...toolWear }, lastAction: lastToolAction, reach: playerReach() },
      food: { ...foodCounts(), lastAction: lastFoodAction, nearWater: nearFishingWater(), nearDock: nearDock(), school: currentFishSchool(), fishingCue: currentFishingCue(), fishVisuals: fishSchoolRenderer.stats(), forage: currentForage() },
      survival: { ...survivalSnapshot(), time: { ...timeState }, pack: packBurden(), lastAction: lastSurvivalAction },
      audio: audio.state(),
      controls: { ux: uxManager.snapshot(), gamepad: gamepad.snapshot(), touch: touch.enabled, panels: currentPanelOwnership() },
      caves: { current: currentNaturalVoid(), signal: nearbyCaveSignal(), lastAction: lastCaveAction },
    },
    storage: { open: openChestId !== null, chestId: openChestId, state: currentChestStorage() },
    plane: {
      crafted: planeCrafted,
      woodCost: PLANE_WOOD_COST,
      readyToCraft: !planeCrafted && counts[WOOD_SLOT] >= PLANE_WOOD_COST,
    },
    structures: {
      count: structures.length,
      selected: selectedStructureItem,
      placement: placementDiagnostics(),
      relocation: relocationDiagnostics(),
      snapPreview: currentStructureSnapPreview(),
      commands: buildCommandDiagnostics(),
      sockets: { core: structureSocketCatalog() },
      collision: structureCollisionDiagnostics(),
      yawTurns: structures.map((s) => ({ id: s.id, item: s.item, tile: s.tile, turn: structureYawTurn(s.yaw), yaw: s.yaw })),
      renderer: structureRenderer.stats(),
      storage: { open: openChestId !== null, chestId: openChestId, state: currentChestStorage() },
      home: homeScore(structures, geo),
      lastAction: lastStructureAction,
      lastFoodAction,
    },
    character: character.state(),
    characterIntent: characterVisualState(),
    characterRenderer: character.stats(),
    landmarks: {
      progress: progressionState(),
      nearby: pentagonLandmark(nearbyLandmarkTile() ?? -1, pentagonTiles, discoveredPentagons),
      lastAction: lastLandmarkAction,
    },
    creativeActive,
  });
  (window as any).advanceTime = (ms = 16) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

  let last = performance.now();
  let frameIdx = 0;
  let hudTimer = 0;
  let streamTimer = 0;
  let lastFarRefresh = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dtMs = now - last;
    last = now;
    const dt = Math.min(0.05, dtMs / 1000);
    frameIdx++;

    const drained = input.drain();
    const tf = touch.frame();
    const gp = gamepad.frame(dt);
    const panelAtFrameStart = currentPanelOwnership();
    syncPanelOwnershipBody();
    const gpPanelConsumed = handleGamepadPanelInput(gp);
    let worldInputBlocked = panelAtFrameStart.worldInputBlocked || gpPanelConsumed;
    const worldBlocked = (): boolean => worldInputBlocked || currentPanelOwnership().worldInputBlocked;
    const gamepadAimActive = gp.active || gamepad.active();
    if (worldInputBlocked) {
      input.cancelWorldInput();
      touch.cancelWorldInput();
      drained.dx = 0;
      drained.dy = 0;
      drained.wheel = 0;
      drained.mine = false;
      drained.place = false;
      drained.wheelTouched = false;
    } else {
      drained.dx += gp.lookX;
      drained.dy += gp.lookY;
    }
    if (!worldInputBlocked && Math.abs(gp.zoom) > 0.01) {
      drained.wheel += gp.zoom * 1300 * dt;
      drained.wheelTouched = true;
    }
    const nextUxProfile = uxManager.update({ touchEnabled: touch.enabled, gamepadActive: gamepadAimActive });
    if (nextUxProfile.summary !== currentUxProfile.summary || nextUxProfile.inputMode !== currentUxProfile.inputMode) {
      currentUxProfile = nextUxProfile;
      syncHudUx(currentUxProfile);
    }
    const gamepadNotice = gamepad.consumeNotice();
    if (gamepadNotice) hud.flash(gamepadNotice === 'gamepad disconnected' ? gamepadNotice : 'gamepad ready', 2.4);

    // key edges
    const fDown = input.down('KeyF'), gDown = input.down('KeyG'), oDown = input.down('KeyO'), eDown = input.down('KeyE'), vDown = input.down('KeyV'), bDown = input.down('KeyB'), rDown = input.down('KeyR'), qDown = input.down('KeyQ'), nDown = input.down('KeyN'), zDown = input.down('KeyZ'), xDown = input.down('KeyX'), escDown = input.down('Escape');
    const f3Down = input.down('F3'), hDown = input.down('KeyH');
    const fPressed = input.pressed('KeyF') || (fDown && !fWas);
    const gPressed = input.pressed('KeyG') || (gDown && !gWas);
    const oPressed = input.pressed('KeyO') || (oDown && !oWas);
    const ePressed = input.pressed('KeyE') || (eDown && !eWas);
    const vPressed = input.pressed('KeyV') || (vDown && !vWas);
    const bPressed = input.pressed('KeyB') || (bDown && !bWas);
    const rPressed = input.pressed('KeyR') || (rDown && !rWas);
    const qPressed = input.pressed('KeyQ') || (qDown && !qWas);
    const nPressed = input.pressed('KeyN') || (nDown && !nWas);
    const zPressed = input.pressed('KeyZ') || (zDown && !zWas);
    const xPressed = input.pressed('KeyX') || (xDown && !xWas);
    const escPressed = input.pressed('Escape') || (escDown && !escWas);
    const f3Pressed = input.pressed('F3') || (f3Down && !f3Was);
    const hPressed = input.pressed('KeyH') || (hDown && !hWas);
    if (fPressed && !worldBlocked() && !autopilot.active) {
      player.toggleFly();
      if (creativeActive) hud.flash(player.mode === 'fly' ? 'creative free-flight' : 'walk mode', 2);
    }
    if (gPressed && !worldBlocked()) { autopilot.toggle(player); hud.flash(autopilot.active ? 'autopilot lap…' : 'autopilot off', 3); }
    if (oPressed && !worldBlocked()) { orbitDemo.start(); hud.flash('orbit demo…', 3); }
    const keyboardRelocate = vPressed || (ePressed && input.down('ShiftLeft'));
    const touchRelocate = tf.relocate && !worldBlocked();
    const gamepadRelocate = gp.relocate && !worldBlocked();
    if ((keyboardRelocate || touchRelocate || gamepadRelocate) && !worldBlocked() && !autopilot.active) {
      tryRelocationCursor(gamepadRelocate ? 'gamepad' : touchRelocate ? 'touch' : 'keyboard');
    } else if ((ePressed || (tf.plane && !worldBlocked()) || (gp.plane && !worldBlocked())) && !worldBlocked() && !autopilot.active) {
      if (creativeActive && ((tf.plane && !worldBlocked()) || (gp.plane && !worldBlocked())) && !ePressed) {
        player.toggleFly();
        hud.flash(player.mode === 'fly' ? 'creative free-flight' : 'creative walk mode', 2);
      } else {
        handlePlaneKey();
      }
    }
    let gamepadUseConsumed = false;
    if (escPressed && relocationCursor) {
      cancelRelocationCursor('keyboard');
    } else if (escPressed && openChestId !== null) {
      closeStorage();
      playAudio('uiConfirm');
    } else if (escPressed && craftingOpen) {
      craftingOpen = false;
      refreshCraftingHud();
      playAudio('uiConfirm');
    }
    if (gp.cancel && !gpPanelConsumed && relocationCursor && !worldBlocked()) {
      cancelRelocationCursor('gamepad');
      gamepadUseConsumed = true;
    } else if (gp.use && !gpPanelConsumed && openChestId !== null) {
      closeStorage();
      playAudio('uiConfirm');
      gamepadUseConsumed = true;
    } else if (gp.use && !gpPanelConsumed && craftingOpen) {
      craftingOpen = false;
      refreshCraftingHud();
      playAudio('uiConfirm');
      gamepadUseConsumed = true;
    }
    if (bPressed || (gp.craft && !gpPanelConsumed)) {
      toggleCraftingPanel();
    }
    worldInputBlocked = worldBlocked();
    if (((rPressed && input.down('ShiftLeft')) || (tf.pack && !worldBlocked()) || (gp.pack && !worldBlocked())) && !worldBlocked() && !autopilot.active) {
      tryDismantleStructure(undefined, gp.pack ? 'gamepad' : tf.pack ? 'touch' : 'keyboard');
    } else if ((rPressed || (tf.use && !worldBlocked()) || (gp.use && !worldBlocked() && !gamepadUseConsumed)) && !worldBlocked() && !autopilot.active) {
      useStructure(undefined, gp.use ? 'gamepad' : tf.use ? 'touch' : 'keyboard');
    }
    if ((qPressed || (gp.eat && !worldBlocked())) && !worldBlocked() && !autopilot.active) tryEatPackedFood();
    const gamepadBuildRotate = (selectedStructureItem !== null || relocationCursor !== null) && !worldBlocked() && (gp.pin || gp.clearPin);
    if ((zPressed || xPressed || gamepadBuildRotate) && !worldBlocked() && !autopilot.active) {
      rotateBuildFacing((zPressed || gp.clearPin) && !xPressed ? -1 : 1, undefined, gamepadBuildRotate ? 'gamepad' : 'keyboard');
    }
    if (nPressed || (gp.mute && !gpPanelConsumed)) {
      const muted = audio.toggleMuted();
      hud.flash(muted ? 'sound muted' : 'sound on', 1.8);
    }
    if (f3Pressed || (gp.diag && !gpPanelConsumed)) showDiag = !showDiag;
    if (hPressed || (gp.help && !gpPanelConsumed)) hud.toggleHelp();
    fWas = fDown; gWas = gDown; oWas = oDown; eWas = eDown; vWas = vDown; bWas = bDown; rWas = rDown; qWas = qDown; nWas = nDown; zWas = zDown; xWas = xDown; escWas = escDown; f3Was = f3Down; hWas = hDown;
    worldInputBlocked = worldBlocked();
    if (worldInputBlocked) {
      input.cancelWorldInput();
      touch.cancelWorldInput();
      drained.dx = 0;
      drained.dy = 0;
      drained.wheel = 0;
      drained.mine = false;
      drained.place = false;
      drained.wheelTouched = false;
    }
    syncPanelOwnershipBody();
    for (let i = 0; i < SLOTS.length; i++) {
      if (!worldBlocked() && input.down(`Digit${i + 1}`)) {
        hotbarSel = i;
        if (relocationCursor) {
          relocationCursor = null;
          refreshUseButton();
        }
        if (selectedStructureItem) {
          selectedStructureItem = null;
          refreshCraftingHud();
        }
      }
    }
    if (!worldBlocked() && gp.slotDelta !== 0) {
      hotbarSel = (hotbarSel + gp.slotDelta + SLOTS.length * 4) % SLOTS.length;
      if (relocationCursor) {
        relocationCursor = null;
        refreshUseButton();
      }
      if (selectedStructureItem) {
        selectedStructureItem = null;
        refreshCraftingHud();
      }
    }
    if (hotbarSel !== prevSel) {
      if (prevSel >= 0) hud.slotName(SLOTS[hotbarSel].name);
      prevSel = hotbarSel;
      markSaveDirty();
    }
    if (input.lockUnavailable && !input.locked && !input.touchMode && !lockHinted) {
      lockHinted = true;
      hud.flash('pointer lock unavailable — drag to look', 4);
    }

    // look + move (touch joystick/buttons merge with the keyboard)
    const aimActive = !worldBlocked() && (input.active() || gamepadAimActive);
    if (aimActive && !autopilot.active) player.applyLook(drained.dx, drained.dy);
    if (autopilot.active) {
      autopilot.update(dt, player);
    } else {
      const motionBlocked = worldBlocked();
      const fwd = motionBlocked ? 0 : Math.max(-1, Math.min(1, (input.down('KeyW') ? 1 : 0) + (input.down('KeyS') ? -1 : 0) + tf.moveY + gp.moveY));
      const strafe = motionBlocked ? 0 : Math.max(-1, Math.min(1, (input.down('KeyD') ? 1 : 0) + (input.down('KeyA') ? -1 : 0) + tf.moveX + gp.moveX));
      const jumpIntent = !motionBlocked && (input.down('Space') || tf.jump || gp.jump);
      const downIntent = !motionBlocked && (input.down('ControlLeft') || input.down('KeyC') || tf.down || gp.down);
      const upDown = (jumpIntent ? 1 : 0) + (downIntent ? -1 : 0);
      const sprintIntent = !motionBlocked && (input.down('ShiftLeft') || tf.sprint || gp.sprint);
      const burden = packBurden();
      const sprintAllowed = creativeActive || (survivalState.stamina > 8 && !burden.sprintBlocked);
      player.update(dt, {
        forward: fwd, strafe,
        upDown: player.mode !== 'walk' ? upDown : 0,
        sprint: sprintIntent && sprintAllowed,
        jump: jumpIntent,
        swimUp: jumpIntent,
      });
      const shelter = shelterAtPlayer();
      advanceSurvivalTime(timeState, weatherState, dt, player.mode === 'plane' ? 13 : 8);
      updateSurvival(survivalState, {
        dt,
        moving: Math.hypot(player.vx, player.vy, player.vz) > 0.5,
        sprinting: sprintIntent && sprintAllowed && player.mode === 'walk',
        swimming: player.submerged > 0.4,
        flying: player.mode === 'plane',
        minutesElapsed: dt * (player.mode === 'plane' ? 13 : 8),
        packBurden: creativeActive ? null : burden,
        sheltered: shelter.sheltered,
        functionalShelter: shelter.functionalShelter,
        nearWarmth: nearLitWarmth(),
        weather: currentWeather(),
        weatherProtection: currentWeatherProtection(),
        thresholdEffect: null,
      });
      // Soft exposure pressure: warn as exposure enters the 'worn' band, then keep the ongoing
      // stamina-drain penalty (applied inside updateSurvival) visible while exposure is maxed.
      // No relocation happens here — the player only moves via the bedroll "use" action above
      // (player choice) or the explicit debug.collapse() console hook.
      const exposureCriticalNow = isExposureCritical(survivalState);
      const exposureWarningNow = isExposureWarning(survivalState);
      if (exposureCriticalNow && !exposureCriticalActive) {
        hud.flash('exposure maxed — cold is winning, stamina draining fast until you find shelter or warmth', 5);
      } else if (exposureWarningNow && !exposureWarningActive) {
        hud.flash('exposure rising — seek shelter or warmth soon', 4);
      }
      exposureWarningActive = exposureWarningNow;
      exposureCriticalActive = exposureCriticalNow;
      if (sprintIntent && !sprintAllowed && player.mode === 'walk') {
        const reason = burden.sprintBlocked ? `${burden.label}: stash materials or build a chest` : 'too winded to sprint';
        if (lastSurvivalAction !== reason) lastSurvivalAction = reason;
      }
      if (player.planeStowed) hud.flash(player.submerged > 0.2 ? 'splashdown' : 'touched down', 2);
    }

    // user wheel always takes priority over scripted/auto zoom
    if (drained.wheelTouched) { zoomHold = false; planeAutoZoom = false; }

    // plane auto camera: ease out to a chase view on boarding, back in on stowing
    if (!zoomHold) {
      if (player.mode === 'plane' && camDist < 6 && !planeAutoZoom) {
        planeAutoZoom = true;
        zoomExpTarget = PLANE_CAM_EXP;
      }
      if (planeAutoZoom && player.mode !== 'plane') {
        planeAutoZoom = false;
        zoomExpTarget = 0;
      }
    }

    // zoom
    const orbitOverride = orbitDemo.update(dt);
    if (orbitOverride !== null) {
      zoomExpTarget = orbitOverride;
      zoomExp = orbitOverride;
    } else {
      zoomExpTarget = Math.max(0, Math.min(1, zoomExpTarget + drained.wheel * 0.00045));
      zoomExp += (zoomExpTarget - zoomExp) * Math.min(1, dt * 7);
      if (zoomExpTarget === 0 && zoomExp < 0.004) zoomExp = 0; // settle exactly into first person
    }
    // continuous distance: ramps smoothly from 0 (no first/third-person jump cut)
    camDist = zoomExp <= 0 ? 0 : DIST_MIN * Math.pow(DIST_MAX / DIST_MIN, zoomExp) * smoothstep(0, 0.05, zoomExp);

    // --- camera (all f64 until the very end) ---
    const [ux, uy, uz] = player.up();
    const eye = player.eye();
    const cosP = Math.cos(player.pitch), sinP = Math.sin(player.pitch);
    const vfx = player.fwdX * cosP + ux * sinP;
    const vfy = player.fwdY * cosP + uy * sinP;
    const vfz = player.fwdZ * cosP + uz * sinP;
    let cwx: number, cwy: number, cwz: number;
    let tx: number, ty: number, tz: number;
    if (camDist === 0) {
      camObstruct = Infinity;
      cwx = eye[0]; cwy = eye[1]; cwz = eye[2];
      tx = eye[0] + vfx; ty = eye[1] + vfy; tz = eye[2] + vfz;
    } else {
      // pull-back direction turns radial with distance, so at orbit you sit directly
      // above your own location and it faces the camera (instead of sliding to the rim)
      const blend = smoothstep(140, 2600, camDist);
      const bb = blend * 0.95;
      let ox = -vfx * (1 - bb) + ux * (0.12 * (1 - bb) + bb);
      let oy = -vfy * (1 - bb) + uy * (0.12 * (1 - bb) + bb);
      let oz = -vfz * (1 - bb) + uz * (0.12 * (1 - bb) + bb);
      const ol = Math.hypot(ox, oy, oz) || 1;
      ox /= ol; oy /= ol; oz /= ol;
      // camera boom obstruction: cast eye -> camera against the column field and pull in
      // ahead of the first hit (fast), then regrow gently — never teleports, never clips
      if (camDist < 60) {
        if (frameIdx % 2 === 1) {
          const hit = pick(geo, layers, columns, eye[0], eye[1], eye[2], ox, oy, oz, camDist + 0.4);
          const allowed = hit ? Math.max(0.6, hit.dist - 0.75) : camDist;
          camObstruct = allowed < camObstruct ? allowed : Math.min(allowed, camObstruct + (allowed - camObstruct) * Math.min(1, dt * 8));
        }
      } else {
        camObstruct = Infinity;
      }
      const dEff = Math.min(camDist, camObstruct);
      cwx = eye[0] + ox * dEff;
      cwy = eye[1] + oy * dEff;
      cwz = eye[2] + oz * dEff;
      if (camDist >= 60) {
        // high up, the cheap radial floor is enough (terrain can't reach the boom)
        const cr = Math.hypot(cwx, cwy, cwz);
        const camTile = geo.tileOf(cwx, cwy, cwz);
        const camGround = layers.topRadius(columns.groundLayerBelow(camTile, cr));
        const minR = camGround + 1.2;
        if (cr < minR) {
          const s = minR / cr;
          cwx *= s; cwy *= s; cwz *= s;
        }
      }
      tx = eye[0] * (1 - blend); ty = eye[1] * (1 - blend); tz = eye[2] * (1 - blend);
    }
    camWorld.x = cwx; camWorld.y = cwy; camWorld.z = cwz;
    camera.position.set(0, 0, 0);
    {
      // as the view goes overhead the radial up degenerates against the view axis; roll
      // screen-up toward the player's heading — rate-limited so fast mouse turns at mid
      // zoom can't whip the horizon (this was the "camera snaps around" source)
      const blend = camDist === 0 ? 0 : smoothstep(140, 2600, camDist) * 0.95;
      let cux = ux * (1 - blend) + player.fwdX * blend;
      let cuy = uy * (1 - blend) + player.fwdY * blend;
      let cuz = uz * (1 - blend) + player.fwdZ * blend;
      const cul = Math.hypot(cux, cuy, cuz) || 1;
      cux /= cul; cuy /= cul; cuz /= cul;
      const k = Math.min(1, dt * (camDist === 0 ? 30 : 7));
      camUp.x += (cux - camUp.x) * k;
      camUp.y += (cuy - camUp.y) * k;
      camUp.z += (cuz - camUp.z) * k;
      camUp.normalize();
      camera.up.copy(camUp);
    }
    camera.lookAt(tx - cwx, ty - cwy, tz - cwz);
    const wantNear = Math.min(60, Math.max(0.09, camDist * 0.02));
    if (Math.abs(wantNear - camera.near) / camera.near > 0.05) {
      camera.near = wantNear;
      camera.updateProjectionMatrix();
    }

    // --- streaming ---
    streamTimer -= dt;
    if (streamTimer <= 0) {
      streamTimer = 0.18;
      const agl = player.altitudeAGL();
      streamer.refreshDesired(ux, uy, uz, agl);
    }
    const builtThisFrame = streamer.pump();
    // deferred seam-neighbor rebuilds from edits: one per frame
    if (pendingRebuilds.length > 0) {
      const key = pendingRebuilds.shift()!;
      if (streamer.resident.has(key)) streamer.rebuildNow(key);
    }
    // far-sphere refilter is a 184k-tri scan + index re-upload: keep it off build frames
    // and cap it at 4 Hz — a briefly unfiltered far tri sits 6 m under a loaded chunk, invisible
    if (streamer.residencyDirty && builtThisFrame === 0 && pendingRebuilds.length === 0 && now - lastFarRefresh > 250) {
      farSphere.setResidentChunks(streamer.residentKeys());
      streamer.residencyDirty = false;
      lastFarRefresh = now;
    }

    // --- camera-relative transforms (floating origin: camera stays at 0,0,0) ---
    streamer.updateTransforms(camWorld.x, camWorld.y, camWorld.z);
    farSphere.mesh.position.set(-camWorld.x, -camWorld.y, -camWorld.z);
    water.position.set(-camWorld.x, -camWorld.y, -camWorld.z);
    sky.update(camWorld.x, camWorld.y, camWorld.z, camera);
    sun.position.set(SUN.x * 11000 - camWorld.x, SUN.y * 11000 - camWorld.y, SUN.z * 11000 - camWorld.z);
    sunTarget.position.set(-camWorld.x, -camWorld.y, -camWorld.z);
    tickResourceDrops(dt);
    character.update(player, camWorld, camDist, dt, characterVisualState());
    structureRenderer.update(structures, geo, layers, camWorld, now / 1000);
    structureRenderer.updateSnapPreview(currentStructureSnapPreview(), geo, layers, camWorld, now / 1000);
    resourceDropRenderer.update(resourceDrops, geo, layers, columns, camWorld, now / 1000);
    landmarkRenderer.update(pentagonTiles, discoveredPentagons, geo, layers, columns, camWorld, now / 1000);
    const fishVisualSiteNow = currentFishVisualSite();
    fishSchoolRenderer.update(fishVisualSiteNow, geo, layers, columns, camWorld, now / 1000);

    // --- picking + edits ---
    const debugPickHeld = performance.now() < debugPickHoldUntil;
    if (!debugPickHeld && aimActive && !touch.enabled && camDist < 120 && frameIdx % 2 === 0) {
      const dirx = tx - cwx, diry = ty - cwy, dirz = tz - cwz;
      const dl = Math.hypot(dirx, diry, dirz) || 1;
      updatePicks(dirx / dl, diry / dl, dirz / dl);
    }
    if (!debugPickHeld && (!aimActive || camDist >= 120)) { lastPick = null; treePick = null; }
    // touch: a tap mines at the tapped ray, a long-press builds there
    if (!worldBlocked() && touch.enabled && camDist < 120 && (tf.mines.length > 0 || tf.places.length > 0)) {
      for (const m of tf.mines) {
        rayV.set((m.x / window.innerWidth) * 2 - 1, -(m.y / window.innerHeight) * 2 + 1, 0.5).unproject(camera).normalize();
        updatePicks(rayV.x, rayV.y, rayV.z);
        tryMine();
      }
      for (const b of tf.places) {
        if (performance.now() >= debugPickHoldUntil) {
          rayV.set((b.x / window.innerWidth) * 2 - 1, -(b.y / window.innerHeight) * 2 + 1, 0.5).unproject(camera).normalize();
          updatePicks(rayV.x, rayV.y, rayV.z);
        }
        tryPlace('touch');
      }
      if (performance.now() >= debugPickHoldUntil) {
        lastPick = null;
        treePick = null;
      }
    }

    const hlTree = treePick && (!lastPick || treePick.dist < lastPick.dist);
    const hlTile = hlTree ? treePick!.tile : lastPick ? lastPick.hitTile : -1;
    if (hlTile >= 0) {
      highlight.visible = true;
      const deg = geo.degreeOf(hlTile);
      const r = (hlTree ? layers.topRadius(columns.topLayerOf(hlTile)) : layers.topRadius(lastPick!.hitLayer)) + 0.03;
      const corner = new Float64Array(3);
      for (let k = 0; k < deg; k++) {
        geo.cornerUnit(hlTile, k, corner);
        highlightPos.setXYZ(k, corner[0] * r - camWorld.x, corner[1] * r - camWorld.y, corner[2] * r - camWorld.z);
      }
      for (let k = deg; k < 7; k++) {
        highlightPos.setXYZ(k, highlightPos.getX(deg - 1), highlightPos.getY(deg - 1), highlightPos.getZ(deg - 1));
      }
      // close the loop
      highlightPos.setXYZ(deg, highlightPos.getX(0), highlightPos.getY(0), highlightPos.getZ(0));
      highlightPos.needsUpdate = true;
      highlightGeom.setDrawRange(0, deg + 1);
    } else {
      highlight.visible = false;
    }

    mineTimer -= dt; placeTimer -= dt;
    if (!worldBlocked() && (drained.mine || gp.minePressed || ((input.mineHeld || gp.mine) && mineTimer <= 0)) && (lastPick || treePick)) { tryMine(); mineTimer = nextMineCooldown; }
    if (!worldBlocked() && (drained.place || gp.placePressed || ((input.placeHeld || gp.place) && placeTimer <= 0)) && lastPick) {
      tryPlace((gp.placePressed || gp.place) ? 'gamepad' : touch.enabled ? 'touch' : 'pointer');
      placeTimer = 0.17;
    }

    saveTimer += dt;
    if (saveEnabled && (saveDirty || saveTimer >= 6) && performance.now() - lastSaveMs > 900) {
      writeSave(saveTimer >= 6);
      saveTimer = 0;
    }

    // --- hud + metrics ---
    metrics.frame(dtMs);
    hud.tick(dt);
    syncPanelOwnershipBody();
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.25;
      const agl = player.altitudeAGL();
      const speed = Math.hypot(player.vx, player.vy, player.vz);
      const home = homeScore(structures, geo);
      const food = foodCounts();
      const foodTotal = food.berries + food.caveMushroom + food.snowHerb + food.kelp + food.rawFish + food.cookedFish + food.campMeal + food.trailRation + food.expeditionStew;
      const survival = survivalSnapshot();
      const burden = packBurden();
      const natural = currentNaturalVoid();
      const caveSignal = nearbyCaveSignal();
      const landmarkProgress = progressionState();
      const landmarkNearby = nearbyLandmarkTile() !== null;
      const fishingCueNow = currentFishingCue();
      const vitalsAlert = isExposureCritical(survivalState) ? 'critical' : isExposureWarning(survivalState) ? 'warning' : 'none';
      hud.setVitals(`${metrics.fpsEma.toFixed(0)} fps${metrics.active() ? ` · ● ${metrics.active()}` : ''} · ${survival.status} ${survival.stamina}/${survival.exposure}${!creativeActive && burden.status !== 'light' ? ` · ${burden.label}` : ''}${structures.length > 0 ? ` · ${home.label}` : ''}${foodTotal > 0 ? ` · food ${foodTotal}` : ''}${landmarkProgress.count > 0 || landmarkNearby ? ` · ${landmarkProgress.label}` : ''}${fishingCueNow.showInVitals ? ` · ${fishingCueNow.hud}` : ''}`, vitalsAlert);
      if (showDiag) {
        const s = streamer.stats();
        const propStats = structureRenderer.stats();
        const landmarkStats = landmarkRenderer.stats();
        const fishVisualStats = fishSchoolRenderer.stats();
        const characterState = character.state();
        const characterStats = character.stats();
        const gamepadState = gamepad.snapshot();
        const audioState = audio.state();
        const tools = toolSummary(craftedItems, toolWear);
        const fishSchoolStats = currentFishSchool();
        const modeLabel = autopilot.active ? 'autopilot'
          : player.mode === 'plane' ? 'plane'
          : player.submerged > 0.4 ? 'swim'
          : player.mode;
        hud.setDiag([
          `${isWebGPU ? 'WebGPU' : 'WebGL2'} · ${metrics.frameMsEma.toFixed(1)} ms · seed ${SEED}`,
          `ux ${currentUxProfile.summary} · gamepad ${gamepadState.connected ? gamepadState.active ? 'active' : 'connected' : 'none'}${gamepadState.id ? ` · ${gamepadState.id.slice(0, 42)}` : ''}`,
          `mode ${modeLabel}${player.grounded ? ' (grounded)' : ''} · ${speed.toFixed(1)} m/s`,
          player.mode === 'plane' ? `throttle ${player.throttle.toFixed(0)} · holding ${player.holdAGL.toFixed(0)} m` : '',
          `alt ${agl.toFixed(1)} AGL · h ${(player.radius() - PLANET_RADIUS).toFixed(1)} · zoom ${camDist.toFixed(0)}`,
          `tile ${player.tile}${geo.degreeOf(player.tile) === 5 ? ' *pentagon*' : ''} · GP(${M},0)`,
          `chunks ${s.resident} res / ${s.queued} q · ${(s.triangles / 1000).toFixed(0)}k tris`,
          `columns ${columns.generatedCount.toLocaleString()} / ${geo.count.toLocaleString()} · edits ${edits}`,
          `pack ${burden.label} · ${burden.detail}${burden.staminaDrain > 0 ? ` · drain ${burden.staminaDrain.toFixed(2)}` : ''}${burden.sprintBlocked ? ' · sprint blocked' : ''}`,
          `tools ${tools.owned.map((tool) => tool.label).join(' · ') || 'hands'}${tools.repairKits > 0 ? ` · repair kits ${tools.repairKits}` : ''} · reach ${playerReach().toFixed(1)}`,
          `character ${characterState.action} · held ${characterState.held} · back ${characterState.backProps.join(',') || 'none'} · silhouette ${characterStats.silhouetteParts} · sockets ${characterStats.propSockets.length}`,
          `audio ${audioState.muted ? 'muted' : audioState.unlocked ? 'on' : 'locked'} · loaded ${audioState.loaded.length} · music ${audioState.musicStarted ? audioState.musicPlaying ? 'playing' : audioState.musicQueued ? 'waiting' : 'paused' : 'idle'}${audioState.musicTrack ? ` ${audioState.musicTrack}` : ''} · last ${audioState.lastEvent ?? 'none'}${audioState.errors.length ? ` · errors ${audioState.errors.length}` : ''}`,
          `structures ${structures.length} · prop meshes ${propStats.meshes} · ${home.label}`,
          `food bait ${food.bait} · seeds ${food.seeds} · compost ${food.compost} · berries ${food.berries} · mushroom/herb/kelp/reeds ${food.caveMushroom}/${food.snowHerb}/${food.kelp}/${food.reeds} · raw/cooked fish ${food.rawFish}/${food.cookedFish} · meals/rations/stews ${food.campMeal}/${food.trailRation}/${food.expeditionStew}`,
          `fish ${fishSchoolStats.label} · strength ${fishSchoolStats.strength.toFixed(2)} · catch ${fishSchoolStats.catchCount} · cue ${fishingCueNow.hud} · visual ${fishVisualStats.slug ?? 'none'} pts ${fishVisualStats.pointSchoolSprites} path ${fishVisualStats.swimPathBeads}`,
          `forage ${currentForage().label} · strength ${currentForage().strength.toFixed(2)}`,
          `survival ${survival.label} · day ${timeState.day + 1} ${(Math.floor(timeState.minute / 60)).toString().padStart(2, '0')}:${(Math.floor(timeState.minute % 60)).toString().padStart(2, '0')}`,
          `landmarks ${landmarkProgress.count}/${landmarkProgress.total} · meshes ${landmarkStats.meshes} · lit ${landmarkStats.lit}`,
          natural ? `natural void ${natural.kind} · depth ${natural.depth.toFixed(1)} m` : '',
          caveSignal && !natural ? `cave signal ${caveSignal.label ?? caveKindLabel(caveSignal.kind)} · ${caveSignal.distance} ring${caveSignal.distance === 1 ? '' : 's'} · depth ${caveSignal.depth.toFixed(1)} m${caveSignal.clearance !== undefined ? ` · clearance ${caveSignal.clearance}` : ''}` : '',
          lastFoodAction ? `last food ${lastFoodAction}` : '',
          lastToolAction ? `last tool ${lastToolAction}` : '',
          lastCaveAction ? `last cave ${lastCaveAction}` : '',
          lastSurvivalAction ? `last survival ${lastSurvivalAction}` : '',
          lastLandmarkAction ? `last landmark ${lastLandmarkAction}` : '',
          lastEditMs > 0 ? `last edit rebuild ${lastEditMs.toFixed(1)} ms` : '',
        ].filter((l) => l !== ''));
      } else {
        hud.setDiag(null);
      }
      hud.setFlight(
        player.mode === 'plane' ? `✈ ${speed.toFixed(0)} m/s · ${agl.toFixed(0)} m` :
        player.mode === 'fly' ? `fly · ${agl.toFixed(0)} m` :
        autopilot.active ? 'autopilot — G stops' : null);
      hud.setHotbar(SLOTS.map((sl, i) => ({ name: sl.name, css: sl.css, count: counts[i] })), hotbarSel);
      refreshCraftingHud();
      touch.setPlaneButton(
        creativeActive ? 'fly'
        : player.mode === 'plane' ? 'flying'
        : planeCrafted ? 'fly'
        : counts[WOOD_SLOT] > 0 ? 'craft'
        : 'hidden',
        creativeActive ? player.mode === 'fly' ? 'walk' : 'free'
        : !planeCrafted && player.mode !== 'plane'
          ? `${Math.min(counts[WOOD_SLOT], PLANE_WOOD_COST)}/${PLANE_WOOD_COST}` : '');
      touch.setDownVisible(player.mode !== 'walk');
      refreshUseButton();
    }

    renderer.render(scene, camera);
  });
}

boot().catch((err) => {
  console.error(err);
  splash(`boot failed: ${err}`, 0);
});
