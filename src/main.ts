import * as THREE from 'three/webgpu';
import { color, float, positionWorld, positionLocal, cameraPosition, normalWorld, normalize, attribute, vec3, time, mix, smoothstep as tslSmoothstep } from 'three/tsl';
import { Goldberg } from './geo/goldberg';
import { buildLayers, PLANET_RADIUS, WATER_SURFACE } from './world/layers';
import { NATURAL_VOID_SCAN_LAYERS, type NaturalVoidKind } from './world/caves';
import { Terrain, MAT, type MaterialId } from './world/terrain';
import { Columns } from './world/columns';
import { Trees } from './world/trees';
import { Streamer } from './world/streamer';
import { chunkKeyOfTile } from './world/chunks';
import { FarSphere } from './render/farsphere';
import { buildGeodesic } from './render/geodesic';
import { Sky } from './render/sky';
import { Character } from './render/character';
import { StructureRenderer } from './render/structures';
import { KilnRuntimeAssets } from './render/kilnAssets';
import { LandmarkRenderer } from './render/landmarks';
import { DomainResourceRenderer } from './render/domainResources';
import { SkyfallRenderer } from './render/skyfall';
import { CaveMouthRenderer } from './render/caveMouths';
import { RouteRenderer } from './render/routes';
import { MurmurRenderer } from './render/murmurs';
import { SeasonAfterglowRenderer } from './render/seasonAfterglow';
import { ResourceDropRenderer } from './render/resourceDrops';
import { NativeLifeRenderer } from './render/nativeLife';
import { Player } from './player/player';
import { Input } from './player/input';
import { TouchControls } from './player/touch';
import { GamepadControls, type GamepadFrame } from './player/gamepad';
import { UxManager, type UxInputMode, type UxProfile } from './player/ux';
import { panelOwnershipSnapshot, type PanelOwnershipSnapshot } from './player/panelOwnership';
import { pick, pickTree, type PickResult, type TreePick } from './edit/pick';
import { Metrics } from './demo/metrics';
import { Autopilot, OrbitDemo } from './demo/autopilot';
import { Hud, splash, hideSplash, type ChestStoragePanelView, type CraftingRecipeView, type RouteSlateView } from './demo/hud';
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
  nextResourceDropId,
  normalizeResourceDrops,
  spawnItemDrops,
  spawnMinedItemDrops,
  spawnTreeWoodDrops,
  type ResourceDropSave,
} from './sim/resourceDrops';
import {
  nativeCreatureSitesAround,
  nearestNativeCreatureSite,
  normalizeNativeCreatureTends,
  normalizeNativeCreatureWards,
  tendNativeCreature,
  wardNativeCreature,
  type NativeCreatureKind,
  type NativeCreatureSite,
} from './sim/nativeLife';
import { buildInventoryLedger, packBurdenForInventory, packCapacityBonusForInventory } from './sim/inventoryLedger';
import { cavePressureAt } from './sim/cavePressure';
import { applyFishingCatch, fishSchoolAt, type FishSchoolReport } from './sim/fishing';
import { applyForage, forageAt } from './sim/forage';
import { caveResourceAt } from './sim/caveResources';
import {
  caveResonanceNotebook,
  caveResonanceSite,
  normalizeCaveResonanceObservations,
  observeCaveResonance,
} from './sim/caveResonance';
import { caveMouthSignals, nearestCaveMouthSignal, type CaveMouthTile } from './sim/caveMouths';
import {
  packStructureCommand,
  placeStructureCommand,
  rotatePlacedStructureCommand,
  rotateSelectedPlacementCommand,
  selectStructurePlacementCommand,
  useStructureInteractionCommand,
  type StructureCommandResult,
} from './sim/buildCommands';
import {
  PLACEABLE_ITEM_IDS,
  STRUCTURE_YAW_STEP,
  caveAnchorKindLabel,
  chestStorageView,
  consumeWaterlineRouteResupply,
  homeScore,
  isPlaceableItemId,
  nearestStructureOnTiles,
  normalizeStructureSaves,
  placeableName,
  rootCellarProvisionCount,
  spendRootCellarProvision,
  structureYawTurn,
  structureStationInventory,
  transferChestMaterial,
  type ChestTransferAction,
  waystoneMarkLabel,
  type CropPlotEnvironment,
  type CaveAnchorContext,
  type FishTrapContext,
  type PlaceableItemId,
  type StructureSave,
  type WaterlineRouteResupplySource,
  type WeatherVaneContext,
  type WaystoneContext,
} from './sim/structures';
import {
  allPentagonLandmarks,
  completePentagonSiteWork,
  discoverPentagon,
  evaluatePentagonSiteWork,
  nearestPentagonOnTiles,
  nearestThresholdChamberSite,
  normalizePentagonDiscoveries,
  normalizePentagonSiteCompletions,
  normalizeThresholdChamberObservations,
  observeThresholdChamber,
  pentagonDomainAt,
  pentagonExpeditionSiteAt,
  pentagonExpeditionSites,
  pentagonInsightReport,
  pentagonInsightRewardText,
  pentagonLandmark,
  pentagonLandscapeProfiles,
  pentagonProgress,
  pentagonSiteThreshold,
  pentagonSiteThresholdEffect,
  pentagonSiteThresholdTerrainSpec,
  pentagonSiteThresholds,
  pentagonThresholdChambers,
  pentagonTileIds,
  type PentagonExpeditionSiteReport,
  type PentagonSiteWorkStatus,
  type PentagonSiteThresholdReport,
  type PentagonThresholdChamberSite,
} from './sim/landmarks';
import {
  domainResourceSites,
  harvestDomainResource,
  nearestDomainResourceSite,
  normalizeDomainHarvests,
} from './sim/domainResources';
import {
  harvestSkyfall,
  nearestSkyfallSite,
  normalizeSkyfallHarvests,
  skyfallSites,
} from './sim/skyfall';
import {
  murmurSites,
  murmurNotebook,
  nearestMurmurSite,
  normalizeMurmurObservations,
  observeMurmur,
  type MurmurSite,
} from './sim/murmurs';
import {
  normalizeSeasonAfterglowReadings,
  readSeasonAfterglow,
  seasonAfterglowForWindow,
  strangerSeasonForecast,
  type StrangerSeasonAfterglow,
  type StrangerSeasonWindow,
} from './sim/eventSeasons';
import { buildHearthJournal } from './sim/journal';
import {
  addRoutePlanLeg,
  chartBearingDegrees,
  chartTurnLabel,
  createRoutePlanFromGuides,
  formatChartDistance,
  greatCircleDistanceMeters,
  hearthBeaconSignal,
  markRoutePlanLegReached,
  nextHorizonChartSignal,
  normalizeRoutePlan,
  planExpedition,
  deferActiveRoutePlanLeg,
  removeActiveRoutePlanLeg,
  routeAdjacentTile,
  routeEcologyForExpedition,
  routeGuide,
  routeGuideCandidates,
  routePlanItineraryStatus,
  routePlanSignal,
  routeSlate,
  type RouteGuide,
  type RouteSlateNativeLifeSignal,
} from './sim/navigation';
import {
  backPropsForInventory,
  characterActionForLocomotion,
  defaultHeldProp,
  miningPropForMaterial,
  nativeDefenseActionForProp,
  pickupPropForItem,
  propForStructureInteraction,
  type CharacterAction,
  type CharacterPropId,
  type CharacterVisualState,
} from './sim/equipment';
import {
  bestToolForDefense,
  bestToolForMaterial,
  bestToolForRangedDefense,
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
  normalizeSurvivalState,
  normalizeTimeState,
  normalizeWeatherState,
  prepareHearthSupper,
  recoverFromCollapse,
  restAtShelter,
  shouldCollapse,
  isHazardWeather,
  survivalReport,
  updateSurvival,
  waitForWeatherWindow,
  weatherProtectionForInventory,
  weatherAt,
} from './sim/survival';

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
Plane: chop 2 trees for 12 wood · B craft · R use/open chest/farm/fish/forage · Shift+R pack prop · M chart · P itinerary · Shift+P clear · J journal · E board/stow
Route Slate: Arrow keys choose/drop/move stops · Enter pin · Esc close
F free-flight · F3 stats · H help`;

const TOUCH_HELP = `Touch: left stick move · drag to look · pinch zoom
Tap terrain to mine/chop · hold terrain to build · hold use to pack prop
Craft opens recipes/pack · route panel buttons pin/later/drop/clear itinerary stops · plane boards/stows · log opens the Hearth Journal`;

const GAMEPAD_HELP = `Gamepad: LS move · RS look · full stick/RB sprint · LB+RS zoom
A jump/swim · LT descend · X mine/chop · RT build · D-pad hotbar
B use · LB+B pack prop · Y craft · Back route slate · D-pad edits open itinerary · LB+D-pad rotates selected build or pins/clears routes · Start board/stow`;

function inputHelpText(mode: UxInputMode): string {
  if (mode === 'gamepad' || mode === 'hybrid') return GAMEPAD_HELP;
  if (mode === 'touch') return TOUCH_HELP;
  return KEYBOARD_HELP;
}

function hudLabelsForInput(mode: UxInputMode): { craft: string; route: string; hotbar: string[] } {
  if (mode === 'gamepad' || mode === 'hybrid') return { craft: 'Y', route: 'Back', hotbar: ['1', '2', '3', '4', '5'] };
  if (mode === 'touch') return { craft: 'craft', route: 'route', hotbar: ['1', '2', '3', '4', '5'] };
  return { craft: 'B', route: 'M', hotbar: ['1', '2', '3', '4', '5'] };
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
  let resourceDrops: ResourceDropSave[] = normalizeResourceDrops(loadedSave?.drops, geo.count);
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
  // a clearing at the edge of a wood so the survival loop (chop -> craft) is in view
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
  const unlockAudio = (): void => { void audio.unlock(); };
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
  const kilnAssets = new KilnRuntimeAssets();
  const structureRenderer = new StructureRenderer(scene, kilnAssets);
  structureRenderer.setStructures(structures);
  const discoveredPentagons = new Set(normalizePentagonDiscoveries(loadedSave?.progression?.pentagons, pentagonTiles));
  const completedPentagonSites = new Set(normalizePentagonSiteCompletions(loadedSave?.progression?.siteCompletions, pentagonTiles));
  const harvestedDomainResources = new Set(normalizeDomainHarvests(loadedSave?.progression?.domainHarvests));
  const harvestedSkyfalls = new Set(normalizeSkyfallHarvests(loadedSave?.progression?.skyfallHarvests));
  const observedMurmurs = new Set(normalizeMurmurObservations(loadedSave?.progression?.murmurObservations));
  const seasonAfterglowReadings = new Set(normalizeSeasonAfterglowReadings(loadedSave?.progression?.seasonAfterglowReadings));
  const observedThresholdChambers = new Set(normalizeThresholdChamberObservations(loadedSave?.progression?.thresholdChamberObservations));
  const observedCaveResonances = new Set(normalizeCaveResonanceObservations(loadedSave?.progression?.caveResonanceObservations));
  const tendedNativeCreatures = new Set(normalizeNativeCreatureTends(loadedSave?.progression?.nativeCreatureTends));
  const wardedNativeCreatures = new Set(normalizeNativeCreatureWards(loadedSave?.progression?.nativeCreatureWards));
  const landmarkRenderer = new LandmarkRenderer(scene, pentagonTiles);
  const domainResourceRenderer = new DomainResourceRenderer(scene);
  const skyfallRenderer = new SkyfallRenderer(scene);
  const caveMouthRenderer = new CaveMouthRenderer(scene);
  const routeRenderer = new RouteRenderer(scene);
  const murmurRenderer = new MurmurRenderer(scene);
  const seasonAfterglowRenderer = new SeasonAfterglowRenderer(scene);
  const resourceDropRenderer = new ResourceDropRenderer(scene);
  const nativeLifeRenderer = new NativeLifeRenderer(scene);
  resourceDropRenderer.setDrops(resourceDrops);

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
  let journalOpen = false;
  let openChestId: number | null = null;
  let storageFocusIndex = 0;
  let storageFocusAction: ChestTransferAction = 'depositOne';
  let routeFocusIndex = 0;
  let routeFocusDirty = false;
  let routeFocusActive = false;
  let selectedStructureItem: PlaceableItemId | null = null;
  let placementYawTurns = 0;
  let lastStructureAction = '';
  type BuildCommandSource = 'keyboard' | 'pointer' | 'touch' | 'gamepad' | 'debug';
  type BuildCommandVerb = 'select' | 'rotate' | 'place' | 'use' | 'pack';
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
  let lastThresholdTerrainAction = '';
  let lastThresholdChamberAction = '';
  let lastDomainResourceAction = '';
  let lastSkyfallAction = '';
  let lastMurmurAction = '';
  let lastSeasonAfterglowAction = '';
  let lastNativeLifeAction = '';
  let lastNavigationAction = '';
  let lastToolAction = '';
  let lastCaveAction = '';
  let lastSurvivalAction = '';
  let lastPickupAction = '';
  let toolWear: ToolWear = normalizeToolWear(loadedSave?.progression?.toolWear);
  let activeRoutePlan = normalizeRoutePlan(loadedSave?.progression?.routePlan, geo.count);
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
  let mineTimer = 0;
  let nextMineCooldown = 0.17;
  let placeTimer = 0;
  let edits = columns.edits.size;
  let lastEditMs = 0;
  let saveDirty = !loadedSave && saveEnabled;
  let saveTimer = 0;
  let lastSaveMs = 0;
  let nativeHazardCooldown = 0;

  const markSaveDirty = (): void => {
    if (saveEnabled) saveDirty = true;
  };

  const hasInventoryItem = (id: ItemId): boolean => itemCount(counts, craftedItems, id) > 0;
  const spendCraftedItem = (id: ItemId, amount = 1): boolean => {
    if (creativeActive) return true;
    const spend = Math.max(1, Math.trunc(amount));
    const have = itemCount(counts, craftedItems, id);
    if (have < spend) return false;
    const next = have - spend;
    if (next > 0) craftedItems[id] = next;
    else delete craftedItems[id];
    markSaveDirty();
    return true;
  };

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
    ready: resourceDrops.filter((drop) => drop.age >= 0.9).length,
    lastPickup: lastPickupAction,
    items: resourceDrops.slice(0, 12).map((drop) => ({
      id: drop.id,
      item: drop.item,
      count: drop.count,
      tile: drop.tile,
      age: Math.round(drop.age * 100) / 100,
      source: drop.source,
    })),
    renderer: resourceDropRenderer.stats(),
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
    const result = collectReadyResourceDrops(resourceDrops, tileSetAround(player.tile, 1));
    if (result.collected.length === 0) return;
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
      progression: { pentagons: [...discoveredPentagons], siteCompletions: [...completedPentagonSites], domainHarvests: [...harvestedDomainResources], skyfallHarvests: [...harvestedSkyfalls], murmurObservations: [...observedMurmurs], seasonAfterglowReadings: [...seasonAfterglowReadings], thresholdChamberObservations: [...observedThresholdChambers], caveResonanceObservations: [...observedCaveResonances], nativeCreatureTends: [...tendedNativeCreatures], nativeCreatureWards: [...wardedNativeCreatures], routePlan: activeRoutePlan, toolWear },
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
    const spawned = spawnTreeWoodDrops(tile, nextDropId, WOOD_PER_TREE);
    nextDropId = spawned.nextId;
    resourceDrops = [...resourceDrops, ...spawned.drops];
    resourceDropRenderer.setDrops(resourceDrops);
    return spawned.drops;
  };

  const spawnNativeLifeDrops = (site: NativeCreatureSite): ResourceDropSave[] => {
    const spawned = spawnItemDrops(site.tile, nextDropId, site.reward.item, site.reward.count, 'creature', 1);
    nextDropId = spawned.nextId;
    resourceDrops = [...resourceDrops, ...spawned.drops];
    resourceDropRenderer.setDrops(resourceDrops);
    return spawned.drops;
  };

  const spawnMineDrops = (tile: number, item: ItemId, count = 1): ResourceDropSave[] => {
    const spawned = spawnMinedItemDrops(tile, nextDropId, item, count);
    nextDropId = spawned.nextId;
    resourceDrops = [...resourceDrops, ...spawned.drops];
    resourceDropRenderer.setDrops(resourceDrops);
    return spawned.drops;
  };

  const nativeWardReadiness = (site?: NativeCreatureSite | null): { prepared: boolean; label: string; prop: CharacterPropId; tool?: ToolEffect } => {
    if (site?.kind === 'caveBelljaw') {
      if (itemCount(counts, craftedItems, 'echoLantern') > 0) return { prepared: true, label: 'echo lantern', prop: 'echoLantern' };
      if (itemCount(counts, craftedItems, 'lantern') > 0) return { prepared: true, label: 'lantern', prop: 'lantern' };
      const blade = bestToolForDefense(craftedItems, toolWear);
      if (blade.tool) return { prepared: true, label: blade.name.toLowerCase(), prop: blade.tool, tool: blade };
      return { prepared: false, label: 'hands', prop: 'hands' };
    }
    if (site?.kind === 'screeSnapper') {
      const blade = bestToolForDefense(craftedItems, toolWear);
      if (blade.tool) return { prepared: true, label: blade.name.toLowerCase(), prop: blade.tool, tool: blade };
      const axe = bestToolForTree(craftedItems, toolWear);
      if (axe.tool) return { prepared: true, label: axe.name.toLowerCase(), prop: axe.tool, tool: axe };
      return { prepared: false, label: 'hands', prop: 'hands' };
    }
    if (site?.kind === 'stormBurr') {
      if (itemCount(counts, craftedItems, 'stormCloak') > 0) return { prepared: true, label: 'storm cloak brace', prop: 'stormCloak' };
      const blade = bestToolForDefense(craftedItems, toolWear);
      if (blade.tool) return { prepared: true, label: blade.name.toLowerCase(), prop: blade.tool, tool: blade };
      const axe = bestToolForTree(craftedItems, toolWear);
      if (axe.tool) return { prepared: true, label: axe.name.toLowerCase(), prop: axe.tool, tool: axe };
      return { prepared: false, label: 'hands', prop: 'hands' };
    }
    if (site?.kind === 'tideLurker') {
      if (itemCount(counts, craftedItems, 'echoLantern') > 0) return { prepared: true, label: 'echo lantern', prop: 'echoLantern' };
      if (itemCount(counts, craftedItems, 'lantern') > 0) return { prepared: true, label: 'lantern', prop: 'lantern' };
      const blade = bestToolForDefense(craftedItems, toolWear);
      if (blade.tool) return { prepared: true, label: blade.name.toLowerCase(), prop: blade.tool, tool: blade };
      const axe = bestToolForTree(craftedItems, toolWear);
      if (axe.tool) return { prepared: true, label: axe.name.toLowerCase(), prop: axe.tool, tool: axe };
      return { prepared: false, label: 'hands', prop: 'hands' };
    }
    const blade = bestToolForDefense(craftedItems, toolWear);
    if (blade.tool) return { prepared: true, label: blade.name.toLowerCase(), prop: blade.tool, tool: blade };
    const axe = bestToolForTree(craftedItems, toolWear);
    if (axe.tool) return { prepared: true, label: axe.name.toLowerCase(), prop: axe.tool, tool: axe };
    if (itemCount(counts, craftedItems, 'echoLantern') > 0) return { prepared: true, label: 'echo lantern', prop: 'echoLantern' };
    if (itemCount(counts, craftedItems, 'lantern') > 0) return { prepared: true, label: 'lantern', prop: 'lantern' };
    if (itemCount(counts, craftedItems, 'stormCloak') > 0) return { prepared: true, label: 'storm cloak', prop: 'stormCloak' };
    return { prepared: false, label: 'hands', prop: 'hands' };
  };

  const applyNativeHazardPressure = (site: NativeCreatureSite, reason = 'crowded'): void => {
    const pressure = site.pressure;
    const staminaLoss = Math.max(1, Math.trunc(pressure?.stamina ?? 8));
    const exposureGain = Math.max(1, Math.trunc(pressure?.exposure ?? 4));
    survivalState.stamina = Math.max(0, survivalState.stamina - staminaLoss);
    survivalState.exposure = Math.min(100, survivalState.exposure + exposureGain);
    const pressureVerb = site.kind === 'caveBelljaw'
      ? reason === 'ward failed' ? 'snaps shut' : 'claps too close'
      : site.kind === 'screeSnapper'
      ? reason === 'mining noise' ? 'launches from loose scree' : reason === 'ward failed' ? 'snaps through your guard' : 'winds up and snaps'
      : site.kind === 'stormBurr'
      ? reason === 'ward failed' ? 'bursts through your guard' : reason === 'weather gust' ? 'tumbles in on the gust' : 'rolls its burr spines too close'
      : site.kind === 'tideLurker'
      ? reason === 'fishing splash' ? 'surges from the cave tide' : reason === 'ward failed' ? 'snaps through the splash' : 'lunges from tidewater'
      : reason === 'ward failed' ? 'lashes out' : 'rattles too close';
    const message = `${site.label} ${pressureVerb} · -${staminaLoss} stamina · +${exposureGain} exposure`;
    lastNativeLifeAction = message;
    lastSurvivalAction = `native hazard:${message}`;
    triggerCharacterAction('stagger', reason === 'fishing splash' ? 'fishingRod' : 'hands', 0.52);
    playAudio('uiDeny');
    hud.flash(message, 3);
    markSaveDirty();
    refreshUseButton();
  };

  const triggerNativeMiningNoise = (tile: number, material: MaterialItemId): void => {
    if (creativeActive || player.mode !== 'walk' || material !== 'rock') return;
    const site = nearestNativeCreatureSite(SEED, geo, columns, terrain, tile, 2, tendedNativeCreatures, wardedNativeCreatures, 'screeSnapper');
    if (!site || site.warded) return;
    nativeHazardCooldown = Math.max(nativeHazardCooldown, site.pressure?.interval ?? 2.35);
    applyNativeHazardPressure(site, 'mining noise');
    nativeLifeRenderer.setSites(currentNativeCreatureSites());
  };

  const triggerNativeFishingSplash = (school: FishSchoolReport): boolean => {
    if (creativeActive || player.mode !== 'walk' || school.kind !== 'cave') return false;
    const site = nearestNativeCreatureSite(SEED, geo, columns, terrain, player.tile, 2, tendedNativeCreatures, wardedNativeCreatures, 'tideLurker');
    if (!site || site.warded) return false;
    nativeHazardCooldown = Math.max(nativeHazardCooldown, site.pressure?.interval ?? 2.55);
    applyNativeHazardPressure(site, 'fishing splash');
    nativeLifeRenderer.setSites(currentNativeCreatureSites());
    return true;
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
    const caveDrop = caveResourceAt(columns, targetTile, targetLayer, materialItem);
    const mined = columns.mine(targetTile, targetLayer);
    if (!mined) {
      mining.clear(targetTile, targetLayer);
      return { ok: false, reason: 'mine failed', tile: targetTile, layer: targetLayer, materialItem, strike, mineProgress: mineProgressDiagnostics() };
    }
    const slot = yieldSlot(mat);
    const materialDrops = slot >= 0 ? spawnMineDrops(targetTile, materialItem, 1) : [];
    if (caveDrop) {
      spawnMineDrops(targetTile, caveDrop.item, caveDrop.amount);
      lastCaveAction = `mined loose ${caveDrop.label}`;
      playAudio('caveRead');
      hud.flash(`${caveDrop.caveKind === 'dryCave' ? 'dry cave' : 'sea cave'} crystal chips dropped`, 3);
    } else {
      playAudio('gatherSoft');
      if (materialDrops.length > 0) hud.flash(`${ITEM_DEFS[materialItem].name.toLowerCase()} chip dropped`, 1.6);
    }
    edits++;
    triggerNativeMiningNoise(targetTile, materialItem);
    rebuildAround(targetTile);
    return { ok: true, tile: targetTile, layer: targetLayer, materialItem, strike, mined: true, caveDrop, resourceDrops: resourceDropDiagnostics(), mineProgress: mineProgressDiagnostics() };
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

  let fWas = false, gWas = false, oWas = false, eWas = false, bWas = false, rWas = false, qWas = false, mWas = false, pWas = false, nWas = false, jWas = false, zWas = false, xWas = false, escWas = false, f3Was = false, hWas = false;
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
  const pentagonInsights = () => pentagonInsightReport(pentagonTiles, discoveredPentagons);
  const pentagonDomainForTile = (tile: number, radius = 2) => pentagonDomainAt(tile, geo, pentagonTiles, discoveredPentagons, radius);
  const currentPentagonDomain = () => pentagonDomainForTile(player.tile, 2);
  const pentagonSiteForTile = (tile: number, radius = 2) => pentagonExpeditionSiteAt(tile, geo, pentagonTiles, discoveredPentagons, radius);
  const currentPentagonSite = () => pentagonSiteForTile(player.tile, 2);
  const currentDomainResourceSites = () => domainResourceSites(pentagonTiles, geo, discoveredPentagons, harvestedDomainResources);
  const nearbyDomainResource = () => nearestDomainResourceSite(nearbyTiles(1), currentDomainResourceSites());
  const currentRouteResourceSignal = () => {
    const site = nearbyDomainResource();
    return site ? {
      label: site.label,
      dormantLabel: site.dormantLabel,
      detail: site.detail,
      rewardLabel: site.reward.label,
      rewardCount: site.reward.count,
      discovered: site.discovered,
      harvested: site.harvested,
      hint: site.hint,
    } : null;
  };
  const domainResourceDiagnostics = () => {
    const sites = currentDomainResourceSites();
    return {
      total: sites.length,
      discovered: sites.filter((site) => site.discovered).length,
      harvested: sites.filter((site) => site.harvested).length,
      nearby: nearbyDomainResource(),
      renderer: domainResourceRenderer.stats(),
      lastAction: lastDomainResourceAction,
    };
  };
  const currentSkyfallSites = () => skyfallSites(SEED, timeState.day, timeState.minute, geo.count, harvestedSkyfalls);
  const currentSkyfall = () => currentSkyfallSites()[0] ?? null;
  const nearbySkyfall = () => nearestSkyfallSite(nearbyTiles(1), currentSkyfallSites());
  const currentRouteSkyfallSignal = () => {
    const site = currentSkyfall();
    if (!site || !site.active || site.harvested) return null;
    const distanceM = greatCircleDistanceMeters(geo.centers, player.tile, site.tile, PLANET_RADIUS);
    const bearingDeg = chartBearingDegrees(geo.centers, geo.frameOf(player.tile), player.tile, [player.fwdX, player.fwdY, player.fwdZ], site.tile);
    return {
      tile: site.tile,
      kind: site.kind,
      label: site.label,
      detail: site.detail,
      omenLabel: site.omen.label,
      omenDetail: site.omen.detail,
      rewardLabel: site.reward.label,
      rewardCount: site.reward.count,
      distanceM,
      distanceLabel: formatChartDistance(distanceM),
      turn: chartTurnLabel(bearingDeg),
      minutesRemaining: site.minutesRemaining,
      active: site.active,
      harvested: site.harvested,
    };
  };
  const skyfallDiagnostics = () => {
    const sites = currentSkyfallSites();
    return {
      total: sites.length,
      active: sites.filter((site) => site.active && !site.harvested).length,
      harvested: sites.filter((site) => site.harvested).length,
      current: currentSkyfall(),
      nearby: nearbySkyfall(),
      renderer: skyfallRenderer.stats(),
      lastAction: lastSkyfallAction,
    };
  };
  const currentMurmurSites = () => murmurSites(SEED, timeState.day, timeState.minute, geo.count, observedMurmurs);
  const nearbyMurmur = () => nearestMurmurSite(nearbyTiles(1), currentMurmurSites());
  const currentRouteMurmurSignal = () => {
    let best: (MurmurSite & { distanceM: number; bearingDeg: number }) | null = null;
    for (const site of currentMurmurSites()) {
      if (!site.active || site.observed) continue;
      const distanceM = greatCircleDistanceMeters(geo.centers, player.tile, site.tile, PLANET_RADIUS);
      if (best && distanceM >= best.distanceM) continue;
      const bearingDeg = chartBearingDegrees(geo.centers, geo.frameOf(player.tile), player.tile, [player.fwdX, player.fwdY, player.fwdZ], site.tile);
      best = { ...site, distanceM, bearingDeg };
    }
    return best ? {
      tile: best.tile,
      kind: best.kind,
      label: best.label,
      detail: best.detail,
      note: best.note,
      distanceM: best.distanceM,
      distanceLabel: formatChartDistance(best.distanceM),
      turn: chartTurnLabel(best.bearingDeg),
      minutesRemaining: best.minutesRemaining,
      active: best.active,
      observed: best.observed,
    } : null;
  };
  const murmurDiagnostics = () => {
    const sites = currentMurmurSites();
    return {
      total: sites.length,
      active: sites.filter((site) => site.active && !site.observed).length,
      observed: observedMurmurs.size,
      windowObserved: sites.filter((site) => site.observed).length,
      nearby: nearbyMurmur(),
      route: currentRouteMurmurSignal(),
      renderer: murmurRenderer.stats(),
      lastAction: lastMurmurAction,
    };
  };
  const currentNativeCreatureSites = (): NativeCreatureSite[] =>
    nativeCreatureSitesAround(SEED, geo, columns, terrain, player.tile, 7, tendedNativeCreatures, wardedNativeCreatures, 7);
  const nativeLifeRoutePriority = (site: Pick<NativeCreatureSite, 'temperament' | 'tended' | 'warded'>): number =>
    site.temperament !== 'harmless' && !site.warded
      ? site.temperament === 'combative' ? 95 : 91
      : site.temperament === 'harmless' && !site.tended
      ? 86
      : 29;
  const currentRouteNativeLifeSignals = (): RouteSlateNativeLifeSignal[] =>
    currentNativeCreatureSites()
      .slice()
      .sort((a, b) => nativeLifeRoutePriority(b) - nativeLifeRoutePriority(a) || a.label.localeCompare(b.label))
      .map((site) => {
        const distanceM = greatCircleDistanceMeters(geo.centers, player.tile, site.tile, PLANET_RADIUS);
        const bearingDeg = chartBearingDegrees(geo.centers, geo.frameOf(player.tile), player.tile, [player.fwdX, player.fwdY, player.fwdZ], site.tile);
        return {
          tile: site.tile,
          kind: site.kind,
          label: site.label,
          detail: site.detail,
          temperament: site.temperament,
          rewardLabel: site.reward.label,
          rewardCount: site.reward.count,
          distanceM,
          tended: site.tended,
          warded: site.warded,
          hint: site.hint,
          distanceLabel: formatChartDistance(distanceM),
          turn: chartTurnLabel(bearingDeg),
          telegraph: site.combat?.telegraph,
          weakness: site.combat?.weakness,
          result: site.combat?.result,
        };
      });
  const nearbyNativeCreature = (): NativeCreatureSite | null =>
    nearestNativeCreatureSite(SEED, geo, columns, terrain, player.tile, 1, tendedNativeCreatures, wardedNativeCreatures);
  const nearbyNativeHazard = (): NativeCreatureSite | null =>
    nativeCreatureSitesAround(SEED, geo, columns, terrain, player.tile, 1, tendedNativeCreatures, wardedNativeCreatures, 16)
      .find((site) => site.temperament !== 'harmless') ?? null;
  const rangedNativeHazard = (): NativeCreatureSite | null => {
    if (itemCount(counts, craftedItems, 'reedBow') <= 0 || itemCount(counts, craftedItems, 'whistlingArrow') <= 0) return null;
    return nativeCreatureSitesAround(SEED, geo, columns, terrain, player.tile, 5, tendedNativeCreatures, wardedNativeCreatures, 24)
      .filter((site) => site.kind === 'brambleback' || site.kind === 'screeSnapper' || site.kind === 'stormBurr' || site.kind === 'tideLurker')
      .find((site) => !site.warded) ?? null;
  };
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
  const nativeLifeDiagnostics = () => {
    const sites = currentNativeCreatureSites();
    const hazard = nearbyNativeHazard();
    const rangedHazard = rangedNativeHazard();
    return {
      visible: sites.length,
      tended: tendedNativeCreatures.size,
      warded: wardedNativeCreatures.size,
      nearby: nearbyNativeCreature(),
      hazard: hazard && !hazard.warded ? hazard : null,
      rangedHazard,
      lastAction: lastNativeLifeAction,
      renderer: nativeLifeRenderer.stats(),
      sites: sites.slice(0, 8),
    };
  };
  const currentStrangerSeasons = (): StrangerSeasonWindow[] =>
    strangerSeasonForecast(SEED, timeState.day, timeState.minute, geo.count, harvestedSkyfalls, observedMurmurs, 4);
  const currentStrangerSeason = (): StrangerSeasonWindow | null => currentStrangerSeasons()[0] ?? null;
  const currentRouteSeasonSignal = () => {
    const season = currentStrangerSeason();
    return season ? {
      label: season.label,
      detail: season.detail,
      tradeoff: season.tradeoff,
      routeHint: season.routeHint,
      startsInMinutes: season.startsInMinutes,
      endsInMinutes: season.endsInMinutes,
      urgency: season.urgency,
      focus: season.focus,
      chain: {
        progressLabel: season.chain.progressLabel,
        payoffLabel: season.chain.payoffLabel,
        payoffDetail: season.chain.payoffDetail,
        routeEffect: season.chain.routeEffect,
        linked: season.chain.linked,
        fullChord: season.chain.fullChord,
      },
    } : null;
  };
  const currentSeasonAfterglow = (): StrangerSeasonAfterglow | null =>
    seasonAfterglowForWindow(currentStrangerSeason(), seasonAfterglowReadings);
  const nearbySeasonAfterglow = (): StrangerSeasonAfterglow | null => {
    const afterglow = currentSeasonAfterglow();
    if (!afterglow || afterglow.read) return null;
    return tileSetAround(player.tile, 1).has(afterglow.tile) ? afterglow : null;
  };
  const currentRouteSeasonAfterglowSignal = () => {
    const afterglow = currentSeasonAfterglow();
    if (!afterglow) return null;
    const distanceM = greatCircleDistanceMeters(geo.centers, player.tile, afterglow.tile, PLANET_RADIUS);
    const bearingDeg = chartBearingDegrees(geo.centers, geo.frameOf(player.tile), player.tile, [player.fwdX, player.fwdY, player.fwdZ], afterglow.tile);
    return {
      tile: afterglow.tile,
      id: afterglow.id,
      label: afterglow.label,
      detail: afterglow.detail,
      note: afterglow.note,
      routeHint: afterglow.routeHint,
      read: afterglow.read,
      distanceM,
      distanceLabel: formatChartDistance(distanceM),
      turn: chartTurnLabel(bearingDeg),
      focusMinutes: afterglow.focusMinutes,
    };
  };
  const seasonAfterglowDiagnostics = () => ({
    current: currentSeasonAfterglow(),
    nearby: nearbySeasonAfterglow(),
    readings: [...seasonAfterglowReadings],
    renderer: seasonAfterglowRenderer.stats(),
    lastAction: lastSeasonAfterglowAction,
  });
  const seasonGuideForTile = (
    kind: 'skyfall' | 'murmur',
    tile: number,
    label: string,
    detail: string,
    priority: number,
  ): RouteGuide | null => {
    if (!Number.isFinite(tile)) return null;
    const targetTile = Math.max(0, Math.min(geo.count - 1, Math.trunc(tile)));
    const distanceM = greatCircleDistanceMeters(geo.centers, player.tile, targetTile, PLANET_RADIUS);
    if (distanceM <= 8) return null;
    const bearingDeg = chartBearingDegrees(geo.centers, geo.frameOf(player.tile), player.tile, [player.fwdX, player.fwdY, player.fwdZ], targetTile);
    return {
      kind,
      targetTile,
      label,
      detail: `${formatChartDistance(distanceM)} ${chartTurnLabel(bearingDeg)} · ${detail}`,
      priority,
    };
  };
  const currentSeasonRouteGuides = (): RouteGuide[] => {
    const season = currentStrangerSeason();
    if (!season || season.chain.fullChord || season.focus === 'quiet') return [];
    const guides: RouteGuide[] = [];
    const urgencyBoost = season.urgency === 'now' ? 0 : season.urgency === 'soon' ? -22 : -52;
    const pushGuide = (guide: RouteGuide | null) => {
      if (!guide) return;
      if (guides.some((existing) => existing.targetTile === guide.targetTile)) return;
      guides.push(guide);
    };
    const fallOpen = !!season.skyfall && season.skyfall.active && !season.skyfall.harvested;
    if (fallOpen) {
      const claimedNotes = season.chain.notesObserved > 0;
      pushGuide(seasonGuideForTile(
        'skyfall',
        season.skyfall!.tile,
        `Season Fall: ${season.skyfall!.label}`,
        `season fall · ${season.skyfall!.omen.label} · +${season.skyfall!.reward.count} ${season.skyfall!.reward.label} · ${season.skyfall!.minutesRemaining}m left${claimedNotes ? ' · complete the link' : ''}`,
        (claimedNotes ? 130 : 126) + urgencyBoost,
      ));
    }
    const notes = season.murmurs
      .filter((site) => site.active && !site.observed)
      .map((site) => ({
        site,
        distanceM: greatCircleDistanceMeters(geo.centers, player.tile, site.tile, PLANET_RADIUS),
      }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 3);
    for (const [index, entry] of notes.entries()) {
      const detail = `season note ${index + 1}/${Math.max(1, season.chain.notesTotal)} · ${entry.site.label} · ${entry.site.minutesRemaining}m left${season.chain.fallClaimed ? ' · extend the chord' : ' · listen first'}`;
      pushGuide(seasonGuideForTile(
        'murmur',
        entry.site.tile,
        `Season Note: ${entry.site.label}`,
        detail,
        (season.chain.fallClaimed ? 128 : 122) + urgencyBoost - index,
      ));
    }
    return guides.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
  };
  const currentSeasonChain = () => currentStrangerSeason()?.chain ?? null;
  const seasonChainFlash = (): string => {
    const chain = currentSeasonChain();
    return chain?.linked ? ` · ${chain.payoffLabel}: ${chain.payoffDetail}` : '';
  };
  const isSeasonActionRouteSignal = (signal: ReturnType<typeof routePlanSignal> | null): signal is NonNullable<ReturnType<typeof routePlanSignal>> =>
    !!signal
    && (
      signal.sourceKind === 'seasonAfterglow'
      || ((signal.sourceKind === 'skyfall' || signal.sourceKind === 'murmur') && signal.label.startsWith('Season '))
    );
  const strangerSeasonDiagnostics = () => ({
    current: currentStrangerSeason(),
    forecast: currentStrangerSeasons(),
  });
  const currentThresholdChambers = (): PentagonThresholdChamberSite[] =>
    pentagonThresholdChambers(pentagonTiles, geo, discoveredPentagons, completedPentagonSites, observedThresholdChambers);
  const nearbyThresholdChamber = () => nearestThresholdChamberSite(nearbyTiles(2), currentThresholdChambers());
  const currentRouteThresholdChamberSignal = () => {
    const site = nearbyThresholdChamber();
    return site ? {
      label: site.label,
      detail: site.detail,
      note: site.note,
      rewardLabel: site.reward.label,
      rewardCount: site.reward.count,
      landmarkName: site.landmarkName,
      thresholdLabel: site.thresholdLabel,
      open: site.open,
      observed: site.observed,
      hint: site.hint,
    } : null;
  };
  const thresholdChamberDiagnostics = () => {
    const sites = currentThresholdChambers();
    return {
      total: sites.length,
      open: sites.filter((site) => site.open).length,
      observed: observedThresholdChambers.size,
      nearby: nearbyThresholdChamber(),
      sites,
      lastAction: lastThresholdChamberAction,
    };
  };
  const shouldShowUseButton = (): boolean =>
    structures.length > 0 ||
    nearbyThresholdChamber() !== null ||
    nearbyDomainResource() !== null ||
    nearbySkyfall() !== null ||
    nearbyMurmur() !== null ||
    nearbySeasonAfterglow() !== null ||
    nearbyNativeCreature() !== null ||
    rangedNativeHazard() !== null ||
    itemCount(counts, craftedItems, 'fishingRod') > 0 ||
    itemCount(counts, craftedItems, 'echoLantern') > 0 ||
    nearestPentagonOnTiles(nearbyTiles(1), pentagonTiles) !== null;
  const refreshUseButton = (): void => touch.setUseVisible(shouldShowUseButton());

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

  const placementYawOffset = (): number => placementYawTurns * STRUCTURE_YAW_STEP;
  const placementDiagnostics = () => ({
    selected: selectedStructureItem,
    turn: placementYawTurns,
    degrees: placementYawTurns * 60,
    offset: placementYawOffset(),
    targetTile: lastPick?.hitTile ?? null,
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
      tile: result.placed?.tile ?? targetStructure?.tile,
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
      : nearestStructureOnTiles(structures, nearbyStructureTiles());
    const result = rotatePlacedStructureCommand(structures, target, delta);
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
    let k = layer ?? columns.groundLayerBelow(tile, layers.bounds[0]);
    let blocker: string | null = null;
    const inventoryBefore = itemCount(counts, craftedItems, item);
    if (item === 'dockSegment') {
      if (!waterNearTile(tile, 1)) {
        blocker = 'dock needs a shore or water edge';
      } else {
        const groundK = columns.groundLayerBelow(tile, layers.bounds[0]);
        const groundTop = layers.topRadius(groundK);
        const waterK = layers.layerOfRadius(WATER_SURFACE);
        k = groundTop < WATER_SURFACE + 0.2 ? waterK : groundK;
      }
    } else if (!columns.solidAt(tile, k)) {
      blocker = 'needs solid ground';
    }
    const result = placeStructureCommand({
      structures,
      item,
      tile,
      layer: k,
      yaw: yaw ?? yawForTile(tile) + placementYawOffset(),
      placementTurn: placementYawTurns,
      materialCounts: counts,
      craftedItems,
      creative: creativeActive,
      playerTile: player.tile,
      blocker,
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
    selectedStructureItem = result.selected ?? result.item;
    craftingOpen = false;
    refreshCraftingHud();
    hud.slotName(result.message);
    playAudio('uiOpen');
    hud.flash(touch.enabled ? 'hold terrain to set it down' : 'RMB sets it · Z/X rotates facing', 3);
  };

  hud.onPlaceSelect = selectStructureForPlacement;

  const tileEntriesAroundTile = (centerTile: number, rings = 1): CaveMouthTile[] => {
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
  const nearbyTileEntries = (rings = 1): CaveMouthTile[] => tileEntriesAroundTile(player.tile, rings);

  const siteWorkStructures = (site: PentagonExpeditionSiteReport): StructureSave[] => {
    const local = new Set(tilesAroundTile(site.tile, 2));
    return structures.filter((structure) => local.has(structure.tile));
  };

  const siteWorkStatus = (site: PentagonExpeditionSiteReport | null | undefined): PentagonSiteWorkStatus | null =>
    site ? evaluatePentagonSiteWork(site, siteWorkStructures(site), craftedItems, completedPentagonSites) : null;

  const siteWorkMissingLabels = (status: PentagonSiteWorkStatus | null): string[] =>
    status ? status.missing.map((req) => req.label) : [];

  const currentPentagonSiteWork = (): PentagonSiteWorkStatus | null => siteWorkStatus(currentPentagonSite());
  const siteThreshold = (site: PentagonExpeditionSiteReport | null | undefined): PentagonSiteThresholdReport | null =>
    site ? pentagonSiteThreshold(site, completedPentagonSites) : null;
  const currentPentagonSiteThreshold = (): PentagonSiteThresholdReport | null => siteThreshold(currentPentagonSite());
  const currentPentagonSiteThresholdEffect = () => pentagonSiteThresholdEffect(currentPentagonSiteThreshold());

  const thresholdTerrainTiles = (site: PentagonExpeditionSiteReport, span: number): number[] => {
    const wanted = Math.max(1, Math.trunc(span));
    const occupied = new Set(structures.map((structure) => structure.tile));
    const degree = geo.degreeOf(site.tile);
    const startEdge = degree > 0 ? (site.landmark.index * 2 + 2) % degree : 0;
    const neighbors: number[] = [];
    for (let i = 0; i < degree; i++) neighbors.push(geo.neighbor(site.tile, (startEdge + i) % degree));
    const outer: number[] = [];
    for (const tile of neighbors) {
      const outerDegree = geo.degreeOf(tile);
      for (let i = 0; i < outerDegree; i++) {
        const next = geo.neighbor(tile, i);
        if (next === site.tile || neighbors.includes(next) || outer.includes(next)) continue;
        outer.push(next);
      }
    }
    const tiles: number[] = [];
    const add = (tile: number, allowOccupied = false): void => {
      if (tile < 0 || tiles.includes(tile)) return;
      if (!allowOccupied && occupied.has(tile)) return;
      tiles.push(tile);
    };
    for (const tile of neighbors) add(tile);
    for (const tile of outer) add(tile);
    add(site.tile);
    for (const tile of neighbors) add(tile, true);
    for (const tile of outer) add(tile, true);
    add(site.tile, true);
    return tiles.slice(0, wanted);
  };

  const carvePentagonThresholdTerrain = (site: PentagonExpeditionSiteReport | null | undefined) => {
    if (!site) {
      return { ok: false, changedCells: 0, tiles: [] as number[], label: '', detail: '', message: 'no site terrain threshold nearby' };
    }
    const threshold = siteThreshold(site);
    const spec = pentagonSiteThresholdTerrainSpec(threshold);
    if (!threshold?.open || !spec) {
      return { ok: false, changedCells: 0, tiles: [] as number[], label: threshold?.label ?? '', detail: '', message: 'complete the site work to open its terrain threshold' };
    }

    const tiles = thresholdTerrainTiles(site, spec.tileSpan);
    const changedTiles = new Set<number>();
    let changedCells = 0;
    for (const tile of tiles) {
      const top = columns.topLayerOf(tile);
      const end = Math.min(layers.L - 1, top + spec.carveDepthCells);
      for (let layer = top; layer < end; layer++) {
        if (columns.mine(tile, layer)) {
          changedCells++;
          changedTiles.add(tile);
        }
      }
    }

    if (changedCells > 0) {
      edits += changedCells;
      markSaveDirty();
      for (const tile of changedTiles) rebuildAround(tile);
    }

    lastThresholdTerrainAction = changedCells > 0
      ? `${spec.label}: opened ${changedCells} terrain cells across ${changedTiles.size} ${spec.role} tile${changedTiles.size === 1 ? '' : 's'}`
      : `${spec.label}: terrain already open`;
    return {
      ok: true,
      changedCells,
      changedTiles: [...changedTiles],
      tiles,
      role: spec.role,
      tileSpan: spec.tileSpan,
      carveDepthCells: spec.carveDepthCells,
      label: spec.label,
      detail: spec.detail,
      message: lastThresholdTerrainAction,
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

  const horizonChartCount = (): number => itemCount(counts, craftedItems, 'horizonChart');

  const horizonChartSignal = () => nextHorizonChartSignal(
    allPentagonLandmarks(pentagonTiles, discoveredPentagons),
    discoveredPentagons,
    geo.centers,
    geo.frameOf(player.tile),
    player.tile,
    [player.fwdX, player.fwdY, player.fwdZ],
    PLANET_RADIUS,
  );

  const visibleHorizonChartSignal = () => horizonChartCount() > 0 ? horizonChartSignal() : null;

  const visibleHearthBeaconSignal = () => hearthBeaconSignal(
    structures,
    geo,
    geo.centers,
    geo.frameOf(player.tile),
    player.tile,
    [player.fwdX, player.fwdY, player.fwdZ],
    PLANET_RADIUS,
  );

  const grantHorizonChart = (): boolean => {
    if (horizonChartCount() > 0) return false;
    craftedItems.horizonChart = 1;
    lastNavigationAction = 'horizon chart unlocked';
    return true;
  };

  const routeSlateOpen = (): boolean => routeFocusActive && hud.routeVisible();
  const currentPanelOwnership = (): PanelOwnershipSnapshot => panelOwnershipSnapshot({
    routeSlateOpen: routeSlateOpen(),
    craftingOpen,
    journalOpen,
    storageOpen: openChestId !== null,
  });
  const worldInputBlockedByPanel = (): boolean => currentPanelOwnership().worldInputBlocked;
  input.setWorldInputBlocked(worldInputBlockedByPanel);
  const panelOwnerClasses = ['panel-routeSlate', 'panel-crafting', 'panel-journal', 'panel-storage'];
  const syncPanelOwnershipBody = (): void => {
    const owner = currentPanelOwnership().activePanel;
    document.body.classList.toggle('panel-open', owner !== null);
    for (const className of panelOwnerClasses) document.body.classList.toggle(className, className === `panel-${owner}`);
  };

  const closeRouteSlate = (): void => {
    routeFocusActive = false;
    routeFocusDirty = false;
    hud.setRouteSlate(null);
  };

  const clampRouteFocus = (guides: readonly RouteGuide[] = currentSelectableRouteGuides()): RouteGuide[] => {
    const list = guides.slice();
    routeFocusIndex = Math.max(0, Math.min(Math.max(0, list.length - 1), routeFocusIndex));
    return list;
  };

  const routeSelectionState = () => {
    const candidates = clampRouteFocus();
    return {
      open: routeSlateOpen(),
      index: routeFocusIndex,
      touched: routeFocusDirty,
      selected: candidates[routeFocusIndex] ?? null,
      candidates,
    };
  };

  const refreshRouteSlate = (seconds = 10): void => {
    if (!routeFocusActive) routeFocusActive = true;
    clampRouteFocus();
    hud.setRouteSlate(currentRouteSlate(), seconds);
  };

  const selectRouteCandidate = (index: number, touched = true): boolean => {
    const candidates = clampRouteFocus();
    if (candidates.length === 0) return false;
    routeFocusIndex = Math.max(0, Math.min(candidates.length - 1, Math.trunc(Number.isFinite(index) ? index : 0)));
    routeFocusActive = true;
    routeFocusDirty = touched || routeFocusDirty;
    hud.setRouteSlate(currentRouteSlate(), 12);
    playAudio('uiConfirm');
    return true;
  };

  const selectedRouteGuideForPin = (forceSelected = false): RouteGuide | null => {
    if (!routeSlateOpen() || (!forceSelected && !routeFocusDirty)) return null;
    const candidates = clampRouteFocus();
    const guide = candidates[routeFocusIndex] ?? null;
    return guide && guide.kind !== 'planned' ? guide : null;
  };

  const useHorizonChart = (): boolean => {
    if (craftingOpen) {
      craftingOpen = false;
      refreshCraftingHud();
    }
    const chartAvailable = horizonChartCount() > 0;
    const signal = chartAvailable ? horizonChartSignal() : null;
    const beacon = visibleHearthBeaconSignal();
    routeFocusActive = true;
    routeFocusDirty = false;
    clampRouteFocus(currentSelectableRouteGuides(signal));
    const slate = currentRouteSlate(signal);
    const planned = currentRoutePlanSignal();
    const hasLocalPins = slate.pins.some((pin) => pin.id !== 'prep');
    if (!chartAvailable) {
      if (beacon || hasLocalPins) {
        triggerCharacterAction('discover', beacon?.active ? 'torch' : 'map', 0.72);
        hud.setRouteSlate(slate, 9);
        lastNavigationAction = `route slate: ${slate.summary}`;
        playAudio('routeSlate');
        hud.flash(beacon?.active
          ? beacon.message
          : planned
          ? `planned route: ${planned.message}`
          : `${slate.summary} · awaken a pentagon for the chart`, 4);
        return true;
      }
      routeFocusActive = false;
      playAudio('uiDeny');
      hud.flash('awaken a pentagon to unlock the horizon chart', 2.5);
      lastNavigationAction = 'horizon chart locked';
      return false;
    }
    triggerCharacterAction('discover', 'horizonChart', 0.9);
    hud.setRouteSlate(slate, 9);
    playAudio('routeSlate');
    if (!signal) {
      lastNavigationAction = `route slate: ${slate.summary}`;
      hud.flash(beacon ? `horizon chart complete · ${beacon.message}` : `horizon chart complete · ${slate.summary}`, 4);
      return true;
    }
    const plan = horizonExpeditionPlan(signal);
    const bearing = `${Math.round(signal.bearingDeg)} deg`;
    const homeNote = beacon?.active ? ` · home ${beacon.distanceLabel} ${beacon.turn}` : '';
    lastNavigationAction = `route slate: ${slate.summary} · ${bearing}${homeNote} · ${plan.prepLabel}`;
    hud.flash(`route slate: ${slate.summary}${homeNote} · ${plan.prepLabel}`, 4.5);
    return true;
  };

  const pinCurrentRoute = (selectedGuide: RouteGuide | null = null): boolean => {
    if (craftingOpen) {
      craftingOpen = false;
      refreshCraftingHud();
    }
    const seasonalGuides = currentSeasonRouteGuides();
    const unplannedGuides = currentUnplannedRouteGuides();
    const localNativeLead = unplannedGuides[0]?.kind === 'nativeHazard' || unplannedGuides[0]?.kind === 'nativeLife';
    const guides = selectedGuide && selectedGuide.kind !== 'planned'
      ? [selectedGuide]
      : !activeRoutePlan && localNativeLead
      ? [unplannedGuides[0]]
      : !activeRoutePlan && seasonalGuides.length > 0
      ? seasonalGuides
      : unplannedGuides;
    const guide = guides[0] ?? null;
    if (!guide) {
      playAudio('uiDeny');
      lastNavigationAction = 'route plan: no target';
      hud.flash('no route target to pin', 2.4);
      return false;
    }
    if (!activeRoutePlan) {
      activeRoutePlan = createRoutePlanFromGuides(guides, player.tile, timeState.day, timeState.minute);
    } else {
      const result = addRoutePlanLeg(activeRoutePlan, guide, player.tile, timeState.day, timeState.minute);
      if (!result.ok) {
        playAudio('uiDeny');
        lastNavigationAction = `route itinerary: ${result.reason}`;
        hud.flash(result.reason === 'duplicate'
          ? `${result.label} is already in the itinerary`
          : result.reason === 'full'
          ? `itinerary full · ${result.legCount} stops`
          : 'no route target to pin', 2.6);
        return false;
      }
      activeRoutePlan = result.plan;
    }
    if (!activeRoutePlan) {
      playAudio('uiDeny');
      lastNavigationAction = 'route plan: no target';
      hud.flash('no route target to pin', 2.4);
      return false;
    }
    const signal = currentRoutePlanSignal();
    const legCount = Math.max(1, Math.trunc(activeRoutePlan.legs?.length ?? 1));
    triggerCharacterAction('discover', 'horizonChart', 0.72);
    playAudio('routeSlate');
    markSaveDirty();
    routeFocusDirty = false;
    refreshRouteSlate(9);
    const seasonRoute = !selectedGuide && seasonalGuides.length > 0 && activeRoutePlan.legs?.some((leg) => leg.label.startsWith('Season '));
    lastNavigationAction = seasonRoute
      ? `season itinerary pinned: ${legCount} stops · ${activeRoutePlan.label} · ${signal?.distanceLabel ?? guide.detail}`
      : legCount > 1
      ? `route itinerary pinned: ${legCount} stops · ${activeRoutePlan.label} · ${signal?.distanceLabel ?? guide.detail}`
      : `route plan pinned: ${activeRoutePlan.label} · ${signal?.distanceLabel ?? guide.detail}`;
    hud.flash(seasonRoute
      ? `season itinerary: ${legCount} stops · first ${activeRoutePlan.label}${signal ? ` · ${signal.distanceLabel} ${signal.turn}` : ''}`
      : legCount > 1
      ? `itinerary: ${legCount} stops · first ${activeRoutePlan.label}${signal ? ` · ${signal.distanceLabel} ${signal.turn}` : ''}`
      : `planned path: ${activeRoutePlan.label}${signal ? ` · ${signal.distanceLabel} ${signal.turn}` : ''}`, 4);
    return true;
  };

  const clearRoutePlan = (): boolean => {
    if (!activeRoutePlan) {
      playAudio('uiDeny');
      lastNavigationAction = 'route plan: none';
      hud.flash('no planned path to clear', 2);
      return false;
    }
    const label = activeRoutePlan.label;
    activeRoutePlan = null;
    routeFocusDirty = false;
    triggerCharacterAction('discover', 'map', 0.52);
    playAudio('uiConfirm');
    markSaveDirty();
    refreshRouteSlate(6);
    lastNavigationAction = `route plan cleared: ${label}`;
    hud.flash(`cleared planned path: ${label}`, 2.8);
    return true;
  };

  const deferActiveRouteStop = (): boolean => {
    const result = deferActiveRoutePlanLeg(activeRoutePlan);
    if (!result.ok) {
      playAudio('uiDeny');
      lastNavigationAction = `route itinerary later: ${result.reason}`;
      hud.flash(result.reason === 'single'
        ? 'no later stop to swap in'
        : result.reason === 'complete'
        ? 'itinerary already complete'
        : result.reason === 'locked'
        ? 'season route stops stay in order'
        : 'no planned stop to move', 2.4);
      return false;
    }
    activeRoutePlan = result.plan;
    const signal = currentRoutePlanSignal();
    routeFocusDirty = false;
    triggerCharacterAction('discover', 'map', 0.52);
    playAudio('routeSlate');
    markSaveDirty();
    refreshRouteSlate(8);
    lastNavigationAction = `route itinerary later: ${result.label}`;
    hud.flash(`moved ${result.label} later${signal ? ` · next ${signal.label}` : ''}`, 3.2);
    return true;
  };

  const removeActiveRouteStop = (): boolean => {
    const result = removeActiveRoutePlanLeg(activeRoutePlan);
    if (!result.ok) {
      playAudio('uiDeny');
      lastNavigationAction = `route itinerary drop: ${result.reason}`;
      hud.flash(result.reason === 'complete'
        ? 'itinerary already complete'
        : result.reason === 'locked'
        ? 'season route stops stay in order'
        : 'no planned stop to drop', 2.4);
      return false;
    }
    activeRoutePlan = result.plan;
    const signal = currentRoutePlanSignal();
    routeFocusDirty = false;
    triggerCharacterAction('discover', 'map', 0.52);
    playAudio('uiConfirm');
    markSaveDirty();
    refreshRouteSlate(8);
    lastNavigationAction = `route itinerary dropped: ${result.label}`;
    hud.flash(signal
      ? `dropped ${result.label} · next ${signal.label}`
      : `dropped ${result.label} · itinerary empty`, 3.2);
    return true;
  };

  const openRouteSlateCommand = (): boolean => {
    if (journalOpen) closeJournal();
    if (openChestId !== null) closeStorage();
    return useHorizonChart();
  };

  const pinRouteCommand = (forceSelected = false): boolean => {
    if (journalOpen) closeJournal();
    if (openChestId !== null) closeStorage();
    return pinCurrentRoute(selectedRouteGuideForPin(forceSelected));
  };

  const clearRouteCommand = (): boolean => {
    if (journalOpen) closeJournal();
    if (openChestId !== null) closeStorage();
    if (craftingOpen) {
      craftingOpen = false;
      refreshCraftingHud();
    }
    return clearRoutePlan();
  };

  const deferRouteCommand = (): boolean => {
    if (journalOpen) closeJournal();
    if (openChestId !== null) closeStorage();
    if (craftingOpen) {
      craftingOpen = false;
      refreshCraftingHud();
    }
    return deferActiveRouteStop();
  };

  const dropRouteCommand = (): boolean => {
    if (journalOpen) closeJournal();
    if (openChestId !== null) closeStorage();
    if (craftingOpen) {
      craftingOpen = false;
      refreshCraftingHud();
    }
    return removeActiveRouteStop();
  };

  hud.onRoutePin = pinRouteCommand;
  hud.onRouteClear = clearRouteCommand;
  hud.onRouteLater = deferRouteCommand;
  hud.onRouteDrop = dropRouteCommand;
  hud.onRouteSelect = (index) => { selectRouteCandidate(index, true); };

  const useLandmark = (tile?: number): boolean => {
    const target = tile !== undefined ? Math.trunc(tile) : nearbyLandmarkTile();
    if (target === null || target === undefined) return false;
    const result = discoverPentagon(discoveredPentagons, target, pentagonTiles);
    if (!result.ok) return false;
    const awardedChart = !result.alreadyKnown && grantHorizonChart();
    let rewardText = '';
    if (!result.alreadyKnown && result.landmark?.insight) {
      for (const reward of result.landmark.insight.reward) addCraftedDebugItem(reward.item, reward.count);
      rewardText = pentagonInsightRewardText(result.landmark.insight);
    }
    const site = result.landmark ? pentagonSiteForTile(result.landmark.tile, 0) : null;
    const completion = site ? completePentagonSiteWork(completedPentagonSites, site, siteWorkStructures(site), craftedItems) : null;
    let siteRewardText = '';
    if (completion?.ok && !completion.alreadyComplete && completion.reward) {
      addCraftedDebugItem(completion.reward.item, completion.reward.count);
      siteRewardText = `site work complete: ${completion.message}`;
    }
    const terrain = completion?.ok && completion.status.completed ? carvePentagonThresholdTerrain(site) : null;
    const terrainText = terrain?.ok ? `terrain: ${terrain.message}` : '';
    const siteWork = completion?.status ?? siteWorkStatus(site);
    const threshold = siteThreshold(site);
    const siteMissing = siteWorkMissingLabels(siteWork);
    const siteText = siteWork
      ? siteWork.completed
        ? `${siteWork.site.siteLabel}: complete · ${siteWork.plan.summary}${threshold ? ` · ${threshold.label} open` : ''}`
        : siteWork.ready
        ? `${siteWork.site.siteLabel}: ready · read the landmark again${threshold ? ` · ${threshold.label} waits` : ''}`
        : `${siteWork.site.siteLabel}: needs ${siteMissing.slice(0, 4).join(', ') || siteWork.plan.summary}${threshold ? ` · ${threshold.label} sealed` : ''}`
      : '';
    const completedNow = !!completion?.ok && !completion.alreadyComplete;
    triggerCharacterAction('discover', completedNow && completion?.reward ? completion.reward.item as CharacterPropId : awardedChart ? 'horizonChart' : 'map', completedNow ? 1.05 : result.alreadyKnown ? 0.75 : 1.1);
    playAudio(completedNow ? 'craftConfirm' : result.alreadyKnown ? 'routeSlate' : 'landmarkAwaken');
    lastLandmarkAction = [
      result.message,
      !result.alreadyKnown && result.landmark?.insight ? `insight: ${result.landmark.insight.label}` : '',
      siteText,
      awardedChart ? 'horizon chart unlocked' : '',
      rewardText ? `gained ${rewardText}` : '',
      siteRewardText,
      terrainText,
    ].filter(Boolean).join(' · ');
    if (!result.alreadyKnown || completedNow) markSaveDirty();
    hud.flash(`${lastLandmarkAction}${awardedChart ? ' · press M' : ''}`, awardedChart ? 8 : result.alreadyKnown ? 5 : 7);
    refreshCraftingHud();
    if (!result.alreadyKnown || completedNow) hud.setRouteSlate(currentRouteSlate(), 8);
    if (journalOpen) hud.setJournal(currentHearthJournal(), true);
    refreshUseButton();
    return true;
  };

  const spawnAtPentagon = (index = 0) => {
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
    const standOff = 4.5;
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

  const tryDomainResource = (): boolean => {
    const site = nearbyDomainResource();
    if (!site) return false;
    if (player.mode === 'plane') {
      lastDomainResourceAction = 'domain resource:in plane';
      playAudio('uiDeny');
      hud.flash('land before gathering domain resources', 2.5);
      return true;
    }
    const result = harvestDomainResource(harvestedDomainResources, site);
    lastDomainResourceAction = result.message;
    if (!result.ok) {
      triggerCharacterAction('discover', 'map', 0.55);
      playAudio('uiConfirm');
      hud.flash(result.message, 2.8);
      return true;
    }
    addCraftedDebugItem(result.item!, result.count!);
    triggerCharacterAction('farm', result.item as CharacterPropId, 0.72);
    playAudio('gatherSoft');
    markSaveDirty();
    domainResourceRenderer.setSites(currentDomainResourceSites());
    hud.flash(`${result.message} · ${site.landmarkName}`, 3.5);
    refreshCraftingHud();
    hud.setRouteSlate(currentRouteSlate(), 5);
    return true;
  };

  const completeSeasonActionRouteStop = (kind: 'skyfall' | 'murmur', tile: number): { message: string; complete: boolean } | null => {
    const signal = routePlanSignal(
      activeRoutePlan,
      geo.centers,
      geo.frameOf(player.tile),
      player.tile,
      [player.fwdX, player.fwdY, player.fwdZ],
      PLANET_RADIUS,
    );
    if (!isSeasonActionRouteSignal(signal)) return null;
    if (signal.sourceKind !== kind || signal.targetTile !== Math.trunc(tile) || !signal.arrived || signal.complete) return null;
    const arrival = markRoutePlanLegReached(activeRoutePlan, timeState.day, timeState.minute);
    if (!arrival.changed) return null;
    activeRoutePlan = arrival.plan;
    const completeBonus = arrival.complete;
    if (completeBonus) {
      survivalState.trailFocus = Math.max(Math.trunc(survivalState.trailFocus ?? 0), 360);
      survivalState.stamina = Math.min(100, survivalState.stamina + 18);
      survivalState.exposure = Math.max(0, survivalState.exposure - 12);
      lastSurvivalAction = 'season chord focus: 360m';
    }
    const message = completeBonus ? `${arrival.message} · season chord focus 360m` : arrival.message;
    lastNavigationAction = `season itinerary action: ${message}`;
    markSaveDirty();
    return { message, complete: arrival.complete };
  };

  const trySkyfall = (): boolean => {
    const site = nearbySkyfall();
    if (!site) return false;
    if (player.mode === 'plane') {
      lastSkyfallAction = 'skyfall:in plane';
      playAudio('uiDeny');
      hud.flash('land before gathering skyfall fragments', 2.5);
      return true;
    }
    const result = harvestSkyfall(harvestedSkyfalls, site);
    lastSkyfallAction = result.message;
    if (!result.ok) {
      triggerCharacterAction('discover', 'map', 0.55);
      playAudio('uiConfirm');
      hud.flash(result.message, 2.8);
      return true;
    }
    addCraftedDebugItem(result.item!, result.count!);
    triggerCharacterAction('discover', result.item as CharacterPropId, 0.85);
    playAudio('skyfallGather');
    markSaveDirty();
    skyfallRenderer.setSites(currentSkyfallSites());
    const routeAdvance = completeSeasonActionRouteStop('skyfall', site.tile);
    const chain = currentSeasonChain();
    if (!routeAdvance && chain?.linked) lastNavigationAction = `season chain: ${chain.payoffLabel} · ${chain.progressLabel}`;
    hud.flash(`${result.message}${routeAdvance ? ` · ${routeAdvance.message}` : ` · ${site.minutesRemaining}m before the next fall${seasonChainFlash()}`}`, routeAdvance || chain?.linked ? 4.8 : 3.5);
    refreshCraftingHud();
    hud.setRouteSlate(currentRouteSlate(), 5);
    if (journalOpen) hud.setJournal(currentHearthJournal(), true);
    return true;
  };

  const tryMurmur = (): boolean => {
    const site = nearbyMurmur();
    if (!site) return false;
    if (player.mode === 'plane') {
      lastMurmurAction = 'murmur:in plane';
      playAudio('uiDeny');
      hud.flash('land before listening to world murmurs', 2.5);
      return true;
    }
    const result = observeMurmur(observedMurmurs, site);
    lastMurmurAction = result.message;
    if (!result.ok) {
      triggerCharacterAction('discover', 'map', 0.55);
      playAudio('uiConfirm');
      hud.flash(result.message, 2.8);
      return true;
    }
    triggerCharacterAction('discover', site.kind === 'caveBreath' ? 'echoLantern' : 'map', 0.85);
    playAudio(site.kind === 'caveBreath' || site.kind === 'tideBell' ? 'caveRead' : 'routeSlate');
    markSaveDirty();
    murmurRenderer.setSites(currentMurmurSites());
    const routeAdvance = completeSeasonActionRouteStop('murmur', site.tile);
    const chain = currentSeasonChain();
    if (!routeAdvance && chain?.linked) lastNavigationAction = `season chain: ${chain.payoffLabel} · ${chain.progressLabel}`;
    hud.flash(`${result.message}${routeAdvance ? ` · ${routeAdvance.message}` : seasonChainFlash()}`, routeAdvance || chain?.linked ? 4.8 : 4);
    hud.setRouteSlate(currentRouteSlate(), 5);
    if (journalOpen) hud.setJournal(currentHearthJournal(), true);
    return true;
  };

  const completeSeasonAfterglowRouteStop = (afterglow: StrangerSeasonAfterglow): string => {
    const signal = routePlanSignal(
      activeRoutePlan,
      geo.centers,
      geo.frameOf(player.tile),
      player.tile,
      [player.fwdX, player.fwdY, player.fwdZ],
      PLANET_RADIUS,
    );
    if (!signal || signal.sourceKind !== 'seasonAfterglow' || signal.targetTile !== afterglow.tile || signal.complete) return '';
    const arrival = markRoutePlanLegReached(activeRoutePlan, timeState.day, timeState.minute);
    if (!arrival.changed) return '';
    activeRoutePlan = arrival.plan;
    markSaveDirty();
    return ` · ${arrival.message}`;
  };

  const trySeasonAfterglow = (): boolean => {
    const afterglow = nearbySeasonAfterglow();
    if (!afterglow) return false;
    if (player.mode === 'plane') {
      lastSeasonAfterglowAction = 'season afterglow:in plane';
      playAudio('uiDeny');
      hud.flash('land before reading the season afterglow', 2.5);
      return true;
    }
    const result = readSeasonAfterglow(seasonAfterglowReadings, afterglow);
    lastSeasonAfterglowAction = result.message;
    if (!result.ok) {
      triggerCharacterAction('discover', 'map', 0.55);
      playAudio('uiConfirm');
      hud.flash(result.message, 2.8);
      refreshUseButton();
      return true;
    }
    survivalState.trailFocus = Math.max(Math.trunc(survivalState.trailFocus ?? 0), afterglow.focusMinutes);
    survivalState.stamina = Math.min(100, survivalState.stamina + afterglow.stamina);
    survivalState.exposure = Math.max(0, survivalState.exposure - afterglow.exposureRelief);
    lastSurvivalAction = `season afterglow focus: ${afterglow.focusMinutes}m · +${afterglow.stamina} stamina · -${afterglow.exposureRelief} exposure`;
    const routeStop = completeSeasonAfterglowRouteStop(afterglow);
    lastNavigationAction = `season afterglow: ${afterglow.label} · ${afterglow.routeHint}${routeStop}`;
    triggerCharacterAction('discover', 'echoLantern', 1.05);
    playAudio('landmarkAwaken');
    markSaveDirty();
    seasonAfterglowRenderer.setAfterglow(currentSeasonAfterglow());
    hud.flash(`${result.message} · +${afterglow.stamina} stamina · -${afterglow.exposureRelief} exposure${routeStop}`, 5);
    hud.setRouteSlate(currentRouteSlate(), 6);
    if (journalOpen) hud.setJournal(currentHearthJournal(), true);
    refreshUseButton();
    return true;
  };

  const tryWardNativeHazard = (site: NativeCreatureSite | null = nearbyNativeHazard()): boolean => {
    if (!site) return false;
    if (player.mode === 'plane') {
      lastNativeLifeAction = 'native life:in plane';
      playAudio('uiDeny');
      hud.flash('land before tending native life', 2.5);
      return true;
    }
    const readiness = nativeWardReadiness(site);
    const result = wardNativeCreature(wardedNativeCreatures, site, readiness.prepared);
    lastNativeLifeAction = result.message;
    if (!result.ok) {
      if (result.pressureApplied) {
        applyNativeHazardPressure(site, 'ward failed');
        nativeHazardCooldown = site.pressure?.interval ?? 3.2;
        return true;
      }
      triggerCharacterAction(nativeDefenseActionForProp(readiness.prop), readiness.prop, 0.55);
      playAudio('uiConfirm');
      hud.flash(result.message, 2.8);
      return true;
    }
    if (readiness.tool) applyToolUse(readiness.tool, `warded ${site.label}`);
    const drops = spawnNativeLifeDrops(result.site);
    triggerCharacterAction(nativeDefenseActionForProp(readiness.prop), readiness.prop, 0.95);
    playAudio('gatherSoft');
    markSaveDirty();
    nativeLifeRenderer.setSites(currentNativeCreatureSites());
    hud.flash(`${result.message} · ${readiness.label} · ${drops.length} pickup${drops.length === 1 ? '' : 's'}`, 3.4);
    refreshCraftingHud();
    refreshUseButton();
    if (journalOpen) hud.setJournal(currentHearthJournal(), true);
    return true;
  };

  const tryRangedNativeWard = (site: NativeCreatureSite | null = rangedNativeHazard()): boolean => {
    if (!site) return false;
    if (player.mode === 'plane') {
      lastNativeLifeAction = 'native life:in plane';
      playAudio('uiDeny');
      hud.flash('land before warding native life', 2.5);
      return true;
    }
    const bow = bestToolForRangedDefense(craftedItems, toolWear);
    const arrows = itemCount(counts, craftedItems, 'whistlingArrow');
    if (!bow.tool || arrows <= 0) {
      lastNativeLifeAction = 'ranged ward needs reed bow and whistling arrows';
      triggerCharacterAction(bow.tool ? nativeDefenseActionForProp(bow.tool) : 'interact', bow.tool ?? 'hands', 0.55);
      playAudio('uiDeny');
      hud.flash('craft a reed bow and whistling arrows to ward from range', 2.8);
      refreshUseButton();
      return true;
    }
    const result = wardNativeCreature(wardedNativeCreatures, site, true);
    if (!result.ok) {
      lastNativeLifeAction = result.message;
      triggerCharacterAction('shoot', 'reedBow', 0.55);
      playAudio('uiConfirm');
      hud.flash(result.message, 2.8);
      refreshUseButton();
      return true;
    }
    spendCraftedItem('whistlingArrow');
    applyToolUse(bow, `whistle-shot ${site.label}`);
    const drops = spawnNativeLifeDrops(result.site);
    const message = result.site.kind === 'screeSnapper'
      ? `${result.site.label} stunned by a whistling arrow and skitters under scree · ${result.site.reward.count} ${result.site.reward.label} dropped`
      : result.site.kind === 'stormBurr'
      ? `${result.site.label} pinned by a whistling arrow and tumbles out of the gust · ${result.site.reward.count} ${result.site.reward.label} dropped`
      : result.site.kind === 'tideLurker'
      ? `${result.site.label} startled by a whistling arrow and slips below the cave tide · ${result.site.reward.count} ${result.site.reward.label} dropped`
      : `${result.site.label} spooked by a whistling arrow · ${result.site.reward.count} ${result.site.reward.label} dropped`;
    lastNativeLifeAction = message;
    triggerCharacterAction('shoot', 'reedBow', 1.05);
    playAudio('gatherSoft');
    markSaveDirty();
    nativeLifeRenderer.setSites(currentNativeCreatureSites());
    hud.flash(`${message} · ${drops.length} pickup${drops.length === 1 ? '' : 's'}`, 3.6);
    refreshCraftingHud();
    refreshUseButton();
    if (journalOpen) hud.setJournal(currentHearthJournal(), true);
    return true;
  };

  const tryNativeCreature = (): boolean => {
    const site = nearbyNativeCreature();
    if (!site) return false;
    if (player.mode === 'plane') {
      lastNativeLifeAction = 'native life:in plane';
      playAudio('uiDeny');
      hud.flash('land before tending native life', 2.5);
      return true;
    }
    if (site.temperament !== 'harmless') return tryWardNativeHazard(site);
    const tendProp: CharacterPropId = site.kind === 'reedbackGrazer'
      ? 'compost'
      : site.kind === 'shellSkitter'
      ? site.reward.item
      : site.kind === 'caveBlinker'
      ? 'caveMushroom'
      : 'seeds';
    const result = tendNativeCreature(tendedNativeCreatures, site);
    lastNativeLifeAction = result.message;
    if (!result.ok) {
      triggerCharacterAction('interact', tendProp, 0.55);
      playAudio('uiConfirm');
      hud.flash(result.message, 2.8);
      return true;
    }
    const drops = spawnNativeLifeDrops(site);
    let focusMessage = '';
    if (site.kind === 'caveBlinker') {
      const focus = Math.max(0, Math.trunc(survivalState.trailFocus ?? 0));
      survivalState.trailFocus = Math.min(720, focus + 90);
      survivalState.exposure = Math.max(0, survivalState.exposure - 4);
      focusMessage = ' · cave focus 90m';
      lastSurvivalAction = 'cave blinker focus: 90m · -4 exposure';
      lastNativeLifeAction = `${result.message}${focusMessage}`;
    }
    triggerCharacterAction('interact', tendProp, 0.72);
    playAudio('gatherSoft');
    markSaveDirty();
    nativeLifeRenderer.setSites(currentNativeCreatureSites());
    hud.flash(`${result.message}${focusMessage} · ${drops.length} pickup${drops.length === 1 ? '' : 's'}`, 3.2);
    refreshCraftingHud();
    refreshUseButton();
    if (journalOpen) hud.setJournal(currentHearthJournal(), true);
    return true;
  };

  const tickNativeHazards = (dt: number): void => {
    nativeHazardCooldown = Math.max(0, nativeHazardCooldown - Math.max(0, dt));
    if (creativeActive || player.mode !== 'walk' || nativeHazardCooldown > 0) return;
    const site = nearbyNativeHazard();
    if (!site || site.warded) return;
    if (site.kind === 'stormBurr' && !isHazardWeather(currentWeather())) return;
    if (site.kind === 'tideLurker') return;
    nativeHazardCooldown = site.pressure?.interval ?? 3.2;
    applyNativeHazardPressure(site, site.kind === 'stormBurr' ? 'weather gust' : 'crowded');
  };

  const tryThresholdChamber = (): boolean => {
    const site = nearbyThresholdChamber();
    if (!site) return false;
    if (player.mode === 'plane') {
      lastThresholdChamberAction = 'threshold chamber:in plane';
      playAudio('uiDeny');
      hud.flash('land before reading threshold chambers', 2.5);
      return true;
    }
    const result = observeThresholdChamber(observedThresholdChambers, site);
    lastThresholdChamberAction = result.message;
    if (!result.ok) {
      triggerCharacterAction('discover', 'map', 0.55);
      playAudio('uiConfirm');
      hud.flash(result.message, 2.8);
      return true;
    }
    addCraftedDebugItem(result.item!, result.count!);
    triggerCharacterAction('discover', site.kind === 'bellThroat' || site.kind === 'lanternShaft' ? 'echoLantern' : result.item as CharacterPropId, 0.9);
    playAudio(site.role === 'chamber' || site.kind === 'bellThroat' ? 'caveRead' : 'routeSlate');
    markSaveDirty();
    hud.flash(`${result.message} · ${site.landmarkName}`, 4.5);
    refreshCraftingHud();
    hud.setRouteSlate(currentRouteSlate(), 6);
    if (journalOpen) hud.setJournal(currentHearthJournal(), true);
    refreshUseButton();
    return true;
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
    cellarProvisions: rootCellarProvisionCount(structures, geo),
  });

  const currentWeather = () => {
    const domain = currentPentagonDomain();
    return weatherAt(timeState, weatherState, player.tile, player.radius() - PLANET_RADIUS, player.submerged, domain ? {
      effect: domain.effect,
      intensity: domain.intensity,
      label: domain.domainLabel,
    } : null);
  };

  const currentWeatherProtection = () => weatherProtectionForInventory(craftedItems, currentWeather());
  const survivalSnapshot = () => ({
    ...survivalReport(survivalState, currentWeather()),
    weatherProtection: currentWeatherProtection(),
  });

  const currentFishSchool = () => fishSchoolAt({
    tile: player.tile,
    day: timeState.day,
    minute: timeState.minute,
    nearWater: nearFishingWater(),
    dock: nearDock(),
    bait: itemCount(counts, craftedItems, 'bait'),
    weatherKind: currentWeather().kind,
    caveKind: currentNaturalVoid()?.kind ?? null,
    domainEffect: currentPentagonDomain()?.effect ?? null,
    domainIntensity: currentPentagonDomain()?.intensity ?? 0,
    thresholdFishBoost: currentPentagonSiteThresholdEffect()?.fishBoost,
    thresholdLabel: currentPentagonSiteThresholdEffect()?.label,
  });

  const currentForage = () => forageAt({
    tile: player.tile,
    day: timeState.day,
    minute: timeState.minute,
    height: player.radius() - PLANET_RADIUS,
    nearWater: nearFishingWater(),
    weatherKind: currentWeather().kind,
    caveKind: currentNaturalVoid()?.kind ?? null,
    domainEffect: currentPentagonDomain()?.effect ?? null,
    domainIntensity: currentPentagonDomain()?.intensity ?? 0,
    thresholdForageBoost: currentPentagonSiteThresholdEffect()?.forageBoost,
    thresholdLabel: currentPentagonSiteThresholdEffect()?.label,
  });

  const weatherVaneForecast = () => {
    const shelter = homeScore(structures, geo).shelter;
    const homeTiles = new Set(shelter.centerTile !== null
      ? tilesAroundTile(shelter.centerTile, 2)
      : shelter.tiles);
    const vane = structures.find((s) =>
      s.item === 'weatherVane'
      && Math.max(0, Math.trunc(s.state?.forecastReads ?? 0)) > 0
      && (homeTiles.size === 0 || homeTiles.has(s.tile)));
    return {
      ready: vane !== undefined,
      label: vane?.state?.forecastLabel ?? (vane ? 'weather vane' : ''),
      kind: vane?.state?.forecastKind,
      reads: Math.max(0, Math.trunc(vane?.state?.forecastReads ?? 0)),
    };
  };

  const horizonExpeditionPlan = (signal: ReturnType<typeof horizonChartSignal> = visibleHorizonChartSignal()) => {
    const shelter = homeScore(structures, geo).shelter;
    const forecast = weatherVaneForecast();
    const chain = currentSeasonChain();
    const school = currentFishSchool();
    const traps = fishTrapDiagnostics();
    const nets = shoreNetDiagnostics();
    const ecology = routeEcologyForExpedition({
      centers: geo.centers,
      fromTile: player.tile,
      targetTile: signal?.target.tile ?? null,
      radius: PLANET_RADIUS,
      fishLabel: school.label,
      fishStrength: school.strength,
      traps: traps.map((trap) => ({ tile: trap.tile, ready: trap.ready })),
      nets: nets.map((net) => ({ tile: net.tile, ready: net.ready })),
    });
    return planExpedition({
      signal,
      items: craftedItems,
      survival: survivalState,
      weather: currentWeather(),
      home: {
        ...shelter,
        weatherVane: forecast.ready || currentPentagonSiteThresholdEffect()?.routePrep === 'weather',
        forecastLabel: forecast.label || (currentPentagonSiteThresholdEffect()?.routePrep === 'weather' ? currentPentagonSiteThresholdEffect()?.label : undefined),
        cellarProvisions: rootCellarProvisionCount(structures, geo),
      },
      ecology,
      planeCrafted,
      insights: pentagonInsights(),
      seasonChain: chain,
    });
  };

  const nearLitWarmth = (): boolean => {
    const tiles = new Set(nearbyTiles(1));
    return structures.some((s) => s.item === 'campfire' && s.state?.lit === true && tiles.has(s.tile));
  };

  const currentCavePressure = () => {
    const natural = currentNaturalVoid();
    return cavePressureAt({
      caveKind: natural?.kind ?? null,
      flooded: natural?.flooded,
      hasLantern: itemCount(counts, craftedItems, 'lantern') > 0,
      hasEchoLantern: itemCount(counts, craftedItems, 'echoLantern') > 0,
      nearWarmth: nearLitWarmth(),
      trailFocus: survivalState.trailFocus,
    });
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

  const cropEnvironmentFor = (plot: StructureSave): CropPlotEnvironment => {
    const localTiles = new Set(tilesAroundTile(plot.tile, 1));
    const localStructures = structures.filter((s) => localTiles.has(s.tile));
    const roofPieces = localStructures.filter((s) => s.item === 'roofBundle').length;
    const hasWindow = localStructures.some((s) => s.item === 'windowFrame');
    const localLight = localStructures.some((s) =>
      (s.item === 'lantern' || s.item === 'campfire') && s.state?.lit === true,
    );
    const localWarmth = localStructures.some((s) => s.item === 'campfire' && s.state?.lit === true);
    const shelter = homeScore(structures, geo).shelter;
    const insideHomeShelter = shelter.tiles.includes(plot.tile);
    const roofedByHome = insideHomeShelter && shelter.roofPieces >= shelter.roofNeed;
    const daylight = timeState.minute >= 6 * 60 && timeState.minute <= 19 * 60;
    const sheltered = insideHomeShelter || roofPieces > 0;
    const protectedPlot = (insideHomeShelter && shelter.protected) || (roofPieces > 0 && (hasWindow || localLight));
    const layer = Math.max(0, Math.min(layers.L - 1, Math.trunc(plot.layer)));
    const height = layers.topRadius(layer) - PLANET_RADIUS;
    const domain = pentagonDomainForTile(plot.tile, 2);
    const weather = weatherAt(timeState, weatherState, plot.tile, height, 0, domain ? {
      effect: domain.effect,
      intensity: domain.intensity,
      label: domain.domainLabel,
    } : null);
    const naturalWater = waterNearTile(plot.tile, 1);
    const cisternWater = localStructures.reduce((max, s) =>
      s.item === 'rainCistern' ? Math.max(max, Math.max(0, Math.trunc(s.state?.water ?? 0))) : max, 0);
    const watered = naturalWater || cisternWater > 0;
    const lit = localLight || (daylight && (!(roofPieces > 0 || roofedByHome) || hasWindow));
    const warm = localWarmth || (insideHomeShelter && shelter.hasWarmth);
    const cold = weather.kind === 'cold' || height > 42;
    const storm = weather.kind === 'storm';
    const tags: string[] = [naturalWater ? 'watered' : cisternWater > 0 ? 'cistern-watered' : 'dry'];
    if (protectedPlot) tags.push('protected');
    else if (sheltered) tags.push('sheltered');
    else tags.push('open');
    if (warm) tags.push('warm');
    if (!lit) tags.push('dark');
    if (cold) tags.push('cold');
    if (storm) tags.push('storm');
    return {
      watered,
      naturalWater,
      cisternWater,
      sheltered,
      protected: protectedPlot,
      lit,
      warm,
      cold,
      storm,
      highAltitude: height > 42,
      label: tags.slice(0, 5).join(' · '),
    };
  };

  const cropDiagnostics = () => structures
    .filter((s) => s.item === 'cropPlot')
    .map((s) => ({
      id: s.id,
      tile: s.tile,
      state: s.state ? { ...s.state } : undefined,
      environment: cropEnvironmentFor(s),
    }));

  const compostBinDiagnostics = () => structures
    .filter((s) => s.item === 'compostBin')
    .map((s) => ({
      id: s.id,
      tile: s.tile,
      state: s.state ? { ...s.state } : undefined,
    }));

  const rainCisternDiagnostics = () => structures
    .filter((s) => s.item === 'rainCistern')
    .map((s) => ({
      id: s.id,
      tile: s.tile,
      state: s.state ? { ...s.state } : undefined,
      context: rainCisternContextFor(s),
    }));

  const rootCellarDiagnostics = () => structures
    .filter((s) => s.item === 'rootCellar')
    .map((s) => ({
      id: s.id,
      tile: s.tile,
      state: s.state ? { ...s.state } : undefined,
      countedForHome: homeScore(structures, geo).shelter.tiles.includes(s.tile),
    }));

  const caveAnchorDiagnostics = () => structures
    .filter((s) => s.item === 'caveAnchor')
    .map((s) => ({
      id: s.id,
      tile: s.tile,
      state: s.state ? { ...s.state } : undefined,
      context: caveAnchorContextFor(s),
    }));

  const waystoneDiagnostics = () => structures
    .filter((s) => s.item === 'waystone')
    .map((s) => ({
      id: s.id,
      tile: s.tile,
      state: s.state ? { ...s.state } : undefined,
      context: waystoneContextFor(s),
    }));

  const weatherVaneDiagnostics = () => structures
    .filter((s) => s.item === 'weatherVane')
    .map((s) => ({
      id: s.id,
      tile: s.tile,
      state: s.state ? { ...s.state } : undefined,
      context: weatherVaneContextFor(s),
    }));

  const fishTrapDiagnostics = () => structures
    .filter((s) => s.item === 'fishTrap')
    .map((s) => {
      const context = fishTrapContextFor(s);
      const setDay = s.state?.trapSetDay;
      const setMinute = s.state?.trapSetMinute ?? 0;
      const elapsed = setDay === undefined
        ? 0
        : Math.max(0, timeState.day * 1440 + timeState.minute - (setDay * 1440 + setMinute));
      const checkAfter = s.state?.trapBaited === true ? 180 : 300;
      return {
        id: s.id,
        tile: s.tile,
        state: s.state ? { ...s.state } : undefined,
        elapsed,
        ready: setDay !== undefined && elapsed >= checkAfter,
        context,
      };
    });

  const shoreNetDiagnostics = () => structures
    .filter((s) => s.item === 'shoreNet')
    .map((s) => {
      const context = fishTrapContextFor(s);
      const setDay = s.state?.netSetDay;
      const setMinute = s.state?.netSetMinute ?? 0;
      const elapsed = setDay === undefined
        ? 0
        : Math.max(0, timeState.day * 1440 + timeState.minute - (setDay * 1440 + setMinute));
      const checkAfter = context.school.kind === 'storm' || context.school.kind === 'dock' || context.school.kind === 'cave' ? 90 : 150;
      return {
        id: s.id,
        tile: s.tile,
        state: s.state ? { ...s.state } : undefined,
        elapsed,
        ready: setDay !== undefined && elapsed >= checkAfter,
        context,
      };
    });

  const waterlineRouteResupplySources = (originTile: number, targetTile: number): WaterlineRouteResupplySource[] => {
    const origin = Math.max(0, Math.trunc(originTile));
    const target = Math.max(0, Math.trunc(targetTile));
    const adjacent = (tile: number) => routeAdjacentTile(geo.centers, origin, target, tile, PLANET_RADIUS);
    const traps = fishTrapDiagnostics()
      .filter((trap) => trap.ready && adjacent(trap.tile))
      .map((trap) => ({ id: trap.id, kind: 'fishTrap' as const }));
    const nets = shoreNetDiagnostics()
      .filter((net) => net.ready && adjacent(net.tile))
      .map((net) => ({ id: net.id, kind: 'shoreNet' as const }));
    return [...traps, ...nets];
  };

  const consumeRouteArrivalWaterlineResupply = (): string => {
    const status = routePlanItineraryStatus(activeRoutePlan);
    if (!status || status.complete || status.active.reached === true) return '';
    const active = status.active;
    if (active.sourceKind !== 'target') return '';
    const routeDistanceM = greatCircleDistanceMeters(geo.centers, active.originTile, active.targetTile, PLANET_RADIUS);
    if (routeDistanceM < 650) return '';
    const consumed = consumeWaterlineRouteResupply(
      structures,
      waterlineRouteResupplySources(active.originTile, active.targetTile),
    );
    if (consumed.consumed <= 0) return '';
    structureRenderer.setStructures(structures);
    const parts: string[] = [];
    if (consumed.traps > 0) parts.push(`${consumed.traps} trap${consumed.traps === 1 ? '' : 's'}`);
    if (consumed.nets > 0) parts.push(`${consumed.nets} net${consumed.nets === 1 ? '' : 's'}`);
    const message = `waterline resupply spent: ${parts.join(' + ')}`;
    lastFoodAction = `route arrival:${message}`;
    return message;
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

  const currentCaveResonance = () => {
    const natural = currentNaturalVoid();
    if (!natural || natural.kind === 'arch') return null;
    return caveResonanceSite(SEED, player.tile, natural.layer, natural.kind, observedCaveResonances);
  };

  const currentRouteCaveResonanceSignal = () => {
    if (itemCount(counts, craftedItems, 'echoLantern') <= 0) return null;
    const site = currentCaveResonance();
    return site
      ? {
        tile: site.tile,
        label: site.label,
        detail: site.detail,
        note: site.note,
        rewardLabel: site.reward.label,
        rewardCount: site.reward.count,
        observed: site.observed,
      }
      : null;
  };

  const caveResonanceDiagnostics = () => ({
    current: currentCaveResonance(),
    observed: observedCaveResonances.size,
    notebook: caveResonanceNotebook(SEED, observedCaveResonances),
  });

  const currentCaveMouths = (rings = 4) => caveMouthSignals(columns, nearbyTileEntries(rings), 10);
  const nearbyCaveMouth = (rings = 3) => nearestCaveMouthSignal(caveMouthSignals(columns, nearbyTileEntries(rings), 8));

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
    if (originTile === player.tile) {
      const mouth = nearbyCaveMouth(3);
      if (mouth) {
        return {
          tile: mouth.tile,
          distance: mouth.ring,
          layer: mouth.layer,
          kind: mouth.kind,
          label: mouth.label,
          depth: mouth.depth,
          flooded: mouth.flooded,
          spring: mouth.spring === true,
          clearance: mouth.clearance,
          mouth: true,
        };
      }
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

  const caveAnchorContextFor = (anchor: StructureSave): CaveAnchorContext | undefined => {
    const signal = nearbyCaveSignal(anchor.tile, anchor.layer);
    if (!signal) return undefined;
    const label = 'label' in signal ? signal.label : undefined;
    const clearance = 'clearance' in signal ? signal.clearance : undefined;
    const mouth = 'mouth' in signal ? signal.mouth : undefined;
    return {
      tile: signal.tile,
      kind: signal.kind,
      label: label ?? caveKindLabel(signal.kind),
      depth: signal.depth,
      flooded: signal.flooded,
      spring: signal.spring === true,
      clearance,
      distance: signal.distance,
      mouth,
    };
  };

  const springWaterContextFor = (structure: StructureSave) => {
    const signal = nearbyCaveSignal(structure.tile, structure.layer);
    if (!signal || signal.kind !== 'dryCave' || signal.spring !== true || signal.distance > 2) return null;
    return {
      spring: true,
      label: signal.label ?? 'spring seep',
      distance: signal.distance,
    };
  };

  const rainCisternContextFor = (cistern: StructureSave) => ({
    ...currentWeather(),
    spring: springWaterContextFor(cistern),
  });

  const caveMouthDiagnostics = () => ({
    mouths: currentCaveMouths(4),
    nearest: nearbyCaveMouth(4),
    renderer: caveMouthRenderer.stats(),
  });

  const waystoneContextFor = (stone: StructureSave): WaystoneContext => {
    const shelter = homeScore(structures, geo).shelter;
    const cave = nearbyCaveSignal(stone.tile, stone.layer);
    const height = layers.topRadius(Math.max(0, Math.min(layers.L - 1, stone.layer))) - PLANET_RADIUS;
    const nearWater = waterNearTile(stone.tile, 1);
    const domain = pentagonDomainForTile(stone.tile, 2);
    const weather = weatherAt(timeState, weatherState, stone.tile, height, 0, domain ? {
      effect: domain.effect,
      intensity: domain.intensity,
      label: domain.domainLabel,
    } : null);
    const forage = forageAt({
      tile: stone.tile,
      day: timeState.day,
      minute: timeState.minute,
      height,
      nearWater,
      weatherKind: weather.kind,
      caveKind: cave?.kind ?? null,
      domainEffect: domain?.effect ?? null,
      domainIntensity: domain?.intensity ?? 0,
    });
    return {
      home: shelter.tiles.includes(stone.tile) || structures.some((s) => s.item === 'bedroll' && s.state?.home === true && s.tile === stone.tile),
      cave: cave !== null && cave.distance <= 1,
      nearWater,
      forage: forage.kind !== 'none' && forage.strength > 0.18,
    };
  };

  const weatherReportForStructure = (structure: StructureSave) => {
    const height = layers.topRadius(Math.max(0, Math.min(layers.L - 1, structure.layer))) - PLANET_RADIUS;
    const domain = pentagonDomainForTile(structure.tile, 2);
    return weatherAt(timeState, weatherState, structure.tile, height, 0, domain ? {
      effect: domain.effect,
      intensity: domain.intensity,
      label: domain.domainLabel,
    } : null);
  };

  const fishTrapContextFor = (trap: StructureSave): FishTrapContext => {
    const domain = pentagonDomainForTile(trap.tile, 2);
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
        domainEffect: domain?.effect ?? null,
        domainIntensity: domain?.intensity ?? 0,
      }),
    };
  };

  const weatherVaneContextFor = (vane: StructureSave): WeatherVaneContext => {
    const weather = weatherReportForStructure(vane);
    return {
      kind: weather.kind,
      label: weather.label,
      intensity: weather.intensity,
    };
  };

  const weatherWatchFor = (vane: StructureSave) => {
    const home = homeScore(structures, geo);
    const homeTiles = new Set(home.shelter.centerTile !== null
      ? tilesAroundTile(home.shelter.centerTile, 2)
      : home.shelter.tiles);
    if (!homeTiles.has(vane.tile)) return null;
    return waitForWeatherWindow(
      survivalState,
      timeState,
      weatherState,
      { ...home.shelter, nearWarmth: nearLitWarmth() },
      () => weatherReportForStructure(vane),
    );
  };

  const waystoneRouteSignals = () => structures
    .filter((s) => s.item === 'waystone')
    .map((s) => {
      const mark = s.state?.waystone ?? 'survey';
      const distanceM = greatCircleDistanceMeters(geo.centers, player.tile, s.tile, PLANET_RADIUS);
      const bearingDeg = chartBearingDegrees(geo.centers, geo.frameOf(player.tile), player.tile, [player.fwdX, player.fwdY, player.fwdZ], s.tile);
      return {
        tile: s.tile,
        mark,
        label: waystoneMarkLabel(mark),
        distanceM,
        distanceLabel: formatChartDistance(distanceM),
        turn: chartTurnLabel(bearingDeg),
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 3);

  const caveAnchorRouteSignals = () => structures
    .filter((s) => s.item === 'caveAnchor' && s.state?.anchorKind)
    .map((s) => {
      const kind = s.state!.anchorKind!;
      const targetTile = Number.isFinite(s.state?.anchorTile) ? Math.max(0, Math.trunc(s.state!.anchorTile!)) : s.tile;
      const distanceM = greatCircleDistanceMeters(geo.centers, player.tile, targetTile, PLANET_RADIUS);
      const bearingDeg = chartBearingDegrees(geo.centers, geo.frameOf(player.tile), player.tile, [player.fwdX, player.fwdY, player.fwdZ], targetTile);
      const label = s.state?.anchorLabel || caveAnchorKindLabel(kind);
      return {
        tile: targetTile,
        kind,
        label: `anchored ${label}`,
        distanceM,
        distanceLabel: formatChartDistance(distanceM),
        turn: chartTurnLabel(bearingDeg),
        depth: Number.isFinite(s.state?.anchorDepth) ? Math.max(0, s.state!.anchorDepth!) : 0,
        flooded: s.state?.anchorFlooded === true,
        spring: s.state?.anchorSpring === true,
        clearance: s.state?.anchorClearance,
        uses: Math.max(0, Math.trunc(s.state?.anchorUses ?? 0)),
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 3);

  const currentRoutePlanSignal = () => routePlanSignal(
    activeRoutePlan,
    geo.centers,
    geo.frameOf(player.tile),
    player.tile,
    [player.fwdX, player.fwdY, player.fwdZ],
    PLANET_RADIUS,
  );

  const currentUnplannedRouteGuides = (signal: ReturnType<typeof horizonChartSignal> = visibleHorizonChartSignal()) => routeGuideCandidates({
    chart: signal,
    beacon: visibleHearthBeaconSignal(),
    cave: nearbyCaveSignal(),
    caveAnchors: caveAnchorRouteSignals(),
    waystones: waystoneRouteSignals(),
    skyfall: currentRouteSkyfallSignal(),
    murmur: currentRouteMurmurSignal(),
    seasonAfterglow: currentRouteSeasonAfterglowSignal(),
    seasonGuides: currentSeasonRouteGuides(),
    nativeLife: currentRouteNativeLifeSignals(),
  });

  const currentSelectableRouteGuides = (signal: ReturnType<typeof horizonChartSignal> = visibleHorizonChartSignal()): RouteGuide[] => {
    const guides: RouteGuide[] = [];
    const seen = new Set<string>();
    const pushGuide = (guide: RouteGuide | null | undefined) => {
      if (!guide || guide.kind === 'planned') return;
      const targetTile = Number.isFinite(guide.targetTile) ? Math.trunc(guide.targetTile) : -1;
      if (targetTile < 0) return;
      const key = `${guide.kind}:${targetTile}:${guide.label}`;
      if (seen.has(key)) return;
      seen.add(key);
      guides.push({ ...guide, targetTile });
    };
    const seasonalGuides = currentSeasonRouteGuides();
    const unplannedGuides = currentUnplannedRouteGuides(signal);
    if (!activeRoutePlan && seasonalGuides.length > 0) {
      seasonalGuides.forEach(pushGuide);
      unplannedGuides.forEach(pushGuide);
    } else {
      unplannedGuides.forEach(pushGuide);
    }
    return guides.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
  };

  const currentRouteGuide = (signal: ReturnType<typeof horizonChartSignal> = visibleHorizonChartSignal()) => routeGuide({
    chart: signal,
    beacon: visibleHearthBeaconSignal(),
    routePlan: currentRoutePlanSignal(),
    cave: nearbyCaveSignal(),
    caveAnchors: caveAnchorRouteSignals(),
    waystones: waystoneRouteSignals(),
    skyfall: currentRouteSkyfallSignal(),
    murmur: currentRouteMurmurSignal(),
    seasonAfterglow: currentRouteSeasonAfterglowSignal(),
    seasonGuides: currentSeasonRouteGuides(),
    nativeLife: currentRouteNativeLifeSignals(),
  });

  const currentRouteDomainSignal = () => {
    const domain = currentPentagonDomain();
    return domain ? {
      label: domain.label,
      domainLabel: domain.domainLabel,
      landmarkName: domain.landmark.name,
      discovered: domain.discovered,
      ring: domain.ring,
      intensity: domain.intensity,
      challenge: domain.challenge,
      boon: domain.boon,
      routeHint: domain.routeHint,
    } : null;
  };

  const currentRouteSiteSignal = () => {
    const site = currentPentagonSite();
    const work = siteWorkStatus(site);
    const threshold = siteThreshold(site);
    return site ? {
      label: site.label,
      siteLabel: site.siteLabel,
      landmarkName: site.landmark.name,
      discovered: site.discovered,
      completed: work?.completed,
      ready: work?.ready,
      ring: site.ring,
      intensity: site.intensity,
      problem: site.problem,
      opportunity: site.opportunity,
      buildHint: site.buildHint,
      routeHint: site.routeHint,
      wonder: site.wonder,
      workDetail: work?.detail,
      missing: siteWorkMissingLabels(work),
      rewardLabel: work?.reward.label,
      rewardCount: work?.reward.count,
      thresholdLabel: threshold?.label,
      thresholdDetail: threshold?.detail,
      thresholdOpen: threshold?.open,
      thresholdTraversal: threshold?.traversal,
    } : null;
  };

  const currentRouteSlate = (signal: ReturnType<typeof horizonChartSignal> = visibleHorizonChartSignal()) => {
    const fishTraps = fishTrapDiagnostics();
    const shoreNets = shoreNetDiagnostics();
    const slate = routeSlate({
      chart: signal,
      beacon: visibleHearthBeaconSignal(),
      routePlan: currentRoutePlanSignal(),
      plan: horizonExpeditionPlan(signal),
      cave: nearbyCaveSignal(),
      caveResonance: currentRouteCaveResonanceSignal(),
      caveAnchors: caveAnchorRouteSignals(),
      waystones: waystoneRouteSignals(),
      fish: {
        ...currentFishSchool(),
        trapCount: fishTraps.length,
        trapReady: fishTraps.filter((trap) => trap.ready).length,
        netCount: shoreNets.length,
        netReady: shoreNets.filter((net) => net.ready).length,
      },
      forage: currentForage(),
      weather: currentWeather(),
      insights: pentagonInsights(),
      domain: currentRouteDomainSignal(),
      site: currentRouteSiteSignal(),
      thresholdChamber: currentRouteThresholdChamberSignal(),
      resource: currentRouteResourceSignal(),
      skyfall: currentRouteSkyfallSignal(),
      murmur: currentRouteMurmurSignal(),
      season: currentRouteSeasonSignal(),
      seasonAfterglow: currentRouteSeasonAfterglowSignal(),
      nativeLife: currentRouteNativeLifeSignals(),
    });
    const candidates = clampRouteFocus(currentSelectableRouteGuides(signal));
    if (!routeFocusActive || candidates.length === 0) return slate;
    const pinForGuide = (guide: RouteGuide) =>
      slate.pins.find((pin) => pin.id === guide.kind && pin.label === guide.label)
      ?? slate.pins.find((pin) => pin.id === guide.kind);
    const pins: RouteSlateView['pins'] = candidates.slice(0, 5).map((guide, index) => {
      const sourcePin = pinForGuide(guide);
      return {
        id: guide.kind,
        label: guide.label,
        detail: sourcePin?.detail ?? guide.detail,
        ready: sourcePin?.ready ?? true,
        selected: routeFocusActive && index === routeFocusIndex,
        selectable: true,
      };
    });
    return { ...slate, pins };
  };

  const currentHearthJournal = () => {
    const home = homeScore(structures, geo);
    const survival = survivalSnapshot();
    const weather = currentWeather();
    const food = foodCounts();
    const crops = cropDiagnostics();
    const routeSignal = visibleHorizonChartSignal();
    const plan = horizonExpeditionPlan(routeSignal);
    const slate = currentRouteSlate(routeSignal);
    const guide = currentRouteGuide(routeSignal);
    const routePlan = currentRoutePlanSignal();
    const progress = progressionState();
    const insights = pentagonInsights();
    const site = currentPentagonSite();
    const siteWork = siteWorkStatus(site);
    const threshold = siteThreshold(site);
    const thresholdEffect = currentPentagonSiteThresholdEffect();
    const resources = domainResourceDiagnostics();
    const thresholdChambers = thresholdChamberDiagnostics();
    const thresholdChamber = currentRouteThresholdChamberSignal();
    const skyfall = skyfallDiagnostics();
    const skyfallRoute = currentRouteSkyfallSignal();
    const murmurs = murmurDiagnostics();
    const murmurRoute = currentRouteMurmurSignal();
    const season = currentRouteSeasonSignal();
    const afterglow = currentRouteSeasonAfterglowSignal();
    const cave = nearbyCaveSignal();
    const caveResonance = currentRouteCaveResonanceSignal();
    const fish = currentFishSchool();
    const fishTraps = fishTrapDiagnostics();
    const shoreNets = shoreNetDiagnostics();
    const forage = currentForage();
    const nativeLife = nativeLifeDiagnostics();
    const nativeSignals = currentRouteNativeLifeSignals();
    const nativeHazard = nativeSignals.find((site) => site.temperament !== 'harmless' && site.warded !== true);
    const nativeHelper = nativeSignals.find((site) => site.temperament === 'harmless' && site.tended !== true);
    const nativeDetail = (site: RouteSlateNativeLifeSignal | undefined): string | undefined => {
      if (!site) return undefined;
      const where = site.distanceLabel && site.turn ? `${site.distanceLabel} ${site.turn}` : 'nearby';
      const reward = `+${Math.max(0, Math.trunc(site.rewardCount))} ${site.rewardLabel}`;
      const firstHint = site.hint.split(/[.;]/)[0]?.trim() || site.hint;
      return site.temperament === 'harmless'
        ? `${where} · ${reward} · ${firstHint}`
        : `${where} · answer with ${site.weakness ?? firstHint} · ${reward}`;
    };
    const recentMurmurs = murmurNotebook(SEED, geo.count, observedMurmurs)
      .slice(-3)
      .map((site) => ({ label: site.label, detail: site.note, tone: 'wonder' as const }));
    const plantedCrops = crops.filter((crop) => crop.state?.crop).length;
    const readyCrops = crops.filter((crop) => Math.trunc(crop.state?.growth ?? 0) >= 3).length;
    const blockedCrops = crops.filter((crop) =>
      crop.state?.crop
      && Math.trunc(crop.state?.growth ?? 0) < 3
      && (!crop.environment.watered || !crop.environment.lit || crop.environment.cold || crop.environment.storm)).length;
    const caveLabel = cave ? cave.label ?? caveKindLabel(cave.kind) : undefined;
    const caveDetail = cave ? `${cave.distance === 0 ? 'here' : `${cave.distance} ring${cave.distance === 1 ? '' : 's'}`} · depth ${cave.depth.toFixed(1)} m${cave.flooded ? ' · flooded' : ''}${cave.spring ? ' · spring seep' : ''}` : undefined;
    const weatherNote = lastSurvivalAction.startsWith('weather watch:')
      ? lastSurvivalAction.replace('weather watch:', '').split(' · ').slice(0, 2).join(' · ')
      : undefined;
    const routeSelection = routeSelectionState();
    return buildHearthJournal({
      home: {
        label: home.label,
        functional: home.functional,
        protected: home.shelter.protected,
        missing: home.shelter.missing,
        storedItems: home.storedItems,
        cellarProvisions: home.cellarProvisions,
        structures: structures.length,
      },
      survival: {
        label: survival.label,
        status: survival.status,
        stamina: survival.stamina,
        exposure: survival.exposure,
        trailFocus: survival.trailFocus,
        collapseCount: Math.max(0, Math.trunc(survivalState.collapseCount ?? 0)),
        day: timeState.day,
        minute: timeState.minute,
        weatherLabel: weather.label,
        weatherNote,
      },
      food,
      crops: {
        plots: crops.length,
        planted: plantedCrops,
        ready: readyCrops,
        blocked: blockedCrops,
      },
      route: {
        chartKnown: horizonChartCount() > 0,
        slateSummary: slate.summary,
        primaryLabel: slate.primary?.label,
        primaryDetail: slate.primary?.detail,
        planReady: plan.ready,
        planPrepLabel: plan.prepLabel,
        planMissing: plan.missing,
        guideLabel: guide?.label,
        guideDetail: guide?.detail,
        selectedCandidateLabel: routeSelection.selected?.label,
        selectedCandidateDetail: routeSelection.selected?.detail,
        routePlanLabel: routePlan
          ? routePlan.legCount > 1
            ? routePlan.complete ? 'itinerary complete' : `itinerary stop ${routePlan.legIndex + 1}/${routePlan.legCount}: ${routePlan.label}`
            : routePlan.label
          : undefined,
        routePlanDetail: routePlan
          ? routePlan.complete
            ? `${routePlan.reachedCount}/${routePlan.legCount} stops reached · last ${routePlan.label}`
            : `${routePlan.legCount > 1 ? `stop ${routePlan.legIndex + 1}/${routePlan.legCount} · ` : ''}${routePlan.distanceLabel} ${routePlan.turn} · ${routePlan.detail}`
          : undefined,
        hearthBeacon: visibleHearthBeaconSignal()?.label,
        waystones: waystoneRouteSignals().length,
        caveAnchors: caveAnchorRouteSignals().length,
      },
      discoveries: {
        pentagonsKnown: progress.count,
        pentagonsTotal: progress.total,
        insightLabel: insights.prepLabel ?? insights.labels?.slice(0, 2).join(' + ') ?? 'no insights',
        domainLabel: currentPentagonDomain()?.domainLabel,
        siteLabel: site?.label,
        siteDetail: siteWork
          ? `${siteWork.detail}${threshold ? ` · ${threshold.label}: ${threshold.detail}` : ''}${thresholdEffect ? ` · ${thresholdEffect.detail}` : ''}`
          : site ? `${site.discovered ? site.opportunity : site.routeHint} · ${site.discovered ? site.buildHint : site.wonder}${threshold ? ` · ${threshold.label}: ${threshold.detail}` : ''}${thresholdEffect ? ` · ${thresholdEffect.detail}` : ''}` : undefined,
        siteDiscovered: site?.discovered,
        siteCompleted: siteWork?.completed,
        siteReady: siteWork?.ready,
        siteMissing: siteWorkMissingLabels(siteWork),
        resourcesDiscovered: resources.discovered,
        resourcesHarvested: resources.harvested,
        resourcesTotal: resources.total,
        thresholdChambersOpen: thresholdChambers.open,
        thresholdChambersObserved: thresholdChambers.observed,
        thresholdChambersTotal: thresholdChambers.total,
        thresholdChamberLabel: thresholdChamber?.label,
        thresholdChamberDetail: thresholdChamber ? `${thresholdChamber.thresholdLabel} · ${thresholdChamber.detail}` : undefined,
        caveResonancesObserved: observedCaveResonances.size,
        caveResonanceLabel: caveResonance?.label,
        caveResonanceDetail: caveResonance ? `${caveResonance.detail} · +${caveResonance.rewardCount} ${caveResonance.rewardLabel}` : undefined,
        caveResonanceObserved: caveResonance?.observed,
      },
      world: {
        skyfallActive: skyfall.active,
        skyfallHarvested: skyfall.harvested,
        skyfallCurrent: skyfall.current?.label,
        skyfallOmen: skyfall.current?.omen.label,
        skyfallRoute: skyfallRoute ? `${skyfallRoute.label} ${skyfallRoute.distanceLabel} ${skyfallRoute.turn}${skyfallRoute.omenLabel ? ` · ${skyfallRoute.omenLabel}` : ''}` : undefined,
        murmursActive: murmurs.active,
        murmursObserved: murmurs.observed,
        murmurRoute: murmurRoute ? `${murmurRoute.label} ${murmurRoute.distanceLabel} ${murmurRoute.turn}` : undefined,
        seasonLabel: season?.label,
        seasonDetail: season ? `${season.detail} · ${season.tradeoff}` : undefined,
        seasonChainLabel: season?.chain?.payoffLabel,
        seasonChainDetail: season?.chain ? `${season.chain.progressLabel} · ${season.chain.payoffDetail}` : undefined,
        seasonChainComplete: season?.chain?.linked,
        seasonAfterglowLabel: afterglow?.label,
        seasonAfterglowDetail: afterglow ? `${afterglow.distanceLabel} ${afterglow.turn} · ${afterglow.detail}` : undefined,
        seasonAfterglowNote: afterglow?.note,
        seasonAfterglowRead: afterglow?.read,
        seasonAfterglowFocusMinutes: afterglow?.focusMinutes,
        recentMurmurs,
        caveSignal: caveLabel,
        caveDetail,
        caveResonance: caveResonance?.label,
        caveResonanceDetail: caveResonance ? `${caveResonance.detail} · ${caveResonance.note}` : undefined,
        caveResonanceObserved: caveResonance?.observed,
        nativeLifeVisible: nativeLife.visible,
        nativeLifeTended: nativeLife.tended,
        nativeLifeWarded: nativeLife.warded,
        nativeHelperLabel: nativeHelper?.label,
        nativeHelperDetail: nativeDetail(nativeHelper),
        nativeHazardLabel: nativeHazard?.label,
        nativeHazardDetail: nativeDetail(nativeHazard),
        fishLabel: fish.label,
        fishStrength: fish.strength,
        fishTraps: fishTraps.length,
        fishTrapReady: fishTraps.filter((trap) => trap.ready).length,
        shoreNets: shoreNets.length,
        shoreNetReady: shoreNets.filter((net) => net.ready).length,
        forageLabel: forage.label,
        forageStrength: forage.strength,
      },
    });
  };

  const closeJournal = (): void => {
    journalOpen = false;
    hud.setJournal(null, false);
  };

  const toggleJournal = (): void => {
    journalOpen = !journalOpen;
    if (journalOpen) {
      closeStorage();
      craftingOpen = false;
      refreshCraftingHud();
      closeRouteSlate();
      hud.setJournal(currentHearthJournal(), true);
      playAudio('uiOpen');
      return;
    }
    hud.setJournal(null, false);
    playAudio('uiConfirm');
  };

  hud.onJournalToggle = toggleJournal;
  hud.onJournalClose = () => {
    closeJournal();
    playAudio('uiConfirm');
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
    if (journalOpen) closeJournal();
    if (openChestId !== null) closeStorage();
    craftingOpen = !craftingOpen;
    if (craftingOpen) {
      craftingFocusIndex = 0;
      craftingFocusAction = 'craft';
    }
    refreshCraftingHud();
    if (craftingOpen) closeRouteSlate();
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
    if (journalOpen) closeJournal();
    craftingOpen = false;
    refreshCraftingHud();
    closeRouteSlate();
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
    const routeInput = routeSlateOpen() && (gp.menuUp || gp.menuDown || gp.menuLeft || gp.menuRight || gp.confirm || gp.cancel || gp.chart || gp.pin || gp.clearPin);
    const hasPanelInput = gp.menuUp || gp.menuDown || gp.menuLeft || gp.menuRight || gp.confirm || gp.cancel || routeInput;
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

    if (routeSlateOpen()) {
      const candidates = clampRouteFocus();
      if (gp.cancel || gp.chart) {
        closeRouteSlate();
        playAudio('uiConfirm');
        return true;
      }
      if (gp.clearPin) {
        clearRouteCommand();
        return true;
      }
      if (gp.menuLeft && !gp.clearPin) {
        dropRouteCommand();
        return true;
      }
      if (gp.menuRight && !gp.pin) {
        deferRouteCommand();
        return true;
      }
      if (gp.menuUp || gp.menuDown) {
        if (candidates.length === 0) {
          playAudio('uiDeny');
          hud.flash('no route candidates to choose', 1.6);
          return true;
        }
        const delta = gp.menuDown ? 1 : -1;
        routeFocusIndex = (routeFocusIndex + delta + candidates.length) % candidates.length;
        routeFocusDirty = true;
        refreshRouteSlate(12);
        playAudio('uiConfirm');
        return true;
      }
      if (gp.confirm || gp.pin) {
        pinRouteCommand(true);
        return true;
      }
      return true;
    }

    return false;
  };

  const handleRouteKeyboardInput = (up: boolean, down: boolean, left: boolean, right: boolean, confirm: boolean, cancel: boolean): boolean => {
    if (!routeSlateOpen() || (!up && !down && !left && !right && !confirm && !cancel)) return false;
    const candidates = clampRouteFocus();
    if (cancel) {
      closeRouteSlate();
      playAudio('uiConfirm');
      return true;
    }
    if (left) {
      dropRouteCommand();
      return true;
    }
    if (right) {
      deferRouteCommand();
      return true;
    }
    if (up || down) {
      if (candidates.length === 0) {
        playAudio('uiDeny');
        hud.flash('no route candidates to choose', 1.6);
        return true;
      }
      const delta = down ? 1 : -1;
      routeFocusIndex = (routeFocusIndex + delta + candidates.length) % candidates.length;
      routeFocusDirty = true;
      refreshRouteSlate(12);
      playAudio('uiConfirm');
      return true;
    }
    if (confirm) {
      pinRouteCommand(true);
      return true;
    }
    return true;
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

  const triggerCollapseRecovery = (reason = 'exposure', force = false) => {
    if (!force && (creativeActive || !shouldCollapse(survivalState))) return null;
    const bedroll = homeBedrollStructure();
    const home = homeScore(structures, geo);
    const result = recoverFromCollapse(survivalState, timeState, weatherState, {
      ...home.shelter,
      hasHome: bedroll !== null,
    });
    relocatePlayerToTile(bedroll?.tile ?? spawnTile);
    closeStorage();
    if (journalOpen) closeJournal();
    craftingOpen = false;
    refreshCraftingHud();
    closeRouteSlate();
    lastSurvivalAction = `${reason}:${result.message}`;
    triggerCharacterAction('sleep', bedroll ? 'bedroll' : 'hands', 1.05);
    playAudio(bedroll ? 'hearthRest' : 'uiDeny');
    markSaveDirty();
    hud.flash(result.message, 5);
    return result;
  };

  const useEchoLantern = (): boolean => {
    if (itemCount(counts, craftedItems, 'echoLantern') <= 0) return false;
    const resonance = currentCaveResonance();
    if (resonance) {
      if (resonance.observed) {
        lastCaveAction = `echo lantern: ${resonance.label} already noted`;
        triggerCharacterAction('discover', 'echoLantern', 0.72);
        playAudio('caveRead');
        hud.flash(`${resonance.label} already in the Hearth Journal`, 2.8);
        if (journalOpen) hud.setJournal(currentHearthJournal(), true);
        return true;
      }
      const result = observeCaveResonance(observedCaveResonances, resonance);
      if (result.ok) {
        craftedItems[result.site.reward.item] = Math.max(0, Math.trunc(craftedItems[result.site.reward.item] ?? 0) + result.site.reward.count);
        lastCaveAction = `echo lantern: ${result.site.label} · ${result.site.note}`;
        lastNavigationAction = `cave resonance: ${result.site.label}`;
        triggerCharacterAction('discover', 'echoLantern', 0.95);
        playAudio('caveRead');
        markSaveDirty();
        hud.flash(`${result.site.label} · +${result.site.reward.count} ${result.site.reward.label}`, 4);
        refreshCraftingHud();
        hud.setRouteSlate(currentRouteSlate(), 6);
        if (journalOpen) hud.setJournal(currentHearthJournal(), true);
        refreshUseButton();
        return true;
      }
    }
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
      playAudio(audioEventForFoodAction('fish', false));
      hud.flash('land before fishing', 2);
      lastFoodAction = 'fish:in plane';
      return false;
    }
    if (!force && itemCount(counts, craftedItems, 'fishingRod') <= 0) {
      playAudio(audioEventForFoodAction('fish', false));
      hud.flash('no nearby prop · craft a fishing rod to cast from shore', 3);
      lastFoodAction = 'fish:no rod';
      return false;
    }
    if (!force && !nearFishingWater()) {
      playAudio(audioEventForFoodAction('fish', false));
      hud.flash('fishing needs water beside you', 2.5);
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
    const result = applyFishingCatch(craftedItems, school);
    lastFoodAction = `fish:${school.kind}:${result.message}`;
    if (!result.ok) {
      triggerCharacterAction('fish', 'fishingRod', 0.6);
      playAudio(audioEventForFoodAction('fish', false));
      hud.flash(result.message, 2.5);
      return false;
    }
    triggerCharacterAction('fish', 'fishingRod', 0.95);
    playAudio(audioEventForFoodAction('fish', true));
    markSaveDirty();
    refreshCraftingHud();
    const tideHazard = triggerNativeFishingSplash(school);
    hud.flash(tideHazard ? `${result.message} · tide lurker surge · ready light or blade` : `${result.message} · cook at a lit campfire`, tideHazard ? 4 : 3.2);
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

  const spawnAtSkyfall = () => {
    const site = currentSkyfall();
    if (!site) return null;
    player.spawnAt(site.tile);
    player.mode = 'walk';
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    refreshUseButton();
    return site;
  };

  const spawnAtMurmur = (index = 0) => {
    const active = currentMurmurSites().filter((site) => site.active && !site.observed);
    const site = active[Math.max(0, Math.min(active.length - 1, Math.trunc(index)))] ?? currentMurmurSites()[0];
    if (!site) return null;
    player.spawnAt(site.tile);
    player.mode = 'walk';
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    refreshUseButton();
    return site;
  };

  const spawnAtSeasonAfterglow = () => {
    const afterglow = currentSeasonAfterglow();
    if (!afterglow) return null;
    player.spawnAt(afterglow.tile);
    player.mode = 'walk';
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    streamer.refreshDesired(...player.up(), player.altitudeAGL());
    refreshUseButton();
    return seasonAfterglowDiagnostics();
  };

  const completeCurrentSeasonChord = () => {
    const season = currentStrangerSeason();
    if (!season?.skyfall) return null;
    harvestedSkyfalls.add(season.skyfall.id);
    for (const site of season.murmurs) observedMurmurs.add(site.id);
    skyfallRenderer.setSites(currentSkyfallSites());
    murmurRenderer.setSites(currentMurmurSites());
    seasonAfterglowRenderer.setAfterglow(currentSeasonAfterglow());
    lastNavigationAction = `debug completed season chord: ${currentSeasonAfterglow()?.label ?? season.label}`;
    markSaveDirty();
    refreshUseButton();
    hud.setRouteSlate(currentRouteSlate(), 6);
    if (journalOpen) hud.setJournal(currentHearthJournal(), true);
    return seasonAfterglowDiagnostics();
  };

  const tryDismantleStructure = (id?: number, source: BuildCommandSource = 'debug'): boolean => {
    const target = id !== undefined
      ? structures.find((s) => s.id === Math.trunc(id)) ?? null
      : nearestStructureOnTiles(structures, nearbyStructureTiles());
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
    if (id === undefined && tryThresholdChamber()) return true;
    const target = id !== undefined
      ? structures.find((s) => s.id === Math.trunc(id)) ?? null
      : nearestStructureOnTiles(structures, nearbyStructureTiles());
    if (!target) {
      if (id === undefined) {
        const landmark = nearbyLandmarkTile();
        if (landmark !== null && !discoveredPentagons.has(landmark) && useLandmark(landmark)) return true;
        if (tryDomainResource()) return true;
        if (trySkyfall()) return true;
        if (tryMurmur()) return true;
        if (trySeasonAfterglow()) return true;
        if (tryNativeCreature()) return true;
        if (tryRangedNativeWard()) return true;
        if (tryThresholdChamber()) return true;
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
    if (target.item === 'dockSegment' && itemCount(counts, craftedItems, 'fishingRod') > 0) {
      tryFish();
      lastStructureAction = `dockSegment:cast:${lastFoodAction}`;
      recordBuildCommand(source, 'use', 'structure', {
        ok: true,
        command: 'use',
        item: target.item,
        id: target.id,
        message: lastFoodAction || 'dock cast',
        action: lastStructureAction,
        mode: 'inspect',
      }, target);
      return true;
    }
    const command = useStructureInteractionCommand({
      structures,
      target,
      materialCounts: counts,
      craftedItems,
      topology: geo,
      cropEnvironment: target.item === 'cropPlot' ? cropEnvironmentFor(target) : undefined,
      waystoneContext: target.item === 'waystone' ? waystoneContextFor(target) : undefined,
      weatherVaneContext: target.item === 'weatherVane' ? weatherVaneContextFor(target) : undefined,
      rainCisternContext: target.item === 'rainCistern' ? rainCisternContextFor(target) : undefined,
      caveAnchorContext: target.item === 'caveAnchor' ? caveAnchorContextFor(target) : undefined,
      fishTrapContext: target.item === 'fishTrap' || target.item === 'shoreNet' ? fishTrapContextFor(target) : undefined,
    });
    const result = command.interaction!;
    let feedbackMessage = result.message;
    let hearthSupperPrepared = false;
    lastStructureAction = command.action;
    recordBuildCommand(source, 'use', 'structure', command, target);
    if (command.foodAction) lastFoodAction = command.foodAction;
    if (command.navigationAction) lastNavigationAction = command.navigationAction;
    if (command.caveAction) lastCaveAction = command.caveAction;
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
              lastFoodAction = `home supper:${supper.message}`;
              lastStructureAction = `${target.item}:home:${result.message}:${rest.message}:${supper.message}:cellar ${spend.remaining}`;
            }
          }
        }
      }
      if (result.mode === 'forecast') {
        const watch = weatherWatchFor(target);
        if (watch && (watch.ok || !watch.cleared)) {
          feedbackMessage = watch.message;
          lastSurvivalAction = `weather watch:${watch.message}`;
          lastStructureAction = `${target.item}:forecast:${result.message}:${watch.message}`;
          lastNavigationAction = lastStructureAction;
          if (watch.ok) {
            hud.setRouteSlate(currentRouteSlate(), 5);
            if (journalOpen) hud.setJournal(currentHearthJournal(), true);
          }
        }
      }
      const action: CharacterAction = result.mode === 'setTrap' || result.mode === 'checkTrap' || result.mode === 'collectTrap' || result.mode === 'setNet' || result.mode === 'checkNet' || result.mode === 'collectNet'
        ? 'fish'
        : result.mode === 'plant' || result.mode === 'plantReeds' || result.mode === 'tend' || result.mode === 'harvest' || result.mode === 'fertilize' || result.mode === 'irrigate' || result.mode === 'compost' || result.mode === 'collectWater'
        ? 'farm'
        : result.mode === 'cook' || result.mode === 'preserve' || result.mode === 'cache' || result.mode === 'withdrawProvision'
        ? 'cook'
        : hearthSupperPrepared
        ? 'cook'
        : result.mode === 'home'
        ? 'sleep'
        : result.mode === 'forecast' || result.mode === 'anchor'
        ? 'discover'
        : 'interact';
      const movedProp = result.moved
        ? Object.keys(result.moved).find((id) => Object.prototype.hasOwnProperty.call(ITEM_DEFS, id)) as CharacterPropId | undefined
        : undefined;
      triggerCharacterAction(action, movedProp ?? (hearthSupperPrepared ? 'trailRation' : propForStructureInteraction(target.item, result.mode)), action === 'sleep' ? 0.85 : hearthSupperPrepared ? 0.95 : result.mode === 'forecast' || result.mode === 'anchor' ? 0.72 : 0.55);
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
      treeChop: {
        active: trees.chopProgress.size,
        target: treePick ? { tile: treePick.tile, damage: trees.damageOf(treePick.tile) } : null,
      },
      craftedItems: { ...craftedItems },
      inventory: packLedger(),
      tools: { ...toolSummary(craftedItems, toolWear), wear: { ...toolWear }, lastAction: lastToolAction, reach: playerReach() },
      food: { ...foodCounts(), lastAction: lastFoodAction, nearWater: nearFishingWater(), nearDock: nearDock(), school: currentFishSchool(), forage: currentForage(), crops: cropDiagnostics(), fishTraps: fishTrapDiagnostics(), shoreNets: shoreNetDiagnostics() },
      audio: audio.state(),
      controls: { ux: uxManager.snapshot(), gamepad: gamepad.snapshot(), touch: touch.enabled, inputActive: input.active(), aimActive: input.active() || gamepad.active(), panels: currentPanelOwnership() },
      survival: { ...survivalSnapshot(), time: { ...timeState }, state: { ...survivalState }, pack: packBurden(), lastAction: lastSurvivalAction },
      caves: { current: currentNaturalVoid(), signal: nearbyCaveSignal(), resonance: caveResonanceDiagnostics(), mouths: caveMouthDiagnostics(), pressure: currentCavePressure(), lastAction: lastCaveAction, echoLantern: itemCount(counts, craftedItems, 'echoLantern') },
      navigation: { horizonChart: horizonChartCount(), signal: visibleHorizonChartSignal(), hearthBeacon: visibleHearthBeaconSignal(), routePlan: currentRoutePlanSignal(), savedRoutePlan: activeRoutePlan, waystones: waystoneRouteSignals(), caveAnchors: caveAnchorRouteSignals(), weatherVane: weatherVaneForecast(), domain: currentPentagonDomain(), site: currentRouteSiteSignal(), thresholdChamber: currentRouteThresholdChamberSignal(), resource: currentRouteResourceSignal(), skyfall: currentRouteSkyfallSignal(), murmur: currentRouteMurmurSignal(), season: currentRouteSeasonSignal(), seasonAfterglow: currentRouteSeasonAfterglowSignal(), seasonRoute: currentSeasonRouteGuides(), guide: currentRouteGuide(), plan: horizonExpeditionPlan(), slate: currentRouteSlate(), lastAction: lastNavigationAction },
      journal: { open: journalOpen, state: currentHearthJournal() },
      storage: { open: openChestId !== null, chestId: openChestId, state: currentChestStorage() },
      domainResources: domainResourceDiagnostics(),
      thresholdChambers: thresholdChamberDiagnostics(),
      skyfall: skyfallDiagnostics(),
      murmurs: murmurDiagnostics(),
      nativeLife: nativeLifeDiagnostics(),
      strangerSeasons: strangerSeasonDiagnostics(),
      seasonAfterglow: seasonAfterglowDiagnostics(),
      character: character.state(),
      characterIntent: characterVisualState(),
      characterRenderer: character.stats(),
      naturalVoid: currentNaturalVoid(),
      landmarks: { ...progressionState(), insights: pentagonInsights(), domain: currentPentagonDomain(), site: currentPentagonSite(), siteWork: currentPentagonSiteWork(), siteThreshold: currentPentagonSiteThreshold(), siteThresholdEffect: currentPentagonSiteThresholdEffect(), thresholdTerrain: lastThresholdTerrainAction, thresholdChambers: thresholdChamberDiagnostics(), siteCompletions: [...completedPentagonSites], siteCompletionsCount: completedPentagonSites.size, sites: pentagonExpeditionSites(pentagonTiles, discoveredPentagons), thresholds: pentagonSiteThresholds(pentagonTiles, discoveredPentagons, completedPentagonSites), resources: domainResourceDiagnostics(), skyfall: skyfallDiagnostics(), murmurs: murmurDiagnostics(), strangerSeasons: strangerSeasonDiagnostics(), seasonAfterglow: seasonAfterglowDiagnostics(), nearby: pentagonLandmark(nearbyLandmarkTile() ?? -1, pentagonTiles, discoveredPentagons), lastAction: lastLandmarkAction },
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
    injectGamepad: (frame: Partial<GamepadFrame>, frames = 2) => {
      gamepad.inject(frame, frames);
      return gamepad.snapshot();
    },
    unlockAudio: () => audio.unlock(),
    toggleMute: () => {
      const muted = audio.toggleMuted();
      hud.flash(muted ? 'sound muted' : 'sound on', 1.8);
      if (!muted && audio.state().unlocked) audio.startAmbience();
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
    resourceDrops: () => resourceDropDiagnostics(),
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
      const caveDrop = caveResourceAt(columns, target, layer, materialItem);
      const before = { stamina: survivalState.stamina, exposure: survivalState.exposure };
      const ok = columns.mine(target, layer);
      if (ok) {
        mining.clear(target, layer);
        const slot = yieldSlot(mat);
        if (slot >= 0) spawnMineDrops(target, materialItem, 1);
        if (caveDrop) {
          spawnMineDrops(target, caveDrop.item, caveDrop.amount);
          lastCaveAction = `mined loose ${caveDrop.label}`;
        }
        edits++;
        markSaveDirty();
        triggerNativeMiningNoise(target, materialItem);
        rebuildAround(target);
      }
      return {
        ok,
        tile: target,
        layer,
        materialItem,
        caveDrop,
        before,
        after: { stamina: survivalState.stamina, exposure: survivalState.exposure },
        nativeLife: nativeLifeDiagnostics(),
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
    debugSpawnWoodDrops: (tile?: number) => {
      const target = Number.isFinite(tile) ? Math.trunc(tile!) : player.tile;
      const drops = spawnTreeDrops(Math.max(0, Math.min(geo.count - 1, target)));
      markSaveDirty();
      return { drops, diagnostics: resourceDropDiagnostics() };
    },
    debugCollectDrops: (seconds = 1.2) => {
      tickResourceDrops(Math.max(0, Number.isFinite(seconds) ? seconds : 1.2));
      return { wood: counts[WOOD_SLOT], drops: resourceDropDiagnostics() };
    },
    spawnNearTree: (tile?: number) => {
      const target = Number.isFinite(tile) ? Math.trunc(tile!) : nearestTreeTileAround(player.tile, 8);
      if (target === null || target < 0 || target >= geo.count) return null;
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
      return { treeTile: target, standTile: stand, damage: trees.damageOf(target) };
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
    eat: () => tryEatPackedFood(),
    fish: (force = false) => tryFish(force),
    fishSchool: () => currentFishSchool(),
    forage: () => currentForage(),
    gatherForage: () => tryForage(),
    caves: () => ({ current: currentNaturalVoid(), signal: nearbyCaveSignal(), resonance: caveResonanceDiagnostics(), mouths: caveMouthDiagnostics(), pressure: currentCavePressure(), lastAction: lastCaveAction, glowCrystal: itemCount(counts, craftedItems, 'glowCrystal'), lantern: itemCount(counts, craftedItems, 'lantern'), echoLantern: itemCount(counts, craftedItems, 'echoLantern') }),
    caveMouths: () => caveMouthDiagnostics(),
    echoLantern: () => useEchoLantern(),
    horizonChart: () => useHorizonChart(),
    navigation: () => ({ horizonChart: horizonChartCount(), signal: visibleHorizonChartSignal(), hearthBeacon: visibleHearthBeaconSignal(), routePlan: currentRoutePlanSignal(), savedRoutePlan: activeRoutePlan, waystones: waystoneRouteSignals(), caveAnchors: caveAnchorRouteSignals(), weatherVane: weatherVaneForecast(), domain: currentPentagonDomain(), site: currentRouteSiteSignal(), thresholdChamber: currentRouteThresholdChamberSignal(), resource: currentRouteResourceSignal(), skyfall: currentRouteSkyfallSignal(), murmur: currentRouteMurmurSignal(), season: currentRouteSeasonSignal(), seasonAfterglow: currentRouteSeasonAfterglowSignal(), seasonRoute: currentSeasonRouteGuides(), strangerSeasons: strangerSeasonDiagnostics(), guide: currentRouteGuide(), routeSelection: routeSelectionState(), routeRenderer: routeRenderer.stats(), plan: horizonExpeditionPlan(), slate: currentRouteSlate(), lastAction: lastNavigationAction }),
    routePlan: () => ({ saved: activeRoutePlan, signal: currentRoutePlanSignal() }),
    selectRouteCandidate: (index = 0) => { selectRouteCandidate(index, true); return routeSelectionState(); },
    pinRoute: (selected = false) => pinRouteCommand(selected),
    clearRoutePlan: () => clearRoutePlan(),
    deferRouteStop: () => deferActiveRouteStop(),
    dropRouteStop: () => removeActiveRouteStop(),
    journal: () => ({ open: journalOpen, state: currentHearthJournal() }),
    toggleJournal: () => { toggleJournal(); return { open: journalOpen, state: currentHearthJournal() }; },
    storage: () => ({ open: openChestId !== null, chestId: openChestId, state: currentChestStorage() }),
    openChest: (id?: number) => {
      const target = id !== undefined
        ? structures.find((s) => s.id === Math.trunc(id) && s.item === 'chest') ?? null
        : nearestStructureOnTiles(structures.filter((s) => s.item === 'chest'), nearbyStructureTiles());
      return target ? openChestStorage(target.id) : false;
    },
    closeStorage: () => { closeStorage(); return { open: openChestId !== null, chestId: openChestId, state: currentChestStorage() }; },
    transferChest: (id: number, item: string, action: ChestTransferAction = 'depositAll') => transferChestStorage(id, item, action),
    domainResources: () => domainResourceDiagnostics(),
    gatherDomainResource: () => tryDomainResource(),
    thresholdChambers: () => thresholdChamberDiagnostics(),
    inspectThresholdChamber: () => {
      const before = thresholdChamberDiagnostics();
      const used = tryThresholdChamber();
      return {
        ok: used,
        before,
        after: thresholdChamberDiagnostics(),
        navigation: currentRouteThresholdChamberSignal(),
        slate: currentRouteSlate(),
        journal: currentHearthJournal(),
        crafted: { ...craftedItems },
        lastAction: lastThresholdChamberAction,
      };
    },
    skyfall: () => skyfallDiagnostics(),
    gatherSkyfall: () => trySkyfall(),
    murmurs: () => murmurDiagnostics(),
    observeMurmur: () => tryMurmur(),
    seasonAfterglow: () => seasonAfterglowDiagnostics(),
    completeCurrentSeasonChord,
    spawnAtSeasonAfterglow,
    readSeasonAfterglow: () => trySeasonAfterglow(),
    nativeLife: () => nativeLifeDiagnostics(),
    tendNativeLife: () => tryNativeCreature(),
    spawnAtNativeLife: (kindOrRings: NativeCreatureKind | number = 'mossPuff', maybeRings = 48) => {
      const kind: NativeCreatureKind = typeof kindOrRings === 'string' ? kindOrRings : 'mossPuff';
      const rings = typeof kindOrRings === 'number' ? kindOrRings : maybeRings;
      const sites = nativeCreatureSitesAround(SEED, geo, columns, terrain, player.tile, Math.max(1, Math.trunc(rings)), tendedNativeCreatures, wardedNativeCreatures, 32, kind);
      const standFor = (candidate: NativeCreatureSite): { stand: number; score: number } => {
        const siteHeight = columns.heightOf(candidate.tile);
        let stand = candidate.tile;
        let score = trees.hasTree(candidate.tile) ? 9999 : 0;
        const deg = geo.degreeOf(candidate.tile);
        for (let k = 0; k < deg; k++) {
          const nb = geo.neighbor(candidate.tile, k);
          if (trees.hasTree(nb)) continue;
          const h = columns.heightOf(nb);
          const s = Math.abs(h - siteHeight) + (h < 2.5 ? 20 : 0);
          if (s < score) {
            score = s;
            stand = nb;
          }
        }
        return { stand, score };
      };
      let site: NativeCreatureSite | null = null;
      let stand = -1;
      let bestScore = 9999;
      for (const candidate of sites) {
        const next = standFor(candidate);
        if (next.score < bestScore) {
          site = candidate;
          stand = next.stand;
          bestScore = next.score;
        }
      }
      if (!site) return null;
      if (stand < 0) stand = site.tile;
      player.spawnAt(stand);
      facePlayerTowardTile(site.tile);
      player.mode = 'walk';
      player.vx = 0; player.vy = 0; player.vz = 0;
      nativeHazardCooldown = site.temperament === 'harmless' ? Math.max(nativeHazardCooldown, 2.5) : 0;
      lastNativeLifeAction = `debug spawned ${site.label}`;
      streamer.refreshDesired(...player.up(), player.altitudeAGL());
      refreshUseButton();
      nativeLifeRenderer.setSites(currentNativeCreatureSites());
      return { site, standTile: stand };
    },
    spawnAtNativeHazard: (rings = 64) => (window as any).__world.spawnAtNativeLife('brambleback', rings),
    wardNativeHazard: () => tryWardNativeHazard(),
    wardRangedNativeHazard: () => tryRangedNativeWard(),
    strangerSeasons: () => strangerSeasonDiagnostics(),
    naturalFeature: (kind?: string, startTile?: number) => columns.naturalFeature(naturalFeatureKind(kind), startTile ?? player.tile),
    springFeature: (startTile?: number) => columns.naturalFeature('dryCave', startTile ?? player.tile, true) ?? columns.naturalFeature('dryCave', 0, true),
    spawnAtNaturalFeature,
    spawnAtSpring,
    spawnAtSkyfall,
    spawnAtMurmur,
    useLandmark: (tile?: number) => useLandmark(tile),
    siteWork: (tile?: number) => {
      const site = tile !== undefined ? pentagonSiteForTile(Math.trunc(tile), 0) : currentPentagonSite();
      return siteWorkStatus(site);
    },
    siteThreshold: (tile?: number) => {
      const site = tile !== undefined ? pentagonSiteForTile(Math.trunc(tile), 0) : currentPentagonSite();
      return siteThreshold(site);
    },
    siteThresholdEffect: () => currentPentagonSiteThresholdEffect(),
    thresholdTerrain: () => lastThresholdTerrainAction,
    openThresholdTerrain: (tile?: number) => {
      const site = tile !== undefined ? pentagonSiteForTile(Math.trunc(tile), 0) : currentPentagonSite();
      return carvePentagonThresholdTerrain(site);
    },
    completeSiteWork: (tile?: number) => {
      const site = tile !== undefined ? pentagonSiteForTile(Math.trunc(tile), 0) : currentPentagonSite();
      if (!site) return null;
      const result = completePentagonSiteWork(completedPentagonSites, site, siteWorkStructures(site), craftedItems);
      const terrain = result.ok && result.status.completed ? carvePentagonThresholdTerrain(site) : null;
      if (result.ok && !result.alreadyComplete && result.reward) {
        addCraftedDebugItem(result.reward.item, result.reward.count);
      }
      if (result.ok && (!result.alreadyComplete || (terrain?.changedCells ?? 0) > 0)) {
        lastLandmarkAction = [result.message, terrain?.ok ? `terrain: ${terrain.message}` : ''].filter(Boolean).join(' · ');
        markSaveDirty();
        refreshCraftingHud();
        hud.setRouteSlate(currentRouteSlate(), 8);
        if (journalOpen) hud.setJournal(currentHearthJournal(), true);
      }
      return { ...result, terrain };
    },
    spawnAtPentagon,
    landmarks: () => ({
      items: allPentagonLandmarks(pentagonTiles, discoveredPentagons),
      landscapes: pentagonLandscapeProfiles(pentagonTiles),
      sites: pentagonExpeditionSites(pentagonTiles, discoveredPentagons),
      siteCompletions: [...completedPentagonSites],
      siteCompletionsCount: completedPentagonSites.size,
      progress: progressionState(),
      insights: pentagonInsights(),
      domain: currentPentagonDomain(),
      site: currentPentagonSite(),
      siteWork: currentPentagonSiteWork(),
      siteThreshold: currentPentagonSiteThreshold(),
      siteThresholdEffect: currentPentagonSiteThresholdEffect(),
      thresholdTerrain: lastThresholdTerrainAction,
      thresholdChambers: thresholdChamberDiagnostics(),
      thresholds: pentagonSiteThresholds(pentagonTiles, discoveredPentagons, completedPentagonSites),
      resources: domainResourceDiagnostics(),
      skyfall: skyfallDiagnostics(),
      murmurs: murmurDiagnostics(),
      strangerSeasons: strangerSeasonDiagnostics(),
      nearby: pentagonLandmark(nearbyLandmarkTile() ?? -1, pentagonTiles, discoveredPentagons),
      renderer: landmarkRenderer.stats(),
      lastAction: lastLandmarkAction,
      chart: { horizonChart: horizonChartCount(), signal: visibleHorizonChartSignal(), hearthBeacon: visibleHearthBeaconSignal(), routePlan: currentRoutePlanSignal(), waystones: waystoneRouteSignals(), caveAnchors: caveAnchorRouteSignals(), weatherVane: weatherVaneForecast(), domain: currentPentagonDomain(), site: currentRouteSiteSignal(), thresholdChamber: currentRouteThresholdChamberSignal(), resource: currentRouteResourceSignal(), skyfall: currentRouteSkyfallSignal(), murmur: currentRouteMurmurSignal(), season: currentRouteSeasonSignal(), seasonAfterglow: currentRouteSeasonAfterglowSignal(), seasonRoute: currentSeasonRouteGuides(), guide: currentRouteGuide(), slate: currentRouteSlate(), lastAction: lastNavigationAction },
    }),
    craft: (recipeId: string) => craftSelected(recipeId),
    crafting: () => ({ open: craftingOpen, crafted: { ...craftedItems }, recipes: craftingRows(), ledger: packLedger() }),
    structures: () => ({ items: structures.map((s) => ({ ...s, state: s.state ? { ...s.state } : undefined, turn: structureYawTurn(s.yaw) })), placement: placementDiagnostics(), commands: buildCommandDiagnostics(), crops: cropDiagnostics(), compostBins: compostBinDiagnostics(), rainCisterns: rainCisternDiagnostics(), rootCellars: rootCellarDiagnostics(), caveAnchors: caveAnchorDiagnostics(), waystones: waystoneDiagnostics(), weatherVanes: weatherVaneDiagnostics(), fishTraps: fishTrapDiagnostics(), shoreNets: shoreNetDiagnostics(), storage: { open: openChestId !== null, chestId: openChestId, state: currentChestStorage() }, home: homeScore(structures, geo), renderer: structureRenderer.stats(), lastAction: lastStructureAction }),
    buildCommands: () => buildCommandDiagnostics(),
    selectStructure: (item: string) => selectStructureForPlacement(item),
    placeStructure: (item: string, tile?: number) => {
      if (!isPlaceableItemId(item)) return false;
      const target = tile ?? geo.neighbor(player.tile, 0);
      return placeStructureAt(item, target);
    },
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
        progression: { pentagons: [...discoveredPentagons], siteCompletions: [...completedPentagonSites], domainHarvests: [...harvestedDomainResources], skyfallHarvests: [...harvestedSkyfalls], murmurObservations: [...observedMurmurs], seasonAfterglowReadings: [...seasonAfterglowReadings], thresholdChamberObservations: [...observedThresholdChambers], caveResonanceObservations: [...observedCaveResonances], nativeCreatureTends: [...tendedNativeCreatures], nativeCreatureWards: [...wardedNativeCreatures], routePlan: activeRoutePlan, toolWear },
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
        resourceDrops = normalizeResourceDrops(save.drops, geo.count);
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
        completedPentagonSites.clear();
        for (const tile of normalizePentagonSiteCompletions(save.progression?.siteCompletions, pentagonTiles)) completedPentagonSites.add(tile);
        harvestedDomainResources.clear();
        for (const id of normalizeDomainHarvests(save.progression?.domainHarvests)) harvestedDomainResources.add(id);
        domainResourceRenderer.setSites(currentDomainResourceSites());
        harvestedSkyfalls.clear();
        for (const id of normalizeSkyfallHarvests(save.progression?.skyfallHarvests)) harvestedSkyfalls.add(id);
        skyfallRenderer.setSites(currentSkyfallSites());
        observedMurmurs.clear();
        for (const id of normalizeMurmurObservations(save.progression?.murmurObservations)) observedMurmurs.add(id);
        murmurRenderer.setSites(currentMurmurSites());
        seasonAfterglowReadings.clear();
        for (const id of normalizeSeasonAfterglowReadings(save.progression?.seasonAfterglowReadings)) seasonAfterglowReadings.add(id);
        observedThresholdChambers.clear();
        for (const id of normalizeThresholdChamberObservations(save.progression?.thresholdChamberObservations)) observedThresholdChambers.add(id);
        observedCaveResonances.clear();
        for (const id of normalizeCaveResonanceObservations(save.progression?.caveResonanceObservations)) observedCaveResonances.add(id);
        tendedNativeCreatures.clear();
        for (const id of normalizeNativeCreatureTends(save.progression?.nativeCreatureTends)) tendedNativeCreatures.add(id);
        wardedNativeCreatures.clear();
        for (const id of normalizeNativeCreatureWards(save.progression?.nativeCreatureWards)) wardedNativeCreatures.add(id);
        nativeLifeRenderer.setSites(currentNativeCreatureSites());
        activeRoutePlan = normalizeRoutePlan(save.progression?.routePlan, geo.count);
        toolWear = normalizeToolWear(save.progression?.toolWear);
        Object.assign(timeState, normalizeTimeState(save.time));
        Object.assign(weatherState, normalizeWeatherState(save.weather));
        Object.assign(survivalState, normalizeSurvivalState(save.survival));
        seasonAfterglowRenderer.setAfterglow(currentSeasonAfterglow());
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
        landmarks: { ...progressionState(), insights: pentagonInsights(), site: currentPentagonSite(), siteWork: currentPentagonSiteWork(), siteThreshold: currentPentagonSiteThreshold(), siteThresholdEffect: currentPentagonSiteThresholdEffect(), thresholdTerrain: lastThresholdTerrainAction, thresholdChambers: thresholdChamberDiagnostics(), siteCompletions: [...completedPentagonSites], siteCompletionsCount: completedPentagonSites.size, resources: domainResourceDiagnostics(), skyfall: skyfallDiagnostics(), murmurs: murmurDiagnostics(), strangerSeasons: strangerSeasonDiagnostics(), seasonAfterglow: seasonAfterglowDiagnostics() },
        navigation: { horizonChart: horizonChartCount(), signal: visibleHorizonChartSignal(), hearthBeacon: visibleHearthBeaconSignal(), routePlan: currentRoutePlanSignal(), savedRoutePlan: activeRoutePlan, waystones: waystoneRouteSignals(), caveAnchors: caveAnchorRouteSignals(), weatherVane: weatherVaneForecast(), domain: currentPentagonDomain(), site: currentRouteSiteSignal(), thresholdChamber: currentRouteThresholdChamberSignal(), resource: currentRouteResourceSignal(), skyfall: currentRouteSkyfallSignal(), murmur: currentRouteMurmurSignal(), season: currentRouteSeasonSignal(), seasonAfterglow: currentRouteSeasonAfterglowSignal(), seasonRoute: currentSeasonRouteGuides(), guide: currentRouteGuide(), plan: horizonExpeditionPlan(), slate: currentRouteSlate() },
        journal: { open: journalOpen, state: currentHearthJournal() },
        domainResources: domainResourceDiagnostics(),
        thresholdChambers: thresholdChamberDiagnostics(),
        skyfall: skyfallDiagnostics(),
        murmurs: murmurDiagnostics(),
        strangerSeasons: strangerSeasonDiagnostics(),
        seasonAfterglow: seasonAfterglowDiagnostics(),
        caveMouths: caveMouthDiagnostics(),
        caveResonances: caveResonanceDiagnostics(),
        audio: audio.state(),
        controls: { ux: uxManager.snapshot(), gamepad: gamepad.snapshot(), touch: touch.enabled, panels: currentPanelOwnership() },
        characterRenderer: character.stats(),
        mineProgress: mineProgressDiagnostics(),
        survival: { ...survivalSnapshot(), time: { ...timeState }, pack: packBurden() },
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
      treeChop: {
        active: trees.chopProgress.size,
        target: treePick ? { tile: treePick.tile, damage: trees.damageOf(treePick.tile) } : null,
      },
      crafted: { ...craftedItems },
      ledger: packLedger(),
      tools: { ...toolSummary(craftedItems, toolWear), wear: { ...toolWear }, lastAction: lastToolAction, reach: playerReach() },
      food: { ...foodCounts(), lastAction: lastFoodAction, nearWater: nearFishingWater(), nearDock: nearDock(), school: currentFishSchool(), forage: currentForage(), crops: cropDiagnostics(), fishTraps: fishTrapDiagnostics(), shoreNets: shoreNetDiagnostics() },
      survival: { ...survivalSnapshot(), time: { ...timeState }, pack: packBurden(), lastAction: lastSurvivalAction },
      audio: audio.state(),
      controls: { ux: uxManager.snapshot(), gamepad: gamepad.snapshot(), touch: touch.enabled, panels: currentPanelOwnership() },
      caves: { current: currentNaturalVoid(), signal: nearbyCaveSignal(), resonance: caveResonanceDiagnostics(), mouths: caveMouthDiagnostics(), pressure: currentCavePressure(), lastAction: lastCaveAction },
    },
    navigation: {
      horizonChart: horizonChartCount(),
      signal: visibleHorizonChartSignal(),
      hearthBeacon: visibleHearthBeaconSignal(),
      routePlan: currentRoutePlanSignal(),
      savedRoutePlan: activeRoutePlan,
      waystones: waystoneRouteSignals(),
      caveAnchors: caveAnchorRouteSignals(),
      weatherVane: weatherVaneForecast(),
      domain: currentPentagonDomain(),
      site: currentRouteSiteSignal(),
      thresholdChamber: currentRouteThresholdChamberSignal(),
      resource: currentRouteResourceSignal(),
      skyfall: currentRouteSkyfallSignal(),
      murmur: currentRouteMurmurSignal(),
      season: currentRouteSeasonSignal(),
      seasonAfterglow: currentRouteSeasonAfterglowSignal(),
      seasonRoute: currentSeasonRouteGuides(),
      guide: currentRouteGuide(),
      routeRenderer: routeRenderer.stats(),
      plan: horizonExpeditionPlan(),
      slate: currentRouteSlate(),
      lastAction: lastNavigationAction,
    },
    journal: { open: journalOpen, state: currentHearthJournal() },
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
      commands: buildCommandDiagnostics(),
      yawTurns: structures.map((s) => ({ id: s.id, item: s.item, tile: s.tile, turn: structureYawTurn(s.yaw), yaw: s.yaw })),
      crops: cropDiagnostics(),
      compostBins: compostBinDiagnostics(),
      rainCisterns: rainCisternDiagnostics(),
      rootCellars: rootCellarDiagnostics(),
      caveAnchors: caveAnchorDiagnostics(),
      waystones: waystoneDiagnostics(),
      weatherVanes: weatherVaneDiagnostics(),
      fishTraps: fishTrapDiagnostics(),
      shoreNets: shoreNetDiagnostics(),
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
      insights: pentagonInsights(),
      domain: currentPentagonDomain(),
      site: currentPentagonSite(),
      siteWork: currentPentagonSiteWork(),
      siteThreshold: currentPentagonSiteThreshold(),
      siteThresholdEffect: currentPentagonSiteThresholdEffect(),
      thresholdTerrain: lastThresholdTerrainAction,
      thresholdChambers: thresholdChamberDiagnostics(),
      siteCompletions: [...completedPentagonSites],
      siteCompletionsCount: completedPentagonSites.size,
      resources: domainResourceDiagnostics(),
      skyfall: skyfallDiagnostics(),
      murmurs: murmurDiagnostics(),
      strangerSeasons: strangerSeasonDiagnostics(),
      seasonAfterglow: seasonAfterglowDiagnostics(),
      nearby: pentagonLandmark(nearbyLandmarkTile() ?? -1, pentagonTiles, discoveredPentagons),
      lastAction: lastLandmarkAction,
      chart: { horizonChart: horizonChartCount(), signal: visibleHorizonChartSignal(), hearthBeacon: visibleHearthBeaconSignal(), routePlan: currentRoutePlanSignal(), waystones: waystoneRouteSignals(), caveAnchors: caveAnchorRouteSignals(), weatherVane: weatherVaneForecast(), domain: currentPentagonDomain(), site: currentRouteSiteSignal(), thresholdChamber: currentRouteThresholdChamberSignal(), resource: currentRouteResourceSignal(), skyfall: currentRouteSkyfallSignal(), murmur: currentRouteMurmurSignal(), season: currentRouteSeasonSignal(), seasonAfterglow: currentRouteSeasonAfterglowSignal(), seasonRoute: currentSeasonRouteGuides(), guide: currentRouteGuide(), plan: horizonExpeditionPlan(), slate: currentRouteSlate(), lastAction: lastNavigationAction },
    },
    murmurs: murmurDiagnostics(),
    nativeLife: nativeLifeDiagnostics(),
    strangerSeasons: strangerSeasonDiagnostics(),
    seasonAfterglow: seasonAfterglowDiagnostics(),
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
    const fDown = input.down('KeyF'), gDown = input.down('KeyG'), oDown = input.down('KeyO'), eDown = input.down('KeyE'), bDown = input.down('KeyB'), rDown = input.down('KeyR'), qDown = input.down('KeyQ'), mDown = input.down('KeyM'), pDown = input.down('KeyP'), nDown = input.down('KeyN'), jDown = input.down('KeyJ'), zDown = input.down('KeyZ'), xDown = input.down('KeyX'), escDown = input.down('Escape');
    const f3Down = input.down('F3'), hDown = input.down('KeyH');
    const fPressed = input.pressed('KeyF') || (fDown && !fWas);
    const gPressed = input.pressed('KeyG') || (gDown && !gWas);
    const oPressed = input.pressed('KeyO') || (oDown && !oWas);
    const ePressed = input.pressed('KeyE') || (eDown && !eWas);
    const bPressed = input.pressed('KeyB') || (bDown && !bWas);
    const rPressed = input.pressed('KeyR') || (rDown && !rWas);
    const qPressed = input.pressed('KeyQ') || (qDown && !qWas);
    const mPressed = input.pressed('KeyM') || (mDown && !mWas);
    const pPressed = input.pressed('KeyP') || (pDown && !pWas);
    const nPressed = input.pressed('KeyN') || (nDown && !nWas);
    const jPressed = input.pressed('KeyJ') || (jDown && !jWas);
    const zPressed = input.pressed('KeyZ') || (zDown && !zWas);
    const xPressed = input.pressed('KeyX') || (xDown && !xWas);
    const escPressed = input.pressed('Escape') || (escDown && !escWas);
    const f3Pressed = input.pressed('F3') || (f3Down && !f3Was);
    const hPressed = input.pressed('KeyH') || (hDown && !hWas);
    const routeKeyboardConsumed = handleRouteKeyboardInput(
      input.pressed('ArrowUp'),
      input.pressed('ArrowDown'),
      input.pressed('ArrowLeft'),
      input.pressed('ArrowRight'),
      input.pressed('Enter'),
      escPressed,
    );
    if (fPressed && !worldBlocked() && !autopilot.active) {
      player.toggleFly();
      if (creativeActive) hud.flash(player.mode === 'fly' ? 'creative free-flight' : 'walk mode', 2);
    }
    if (gPressed && !worldBlocked()) { autopilot.toggle(player); hud.flash(autopilot.active ? 'autopilot lap…' : 'autopilot off', 3); }
    if (oPressed && !worldBlocked()) { orbitDemo.start(); hud.flash('orbit demo…', 3); }
    if ((ePressed || (tf.plane && !worldBlocked()) || (gp.plane && !worldBlocked())) && !worldBlocked() && !autopilot.active) {
      if (creativeActive && ((tf.plane && !worldBlocked()) || (gp.plane && !worldBlocked())) && !ePressed) {
        player.toggleFly();
        hud.flash(player.mode === 'fly' ? 'creative free-flight' : 'creative walk mode', 2);
      } else {
        handlePlaneKey();
      }
    }
    let gamepadUseConsumed = false;
    if (!routeKeyboardConsumed && escPressed && openChestId !== null) {
      closeStorage();
      playAudio('uiConfirm');
    } else if (!routeKeyboardConsumed && escPressed && journalOpen) {
      closeJournal();
      playAudio('uiConfirm');
    } else if (!routeKeyboardConsumed && escPressed && craftingOpen) {
      craftingOpen = false;
      refreshCraftingHud();
      playAudio('uiConfirm');
    }
    if (gp.use && !gpPanelConsumed && openChestId !== null) {
      closeStorage();
      playAudio('uiConfirm');
      gamepadUseConsumed = true;
    } else if (gp.use && !gpPanelConsumed && journalOpen) {
      closeJournal();
      playAudio('uiConfirm');
      gamepadUseConsumed = true;
    } else if (gp.use && !gpPanelConsumed && craftingOpen) {
      craftingOpen = false;
      refreshCraftingHud();
      playAudio('uiConfirm');
      gamepadUseConsumed = true;
    }
    if ((jPressed || (gp.journal && !gpPanelConsumed)) && !autopilot.active) toggleJournal();
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
    if ((mPressed || tf.chart || (gp.chart && !worldBlocked())) && !autopilot.active) {
      openRouteSlateCommand();
    }
    const gamepadBuildRotate = selectedStructureItem !== null && !routeSlateOpen() && !worldBlocked() && (gp.pin || gp.clearPin);
    if ((zPressed || xPressed || gamepadBuildRotate) && !worldBlocked() && !autopilot.active) {
      rotateBuildFacing((zPressed || gp.clearPin) && !xPressed ? -1 : 1, undefined, gamepadBuildRotate ? 'gamepad' : 'keyboard');
    }
    if ((pPressed || tf.pin || tf.clearPin || ((gp.pin || gp.clearPin) && !worldBlocked() && !gamepadBuildRotate)) && (!worldBlocked() || routeSlateOpen()) && !autopilot.active) {
      if (input.down('ShiftLeft') || tf.clearPin || (gp.clearPin && !worldBlocked() && !gamepadBuildRotate)) clearRouteCommand();
      else pinRouteCommand();
    }
    if (nPressed || (gp.mute && !gpPanelConsumed)) {
      const muted = audio.toggleMuted();
      hud.flash(muted ? 'sound muted' : 'sound on', 1.8);
      if (!muted && audio.state().unlocked) audio.startAmbience();
    }
    if (f3Pressed || (gp.diag && !gpPanelConsumed)) showDiag = !showDiag;
    if (hPressed || (gp.help && !gpPanelConsumed)) hud.toggleHelp();
    fWas = fDown; gWas = gDown; oWas = oDown; eWas = eDown; bWas = bDown; rWas = rDown; qWas = qDown; mWas = mDown; pWas = pDown; nWas = nDown; jWas = jDown; zWas = zDown; xWas = xDown; escWas = escDown; f3Was = f3Down; hWas = hDown;
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
        if (selectedStructureItem) {
          selectedStructureItem = null;
          refreshCraftingHud();
        }
      }
    }
    if (!worldBlocked() && gp.slotDelta !== 0) {
      hotbarSel = (hotbarSel + gp.slotDelta + SLOTS.length * 4) % SLOTS.length;
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
      const thresholdEffect = currentPentagonSiteThresholdEffect();
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
        cavePressure: currentCavePressure(),
        thresholdEffect: thresholdEffect ? { label: thresholdEffect.label, ...thresholdEffect.survival } : null,
      });
      tickNativeHazards(dt);
      if (shouldCollapse(survivalState)) {
        triggerCollapseRecovery('exposure');
      }
      if (sprintIntent && !sprintAllowed && player.mode === 'walk') {
        const reason = burden.sprintBlocked ? `${burden.label}: stash materials or build a chest` : 'too winded to sprint';
        if (lastSurvivalAction !== reason) lastSurvivalAction = reason;
      }
      if (player.planeStowed) hud.flash(player.submerged > 0.2 ? 'splashdown' : 'touched down', 2);
    }

    const routeArrivalSignal = currentRoutePlanSignal();
    if (routeArrivalSignal?.arrived && !routeArrivalSignal.complete && !isSeasonActionRouteSignal(routeArrivalSignal)) {
      const waterlineResupply = consumeRouteArrivalWaterlineResupply();
      const arrival = markRoutePlanLegReached(activeRoutePlan, timeState.day, timeState.minute);
      if (arrival.changed) {
        activeRoutePlan = arrival.plan;
        const arrivalMessage = `${arrival.message}${waterlineResupply ? ` · ${waterlineResupply}` : ''}`;
        lastNavigationAction = `route itinerary arrival: ${arrivalMessage}`;
        triggerCharacterAction('discover', arrival.complete ? 'horizonChart' : 'map', arrival.complete ? 0.8 : 0.58);
        playAudio(arrival.complete ? 'uiConfirm' : 'routeSlate');
        markSaveDirty();
        hud.flash(arrivalMessage, waterlineResupply ? 4.8 : arrival.complete ? 4.2 : 3.4);
        hud.setRouteSlate(currentRouteSlate(), arrival.complete ? 7 : 5);
        if (journalOpen) hud.setJournal(currentHearthJournal(), true);
      }
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
    resourceDropRenderer.update(resourceDrops, geo, layers, columns, camWorld, now / 1000);
    landmarkRenderer.update(pentagonTiles, discoveredPentagons, geo, layers, columns, camWorld, now / 1000, completedPentagonSites);
    const domainSites = currentDomainResourceSites();
    domainResourceRenderer.setSites(domainSites);
    domainResourceRenderer.update(domainSites, geo, layers, columns, camWorld, now / 1000);
    const skyfallSitesNow = currentSkyfallSites();
    skyfallRenderer.setSites(skyfallSitesNow);
    skyfallRenderer.update(skyfallSitesNow, geo, layers, columns, camWorld, now / 1000);
    const murmurSitesNow = currentMurmurSites();
    murmurRenderer.setSites(murmurSitesNow);
    murmurRenderer.update(murmurSitesNow, geo, layers, columns, camWorld, now / 1000);
    const afterglowNow = currentSeasonAfterglow();
    seasonAfterglowRenderer.setAfterglow(afterglowNow);
    seasonAfterglowRenderer.update(afterglowNow, geo, layers, columns, camWorld, now / 1000);
    const nativeSitesNow = currentNativeCreatureSites();
    nativeLifeRenderer.setSites(nativeSitesNow);
    nativeLifeRenderer.update(nativeSitesNow, geo, layers, columns, camWorld, now / 1000);
    const caveMouths = currentCaveMouths();
    caveMouthRenderer.setMouths(caveMouths);
    caveMouthRenderer.update(caveMouths, geo, layers, columns, camWorld, now / 1000);
    routeRenderer.update(currentRouteGuide(), player.tile, geo, layers, columns, camWorld, camDist, now / 1000);

    // --- picking + edits ---
    if (aimActive && !touch.enabled && camDist < 120 && frameIdx % 2 === 0) {
      const dirx = tx - cwx, diry = ty - cwy, dirz = tz - cwz;
      const dl = Math.hypot(dirx, diry, dirz) || 1;
      updatePicks(dirx / dl, diry / dl, dirz / dl);
    }
    if (!aimActive || camDist >= 120) { lastPick = null; treePick = null; }
    // touch: a tap mines at the tapped ray, a long-press builds there
    if (!worldBlocked() && touch.enabled && camDist < 120 && (tf.mines.length > 0 || tf.places.length > 0)) {
      for (const m of tf.mines) {
        rayV.set((m.x / window.innerWidth) * 2 - 1, -(m.y / window.innerHeight) * 2 + 1, 0.5).unproject(camera).normalize();
        updatePicks(rayV.x, rayV.y, rayV.z);
        tryMine();
      }
      for (const b of tf.places) {
        rayV.set((b.x / window.innerWidth) * 2 - 1, -(b.y / window.innerHeight) * 2 + 1, 0.5).unproject(camera).normalize();
        updatePicks(rayV.x, rayV.y, rayV.z);
        tryPlace('touch');
      }
      lastPick = null;
      treePick = null;
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
    if (routeFocusActive && !hud.routeVisible()) {
      routeFocusActive = false;
      routeFocusDirty = false;
    }
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
      const caveResonance = currentCaveResonance();
      const domain = currentPentagonDomain();
      const site = currentPentagonSite();
      const siteWork = currentPentagonSiteWork();
      const siteThresholdNow = currentPentagonSiteThreshold();
      const siteThresholdEffectNow = currentPentagonSiteThresholdEffect();
      const thresholdChambers = thresholdChamberDiagnostics();
      const thresholdChamber = thresholdChambers.nearby;
      const domainResource = nearbyDomainResource();
      const skyfall = currentSkyfall();
      const skyfallNearby = nearbySkyfall();
      const murmur = currentRouteMurmurSignal();
      const murmurNearby = nearbyMurmur();
      const season = currentRouteSeasonSignal();
      const afterglow = currentRouteSeasonAfterglowSignal();
      const chartSignal = horizonChartCount() > 0 ? horizonChartSignal() : null;
      const hearthBeacon = visibleHearthBeaconSignal();
      const guide = currentRouteGuide(chartSignal);
      const slate = currentRouteSlate(chartSignal);
      const routeSelection = routeSelectionState();
      const vaneForecast = weatherVaneForecast();
      const cisternWater = rainCisternDiagnostics().reduce((sum, cistern) => sum + Math.max(0, Math.trunc(cistern.state?.water ?? 0)), 0);
      const cellarProvisions = rootCellarProvisionCount(structures, geo);
      const trapStats = fishTrapDiagnostics();
      const trapReady = trapStats.filter((trap) => trap.ready).length;
      const netStats = shoreNetDiagnostics();
      const netReady = netStats.filter((net) => net.ready).length;
      const landmarkProgress = progressionState();
      const landmarkNearby = nearbyLandmarkTile() !== null;
      hud.setVitals(`${metrics.fpsEma.toFixed(0)} fps${metrics.active() ? ` · ● ${metrics.active()}` : ''} · ${survival.status} ${survival.stamina}/${survival.exposure}${!creativeActive && burden.status !== 'light' ? ` · ${burden.label}` : ''}${structures.length > 0 ? ` · ${home.label}` : ''}${foodTotal > 0 ? ` · food ${foodTotal}` : ''}${domain ? ` · ${domain.domainLabel}` : ''}${landmarkProgress.count > 0 || landmarkNearby ? ` · ${landmarkProgress.label}` : ''}`);
      if (showDiag) {
        const s = streamer.stats();
        const propStats = structureRenderer.stats();
        const landmarkStats = landmarkRenderer.stats();
        const resourceStats = domainResourceRenderer.stats();
        const skyfallStats = skyfallRenderer.stats();
        const murmurStats = murmurRenderer.stats();
        const afterglowStats = seasonAfterglowRenderer.stats();
        const nativeStats = nativeLifeRenderer.stats();
        const nativeHazard = nearbyNativeHazard();
        const mouthStats = caveMouthRenderer.stats();
        const routeStats = routeRenderer.stats();
        const characterState = character.state();
        const characterStats = character.stats();
        const gamepadState = gamepad.snapshot();
        const audioState = audio.state();
        const tools = toolSummary(craftedItems, toolWear);
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
          `structures ${structures.length} · prop meshes ${propStats.meshes} · route marker roles ${propStats.routeReadabilityRoles}/${propStats.routeSilhouettes} · ${home.label}${cisternWater > 0 ? ` · cistern water ${cisternWater}` : ''}${cellarProvisions > 0 ? ` · cellar provisions ${cellarProvisions}` : ''}`,
          `food bait ${food.bait} · seeds ${food.seeds} · compost ${food.compost} · berries ${food.berries} · mushroom/herb/kelp/reeds ${food.caveMushroom}/${food.snowHerb}/${food.kelp}/${food.reeds} · raw/cooked fish ${food.rawFish}/${food.cookedFish} · traps ${trapReady}/${trapStats.length} ready · nets ${netReady}/${netStats.length} ready · meals/rations/stews ${food.campMeal}/${food.trailRation}/${food.expeditionStew} · cellar ${food.cellarProvisions}`,
          `fish ${currentFishSchool().label} · strength ${currentFishSchool().strength.toFixed(2)} · catch ${currentFishSchool().catchCount}`,
          `forage ${currentForage().label} · strength ${currentForage().strength.toFixed(2)}`,
          `cave pressure ${currentCavePressure().label} · light ${currentCavePressure().light} · exposure ${currentCavePressure().exposureRate.toFixed(2)}${currentCavePressure().focus?.active ? ` · focus ${currentCavePressure().focus?.minutes}m` : ''}`,
          caveResonance ? `cave resonance ${caveResonance.label} · ${caveResonance.observed ? 'noted' : `unread · +${caveResonance.reward.count} ${caveResonance.reward.label}`}` : '',
          `cave mouths ${mouthStats.active}/${mouthStats.groups} · meshes ${mouthStats.meshes}`,
          `survival ${survival.label} · day ${timeState.day + 1} ${(Math.floor(timeState.minute / 60)).toString().padStart(2, '0')}:${(Math.floor(timeState.minute % 60)).toString().padStart(2, '0')}`,
          `landmarks ${landmarkProgress.count}/${landmarkProgress.total} · meshes ${landmarkStats.meshes} · landscape ${landmarkStats.landscapeMeshes}/${landmarkStats.profiles}`,
          `domain resources ${resourceStats.active}/${resourceStats.groups} · meshes ${resourceStats.meshes} · silhouettes ${resourceStats.silhouettes}/${resourceStats.kinds}`,
          skyfall ? `skyfall ${skyfall.harvested ? skyfall.dormantLabel : skyfall.label} · ${skyfall.omen.label} · tile ${skyfall.tile} · ${skyfall.minutesRemaining}m left · meshes ${skyfallStats.meshes} · omens ${skyfallStats.omens}` : '',
          skyfallNearby ? `near skyfall ${skyfallNearby.label} · +${skyfallNearby.reward.count} ${skyfallNearby.reward.label}` : '',
          `murmurs ${murmurStats.active}/${murmurStats.groups} · meshes ${murmurStats.meshes}`,
          `native life ${nativeStats.active}/${nativeStats.groups} · silhouettes ${nativeStats.silhouettes}/${nativeStats.kinds} · telegraphs ${nativeStats.telegraphRoles}/${nativeStats.telegraphMeshes} · hazards ${nativeStats.hazards} · tended ${tendedNativeCreatures.size} · warded ${wardedNativeCreatures.size}`,
          nativeHazard ? `near hazard ${nativeHazard.label} · ${nativeHazard.warded ? 'warded' : nativeHazard.hint}` : '',
          murmur ? `murmur ${murmur.label} · tile ${murmur.tile} · ${murmur.distanceLabel} ${murmur.turn} · ${murmur.minutesRemaining}m left` : '',
          murmurNearby ? `near murmur ${murmurNearby.label} · ${murmurNearby.hint}` : '',
          season ? `stranger season ${season.label} · ${season.detail} · ${season.tradeoff} · ${season.chain.progressLabel}` : '',
          afterglow ? `season afterglow ${afterglow.read ? 'read' : 'unread'} · ${afterglow.label} · ${afterglow.distanceLabel} ${afterglow.turn} · meshes ${afterglowStats.meshes}` : '',
          domain ? `domain ${domain.label} · ${domain.domainLabel} · ring ${domain.ring}/${domain.radius} · ${domain.discovered ? domain.boon : domain.routeHint}` : '',
          site ? `site ${site.label} · ${siteWork?.completed ? 'complete' : siteWork?.ready ? 'ready' : site.discovered ? `needs ${siteWorkMissingLabels(siteWork).slice(0, 3).join(', ') || site.buildHint}` : site.routeHint}${siteThresholdNow ? ` · threshold ${siteThresholdNow.label}${siteThresholdNow.open ? ' open' : ' sealed'}` : ''}` : '',
          siteThresholdEffectNow ? `threshold effect ${siteThresholdEffectNow.label} · ${siteThresholdEffectNow.detail}` : '',
          `threshold chambers ${thresholdChambers.observed}/${thresholdChambers.total} read · ${thresholdChambers.open} open${thresholdChamber ? ` · nearby ${thresholdChamber.label}` : ''}`,
          lastThresholdTerrainAction ? `threshold terrain ${lastThresholdTerrainAction}` : '',
          lastThresholdChamberAction ? `last threshold chamber ${lastThresholdChamberAction}` : '',
          domainResource ? `near resource ${domainResource.discovered ? domainResource.label : domainResource.dormantLabel} · ${domainResource.discovered ? `+${domainResource.reward.count} ${domainResource.reward.label}` : domainResource.hint}` : '',
          chartSignal ? `chart ${chartSignal.label} · bearing ${Math.round(chartSignal.bearingDeg)} deg` : horizonChartCount() > 0 ? 'chart complete' : '',
          hearthBeacon ? `hearth beacon ${hearthBeacon.label} · strength ${hearthBeacon.strength.toFixed(2)}` : '',
          vaneForecast.ready ? `weather vane ${vaneForecast.label || 'read'} · reads ${vaneForecast.reads}` : '',
          guide ? `route ribbon ${guide.label} · ${guide.detail} · dashes ${routeStats.active}/${routeStats.meshes} · atlas ${routeStats.atlasActive}/${routeStats.atlasMeshes}` : '',
          slate.primary ? `route slate ${slate.summary}` : '',
          routeSelection.open && routeSelection.selected ? `route choice ${routeSelection.index + 1}/${routeSelection.candidates.length} · ${routeSelection.selected.label}` : '',
          natural ? `natural void ${natural.kind} · depth ${natural.depth.toFixed(1)} m` : '',
          caveSignal && !natural ? `cave signal ${caveSignal.label ?? caveKindLabel(caveSignal.kind)} · ${caveSignal.distance} ring${caveSignal.distance === 1 ? '' : 's'} · depth ${caveSignal.depth.toFixed(1)} m${caveSignal.clearance !== undefined ? ` · clearance ${caveSignal.clearance}` : ''}` : '',
          lastFoodAction ? `last food ${lastFoodAction}` : '',
          lastToolAction ? `last tool ${lastToolAction}` : '',
          lastCaveAction ? `last cave ${lastCaveAction}` : '',
          lastSurvivalAction ? `last survival ${lastSurvivalAction}` : '',
          lastNavigationAction ? `last navigation ${lastNavigationAction}` : '',
          lastLandmarkAction ? `last landmark ${lastLandmarkAction}` : '',
          lastDomainResourceAction ? `last resource ${lastDomainResourceAction}` : '',
          lastSkyfallAction ? `last skyfall ${lastSkyfallAction}` : '',
          lastMurmurAction ? `last murmur ${lastMurmurAction}` : '',
          lastNativeLifeAction ? `last native ${lastNativeLifeAction}` : '',
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
      if (journalOpen) hud.setJournal(currentHearthJournal(), true);
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
