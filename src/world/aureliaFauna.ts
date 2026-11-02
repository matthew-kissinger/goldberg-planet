/** Aurelia's resident animals. Identity and relationships live here, independently
 * of render pools: leaving a valley never rerolls its herd or resurrects a kill. */
import { Vector3 } from 'three';
import { hashInt01, hashString, mulberry32 } from '../util/prng';
import type { AureliaBiome } from './aurelia';
import type { ItemId } from '../sim/crafting';
import type { PlanetConfig } from './planetConfig';

export type AureliaSpecies = 'mantleback' | 'reedrunner' | 'ridgehook' | 'sailwing' | 'duskprowler' | 'ribbonfin';
export type FaunaBehavior = 'idle' | 'forage' | 'drink' | 'rest' | 'follow' | 'watch' | 'flee' | 'recover' | 'stalk';
export const FAUNA_BUDGET = { residents: 384, active: 24, perSpecies: 8, activeRadius: 135, aiInterval: .25 } as const;
export const AURELIA_SPECIES: Record<AureliaSpecies, {
  name: string; habitats: readonly AureliaBiome[]; description: string; feed: boolean;
  hipHeight: number; length: number; walkSpeed: number; fleeSpeed: number; hp: number;
}> = {
  mantleback: { name: 'Mantleback', habitats: ['meadow', 'woodland'], feed: true,
    description: 'A broad, ivory-mantled grazer. Young follow the oldest member; settled herds crop the grove floor.',
    hipHeight: .83, length: 1.8, walkSpeed: .72, fleeSpeed: 2.4, hp: 4 },
  reedrunner: { name: 'Reedrunner', habitats: ['wetland', 'coast'], feed: false,
    description: 'A long-legged wader with a folded ochre throat fan. It probes damp ground and pauses to watch the shore.',
    hipHeight: 1.05, length: .9, walkSpeed: .68, fleeSpeed: 2.5, hp: 2 },
  ridgehook: { name: 'Ridgehook', habitats: ['highland', 'dryland'], feed: true,
    description: 'A high-shouldered browser with swept hook horns and padded split feet. Family groups keep to the ridges.',
    hipHeight: 1.12, length: 1.45, walkSpeed: .62, fleeSpeed: 2.2, hp: 5 },
  sailwing: { name: 'Sailwing', habitats: ['coast', 'wetland'], feed: false,
    description: 'A broad-winged shore glider with a forked rudder tail. It circles a home shore and folds its sails to rest.',
    hipHeight: .32, length: .85, walkSpeed: 1.5, fleeSpeed: 3.6, hp: 2 },
  duskprowler: { name: 'Duskprowler', habitats: ['woodland', 'highland', 'dryland'], feed: false,
    description: 'A narrow-waisted pack hunter with spade ears and a dark shoulder ruff. It watches before approaching; a strike scatters its pack.',
    hipHeight: .78, length: 1.55, walkSpeed: 1.15, fleeSpeed: 3.2, hp: 6 },
  ribbonfin: { name: 'Ribbonfin', habitats: ['coast', 'wetland'], feed: false,
    description: 'A deep-bodied shoaling fish with long paired fins and a forked amber tail. It holds to the same home shallows.',
    hipHeight: .12, length: 1.15, walkSpeed: .85, fleeSpeed: 2.2, hp: 2 },
};
export interface FaunaSurfaceSample { radius: number; biome: AureliaBiome; tile: number }
export interface FaunaSurface {
  radius: number; waterRadius: number;
  /** Omitted fields preserve the established Aurelia/legacy ecology contract. */
  nativeFauna?: boolean;
  liquidKind?: 'water' | 'magma' | 'none';
  /** Input may be any nonzero sphere-local point; output is reused by the caller. */
  sample(direction: Vector3, out: FaunaSurfaceSample): void;
}
export function faunaEnvironmentFor(config: PlanetConfig): Pick<FaunaSurface, 'nativeFauna' | 'liquidKind'> {
  const rebuilt = config.expeditionRecipe === 'worlds-v3';
  return {
    nativeFauna: !(rebuilt && config.survival.hazard === 'vacuum'),
    liquidKind: !config.ocean.hasOcean ? 'none' : rebuilt && config.ocean.kind === 'magma' ? 'magma' : 'water',
  };
}
export interface FaunaZone { id: string; direction: readonly [number, number, number]; species?: AureliaSpecies }
export interface FaunaPlayer { px: number; py: number; pz: number; vx?: number; vy?: number; vz?: number }
export interface AureliaResident {
  readonly id: string; readonly species: AureliaSpecies; readonly speciesName: string;
  readonly herd: string; readonly home: Vector3; readonly age: number; readonly size: number;
  readonly marking: number; readonly maxHp: number; readonly seed: number;
  readonly position: Vector3; readonly forward: Vector3; readonly headingTarget: Vector3;
  hp: number; tile: number; biome: AureliaBiome; behavior: FaunaBehavior; timer: number;
  phase: number; speed: number; turnRate: number; distance: number; decisions: number; active: boolean;
  familiarity: number; observed: boolean; feedCount: number; feedCooldown: number;
  flight: number;
  attackCooldown: number;
}
export interface FaunaObservation {
  id: string; species: AureliaSpecies; name: string; behavior: FaunaBehavior;
  distance: number; familiarity: number; age: 'young' | 'adult'; description: string;
  canFeed: boolean; observed: boolean;
}
export interface FaunaSave {
  version: 1; seed: string;
  residents: Array<{ id: string; hp: number; familiarity: number; observed: boolean; feedCount: number;
    position: [number, number, number]; forward: [number, number, number]; feedCooldown?: number }>;
}
export interface FaunaStrike {
  hit: boolean; killed: boolean; creature?: AureliaResident;
  drops: Array<{ item: ItemId; count: number }>;
}
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const SPECIES = Object.keys(AURELIA_SPECIES) as AureliaSpecies[];

