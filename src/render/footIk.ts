import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from 'three/webgpu';
import type { ExplorerPoseContext, ExplorerRig } from './explorerAsset';
import type { GroundContact, GroundProbe } from '../world/groundContact';

const DOWN = new Vector3(0, -1, 0);
const FOOT_FORWARD = [-.16, .23] as const;
const FOOT_SIDE = [-.13, .13] as const;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Allocation-free analytic two-bone solve, with an explicit bend plane and reach limits. */
export class TwoBoneSolver {
  private readonly h = new Vector3();
  private readonly k = new Vector3();
  private readonly a = new Vector3();
  private readonly direction = new Vector3();
  private readonly bend = new Vector3();
  private readonly kneeTarget = new Vector3();
  private readonly ankleTarget = new Vector3();
  private readonly before = new Vector3();
  private readonly after = new Vector3();
  private readonly worldQ = new Quaternion();
  private readonly parentQ = new Quaternion();
  private readonly delta = new Quaternion();
  private readonly hipPose = new Quaternion();
  private readonly kneePose = new Quaternion();
  private readonly hipSolution = new Quaternion();
  private readonly kneeSolution = new Quaternion();

  solve(hip: Bone, knee: Bone, ankle: Bone, target: Vector3, poleDirection: Vector3, weight = 1): number {
    hip.getWorldPosition(this.h);
    knee.getWorldPosition(this.k);
    ankle.getWorldPosition(this.a);
    const upper = this.h.distanceTo(this.k), lower = this.k.distanceTo(this.a);
    if (upper < 1e-5 || lower < 1e-5) return 0;
    this.hipPose.copy(hip.quaternion);
    this.kneePose.copy(knee.quaternion);
    this.direction.subVectors(target, this.h);
    const distance = this.direction.length();
    if (distance < 1e-6) this.direction.copy(DOWN); else this.direction.multiplyScalar(1 / distance);
    const reach = clamp(distance, Math.abs(upper - lower) + 0.0001, upper + lower - 0.0001);
    this.bend.copy(poleDirection).addScaledVector(this.direction, -poleDirection.dot(this.direction));
    if (this.bend.lengthSq() < 1e-6) {
      this.bend.set(Math.abs(this.direction.x) < 0.8 ? 1 : 0, Math.abs(this.direction.x) < 0.8 ? 0 : 1, 0);
      this.bend.addScaledVector(this.direction, -this.bend.dot(this.direction));
    }
    this.bend.normalize();
    const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
    const height = Math.sqrt(Math.max(0, upper * upper - along * along));
    this.kneeTarget.copy(this.h).addScaledVector(this.direction, along).addScaledVector(this.bend, height);
    this.ankleTarget.copy(this.h).addScaledVector(this.direction, reach);
    this.aim(hip, this.before.subVectors(this.k, this.h), this.after.subVectors(this.kneeTarget, this.h));
    hip.updateWorldMatrix(true, true);
    knee.getWorldPosition(this.k);
    ankle.getWorldPosition(this.a);
    this.aim(knee, this.before.subVectors(this.a, this.k), this.after.subVectors(this.ankleTarget, this.k));
    this.hipSolution.copy(hip.quaternion); this.kneeSolution.copy(knee.quaternion);
    hip.quaternion.slerpQuaternions(this.hipPose, this.hipSolution, clamp(weight, 0, 1));
    knee.quaternion.slerpQuaternions(this.kneePose, this.kneeSolution, clamp(weight, 0, 1));
    hip.updateWorldMatrix(true, true);
    ankle.getWorldPosition(this.a);
    return this.a.distanceTo(target);
  }

  private aim(bone: Bone, from: Vector3, to: Vector3): void {
    this.delta.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(this.worldQ);
    this.worldQ.premultiply(this.delta);
    if (bone.parent) bone.parent.getWorldQuaternion(this.parentQ).invert(); else this.parentQ.identity();
    bone.quaternion.copy(this.parentQ.multiply(this.worldQ));
  }
}

interface FootState {
  planted: boolean;
  anchor: Vector3;
  normal: Vector3;
  target: Vector3;
  weight: number;
  error: number;
}

