import { describe, expect, it } from 'vitest';
import {
  bestToolForMaterial,
  bestToolForTree,
  maxReachBonus,
  normalizeToolWear,
  REPAIR_KIT_RESTORE,
  toolSummary,
  useTool,
} from '../src/sim/tools';

describe('Hearth and Horizon tool effects', () => {
  it('selects matching crafted tools for material work', () => {
    expect(bestToolForTree({}).tool).toBeNull();
    expect(bestToolForTree({ stoneHatchet: 1 }).tool).toBe('stoneHatchet');
    expect(bestToolForTree({ stoneHatchet: 1, stoneAxe: 1 }).tool).toBe('stoneAxe');
    expect(bestToolForTree({ stoneAxe: 1 }).tool).toBe('stoneAxe');
    expect(bestToolForTree({ stoneAxe: 1, echoAxe: 1 }).tool).toBe('echoAxe');
    expect(bestToolForMaterial('rock', { stonePick: 1 }).tool).toBe('stonePick');
    expect(bestToolForMaterial('rock', { stonePick: 1, echoPick: 1 }).tool).toBe('echoPick');
    expect(bestToolForMaterial('sand', { stoneShovel: 1 }).tool).toBe('stoneShovel');
    expect(bestToolForMaterial('snow', { echoShovel: 1 }).tool).toBe('echoShovel');
    expect(bestToolForMaterial('dirt', { stonePick: 1 }).tool).toBeNull();
  });

  it('adds reach and faster cooldowns when tools are owned', () => {
    expect(maxReachBonus({})).toBe(0);
    expect(maxReachBonus({ stoneHatchet: 1 })).toBeCloseTo(0.75);
    expect(maxReachBonus({ stoneAxe: 1, stonePick: 1 })).toBeCloseTo(1.35);
    expect(maxReachBonus({ stonePick: 1, echoPick: 1 })).toBeCloseTo(1.95);
    expect(bestToolForTree({ stoneHatchet: 1 }).cooldown).toBeLessThan(0.17);
    expect(bestToolForMaterial('rock', { stonePick: 1 }).cooldown).toBeLessThan(0.17);
    expect(toolSummary({ stoneAxe: 1 }, { stoneAxe: 3 }).owned[0]).toMatchObject({
      tool: 'stoneAxe',
      wear: 3,
      durability: 32,
    });
  });

  it('normalizes and persists only valid wear values', () => {
    expect(normalizeToolWear({ stoneHatchet: 999, stoneAxe: 4.8, stonePick: -1, nope: 99 })).toEqual({ stoneHatchet: 23, stoneAxe: 4 });
    expect(normalizeToolWear({ stonePick: 999 })).toEqual({ stonePick: 37 });
    expect(normalizeToolWear({ echoPick: 999 })).toEqual({ echoPick: 65 });
  });

  it('wears tools on successful use and removes one when durability is exhausted', () => {
    const first = useTool('stoneAxe', { stoneAxe: 2 }, { stoneAxe: 30 });
    expect(first).toMatchObject({ broke: false, wear: { stoneAxe: 31 }, craftedItems: { stoneAxe: 2 } });

    const second = useTool('stoneAxe', first.craftedItems, first.wear);
    expect(second).toMatchObject({ broke: true, wear: {}, craftedItems: { stoneAxe: 1 } });
    expect(second.message).toBe('stone axe broke');
  });

  it('spends a repair kit to save a tool at the break point', () => {
    const result = useTool('stonePick', { stonePick: 1, repairKit: 2 }, { stonePick: 37 });

    expect(result.broke).toBe(false);
    expect(result.repaired).toBe(true);
    expect(result.wear.stonePick).toBe(38 - REPAIR_KIT_RESTORE);
    expect(result.craftedItems).toEqual({ stonePick: 1, repairKit: 1 });
    expect(result.message).toContain('field repair kit saved stone pick');
    expect(toolSummary(result.craftedItems, result.wear).repairKits).toBe(1);
  });

  it('repairs upgraded echo tools with the same field kit contract', () => {
    const result = useTool('echoPick', { echoPick: 1, repairKit: 1 }, { echoPick: 65 });

    expect(result).toMatchObject({
      broke: false,
      repaired: true,
      wear: { echoPick: 66 - REPAIR_KIT_RESTORE },
      craftedItems: { echoPick: 1 },
    });
    expect(result.message).toContain('field repair kit saved echo pick');
  });
});
