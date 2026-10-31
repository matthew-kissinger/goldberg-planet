import type { ItemId } from './crafting';

export type CharacterAction =
  | 'idle'
  | 'move'
  | 'sprint'
  | 'jump'
  | 'swim'
  | 'plane'
  | 'chop'
  | 'craft'
  | 'pickup';

/** what the character holds in the right hand: bare mittens or an inventory item */
export type CharacterPropId = ItemId | 'hands';

export const CHARACTER_PROP_IDS: readonly CharacterPropId[] = [
  'hands',
  'wood',
  'hatchet',
  'pickaxe',
  'spear',
  'cooked_meat',
  'planeFrame',
] as const;

export interface CharacterVisualState {
  action: CharacterAction;
  held: CharacterPropId;
  actionT: number;
  actionDuration: number;
}

export interface CharacterLocomotionInput {
  mode: 'walk' | 'fly' | 'plane';
  speed: number;
  grounded: boolean;
  submerged: number;
  sprinting: boolean;
}

export function characterActionForLocomotion(input: CharacterLocomotionInput): CharacterAction {
  if (input.mode === 'plane') return 'plane';
  if (input.submerged > 0.45) return 'swim';
  if (input.mode === 'fly') return 'jump';
  if (!input.grounded) return 'jump';
  if (input.speed > 0.45) return input.sprinting || input.speed > 7.2 ? 'sprint' : 'move';
  return 'idle';
}