/** Contacts belong to a planet; only the final solver targets use camera-relative coordinates. */
export class FootIk {
  private readonly feet: [FootState, FootState] = [this.makeFoot(), this.makeFoot()];
  private readonly solve = new TwoBoneSolver();
  private readonly point = new Vector3();
  private readonly sole = new Vector3();
  private readonly up = new Vector3();
  private readonly forward = new Vector3();
  private readonly pole = new Vector3();
  private readonly right = new Vector3();
  private readonly back = new Vector3();
  private readonly offset = new Vector3();
  private readonly origin = new Vector3();
  private readonly playerPosition = new Vector3();
  private readonly previousPosition = new Vector3();
  private readonly hipPosition = new Vector3();
  private readonly kneePosition = new Vector3();
  private readonly anklePosition = new Vector3();
  private readonly scale = new Vector3();
  private readonly moveDirection = new Vector3();
  private readonly footQ = new Quaternion();
  private readonly parentQ = new Quaternion();
  private readonly localQ = new Quaternion();
  private readonly basis = new Matrix4();
  private readonly contact: GroundContact = { point: new Vector3(), normal: new Vector3(), tile: -1 };
  private readonly footprint: GroundContact = { point: new Vector3(), normal: new Vector3(), tile: -1 };
  private readonly probeCenter = new Vector3();
  private worldId: object | null = null;
  private pelvisOffset = 0;
  private queries = 0;
  private grounded = false;
  private previousAction: ExplorerPoseContext['action'];
  private stepLift = 0;

  constructor(private readonly rig: ExplorerRig) {}

  private makeFoot(): FootState {
    return { planted: false, anchor: new Vector3(), normal: new Vector3(), target: new Vector3(), weight: 0, error: 0 };
  }

  reset(): void {
    for (const foot of this.feet) { foot.planted = false; foot.weight = 0; foot.error = 0; }
    this.pelvisOffset = 0;
    this.stepLift = 0;
  }

  stats(): { grounded: boolean; planted: number; queries: number; pelvisOffset: number; stepLift: number; maxError: number; weights: number[] } {
    return { grounded: this.grounded, planted: this.feet.filter(f => f.planted).length,
      queries: this.queries, pelvisOffset: this.pelvisOffset, stepLift: this.stepLift,
      maxError: Math.max(...this.feet.map(f => f.error)), weights: this.feet.map(f => f.weight) };
  }

  /** Persistent-coordinate diagnostics; snapshots are allocated only on request. */
  contacts(): Array<{ anchor: Vector3; normal: Vector3; planted: boolean; weight: number; error: number }> {
    return this.feet.map(foot => ({ anchor: foot.anchor.clone(), normal: foot.normal.clone(),
      planted: foot.planted, weight: foot.weight, error: foot.error }));
  }

