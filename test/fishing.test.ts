import { describe, expect, it } from 'vitest';
import { applyFishingCatch, fishingCueForSchool, fishSchoolAt } from '../src/sim/fishing';
import type { InventoryItems } from '../src/sim/crafting';

describe('Hearth and Horizon fishing ecology', () => {
  it('keeps dry ground from producing fish schools', () => {
    const school = fishSchoolAt({
      tile: 42,
      day: 0,
      minute: 12 * 60,
      nearWater: false,
      bait: 3,
      weatherKind: 'clear',
      caveKind: null,
    });

    expect(school).toMatchObject({ kind: 'none', catchCount: 0, usesBait: false });
    expect(applyFishingCatch({}, school)).toMatchObject({ ok: false, message: 'fishing needs water beside you' });
  });

  it('uses bait to turn a quiet shore nibble into a stronger catch', () => {
    const school = fishSchoolAt({
      tile: 0,
      day: 0,
      minute: 18 * 60,
      nearWater: true,
      bait: 1,
      weatherKind: 'clear',
      caveKind: null,
    });
    const items: InventoryItems = { bait: 1 };
    const result = applyFishingCatch(items, school);

    expect(school.usesBait).toBe(true);
    expect(result).toMatchObject({ ok: true, item: 'rawFish', count: 2, usedBait: true });
    expect(items).toEqual({ rawFish: 2 });
  });

  it('turns storm and sea-cave conditions into richer fish runs', () => {
    const storm = fishSchoolAt({
      tile: 8,
      day: 1,
      minute: 7 * 60,
      nearWater: true,
      bait: 0,
      weatherKind: 'storm',
      caveKind: null,
    });
    const cave = fishSchoolAt({
      tile: 8,
      day: 1,
      minute: 7 * 60,
      nearWater: false,
      bait: 1,
      weatherKind: 'clear',
      caveKind: 'seaCave',
    });

    expect(storm.kind).toBe('storm');
    expect(storm.catchCount).toBe(2);
    expect(cave).toMatchObject({ kind: 'cave', catchCount: 3, usesBait: true });
  });

  it('turns dock segments into stronger local fishing stations', () => {
    const dock = fishSchoolAt({
      tile: 42,
      day: 0,
      minute: 12 * 60,
      nearWater: false,
      dock: true,
      bait: 0,
      weatherKind: 'clear',
      caveKind: null,
    });
    const items: InventoryItems = {};
    const result = applyFishingCatch(items, dock);

    expect(dock).toMatchObject({ kind: 'dock', label: 'dockside fish run', catchCount: 2 });
    expect(result).toMatchObject({ ok: true, item: 'rawFish', count: 2 });
    expect(items).toEqual({ rawFish: 2 });
  });

  it('formats compact player-facing fishing cues without changing catch math', () => {
    const storm = fishSchoolAt({
      tile: 8,
      day: 1,
      minute: 7 * 60,
      nearWater: true,
      bait: 1,
      weatherKind: 'storm',
      caveKind: null,
    });
    const quiet = fishSchoolAt({
      tile: 0,
      day: 0,
      minute: 18 * 60,
      nearWater: true,
      bait: 0,
      weatherKind: 'clear',
      caveKind: null,
    });

    expect(fishingCueForSchool(storm, { hasRod: true, nearWater: true, castLabel: 'B cast' })).toMatchObject({
      action: 'cast',
      canCast: true,
      showInVitals: true,
      hud: 'B cast: storm fish run · +3 raw fish · bait ready',
      catchCount: 3,
      usesBait: true,
    });
    expect(fishingCueForSchool(quiet, { hasRod: true, nearWater: true })).toMatchObject({
      action: 'wait',
      canCast: true,
      hud: 'R cast: quiet water · bait may help',
      catchCount: 0,
    });
    expect(fishingCueForSchool(quiet, { hasRod: false, nearWater: true })).toMatchObject({
      action: 'craftRod',
      canCast: false,
      showInVitals: true,
      hud: 'craft fishing rod to cast',
      failureReason: 'no rod',
    });
  });
});