/** Adds spaced global territories after the authored destinations. Sampling and
 * species choice happen once at construction, never during proximity updates. */
export function faunaZones(sites: readonly FaunaZone[]): FaunaZone[] {
  const zones: FaunaZone[] = sites.map(site => ({ ...site }));
  for (let i = 0; i < 112; i++) {
    const y = 1 - (i + .5) * 2 / 112, r = Math.sqrt(1 - y * y), angle = i * 2.399963229728653;
    zones.push({ id: `territory-${i}`, direction: [Math.cos(angle) * r, y, Math.sin(angle) * r] });
  }
  return zones;
}

export class AureliaFaunaPopulation {
  readonly residents: AureliaResident[] = [];
  readonly active: AureliaResident[] = [];
  private readonly byId = new Map<string, AureliaResident>();
  private readonly candidates: AureliaResident[] = [];
  private readonly sample: FaunaSurfaceSample = { radius: 0, biome: 'meadow', tile: -1 };
  private readonly next = new Vector3();
  private readonly direction = new Vector3();
  private readonly up = new Vector3();
  private readonly right = new Vector3();
  private readonly away = new Vector3();
  private readonly player = new Vector3();
  private aiClock = 0;
  private selectionNeeded = true;
  private selectionCount = 0;
  private decisions = 0;
  private elapsed = 0;
  private damage = 0;

