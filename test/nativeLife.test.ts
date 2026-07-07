import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';
import {
  nativeCreatureAt,
  nativeCreatureSitesAround,
  nearestNativeCreatureSite,
  normalizeNativeCreatureTends,
  normalizeNativeCreatureWards,
  tendNativeCreature,
  wardNativeCreature,
} from '../src/sim/nativeLife';

describe('planet-native harmless life', () => {
  const geo = new Goldberg(16);
  const layers = buildLayers();

  it('finds deterministic moss-puff sites on grassy forest edges', () => {
    const seed = 'native-life-test';
    const terrainA = new Terrain(seed);
    const terrainB = new Terrain(seed);
    const columnsA = new Columns(geo, layers, terrainA);
    const columnsB = new Columns(geo, layers, terrainB);
    const first = nearestNativeCreatureSite(seed, geo, columnsA, terrainA, 0, 80, new Set(), new Set(), 'mossPuff');
    expect(first).not.toBeNull();
    const aroundA = nativeCreatureSitesAround(seed, geo, columnsA, terrainA, first!.tile, 5);
    const aroundB = nativeCreatureSitesAround(seed, geo, columnsB, terrainB, first!.tile, 5);
    expect(aroundA.length).toBeGreaterThan(0);
    expect(aroundA.map((site) => ({ id: site.id, tile: site.tile, label: site.label, reward: site.reward })))
      .toEqual(aroundB.map((site) => ({ id: site.id, tile: site.tile, label: site.label, reward: site.reward })));
  });

  it('tends once, returns seed rewards, and normalizes saved tend ids', () => {
    const seed = 'native-life-tend';
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    const site = nearestNativeCreatureSite(seed, geo, columns, terrain, 0, 90, new Set(), new Set(), 'mossPuff');
    expect(site).not.toBeNull();
    const tended = new Set<number>();
    const first = tendNativeCreature(tended, site!);
    expect(first.ok).toBe(true);
    expect(first.item).toBe('seeds');
    expect(first.count).toBeGreaterThan(0);
    expect(tended.has(site!.id)).toBe(true);
    const second = tendNativeCreature(tended, site!);
    expect(second.ok).toBe(false);
    expect(second.alreadyTended).toBe(true);
    expect(normalizeNativeCreatureTends([site!.id, site!.id, 2.8, 'bad'])).toEqual([2, site!.id].sort((a, b) => a - b));
  });

  it('finds harmless shell-skitters on shorelines and coaxes fishing scraps', () => {
    const seed = 'native-life-shore';
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    const site = nearestNativeCreatureSite(seed, geo, columns, terrain, 0, 220, new Set(), new Set(), 'shellSkitter');
    expect(site).not.toBeNull();
    expect(site!.temperament).toBe('harmless');
    expect(['bait', 'kelp']).toContain(site!.reward.item);
    expect(site!.hint).toContain('shore food');

    const tended = new Set<number>();
    const first = tendNativeCreature(tended, site!);
    expect(first.ok).toBe(true);
    expect(first.message).toContain('coaxed from its shell');
    expect(first.count).toBeGreaterThan(0);
    expect(tended.has(site!.id)).toBe(true);
  });

  it('finds harmless reedback grazers near wet grass and scratches compost loose', () => {
    const seed = 'native-life-reedback';
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    const site = nearestNativeCreatureSite(seed, geo, columns, terrain, 0, 240, new Set(), new Set(), 'reedbackGrazer');
    expect(site).not.toBeNull();
    expect(site!.temperament).toBe('harmless');
    expect(site!.reward.item).toBe('compost');
    expect(site!.hint).toContain('gardens');

    const tended = new Set<number>();
    const first = tendNativeCreature(tended, site!);
    expect(first.ok).toBe(true);
    expect(first.message).toContain('reed mane');
    expect(first.item).toBe('compost');
    expect(first.count).toBeGreaterThan(0);
    expect(tended.has(site!.id)).toBe(true);
  });

  it('finds harmless cave blinkers at cave mouths and matches blink rhythm for mushrooms', () => {
    const seed = 'native-life-cave-blinker';
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    let site = null as ReturnType<typeof nativeCreatureAt>;
    for (let tile = 0; tile < geo.count; tile++) {
      const candidate = nativeCreatureAt(seed, geo, columns, terrain, tile);
      if (candidate?.kind === 'caveBlinker') {
        site = candidate;
        break;
      }
    }
    expect(site).not.toBeNull();
    expect(site!.temperament).toBe('harmless');
    expect(site!.reward.item).toBe('caveMushroom');
    expect(site!.hint).toContain('cave-focus');

    const tended = new Set<number>();
    const first = tendNativeCreature(tended, site!);
    expect(first.ok).toBe(true);
    expect(first.message).toContain('blink rhythm');
    expect(first.item).toBe('caveMushroom');
    expect(first.count).toBeGreaterThan(0);
    expect(tended.has(site!.id)).toBe(true);
  });

  it('wards territorial bramblebacks only when prepared and saves ward ids', () => {
    const seed = 'native-life-hazard';
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    const site = nearestNativeCreatureSite(seed, geo, columns, terrain, 0, 160, new Set(), new Set(), 'brambleback');
    expect(site).not.toBeNull();
    expect(site!.temperament).toBe('territorial');
    expect(site!.reward.item).toBe('reeds');
    expect(site!.pressure?.exposure).toBeGreaterThan(0);
    expect(site!.hint).toContain('whistling arrows');

    const warded = new Set<number>();
    const bare = wardNativeCreature(warded, site!, false);
    expect(bare).toMatchObject({ ok: false, prepared: false, pressureApplied: true });
    expect(bare.message).toContain('whistling arrows');
    expect(warded.has(site!.id)).toBe(false);

    const prepared = wardNativeCreature(warded, site!, true);
    expect(prepared.ok).toBe(true);
    expect(prepared.item).toBe('reeds');
    expect(prepared.count).toBeGreaterThan(0);
    expect(warded.has(site!.id)).toBe(true);

    const second = wardNativeCreature(warded, site!, true);
    expect(second).toMatchObject({ ok: false, alreadyWarded: true, pressureApplied: false });
    expect(normalizeNativeCreatureWards([site!.id, site!.id, 3.9, 'bad'])).toEqual([3, site!.id].sort((a, b) => a - b));
  });

  it('spawns cave bell-jaws as light-or-blade cave hazards with glow rewards', () => {
    const seed = 'native-life-cave-belljaw';
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    let site = null as ReturnType<typeof nativeCreatureAt>;
    for (let tile = 0; tile < geo.count; tile++) {
      const candidate = nativeCreatureAt(seed, geo, columns, terrain, tile);
      if (candidate?.kind === 'caveBelljaw') {
        site = candidate;
        break;
      }
    }
    expect(site).not.toBeNull();
    expect(site!.temperament).toBe('territorial');
    expect(site!.reward.item).toBe('glowCrystal');
    expect(site!.pressure?.stamina).toBeGreaterThan(0);
    expect(site!.pressure?.label).toContain('jaw');
    expect(site!.hint).toContain('light');

    const warded = new Set<number>();
    const bare = wardNativeCreature(warded, site!, false);
    expect(bare).toMatchObject({ ok: false, prepared: false, pressureApplied: true });
    expect(bare.message).toContain('stone jaw');
    expect(warded.has(site!.id)).toBe(false);

    const prepared = wardNativeCreature(warded, site!, true);
    expect(prepared.ok).toBe(true);
    expect(prepared.item).toBe('glowCrystal');
    expect(prepared.message).toContain('lit cave seam');
    expect(warded.has(site!.id)).toBe(true);
  });

  it('spawns scree-snappers as mining-noise combat hazards with stun/flee rewards', () => {
    const seed = 'native-life-scree-snapper';
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    let site = null as ReturnType<typeof nativeCreatureAt>;
    for (let tile = 0; tile < geo.count; tile++) {
      const candidate = nativeCreatureAt(seed, geo, columns, terrain, tile);
      if (candidate?.kind === 'screeSnapper') {
        site = candidate;
        break;
      }
    }
    expect(site).not.toBeNull();
    expect(site!.temperament).toBe('combative');
    expect(site!.reward.item).toBe('rock');
    expect(site!.combat?.telegraph).toContain('plates');
    expect(site!.combat?.weakness).toContain('blade');
    expect(site!.combat?.result).toContain('flees');
    expect(site!.hint).toContain('mining');

    const warded = new Set<number>();
    const bare = wardNativeCreature(warded, site!, false);
    expect(bare).toMatchObject({ ok: false, prepared: false, pressureApplied: true });
    expect(bare.message).toContain('jaw plates');
    expect(warded.has(site!.id)).toBe(false);

    const prepared = wardNativeCreature(warded, site!, true);
    expect(prepared.ok).toBe(true);
    expect(prepared.item).toBe('rock');
    expect(prepared.message).toContain('skitters under scree');
    expect(warded.has(site!.id)).toBe(true);
  });

  it('spawns storm burrs as weather-bound hazards with brace/stun rewards', () => {
    const seed = 'native-life-storm-burr';
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    let site = null as ReturnType<typeof nativeCreatureAt>;
    for (let tile = 0; tile < geo.count; tile++) {
      const candidate = nativeCreatureAt(seed, geo, columns, terrain, tile);
      if (candidate?.kind === 'stormBurr') {
        site = candidate;
        break;
      }
    }
    expect(site).not.toBeNull();
    expect(site!.temperament).toBe('territorial');
    expect(site!.reward.item).toBe('reeds');
    expect(site!.pressure?.label).toContain('burr');
    expect(site!.combat?.telegraph).toContain('quills');
    expect(site!.combat?.weakness).toContain('storm cloak');
    expect(site!.combat?.result).toContain('tumbles away');
    expect(site!.hint).toContain('storm');

    const warded = new Set<number>();
    const bare = wardNativeCreature(warded, site!, false);
    expect(bare).toMatchObject({ ok: false, prepared: false, pressureApplied: true });
    expect(bare.message).toContain('quills');
    expect(warded.has(site!.id)).toBe(false);

    const prepared = wardNativeCreature(warded, site!, true);
    expect(prepared.ok).toBe(true);
    expect(prepared.item).toBe('reeds');
    expect(prepared.message).toContain('tumbles away');
    expect(warded.has(site!.id)).toBe(true);
  });

  it('spawns tide lurkers as sea-cave fishing hazards with light and bow counters', () => {
    const seed = 'native-life-tide-lurker';
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    let site = null as ReturnType<typeof nativeCreatureAt>;
    for (let tile = 0; tile < geo.count; tile++) {
      const candidate = nativeCreatureAt(seed, geo, columns, terrain, tile);
      if (candidate?.kind === 'tideLurker') {
        site = candidate;
        break;
      }
    }
    expect(site).not.toBeNull();
    expect(site!.temperament).toBe('territorial');
    expect(site!.reward.item).toBe('rawFish');
    expect(site!.pressure?.label).toMatch(/tide|snap/);
    expect(site!.combat?.telegraph).toContain('eye bulbs');
    expect(site!.combat?.weakness).toContain('lantern');
    expect(site!.combat?.weakness).toContain('whistling arrow');
    expect(site!.combat?.result).toContain('scatters fish');
    expect(site!.hint).toContain('sea-cave casts');

    const warded = new Set<number>();
    const bare = wardNativeCreature(warded, site!, false);
    expect(bare).toMatchObject({ ok: false, prepared: false, pressureApplied: true });
    expect(bare.message).toContain('eye bulbs');
    expect(warded.has(site!.id)).toBe(false);

    const prepared = wardNativeCreature(warded, site!, true);
    expect(prepared.ok).toBe(true);
    expect(prepared.item).toBe('rawFish');
    expect(prepared.message).toContain('cave tide');
    expect(warded.has(site!.id)).toBe(true);
  });
});
