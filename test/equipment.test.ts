import { describe, expect, it } from 'vitest';
import {
  backPropsForInventory,
  characterActionForLocomotion,
  defaultHeldProp,
  miningPropForMaterial,
  pickupPropForItem,
  propForStructureInteraction,
} from '../src/sim/equipment';
import type { ItemId } from '../src/sim/crafting';

describe('Hearth and Horizon character equipment rules', () => {
  const owns = (...items: ItemId[]) => (id: ItemId) => items.includes(id);

  it('selects readable tools for mining and chopping when crafted', () => {
    expect(miningPropForMaterial('rock', owns())).toBe('hands');
    expect(miningPropForMaterial('rock', owns('stonePick'))).toBe('stonePick');
    expect(miningPropForMaterial('rock', owns('stonePick', 'echoPick'))).toBe('echoPick');
    expect(miningPropForMaterial('wood', owns('stoneHatchet'))).toBe('stoneHatchet');
    expect(miningPropForMaterial('wood', owns('stoneAxe'))).toBe('stoneAxe');
    expect(miningPropForMaterial('wood', owns('stoneHatchet', 'stoneAxe'))).toBe('stoneAxe');
    expect(miningPropForMaterial('wood', owns('echoAxe'))).toBe('echoAxe');
    expect(miningPropForMaterial('sand', owns('stoneShovel'))).toBe('stoneShovel');
    expect(miningPropForMaterial('snow', owns('echoShovel'))).toBe('echoShovel');
    expect(miningPropForMaterial('dirt', owns('stonePick'))).toBe('hands');
  });

  it('keeps selected build props visible before placement', () => {
    expect(defaultHeldProp(null, 'wood', 0)).toBe('hands');
    expect(defaultHeldProp(null, 'wood', 3)).toBe('wood');
    expect(defaultHeldProp('campfire', 'wood', 3)).toBe('campfire');
    expect(defaultHeldProp('chest', 'wood', 3)).toBe('chest');
    expect(defaultHeldProp('bedroll', 'wood', 3)).toBe('bedroll');
  });

  it('maps structure interactions to readable hand props', () => {
    expect(propForStructureInteraction('campfire', 'cook')).toBe('campMeal');
    expect(propForStructureInteraction('campfire', 'lit')).toBe('torch');
    expect(propForStructureInteraction('echoLantern', 'lit')).toBe('torch');
    expect(propForStructureInteraction('bedroll', 'home')).toBe('bedroll');
    expect(propForStructureInteraction('chest')).toBe('chest');
  });

  it('shows collected world drops as the picked-up item prop', () => {
    expect(pickupPropForItem('wood')).toBe('wood');
    expect(pickupPropForItem('glowCrystal')).toBe('glowCrystal');
    expect(pickupPropForItem('rawFish')).toBe('rawFish');
  });

  it('shows owned tools on the backpack in stable priority order', () => {
    expect(backPropsForInventory(owns('packFrame', 'stormCloak', 'fishingRod', 'reeds', 'stoneHatchet', 'stonePick', 'echoPick', 'repairKit', 'echoLantern'))).toEqual(['packFrame', 'stormCloak', 'echoPick', 'stoneHatchet', 'stonePick', 'repairKit', 'fishingRod', 'reeds', 'echoLantern']);
    expect(backPropsForInventory(owns('expeditionStew'))).toEqual(['expeditionStew']);
  });

  it('derives readable locomotion poses from player movement state', () => {
    expect(characterActionForLocomotion({ mode: 'walk', speed: 0.1, grounded: true, submerged: 0, sprinting: false })).toBe('idle');
    expect(characterActionForLocomotion({ mode: 'walk', speed: 3, grounded: true, submerged: 0, sprinting: false })).toBe('move');
    expect(characterActionForLocomotion({ mode: 'walk', speed: 8, grounded: true, submerged: 0, sprinting: false })).toBe('sprint');
    expect(characterActionForLocomotion({ mode: 'walk', speed: 3, grounded: false, submerged: 0, sprinting: false })).toBe('jump');
    expect(characterActionForLocomotion({ mode: 'walk', speed: 1, grounded: true, submerged: 0.7, sprinting: false })).toBe('swim');
    expect(characterActionForLocomotion({ mode: 'plane', speed: 30, grounded: false, submerged: 0, sprinting: false })).toBe('plane');
  });
});
