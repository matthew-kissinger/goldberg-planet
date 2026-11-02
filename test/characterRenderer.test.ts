import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Character, explorerContactWeight } from '../src/render/character';
import type { Player } from '../src/player/player';
import type { CharacterAction, CharacterPropId, CharacterVisualState } from '../src/sim/equipment';
import { explorerFixture } from './explorerFixture';
import { FootIk } from '../src/render/footIk';
import type { GroundProbe } from '../src/world/groundContact';

async function character(): Promise<Character> {
  const result = new Character(new THREE.Scene(), await explorerFixture());
  await result.ready;
  return result;
}
function player(overrides: Partial<Player> = {}): Player {
  return {
    px: 100, py: 0, pz: 0, vx: 0, vy: 0, vz: 0,
    fwdX: 0, fwdY: 1, fwdZ: 0, mode: 'walk', grounded: true, submerged: 0,
    bank: 0, planeSpeed: 0, inSpaceCruise: false, hasOrbitalThruster: false,
    stepSmooth: 0, up: () => [1, 0, 0], ...overrides,
  } as unknown as Player;
}
const origin = { x: 99, y: -2, z: 1 };
function pose(action: CharacterAction, held: CharacterPropId = 'hands', actionT = 0): CharacterVisualState {
  return { action, held, actionT, actionDuration: ['chop', 'craft', 'pickup'].includes(action) ? 1 : 0 };
}

