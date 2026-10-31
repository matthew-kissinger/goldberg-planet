/**
 * Player simulation in f64 planet-centered coordinates.
 *
 * "Up" is always the local radial direction — the sphere's surface normal — so orientation
 * follows the ground everywhere, pentagons included; there is no world up anywhere in here.
 *
 * Movement states:
 *  - walk: gravity scaled by planet config, jump with space, boosted on the 12 Pentagon Wonders
 *  - plane: atmospheric contour flight below `karmanAGL`, transitioning seamlessly into
 *    3D Interplanetary Space Cruise (`inSpaceCruise`) above `karmanAGL` so the player can
 *    fly between planets in the solar system
 *  - swim: buoyancy floats the player at the surface of the sea
 *  - fly: free-flight (F), kept for inspection/debugging
 */

import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import type { Goldberg } from '../geo/goldberg';

export type MoveMode = 'walk' | 'fly' | 'plane';

const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.8;
const STEP_UP = 1.35;
const DEFAULT_GRAVITY = 14;
const JUMP_V = 7.4;
const WALK_SPEED = 5.5;
const SPRINT_SPEED = 9.5;
const FLY_ACCEL = 55;
const FLY_DRAG = 2.1;
const FLY_BOOST = 3.2;
const MAX_FALL = 55;

export const PLANE_MIN = 16;
export const PLANE_MAX = 88;
export const SPACE_CRUISE_MAX = 460;
const PLANE_START = 42;
const PLANE_THROTTLE_RATE = 24;
const PLANE_CHASE = 1.6;
const PLANE_STEER = 2.6;
const PLANE_BOOST = 1.4;
const PLANE_LOOKAHEAD_S = 1.5;
const PLANE_AGL_MIN = 6;
const PLANE_AGL_MAX = 1500;

export interface PlayerInput {
  forward: number;
  strafe: number;
  upDown: number;
  sprint: boolean;
  jump: boolean;
  swimUp: boolean;
}

export class Player {
  // f64 planet-frame state
  px = 0; py = 0; pz = 0;          // feet position
  vx = 0; vy = 0; vz = 0;
  fwdX = 1; fwdY = 0; fwdZ = 0;    // transported tangent heading
  pitch = 0;
  mode: MoveMode = 'walk';
  grounded = false;
  submerged = 0;                   // meters of body below the liquid surface
  bank = 0;                        // smoothed roll for the character model
  private bankTarget = 0;
  tile = 0;
  // plane & interplanetary state
  planeSpeed = 0;
  throttle = PLANE_START;
  holdAGL = 30;                    // terrain-follow altitude the plane maintains when level
  inSpaceCruise = false;           // true when above karmanAGL in interplanetary flight
  hasOrbitalThruster = false;      // unlocked via crafting to boost interplanetary speed
  onPentagonWonder = false;        // true when standing/flying over one of the 12 Pentagon Wonders
  /** set for one frame when the plane stows itself (ground/water/wall contact) */
  planeStowed = false;
  stepSmooth = 0;

  // survival state
  health = 100;
  maxHealth = 100;
  hunger = 85;
  maxHunger = 100;
  suitShield = 100;
  maxSuitShield = 100;
  suitTier = 0;
  inSafeAura = false;

  constructor(
    private readonly geo: Goldberg,
    private layers: Layers,
    private columns: Columns,
  ) {}

  /** Switch local planet physics reference during Sphere of Influence (SOI) handoff. */
  rebindPlanet(layers: Layers, columns: Columns): void {
    this.layers = layers;
    this.columns = columns;
    this.tile = this.geo.tileOf(this.px, this.py, this.pz);
    this.reorthonormalize();
  }

