/** Player-facing control copy, per input family. */

import type { UxInputMode } from '../player/ux';
import { PLANE_WOOD_COST } from '../sim/crafting';

export type HintDevice = 'keyboard' | 'touch' | 'gamepad';

export function hintDevice(mode: UxInputMode): HintDevice {
  if (mode === 'gamepad' || mode === 'hybrid') return 'gamepad';
  return mode === 'touch' ? 'touch' : 'keyboard';
}

const HELP: Record<HintDevice, string> = {
  keyboard: `WASD move · space jump · shift sprint · wheel zoom
LMB chop trees · B crafting · E craft/board/stow plane
F free-flight · N mute · F3 stats · H help`,
  touch: `Touch: left stick move · drag to look · pinch zoom
Tap a tree to chop it · craft opens recipes · plane boards/stows`,
  gamepad: `Gamepad: LS move · RS look · full stick/RB sprint · LB+RS zoom
A jump/swim · LT descend · X/RT chop · Y crafting · Start craft/board/stow plane`,
};

const CRAFT_KEY: Record<HintDevice, string> = { keyboard: 'B', touch: 'craft', gamepad: 'Y' };
const PLANE_KEY: Record<HintDevice, string> = { keyboard: 'E', touch: 'the plane button', gamepad: 'Start' };
const CHOP_VERB: Record<HintDevice, string> = { keyboard: 'chop trees with LMB', touch: 'tap trees to chop', gamepad: 'X chops trees' };
const FLIGHT_CONTROLS: Record<HintDevice, string> = {
  keyboard: 'W/S throttle · look steers · E stows',
  touch: 'left stick throttles · drag-look steers · plane button stows',
  gamepad: 'LS throttles · RS steers · Start stows',
};

export const helpText = (d: HintDevice): string => HELP[d];
export const craftKeyLabel = (d: HintDevice): string => CRAFT_KEY[d];
export const planeKeyLabel = (d: HintDevice): string => PLANE_KEY[d];

export function openingHint(d: HintDevice, restored: boolean): string {
  if (restored) return 'save restored';
  return d === 'touch'
    ? `tap trees for wood · ${PLANE_WOOD_COST} wood crafts the plane`
    : `chop trees for ${PLANE_WOOD_COST} wood · ${CRAFT_KEY[d]} opens crafting · ${PLANE_KEY[d]} boards the plane`;
}

export function needWoodHint(d: HintDevice, have: number): string {
  return `plane needs ${PLANE_WOOD_COST} wood · ${have}/${PLANE_WOOD_COST} · ${CHOP_VERB[d]}`;
}

export function enoughWoodHint(d: HintDevice, have: number): string {
  return `${have}/${PLANE_WOOD_COST} wood · press ${PLANE_KEY[d]} to craft the plane and board`;
}

export function boardedHint(d: HintDevice, justCrafted: boolean): string {
  return `${justCrafted ? 'plane crafted + boarded' : 'boarded'} · ${FLIGHT_CONTROLS[d]}`;
}
