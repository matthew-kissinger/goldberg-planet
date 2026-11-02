import { describe, expect, it } from 'vitest';
import { Bone, Euler, Group, Quaternion, SkinnedMesh, Vector3 } from 'three/webgpu';
import { FootIk, TwoBoneSolver } from '../src/render/footIk';
import type { ExplorerPoseContext, ExplorerRig } from '../src/render/explorerAsset';
import type { GroundProbe } from '../src/world/groundContact';
import type { Player } from '../src/player/player';

function fixture() {
  const root = new Group(), pelvis = new Bone(); pelvis.position.y = 0.95; root.add(pelvis);
  const legs = ([-1, 1] as const).map(side => {
    const hip = new Bone(), knee = new Bone(), ankle = new Bone();
    hip.position.x = side * 0.145; knee.position.set(0, -0.42, -0.025); ankle.position.set(0, -0.41, 0.025);
    pelvis.add(hip); hip.add(knee); knee.add(ankle);
    return { hip, knee, ankle, side, soleOffset: new Vector3(0, -0.12, -0.055) };
  }) as ExplorerRig['legs'];
  const rig: ExplorerRig = { root, pelvis, legs, skin: new SkinnedMesh(), leftHand: new Bone(), rightHand: new Bone() };
  root.updateMatrixWorld(true);
  return rig;
}

describe('analytic leg contact', () => {
  it('reaches a bent target and preserves both bone lengths in a rotated parent frame', () => {
    const rig = fixture();
    rig.root.position.set(17, -3, 5); rig.root.quaternion.setFromEuler(new Euler(0.6, 0.8, -0.3));
    rig.root.updateMatrixWorld(true);
    const { hip, knee, ankle } = rig.legs[0];
    const h = hip.getWorldPosition(new Vector3()), k = knee.getWorldPosition(new Vector3()), a = ankle.getWorldPosition(new Vector3());
    const l1 = h.distanceTo(k), l2 = k.distanceTo(a);
    const target = rig.root.localToWorld(new Vector3(-0.145, 0.3, -0.2));
    const pole = new Vector3(0, 0, -1).applyQuaternion(rig.root.quaternion);
    const error = new TwoBoneSolver().solve(hip, knee, ankle, target, pole);
    expect(error).toBeLessThan(1e-6);
    expect(hip.getWorldPosition(h).distanceTo(knee.getWorldPosition(k))).toBeCloseTo(l1, 7);
    expect(k.distanceTo(ankle.getWorldPosition(a))).toBeCloseTo(l2, 7);
    expect(k.clone().sub(h).dot(pole)).toBeGreaterThan(0);
  });

  it('clamps impossible reach without stretching or producing non-finite rotations', () => {
    const rig = fixture(), leg = rig.legs[0];
    const error = new TwoBoneSolver().solve(leg.hip, leg.knee, leg.ankle, new Vector3(10, -20, 4), new Vector3(0, 0, -1));
    expect(error).toBeGreaterThan(10);
    expect([...leg.hip.quaternion.toArray(), ...leg.knee.quaternion.toArray()].every(Number.isFinite)).toBe(true);
    expect(leg.knee.position.length()).toBeCloseTo(Math.hypot(0.42, 0.025), 8);
  });

  it('keeps planted feet fixed through floating-origin shifts and releases them in air', () => {
    const rig = fixture(), solver = new FootIk(rig);
    const player = { px: 0, py: 900, pz: 0, fwdX: 0, fwdY: 0, fwdZ: -1,
      grounded: true, mode: 'walk', submerged: 0 } as Player;
    const ground: GroundProbe = { worldId: {}, probe(point, _rise, _drop, out) {
      out.normal.copy(point).normalize(); out.point.copy(out.normal).multiplyScalar(900); out.tile = 0; return true;
    } };
    const context: ExplorerPoseContext = { rig, player, camWorld: { x: 0, y: 900, z: 4 }, dt: 1 / 60, gaitPhase: 0, contactWeights: [1, 1] };
    const frame = () => {
      rig.pelvis.position.set(0, 0.95, 0);
      for (const leg of rig.legs) { leg.hip.quaternion.identity(); leg.knee.quaternion.identity(); leg.ankle.quaternion.identity(); }
      rig.root.position.set(player.px - context.camWorld.x, player.py - context.camWorld.y, player.pz - context.camWorld.z);
      rig.root.updateMatrixWorld(true); solver.update(context, ground);
    };
    for (let i = 0; i < 40; i++) frame();
    const footPlanet = () => rig.legs[0].ankle.localToWorld(rig.legs[0].soleOffset.clone())
      .add(new Vector3(context.camWorld.x, context.camWorld.y, context.camWorld.z));
    const before = footPlanet();
    context.camWorld = { x: 75, y: 870, z: -40 };
    frame();
    expect(footPlanet().distanceTo(before)).toBeLessThan(0.001);
    expect(solver.stats().planted).toBe(2);
    expect(solver.stats().queries).toBeLessThanOrEqual(10);
    expect(solver.stats().maxError).toBeLessThan(0.002);
    player.grounded = false; frame();
    expect(solver.stats().planted).toBe(0);
    expect(solver.stats().weights).toEqual([0, 0]);
    expect(solver.stats().queries).toBe(0);
  });

  it('solves the same pose with gravity rotated to a planet equator', () => {
    const rig = fixture();
    rig.root.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(1, 0, 0)));
    rig.root.updateMatrixWorld(true);
    const target = rig.root.localToWorld(new Vector3(-0.145, 0.22, -0.1));
    const leg = rig.legs[0];
    expect(new TwoBoneSolver().solve(leg.hip, leg.knee, leg.ankle, target, new Vector3(0, 0, -1))).toBeLessThan(1e-6);
  });
});
