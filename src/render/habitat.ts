/** Resident Aurelia art: shared opaque geometry, spatially culled understory,
 * authored tree clusters with the same IDs as chopping, and a small local herd.
 * Geometry and instance storage are allocated at construction, never per frame.
 */
import * as THREE from 'three';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Trees } from '../world/trees';
import {
  HABITAT_EAST, HABITAT_FORWARD, HABITAT_UP, HABITAT_LANDMARK,
  habitatX, habitatZ,
  type ExpeditionHabitat, type HabitatPlant, type HabitatTree,
} from '../world/expeditionHabitat';

interface PlantBatch {
  mesh: THREE.InstancedMesh; x: number; z: number; range: number;
  tiles: Int32Array; live: Uint8Array; originalMatrices: Float32Array;
}
interface Grazer { x: number; z: number; homeX: number; homeZ: number; yaw: number; phase: number; state: 'graze' | 'watch' | 'retreat'; scale: number }
type Position = { x: number; y: number; z: number };
const WOOD_PER_TREE = 8, LEAVES_PER_TREE = 9, PARTS_PER_ANIMAL = 24;
const SEEDED_TREE_SLOTS = 128;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Folded solid leaves; opaque surfaces have no alpha-test overdraw or back-face dependency. */
function plantGeometry(kind: HabitatPlant['kind']): THREE.BufferGeometry {
  const positions: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => positions.push(...a, ...b, ...c);
  const leaf = (a: number[], b: number[], width: number, angle: number) => {
    const mx = (a[0] + b[0]) * 0.5, my = (a[1] + b[1]) * 0.5, mz = (a[2] + b[2]) * 0.5;
    const l = [mx + Math.cos(angle) * width, my - 0.035, mz + Math.sin(angle) * width];
    const r = [mx - Math.cos(angle) * width, my - 0.035, mz - Math.sin(angle) * width];
    const ridge = [mx, my + 0.07, mz];
    tri(a, l, ridge); tri(l, b, ridge); tri(b, r, ridge); tri(r, a, ridge);
    tri(a, b, l); tri(a, r, b);
  };
  if (kind === 'fern') {
    for (let f = 0; f < 6; f++) {
      const angle = f * Math.PI / 3, dx = Math.cos(angle), dz = Math.sin(angle);
      for (let j = 1; j <= 6; j++) {
        const t = j / 7, reach = 1.08 * t, h = Math.sin(t * Math.PI * 0.8) * 0.55;
        const a = [dx * reach, h, dz * reach];
        const span = (1 - t) * 0.32 + 0.05;
        for (const side of [-1, 1]) {
          const b = [dx * (reach + 0.13) - dz * span * side, h - 0.08, dz * (reach + 0.13) + dx * span * side];
          leaf(a, b, 0.075 * (1 - t * 0.5), angle);
        }
      }
    }
  } else if (kind === 'flower') {
    for (let f = 0; f < 3; f++) {
      const ox = Math.cos(f * 2.4) * 0.16, oz = Math.sin(f * 2.4) * 0.16, h = 0.4 + f * 0.11;
      for (let p = 0; p < 5; p++) {
        const angle = p * Math.PI * 0.4;
        leaf([ox, h, oz], [ox + Math.cos(angle) * 0.19, h + 0.015, oz + Math.sin(angle) * 0.19], 0.075, angle + Math.PI * 0.5);
      }
    }
  } else {
    const count = kind === 'reed' ? 6 : 9;
    for (let b = 0; b < count; b++) {
      const angle = b * 2.39996, reach = kind === 'reed' ? 0.24 : 0.42;
      const h = (kind === 'reed' ? 1.1 : 0.58) * (0.65 + (b % 3) * 0.17);
      leaf([0, 0, 0], [Math.cos(angle) * reach, h, Math.sin(angle) * reach], kind === 'reed' ? 0.045 : 0.065, angle + Math.PI * 0.5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

export class HabitatRenderer {
  readonly group = new THREE.Group();
  private readonly wood: THREE.InstancedMesh;
  private readonly leaves: THREE.InstancedMesh;
  private readonly animals: THREE.InstancedMesh;
  private readonly horns: THREE.InstancedMesh;
  private readonly animalGroup = new THREE.Group();
  private readonly batches: PlantBatch[] = [];
  private readonly treeLive: Uint8Array;
  private readonly treeSlots: Array<HabitatTree | null>;
  private readonly seededCandidates: Array<{ tree: HabitatTree; distance: number }> = [];
  private readonly seededTiles = new Set<number>();
  private seededTimer = 0;
  private readonly herd: Grazer[];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly materialByColor = new Map<number, THREE.MeshStandardMaterial>();
  private readonly base = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly yawQuaternion = new THREE.Quaternion();
  private readonly boneDirection = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private visiblePlants = 0;
  private active = false;

  constructor(
    scene: THREE.Scene,
    private readonly geo: Goldberg,
    private readonly columns: Columns,
    private readonly trees: Trees,
    private readonly recipe: ExpeditionHabitat,
  ) {
    this.group.name = 'Aurelia shoreline and grove';
    this.group.add(this.animalGroup);
    scene.add(this.group);
    const trunk = new THREE.CylinderGeometry(0.72, 1, 1, 7, 1);
    const crown = new THREE.IcosahedronGeometry(1, 1);
    const animal = new THREE.IcosahedronGeometry(1, 1);
    const horn = new THREE.ConeGeometry(1, 1, 5);
    for (const geometry of [trunk, crown, animal, horn]) this.geometries.add(geometry);
    const treeCapacity = recipe.trees.length + SEEDED_TREE_SLOTS;
    this.wood = this.instances(trunk, 0x665446, treeCapacity * WOOD_PER_TREE, true);
    this.leaves = this.instances(crown, 0xffffff, treeCapacity * LEAVES_PER_TREE, true);
    this.group.add(this.wood, this.leaves);
    this.treeSlots = new Array<HabitatTree | null>(treeCapacity).fill(null);
    for (let i = 0; i < recipe.trees.length; i++) this.treeSlots[i] = recipe.trees[i];
    this.treeLive = new Uint8Array(treeCapacity);
    for (let i = 0; i < recipe.trees.length; i++) this.writeTree(i, trees.hasTree(recipe.trees[i].tile));
    this.wood.count = recipe.trees.length * WOOD_PER_TREE;
    this.leaves.count = recipe.trees.length * LEAVES_PER_TREE;
    // Fixed region bounds ignore dormant zero-scale slots, and cover all nearby seed trees.
    const center = new THREE.Vector3(...HABITAT_UP).multiplyScalar(columns.layers.planetRadius);
    this.wood.boundingSphere = new THREE.Sphere(center, 235);
    this.leaves.boundingSphere = this.wood.boundingSphere.clone();
    this.buildUnderstory();
    this.buildLandmark(crown);
    this.herd = [
      { x: -18, z: 23, homeX: -18, homeZ: 23, yaw: 0.8, phase: 0, state: 'graze', scale: 1 },
      { x: -26, z: 31, homeX: -26, homeZ: 31, yaw: -0.9, phase: 2.4, state: 'graze', scale: 0.88 },
      { x: -20, z: 38, homeX: -20, homeZ: 38, yaw: 1.9, phase: 4.7, state: 'graze', scale: 0.65 },
    ];
    this.animals = this.instances(animal, 0xffffff, this.herd.length * PARTS_PER_ANIMAL, true);
    this.horns = this.instances(horn, 0xd8cbb0, this.herd.length * 4, true);
    this.animals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.horns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The herd stays within a 25m meadow; rebuilding an aggregate bound each frame is unnecessary.
    this.animals.frustumCulled = false; this.horns.frustumCulled = false;
    this.animalGroup.add(this.animals, this.horns);
    this.updateAnimals(0, 0, Infinity, Infinity);
  }

  private instances(geometry: THREE.BufferGeometry, color: number, count: number, shadows: boolean): THREE.InstancedMesh {
    let material = this.materialByColor.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0 });
      this.materialByColor.set(color, material); this.materials.add(material);
    }
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    return mesh;
  }

  /** Places local Y along radial up, and +Z along the expedition route. */
  private setBase(x: number, z: number, yaw = 0, size = 1, knownTile?: number): void {
    const radius = this.columns.layers.planetRadius;
    this.up.set(
      HABITAT_UP[0] * radius + HABITAT_EAST[0] * x + HABITAT_FORWARD[0] * z,
      HABITAT_UP[1] * radius + HABITAT_FORWARD[1] * z,
      HABITAT_UP[2] * radius + HABITAT_EAST[2] * x + HABITAT_FORWARD[2] * z,
    ).normalize();
    const tile = knownTile ?? this.geo.tileOf(this.up.x, this.up.y, this.up.z);
    const groundLayer = this.columns.editOf(tile)
      ? this.columns.groundLayerBelow(tile, this.columns.layers.buildCeiling)
      : this.columns.topLayerOf(tile);
    const ground = this.columns.layers.topRadius(groundLayer);
    this.position.copy(this.up).multiplyScalar(ground + 0.025);
    // Transport the chart heading onto this tile's tangent plane; preserve a right-handed basis.
    this.boneDirection.set(...HABITAT_FORWARD);
    this.boneDirection.addScaledVector(this.up, -this.up.dot(this.boneDirection)).normalize();
    const fx = this.boneDirection.x, fy = this.boneDirection.y, fz = this.boneDirection.z;
    const ux = this.up.x, uy = this.up.y, uz = this.up.z;
    this.local.set(uy * fz - uz * fy, ux, fx, 0, uz * fx - ux * fz, uy, fy, 0, ux * fy - uy * fx, uz, fz, 0, 0, 0, 0, 1);
    this.quaternion.setFromRotationMatrix(this.local);
    this.yawQuaternion.setFromAxisAngle(Y_AXIS, yaw);
    this.quaternion.multiply(this.yawQuaternion);
    this.scale.setScalar(size);
    this.base.compose(this.position, this.quaternion, this.scale);
  }

  private part(mesh: THREE.InstancedMesh, id: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, color?: number): void {
    this.position.set(x, y, z); this.scale.set(sx, sy, sz); this.quaternion.identity();
    this.local.compose(this.position, this.quaternion, this.scale);
    this.matrix.multiplyMatrices(this.base, this.local);
    mesh.setMatrixAt(id, this.matrix);
    if (color !== undefined) mesh.setColorAt(id, this.color.setHex(color));
  }

  private branch(mesh: THREE.InstancedMesh, id: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number): void {
    this.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    this.boneDirection.set(bx - ax, by - ay, bz - az);
    const length = this.boneDirection.length();
    this.quaternion.setFromUnitVectors(Y_AXIS, this.boneDirection.multiplyScalar(1 / length));
    this.scale.set(width, length, width);
    this.local.compose(this.position, this.quaternion, this.scale);
    this.matrix.multiplyMatrices(this.base, this.local); mesh.setMatrixAt(id, this.matrix);
  }

  private writeTree(index: number, live: boolean): void {
    this.treeLive[index] = Number(live);
    const w = index * WOOD_PER_TREE, l = index * LEAVES_PER_TREE;
    if (!live) {
      for (let i = 0; i < WOOD_PER_TREE; i++) this.wood.setMatrixAt(w + i, this.zero);
      for (let i = 0; i < LEAVES_PER_TREE; i++) this.leaves.setMatrixAt(l + i, this.zero);
    } else {
      const tree = this.treeSlots[index]!;
      this.setBase(tree.x, tree.z, tree.yaw, tree.scale, tree.tile);
      this.branch(this.wood, w, 0, 0, 0, 0.15, 2.5, 0.1, 0.51);
      this.branch(this.wood, w + 1, 0.15, 2.3, 0.1, 0.45, 4.3, -0.1, 0.36);
      this.branch(this.wood, w + 2, 0.45, 4.1, -0.1, 0.1, 5.7, 0.3, 0.24);
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 0.4 + 0.2;
        this.branch(this.wood, w + 3 + i, 0.25, 3.2 + (i % 2) * 0.4, 0, Math.cos(a) * 3.1, 5.1 + (i % 2) * 0.55, Math.sin(a) * 3.1, 0.17);
      }
      const palette = tree.community === 'shore' ? [0x839d59, 0x96ac62, 0x6e914f] : [0x5e8650, 0x789a59, 0x8aa764];
      this.part(this.leaves, l, 0, 6.3, 0, 3.1, 1.5, 2.9, palette[1]);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI * 0.25;
        this.part(this.leaves, l + 1 + i, Math.cos(a) * 2.9, 5.65 + (i % 3) * 0.35, Math.sin(a) * 2.8, 2.25, 1.05 + (i % 2) * 0.22, 2.1, palette[i % 3]);
      }
    }
    this.wood.instanceMatrix.needsUpdate = true; this.leaves.instanceMatrix.needsUpdate = true;
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
  }

  private buildUnderstory(): void {
    const batches = new Map<string, HabitatPlant[]>();
    for (const plant of this.recipe.plants) {
      const key = `${plant.kind}:${Math.floor(plant.x / 48)}:${Math.floor(plant.z / 48)}`;
      let plants = batches.get(key);
      if (!plants) { plants = []; batches.set(key, plants); }
      plants.push(plant);
    }
    const geometryByKind = new Map<HabitatPlant['kind'], THREE.BufferGeometry>();
    const colors = { fern: 0x5e8b50, grass: 0x90a55c, reed: 0x829d76, flower: 0xf1e7bd };
    const ranges = { fern: 92, grass: 75, reed: 100, flower: 65 };
    for (const plants of batches.values()) {
      const kind = plants[0].kind;
      let geometry = geometryByKind.get(kind);
      if (!geometry) { geometry = plantGeometry(kind); geometryByKind.set(kind, geometry); this.geometries.add(geometry); }
      const mesh = this.instances(geometry, colors[kind], plants.length, false);
      const tiles = new Int32Array(plants.length), live = new Uint8Array(plants.length).fill(1);
      let x = 0, z = 0;
      for (let i = 0; i < plants.length; i++) {
        const p = plants[i]; this.setBase(p.x, p.z, p.yaw, p.scale);
        tiles[i] = this.geo.tileOf(this.up.x, this.up.y, this.up.z);
        mesh.setMatrixAt(i, this.base); x += p.x; z += p.z;
      }
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.batches.push({ mesh, x: x / plants.length, z: z / plants.length, range: ranges[kind], tiles, live, originalMatrices: (mesh.instanceMatrix.array as Float32Array).slice() });
    }
  }

  private buildLandmark(rock: THREE.BufferGeometry): void {
    // A weathered coastal arch, visible across the meadow, frames the next stretch of shore.
    const arch = this.instances(rock, 0xd4ccb0, 11, true);
    this.setBase(HABITAT_LANDMARK.x, HABITAT_LANDMARK.z, -0.12);
    for (let side = 0; side < 2; side++) {
      const sign = side ? 1 : -1;
      for (let i = 0; i < 4; i++) this.part(arch, side * 4 + i, sign * (4.4 - i * 0.24), 1.3 + i * 2.0, 0.1 * i, 1.7 - i * 0.12, 1.6, 1.35);
    }
    this.part(arch, 8, -2.35, 8.2, 0.35, 2.3, 1.4, 1.5);
    this.part(arch, 9, 2.35, 8.2, 0.35, 2.3, 1.4, 1.5);
    this.part(arch, 10, 0, 8.9, 0.3, 2.6, 1.3, 1.55);
    arch.computeBoundingSphere(); this.group.add(arch);
  }

  private updateAnimals(dt: number, elapsed: number, px: number, pz: number): void {
    for (let i = 0; i < this.herd.length; i++) {
      const a = this.herd[i], dx = a.x - px, dz = a.z - pz, distance = Math.hypot(dx, dz);
      a.state = distance < 5 ? 'retreat' : distance < 12 ? 'watch' : 'graze';
      let speed = 0;
      if (a.state === 'retreat') {
        const safeDistance = Math.max(0.01, distance);
        a.x += dx / safeDistance * dt * 1.4; a.z += dz / safeDistance * dt * 1.4;
        a.yaw = Math.atan2(dx, dz); speed = 1;
      } else if (a.state === 'watch') a.yaw = Math.atan2(-dx, -dz);
      else {
        // Slow feeding drift follows a bounded home patch, never a new random target every frame.
        const tx = a.homeX + Math.sin(elapsed * 0.07 + a.phase) * 3;
        const tz = a.homeZ + Math.cos(elapsed * 0.06 + a.phase) * 3;
        const vx = tx - a.x, vz = tz - a.z;
        if (Math.hypot(vx, vz) > 0.8) {
          a.yaw = Math.atan2(vx, vz); a.x += Math.sin(a.yaw) * dt * 0.22; a.z += Math.cos(a.yaw) * dt * 0.22; speed = 0.25;
        }
      }
      const homeDistance = Math.hypot(a.x - a.homeX, a.z - a.homeZ);
      if (homeDistance > 8) { a.x = a.homeX + (a.x - a.homeX) / homeDistance * 8; a.z = a.homeZ + (a.z - a.homeZ) / homeDistance * 8; }
      this.setBase(a.x, a.z, a.yaw, a.scale);
      const n = i * PARTS_PER_ANIMAL, graze = a.state === 'graze' ? (Math.sin(elapsed * 0.55 + a.phase) * 0.5 + 0.5) : 0;
      const body = 0xb6ba99, dark = 0x596e62, cream = 0xd8d4b6;
      this.part(this.animals, n, 0, 1.15, 0, 0.52, 0.60, 0.98, body);
      this.part(this.animals, n + 1, 0, 1.47, -0.14, 0.43, 0.32, 0.82, dark);
      this.part(this.animals, n + 2, 0, 1.48 - graze * 0.42, 0.78, 0.27, 0.54, 0.31, body);
      this.part(this.animals, n + 3, 0, 1.88 - graze * 0.95, 1.12 + graze * 0.22, 0.27, 0.3, 0.43, cream);
      this.part(this.animals, n + 4, 0, 1.72 - graze * 0.95, 1.48 + graze * 0.22, 0.21, 0.17, 0.22, dark);
      this.part(this.animals, n + 5, -0.37, 2.0 - graze * 0.95, 1.04 + graze * 0.22, 0.28, 0.08, 0.13, body);
      this.part(this.animals, n + 6, 0.37, 2.0 - graze * 0.95, 1.04 + graze * 0.22, 0.28, 0.08, 0.13, body);
      this.part(this.animals, n + 7, 0, 1.28, -1.05, 0.10, 0.12, 0.37, dark);
      for (let leg = 0; leg < 4; leg++) {
        const x = leg % 2 ? 0.33 : -0.33, z = leg < 2 ? 0.59 : -0.59;
        const step = Math.sin(elapsed * (speed > 0.5 ? 8 : 3.4) + a.phase + (leg === 0 || leg === 3 ? 0 : Math.PI)) * speed * 0.24;
        this.part(this.animals, n + 8 + leg * 3, x, 0.66, z + step * 0.5, 0.12, 0.34, 0.15, body);
        this.part(this.animals, n + 9 + leg * 3, x, 0.27 + Math.max(0, step) * 0.25, z + step, 0.08, 0.24, 0.09, dark);
        this.part(this.animals, n + 10 + leg * 3, x, 0.065 + Math.max(0, step) * 0.25, z + step + 0.035, 0.11, 0.07, 0.15, dark);
      }
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1;
        this.part(this.animals, n + 20 + side, sign * 0.25, 1.93 - graze * 0.95, 1.26 + graze * 0.22, 0.04, 0.05, 0.055, 0x253b37);
        this.part(this.animals, n + 22 + side, sign * 0.27, 1.96 - graze * 0.95, 1.24 + graze * 0.22, 0.065, 0.025, 0.11, cream);
        this.part(this.horns, i * 4 + side * 2, sign * 0.20, 2.30 - graze * 0.95, 0.98 + graze * 0.22, 0.12, 0.65, 0.10);
        this.part(this.horns, i * 4 + side * 2 + 1, sign * 0.33, 2.42 - graze * 0.95, 0.93 + graze * 0.22, 0.07, 0.34, 0.07);
      }
    }
    this.animals.instanceMatrix.needsUpdate = true; this.horns.instanceMatrix.needsUpdate = true;
    if (this.animals.instanceColor) this.animals.instanceColor.needsUpdate = true;
  }

  private refreshSeededTrees(x: number, z: number): void {
    let changed = this.seededTiles.size !== this.columns.seededEcoTiles.size;
    if (!changed) for (const tile of this.columns.seededEcoTiles) if (!this.seededTiles.has(tile)) { changed = true; break; }
    if (changed) {
      this.seededTiles.clear();
      this.seededCandidates.length = 0;
      for (const tile of this.columns.seededEcoTiles) {
        this.seededTiles.add(tile);
        if (this.recipe.treeByTile.has(tile)) continue;
        const tree = this.trees.habitatTreeFor(tile);
        if (tree) this.seededCandidates.push({ tree, distance: 0 });
      }
    }
    for (const candidate of this.seededCandidates) {
      const dx = candidate.tree.x - x, dz = candidate.tree.z - z;
      candidate.distance = this.trees.hasTree(candidate.tree.tile) ? dx * dx + dz * dz : Infinity;
    }
    this.seededCandidates.sort((a, b) => a.distance - b.distance || a.tree.tile - b.tree.tile);
    let count = 0;
    for (; count < SEEDED_TREE_SLOTS && count < this.seededCandidates.length; count++) {
      const candidate = this.seededCandidates[count];
      if (candidate.distance > 105 * 105) break;
      const slot = this.recipe.trees.length + count;
      if (this.treeSlots[slot]?.tile !== candidate.tree.tile) {
        this.treeSlots[slot] = candidate.tree;
        this.writeTree(slot, true);
      }
    }
    for (let i = this.recipe.trees.length + count; i < this.treeSlots.length; i++) {
      if (this.treeSlots[i] !== null) { this.treeSlots[i] = null; this.writeTree(i, false); }
    }
    // Spare storage is not drawn. Dense planting retains the nearest 128 trees;
    // interaction-range trees have priority over the distant visual population.
    this.wood.count = (this.recipe.trees.length + count) * WOOD_PER_TREE;
    this.leaves.count = (this.recipe.trees.length + count) * LEAVES_PER_TREE;
  }

  update(dt: number, elapsed: number, player: { px: number; py: number; pz: number }, camera: Position, active = true): void {
    const radius = Math.hypot(player.px, player.py, player.pz) || 1;
    const x = habitatX(player.px / radius, player.py / radius, player.pz / radius, this.columns.layers.planetRadius);
    const z = habitatZ(player.px / radius, player.py / radius, player.pz / radius, this.columns.layers.planetRadius);
    this.active = active && x * x + z * z < 380 * 380 && radius - this.columns.layers.planetRadius < 300;
    this.group.visible = this.active;
    if (!this.active) return;
    this.group.position.set(-camera.x, -camera.y, -camera.z);
    this.seededTimer -= dt;
    if (this.seededTimer <= 0) { this.seededTimer = 0.25; this.refreshSeededTrees(x, z); }
    this.visiblePlants = 0;
    for (const batch of this.batches) {
      const dx = x - batch.x, dz = z - batch.z;
      batch.mesh.visible = dx * dx + dz * dz < batch.range * batch.range;
      if (batch.mesh.visible) {
        for (let i = 0; i < batch.tiles.length; i++) {
          const live = Number(!this.columns.editOf(batch.tiles[i]));
          if (batch.live[i] !== live) {
            batch.live[i] = live;
            batch.mesh.setMatrixAt(i, live ? this.matrix.fromArray(batch.originalMatrices, i * 16) : this.zero);
            batch.mesh.instanceMatrix.needsUpdate = true;
          }
          this.visiblePlants += live;
        }
      }
    }
    for (let i = 0; i < this.treeSlots.length; i++) {
      const tree = this.treeSlots[i];
      if (!tree) continue;
      const live = this.trees.hasTree(tree.tile);
      if (Number(live) !== this.treeLive[i]) this.writeTree(i, live);
    }
    this.animalGroup.visible = (x + 22) ** 2 + (z - 30) ** 2 < 150 * 150;
    if (this.animalGroup.visible) this.updateAnimals(Math.min(dt, 0.05), elapsed, x, z);
  }

  stats(): { active: boolean; trees: number; plants: number; visiblePlants: number; animals: number; animalStates: string[]; geometryCount: number } {
    let live = 0; for (const value of this.treeLive) live += value;
    return { active: this.active, trees: live, plants: this.recipe.plants.length, visiblePlants: this.active ? this.visiblePlants : 0, animals: this.herd.length, animalStates: this.herd.map(a => a.state), geometryCount: this.geometries.size };
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.batches.length = 0;
  }
}