  constructor(readonly seed: string, private readonly surface: FaunaSurface, zones: readonly FaunaZone[]) {
    if (surface.nativeFauna === false) return;
    for (const zone of zones) {
      if (this.residents.length + 3 > FAUNA_BUDGET.residents) break;
      this.up.fromArray(zone.direction).normalize();
      surface.sample(this.up, this.sample);
      const submerged = this.sample.radius < surface.waterRadius - .6;
      const possible = SPECIES.filter(species => (zone.species ? zone.species === species : AURELIA_SPECIES[species].habitats.includes(this.sample.biome))
        && (submerged ? species === 'ribbonfin' : species !== 'ribbonfin') && this.environmentAllows(species,this.sample.radius));
      if (!possible.length) continue;
      const random = mulberry32(hashString(`${seed}:fauna-v1:${zone.id}`));
      const species = possible[Math.floor(random() * possible.length)], spec = AURELIA_SPECIES[species];
      this.right.set(Math.abs(this.up.y) < .9 ? 0 : 1, Math.abs(this.up.y) < .9 ? 1 : 0, 0).cross(this.up).normalize();
      this.direction.crossVectors(this.up, this.right).normalize();
      for (let member = 0; member < 3; member++) {
        const id = `${zone.id}:${species}:${member}`, age = member === 2 ? .32 + random() * .18 : .75 + random() * .25;
        const angle = random() * Math.PI * 2, spread = 2 + member * 2;
        const home = this.up.clone().multiplyScalar(surface.radius)
          .addScaledVector(this.right, Math.cos(angle) * spread).addScaledVector(this.direction, Math.sin(angle) * spread).normalize();
        surface.sample(home, this.sample);
        if (!this.environmentAllows(species,this.sample.radius)) continue;
        if (species === 'ribbonfin' ? this.sample.radius >= surface.waterRadius - .6 : this.sample.radius < surface.waterRadius - .4) continue;
        if (!zone.species && !spec.habitats.includes(this.sample.biome)) continue;
        home.multiplyScalar(species === 'ribbonfin' ? Math.max(this.sample.radius + .4, surface.waterRadius - 1.6) : this.sample.radius);
        const forward = this.right.clone().multiplyScalar(Math.cos(angle)).addScaledVector(this.direction, Math.sin(angle));
        const resident: AureliaResident = {
          id, species, speciesName: spec.name, herd: zone.id, home, age, size: (.62 + .38 * age) * (.94 + random() * .12),
          marking: random(), maxHp: spec.hp, hp: spec.hp, seed: hashString(id + seed), position: home.clone(), forward, headingTarget: forward.clone(),
          tile: this.sample.tile, biome: this.sample.biome, behavior: member === 2 ? 'follow' : 'forage', timer: 2 + random() * 4,
          phase: random(), speed: 0, turnRate: 0, distance: Infinity, decisions: 0, active: false,
          familiarity: 0, observed: false, feedCount: 0, feedCooldown: 0, flight: 0, attackCooldown: 0,
        };
        this.residents.push(resident); this.byId.set(id, resident);
      }
    }
  }

  /** Molten water is never a swimming or wading habitat. Apply the same rule to
   * spawn, movement and saved positions so terrain boundaries remain physical. */
  private environmentAllows(species: AureliaSpecies, groundRadius: number): boolean {
    if (this.surface.nativeFauna === false) return false;
    return this.surface.liquidKind !== 'magma' || (species !== 'ribbonfin' && groundRadius >= this.surface.waterRadius + .2);
  }

  /** No simulation catch-up burst: dormant territories retain their last state.
   * Menus/other worlds call active=false; their timer and relationship state pause. */
  update(dt: number, player: FaunaPlayer, enabled = true): number {
    this.damage = 0;
    if (!enabled) { for (const c of this.active) c.active = false; this.active.length = 0; this.selectionNeeded = true; return 0; }
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    if (Math.hypot(player.px - this.player.x, player.py - this.player.y, player.pz - this.player.z) > 20) this.selectionNeeded = true;
    this.player.set(player.px, player.py, player.pz);
    this.elapsed += dt;
    this.aiClock += dt;
    if (this.selectionNeeded || this.aiClock >= FAUNA_BUDGET.aiInterval) {
      const thinkDt = Math.min(this.aiClock, FAUNA_BUDGET.aiInterval);
      this.select(); this.aiClock %= FAUNA_BUDGET.aiInterval; this.selectionNeeded = false;
      if (dt > 0) for (const c of this.active) this.think(c, thinkDt, player);
    }
    if (dt === 0) return 0;
    for (const c of this.active) {
      c.feedCooldown = Math.max(0, c.feedCooldown - dt);
      c.attackCooldown = Math.max(0, c.attackCooldown - dt);
      if (c.behavior === 'stalk' && c.position.distanceTo(this.player) < 1.9 && c.attackCooldown === 0) {
        this.damage += 6; c.attackCooldown = 2; c.behavior = 'recover'; c.timer = 1;
      }
      this.move(c, dt);
    }
    return this.damage;
  }

  private select(): void {
    this.selectionCount++;
    for (const c of this.active) c.active = false;
    this.active.length = 0; this.candidates.length = 0;
    for (const c of this.residents) {
      c.distance = c.position.distanceTo(this.player);
      if (c.hp > 0 && c.distance < FAUNA_BUDGET.activeRadius) this.candidates.push(c);
    }
    this.candidates.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
    const counts: Record<AureliaSpecies, number> = { mantleback: 0, reedrunner: 0, ridgehook: 0, sailwing: 0, duskprowler: 0, ribbonfin: 0 };
    for (const c of this.candidates) {
      if (this.active.length >= FAUNA_BUDGET.active) break;
      if (counts[c.species] >= FAUNA_BUDGET.perSpecies) continue;
      counts[c.species]++; c.active = true; this.active.push(c);
    }
  }