  spawnAt(tileId: number): void {
    const c = this.geo.centers;
    const x = c[tileId * 3], y = c[tileId * 3 + 1], z = c[tileId * 3 + 2];
    const ground = this.layers.topRadius(this.columns.groundLayerBelow(tileId, this.layers.bounds[0]));
    this.px = x * (ground + 0.05);
    this.py = y * (ground + 0.05);
    this.pz = z * (ground + 0.05);
    this.tile = tileId;
    const f = this.geo.frameOf(tileId);
    this.fwdX = f.east[0]; this.fwdY = f.east[1]; this.fwdZ = f.east[2];
  }

  radius(): number { return Math.hypot(this.px, this.py, this.pz); }

  up(): [number, number, number] {
    const r = this.radius() || 1;
    return [this.px / r, this.py / r, this.pz / r];
  }

  /** altitude above local ground surface (AGL) */
  altitudeAGL(): number {
    const r = this.radius();
    const k = this.columns.groundLayerBelow(this.tile, Math.min(r, this.layers.bounds[0] - 0.1));
    return r - this.layers.topRadius(k);
  }

  eye(): [number, number, number] {
    const [ux, uy, uz] = this.up();
    const h = EYE_HEIGHT - this.stepSmooth;
    return [this.px + ux * h, this.py + uy * h, this.pz + uz * h];
  }

  /** 3D nose direction vector combining tangent heading `fwd` and `pitch`. */
  aimDirection(): [number, number, number] {
    const [ux, uy, uz] = this.up();
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    return [
      this.fwdX * cosP + ux * sinP,
      this.fwdY * cosP + uy * sinP,
      this.fwdZ * cosP + uz * sinP,
    ];
  }

