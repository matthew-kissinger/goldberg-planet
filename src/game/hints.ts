/** Player-facing control copy, per input family. */

import type { UxInputMode } from '../player/ux';
import { PLANE_WOOD_COST } from '../sim/crafting';

export type HintDevice = 'keyboard' | 'touch' | 'gamepad';

export function hintDevice(mode: UxInputMode): HintDevice {
  if (mode === 'gamepad' || mode === 'hybrid') return 'gamepad';
  return mode === 'touch' ? 'touch' : 'keyboard';
}

const HELP: Record<HintDevice, string> = {
  keyboard: `WASD move · space jump · shift sprint · wheel zoom · M field guide
LMB gather / hunt · V mine · B satchel · E board/stow skiff
Z/X select structure · Q build · R rotate · G seed eco-pod · F fly (Creative) · F3 stats`,
  touch: `Left stick move · drag to look · pinch zoom
Tap trees to gather · Satchel to craft · Field guide → Worlds to plan travel`,
  gamepad: `Gamepad: LS move · RS look · full stick/RB sprint · LB+RS zoom
A jump/swim · LT descend · X/RT harvest · Y crafting · Start plane`,
};

const CRAFT_KEY: Record<HintDevice, string> = { keyboard: 'B', touch: 'craft', gamepad: 'Y' };
const PLANE_KEY: Record<HintDevice, string> = { keyboard: 'E', touch: 'the plane button', gamepad: 'Start' };
const CHOP_VERB: Record<HintDevice, string> = { keyboard: 'chop trees with LMB', touch: 'tap trees to chop', gamepad: 'X chops trees' };
const FLIGHT_CONTROLS: Record<HintDevice, string> = {
  keyboard: 'W/S throttle · look steers · Starfarer upgrade unlocks orbit · E stows',
  touch: 'left stick throttles · drag-look steers · plane button stows',
  gamepad: 'LS throttles · RS steers · Start stows',
};

export const helpText = (d: HintDevice): string => HELP[d];
export const craftKeyLabel = (d: HintDevice): string => CRAFT_KEY[d];
export const planeKeyLabel = (d: HintDevice): string => PLANE_KEY[d];

export function openingHint(d: HintDevice, restored: boolean): string {
  if (restored) return 'Welcome back. Your journey is restored.';
  return d === 'touch'
    ? 'Take a walk. Drag to look around; your Field guide holds the other worlds.'
    : `Take a walk. Gather along the way; ${CRAFT_KEY[d]} opens your satchel.`;
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