  private think(c: AureliaResident, dt: number, player: FaunaPlayer): void {
    this.decisions++; c.timer -= dt; c.decisions++;
    c.distance = c.position.distanceTo(this.player);
    const playerSpeed = Math.hypot(player.vx ?? 0, player.vy ?? 0, player.vz ?? 0);
    const alarm = (c.familiarity > .5 ? 2 : 4.5) + (playerSpeed > 3 ? 3 : 0);
    if (c.species === 'duskprowler' && c.distance < 18 && c.behavior !== 'flee' && c.behavior !== 'recover') {
      c.behavior = c.age > .6 ? 'stalk' : 'watch'; c.timer = 1;
    } else if (c.species !== 'duskprowler' && c.distance < alarm && c.feedCooldown < 8) { c.behavior = 'flee'; c.timer = 2.5; }
    else if (c.behavior === 'flee' && c.timer <= 0) { c.behavior = 'recover'; c.timer = 3; }
    else if (c.behavior === 'recover' && c.timer > 0) { /* settle before rejoining */ }
    else if (c.behavior !== 'flee' && c.distance < 13 && c.feedCooldown === 0 && c.familiarity < .5) {
      c.behavior = 'watch'; c.timer = 1;
    } else if (c.timer <= 0) {
      const r = hashInt01(c.seed + c.decisions * 15485863);
      const nearWater = this.surface.liquidKind !== 'magma' && (c.biome === 'wetland' || c.position.length() < this.surface.waterRadius + 2);
      c.behavior = r < .12 ? 'rest' : r < .27 ? 'idle' : r < .4 && nearWater ? 'drink' : 'forage';
      c.timer = c.behavior === 'rest' ? 9 + r * 20 : 3 + r * 7;
      this.up.copy(c.position).normalize();
      c.headingTarget.applyAxisAngle(this.up, (hashInt01(c.seed + c.decisions * 7) - .5) * 1.7);
    }
    if (c.behavior !== 'flee' && c.behavior !== 'watch' && c.behavior !== 'recover' && c.behavior !== 'stalk') {
      const leader = this.residents.find(other => other.herd === c.herd && other.age > c.age && other.hp > 0);
      if (leader && c.position.distanceTo(leader.position) > (c.age < .6 ? 4.5 : 10)) {
        c.behavior = 'follow'; c.timer = .75;
        this.direction.subVectors(leader.position, c.position); this.face(c, this.direction);
      }
    }
    if (c.behavior === 'flee') {
      this.direction.subVectors(c.position, this.player); this.face(c, this.direction);
    } else if (c.behavior === 'watch' || c.behavior === 'stalk') {
      this.direction.subVectors(this.player, c.position); this.face(c, this.direction);
    } else if (c.position.distanceTo(c.home) > 25) {
      this.direction.subVectors(c.home, c.position); this.face(c, this.direction);
    }
  }

  private face(c: AureliaResident, direction: Vector3): void {
    this.up.copy(c.position).normalize();
    direction.addScaledVector(this.up, -direction.dot(this.up));
    if (direction.lengthSq() > .0001) c.headingTarget.copy(direction).normalize();
  }