  update(context: ExplorerPoseContext, ground: GroundProbe): void {
    const { player, camWorld, dt, contactWeights } = context;
    this.queries = 0;
    if (context.action !== undefined && context.action !== this.previousAction) this.reset();
    this.previousAction = context.action;
    this.playerPosition.set(player.px, player.py, player.pz);
    if (this.worldId !== ground.worldId || this.previousPosition.distanceToSquared(this.playerPosition) > 16) {
      this.reset(); this.worldId = ground.worldId;
    }
    this.previousPosition.copy(this.playerPosition);
    this.grounded = player.mode === 'walk' && player.grounded && player.submerged < 0.15;
    if (!this.grounded) { this.reset(); return; }
    this.origin.set(camWorld.x, camWorld.y, camWorld.z);
    this.up.copy(this.playerPosition).normalize();
    this.forward.set(player.fwdX, player.fwdY, player.fwdZ).normalize();
    this.pole.copy(this.forward);
    this.rig.root.getWorldScale(this.scale);
    const rigScale = this.scale.y;
    const blend = dt > 0 ? 1 - Math.exp(-24 * Math.min(dt, 0.05)) : 0;
    let desiredPelvis = 0;
    let reachPelvis = 0;
    // Lead the body into a single tile ascent. Locate the lip in a bounded
    // forward interval, so the lift is continuous when gameplay crosses it.
    this.stepLift = 0;
    this.moveDirection.set(player.vx || 0, player.vy || 0, player.vz || 0);
    this.moveDirection.addScaledVector(this.up, -this.moveDirection.dot(this.up));
    if (this.moveDirection.lengthSq() > .04) {
      this.moveDirection.normalize();
      this.point.copy(this.playerPosition).addScaledVector(this.moveDirection, .65);
      this.queries++;
      if (ground.probe(this.point, .72, .08, this.contact)) {
        const rise = this.contact.point.length() - this.playerPosition.length();
        if (rise > .12 && rise < .72) {
          let low = 0, high = .65;
          for (let sample=0;sample<5;sample++) {
            const middle=(low+high)*.5;
            this.point.copy(this.playerPosition).addScaledVector(this.moveDirection,middle);
            this.queries++;
            if (ground.probe(this.point,.72,.08,this.contact) && this.contact.point.length()-this.playerPosition.length()>.12) high=middle;
            else low=middle;
          }
          const t=clamp(1-high/.65,0,1);
          this.stepLift=rise*t*t*(3-2*t);
        }
      }
    }
    this.rig.root.position.y += this.stepLift;
    this.rig.root.updateWorldMatrix(true, true);

    for (let i = 0; i < 2; i++) {
      const leg = this.rig.legs[i], foot = this.feet[i];
      this.sole.copy(leg.soleOffset); leg.ankle.localToWorld(this.sole); this.sole.add(this.origin);
      const stance = contactWeights[i] > 0.4;
      // Release a planted foot if a turn/step exceeds a plausible stance reach.
      if (foot.planted && foot.anchor.distanceTo(this.sole) > 0.9) foot.planted = false;
      this.probeCenter.copy(foot.planted ? foot.anchor : this.sole);
      const supported = this.supportFootprint(this.probeCenter, rigScale, ground);
      if (!stance || !supported) foot.planted = false;
      if (supported) {
        if (!foot.planted) {
          foot.anchor.copy(this.contact.point);
          foot.normal.copy(this.contact.normal);
          foot.planted = stance;
        } else {
          // Edits may remove the old support. Never keep an anchor floating above it.
          if (foot.anchor.distanceTo(this.contact.point) > 0.04) {
            foot.anchor.copy(this.contact.point); foot.normal.copy(this.contact.normal);
          }
        }
      }
      let desiredWeight = supported ? clamp(contactWeights[i], 0, 1) : 0;
      // Land on the high side of a lip when part of the boot would intersect
      // it. Foot placement changes at contact, not by letting a low support
      // anchor pull the toe through the vertical wall during the blend.
      if (stance && supported && this.point.subVectors(foot.anchor, this.sole).dot(this.up) > .015) { foot.weight = 1; desiredWeight = 1; }
      // Release toward the authored swing, not the previous ground anchor.
      // A decaying IK weight aimed at the old support drags the toe back into
      // a ledge even when the incoming clip already clears it.
      if (!stance) {
        foot.anchor.copy(this.sole); foot.normal.copy(this.up); desiredWeight = 0;
      }
      foot.weight += (desiredWeight - foot.weight) * blend;
      if (foot.weight < 0.01) { foot.error = 0; continue; }
      // Lower the pelvis to accommodate the lower support; never move gameplay physics.
      const delta = this.point.subVectors(foot.anchor, this.sole).dot(this.up);
      if (stance) desiredPelvis = Math.min(desiredPelvis, clamp(delta, -0.22, 0.12) * foot.weight);
      // A locked stance moves behind the hip. Surface height alone cannot tell
      // whether the leg can still reach it: reserve a small knee bend and lower
      // the visual pelvis by the amount allowed by the horizontal separation.
      this.footOrientation(foot.normal, this.forward);
      this.offset.copy(leg.soleOffset).multiplyScalar(rigScale).applyQuaternion(this.footQ);
      foot.target.copy(foot.anchor).sub(this.origin).sub(this.offset);
      leg.hip.getWorldPosition(this.hipPosition);
      leg.knee.getWorldPosition(this.kneePosition);
      leg.ankle.getWorldPosition(this.anklePosition);
      const length = this.hipPosition.distanceTo(this.kneePosition)
        + this.kneePosition.distanceTo(this.anklePosition);
      this.point.subVectors(this.hipPosition, foot.target);
      const vertical = this.point.dot(this.up);
      const horizontalSq = Math.max(0, this.point.lengthSq() - vertical * vertical);
      const availableVertical = Math.sqrt(Math.max(0, (length - 0.015) ** 2 - horizontalSq));
      if (foot.planted && foot.weight > 0.5) {
        // A full .625m tile ascent can leave the trailing foot on the lower
        // support. Permit the pelvis to bridge that one step without extending
        // the bones; the subsequent recovery is eased after toe-off.
        reachPelvis = Math.min(reachPelvis, clamp(availableVertical - vertical, -Math.min(.68, length * .7), 0));
      }
    }
    desiredPelvis = Math.min(desiredPelvis, reachPelvis);
    this.pelvisOffset += (desiredPelvis - this.pelvisOffset) * blend;
    // Descend enough this frame to retain support; ease the recovery upwards.
    // A paused frame must reproduce the same pose without advancing the filter.
    if (dt > 0) this.pelvisOffset = Math.min(this.pelvisOffset, reachPelvis);
    // Every authored clip keys the pelvis position; this offset cannot accumulate across frames.
    this.rig.pelvis.position.y += this.pelvisOffset / rigScale;
    this.rig.root.updateWorldMatrix(true, true);

    for (let i = 0; i < 2; i++) {
      const leg = this.rig.legs[i], foot = this.feet[i];
      if (contactWeights[i] <= .4) {
        // Test the swing after pelvis correction, which can lower a previously
        // clear toe. The footprint includes the baked boot's full toe/heel and
        // width; checking only a sole point misses vertical tile lips.
        this.sole.copy(leg.soleOffset); leg.ankle.localToWorld(this.sole); this.sole.add(this.origin);
        this.right.crossVectors(this.forward, this.up).normalize();
        let clearance = 0, obstacleRise = 0;
        for (const forward of FOOT_FORWARD) for (const side of FOOT_SIDE) {
          this.point.copy(this.sole).addScaledVector(this.forward, forward * rigScale).addScaledVector(this.right, side * rigScale);
          this.queries++;
          if (ground.probe(this.point, .82, 1.1, this.contact)) {
            obstacleRise = Math.max(obstacleRise, this.contact.point.length() - this.playerPosition.length());
            clearance = Math.max(clearance, this.point.subVectors(this.contact.point, this.sole).dot(this.up) + .045);
          }
        }
        foot.anchor.copy(this.sole); foot.normal.copy(this.up);
        if (clearance > 0) {
          foot.anchor.addScaledVector(this.up, clearance); foot.weight = 1;
          // On a descent the old clip can leave a high trailing foot far
          // behind an already-lowered hip. A vertical lift alone bends its
          // knee into the lip. Advance the released foot through its swing
          // corridor while retaining the obstacle clearance height.
          const behind = this.point.subVectors(this.sole, this.playerPosition).dot(this.forward);
          if (obstacleRise > .12 && behind < -.15 * rigScale) {
            foot.anchor.addScaledVector(this.forward, Math.min(.65 * rigScale, -.15 * rigScale - behind));
          }
        }
      }
      if (foot.weight < 0.01) continue;
      this.footOrientation(foot.normal, this.forward);
      this.offset.copy(leg.soleOffset).multiplyScalar(rigScale).applyQuaternion(this.footQ);
      foot.target.copy(foot.anchor).sub(this.origin).sub(this.offset);
      foot.error = this.solve.solve(leg.hip, leg.knee, leg.ankle, foot.target, this.pole, foot.weight);
      this.worldToLocalRotation(leg.ankle.parent, this.footQ, this.localQ);
      // A planted boot lies on its support plane even while the leg's blend
      // weight changes. Blending the ankle back toward a toe-down key pose
      // before release drives the tip through the same support we just solved.
      leg.ankle.quaternion.slerp(this.localQ, foot.planted ? 1 : foot.weight);
      leg.ankle.updateWorldMatrix(true, true);
    }
  }

