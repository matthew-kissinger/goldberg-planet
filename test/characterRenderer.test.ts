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

function visualState(action: CharacterVisualState['action'], held: CharacterPropId, backProps: CharacterPropId[] = []): CharacterVisualState {
  return {
    action,
    held,
    backProps,
    actionT: action === 'idle' ? 0 : 0.25,
    actionDuration: action === 'idle' ? 0 : 0.8,
  };
}

describe('character renderer Soft-Facet Wayfarer readability', () => {
  it('exposes named silhouette parts and prop sockets for the fallback avatar', () => {
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
    expect(stats.propSockets).toEqual(['back pack', 'left hand', 'right hand']);
    expect(stats.silhouetteParts).toBeGreaterThanOrEqual(28);
    expect(stats.actionPoseCoverage).toBeGreaterThanOrEqual(18);
    expect(stats.normalDistanceReady).toBe(true);
  });

  it('keeps held props in hand and separates stowed route gear on the back', () => {
    const scene = new THREE.Scene();
    const character = new Character(scene);

    character.update(
      fakePlayer(),
      { x: 0, y: 0, z: 0 },
      3.5,
      1 / 60,
      visualState('discover', 'horizonChart', ['horizonChart', 'packFrame', 'stormCloak', 'reedBow', 'caveAnchor']),
    );

    const stats = character.stats();
    expect(character.state().action).toBe('discover');
    expect(stats.visible).toBe(true);
    expect(stats.heldProp).toBe('horizonChart');
    expect(stats.heldPropMeshes).toBeGreaterThanOrEqual(3);
    expect(stats.backPropsVisible).toEqual(expect.arrayContaining(['packFrame', 'stormCloak', 'reedBow', 'caveAnchor']));
    expect(stats.backPropsVisible).not.toContain('horizonChart');
    expect(stats.backPropMeshes).toBeGreaterThan(10);
  });

  it('covers survival, travel, pickup, and native-defense action poses through renderer state', () => {
    const scene = new THREE.Scene();
    const character = new Character(scene);
    const scenarios: [CharacterVisualState['action'], CharacterPropId][] = [
      ['chop', 'stoneHatchet'],
      ['mine', 'echoPick'],
      ['build', 'waystone'],
      ['fish', 'fishingRod'],
      ['pickup', 'glowCrystal'],
      ['ward', 'stoneBlade'],
      ['shoot', 'reedBow'],
      ['brace', 'stormCloak'],
      ['stagger', 'hands'],
    ];

    for (const [action, held] of scenarios) {
      character.update(fakePlayer(), { x: 0, y: 0, z: 0 }, 3.5, 1 / 60, visualState(action, held, ['packFrame', 'stormCloak', 'stoneBlade', 'reedBow']));
      const stats = character.stats();
      expect(character.state().action).toBe(action);
      expect(stats.heldProp).toBe(held);
      expect(stats.supportedActions).toContain(action);
      expect(stats.normalDistanceReady).toBe(true);
    }
  });
});