  private move(c: AureliaResident, dt: number): void {
    const spec = AURELIA_SPECIES[c.species];
    const cruise = c.species === 'sailwing' && c.behavior === 'forage';
    const desired = c.feedCooldown > 13 ? 0 : c.behavior === 'flee' ? spec.fleeSpeed : c.behavior === 'follow' || c.behavior === 'stalk' ? spec.walkSpeed
      : c.behavior === 'forage' ? spec.walkSpeed * (cruise ? 1 : .45) : 0;
    c.speed += (desired - c.speed) * (1 - Math.exp(-dt * 7));
    this.up.copy(c.position).normalize();
    c.forward.addScaledVector(this.up, -c.forward.dot(this.up)).normalize();
    c.headingTarget.addScaledVector(this.up, -c.headingTarget.dot(this.up)).normalize();
    // Lerp followed by normalize flips exactly opposite headings when its
    // factor exceeds .5. Turn continuously in the tangent plane instead; the
    // foot planner can then step through a stalk→flee reversal without being
    // dragged across a body that rotated180 degrees in a single AI tick.
    const angle = Math.acos(clamp(c.forward.dot(c.headingTarget), -1, 1));
    this.right.crossVectors(c.forward, c.headingTarget);
    const signed = this.right.dot(this.up), side = Math.abs(signed) > 1e-8 ? Math.sign(signed) : c.marking > .5 ? 1 : -1;
    const turn = Math.min(angle, dt * (c.behavior === 'flee' ? 2.2 : 1.6)) * side;
    c.forward.applyAxisAngle(this.up, turn); c.turnRate = dt > 0 ? Math.abs(turn) / dt : 0;
    this.next.copy(c.position).addScaledVector(c.forward, c.speed * dt).normalize();
    this.surface.sample(this.next, this.sample);
    const dry = this.sample.radius >= this.surface.waterRadius - (c.species === 'reedrunner' ? .4 : .05);
    const step = this.sample.radius - (c.position.length() - c.flight);
    const allowed = this.environmentAllows(c.species,this.sample.radius) && (c.species === 'ribbonfin' ? this.sample.radius < this.surface.waterRadius - .6 : c.species === 'sailwing' || dry && Math.abs(step) < .7);
    this.away.copy(c.home).normalize();
    if (allowed && this.next.distanceTo(this.away) * this.surface.radius < 55) {
      const flightTarget = c.species === 'sailwing' && (desired > .2 || c.behavior === 'watch')
        ? 2.8 + Math.sin(this.elapsed * .55 + c.marking * 6) * .5 : 0;
      c.flight += (flightTarget - c.flight) * (1 - Math.exp(-dt * 2.5));
      const baseRadius = c.species === 'ribbonfin' ? Math.max(this.sample.radius + .4, this.surface.waterRadius - 1.6)
        : Math.max(this.sample.radius, c.species === 'sailwing' ? this.surface.waterRadius + .25 : -Infinity);
      c.position.copy(this.next).multiplyScalar(baseRadius + c.flight);
      c.tile = this.sample.tile; c.biome = this.sample.biome;
    } else if (c.speed > .02) {
      c.speed = 0; c.headingTarget.applyAxisAngle(this.up, .75);
      if (c.behavior !== 'flee') { c.behavior = 'idle'; c.timer = .5; }
    }
    // Cadence is distance driven, so slowing a foraging animal does not skate it.
    const stride = c.species === 'reedrunner' ? .55 : c.species === 'ridgehook' ? .7 : .62;
    const strideDistance = Math.max(c.speed * dt, Math.abs(turn) * spec.length * .45);
    c.phase = (c.phase + strideDistance / (stride * c.size)) % 1;
  }

  nearbyObservation(player: FaunaPlayer, maxDistance = 18): FaunaObservation | null {
    this.next.set(player.px, player.py, player.pz);
    let best: AureliaResident | undefined, distance = maxDistance;
    for (const c of this.residents) if (c.hp > 0) {
      const d = c.position.distanceTo(this.next);
      if (d < distance) { best = c; distance = d; }
    }
    if (!best) return null;
    const spec = AURELIA_SPECIES[best.species];
    return { id: best.id, species: best.species, name: spec.name, behavior: best.behavior, distance,
      familiarity: best.familiarity, age: best.age < .6 ? 'young' : 'adult', description: spec.description,
      canFeed: spec.feed && distance < 7 && best.feedCooldown <= 0, observed: best.observed };
  }

  observe(id: string): boolean {
    const c = this.byId.get(id);
    if (!c || c.hp <= 0 || c.position.distanceTo(this.player) > 24) return false;
    c.observed = true; return true;
  }
  feed(id: string): { accepted: boolean; reason: string; item: 'fiber' } {
    const c = this.byId.get(id), result = { accepted: false, reason: 'No animal in reach.', item: 'fiber' as const };
    if (!c || c.hp <= 0 || c.position.distanceTo(this.player) > 7) return result;
    if (!AURELIA_SPECIES[c.species].feed) { result.reason = 'Watch this species quietly; it does not eat bundled greens.'; return result; }
    if (c.feedCooldown > 0) { result.reason = 'Give it time to finish the greens.'; return result; }
    c.feedCount++; c.feedCooldown = 20; c.familiarity = Math.min(1, c.familiarity + .35);
    c.observed = true; c.behavior = 'forage'; c.timer = 7; c.speed = 0;
    return { accepted: true, reason: `${c.speciesName} accepts the greens.`, item: 'fiber' };
  }

