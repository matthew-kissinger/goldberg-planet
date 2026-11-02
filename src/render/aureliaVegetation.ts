/** Planet-wide Aurelia vegetation. Spatial discovery is incremental and bounded;
 * geometry is shared, instance storage is fixed, and only live slots are drawn. */
import * as THREE from 'three/webgpu';
import { attribute, dot, positionGeometry, positionLocal, sin, uniform, vec3 } from 'three/tsl';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Terrain } from '../world/terrain';
import { treeTangentFrame, type Trees, type TreeParams } from '../world/trees';
import { aureliaSites, type AureliaBiome } from '../world/aurelia';
import { worldSites, type WorldBiome } from '../world/expeditionWorlds';
import type { PlanetArchetype } from '../world/planetConfig';
import { createExpeditionHabitat, habitatDirection, isExpeditionInterior, type HabitatPlant } from '../world/expeditionHabitat';
import { hashInt01, hashString } from '../util/prng';
import { GeometryKit } from './campKit';
import { aureliaTreeMatrix, plantModuleGeometry, treePartGeometry, treeWindWeight, visitVegetationTreeParts, type EmitTreePart, type PlantModule, type TreePartShape } from './vegetationKit';

export const VEGETATION_BUDGET = Object.freeze({ radius: 140, nearRadius: 78, plantRadius: 65, trees: 192, outerTrees: 128, plants: 600, tiles: 6144, scanPerFrame: 128 });
const PLANTS: readonly PlantModule[] = ['fern', 'reed', 'grass', 'drygrass', 'rosette', 'bell', 'spike', 'shrub'];
export const WORLD_VEGETATION_MODULES: Readonly<Record<PlanetArchetype, { shapes: readonly TreePartShape[]; plants: readonly PlantModule[] }>> = {
  terran: { shapes: ['stem', 'crown', 'spire'], plants: PLANTS },
  shattered: { shapes: ['crystal'], plants: ['mineralChips', 'crystalSpray', 'riftGlass'] },
  canyon: { shapes: ['stem', 'succulent', 'frond', 'parasol'], plants: ['thornTuft', 'desertRosette', 'seedPods'] },
  cryo: { shapes: ['stem', 'frond', 'crystal', 'fan'], plants: ['frostLichen', 'iceNeedles', 'snowBell'] },
  volcanic: { shapes: ['stem', 'crystal', 'succulent', 'parasol'], plants: ['sulfurRosette', 'ashReed', 'emberPolyps'] },
  biolum: { shapes: ['succulent', 'parasol', 'gill', 'fan'], plants: ['glowMoss', 'sporeCups', 'fanMold'] },
};
const PART_CAPACITY: Readonly<Record<TreePartShape, number>> = { stem: 9, crown: 7, spire: 4, crystal: 6, succulent: 7, frond: 8, parasol: 3, fan: 4, gill: 3 };
const IMMOBILE_PLANTS = new Set<PlantModule>(['mineralChips', 'crystalSpray', 'riftGlass', 'frostLichen', 'iceNeedles', 'sulfurRosette']);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
type Position = { x: number; y: number; z: number };
interface TreeEntry { tile: number; distance: number; params: TreeParams }
interface PlantEntry { tile: number; distance: number; kind: PlantModule; x: number; y: number; z: number; scale: number; yaw: number; tint: number }
interface Landmark { mesh: THREE.Mesh; position: THREE.Vector3; tile: number }

/** Community rules are shared by tests/export tools; patches follow canopy and
 * moisture fields rather than an independent uniform scatter per asset. */
export function aureliaPlantModule(biome: AureliaBiome, moisture: number, forest: number, patch: number, variant: number): PlantModule {
  if (biome === 'wetland') return patch < 0.62 ? 'reed' : variant < 0.32 ? 'bell' : 'fern';
  if (biome === 'woodland') return forest > 0.6 && patch < 0.68 ? 'fern' : variant < 0.34 ? 'bell' : 'shrub';
  if (biome === 'dryland') return patch < 0.67 ? 'drygrass' : variant < 0.38 ? 'spike' : 'shrub';
  if (biome === 'highland') return patch < 0.42 ? 'shrub' : variant < 0.24 ? 'spike' : 'drygrass';
  if (biome === 'coast') return moisture > 0.62 && patch < 0.3 ? 'reed' : variant < 0.17 ? 'rosette' : 'grass';
  return patch < 0.48 ? 'grass' : variant < 0.57 ? 'rosette' : variant < 0.82 ? 'spike' : 'bell';
}

