import * as THREE from 'three/webgpu';
import { color, float, positionWorld, positionLocal, cameraPosition, normalWorld, normalize, uniform, attribute, vec3, time, mix, smoothstep as tslSmoothstep } from 'three/tsl';
import { Goldberg } from './geo/goldberg';
import { buildLayers, PLANET_RADIUS, WATER_SURFACE } from './world/layers';
import { Terrain, MAT, type MaterialId } from './world/terrain';
import { Columns } from './world/columns';
import { Trees } from './world/trees';
import { Streamer } from './world/streamer';
import { chunkKeyOfTile } from './world/chunks';
import { FarSphere } from './render/farsphere';
import { buildGeodesic } from './render/geodesic';
import { Character } from './render/character';
import { Player } from './player/player';
import { Input } from './player/input';
import { pick, pickTree, type PickResult, type TreePick } from './edit/pick';
import { Metrics } from './demo/metrics';
import { Autopilot, OrbitDemo } from './demo/autopilot';
import { Hud, splash, hideSplash } from './demo/hud';

const params = new URLSearchParams(location.search);
const SEED = params.get('seed') ?? 'GP192-01';
const M = Number.parseInt(params.get('m') ?? '192', 10);
const COARSE_M = 96;

const DIST_MIN = 2.4;
const DIST_MAX = 4200;
const PLANE_CAM_EXP = Math.log(15 / DIST_MIN) / Math.log(DIST_MAX / DIST_MIN);
const SUN = new THREE.Vector3(0.62, 0.55, 0.56).normalize();
const PLANE_WOOD_COST = 12;
const WOOD_PER_TREE = 6;