  pickRay(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, maxDistance = 8): AureliaResident | null {
    this.next.set(origin.x, origin.y, origin.z); this.direction.set(direction.x, direction.y, direction.z).normalize();
    let nearest = maxDistance, found: AureliaResident | null = null;
    for (const c of this.active) {
      if (c.hp <= 0) continue;
      this.up.copy(c.position).normalize();
      this.away.copy(c.position).addScaledVector(this.up, AURELIA_SPECIES[c.species].hipHeight * c.size * .85).sub(this.next);
      const along = this.away.dot(this.direction);
      const radius = AURELIA_SPECIES[c.species].length * c.size * .55;
      if (along < 0 || along > nearest || this.away.lengthSq() - along * along > radius * radius) continue;
      nearest = along; found = c;
    }
    return found;
  }
  strikeNearest(px: number, py: number, pz: number, dx: number, dy: number, dz: number, damage = 1, range = 8): FaunaStrike {
    const c = this.pickRay({ x: px, y: py, z: pz }, { x: dx, y: dy, z: dz }, range);
    if (!c || !Number.isFinite(damage) || damage <= 0) return { hit: false, killed: false, drops: [] };
    c.hp = Math.max(0, c.hp - damage); c.behavior = 'flee'; c.timer = 5; c.familiarity = 0;
    for (const member of this.residents) if (member.herd === c.herd && member.hp > 0) { member.behavior = 'flee'; member.timer = 5; }
    const killed = c.hp === 0;
    if (killed) this.selectionNeeded = true;
    return { hit: true, killed, creature: c, drops: killed ? [
      { item: 'raw_meat', count: 2 }, { item: 'hide', count: 1 }, { item: 'bone', count: 1 },
    ] : [] };
  }

  exportState(): FaunaSave {
    return { version: 1, seed: this.seed, residents: this.residents.map(c => ({ id: c.id, hp: c.hp,
      familiarity: c.familiarity, observed: c.observed, feedCount: c.feedCount,
      feedCooldown: c.feedCooldown,
      position: c.position.toArray() as [number, number, number], forward: c.forward.toArray() as [number, number, number] })) };
  }
  importState(state: unknown): boolean {
    if (!state || typeof state !== 'object') return false;
    const save = state as Partial<FaunaSave>;
    if (save.version !== 1 || save.seed !== this.seed || !Array.isArray(save.residents)) return false;
    for (const entry of save.residents.slice(0, FAUNA_BUDGET.residents)) {
      if (!entry || typeof entry !== 'object') continue;
      const c = this.byId.get(entry.id);
      if (!c) continue;
      if (Number.isFinite(entry.hp)) c.hp = clamp(entry.hp, 0, c.maxHp);
      if (Number.isFinite(entry.familiarity)) c.familiarity = clamp(entry.familiarity, 0, 1);
      c.observed = entry.observed === true;
      if (Number.isFinite(entry.feedCount)) c.feedCount = Math.floor(clamp(entry.feedCount, 0, 1000));
      if (Number.isFinite(entry.feedCooldown)) c.feedCooldown = clamp(entry.feedCooldown!, 0, 20);
      if (Array.isArray(entry.position) && entry.position.length === 3 && entry.position.every(Number.isFinite)) {
        this.next.fromArray(entry.position);
        let allowed = this.next.distanceTo(c.home) < 65;
        if (allowed && this.surface.liquidKind === 'magma') {
          this.surface.sample(this.next,this.sample);
          allowed = this.environmentAllows(c.species,this.sample.radius) && this.next.length() >= this.surface.waterRadius + .2;
        }
        if (allowed) c.position.copy(this.next);
      }
      if (Array.isArray(entry.forward) && entry.forward.length === 3 && entry.forward.every(Number.isFinite)) {
        this.next.fromArray(entry.forward);
        if (this.next.lengthSq() > .01) c.forward.copy(this.next).normalize();
      }
      c.headingTarget.copy(c.forward);
    }
    this.selectionNeeded = true; return true;
  }
  stats(): { residents: number; alive: number; active: number; observed: number; befriended: number; aiDecisions: number; selections: number } {
    return { residents: this.residents.length, alive: this.residents.filter(c => c.hp > 0).length,
      active: this.active.length, observed: this.residents.filter(c => c.observed).length,
      befriended: this.residents.filter(c => c.familiarity >= .5).length, aiDecisions: this.decisions, selections: this.selectionCount };
  }
}