export function expeditionPlantModule(biome: WorldBiome, moisture: number, patch: number, variant: number): PlantModule {
  if (biome === 'regolith' || biome === 'crater') return patch < 0.7 ? 'mineralChips' : 'crystalSpray';
  if (biome === 'rift') return variant < 0.55 ? 'riftGlass' : 'crystalSpray';
  if (biome === 'mesa' || biome === 'dune') return patch < 0.62 ? 'thornTuft' : 'seedPods';
  if (biome === 'oasis') return moisture > 0.55 && patch > 0.3 ? 'desertRosette' : 'seedPods';
  if (biome === 'ice_shelf' || biome === 'spire') return patch < 0.6 ? 'iceNeedles' : 'frostLichen';
  if (biome === 'fjord') return variant < 0.32 ? 'snowBell' : patch < 0.5 ? 'frostLichen' : 'iceNeedles';
  if (biome === 'caldera' || biome === 'basalt') return patch < 0.7 ? 'sulfurRosette' : 'emberPolyps';
  if (biome === 'ash_refuge') return variant < 0.6 ? 'ashReed' : 'sulfurRosette';
  if (biome === 'lagoon') return patch < 0.6 ? 'sporeCups' : 'glowMoss';
  if (biome === 'atoll') return variant < 0.5 ? 'fanMold' : 'sporeCups';
  return patch < 0.55 ? 'glowMoss' : variant < 0.6 ? 'fanMold' : 'sporeCups';
}

function landmarkGeometry(biome: AureliaBiome): THREE.BufferGeometry {
  const k = new GeometryKit(), stone = 0xb0b09b, warm = 0xc5ba9b, dark = 0x8d9789;
  if (biome === 'woodland') {
    // A fallen rainbough and its split upright, situated beside the site clearing.
    k.beam(0x8a7d61, [-3, 0, 0], [-2.7, 6.5, 0.3], 0.85);
    k.beam(0x9b8c6d, [-2.7, 5.2, 0.3], [2.5, 6.8, 0], 0.53);
    k.beam(0x8a7d61, [2.5, 6.8, 0], [4, 0, 0.4], 0.7);
    k.beam(0x9b8c6d, [-2.8, 5.9, 0.3], [-4.6, 8, 0.1], 0.29);
    for (let i = 0; i < 4; i++) k.crown(0x8da076, [-2.3 + i * 1.3, 6.6, 0.1], [0.8, 0.22, 0.66]);
    for (let i = 0; i < 5; i++) k.crown(0xc8b68b, [-3 + (i % 2) * 0.6, 0.7 + i * 0.43, 0.6], [0.5, 0.1, 0.38]);
  } else if (biome === 'wetland') {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 0.4;
      k.beam(0x8b846a, [Math.cos(a) * 3, 0, Math.sin(a) * 3], [Math.cos(a) * 0.8, 3.7, Math.sin(a) * 0.8], 0.38);
    }
    k.cylinder(0x9b9173, [0, 4.1, 0], 0.65, 1.2, 2.5, 7);
    k.crown(0x657e69, [0.3, 5.6, 0], [1.4, 0.25, 1.1]);
    k.crown(warm, [1.5, 0.5, 0], [1.8, 0.7, 1.5]);
  } else if (biome === 'meadow') {
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      k.crown(i % 2 ? stone : warm, [Math.cos(a) * 3.5, 0.55 + (i % 2) * 0.4, Math.sin(a) * 3.5], [0.7, 0.8 + (i % 2) * 0.4, 0.7]);
    }
    k.crown(dark, [0, 0.25, 0], [1.5, 0.4, 1.1]);
  } else if (biome === 'highland') {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 3;
      k.crown(dark, [x, 0.7, 0], [1.7, 1, 1.5]);
      k.crown(stone, [x + 0.2, 2.3, 0], [1.2, 1.2, 1]);
      k.crown(warm, [x, 3.8 + (i === 1 ? 0.6 : 0), 0.2], [0.75, 0.8, 0.8]);
    }
  } else if (biome === 'dryland') {
    k.crown(0xbb9a72, [0, 1, 0], [5, 1.3, 2.8]);
    k.crown(0xceae7e, [-1, 3.7, 0], [1.3, 3.8, 1.7]);
    k.crown(0xb0926d, [1.6, 2.5, 0.3], [0.9, 2.7, 1.4]);
    k.crown(0xd3b98d, [-0.5, 6, 0], [3.1, 0.65, 1.7]);
  } else {
    // Pale split stones replace the former non-colliding arch on the trail itself.
    k.crown(warm, [-1.6, 2.6, 0], [1.2, 3.4, 1.6]);
    k.crown(stone, [1.5, 2, 0.3], [1.05, 2.8, 1.2]);
    k.crown(dark, [0, 0.4, 0], [3.4, 0.65, 2.4]);
    k.crown(0x80936b, [-2, 0.9, 0.4], [1.4, 0.18, 0.7]);
  }
  return k.finish();
}

