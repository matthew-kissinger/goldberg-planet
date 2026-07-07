import type { ItemId, MaterialItemId } from './crafting';

export type CharacterAction =
  | 'idle'
  | 'move'
  | 'sprint'
  | 'jump'
  | 'swim'
  | 'plane'
  | 'mine'
  | 'chop'
  | 'build'
  | 'craft'
  | 'fish'
  | 'farm'
  | 'cook'
  | 'pickup'
  | 'ward'
  | 'shoot'
  | 'brace'
  | 'stagger'
  | 'sleep'
  | 'discover'
  | 'interact';

export type CharacterPropId = ItemId | 'hands' | 'map' | 'torch' | 'waterJar';

export const CHARACTER_PROP_IDS: readonly CharacterPropId[] = [
  'hands',
  'map',
  'torch',
  'dirt',
  'rock',
  'sand',
  'snow',
  'wood',
  'sticks',
  'workbench',
  'stoneHatchet',
  'stoneBlade',
  'stoneAxe',
  'stonePick',
  'stoneShovel',
  'echoAxe',
  'echoPick',
  'echoShovel',
  'packFrame',
  'stormCloak',
  'repairKit',
  'fishingRod',
  'reedBow',
  'whistlingArrow',
  'bait',
  'seeds',
  'compost',
  'berries',
  'caveMushroom',
  'snowHerb',
  'kelp',
  'reeds',
  'rawFish',
  'cookedFish',
  'campMeal',
  'trailRation',
  'expeditionStew',
  'glowCrystal',
  'campfire',
  'chest',
  'bedroll',
  'cropPlot',
  'compostBin',
  'rainCistern',
  'rootCellar',
  'caveAnchor',
  'waterJar',
  'doorKit',
  'windowFrame',
  'roofBundle',
  'dockSegment',
  'fishTrap',
  'shoreNet',
  'dryingRack',
  'weatherVane',
  'lantern',
  'waystone',
  'echoLantern',
  'horizonChart',
  'planeFrame',
] as const;

export interface CharacterVisualState {
  action: CharacterAction;
  held: CharacterPropId;
  backProps: CharacterPropId[];
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

export function miningPropForMaterial(material: MaterialItemId, hasItem: (id: ItemId) => boolean): CharacterPropId {
  if (material === 'wood') return hasItem('echoAxe') ? 'echoAxe' : hasItem('stoneAxe') ? 'stoneAxe' : hasItem('stoneHatchet') ? 'stoneHatchet' : 'hands';
  if (material === 'rock') return hasItem('echoPick') ? 'echoPick' : hasItem('stonePick') ? 'stonePick' : 'hands';
  if (material === 'dirt' || material === 'sand' || material === 'snow') {
    return hasItem('echoShovel') ? 'echoShovel' : hasItem('stoneShovel') ? 'stoneShovel' : 'hands';
  }
  return 'hands';
}

export function defaultHeldProp(
  selectedStructure: ItemId | null | undefined,
  selectedMaterial: MaterialItemId,
  selectedMaterialCount: number,
): CharacterPropId {
  if (selectedStructure) return selectedStructure;
  return selectedMaterialCount > 0 ? selectedMaterial : 'hands';
}

export function propForStructureInteraction(item: ItemId, mode?: string): CharacterPropId {
  if (mode === 'fertilize' || item === 'compostBin' || mode === 'compost') return 'compost';
  if (item === 'rainCistern' || mode === 'collectWater' || mode === 'irrigate') return 'waterJar';
  if (item === 'rootCellar' || mode === 'cache' || mode === 'withdrawProvision') return 'trailRation';
  if (item === 'caveAnchor' || mode === 'anchor') return 'caveAnchor';
  if (item === 'cropPlot' || mode === 'plant' || mode === 'plantReeds' || mode === 'tend' || mode === 'harvest') return mode === 'plantReeds' ? 'reeds' : mode === 'harvest' ? 'berries' : 'seeds';
  if (item === 'campfire' && mode === 'cook') return 'campMeal';
  if (item === 'dryingRack') return mode === 'preserve' ? 'trailRation' : 'dryingRack';
  if (item === 'fishTrap') return mode === 'collectTrap' ? 'rawFish' : mode === 'setTrap' ? 'bait' : 'fishTrap';
  if (item === 'shoreNet') return mode === 'collectNet' ? 'rawFish' : mode === 'setNet' || mode === 'checkNet' ? 'shoreNet' : 'shoreNet';
  if (item === 'weatherVane' || mode === 'forecast') return 'weatherVane';
  if (item === 'campfire' || item === 'lantern' || item === 'echoLantern' || mode === 'lit' || mode === 'unlit') return 'torch';
  if (item === 'bedroll' || mode === 'home') return 'bedroll';
  if (item === 'chest') return 'chest';
  if (item === 'dockSegment') return mode === 'inspect' ? 'dockSegment' : 'fishingRod';
  if (item === 'waystone') return 'map';
  return item;
}

export function pickupPropForItem(item: ItemId): CharacterPropId {
  return item;
}

export function nativeDefenseActionForProp(prop: CharacterPropId): CharacterAction {
  if (prop === 'reedBow' || prop === 'whistlingArrow') return 'shoot';
  if (prop === 'stormCloak') return 'brace';
  if (
    prop === 'stoneBlade'
    || prop === 'stoneHatchet'
    || prop === 'stoneAxe'
    || prop === 'echoAxe'
    || prop === 'lantern'
    || prop === 'echoLantern'
    || prop === 'torch'
  ) return 'ward';
  return 'interact';
}

export function backPropsForInventory(hasItem: (id: ItemId) => boolean): CharacterPropId[] {
  const props: CharacterPropId[] = [];
  for (const id of ['packFrame', 'stormCloak', 'echoAxe', 'echoPick', 'echoShovel', 'stoneAxe', 'stoneHatchet', 'stoneBlade', 'stonePick', 'stoneShovel', 'repairKit', 'fishingRod', 'reedBow', 'whistlingArrow', 'fishTrap', 'shoreNet', 'reeds', 'lantern', 'echoLantern', 'horizonChart', 'waystone', 'weatherVane', 'rootCellar', 'caveAnchor', 'expeditionStew'] as const) {
    if (hasItem(id)) props.push(id);
  }
  return props;
}
