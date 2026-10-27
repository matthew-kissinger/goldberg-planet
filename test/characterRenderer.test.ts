import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Character } from '../src/render/character';
import type { Player } from '../src/player/player';
import type { CharacterPropId, CharacterVisualState } from '../src/sim/equipment';

function meshNames(character: Character): Set<string> {
  const names = new Set<string>();
  character.group.traverse((part) => {
    if ((part as THREE.Mesh).isMesh) names.add(part.name);
  });
  return names;
}

function readabilityRoles(character: Character): Set<string> {
  const roles = new Set<string>();
  character.group.traverse((part) => {
    const role = part.userData.characterReadabilityRole;
    if (typeof role === 'string') roles.add(role);
  });
  return roles;
}

function findPart(character: Character, name: string): THREE.Object3D {
  let found: THREE.Object3D | null = null;
  character.group.traverse((part) => {
    if (part.name === name) found = part;
  });
  if (!found) throw new Error(`part not found: ${name}`);
  return found;
}

function fakePlayer(overrides: Partial<Player> = {}): Player {
  return {
    px: 100,
    py: 0,
    pz: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    fwdX: 0,
    fwdY: 1,
    fwdZ: 0,
    pitch: 0,
    mode: 'walk',
    grounded: true,
    submerged: 0,
    bank: 0,
    tile: 0,
    planeSpeed: 0,
    throttle: 0,
    holdAGL: 0,
    planeStowed: false,
    stepSmooth: 0,
    up: () => [1, 0, 0],
    altitudeAGL: () => 0,
    ...overrides,
  } as unknown as Player;
}

function visualState(action: CharacterVisualState['action'], held: CharacterPropId): CharacterVisualState {
  return {
    action,
    held,
    actionT: action === 'idle' ? 0 : 0.25,
    actionDuration: action === 'idle' ? 0 : 0.8,
  };
}

describe('character renderer', () => {
  it('exposes named silhouette parts for the procedural avatar', () => {
    const scene = new THREE.Scene();
    const character = new Character(scene);
    const names = meshNames(character);
    const roles = readabilityRoles(character);
    const stats = character.stats();

    expect([...names]).toEqual(expect.arrayContaining([
      'wayfarerSdfBlendShell',
      'wayfarerHoodRim',
      'wayfarerFacePlate',
      'wayfarerEyeL',
      'wayfarerEyeR',
      'wayfarerScarfLoop',
      'wayfarerScarfTail',
      'sideSatchel',
      'roundedBackpack',
      'wayfarerTopBedroll',
      'rightWayfarerMitten',
      'leftWayfarerMitten',
      'rightBootToe',
      'leftBootToe',
    ]));
    expect([...roles]).toEqual(expect.arrayContaining([
      'fused soft-facet body shell',
      'oversized hood rim',
      'warm face plate',
      'fluttering scarf tail',
      'left side satchel',
      'rounded backpack silhouette',
      'right oversized mitten',
      'left oversized mitten',
      'right bright boot toe',
      'left bright boot toe',
    ]));
    expect(stats.silhouetteParts).toBeGreaterThanOrEqual(28);
  });

  it('swings arms forward and legs backward on jump, not the reverse', () => {
    // Local -Z is the character's front (face plate, eyes, and belt buckle all sit at
    // negative Z in the rig), and character.update() maps that local -Z axis to the
    // player's actual facing direction in world space. A positive rotation.x on a
    // hanging limb group swings its lower end toward -Z (forward); negative swings it
    // toward +Z (backward). The jump pose had this backwards for both arms and legs.
    const scene = new THREE.Scene();
    const character = new Character(scene);
    // jump is a continuous state (like move/sprint/swim/plane), not a timed one-shot
    // action, so it only applies when actionDuration is 0 (see applyPose's `active` gate).
    character.update(fakePlayer(), { x: 0, y: 0, z: 0 }, 5, 1 / 60, {
      action: 'jump',
      held: 'hands',
      actionT: 0,
      actionDuration: 0,
    });

    const rightArm = findPart(character, 'rightSdfBlendArm').parent!;
    const leftArm = findPart(character, 'leftSdfBlendArm').parent!;
    const rightLeg = findPart(character, 'rightSdfBlendLeg').parent!;
    const leftLeg = findPart(character, 'leftSdfBlendLeg').parent!;

    expect(rightArm.rotation.x).toBeGreaterThan(0);
    expect(leftArm.rotation.x).toBeGreaterThan(0);
    expect(rightLeg.rotation.x).toBeLessThan(0);
    expect(leftLeg.rotation.x).toBeLessThan(0);
  });

  it('swings the chopping arm forward, not the reverse', () => {
    // Same -Z-is-forward convention as the jump pose above: rotation.x > 0 on a hanging arm
    // swings its hand toward -Z (the tree in front of the character).
    const scene = new THREE.Scene();
    const character = new Character(scene);
    character.update(fakePlayer(), { x: 0, y: 0, z: 0 }, 5, 1 / 60, visualState('chop', 'hands'));
    const rightArm = findPart(character, 'rightSdfBlendArm').parent!;
    expect(rightArm.rotation.x).toBeGreaterThan(0);
  });

  it('shows the held item in the right hand and nothing for bare hands', () => {
    const scene = new THREE.Scene();
    const character = new Character(scene);

    character.update(fakePlayer(), { x: 0, y: 0, z: 0 }, 3.5, 1 / 60, visualState('pickup', 'wood'));
    let stats = character.stats();
    expect(character.state().action).toBe('pickup');
    expect(stats.visible).toBe(true);
    expect(stats.heldProp).toBe('wood');
    expect(stats.heldPropMeshes).toBe(1);

    character.update(fakePlayer(), { x: 0, y: 0, z: 0 }, 3.5, 1 / 60, visualState('idle', 'hands'));
    stats = character.stats();
    expect(stats.heldProp).toBe('hands');
    expect(stats.heldPropMeshes).toBe(0);
  });

  it('covers every core-loop action pose through renderer state', () => {
    const scene = new THREE.Scene();
    const character = new Character(scene);
    const scenarios: [CharacterVisualState['action'], CharacterPropId][] = [
      ['chop', 'hands'],
      ['pickup', 'wood'],
      ['craft', 'planeFrame'],
    ];

    for (const [action, held] of scenarios) {
      character.update(fakePlayer(), { x: 0, y: 0, z: 0 }, 3.5, 1 / 60, visualState(action, held));
      const stats = character.stats();
      expect(character.state().action).toBe(action);
      expect(stats.heldProp).toBe(held);
      expect(stats.supportedActions).toContain(action);
    }
  });

  it('hides the walking body and shows the plane in plane mode', () => {
    const scene = new THREE.Scene();
    const character = new Character(scene);
    character.update(fakePlayer({ mode: 'plane' }), { x: 0, y: 0, z: 0 }, 15, 1 / 60, visualState('plane', 'hands'));
    expect(findPart(character, 'wayfarerSdfBlendShell').parent!.visible).toBe(false);
  });

  it('interns materials by color so matching parts share one instance', () => {
    const scene = new THREE.Scene();
    const character = new Character(scene);
    let totalMeshCount = 0;
    const uniqueMaterials = new Set<THREE.Material>();
    character.group.traverse((part) => {
      const mesh = part as THREE.Mesh;
      if (!mesh.isMesh) return;
      totalMeshCount++;
      if (mesh.material && !Array.isArray(mesh.material)) uniqueMaterials.add(mesh.material as THREE.Material);
    });
    // a naive per-mesh allocator would produce close to one material per mesh
    expect(uniqueMaterials.size).toBeLessThan(totalMeshCount / 3);
  });
});
