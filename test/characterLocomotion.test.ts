import { describe, expect, it } from 'vitest';
import { characterActionForLocomotion } from '../src/sim/equipment';
import { WALK_SPEED, SPRINT_SPEED } from '../src/player/locomotion';

describe('gameplay speed to authored gait', () => {
  const walking = { mode: 'walk' as const, grounded: true, submerged: 0, sprinting: false };
  it('selects distinct clips at the actual walk and sprint speeds', () => {
    expect(characterActionForLocomotion({ ...walking, speed: WALK_SPEED })).toBe('move');
    expect(characterActionForLocomotion({ ...walking, speed: SPRINT_SPEED })).toBe('sprint');
    expect(characterActionForLocomotion({ ...walking, speed: 0 })).toBe('idle');
  });
  it('retains airborne and water pose precedence at sprint speed', () => {
    expect(characterActionForLocomotion({ ...walking, grounded: false, speed: SPRINT_SPEED })).toBe('jump');
    expect(characterActionForLocomotion({ ...walking, submerged: .6, speed: SPRINT_SPEED })).toBe('swim');
  });
});