// hotbar: placeable materials, mined/chopped resources feed the counts
const SLOTS: { name: string; mat: MaterialId; css: string }[] = [
  { name: 'dirt', mat: MAT.DIRT, css: '#8a6242' },
  { name: 'rock', mat: MAT.ROCK, css: '#7d7f85' },
  { name: 'sand', mat: MAT.SAND, css: '#d8c48a' },
  { name: 'snow', mat: MAT.SNOW, css: '#eef2f5' },
  { name: 'wood', mat: MAT.WOOD, css: '#a8763f' },
];
const WOOD_SLOT = 4;

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
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
  const streamer = new Streamer(geo, layers, columns, scene, chunkMaterial, trees);

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

  // --- atmosphere shell (TSL fresnel, additive) ---
  const atmo = (() => {
    const geom = new THREE.IcosahedronGeometry(PLANET_RADIUS * 1.05, 6);
    const mat = new THREE.MeshBasicNodeMaterial();
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const fresnel = float(1.0).sub(normalWorld.dot(viewDir).abs()).max(0.0).pow(2.6);
    const sunFacing = normalWorld.dot(uniform(SUN)).mul(0.5).add(0.5);
    mat.colorNode = color(0x4d9ae6);
    mat.opacityNode = fresnel.mul(sunFacing.mul(0.6).add(0.25)).mul(0.85);
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.side = THREE.BackSide;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    scene.add(mesh);
    return mesh;
  })();

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
  player.spawnAt(spawnTile);
  const input = new Input(renderer.domElement);
  const hud = new Hud();
  const metrics = new Metrics(() => {
    const s = streamer.stats();
    return { loads: streamer.loads, releases: streamer.releases, buildSamples: streamer.buildSamples, resident: s.resident, triangles: s.triangles };
  });
  const autopilot = new Autopilot(geo, layers, columns, metrics, (msg) => hud.flash(msg, 10));
  const orbitDemo = new OrbitDemo(metrics, (msg) => hud.flash(msg, 10));
  const character = new Character(scene);

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
  hud.flash(`${isWebGPU ? 'WebGPU' : 'WebGL2 fallback'} · seed ${SEED} · GP(${M},0) · ${geo.count.toLocaleString()} tiles
chop trees, mine, build — ${PLANE_WOOD_COST} wood crafts a plane (E)`, 10);

  // --- camera state ---
  let zoomExp = 0;
  let zoomExpTarget = 0;
  let zoomHold = false;       // scripted zoom: ignore wheel until released
  let planeAutoZoom = false;  // pulled back automatically when boarding the plane
  let camDist = 0;
  let camObstruct = Infinity; // obstruction cap on the camera boom (smoothly regrows)
  const camUp = new THREE.Vector3(0, 1, 0);
  const camWorld = { x: 0, y: 0, z: 0 };

  // --- inventory + edit state ---
  const counts = SLOTS.map(() => 0);
  let hotbarSel = 0;
  let planeCrafted = params.get('plane') === '1';
  if (params.get('creative') === '1') {
    for (let i = 0; i < counts.length; i++) counts[i] = 999;
    planeCrafted = true;
  }
  let lastPick: PickResult | null = null;
  let treePick: TreePick | null = null;
  let mineTimer = 0;
  let placeTimer = 0;
  let edits = 0;
  let lastEditMs = 0;

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

  const playerReach = (): number => (player.mode === 'fly' ? 60 : 9.5);

  const tryMine = (): void => {
    // a tree in front of the terrain hit gets chopped instead
    if (treePick && (!lastPick || treePick.dist < lastPick.dist)) {
      if (trees.chop(treePick.tile)) {
        counts[WOOD_SLOT] += WOOD_PER_TREE;
        hud.flash(`+${WOOD_PER_TREE} wood (${counts[WOOD_SLOT]})`, 2);
        rebuildAround(treePick.tile);
        treePick = null;
      }
      return;
    }
    if (!lastPick) return;
    const mat = columns.materialAt(lastPick.hitTile, lastPick.hitLayer);
    if (columns.mine(lastPick.hitTile, lastPick.hitLayer)) {
      const slot = yieldSlot(mat);
      if (slot >= 0) counts[slot]++;
      edits++;
      rebuildAround(lastPick.hitTile);
    }
  };

  const tryPlace = (): void => {
    if (!lastPick || lastPick.prevTile < 0 || lastPick.prevLayer < 0) return;
    if (lastPick.prevTile === player.tile) {
      const feetK = layers.layerOfRadius(player.radius() + 0.05);
      const headK = Math.max(0, layers.layerOfRadius(player.radius() + 1.75));
      if (lastPick.prevLayer >= headK && lastPick.prevLayer <= feetK) return;
    }
    if (counts[hotbarSel] <= 0) {
      hud.flash(`out of ${SLOTS[hotbarSel].name} — mine some first (LMB)`, 2.5);
      return;
    }
    if (columns.place(lastPick.prevTile, lastPick.prevLayer, SLOTS[hotbarSel].mat)) {
      counts[hotbarSel]--;
      edits++;
      rebuildAround(lastPick.prevTile);
    }
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let fWas = false, gWas = false, oWas = false, eWas = false;

  const handlePlaneKey = (): void => {
    if (player.mode === 'plane') {
      player.exitPlane();
      hud.flash('plane stowed — falling!', 2.5);
      return;
    }
    if (!planeCrafted) {
      if (counts[WOOD_SLOT] >= PLANE_WOOD_COST) {
        counts[WOOD_SLOT] -= PLANE_WOOD_COST;
        planeCrafted = true;
        if (player.enterPlane()) hud.flash('plane crafted! mouse steers · W/S throttle · shift boost · E stows', 8);
      } else {
        hud.flash(`a plane needs ${PLANE_WOOD_COST} wood — you have ${counts[WOOD_SLOT]}. chop trees (LMB)`, 4);
      }
      return;
    }
    if (player.enterPlane()) hud.flash('airborne — level flight holds your height over the terrain', 4);
    else hud.flash("can't take off while swimming", 2.5);
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
      zoom: camDist,
      agl: player.altitudeAGL(),
      mode: player.mode,
      planeCrafted,
      wood: counts[WOOD_SLOT],
      spawnTile,
    }),
    startTraversal: () => autopilot.toggle(player),
    startOrbit: () => orbitDemo.start(),
    setZoom,
    look: (yawRad: number, pitchRad: number) => { player.applyLook(yawRad / 0.0023, pitchRad / 0.0023); },
    setFly: (on: boolean) => { player.mode = on ? 'fly' : 'walk'; },
    grantPlane: () => { planeCrafted = true; },
    give: (slot: number, n: number) => { counts[slot] = (counts[slot] ?? 0) + n; },
    debugPick: () => ({ lastPick, treePick }),
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
        if (fn()) { rebuildAround(tile); times.push(performance.now() - t0); edits++; }
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

    // key edges
    const fDown = input.down('KeyF'), gDown = input.down('KeyG'), oDown = input.down('KeyO'), eDown = input.down('KeyE');
    if (fDown && !fWas && !autopilot.active) player.toggleFly();
    if (gDown && !gWas) { autopilot.toggle(player); hud.flash(autopilot.active ? 'autopilot: circumnavigating…' : 'autopilot off', 4); }
    if (oDown && !oWas) { orbitDemo.start(); hud.flash('orbit pull-back demo…', 4); }
    if (eDown && !eWas && !autopilot.active) handlePlaneKey();
    fWas = fDown; gWas = gDown; oWas = oDown; eWas = eDown;
    for (let i = 0; i < SLOTS.length; i++) {
      if (input.down(`Digit${i + 1}`)) hotbarSel = i;
    }

    // look + move
    if (input.active() && !autopilot.active) player.applyLook(drained.dx, drained.dy);
    if (autopilot.active) {
      autopilot.update(dt, player);
    } else {
      const fwd = (input.down('KeyW') ? 1 : 0) + (input.down('KeyS') ? -1 : 0);
      const strafe = (input.down('KeyD') ? 1 : 0) + (input.down('KeyA') ? -1 : 0);
      const upDown = (input.down('Space') ? 1 : 0) + (input.down('ControlLeft') || input.down('KeyC') ? -1 : 0);
      player.update(dt, {
        forward: fwd, strafe,
        upDown: player.mode !== 'walk' ? upDown : 0,
        sprint: input.down('ShiftLeft'),
        jump: input.down('Space'),
        swimUp: input.down('Space'),
      });
      if (player.planeStowed) hud.flash(player.submerged > 0.2 ? 'splashdown — plane stowed' : 'touched down — plane stowed', 3);
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
    atmo.position.set(-camWorld.x, -camWorld.y, -camWorld.z);
    sun.position.set(SUN.x * 11000 - camWorld.x, SUN.y * 11000 - camWorld.y, SUN.z * 11000 - camWorld.z);
    sunTarget.position.set(-camWorld.x, -camWorld.y, -camWorld.z);
    character.update(player, camWorld, camDist, dt);

    // --- picking + edits ---
    if (input.active() && camDist < 120 && frameIdx % 2 === 0) {
      const dirx = tx - cwx, diry = ty - cwy, dirz = tz - cwz;
      const dl = Math.hypot(dirx, diry, dirz) || 1;
      const reach = playerReach();
      const p = pick(geo, layers, columns, camWorld.x, camWorld.y, camWorld.z, dirx / dl, diry / dl, dirz / dl, reach + camDist);
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
      // trees are pickable in front of (or instead of) terrain
      treePick = pickTree(geo, layers, columns, trees, camWorld.x, camWorld.y, camWorld.z, dirx / dl, diry / dl, dirz / dl, reach + camDist);
    }
    if (!input.active() || camDist >= 120) { lastPick = null; treePick = null; }

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
    if ((drained.mine || (input.mineHeld && mineTimer <= 0)) && (lastPick || treePick)) { tryMine(); mineTimer = 0.17; }
    if ((drained.place || (input.placeHeld && placeTimer <= 0)) && lastPick) { tryPlace(); placeTimer = 0.17; }

    // --- hud + metrics ---
    metrics.frame(dtMs);
    hud.tick(dt);
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.25;
      const s = streamer.stats();
      const agl = player.altitudeAGL();
      const speed = Math.hypot(player.vx, player.vy, player.vz);
      const modeLabel = autopilot.active ? 'autopilot'
        : player.mode === 'plane' ? 'PLANE'
        : player.submerged > 0.4 ? 'swimming'
        : player.mode;
      hud.setStats([
        `${isWebGPU ? 'WebGPU' : 'WebGL2'}  ${metrics.fpsEma.toFixed(0)} fps  ${metrics.frameMsEma.toFixed(1)} ms`,
        `mode ${modeLabel}${player.grounded ? ' (grounded)' : ''}  speed ${speed.toFixed(1)} m/s`,
        player.mode === 'plane' ? `throttle ${player.throttle.toFixed(0)} m/s  holding ${player.holdAGL.toFixed(0)} m over terrain` : '',
        `alt ${agl.toFixed(1)} m AGL  h ${(player.radius() - PLANET_RADIUS).toFixed(1)} m  zoom ${camDist.toFixed(0)} m`,
        `tile ${player.tile}${geo.degreeOf(player.tile) === 5 ? ' *pentagon*' : ''}  seed ${SEED}`,
        `chunks ${s.resident} resident / ${s.queued} queued  ${(s.triangles / 1000).toFixed(0)}k tris`,
        `columns ${columns.generatedCount.toLocaleString()} / ${geo.count.toLocaleString()} generated  edits ${edits}`,
        !planeCrafted ? `craft a plane: chop ${PLANE_WOOD_COST} wood, then press E (${counts[WOOD_SLOT]}/${PLANE_WOOD_COST})` : '',
        lastEditMs > 0 ? `last edit rebuild ${lastEditMs.toFixed(1)} ms` : '',
        input.lockUnavailable && !input.locked ? 'pointer lock unavailable here: DRAG to look' : '',
        metrics.active() ? `● capturing: ${metrics.active()}` : '',
      ].filter((l) => l !== ''));
      hud.setHotbar(SLOTS.map((sl, i) => ({ name: sl.name, css: sl.css, count: counts[i] })), hotbarSel);
    }

    renderer.render(scene, camera);
  });
}

boot().catch((err) => {
  console.error(err);
  splash(`boot failed: ${err}`, 0);
});
