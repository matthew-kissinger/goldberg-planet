import { describe, expect, it } from 'vitest';
import { applyForage, forageAt } from '../src/sim/forage';
import type { InventoryItems } from '../src/sim/crafting';

describe('Hearth and Horizon forage ecology', () => {
  it('finds cave mushrooms and sea-cave kelp from cave context', () => {
    const mushroom = forageAt({
      tile: 12,
      day: 0,
      minute: 9 * 60,
      height: -8,
      nearWater: false,
      weatherKind: 'clear',
      caveKind: 'dryCave',
    });
    const kelp = forageAt({
      tile: 12,
      day: 0,
      minute: 9 * 60,
      height: -8,
      nearWater: false,
      weatherKind: 'clear',
      caveKind: 'seaCave',
    });

    expect(mushroom).toMatchObject({ kind: 'caveMushroom', item: 'caveMushroom' });
    expect(mushroom.count).toBeGreaterThanOrEqual(2);
    expect(kelp).toMatchObject({ kind: 'kelp', item: 'kelp' });
    expect(kelp.count).toBeGreaterThanOrEqual(2);
  });

  it('uses cold high terrain for snow herbs', () => {
    const report = forageAt({
      tile: 4,
      day: 0,
      minute: 7 * 60,
      height: 70,
      nearWater: false,
      weatherKind: 'cold',
      caveKind: null,
    });

    expect(report.kind).toBe('snowHerb');
    expect(report.item).toBe('snowHerb');
  });

  it('cuts reeds from shallow shorelines', () => {
    const report = forageAt({
      tile: 0,
      day: 0,
      minute: 8 * 60,
      height: 3,
      nearWater: true,
      weatherKind: 'clear',
      caveKind: null,
    });

    expect(report).toMatchObject({
      kind: 'reeds',
      item: 'reeds',
      label: 'shore reeds',
    });
    expect(report.count).toBeGreaterThanOrEqual(2);
  });

  it('applies forage to inventory and reports empty ground', () => {
    const items: InventoryItems = {};
    const berries = forageAt({
      tile: 2,
      day: 0,
      minute: 3 * 60,
      height: 12,
      nearWater: false,
      weatherKind: 'clear',
      caveKind: null,
    });
    const result = applyForage(items, berries);

    expect(berries.kind).toBe('berryPatch');
    expect(result).toMatchObject({ ok: true, item: 'berries' });
    expect(items.berries).toBeGreaterThan(0);

    const empty = forageAt({
      tile: 0,
      day: 0,
      minute: 18 * 60,
      height: 12,
      nearWater: false,
      weatherKind: 'clear',
      caveKind: null,
    });
    expect(applyForage(items, empty)).toMatchObject({ ok: false, message: 'nothing useful to forage here' });
  });

  it('lets opened threshold effects improve local forage', () => {
    const report = forageAt({
      tile: 0,
      day: 0,
      minute: 18 * 60,
      height: 12,
      nearWater: false,
      weatherKind: 'clear',
      caveKind: null,
      thresholdForageBoost: 0.26,
      thresholdLabel: 'root room cache',
    });

    expect(report).toMatchObject({
      kind: 'berryPatch',
      item: 'berries',
      label: 'root room cache forage',
    });
  });
});