function expeditionLandmarkGeometry(archetype: PlanetArchetype, index: number): THREE.BufferGeometry {
  const k = new GeometryKit();
  if (archetype === 'shattered') {
    k.crown(0x71788c, [0, 0.3, 0], [3.5, 0.6, 2.5]);
    for (let i = 0; i < 3; i++) k.add(treePartGeometry('crystal'), i % 2 ? 0xabaac2 : 0x8a99ad, [(i - 1) * 2, 2.8 + (i === index ? 1 : 0), 0], [0.6, 5.5 + (i === index ? 2 : 0), 0.5], [0, i * 0.7, (i - 1) * 0.18]);
  } else if (archetype === 'canyon') {
    for (let i = 0; i < 4; i++) k.crown(i % 2 ? 0xc58d62 : 0xab7658, [-1 + i * 0.55, 0.8 + i * 1.15, 0], [2.6 - i * 0.37, 0.8, 1.4 - i * 0.14]);
    k.crown(0xdbab76, [0.8, 5.4, 0], [3.1, 0.5, 1.6]);
    k.crown(0xae805b, [-3, 0.3, 1], [1.3, 0.5, 1.2]);
  } else if (archetype === 'cryo') {
    k.crown(0xacc7d0, [0, 0.25, 0], [4.2, 0.6, 2.6]);
    for (let i = 0; i < 4; i++) k.add(treePartGeometry('fan'), i % 2 ? 0xc7dfdf : 0x94bcca, [(i - 1.5) * 1.8, 0.1, 0], [1.5, 3.5 + (i % 3) * 1.2, 1.5], [0, i * 0.35 + index * 0.3, (i - 1.5) * 0.1]);
  } else if (archetype === 'volcanic') {
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      k.add(treePartGeometry('crystal'), i % 2 ? 0x72655b : 0x514c4e, [Math.cos(a) * 1.7, 2.4 + (i % 3) * 0.25, Math.sin(a) * 1.7], [0.9, 4.8 + (i % 3) * 0.5, 0.7], [0, a, 0.08]);
    }
    k.crown(0xc19b6b, [0, 0.12, 0], [1.3, 0.15, 1.3]);
  } else {
    k.beam(0x96aa9b, [-1, 0, 0], [0, 5.4, 0], 0.8);
    k.add(treePartGeometry('parasol'), 0x7895ad, [0, 5.4, 0], [4.8, 4, 4.1]);
    k.add(treePartGeometry('gill'), 0xc1d7be, [0, 5.4, 0], [4.8, 4, 4.1]);
    for (let i = 0; i < 3; i++) k.add(treePartGeometry('fan'), 0x91bdae, [-1.2 + i * 0.8, 0.2 + i * 0.5, 0.4], [0.8, 1.5, 0.8], [0.2, i * 1.2, 0]);
  }
  return k.finish();
}