describe('delivered explorer asset and runtime', () => {
  it('loads one deforming body draw with articulated binds and weighted joint transitions', async () => {
    const c = await character();
    c.update(player(), origin, 5, 0);
    const rig = c.rig!;
    expect(c.stats()).toMatchObject({ ready: true, skinnedMeshes: 8, visibleDraws: 4, bones: 17, clips: 9 });
    expect(rig.legs[0].knee.parent).toBe(rig.legs[0].hip);
    expect(rig.legs[0].ankle.parent).toBe(rig.legs[0].knee);
    expect(rig.rightHand.parent?.name).toBe('explorerRightForearm');
    const indices = rig.skin.geometry.getAttribute('skinIndex');
    const weights = rig.skin.geometry.getAttribute('skinWeight');
    let blendedVertices = 0;
    for (let i = 0; i < weights.count; i++) {
      const w = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
      expect(w.every(value => value >= 0 && value <= 1)).toBe(true);
      if (w[0] > .05 && w[1] > .05) blendedVertices++;
      for (let lane = 0; lane < 4; lane++) expect(indices.getComponent(i, lane)).toBeLessThan(17);
    }
    expect(blendedVertices).toBeGreaterThan(100);
    c.dispose();
  });

  it('plays authored knee and elbow motion through actual skin deformation', async () => {
    const c = await character();
    const rig = c.rig!;
    c.update(player({ vy: 2.4 }), origin, 5, .1, pose('move'));
    const kneeStart = rig.legs[0].knee.quaternion.clone();
    const positions = rig.skin.geometry.getAttribute('position');
    const weights = rig.skin.geometry.getAttribute('skinWeight');
    const indices = rig.skin.geometry.getAttribute('skinIndex');
    const kneeIndex = rig.skin.skeleton.bones.indexOf(rig.legs[0].knee);
    let vertex = -1;
    for (let i = 0; i < weights.count; i++) {
      if (weights.getY(i) > .1 && weights.getY(i) < .9 && indices.getY(i) === kneeIndex) { vertex = i; break; }
    }
    expect(vertex).toBeGreaterThan(-1);
    const before = rig.skin.applyBoneTransform(vertex, new THREE.Vector3().fromBufferAttribute(positions, vertex));
    let maxAngle = 0, maxDeformation = 0;
    for (let i = 0; i < 8; i++) {
      c.update(player({ vy: 2.4 }), origin, 5, .1, pose('move'));
      const after = rig.skin.applyBoneTransform(vertex, new THREE.Vector3().fromBufferAttribute(positions, vertex));
      maxAngle = Math.max(maxAngle, kneeStart.angleTo(rig.legs[0].knee.quaternion));
      maxDeformation = Math.max(maxDeformation, before.distanceTo(after));
      expect(Number.isFinite(after.length())).toBe(true);
    }
    expect(maxAngle).toBeGreaterThan(.4);
    expect(maxDeformation).toBeGreaterThan(.05);
    c.dispose();
  });

  it('samples one-shots at gameplay progress and attaches tools to the articulated hand', async () => {
    const c = await character();
    c.update(player(), origin, 5, .1, pose('chop', 'hatchet', .35));
    c.update(player(), origin, 5, .1, pose('chop', 'hatchet', .35));
    const hand = c.rig!.rightHand;
    const prop = c.group.getObjectByName('character-prop-hatchet')!;
    expect(prop.parent?.parent).toBe(hand);
    expect(c.stats()).toMatchObject({ activeClip: 'chop', heldProp: 'hatchet', heldPropMeshes: 1, visibleDraws: 5 });
    const before = hand.getWorldPosition(new THREE.Vector3());
    c.update(player(), origin, 5, .1, pose('chop', 'hatchet', .8));
    const after = hand.getWorldPosition(new THREE.Vector3());
    expect(before.distanceTo(after)).toBeGreaterThan(.1);
    c.update(player(), origin, 5, .1, pose('idle'));
    expect(c.stats().heldProp).toBe('hands');
    c.dispose();
  });

  it('corrects contact after radial transforms and resets pelvis pose every frame', async () => {
    const c = await character();
    const values: number[] = [];
    c.setPoseModifier(context => {
      values.push(context.rig.pelvis.position.y);
      const up = new THREE.Vector3(0, 1, 0).transformDirection(context.rig.root.matrixWorld);
      expect(up.distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-6);
      expect(c.group.position.toArray()).toEqual([1, 2, -1]);
      expect(context.contactWeights).toEqual([1, 1]);
      context.rig.pelvis.position.y -= .1;
    });
    c.update(player(), origin, 5, 0, pose('idle'));
    c.update(player(), origin, 5, 0, pose('idle'));
    expect(values).toHaveLength(2);
    expect(values[0]).toBeCloseTo(.95 * 1.13, 5);
    expect(values[1]).toBeCloseTo(values[0], 5);
    c.dispose();
  });

  it('provides alternating stance weights and disables support during jump/swim', async () => {
    expect(explorerContactWeight(.1)).toBe(1);
    expect(explorerContactWeight(.6)).toBe(0);
    expect(explorerContactWeight(.38, true)).toBe(0);
    const c = await character();
    c.setPoseModifier(context => expect(context.contactWeights).toEqual([0, 0]));
    c.update(player({ grounded: false }), origin, 5, .1, pose('jump'));
    c.update(player({ submerged: .8 }), origin, 5, .1, pose('swim'));
    c.dispose();
  });

  it('plants the delivered rig on a radial surface and survives a camera-origin shift', async () => {
    const c = await character(), solver = new FootIk(c.rig!);
    const ground: GroundProbe = { worldId: {}, probe(point, _rise, _drop, out) {
      out.normal.copy(point).normalize();
      out.point.copy(out.normal).multiplyScalar(100); out.tile = 0; return true;
    } };
    c.setPoseModifier(context => solver.update(context, ground));
    const p = player();
    for (let i = 0; i < 40; i++) c.update(p, origin, 5, 1 / 60, pose('idle'));
    const leg = c.rig!.legs[0];
    const before = leg.ankle.localToWorld(leg.soleOffset.clone()).add(new THREE.Vector3(origin.x, origin.y, origin.z));
    expect(before.length()).toBeCloseTo(100, 2);
    const shiftedOrigin = { x: 30, y: -80, z: 120 };
    c.update(p, shiftedOrigin, 5, 0, pose('idle'));
    const after = leg.ankle.localToWorld(leg.soleOffset.clone()).add(new THREE.Vector3(shiftedOrigin.x, shiftedOrigin.y, shiftedOrigin.z));
    expect(after.distanceTo(before)).toBeLessThan(.001);
    expect(solver.stats().planted).toBe(2);
    expect(solver.stats().maxError).toBeLessThan(.01);
    c.dispose();
  });

  it('seats the real explorer in the skiff and switches to the closed orbital vehicle', async () => {
    const c = await character();
    c.update(player({ mode: 'plane' }), origin, 12, .1, pose('plane'));
    c.update(player({ mode: 'plane' }), origin, 12, .1, pose('plane'));
    expect(c.group.getObjectByName('fieldSkiff')!.visible).toBe(true);
    expect(c.rig!.root.visible).toBe(true);
    expect(c.rig!.legs[0].hip.rotation.x).toBeGreaterThan(1);
    expect(c.stats().visibleDraws).toBe(7);
    c.update(player({ mode: 'plane', hasOrbitalThruster: true }), origin, 12, .1, pose('plane'));
    expect(c.group.getObjectByName('fieldSkiff')!.visible).toBe(false);
    expect(c.group.getObjectByName('fieldStarship')!.visible).toBe(true);
    expect(c.rig!.root.visible).toBe(false);
    c.dispose();
  });

  it('isolates recolored geometry/skeleton/fade state while retaining cached source and prop resources', async () => {
    const a = await character(), b = await character();
    expect(a.rig!.skin.geometry).not.toBe(b.rig!.skin.geometry);
    const source = (await explorerFixture()).scene.getObjectByName('explorerSkin') as THREE.SkinnedMesh;
    expect(a.rig!.skin.geometry).not.toBe(source.geometry);
    const aProp = a.group.getObjectByName('character-prop-hatchet') as THREE.Mesh;
    const bProp = b.group.getObjectByName('character-prop-hatchet') as THREE.Mesh;
    expect(aProp.geometry).toBe(bProp.geometry);
    expect(a.rig!.pelvis).not.toBe(b.rig!.pelvis);
    expect(a.rig!.skin.material).not.toBe(b.rig!.skin.material);
    let geometryDisposals = 0, materialDisposals = 0;
    a.rig!.skin.geometry.addEventListener('dispose', () => geometryDisposals++);
    (a.rig!.skin.material as THREE.Material).addEventListener('dispose', () => materialDisposals++);
    a.update(player(), origin, 2, 0, pose('idle'));
    b.update(player(), origin, 5, 0, pose('idle'));
    expect((a.rig!.skin.material as THREE.Material).opacity).toBeLessThan(1);
    expect((b.rig!.skin.material as THREE.Material).opacity).toBe(1);
    expect((b.rig!.skin.material as THREE.Material).transparent).toBe(false);
    a.dispose(); a.dispose();
    expect(geometryDisposals).toBe(1);
    expect(materialDisposals).toBe(1);
    expect(a.group.parent).toBeNull();
    b.update(player(), origin, 5, .1, pose('move'));
    expect(b.stats().ready).toBe(true);
    b.dispose();
  });

  it('prepares all owned skin/static variants and restores visibility even if compilation rejects', async () => {
    const c = await character();
    c.update(player(), origin, 2, 0, pose('idle'));
    const scene = c.group.parent as THREE.Scene, camera = new THREE.PerspectiveCamera();
    const before: boolean[] = [];
    c.group.traverse(object => before.push(object.visible));
    const opacity = (c.rig!.skin.material as THREE.Material).opacity;
    let renders = 0;
    const compileAsync = async () => {
      c.group.traverse(object => { expect(object.visible).toBe(true); expect(object.frustumCulled).toBe(false); });
      expect((c.rig!.skin.material as THREE.Material).opacity).toBe(1);
    };
    const renderer = { compileAsync, render: () => { renders++; } } as unknown as Pick<THREE.WebGPURenderer, 'compileAsync' | 'render'>;
    await c.warmup(renderer, scene, camera);
    expect(renders).toBe(1);
    const after: boolean[] = [];
    c.group.traverse(object => after.push(object.visible));
    expect(after).toEqual(before);
    expect((c.rig!.skin.material as THREE.Material).opacity).toBe(opacity);
    renderer.compileAsync = async () => { throw new Error('compile failed'); };
    await expect(c.warmup(renderer, scene, camera)).rejects.toThrow('compile failed');
    expect(c.group.getObjectByName('explorerVehicles')!.visible).toBe(false);
    expect(c.group.getObjectByName('character-prop-hatchet')!.visible).toBe(false);
    expect((c.rig!.skin.material as THREE.Material).opacity).toBe(opacity);
    c.dispose();
  });

  it('keeps delivered clip poses inside the conservative animated bounds', async () => {
    const c = await character();
    const rig = c.rig!, v = new THREE.Vector3();
    const position = rig.skin.geometry.getAttribute('position');
    for (const action of c.stats().supportedActions) {
      for (let sample = 0; sample < 5; sample++) {
        c.update(player({ vy: 2.4 }), origin, 5, .1, pose(action, 'hands', sample / 4));
        for (let i = 0; i < position.count; i += 7) {
          rig.skin.applyBoneTransform(i, v.fromBufferAttribute(position, i));
          expect(rig.skin.boundingBox!.containsPoint(v)).toBe(true);
        }
      }
    }
    c.dispose();
  });
});