  private supportFootprint(center: Vector3, scale: number, ground: GroundProbe): boolean {
    this.queries++;
    let supported = ground.probe(center, .78, 1.1, this.contact);
    let radius = supported ? this.contact.point.length() : -Infinity;
    this.right.crossVectors(this.forward, this.up).normalize();
    for (const forward of FOOT_FORWARD) for (const side of FOOT_SIDE) {
      this.point.copy(center).addScaledVector(this.forward, forward * scale).addScaledVector(this.right, side * scale);
      this.queries++;
      if (ground.probe(this.point, .78, 1.1, this.footprint)) {
        const next = this.footprint.point.length();
        if (next > radius + .025) {
          // The new sole center is itself supported by the high tile. Merely
          // raising a center still outside the ledge would invent a floating
          // support and make contact-error reporting misleading.
          this.contact.point.copy(this.footprint.point); this.contact.normal.copy(this.footprint.normal); this.contact.tile = this.footprint.tile;
          radius = next; supported = true;
        }
      }
    }
    return supported;
  }

  private footOrientation(normal: Vector3, heading: Vector3): void {
    this.back.copy(heading).addScaledVector(normal, -heading.dot(normal)).normalize().negate();
    this.right.crossVectors(normal, this.back).normalize();
    this.basis.makeBasis(this.right, normal, this.back);
    this.footQ.setFromRotationMatrix(this.basis);
  }

  private worldToLocalRotation(parent: Object3D | null, world: Quaternion, out: Quaternion): void {
    if (parent) parent.getWorldQuaternion(this.parentQ).invert(); else this.parentQ.identity();
    out.copy(this.parentQ).multiply(world);
  }
}
