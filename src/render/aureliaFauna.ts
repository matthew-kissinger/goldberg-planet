/** Shared fauna for every world. Fixed render slots hold authored modular forms;
 * residency, ecology, relationships and kills survive outside those slots. */
import * as THREE from 'three';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Terrain } from '../world/terrain';
import { aureliaSites } from '../world/aurelia';
import { worldSites } from '../world/expeditionWorlds';
import { habitatDirection } from '../world/expeditionHabitat';
import {
  AURELIA_SPECIES, FAUNA_BUDGET, AureliaFaunaPopulation, faunaZones, faunaEnvironmentFor,
  type AureliaResident, type FaunaPlayer, type FaunaSurface, type FaunaSurfaceSample, type FaunaZone,
} from '../world/aureliaFauna';
import { acquireFaunaKit, releaseFaunaKit, FAUNA_RECIPES, type FaunaKit, type FaunaRecipe } from './faunaKit';

interface Foot {
  planted: boolean; initialized: boolean; previousPhase: number;
  anchor: THREE.Vector3; from: THREE.Vector3; target: THREE.Vector3;
  hip: THREE.Vector3; knee: THREE.Vector3; ankle: THREE.Vector3; normal: THREE.Vector3;
  error: number;
}
interface Slot {
  resident: AureliaResident | null; feet: Foot[]; matrix: THREE.Matrix4;
  poseClock: number; previousPosition: THREE.Vector3;
}
interface SpeciesPool {
  recipe: FaunaRecipe; slots: Slot[];
  meshes: THREE.InstancedMesh[];
  body: THREE.InstancedMesh; head: THREE.InstancedMesh; tail: THREE.InstancedMesh;
  upper?: THREE.InstancedMesh; lower?: THREE.InstancedMesh; foot?: THREE.InstancedMesh; wing?: THREE.InstancedMesh;
}
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const HALF_TURN = new THREE.Quaternion().setFromAxisAngle(Z, Math.PI), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Direct analytic joint construction. Returns the achieved ankle, including
 * reach clamping, so QA measures real contact error rather than desired targets. */
