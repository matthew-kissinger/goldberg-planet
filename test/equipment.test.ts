import { describe, expect, it } from 'vitest';
import {
  backPropsForInventory,
  characterActionForLocomotion,
  defaultHeldProp,
  miningPropForMaterial,
  nativeDefenseActionForProp,
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
    expect(defaultHeldProp('dockSegment', 'wood', 3)).toBe('dockSegment');
    expect(defaultHeldProp('fishTrap', 'wood', 3)).toBe('fishTrap');
    expect(defaultHeldProp('shoreNet', 'wood', 3)).toBe('shoreNet');
    expect(defaultHeldProp('dryingRack', 'wood', 3)).toBe('dryingRack');
    expect(defaultHeldProp('compostBin', 'wood', 3)).toBe('compostBin');
    expect(defaultHeldProp('rainCistern', 'wood', 3)).toBe('rainCistern');
    expect(defaultHeldProp('rootCellar', 'wood', 3)).toBe('rootCellar');
    expect(defaultHeldProp('caveAnchor', 'wood', 3)).toBe('caveAnchor');
    expect(defaultHeldProp('weatherVane', 'wood', 3)).toBe('weatherVane');
  });

  it('maps structure interactions to readable hand props', () => {
    expect(propForStructureInteraction('cropPlot', 'plant')).toBe('seeds');
    expect(propForStructureInteraction('campfire', 'cook')).toBe('campMeal');
    expect(propForStructureInteraction('lantern', 'lit')).toBe('torch');
    expect(propForStructureInteraction('bedroll', 'home')).toBe('bedroll');
    expect(propForStructureInteraction('chest')).toBe('chest');
    expect(propForStructureInteraction('dockSegment', 'inspect')).toBe('dockSegment');
    expect(propForStructureInteraction('compostBin', 'compost')).toBe('compost');
    expect(propForStructureInteraction('cropPlot', 'fertilize')).toBe('compost');
    expect(propForStructureInteraction('rainCistern', 'collectWater')).toBe('waterJar');
    expect(propForStructureInteraction('cropPlot', 'irrigate')).toBe('waterJar');
    expect(propForStructureInteraction('rootCellar', 'cache')).toBe('trailRation');
    expect(propForStructureInteraction('rootCellar', 'withdrawProvision')).toBe('trailRation');
    expect(propForStructureInteraction('caveAnchor', 'anchor')).toBe('caveAnchor');
    expect(propForStructureInteraction('cropPlot', 'plantReeds')).toBe('reeds');
    expect(propForStructureInteraction('cropPlot', 'harvest')).toBe('berries');
    expect(propForStructureInteraction('fishTrap', 'setTrap')).toBe('bait');
    expect(propForStructureInteraction('fishTrap', 'collectTrap')).toBe('rawFish');
    expect(propForStructureInteraction('shoreNet', 'setNet')).toBe('shoreNet');
    expect(propForStructureInteraction('shoreNet', 'collectNet')).toBe('rawFish');
    expect(propForStructureInteraction('dryingRack', 'preserve')).toBe('trailRation');
    expect(propForStructureInteraction('weatherVane', 'forecast')).toBe('weatherVane');
    expect(propForStructureInteraction('waystone', 'mark')).toBe('map');
  });

  it('shows collected world drops as the picked-up item prop', () => {
    expect(pickupPropForItem('wood')).toBe('wood');
    expect(pickupPropForItem('glowCrystal')).toBe('glowCrystal');
    expect(pickupPropForItem('rawFish')).toBe('rawFish');
  });

  it('maps native hazard counters to explicit readable avatar actions', () => {
    expect(nativeDefenseActionForProp('stoneBlade')).toBe('ward');
    expect(nativeDefenseActionForProp('stoneHatchet')).toBe('ward');
    expect(nativeDefenseActionForProp('lantern')).toBe('ward');
    expect(nativeDefenseActionForProp('stormCloak')).toBe('brace');
    expect(nativeDefenseActionForProp('reedBow')).toBe('shoot');
    expect(nativeDefenseActionForProp('hands')).toBe('interact');
  });

  it('shows owned tools on the backpack in stable priority order', () => {
    expect(backPropsForInventory(owns('packFrame', 'stormCloak', 'fishingRod', 'reedBow', 'whistlingArrow', 'fishTrap', 'shoreNet', 'reeds', 'stoneHatchet', 'stoneBlade', 'stonePick', 'echoPick', 'repairKit', 'lantern', 'echoLantern', 'horizonChart', 'waystone', 'weatherVane', 'rootCellar', 'caveAnchor'))).toEqual(['packFrame', 'stormCloak', 'echoPick', 'stoneHatchet', 'stoneBlade', 'stonePick', 'repairKit', 'fishingRod', 'reedBow', 'whistlingArrow', 'fishTrap', 'shoreNet', 'reeds', 'lantern', 'echoLantern', 'horizonChart', 'waystone', 'weatherVane', 'rootCellar', 'caveAnchor']);
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