export class AureliaVegetationRenderer {
  readonly group = new THREE.Group();
  private readonly wind = uniform(0);
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly batches: THREE.InstancedMesh[] = [];
  private readonly owners = new Map<THREE.InstancedMesh, Int32Array>();
  private readonly liveTrees = new Map<number, boolean>();
  private readonly treeBatches: Partial<Record<TreePartShape, THREE.InstancedMesh>> = {};
  private readonly treeBatchSet = new Set<THREE.InstancedMesh>();
  private readonly farCrown: THREE.InstancedMesh | null;
  private readonly plantBatches = new Map<PlantModule, THREE.InstancedMesh>();
  private readonly landmarks: Landmark[] = [];
  private readonly authoredPlants: Array<PlantEntry & { source: HabitatPlant }> = [];
  private readonly treeEntries: TreeEntry[] = [];
  private readonly plantEntries: PlantEntry[] = [];
  private readonly queue = new Int32Array(VEGETATION_BUDGET.tiles);
  private readonly seen = new Set<number>();
  private queueRead = 0;
  private queueEnd = 0;
  private scanning = false;
  private scanX = 0; private scanY = 0; private scanZ = 0;
  private residentX = Infinity; private residentY = Infinity; private residentZ = Infinity;
  private stateChopped = -1; private stateEdits = -1; private stateSeeds = -1;
  private prunedChopped = -1; private prunedEdits = -1;
  private nearTrees = 0; private outerTrees = 0; private plantCount = 0;
  private refreshes = 0; private scanSlices = 0; private maxSliceMs = 0; private maxDiscoveryMs = 0; private maxCommitMs = 0; private residentTiles = 0;
  private active = false;
  private disposed = false;
  private readonly seed: number;
  private readonly matrix = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly base = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly yaw = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  private readonly frame = new Float64Array(6);
  private simpleTree = false;
  private treeTint = 1;
  private treeWind = 1;
  private writingTile = -1;
  private readonly emitTree: EmitTreePart = (shape, paint, x, y, z, sx, sy, sz, qx, qy, qz, qw) => {
    const batch = shape === 'crown' && this.simpleTree && this.farCrown ? this.farCrown : this.treeBatches[shape]!;
    if (!batch || batch.count >= batch.instanceMatrix.count) throw new Error(`Vegetation part budget exceeded: ${this.terrain.config.name}/${shape}`);
    this.local.compose(this.position.set(x, y, z), this.quaternion.set(qx, qy, qz, qw), this.scale.set(sx, sy, sz));
    this.matrix.multiplyMatrices(this.base, this.local);
    batch.setMatrixAt(batch.count, this.matrix); batch.setColorAt(batch.count, this.color.setHex(paint).multiplyScalar(this.treeTint)); batch.count++;
    this.owners.get(batch)![batch.count - 1] = this.writingTile;
    (batch.geometry.getAttribute('windPhase') as THREE.InstancedBufferAttribute).setX(batch.count - 1, hashInt01(this.writingTile) * Math.PI * 2);
    (batch.geometry.getAttribute('windWeight') as THREE.InstancedBufferAttribute).setX(batch.count - 1, this.treeWind);
  };