export function solveFaunaLeg(hip: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3,
  upper: number, lower: number, knee: THREE.Vector3, ankle: THREE.Vector3,
  direction = new THREE.Vector3(), bend = new THREE.Vector3()): number {
  direction.subVectors(target, hip);
  const distance = direction.length();
  if (distance < 1e-6) direction.set(0, -1, 0); else direction.multiplyScalar(1 / distance);
  const reach = clamp(distance, Math.abs(upper - lower) + .0001, upper + lower - .0001);
  bend.copy(pole).addScaledVector(direction, -pole.dot(direction));
  if (bend.lengthSq() < 1e-8) {
    bend.set(Math.abs(direction.x) > .8 ? 0 : 1, Math.abs(direction.x) > .8 ? 1 : 0, 0);
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  bend.normalize();
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  knee.copy(hip).addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
  ankle.copy(hip).addScaledVector(direction, reach);
  return ankle.distanceTo(target);
}

export class AureliaFauna {
  readonly group = new THREE.Group();
  readonly population: AureliaFaunaPopulation;
  private readonly kit: FaunaKit;
  private readonly pools: SpeciesPool[] = [];
  private readonly surface: FaunaSurface;
  private readonly sample: FaunaSurfaceSample = { radius: 0, biome: 'meadow', tile: -1 };
  private readonly up = new THREE.Vector3(); private readonly right = new THREE.Vector3();
  private readonly forward = new THREE.Vector3(); private readonly back = new THREE.Vector3();
  private readonly position = new THREE.Vector3(); private readonly target = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(); private readonly direction = new THREE.Vector3(); private readonly bend = new THREE.Vector3();
  private readonly pole = new THREE.Vector3(); private readonly center = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion(); private readonly rotation = new THREE.Quaternion();
  private readonly basis = new THREE.Matrix4(); private readonly local = new THREE.Matrix4(); private readonly matrix = new THREE.Matrix4();
  private readonly tint = new THREE.Color();
  private elapsed = 0; private poseUpdates = 0; private disposed = false; private contactQueries = 0;

  constructor(scene: THREE.Scene, geo: Goldberg, columns: Columns, terrain: Terrain, options?: { zones?: readonly FaunaZone[] }) {
    this.group.name = `${terrain.config.name} resident fauna`;
    this.kit = acquireFaunaKit();
    const unit = new THREE.Vector3();
    this.surface = {
      radius: columns.layers.planetRadius,
      waterRadius: terrain.config.ocean.hasOcean ? columns.layers.waterSurface : -Infinity,
      ...faunaEnvironmentFor(terrain.config),
      sample(direction, out) {
        unit.copy(direction).normalize();
        out.tile = geo.tileOf(unit.x, unit.y, unit.z);
        out.radius = columns.layers.topRadius(columns.topLayerOf(out.tile));
        if (terrain.aurelia) out.biome = terrain.aurelia.biomeAt(unit.x, unit.y, unit.z);
        else {
          const height = out.radius - columns.layers.planetRadius, moisture = terrain.moistureAt(unit.x, unit.y, unit.z);
          out.biome = height < terrain.config.waterSurfaceOffset + 3 && terrain.config.ocean.hasOcean ? 'coast' : height > 42 ? 'highland'
            : moisture > .74 ? 'wetland' : terrain.forestAt(unit.x, unit.y, unit.z) > .52 ? 'woodland'
              : moisture < .34 ? 'dryland' : 'meadow';
        }
      },
    };
    const sites: FaunaZone[] = (terrain.aurelia ? aureliaSites(terrain.config) : worldSites(terrain.config))
      .map(site => ({ id: site.id, direction: site.direction }));
    // The first encounters are composed beside the arrival trail, away from the
    // camp itself. Every other territory is generated by the same habitat rules.
    if (terrain.aurelia) sites.unshift(
      { id: 'camp-grazers', direction: habitatDirection(-25, -17, terrain.config.radius), species: 'mantleback' },
      { id: 'camp-waders', direction: habitatDirection(25, -7, terrain.config.radius), species: 'reedrunner' },
      { id: 'shore-sails', direction: habitatDirection(26, 48, terrain.config.radius), species: 'sailwing' },
      { id: 'grove-grazers', direction: habitatDirection(-35, 78, terrain.config.radius), species: 'mantleback' },
    );
    else if (!options?.zones && !terrain.expeditionWorld) {
      const arrival = new THREE.Vector3().fromArray(geo.centers, 0), east = new THREE.Vector3(0, 1, 0).cross(arrival);
      if (east.lengthSq() < .01) east.set(1, 0, 0); else east.normalize();
      const north = new THREE.Vector3().crossVectors(arrival, east).normalize();
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5;
        const d = arrival.clone().multiplyScalar(terrain.config.radius)
          .addScaledVector(east, Math.cos(angle) * 35).addScaledVector(north, Math.sin(angle) * 35).normalize();
        sites.push({ id: `arrival-range-${i}`, direction: d.toArray() as [number, number, number] });
      }
    }
    this.population = new AureliaFaunaPopulation(terrain.seed, this.surface, options?.zones ?? faunaZones(sites));
    if (this.population.residents.length) for (const recipe of Object.values(FAUNA_RECIPES)) this.pools.push(this.pool(recipe));
    scene.add(this.group);
  }

  private instances(geometry: THREE.BufferGeometry, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, this.kit.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.visible = false;
    for (let i = 0; i < capacity; i++) { mesh.setMatrixAt(i, ZERO); mesh.setColorAt(i, this.tint.set(0xffffff)); }
    this.group.add(mesh); return mesh;
  }
  private pool(recipe: FaunaRecipe): SpeciesPool {
    const parts = this.kit.species[recipe.species], capacity = FAUNA_BUDGET.perSpecies;
    const pool: SpeciesPool = { recipe, meshes: [],
      body: this.instances(parts.body, capacity), head: this.instances(parts.head, capacity), tail: this.instances(parts.tail, capacity),
      slots: Array.from({ length: capacity }, () => ({ resident: null, matrix: new THREE.Matrix4(), poseClock: 0, previousPosition: new THREE.Vector3(),
        feet: recipe.legs.map(() => ({ planted: false, initialized: false, previousPhase: 0, error: 0,
          anchor: new THREE.Vector3(), from: new THREE.Vector3(), target: new THREE.Vector3(), hip: new THREE.Vector3(),
          knee: new THREE.Vector3(), ankle: new THREE.Vector3(), normal: new THREE.Vector3() })) })),
    };
    if (recipe.legs.length) {
      pool.upper = this.instances(this.kit.limb, capacity * recipe.legs.length);
      pool.lower = this.instances(this.kit.limb, capacity * recipe.legs.length);
      pool.foot = this.instances(this.kit.foot, capacity * recipe.legs.length);
    }
    if (parts.wing) pool.wing = this.instances(parts.wing, capacity * 2);
    pool.meshes = [pool.body, pool.head, pool.tail, pool.upper, pool.lower, pool.foot, pool.wing].filter((m): m is THREE.InstancedMesh => !!m);
    return pool;
  }

  /** Returns predator damage; caller applies survival/creative rules. */
  update(dt: number, elapsed: number, player: FaunaPlayer, camWorld: { x: number; y: number; z: number }, active = true): number {
    if (this.disposed) return 0;
    const damage = this.population.update(dt, player, active);
    this.elapsed = elapsed; this.group.visible = active;
    this.group.position.set(-camWorld.x, -camWorld.y, -camWorld.z);
    if (!active) return damage;
    this.contactQueries = 0;
    for (const pool of this.pools) {
      // Release slots without deleting residents or rebuilding shared resources.
      for (let slot = 0; slot < pool.slots.length; slot++) {
        const state = pool.slots[slot];
        if (state.resident && (!state.resident.active || state.resident.hp <= 0)) {
          state.resident = null; this.hide(pool, slot);
        }
      }
      for (const c of this.population.active) if (c.species === pool.recipe.species && !pool.slots.some(slot => slot.resident === c)) {
        const state = pool.slots.find(slot => !slot.resident);
        if (state) {
          state.resident = c; state.poseClock = 1; state.previousPosition.copy(c.position);
          for (const foot of state.feet) { foot.initialized = false; foot.planted = false; }
        }
      }
      const visible = pool.slots.some(slot => !!slot.resident);
      for (const part of this.meshes(pool)) part.visible = visible;
      for (let slot = 0; slot < pool.slots.length; slot++) {
        const state = pool.slots[slot], c = state.resident;
        if (!c) continue;
        state.poseClock += dt;
        // Near contacts run with rendering; distant silhouettes update at 10Hz.
        if (c.distance > 45 && state.poseClock < .1) continue;
        if (dt === 0 && state.poseClock < .1) continue;
        this.pose(pool, state, slot); state.poseClock = 0; this.poseUpdates++;
      }
      if (visible) for (const part of this.meshes(pool)) { part.instanceMatrix.needsUpdate = true; if (part.instanceColor) part.instanceColor.needsUpdate = true; }
    }
    return damage;
  }

  private meshes(pool: SpeciesPool): THREE.InstancedMesh[] {
    return pool.meshes;
  }
  private hide(pool: SpeciesPool, slot: number): void {
    pool.body.setMatrixAt(slot, ZERO); pool.head.setMatrixAt(slot, ZERO); pool.tail.setMatrixAt(slot, ZERO);
    for (let leg = 0; leg < pool.recipe.legs.length; leg++) {
      const index = slot * pool.recipe.legs.length + leg;
      pool.upper?.setMatrixAt(index, ZERO); pool.lower?.setMatrixAt(index, ZERO); pool.foot?.setMatrixAt(index, ZERO);
    }
    pool.wing?.setMatrixAt(slot * 2, ZERO); pool.wing?.setMatrixAt(slot * 2 + 1, ZERO);
  }

  private root(c: AureliaResident, out: THREE.Matrix4, drop = 0): void {
    this.up.copy(c.position).normalize(); this.forward.copy(c.forward).addScaledVector(this.up, -c.forward.dot(this.up)).normalize();
    this.back.copy(this.forward).negate(); this.right.crossVectors(this.up, this.back).normalize();
    out.makeBasis(this.right, this.up, this.back); out.scale(this.scale.setScalar(c.size));
    this.position.copy(c.position).addScaledVector(this.up, -drop); out.setPosition(this.position);
  }
  private support(point: THREE.Vector3, out: THREE.Vector3, soleHeight: number): void {
    this.surface.sample(point, this.sample); this.contactQueries++;
    out.copy(point).normalize().multiplyScalar(this.sample.radius + soleHeight);
  }
  private pose(pool: SpeciesPool, state: Slot, slot: number): void {
    const c = state.resident!, recipe = pool.recipe;
    if (state.previousPosition.distanceTo(c.position) > 2) for (const f of state.feet) f.initialized = false;
    this.root(c, state.matrix);
    const moving = c.speed > .035 || c.turnRate > .1, resting = c.behavior === 'rest';
    let pelvisDrop = resting ? .23 * c.size : 0;
    for (let i = 0; i < state.feet.length; i++) {
      const foot = state.feet[i], leg = recipe.legs[i], phase = (c.phase + leg.phase) % 1;
      const stance = !moving || phase < .56;
      const landing = moving ? recipe.stride * .28 : 0;
      this.target.set(leg.hip[0], 0, leg.hip[2] - landing).applyMatrix4(state.matrix);
      this.support(this.target, this.target, leg.foot[1] * c.size * .5);
      if (!foot.initialized || stance && !foot.planted || stance && phase < foot.previousPhase) {
        foot.anchor.copy(this.target); foot.from.copy(this.target); foot.initialized = true;
      }
      if (stance) foot.target.copy(foot.anchor);
      else {
        if (foot.planted) foot.from.copy(foot.anchor);
        const t = clamp((phase - .56) / .44, 0, 1), smooth = t * t * (3 - 2 * t);
        foot.target.lerpVectors(foot.from, this.target, smooth);
        // Lift over a whole local surface discontinuity, not just a sine rotation.
        const rise = Math.max(0, this.target.length() - foot.from.length());
        foot.target.addScaledVector(this.up, Math.sin(t * Math.PI) * (recipe.clearance * c.size + rise * .5));
      }
      foot.planted = stance; foot.previousPhase = phase;
      foot.hip.fromArray(leg.hip).applyMatrix4(state.matrix);
      this.direction.subVectors(foot.hip, foot.target);
      const vertical = this.direction.dot(this.up), horizontal2 = Math.max(0, this.direction.lengthSq() - vertical * vertical);
      const reach = (leg.upper + leg.lower - .015) * c.size;
      const needed = vertical - Math.sqrt(Math.max(0, reach * reach - horizontal2));
      pelvisDrop = Math.max(pelvisDrop, Math.min(leg.hip[1] * .62 * c.size, needed));
    }
    this.root(c, state.matrix, pelvisDrop);
    const breathing = 1 + Math.sin(this.elapsed * 1.6 + c.marking * 4) * .006;
    this.local.makeScale(1, breathing, 1); this.matrix.multiplyMatrices(state.matrix, this.local); pool.body.setMatrixAt(slot, this.matrix);
    const headDown = c.behavior === 'forage' ? .6 : c.behavior === 'drink' ? .9 : resting ? .25 : c.behavior === 'watch' ? -.12 : 0;
    this.rotation.setFromAxisAngle(X, -headDown + Math.sin(this.elapsed * .9 + c.marking * 5) * .035);
    this.local.compose(this.position.fromArray(recipe.head), this.rotation, this.scale.setScalar(1));
    this.matrix.multiplyMatrices(state.matrix, this.local); pool.head.setMatrixAt(slot, this.matrix);
    const tailSway = Math.sin(this.elapsed * (recipe.bodyPlan === 'fish' ? 5 : 1.4) + c.phase * Math.PI * 2) * (recipe.bodyPlan === 'fish' ? .35 : .13);
    this.rotation.setFromAxisAngle(Y, tailSway); this.local.compose(this.position.fromArray(recipe.tail), this.rotation, this.scale.setScalar(1));
    this.matrix.multiplyMatrices(state.matrix, this.local); pool.tail.setMatrixAt(slot, this.matrix);
    const shade = .93 + c.marking * .14; this.tint.setRGB(shade, shade, shade * (.97 + .03 * c.marking));
    pool.body.setColorAt(slot, this.tint); pool.head.setColorAt(slot, this.tint); pool.tail.setColorAt(slot, this.tint);
    for (let i = 0; i < state.feet.length; i++) {
      const foot = state.feet[i], leg = recipe.legs[i], index = slot * recipe.legs.length + i;
      foot.hip.fromArray(leg.hip).applyMatrix4(state.matrix);
      this.pole.copy(this.forward).multiplyScalar(leg.bend);
      foot.error = solveFaunaLeg(foot.hip, foot.target, this.pole, leg.upper * c.size, leg.lower * c.size, foot.knee, foot.ankle, this.direction, this.bend);
      this.segment(pool.upper!, index, foot.hip, foot.knee, leg.radius * c.size);
      this.segment(pool.lower!, index, foot.knee, foot.ankle, leg.radius * c.size * .69);
      foot.normal.copy(foot.target).normalize(); this.back.copy(this.forward).negate(); this.right.crossVectors(foot.normal, this.back).normalize();
      this.back.crossVectors(this.right, foot.normal).normalize(); this.basis.makeBasis(this.right, foot.normal, this.back);
      this.basis.scale(this.scale.fromArray(leg.foot).multiplyScalar(c.size)); this.basis.setPosition(foot.ankle); pool.foot!.setMatrixAt(index, this.basis);
      this.tint.set(recipe.palette.coat); pool.upper!.setColorAt(index, this.tint);
      this.tint.set(recipe.palette.dark); pool.lower!.setColorAt(index, this.tint); pool.foot!.setColorAt(index, this.tint);
    }
    if (pool.wing) for (const side of [-1, 1]) {
      const fish = recipe.bodyPlan === 'fish';
      const flap = fish ? .18 * Math.sin(this.elapsed * 3 + c.marking * 5)
        : c.flight > .3 ? .14 + Math.sin(this.elapsed * 3.4 + c.marking * 4) * .3 : 1.15;
      this.position.set(side * (fish ? .13 : .14), fish ? .12 : .38, fish ? -.05 : -.02);
      this.rotation.setFromAxisAngle(Z, side * flap); this.scale.set(side, 1, 1);
      // Negative determinants invert normals. Mirror the right wing by rotating
      // it around Z, preserving a positive transform for opaque culling.
      if (side < 0) { this.rotation.multiply(HALF_TURN); this.scale.set(1, 1, 1); }
      this.local.compose(this.position, this.rotation, this.scale); this.matrix.multiplyMatrices(state.matrix, this.local);
      pool.wing.setMatrixAt(slot * 2 + (side + 1) / 2, this.matrix); pool.wing.setColorAt(slot * 2 + (side + 1) / 2, this.tint.set(0xffffff));
    }
    state.previousPosition.copy(c.position);
  }
  private segment(mesh: THREE.InstancedMesh, index: number, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
    this.direction.subVectors(b, a); const length = this.direction.length();
    this.quaternion.setFromUnitVectors(Y, this.direction.multiplyScalar(1 / Math.max(length, .0001)));
    this.center.addVectors(a, b).multiplyScalar(.5); this.scale.set(radius, length, radius);
    this.matrix.compose(this.center, this.quaternion, this.scale); mesh.setMatrixAt(index, this.matrix);
  }

  nearbyObservation(player: FaunaPlayer, maxDistance = 18) { return this.population.nearbyObservation(player, maxDistance); }
  observe(id: string): boolean { return this.population.observe(id); }
  feed(id: string) { return this.population.feed(id); }
  exportState() { return this.population.exportState(); }
  importState(state: unknown): boolean { return this.population.importState(state); }
  pickRay(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, distance = 8) { return this.population.pickRay(origin, direction, distance); }
  strikeNearest(px: number, py: number, pz: number, dx: number, dy: number, dz: number, damage = 1, range = 8) {
    return this.population.strikeNearest(px, py, pz, dx, dy, dz, damage, range);
  }
  stats() {
    let occupied = 0, planted = 0, maxContactError = 0, draws = 0;
    for (const pool of this.pools) {
      if (pool.body.visible) draws += this.meshes(pool).length;
      for (const slot of pool.slots) if (slot.resident) {
        occupied++;
        for (const foot of slot.feet) if (foot.planted) { planted++; maxContactError = Math.max(maxContactError, foot.error); }
      }
    }
    return { ...this.population.stats(), pooledSlots: this.pools.length * FAUNA_BUDGET.perSpecies,
      occupied, draws: this.group.visible ? draws : 0, planted, maxContactError, contactQueries: this.contactQueries,
      poseUpdates: this.poseUpdates, species: Object.keys(AURELIA_SPECIES).length, art: 'modular-fauna-v1' };
  }
  /** Diagnostic snapshots only: never called from the frame loop. */
  contacts() {
    return this.pools.flatMap(pool => pool.slots.filter(slot => !!slot.resident).flatMap(slot => slot.feet.map((foot, leg) => ({
      id: slot.resident!.id, species: slot.resident!.species, leg, planted: foot.planted,
      anchor: foot.anchor.toArray(), endpoint: foot.ankle.toArray(), error: foot.error,
    }))));
  }
  /** Expose shared geometry/program variants to the existing covered startup
   * compile+render. This deliberately does not issue another renderer compile. */
  prepareWarmup(): () => void {
    const groupVisible = this.group.visible;
    const parts = this.pools.flatMap(pool => pool.meshes), visibility = parts.map(mesh => mesh.visible);
    this.group.visible = true;
    for (const mesh of parts) mesh.visible = true;
    return () => {
      this.group.visible = groupVisible;
      for (let i = 0; i < parts.length; i++) parts[i].visible = visibility[i];
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent();
    for (const pool of this.pools) for (const mesh of this.meshes(pool)) mesh.dispose();
    this.group.clear(); releaseFaunaKit();
  }
}
