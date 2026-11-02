import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Character } from '../src/render/character';
import { FootIk } from '../src/render/footIk';
import { DEFAULT_APPEARANCE } from '../src/render/explorerKit';
import type { GroundProbe } from '../src/world/groundContact';
import type { Player } from '../src/player/player';
import { explorerFixture } from './explorerFixture';

const R = 900, STEP = .625, DT = 1 / 60;
const supportRadius = (point: THREE.Vector3) => {
  const distance = -Math.atan2(point.z, point.y) * R;
  return R + (distance >= 2 && distance < 5 ? STEP : 0);
};

describe('scaled delivered explorer on a full Aurelia tile step', () => {
  it.each([.94, 1, 1.06])('keeps planted support and swing toes clear at stature %s', async stature => {
    const character = new Character(new THREE.Scene(), await explorerFixture()); await character.ready;
    character.setAppearance({ ...DEFAULT_APPEARANCE, stature });
    const rig = character.rig!, solver = new FootIk(rig), origin = { x: 0, y: R, z: 5 };
    const player = { px: 0, py: R, pz: 0, vx: 0, vy: 0, vz: -2.4, fwdX: 0, fwdY: 0, fwdZ: -1,
      mode: 'walk', grounded: true, submerged: 0, bank: 0, planeSpeed: 0, stepSmooth: 0,
      up(this: Player): [number, number, number] { const n = Math.hypot(this.px, this.py, this.pz); return [this.px / n, this.py / n, this.pz / n]; },
    } as unknown as Player;
    const ground: GroundProbe = { worldId: {}, probe(point, rise, drop, out) {
      const radius = supportRadius(point);
      if (radius > point.length() + rise || radius < point.length() - drop) return false;
      out.normal.copy(point).normalize(); out.point.copy(out.normal).multiplyScalar(radius); out.tile = radius > R ? 1 : 0; return true;
    } };
    const point = new THREE.Vector3(), sole = new THREE.Vector3();
    const position = rig.skin.geometry.getAttribute('position'), indices = rig.skin.geometry.getAttribute('skinIndex'), weights = rig.skin.geometry.getAttribute('skinWeight');
    const toeVertices = rig.legs.map(leg => {
      const bone = rig.skin.skeleton.bones.indexOf(leg.ankle), result: number[] = [];
      for (let i = 0; i < position.count; i++) if (indices.getX(i) === bone && weights.getX(i) > .99 && position.getY(i) < .065 * 1.13 && position.getZ(i) < -.16 * 1.13) result.push(i);
      return result;
    });
    expect(toeVertices.every(vertices => vertices.length > 10)).toBe(true);
    const contactErrors: number[] = []; let worstToePenetration = 0, worstToeAllPhases = 0, worstBodyPenetration = 0, swingSamples = 0;
    let worstDetail: unknown, worstBodyDetail: unknown;
    character.setPoseModifier(context => {
      solver.update(context, ground);
      const contacts = solver.contacts();
      for (let i = 0; i < 2; i++) {
        const leg = rig.legs[i]; sole.copy(leg.soleOffset); leg.ankle.localToWorld(sole); sole.add(new THREE.Vector3(origin.x, origin.y, origin.z));
        if (contacts[i].planted && context.contactWeights[i] > .8 && contacts[i].weight > .8) contactErrors.push(sole.distanceTo(contacts[i].anchor));
        for (const vertex of toeVertices[i]) {
          rig.skin.applyBoneTransform(vertex, point.fromBufferAttribute(position, vertex)); rig.skin.localToWorld(point);
          point.add(new THREE.Vector3(origin.x, origin.y, origin.z));
          const penetration = supportRadius(point) - point.length();
          worstToeAllPhases = Math.max(worstToeAllPhases, penetration);
          if (context.contactWeights[i] >= .3) continue;
          if (penetration > worstToePenetration) {
            worstToePenetration = penetration;
            worstDetail = { distance: -Math.atan2(player.pz, player.py) * R, phase: context.gaitPhase, leg: i,
              weight: context.contactWeights[i], contact: contacts[i], stats: solver.stats(), sole: sole.toArray(), vertex: point.toArray() };
          }
          swingSamples++;
        }
      }
      for (let vertex = 0; vertex < position.count; vertex += 5) if (position.getY(vertex) > .25 * 1.13) {
        rig.skin.applyBoneTransform(vertex, point.fromBufferAttribute(position, vertex)); rig.skin.localToWorld(point);
        point.add(new THREE.Vector3(origin.x, origin.y, origin.z));
        const penetration = supportRadius(point) - point.length();
        if (penetration > worstBodyPenetration) {
          worstBodyPenetration = penetration; worstBodyDetail = { distance: -Math.atan2(player.pz, player.py) * R,
            phase: context.gaitPhase, vertex, local: [position.getX(vertex), position.getY(vertex), position.getZ(vertex)],
            point: point.toArray(), joints: [indices.getX(vertex), indices.getY(vertex)], stats: solver.stats(),
            bones: rig.legs.map(leg => [leg.hip,leg.knee,leg.ankle].map(bone => bone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(origin.x,origin.y,origin.z)).toArray())) };
        }
      }
    });
    try {
      for (let frame = 0; frame < 210; frame++) {
        const distance = frame * 2.4 * DT, angle = distance / R;
        const radius = R + (distance >= 2 && distance < 5 ? STEP : 0);
        player.py = radius * Math.cos(angle); player.pz = -radius * Math.sin(angle);
        player.vy = -Math.sin(angle) * 2.4; player.vz = -Math.cos(angle) * 2.4;
        player.fwdY = -Math.sin(angle); player.fwdZ = -Math.cos(angle);
        character.update(player, origin, 5, DT, { action: 'move', held: 'hands', actionT: 0, actionDuration: 0 });
      }
      const sorted = contactErrors.sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * .95)];
      if (process.env.EXPLORER_GAIT_METRICS === '1') process.stdout.write(JSON.stringify({ stature, stepContactCount: contactErrors.length, stepContactP95: p95, stepContactMax: Math.max(...contactErrors), worstToePenetration, worstToeAllPhases, worstBodyPenetration, swingSamples, worstDetail, worstBodyDetail }) + '\n');
      expect(contactErrors.length).toBeGreaterThan(100); expect(swingSamples).toBeGreaterThan(100);
      expect(p95).toBeLessThan(.12);
      expect(worstToePenetration).toBeLessThan(.035);
      expect(worstToeAllPhases).toBeLessThan(.035);
      expect(worstBodyPenetration).toBeLessThan(.035);
      const before = rig.legs.map(leg => leg.ankle.localToWorld(leg.soleOffset.clone()).add(new THREE.Vector3(origin.x, origin.y, origin.z)));
      origin.x += 64; origin.y -= 42; origin.z += 128;
      for (let i = 0; i < 20; i++) character.update(player, origin, 5, 0, { action: 'move', held: 'hands', actionT: 0, actionDuration: 0 });
      const after = rig.legs.map(leg => leg.ankle.localToWorld(leg.soleOffset.clone()).add(new THREE.Vector3(origin.x, origin.y, origin.z)));
      for (let i = 0; i < 2; i++) expect(after[i].distanceTo(before[i])).toBeLessThan(.002);
    } finally { character.dispose(); }
  });
});