  applyLook(dx: number, dy: number): void {
    const yaw = -dx * 0.0023;
    const [ux, uy, uz] = this.up();
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const dot = this.fwdX * ux + this.fwdY * uy + this.fwdZ * uz;
    const crx = uy * this.fwdZ - uz * this.fwdY;
    const cry = uz * this.fwdX - ux * this.fwdZ;
    const crz = ux * this.fwdY - uy * this.fwdX;
    this.fwdX = this.fwdX * cos + crx * sin + ux * dot * (1 - cos);
    this.fwdY = this.fwdY * cos + cry * sin + uy * dot * (1 - cos);
    this.fwdZ = this.fwdZ * cos + crz * sin + uz * dot * (1 - cos);
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.0023));
    this.reorthonormalize();
  }

  /** keep heading tangent to the sphere as position changes (parallel transport step) */
  reorthonormalize(): void {
    const [ux, uy, uz] = this.up();
    const d = this.fwdX * ux + this.fwdY * uy + this.fwdZ * uz;
    let fx = this.fwdX - d * ux, fy = this.fwdY - d * uy, fz = this.fwdZ - d * uz;
    const l = Math.hypot(fx, fy, fz);
    if (l < 1e-9) {
      const ax = Math.abs(ux) < 0.9 ? 1 : 0, ay = Math.abs(ux) < 0.9 ? 0 : 1;
      fx = uy * 0 - uz * ay; fy = uz * ax - ux * 0; fz = ux * ay - uy * ax;
      const l2 = Math.hypot(fx, fy, fz);
      fx /= l2; fy /= l2; fz /= l2;
    } else {
      fx /= l; fy /= l; fz /= l;
    }
    this.fwdX = fx; this.fwdY = fy; this.fwdZ = fz;
  }

  toggleFly(): void {
    this.mode = this.mode === 'fly' ? 'walk' : 'fly';
    if (this.mode === 'fly') {
      const [ux, uy, uz] = this.up();
      this.vx += ux * 3; this.vy += uy * 3; this.vz += uz * 3;
      this.grounded = false;
    } else {
      this.inSpaceCruise = false;
    }
  }

  /** board the plane: hop into the air and spool up. Returns false if swimming. */
  enterPlane(): boolean {
    if (this.submerged > 0.3) return false;
    this.mode = 'plane';
    this.grounded = false;
    this.pitch = Math.max(-0.25, Math.min(0.45, this.pitch));
    const [ux, uy, uz] = this.up();
    const v = Math.hypot(this.vx, this.vy, this.vz);
    this.planeSpeed = Math.max(v, PLANE_MIN + 6);
    this.throttle = Math.max(this.throttle, PLANE_START);
    this.holdAGL = Math.max(PLANE_AGL_MIN + 8, Math.min(120, this.altitudeAGL() + 10));
    this.vx = this.fwdX * this.planeSpeed * 0.6 + ux * 6;
    this.vy = this.fwdY * this.planeSpeed * 0.6 + uy * 6;
    this.vz = this.fwdZ * this.planeSpeed * 0.6 + uz * 6;
    return true;
  }

  /** Consume cooked or raw food to restore Hunger and trigger Well-Fed health regeneration. */
  eatFood(hungerRestore = 35, instantHeal = 12): void {
    this.hunger = Math.min(this.maxHunger, this.hunger + hungerRestore);
    this.health = Math.min(this.maxHealth, this.health + instantHeal);
  }

  /** Apply combat or hazard damage to Health. */
  takeDamage(amount: number): void {
    if (amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      // Recover at camp / spawn with 80% health and hunger
      this.health = 80;
      this.hunger = 80;
    }
  }

  /** stow the plane (E again, or automatic on contact) */
  exitPlane(): void {
    if (this.mode === 'plane') {
      this.mode = 'walk';
      this.inSpaceCruise = false;
    }
  }

  /** column-top surface radius (terrain + edits) under a unit direction */
  private surfaceRadiusAt(dx: number, dy: number, dz: number): number {
    const tile = this.geo.tileOf(dx, dy, dz);
    return this.layers.topRadius(this.columns.groundLayerBelow(tile, this.layers.bounds[0]));
  }

  update(dt: number, input: PlayerInput): void {
    const [ux, uy, uz] = this.up();
    this.reorthonormalize();
    const fx = this.fwdX, fy = this.fwdY, fz = this.fwdZ;
    const rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
    const r0 = this.radius();
    const waterSurface = this.layers.waterSurface;
    const cfg = this.columns.terrain.config;
    const gravity = cfg.gravity ?? DEFAULT_GRAVITY;
    const karmanAGL = cfg.karmanAGL ?? 280;

    this.submerged = cfg.ocean.hasOcean ? Math.max(0, waterSurface - r0) : 0;
    this.planeStowed = false;
    this.stepSmooth *= Math.exp(-16 * dt);
    if (this.stepSmooth < 0.01) this.stepSmooth = 0;

    // Evaluate Pentagon Wonder thermal/harmonic updraft
    const wonder = this.columns.pentagonWonderOf(this.tile);
    this.onPentagonWonder = wonder.ringLevel >= 0;

    // Update environmental survival shield
    const surv = cfg.survival;
    if (this.inSafeAura || this.suitTier >= surv.requiredSuitTier || surv.hazardDrainPerSec <= 0) {
      this.suitShield = Math.min(this.maxSuitShield, this.suitShield + 16 * dt);
    } else {
      this.suitShield = Math.max(0, this.suitShield - surv.hazardDrainPerSec * dt);
    }

    // Update Hunger & Well-Fed / Campfire Health Regeneration
    const hungerDrain = this.mode === 'walk' ? (input.sprint ? 0.32 : 0.14) : 0.08;
    this.hunger = Math.max(0, this.hunger - hungerDrain * dt);
    if (this.hunger >= 70 || this.inSafeAura) {
      const regenRate = this.inSafeAura ? 5.0 : 2.4;
      this.health = Math.min(this.maxHealth, this.health + regenRate * dt);
    } else if (this.hunger <= 0 || this.suitShield <= 0) {
      this.health = Math.max(10, this.health - 1.5 * dt);
    }

    const agl = this.altitudeAGL();

    if (this.mode === 'plane') {
      // Check transition between atmospheric contour flight and 3D Interplanetary Space Cruise
      if (!this.inSpaceCruise && agl > karmanAGL) {
        this.inSpaceCruise = true;
      } else if (this.inSpaceCruise && agl < karmanAGL * 0.78) {
        this.inSpaceCruise = false;
        this.holdAGL = Math.max(PLANE_AGL_MIN + 12, Math.min(karmanAGL * 0.75, agl));
      }

      if (this.inSpaceCruise) {
        // --- 3D Interplanetary Space Cruise: fly along 3D nose vector between worlds ---
        const maxCruise = this.hasOrbitalThruster ? SPACE_CRUISE_MAX * 1.45 : SPACE_CRUISE_MAX;
        this.throttle += input.forward * PLANE_THROTTLE_RATE * 4.5 * dt;
        this.throttle = Math.max(PLANE_START, Math.min(maxCruise, this.throttle));
        const boostMult = input.sprint ? (this.hasOrbitalThruster ? 1.85 : 1.45) : 1.0;
        const targetSpeed = this.throttle * boostMult;
        this.planeSpeed += (targetSpeed - this.planeSpeed) * Math.min(1, 2.4 * dt);

        const [aimX, aimY, aimZ] = this.aimDirection();
        const steerBlend = Math.min(1, 3.2 * dt);
        this.vx += (aimX * this.planeSpeed + ux * input.upDown * 45 - this.vx) * steerBlend;
        this.vy += (aimY * this.planeSpeed + uy * input.upDown * 45 - this.vy) * steerBlend;
        this.vz += (aimZ * this.planeSpeed + uz * input.upDown * 45 - this.vz) * steerBlend;
        this.bankTarget = Math.max(-0.65, Math.min(0.65, -input.strafe * 0.45));
      } else {
        // --- Atmospheric Contour Flight ---
        this.throttle += input.forward * PLANE_THROTTLE_RATE * dt;
        this.throttle = Math.max(PLANE_MIN, Math.min(PLANE_MAX, this.throttle));
        const targetSpeed = this.throttle * (input.sprint ? PLANE_BOOST : 1);
        this.planeSpeed += (targetSpeed - this.planeSpeed) * Math.min(1, PLANE_CHASE * dt);

        let climb = Math.sin(this.pitch);
        climb = Math.abs(climb) < 0.055 ? 0 : climb - Math.sign(climb) * 0.055;
        climb += input.upDown * 0.5;
        this.holdAGL += climb * this.planeSpeed * 1.15 * dt;
        if (wonder.updraftAccel > 0 && agl < karmanAGL) {
          this.holdAGL += wonder.updraftAccel * 0.65 * dt;
        }
        this.holdAGL = Math.max(PLANE_AGL_MIN, Math.min(PLANE_AGL_MAX, this.holdAGL));

        const gHere = this.surfaceRadiusAt(ux, uy, uz);
        let vtx = this.vx - (this.vx * ux + this.vy * uy + this.vz * uz) * ux;
        let vty = this.vy - (this.vx * ux + this.vy * uy + this.vz * uz) * uy;
        let vtz = this.vz - (this.vx * ux + this.vy * uy + this.vz * uz) * uz;
        const vtl = Math.hypot(vtx, vty, vtz);
        if (vtl > 1) {
          const sinT = ((vty * fz - vtz * fy) * ux + (vtz * fx - vtx * fz) * uy + (vtx * fy - vty * fx) * uz) / vtl;
          this.bankTarget = Math.max(-0.85, Math.min(0.85, sinT * 1.5));
        } else {
          this.bankTarget = 0;
        }
        let gAhead = gHere;
        if (vtl > 1) {
          const lx = this.px + (vtx / vtl) * vtl * PLANE_LOOKAHEAD_S;
          const ly = this.py + (vty / vtl) * vtl * PLANE_LOOKAHEAD_S;
          const lz = this.pz + (vtz / vtl) * vtl * PLANE_LOOKAHEAD_S;
          const ll = Math.hypot(lx, ly, lz) || 1;
          gAhead = this.surfaceRadiusAt(lx / ll, ly / ll, lz / ll);
        }
        const floor = cfg.ocean.hasOcean ? Math.max(gHere, gAhead, waterSurface) : Math.max(gHere, gAhead);
        const targetR = floor + this.holdAGL;
        let vr = this.vx * ux + this.vy * uy + this.vz * uz;
        const vrTarget = Math.max(-0.6 * this.planeSpeed, Math.min(0.8 * this.planeSpeed, (targetR - r0) * 1.1));
        vr += (vrTarget - vr) * Math.min(1, 2.8 * dt);

        const blend = Math.min(1, PLANE_STEER * dt);
        vtx += (fx * this.planeSpeed - vtx) * blend;
        vty += (fy * this.planeSpeed - vty) * blend;
        vtz += (fz * this.planeSpeed - vtz) * blend;
        this.vx = vtx + vr * ux; this.vy = vty + vr * uy; this.vz = vtz + vr * uz;
      }
    } else if (this.mode === 'walk') {
      this.inSpaceCruise = false;
      const speed = (input.sprint ? SPRINT_SPEED : WALK_SPEED) * (this.submerged > 0.6 ? 0.5 : 1);
      const wx = (fx * input.forward + rx * input.strafe);
      const wy = (fy * input.forward + ry * input.strafe);
      const wz = (fz * input.forward + rz * input.strafe);
      const wl = Math.hypot(wx, wy, wz);
      const twx = wl > 1e-6 ? (wx / wl) * speed : 0;
      const twy = wl > 1e-6 ? (wy / wl) * speed : 0;
      const twz = wl > 1e-6 ? (wz / wl) * speed : 0;
      let vr = this.vx * ux + this.vy * uy + this.vz * uz;
      let tx2 = this.vx - vr * ux, ty2 = this.vy - vr * uy, tz2 = this.vz - vr * uz;
      const blend = Math.min(1, (this.grounded ? 14 : 3.5) * dt);
      tx2 += (twx - tx2) * blend; ty2 += (twy - ty2) * blend; tz2 += (twz - tz2) * blend;
      vr -= gravity * dt;
      if (!this.grounded && wonder.updraftAccel > 0 && agl < 45) {
        vr += wonder.updraftAccel * 0.35 * dt;
      }
      if (vr < -MAX_FALL) vr = -MAX_FALL;
      if (input.jump && this.grounded) {
        vr = JUMP_V * (wonder.ringLevel === 0 ? 1.35 : 1.0);
        this.grounded = false;
      }
      if (this.submerged > 0) {
        const push = Math.min(this.submerged, 5);
        vr += (push * 10 - vr * 3) * dt;
        if (input.swimUp) vr += 7 * dt;
        tx2 *= Math.exp(-0.9 * dt); ty2 *= Math.exp(-0.9 * dt); tz2 *= Math.exp(-0.9 * dt);
      }
      this.vx = tx2 + vr * ux; this.vy = ty2 + vr * uy; this.vz = tz2 + vr * uz;
    } else {
      // fly (free-flight)
      this.inSpaceCruise = agl > karmanAGL;
      const boost = input.sprint ? FLY_BOOST * (this.inSpaceCruise ? 2.5 : 1) : 1;
      const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
      const vfx = fx * cosP + ux * sinP, vfy = fy * cosP + uy * sinP, vfz = fz * cosP + uz * sinP;
      const ax = (vfx * input.forward + rx * input.strafe + ux * input.upDown) * FLY_ACCEL * boost;
      const ay = (vfy * input.forward + ry * input.strafe + uy * input.upDown) * FLY_ACCEL * boost;
      const az = (vfz * input.forward + rz * input.strafe + uz * input.upDown) * FLY_ACCEL * boost;
      this.vx += ax * dt; this.vy += ay * dt; this.vz += az * dt;
      const drag = Math.exp(-FLY_DRAG * dt);
      this.vx *= drag; this.vy *= drag; this.vz *= drag;
    }

    // --- integrate with horizontal wall blocking (when near surface) ---
    const nx = this.px + this.vx * dt, ny = this.py + this.vy * dt, nz = this.pz + this.vz * dt;
    const newTile = this.geo.tileOf(nx, ny, nz);
    let blocked = false;
    if (!this.inSpaceCruise && newTile !== this.tile && r0 < this.layers.bounds[0]) {
      const groundK = this.columns.groundLayerBelow(newTile, r0 + STEP_UP);
      const groundR = this.layers.topRadius(groundK);
      if (groundR - r0 > STEP_UP) blocked = true;
      const ceilK = this.columns.ceilingLayerAbove(newTile, Math.min(groundR + 0.01, r0) + 0.05);
      if (ceilK >= 0) {
        const gap = this.layers.bottomRadius(ceilK) - Math.max(groundR, r0 - 0.1);
        if (gap < BODY_HEIGHT) blocked = true;
      }
    }
    if (blocked) {
      const vr = this.vx * ux + this.vy * uy + this.vz * uz;
      this.px += ux * vr * dt; this.py += uy * vr * dt; this.pz += uz * vr * dt;
      this.vx = ux * vr; this.vy = uy * vr; this.vz = uz * vr;
      if (this.mode === 'plane') { this.exitPlane(); this.planeStowed = true; }
    } else {
      this.px = nx; this.py = ny; this.pz = nz;
      this.tile = newTile;
    }

    // --- radial collision in the current column ---
    const r = this.radius();
    const [nux, nuy, nuz] = this.up();
    if (r < this.layers.bounds[0] + 10) {
      const groundK = this.columns.groundLayerBelow(this.tile, r + (this.grounded ? STEP_UP : 0.05));
      const groundR = this.layers.topRadius(groundK);
      const vr = this.vx * nux + this.vy * nuy + this.vz * nuz;
      if (r <= groundR + 0.02) {
        if (vr <= 0.01 || this.grounded) {
          const wasGrounded = this.grounded;
          const scale = (groundR + 0.001) / r;
          this.px *= scale; this.py *= scale; this.pz *= scale;
          if (vr < 0) {
            this.vx -= vr * nux; this.vy -= vr * nuy; this.vz -= vr * nuz;
          }
          this.grounded = true;
          if (wasGrounded && scale > 1) {
            this.stepSmooth = Math.min(1.45, this.stepSmooth + r * (scale - 1));
          }
          if (this.mode === 'plane') { this.exitPlane(); this.planeStowed = true; }
        }
      } else if (r - groundR > 0.06) {
        this.grounded = false;
      }

      if (this.mode === 'plane' && this.submerged > 0.25) {
        this.exitPlane();
        this.planeStowed = true;
      }

      const ceilK = this.columns.ceilingLayerAbove(this.tile, r + 0.05);
      if (ceilK >= 0) {
        const ceilR = this.layers.bottomRadius(ceilK);
        if (r + BODY_HEIGHT > ceilR) {
          const scale = Math.max(0.5, (ceilR - BODY_HEIGHT) / r);
          this.px *= scale; this.py *= scale; this.pz *= scale;
          const vr2 = this.vx * nux + this.vy * nuy + this.vz * nuz;
          if (vr2 > 0) {
            this.vx -= vr2 * nux; this.vy -= vr2 * nuy; this.vz -= vr2 * nuz;
          }
        }
      }

      const minR = this.layers.bounds[this.layers.L] + 1;
      const r2 = this.radius();
      if (r2 < minR) {
        const s = minR / r2;
        this.px *= s; this.py *= s; this.pz *= s;
      }
    } else {
      this.grounded = false;
    }

    const targetBank = this.mode === 'plane' ? this.bankTarget : 0;
    this.bank += (targetBank - this.bank) * Math.min(1, 4.5 * dt);
  }
}
