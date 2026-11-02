import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Character } from '../src/render/character';
import { FootIk } from '../src/render/footIk';
import type { GroundProbe } from '../src/world/groundContact';
import type { Player } from '../src/player/player';
import type { CharacterAction } from '../src/sim/equipment';
import { explorerFixture } from './explorerFixture';

const RADIUS = 900;
const DT = 1 / 60;
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * .95)];

/** Real delivered skin/clips and runtime contact pipeline; prescribed spherical
 * translation isolates visual contact from input, streaming and physics timing.
 * This is a contact regression, not evidence that gameplay traversed a route.
 */
async function movingFixture() {
  const character = new Character(new THREE.Scene(), await explorerFixture());
  await character.ready;
  const solver = new FootIk(character.rig!);
  const origin = { x: 0, y: RADIUS, z: 5 };
  const player = {
    px: 0, py: RADIUS, pz: 0, vx: 0, vy: 0, vz: 0,
    fwdX: 0, fwdY: 0, fwdZ: -1, mode: 'walk', grounded: true,
    submerged: 0, bank: 0, planeSpeed: 0, stepSmooth: 0,
    up(this: Player): [number, number, number] { const r = Math.hypot(this.px, this.py, this.pz); return [this.px / r, this.py / r, this.pz / r]; },
  } as unknown as Player;
  const ground: GroundProbe = { worldId: {}, probe(point, rise, drop, out) {
    if (RADIUS > point.length() + rise || RADIUS < point.length() - drop) return false;
    out.normal.copy(point).normalize(); out.point.copy(out.normal).multiplyScalar(RADIUS); out.tile = 0;
    return true;
  } };
  const errors = { move: [] as number[], sprint: [] as number[] };
  const gaps = { move: [] as number[], sprint: [] as number[] };
  const sole = new THREE.Vector3();
  let phase = 0;
  character.setPoseModifier(context => {
    phase = context.gaitPhase;
    solver.update(context, ground);
    if (context.action !== 'move' && context.action !== 'sprint') return;
    const weights = solver.stats().weights;
    const contacts = solver.contacts();
    for (let i = 0; i < 2; i++) {
      if (context.contactWeights[i] < .8 || weights[i] < .8 || !contacts[i].planted) continue;
      const leg = context.rig.legs[i];
      sole.copy(leg.soleOffset); leg.ankle.localToWorld(sole);
      sole.x += origin.x; sole.y += origin.y; sole.z += origin.z;
      errors[context.action].push(sole.distanceTo(contacts[i].anchor));
      gaps[context.action].push(Math.abs(sole.length() - RADIUS));
    }
  });
  let distance = 0;
  const frame = (action: CharacterAction, speed: number, dt = DT, turn = 0) => {
    distance += speed * dt;
    const angle = distance / RADIUS, sin = Math.sin(angle), cos = Math.cos(angle);
    player.py = RADIUS * cos; player.pz = -RADIUS * sin;
    player.vx = 0; player.vy = -sin * speed; player.vz = -cos * speed;
    player.fwdX = Math.sin(turn); player.fwdY = -sin * Math.cos(turn); player.fwdZ = -cos * Math.cos(turn);
    character.update(player, origin, 5, dt, { action, held: 'hands', actionT: 0, actionDuration: 0 });
  };
  const endpoints = () => character.rig!.legs.map(leg => {
    const point = leg.ankle.localToWorld(leg.soleOffset.clone());
    return point.add(new THREE.Vector3(origin.x, origin.y, origin.z));
  });
  return { character, solver, origin, errors, gaps, frame, endpoints, get phase() { return phase; } };
}