  constructor(scene: THREE.Scene, private readonly geo: Goldberg, private readonly columns: Columns, private readonly trees: Trees, private readonly terrain: Terrain) {
    this.group.name = `${terrain.config.name} resident vegetation`; this.group.visible = false; scene.add(this.group);
    this.seed = hashString(terrain.seed + ':vegetation-v2');
    const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.91 });
    const leaves = this.windMaterial(false), plants = this.windMaterial(true);
    this.materials.add(wood); this.materials.add(leaves); this.materials.add(plants);
    const capacity = VEGETATION_BUDGET.trees + VEGETATION_BUDGET.outerTrees;
    const profile = WORLD_VEGETATION_MODULES[terrain.archetype];
    const mineral = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: terrain.archetype === 'cryo' ? 0.3 : 0.39, metalness: 0.09 });
    this.materials.add(mineral);
    for (const shape of profile.shapes) {
      const material = shape === 'crystal' || (shape === 'fan' && terrain.archetype === 'cryo') ? mineral : shape === 'stem' || shape === 'succulent' ? wood : leaves;
      const limit = shape === 'crown' ? VEGETATION_BUDGET.trees : capacity;
      const mesh = this.instances(treePartGeometry(shape), material, limit * PART_CAPACITY[shape], true);
      this.treeBatches[shape] = mesh; this.treeBatchSet.add(mesh);
    }
    this.farCrown = terrain.aurelia ? this.instances(new THREE.IcosahedronGeometry(1, 0), leaves, VEGETATION_BUDGET.outerTrees * 4, true) : null;
    if (this.farCrown) this.treeBatchSet.add(this.farCrown);
    for (const kind of profile.plants) this.plantBatches.set(kind, this.instances(plantModuleGeometry(kind), plants, VEGETATION_BUDGET.plants, false));
    const recipe = createExpeditionHabitat(geo, terrain.config);
    if (recipe) for (const plant of recipe.plants) {
      const d = habitatDirection(plant.x, plant.z, terrain.config.radius);
      const tile = geo.tileOf(...d);
      this.authoredPlants.push({ tile, distance: 0, kind: plant.kind === 'flower' ? (plant.community === 'shore' ? 'rosette' : 'bell') : plant.kind,
        x: d[0], y: d[1], z: d[2], scale: plant.scale, yaw: plant.yaw, tint: 1, source: plant });
    }
    if (terrain.aurelia || terrain.expeditionWorld) this.buildLandmarks();
  }

  private windMaterial(vertexColors: boolean): THREE.MeshStandardNodeMaterial {
    const material = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, vertexColors, roughness: 0.88 });
    // A coherent gentle gust acts on leaf/blade modules only. The stem remains at
    // the exact pick position; no texture sampling or per-instance CPU animation.
    // positionLocal already contains instance placement at this shader stage.
    // The bend mask/phase must come from untransformed prototype coordinates;
    // using the planet-scale local Y stretches vegetation into kilometre spikes.
    const tip = positionGeometry.y.max(0);
    const atmosphere = this.terrain.config.atmosphere.density > 0 ? 1 : 0;
    const bend = sin(this.wind.mul(1.25).add(attribute('windPhase', 'float')).add(positionGeometry.x.mul(2.1)))
      .mul(tip).mul(attribute('windWeight', 'float')).mul((vertexColors ? 0.065 : 0.018) * atmosphere);
    const radialUp = positionLocal.normalize(), windDirection = vec3(1, 0.25, 0.4);
    const tangentWind = windDirection.sub(radialUp.mul(dot(windDirection, radialUp)));
    material.positionNode = positionLocal.add(tangentWind.mul(bend));
    if (this.terrain.archetype === 'biolum') {
      if (vertexColors) material.emissiveNode = attribute('color', 'vec3').mul(0.16);
      else { material.emissive.setHex(0x79aeaa); material.emissiveIntensity = 0.09; }
    }
    return material;
  }

  private instances(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, shadow: boolean): THREE.InstancedMesh {
    this.geometries.add(geometry);
    geometry.setAttribute('windPhase', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('windWeight', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `${this.terrain.config.name} growth ${this.batches.length}`; mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Allocate every shader input before startup compilation, even when the first
    // local window has not admitted this species/flower module yet.
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    this.owners.set(mesh, new Int32Array(capacity));
    this.group.add(mesh); this.batches.push(mesh); return mesh;
  }

  private radialBase(x: number, y: number, z: number, ground: number, angle: number, scale: number): void {
    this.up.set(x, y, z); treeTangentFrame(x, y, z, this.frame);
    this.local.set(-this.frame[0], x, this.frame[3], 0, -this.frame[1], y, this.frame[4], 0, -this.frame[2], z, this.frame[5], 0, 0, 0, 0, 1);
    this.quaternion.setFromRotationMatrix(this.local).multiply(this.yaw.setFromAxisAngle(Y_AXIS, angle));
    this.base.compose(this.position.set(x * ground, y * ground, z * ground), this.quaternion, this.scale.setScalar(scale));
  }

  private buildLandmarks(): void {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }); this.materials.add(material);
    const radius = this.terrain.config.radius;
    const sites = this.terrain.aurelia ? aureliaSites(this.terrain.config) : worldSites(this.terrain.config);
    for (let index = 0; index < sites.length; index++) {
      const site = sites[index], starter = this.terrain.aurelia && site.biome === 'coast';
      const direction = starter ? habitatDirection(-16, 124, radius) : [...site.direction] as [number, number, number];
      if (!starter) {
        treeTangentFrame(...direction, this.frame);
        direction[0] += this.frame[0] * 27 / radius; direction[1] += this.frame[1] * 27 / radius; direction[2] += this.frame[2] * 27 / radius;
        const inv = 1 / Math.hypot(...direction); direction[0] *= inv; direction[1] *= inv; direction[2] *= inv;
      }
      const tile = this.geo.tileOf(...direction), ground = this.columns.layers.topRadius(this.columns.topLayerOf(tile));
      const geometry = this.terrain.aurelia ? landmarkGeometry(site.biome as AureliaBiome) : expeditionLandmarkGeometry(this.terrain.archetype, index); this.geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `${site.name} landmark`; mesh.castShadow = true; mesh.receiveShadow = true;
      this.radialBase(...direction, ground - 0.15, 0, 1); mesh.matrix.copy(this.base); mesh.matrixAutoUpdate = false;
      this.group.add(mesh); this.landmarks.push({ mesh, tile, position: new THREE.Vector3(...direction).multiplyScalar(ground) });
    }
  }

  private beginScan(px: number, py: number, pz: number): void {
    const inv = 1 / Math.hypot(px, py, pz); this.scanX = px * inv; this.scanY = py * inv; this.scanZ = pz * inv;
    const tile = this.geo.tileOf(this.scanX, this.scanY, this.scanZ);
    this.queueRead = 0; this.queueEnd = 1; this.queue[0] = tile; this.seen.clear(); this.seen.add(tile);
    this.treeEntries.length = 0; this.plantEntries.length = 0; this.scanning = true;
    this.stateChopped = this.trees.chopped.size; this.stateEdits = this.columns.edits.size; this.stateSeeds = this.columns.seededEcoTiles.size;
  }

  private scanSlice(): void {
    const begin = performance.now(), c = this.geo.centers, radius = this.terrain.config.radius;
    const maxD2 = VEGETATION_BUDGET.radius ** 2, plantD2 = VEGETATION_BUDGET.plantRadius ** 2;
    let processed = 0;
    while (this.queueRead < this.queueEnd && processed < VEGETATION_BUDGET.scanPerFrame) {
      const tile = this.queue[this.queueRead++], o = tile * 3, x = c[o], y = c[o + 1], z = c[o + 2]; processed++;
      const distance = Math.max(0, 2 * radius * radius * (1 - x * this.scanX - y * this.scanY - z * this.scanZ));
      if (distance > maxD2) continue;
      if (this.trees.hasTree(tile)) this.treeEntries.push({ tile, distance, params: this.trees.paramsFor(tile) });
      if (distance < plantD2 && !this.columns.editOf(tile) && !isExpeditionInterior(this.terrain.config, x, y, z)) this.discoverPlants(tile, x, y, z, distance);
      for (let i = 0; i < this.geo.degreeOf(tile) && this.queueEnd < this.queue.length; i++) {
        const next = this.geo.neighbor(tile, i);
        if (!this.seen.has(next)) { this.seen.add(next); this.queue[this.queueEnd++] = next; }
      }
      if (processed % 16 === 0 && performance.now() - begin > 1.5) break;
    }
    this.maxDiscoveryMs = Math.max(this.maxDiscoveryMs, performance.now() - begin);
    if (this.queueRead >= this.queueEnd) this.commitScan();
    this.scanSlices++; this.maxSliceMs = Math.max(this.maxSliceMs, performance.now() - begin);
  }

  private discoverPlants(tile: number, x: number, y: number, z: number, distance: number): void {
    const world = this.terrain.aurelia ?? this.terrain.expeditionWorld;
    if (!world || (this.terrain.config.ocean.hasOcean && this.columns.heightOf(tile) < this.terrain.config.waterSurfaceOffset + 0.35) || world.clearingAt(x, y, z) > 0.72) return;
    const moisture = world.moistureAt(x, y, z), forest = world.forestAt(x, y, z), biome = world.biomeAt(x, y, z);
    // A smooth, shared patch phase makes neighboring plants read as a community.
    const patch = (Math.sin(x * 91 + z * 71) * Math.cos(y * 89 - z * 37) + 1) * 0.5;
    const chance = hashInt01(tile ^ this.seed);
    const density = this.terrain.archetype === 'shattered' ? 0.22 : this.terrain.archetype === 'volcanic' ? 0.42 : this.terrain.archetype === 'cryo' ? 0.5 : biome === 'dryland' || this.terrain.archetype === 'canyon' ? 0.5 : 0.78;
    if (chance > density || patch < 0.16) return;
    const ground = this.columns.layers.topRadius(this.columns.topLayerOf(tile));
    // Keep each clump inside its own cap, away from radial step edges.
    let rough = 0;
    for (let i = 0; i < this.geo.degreeOf(tile); i++) rough = Math.max(rough, Math.abs(ground - this.columns.layers.topRadius(this.columns.topLayerOf(this.geo.neighbor(tile, i)))));
    if (rough > 1.875) return;
    const count = patch > 0.55 ? 3 : 2;
    treeTangentFrame(x, y, z, this.frame);
    for (let i = 0; i < count; i++) {
      const random = hashInt01(tile ^ this.seed ^ Math.imul(i + 1, 73856093));
      const a = random * Math.PI * 2, offset = 0.35 + hashInt01(tile + i * 193) * Math.min(1.25, this.terrain.config.radius / this.geo.m * 0.25);
      const dx = x * ground + (this.frame[0] * Math.cos(a) + this.frame[3] * Math.sin(a)) * offset;
      const dy = y * ground + (this.frame[1] * Math.cos(a) + this.frame[4] * Math.sin(a)) * offset;
      const dz = z * ground + (this.frame[2] * Math.cos(a) + this.frame[5] * Math.sin(a)) * offset;
      const inv = 1 / Math.hypot(dx, dy, dz);
      const kind = this.terrain.aurelia ? aureliaPlantModule(biome as AureliaBiome, moisture, forest, patch, random) : expeditionPlantModule(biome as WorldBiome, moisture, patch, random);
      this.plantEntries.push({ tile, distance, kind, x: dx * inv, y: dy * inv, z: dz * inv,
        scale: 0.65 + random * 0.65, yaw: a, tint: 0.9 + hashInt01(tile + i * 619) * 0.18 });
    }
  }

  private commitScan(): void {
    const begin = performance.now();
    for (const batch of this.batches) batch.count = 0;
    this.liveTrees.clear();
    this.treeEntries.sort((a, b) => a.distance - b.distance || a.tile - b.tile);
    this.nearTrees = 0; this.outerTrees = 0;
    const c = this.geo.centers;
    for (const tree of this.treeEntries) {
      if (!this.trees.hasTree(tree.tile)) continue;
      this.simpleTree = tree.distance > VEGETATION_BUDGET.nearRadius ** 2 || this.nearTrees >= VEGETATION_BUDGET.trees;
      if (this.simpleTree && this.outerTrees >= VEGETATION_BUDGET.outerTrees) continue;
      const o = tree.tile * 3, ground = this.columns.layers.topRadius(this.columns.topLayerOf(tree.tile));
      aureliaTreeMatrix(tree.params, c[o], c[o + 1], c[o + 2], ground, this.base);
      this.treeTint = tree.params.tint; this.treeWind = treeWindWeight(tree.params); this.writingTile = tree.tile; visitVegetationTreeParts(tree.params, this.simpleTree, this.emitTree);
      this.liveTrees.set(tree.tile, this.simpleTree);
      if (this.simpleTree) this.outerTrees++; else this.nearTrees++;
    }
    const radius = this.terrain.config.radius;
    for (const plant of this.authoredPlants) {
      plant.distance = Math.max(0, 2 * radius * radius * (1 - plant.x * this.scanX - plant.y * this.scanY - plant.z * this.scanZ));
      if (plant.distance < VEGETATION_BUDGET.plantRadius ** 2 && !this.columns.editOf(plant.tile)) this.plantEntries.push(plant);
    }
    this.plantEntries.sort((a, b) => a.distance - b.distance || a.tile - b.tile);
    this.plantCount = 0;
    for (const plant of this.plantEntries) {
      if (this.plantCount >= VEGETATION_BUDGET.plants) break;
      if (this.columns.editOf(plant.tile)) continue;
      const batch = this.plantBatches.get(plant.kind)!;
      // The last 10m of the resident window shrinks small foliage into the cap.
      const fade = Math.min(1, Math.max(0, (VEGETATION_BUDGET.plantRadius - Math.sqrt(plant.distance)) / 10));
      const ground = this.columns.layers.topRadius(this.columns.topLayerOf(plant.tile));
      this.radialBase(plant.x, plant.y, plant.z, ground + 0.015, plant.yaw, plant.scale * fade);
      batch.setMatrixAt(batch.count, this.base); batch.setColorAt(batch.count, this.color.setScalar(plant.tint));
      this.owners.get(batch)![batch.count] = plant.tile;
      (batch.geometry.getAttribute('windPhase') as THREE.InstancedBufferAttribute).setX(batch.count, plant.yaw);
      (batch.geometry.getAttribute('windWeight') as THREE.InstancedBufferAttribute).setX(batch.count, IMMOBILE_PLANTS.has(plant.kind) ? 0 : 1);
      batch.count++; this.plantCount++;
    }
    for (const batch of this.batches) {
      batch.instanceMatrix.needsUpdate = true; if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      batch.geometry.getAttribute('windPhase').needsUpdate = true;
      batch.geometry.getAttribute('windWeight').needsUpdate = true;
      batch.visible = batch.count > 0;
      batch.boundingSphere = new THREE.Sphere(new THREE.Vector3(this.scanX, this.scanY, this.scanZ).multiplyScalar(radius + 10), VEGETATION_BUDGET.radius + 55);
    }
    this.residentX = this.scanX; this.residentY = this.scanY; this.residentZ = this.scanZ;
    this.residentTiles = this.queueEnd; this.refreshes++; this.scanning = false;
    // Clear rejected candidates: resident memory stays local, rather than retaining
    // every direction ever visited. Authored plant definitions are a small fixed recipe.
    this.treeEntries.length = 0; this.plantEntries.length = 0;
    this.maxCommitMs = Math.max(this.maxCommitMs, performance.now() - begin);
  }

  /** Removal is immediate even while a fresh neighborhood is being sampled.
   * Compact the last live slot into each hole; never submit reserved/zero slots. */
  private pruneRemoved(): void {
    const removed = new Set<number>();
    for (const [tile, simple] of this.liveTrees) if (!this.trees.hasTree(tile)) {
      removed.add(tile); this.liveTrees.delete(tile);
      if (simple) this.outerTrees--; else this.nearTrees--;
    }
    for (const batch of this.batches) {
      const plant = !this.treeBatchSet.has(batch);
      const owners = this.owners.get(batch)!, phase = batch.geometry.getAttribute('windPhase') as THREE.InstancedBufferAttribute;
      const weight = batch.geometry.getAttribute('windWeight') as THREE.InstancedBufferAttribute;
      let changed = false;
      for (let i = 0; i < batch.count;) {
        if (!(plant ? this.columns.editOf(owners[i]) : removed.has(owners[i]))) { i++; continue; }
        const last = --batch.count;
        if (i !== last) {
          (batch.instanceMatrix.array as Float32Array).copyWithin(i * 16, last * 16, last * 16 + 16);
          if (batch.instanceColor) (batch.instanceColor.array as Float32Array).copyWithin(i * 3, last * 3, last * 3 + 3);
          phase.setX(i, phase.getX(last)); weight.setX(i, weight.getX(last)); owners[i] = owners[last];
        }
        if (plant) this.plantCount--;
        changed = true;
      }
      if (changed) {
        batch.instanceMatrix.needsUpdate = true; if (batch.instanceColor) batch.instanceColor.needsUpdate = true; phase.needsUpdate = true; weight.needsUpdate = true;
        batch.visible = batch.count > 0;
      }
    }
    this.prunedChopped = this.trees.chopped.size; this.prunedEdits = this.columns.edits.size;
  }

  update(_dt: number, elapsed: number, player: { px: number; py: number; pz: number }, camera: Position, active = true): void {
    if (this.disposed) return;
    this.active = active && !!(this.terrain.aurelia || this.terrain.expeditionWorld);
    this.group.visible = this.active;
    if (!this.active) return;
    this.group.position.set(-camera.x, -camera.y, -camera.z); this.wind.value = elapsed;
    if (this.prunedChopped !== this.trees.chopped.size || this.prunedEdits !== this.columns.edits.size) this.pruneRemoved();
    const inv = 1 / Math.hypot(player.px, player.py, player.pz), x = player.px * inv, y = player.py * inv, z = player.pz * inv;
    const radius = this.terrain.config.radius;
    const moved = 2 * radius * radius * (1 - x * this.residentX - y * this.residentY - z * this.residentZ);
    const changed = this.stateChopped !== this.trees.chopped.size || this.stateEdits !== this.columns.edits.size || this.stateSeeds !== this.columns.seededEcoTiles.size;
    if (!this.scanning && (this.refreshes === 0 || moved > 12 * 12 || changed)) this.beginScan(player.px, player.py, player.pz);
    if (this.scanning) this.scanSlice();
    for (const landmark of this.landmarks) landmark.mesh.visible = !this.columns.editOf(landmark.tile) && landmark.position.distanceToSquared(this.position.set(player.px, player.py, player.pz)) < 210 * 210;
  }

  stats(): { active: boolean; trees: number; nearTrees: number; outerTrees: number; visiblePlants: number; plants: number; animals: number; geometryCount: number; draws: number; residentTiles: number; pending: boolean; refreshes: number; scanSlices: number; maxSliceMs: number; maxDiscoveryMs: number; maxCommitMs: number; landmarks: number } {
    return { active: this.active, trees: this.nearTrees + this.outerTrees, nearTrees: this.nearTrees, outerTrees: this.outerTrees,
      visiblePlants: this.plantCount, plants: this.plantCount, animals: 0, geometryCount: this.geometries.size,
      draws: this.batches.filter(b => b.count > 0).length, residentTiles: this.residentTiles, pending: this.scanning, refreshes: this.refreshes, scanSlices: this.scanSlices,
      maxSliceMs: this.maxSliceMs, maxDiscoveryMs: this.maxDiscoveryMs, maxCommitMs: this.maxCommitMs, landmarks: this.landmarks.filter(l => l.mesh.visible).length };
  }

  /** Wrap the existing single scene compile/render warmup with this scope. It
   * exposes every material/geometry layout once, then restores resident counts.
   * It does not add a second compile after render (which breaks GL depth copies). */
  prepareWarmup(): () => void {
    const groupVisible = this.group.visible;
    const saved = this.batches.map(mesh => ({ mesh, count: mesh.count, visible: mesh.visible, culled: mesh.frustumCulled }));
    const landmarks = this.landmarks.map(({ mesh }) => ({ mesh, visible: mesh.visible, culled: mesh.frustumCulled }));
    this.group.visible = true;
    for (const { mesh } of saved) { mesh.count = Math.max(1, mesh.count); mesh.visible = true; mesh.frustumCulled = false; }
    for (const { mesh } of landmarks) { mesh.visible = true; mesh.frustumCulled = false; }
    return () => {
      this.group.visible = groupVisible;
      for (const { mesh, count, visible, culled } of saved) { mesh.count = count; mesh.visible = visible; mesh.frustumCulled = culled; }
      for (const { mesh, visible, culled } of landmarks) { mesh.visible = visible; mesh.frustumCulled = culled; }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent();
    for (const batch of this.batches) batch.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.seen.clear(); this.treeEntries.length = 0; this.plantEntries.length = 0;
  }
}