describe('delivered explorer moving contacts', () => {
  it('preserves gait phase and support through walk/sprint transitions on either stance leg', async () => {
    const transitionErrors: number[] = [];
    const transitionGaps: number[] = [];
    for (const startPhase of [.12, .3, .62, .86]) {
      const f = await movingFixture();
      try {
        for (let i = 0; i < 30; i++) f.frame('idle', 0);
        // A complete cycle settles the mixer before each deliberately chosen phase.
        f.frame('move', 2.4, 0);
        let remaining = .62 * (1 + startPhase);
        while (remaining > 1e-8) { const dt = Math.min(DT, remaining); f.frame('move', 2.4, dt); remaining -= dt; }
        expect(f.phase).toBeCloseTo(startPhase, 6);
        const walkPhase = f.phase;
        f.frame('sprint', 4.6, 0);
        expect(f.phase, `walk→sprint at ${startPhase}`).toBeCloseTo(walkPhase, 6);
        for (let i = 0; i < 20; i++) f.frame('sprint', 4.6);
        transitionErrors.push(...f.errors.sprint); transitionGaps.push(...f.gaps.sprint);

        const sprintPhase = f.phase;
        f.errors.move.length = 0; f.gaps.move.length = 0;
        f.frame('move', 2.4, 0);
        expect(f.phase, `sprint→walk at ${sprintPhase}`).toBeCloseTo(sprintPhase, 6);
        for (let i = 0; i < 20; i++) f.frame('move', 2.4);
        transitionErrors.push(...f.errors.move); transitionGaps.push(...f.gaps.move);
      } finally { f.character.dispose(); }
    }
    if (process.env.EXPLORER_GAIT_METRICS === '1') process.stdout.write(JSON.stringify({ transitionContacts: transitionErrors.length,
      anchorP95: p95(transitionErrors), anchorMax: Math.max(...transitionErrors), surfaceP95: p95(transitionGaps), surfaceMax: Math.max(...transitionGaps),
    }) + '\n');
    expect(transitionErrors.length).toBeGreaterThan(30);
    expect(p95(transitionErrors)).toBeLessThan(.12);
    expect(p95(transitionGaps)).toBeLessThan(.12);
  });

  it('maintains the 12cm planted-foot gate through acceleration and sustained walk/sprint', async () => {
    const f = await movingFixture();
    try {
      for (let i = 0; i < 60; i++) f.frame('idle', 0);
      for (let i = 0; i < 480; i++) f.frame('move', 2.4 * Math.min(1, (i + 1) / 18));
      for (let i = 0; i < 360; i++) f.frame('sprint', 2.4 + 2.2 * Math.min(1, (i + 1) / 18));
      for (const action of ['move', 'sprint'] as const) {
        if (process.env.EXPLORER_GAIT_METRICS === '1') process.stdout.write(JSON.stringify({ action,
          contacts: f.errors[action].length, anchorP95: p95(f.errors[action]), anchorMax: Math.max(...f.errors[action]),
          surfaceP95: p95(f.gaps[action]), surfaceMax: Math.max(...f.gaps[action]),
        }) + '\n');
        expect(f.errors[action].length, `${action}: qualified contacts`).toBeGreaterThan(100);
        expect(p95(f.errors[action]), `${action}: actual sole to queried support, p95 metres`).toBeLessThan(.12);
        expect(p95(f.gaps[action]), `${action}: actual sole to radial surface, p95 metres`).toBeLessThan(.12);
      }
    } finally { f.character.dispose(); }
  });

  it('keeps settled feet planted through a standing turn, origin shift and paused frames', async () => {
    const f = await movingFixture();
    try {
      for (let i = 0; i < 60; i++) f.frame('idle', 0);
      for (let i = 0; i < 240; i++) f.frame('move', 2.4);
      for (let i = 0; i < 120; i++) f.frame('idle', 0);
      const before = f.endpoints();
      f.origin.x += 35; f.origin.y -= 21; f.origin.z += 12;
      for (let i = 0; i < 60; i++) f.frame('idle', 0, DT, .6 * (i + 1) / 60);
      const after = f.endpoints();
      if (process.env.EXPLORER_GAIT_METRICS === '1') process.stdout.write(JSON.stringify({ standingTurnDrift: after.map((foot, i) => foot.distanceTo(before[i])) }) + '\n');
      for (let i = 0; i < 2; i++) expect(after[i].distanceTo(before[i]), `foot ${i}: standing turn drift`).toBeLessThan(.02);
      const pelvis = f.character.rig!.pelvis.position.y;
      for (let i = 0; i < 30; i++) f.frame('idle', 0, 0, .6);
      expect(f.character.rig!.pelvis.position.y).toBeCloseTo(pelvis, 7);
      const paused = f.endpoints();
      for (let i = 0; i < 2; i++) expect(paused[i].distanceTo(after[i])).toBeLessThan(.002);
    } finally { f.character.dispose(); }
  });
});
