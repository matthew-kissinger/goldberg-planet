import { describe, expect, it } from 'vitest';
import {
  advanceTime,
  eatBestFood,
  isHazardWeather,
  normalizeSurvivalState,
  normalizeTimeState,
  normalizeWeatherState,
  prepareHearthSupper,
  recoverFromCollapse,
  restAtShelter,
  shouldCollapse,
  survivalReport,
  updateSurvival,
  waitForWeatherWindow,
  weatherProtectionForInventory,
  weatherAt,
  type SurvivalState,
  type WeatherReport,
} from '../src/sim/survival';
import type { InventoryItems } from '../src/sim/crafting';

describe('Hearth and Horizon survival pressure', () => {
  it('normalizes saved survival, clock, and weather values', () => {
    expect(normalizeSurvivalState({ stamina: 140, exposure: -4, mealsEaten: 2.8, collapseCount: 1.9, trailFocus: 900 })).toEqual({ stamina: 100, exposure: 0, mealsEaten: 2, collapseCount: 1, trailFocus: 720 });
    expect(normalizeTimeState({ day: 2.8, minute: 9000 })).toEqual({ day: 2, minute: 1439.999 });
    expect(normalizeWeatherState({ phase: 0.25 })).toEqual({ phase: 0.25 });
  });

  it('advances expedition time and creates local weather reports', () => {
    const time = normalizeTimeState({ day: 0, minute: 23 * 60 + 59 });
    const weather = normalizeWeatherState({ phase: 0 });
    advanceTime(time, weather, 12, 10);
    expect(time.day).toBe(1);
    expect(time.minute).toBeCloseTo(119, 5);
    expect(weatherAt(time, weather, 4, 80, 0).kind).toBe('cold');
    expect(weatherAt(time, weather, 4, 10, 1).kind).toBe('soaked');
  });

  it('lets pentagon domains bias local weather signatures', () => {
    const time = normalizeTimeState({ day: 0, minute: 12 * 60 });
    const weather = normalizeWeatherState({ phase: 0.1 });

    expect(weatherAt(time, weather, 8, 8, 0, { effect: 'storm', intensity: 1 }).label).toBe('storm-seat squall');
    expect(weatherAt(time, weather, 6, 20, 0, { effect: 'cold', intensity: 1 }).label).toBe('snow-dial cold');
    expect(weatherAt(time, normalizeWeatherState({ phase: 0.75 }), 0, 6, 0, { effect: 'hearth', intensity: 1 }).label).toBe('warm clear');
  });

  it('drains stamina and raises exposure outside, then recovers in a warm shelter', () => {
    const state: SurvivalState = { stamina: 80, exposure: 20, mealsEaten: 0, collapseCount: 0 };
    const storm = { kind: 'storm' as const, label: 'storm front', intensity: 1, exposureRate: 2, staminaRegen: 0.4 };

    updateSurvival(state, {
      dt: 5,
      moving: true,
      sprinting: true,
      swimming: false,
      sheltered: false,
      functionalShelter: false,
      nearWarmth: false,
      weather: storm,
    });
    expect(state.stamina).toBeLessThan(62);
    expect(state.exposure).toBeGreaterThan(28);

    updateSurvival(state, {
      dt: 5,
      moving: false,
      sprinting: false,
      swimming: false,
      sheltered: true,
      functionalShelter: true,
      nearWarmth: true,
      weather: storm,
    });
    expect(state.stamina).toBeGreaterThan(80);
    expect(state.exposure).toBeLessThan(15);
    expect(survivalReport(state, storm).status).toBe('rested');
  });

  it('makes heavy carried packs a soft movement pressure', () => {
    const plainState: SurvivalState = { stamina: 80, exposure: 10, mealsEaten: 0, collapseCount: 0 };
    const loadedState: SurvivalState = { stamina: 80, exposure: 10, mealsEaten: 0, collapseCount: 0 };
    const clear: WeatherReport = { kind: 'clear', label: 'clear', intensity: 0.2, exposureRate: -0.2, staminaRegen: 1 };
    const base = {
      dt: 5,
      moving: true,
      sprinting: false,
      swimming: false,
      sheltered: false,
      functionalShelter: false,
      nearWarmth: false,
      weather: clear,
    };

    updateSurvival(plainState, base);
    updateSurvival(loadedState, {
      ...base,
      packBurden: { label: 'overloaded pack', staminaDrain: 1.35, exposureRate: 0.14, sprintBlocked: true },
    });

    expect(loadedState.stamina).toBeLessThan(plainState.stamina);
    expect(loadedState.exposure).toBeGreaterThan(plainState.exposure);
  });

  it('uses a storm cloak to soften hazardous weather without acting as shelter', () => {
    const plainState: SurvivalState = { stamina: 55, exposure: 30, mealsEaten: 0, collapseCount: 0 };
    const cloakedState: SurvivalState = { stamina: 55, exposure: 30, mealsEaten: 0, collapseCount: 0 };
    const storm: WeatherReport = { kind: 'storm', label: 'storm front', intensity: 1, exposureRate: 2, staminaRegen: 0.4 };
    const cloak = weatherProtectionForInventory({ stormCloak: 1 }, storm)!;

    expect(cloak).toMatchObject({ active: true, label: 'storm cloak', weatherExposureMultiplier: 0.68 });

    const base = {
      dt: 5,
      moving: true,
      sprinting: false,
      swimming: false,
      sheltered: false,
      functionalShelter: false,
      nearWarmth: false,
      weather: storm,
    };
    updateSurvival(plainState, base);
    updateSurvival(cloakedState, { ...base, weatherProtection: cloak });

    expect(cloakedState.exposure).toBeLessThan(plainState.exposure);
    expect(cloakedState.stamina).toBeGreaterThan(plainState.stamina);
    expect(cloakedState.exposure).toBeGreaterThan(30);
  });

  it('eats the best packed food and improves expedition state', () => {
    const items: InventoryItems = { berries: 3, campMeal: 1, cookedFish: 1 };
    const state: SurvivalState = { stamina: 30, exposure: 40, mealsEaten: 0, collapseCount: 0 };
    const meal = eatBestFood(items, state);
    expect(meal).toMatchObject({ ok: true, item: 'campMeal' });
    expect(items.campMeal).toBeUndefined();
    expect(items.cookedFish).toBe(1);
    expect(state.stamina).toBe(86);
    expect(state.exposure).toBe(24);
    expect(state.mealsEaten).toBe(1);
  });

  it('prefers trail rations over loose cooked fish for expedition recovery', () => {
    const items: InventoryItems = { cookedFish: 1, trailRation: 1 };
    const state: SurvivalState = { stamina: 25, exposure: 42, mealsEaten: 0, collapseCount: 0 };

    const ration = eatBestFood(items, state);
    expect(ration).toMatchObject({ ok: true, item: 'trailRation', label: 'trail ration' });
    expect(items).toEqual({ cookedFish: 1 });
    expect(state.stamina).toBe(73);
    expect(state.exposure).toBe(28);
    expect(state.mealsEaten).toBe(1);
  });

  it('eats expedition stew first and grants timed trail focus', () => {
    const items: InventoryItems = { campMeal: 1, trailRation: 1, expeditionStew: 1 };
    const state: SurvivalState = { stamina: 20, exposure: 50, mealsEaten: 0, collapseCount: 0, trailFocus: 30 };

    const stew = eatBestFood(items, state);
    expect(stew).toMatchObject({ ok: true, item: 'expeditionStew', label: 'expedition stew', trailFocusGain: 240 });
    expect(items).toEqual({ campMeal: 1, trailRation: 1 });
    expect(state.stamina).toBe(84);
    expect(state.exposure).toBe(28);
    expect(state.trailFocus).toBe(240);
    expect(stew.message).toContain('trail focus 240m');
  });

  it('turns a stocked functional home into a departure supper with trail focus', () => {
    const state: SurvivalState = { stamina: 58, exposure: 34, mealsEaten: 1, collapseCount: 0, trailFocus: 45 };

    const supper = prepareHearthSupper(state, {
      protected: true,
      functional: true,
      hasWarmth: true,
      comfort: 5,
      cellarProvisions: 2,
    });

    expect(supper).toMatchObject({
      ok: true,
      provisionsSpent: 1,
      label: 'hearth supper',
      trailFocusGain: 240,
    });
    expect(state.stamina).toBe(100);
    expect(state.exposure).toBe(16);
    expect(state.trailFocus).toBe(240);
    expect(state.mealsEaten).toBe(2);
    expect(supper.message).toContain('cellar provision -1');

    const blocked = prepareHearthSupper(state, {
      protected: true,
      functional: true,
      hasWarmth: true,
      comfort: 5,
      cellarProvisions: 0,
    });
    expect(blocked).toMatchObject({ ok: false, message: 'hearth supper needs cellar provisions' });
  });

  it('uses trail focus to soften cave and flight pressure', () => {
    const plainState: SurvivalState = { stamina: 60, exposure: 20, mealsEaten: 0, collapseCount: 0 };
    const focusState: SurvivalState = { stamina: 60, exposure: 20, mealsEaten: 0, collapseCount: 0, trailFocus: 120 };
    const storm: WeatherReport = { kind: 'storm', label: 'storm front', intensity: 1, exposureRate: 1.6, staminaRegen: 0.45 };
    const cave = { active: true, label: 'dark dry cave', exposureRate: 1.4, staminaRegen: 0.6, light: 'dark' as const, message: 'dark dry cave pressure' };

    const ctx = {
      dt: 5,
      moving: true,
      sprinting: false,
      swimming: false,
      flying: true,
      minutesElapsed: 65,
      sheltered: false,
      functionalShelter: false,
      nearWarmth: false,
      weather: storm,
      cavePressure: cave,
    };
    updateSurvival(plainState, ctx);
    updateSurvival(focusState, ctx);

    expect(focusState.stamina).toBeGreaterThan(plainState.stamina);
    expect(focusState.exposure).toBeLessThan(plainState.exposure);
    expect(focusState.trailFocus).toBe(55);
  });

  it('lets opened threshold effects soften local survival pressure', () => {
    const roughState: SurvivalState = { stamina: 60, exposure: 20, mealsEaten: 0, collapseCount: 0 };
    const pocketState: SurvivalState = { stamina: 60, exposure: 20, mealsEaten: 0, collapseCount: 0 };
    const storm: WeatherReport = { kind: 'storm', label: 'storm front', intensity: 1, exposureRate: 1.8, staminaRegen: 0.4 };
    const base = {
      dt: 5,
      moving: false,
      sprinting: false,
      swimming: false,
      sheltered: false,
      functionalShelter: false,
      nearWarmth: false,
      weather: storm,
    };

    updateSurvival(roughState, base);
    updateSurvival(pocketState, {
      ...base,
      thresholdEffect: {
        label: 'storm pocket watch',
        weatherExposureMultiplier: 0.48,
        exposureRateDelta: -0.22,
        staminaRegenBonus: 0.12,
        recoveryBonus: 0.4,
      },
    });

    expect(pocketState.exposure).toBeLessThan(roughState.exposure);
    expect(pocketState.stamina).toBeGreaterThan(roughState.stamina);
  });

  it('turns a complete shelter bedroll into a saved dawn recovery loop', () => {
    const state: SurvivalState = { stamina: 18, exposure: 74, mealsEaten: 0, collapseCount: 0 };
    const time = normalizeTimeState({ day: 2, minute: 22 * 60 + 30 });
    const weather = normalizeWeatherState({ phase: 0.5 });

    const rest = restAtShelter(state, time, weather, {
      protected: true,
      functional: true,
      hasWarmth: true,
      comfort: 5,
    });

    expect(rest).toMatchObject({
      minutesSlept: 450,
      label: 'shelter sleep',
      day: 3,
      minute: 360,
    });
    expect(state.stamina).toBe(100);
    expect(state.exposure).toBe(0);
    expect(weather.phase).toBeCloseTo(0.8125, 5);
    expect(rest.message).toContain('day 4 dawn');
  });

  it('keeps rough bedroll rest useful but weaker than weather-safe shelter', () => {
    const roughState: SurvivalState = { stamina: 20, exposure: 80, mealsEaten: 0, collapseCount: 0 };
    const safeState: SurvivalState = { stamina: 20, exposure: 80, mealsEaten: 0, collapseCount: 0 };
    const roughTime = normalizeTimeState({ day: 0, minute: 23 * 60 });
    const safeTime = normalizeTimeState({ day: 0, minute: 23 * 60 });
    const roughWeather = normalizeWeatherState({ phase: 0 });
    const safeWeather = normalizeWeatherState({ phase: 0 });

    restAtShelter(roughState, roughTime, roughWeather, { protected: false, functional: false });
    restAtShelter(safeState, safeTime, safeWeather, { protected: true, functional: false, hasWarmth: true });

    expect(roughState.stamina).toBe(54);
    expect(roughState.exposure).toBe(62);
    expect(safeState.stamina).toBe(78);
    expect(safeState.exposure).toBe(30);
    expect(safeTime.day).toBe(1);
    expect(safeTime.minute).toBe(360);
  });

  it('collapses only at maximum exposure and recovers better at a complete home', () => {
    const homeState: SurvivalState = { stamina: 0, exposure: 100, mealsEaten: 0, collapseCount: 0 };
    const spawnState: SurvivalState = { stamina: 0, exposure: 100, mealsEaten: 0, collapseCount: 2 };
    const homeTime = normalizeTimeState({ day: 1, minute: 22 * 60 });
    const spawnTime = normalizeTimeState({ day: 1, minute: 22 * 60 });
    const homeWeather = normalizeWeatherState({ phase: 0.25 });
    const spawnWeather = normalizeWeatherState({ phase: 0.25 });

    expect(shouldCollapse({ ...homeState, exposure: 99.9 })).toBe(false);
    expect(shouldCollapse(homeState)).toBe(true);

    const home = recoverFromCollapse(homeState, homeTime, homeWeather, {
      hasHome: true,
      protected: true,
      functional: true,
      hasWarmth: true,
      comfort: 5,
    });
    const spawn = recoverFromCollapse(spawnState, spawnTime, spawnWeather, {
      hasHome: false,
      protected: false,
      functional: false,
    });

    expect(home).toMatchObject({
      collapsed: true,
      destination: 'home',
      label: 'shelter rescue',
      collapseCount: 1,
      stamina: 91,
      exposure: 5,
    });
    expect(home.message).toContain('woke at home');
    expect(homeTime.day).toBe(2);
    expect(homeTime.minute).toBe(360);
    expect(homeState).toMatchObject({ stamina: 91, exposure: 5, collapseCount: 1 });

    expect(spawn).toMatchObject({
      collapsed: true,
      destination: 'spawn',
      label: 'spawn rescue',
      collapseCount: 3,
      stamina: 30,
      exposure: 62,
    });
    expect(spawn.minutesLost).toBe(390);
    expect(spawn.message).toContain('woke at spawn');
  });

  it('lets a weather-safe home watch for a safer storm window', () => {
    const state: SurvivalState = { stamina: 38, exposure: 64, mealsEaten: 0, collapseCount: 0 };
    const time = normalizeTimeState({ day: 3, minute: 14 * 60 });
    const weather = normalizeWeatherState({ phase: 0 });
    const storm: WeatherReport = { kind: 'storm', label: 'storm front', intensity: 0.95, exposureRate: 2.1, staminaRegen: 0.4 };
    const clear: WeatherReport = { kind: 'clear', label: 'clear break', intensity: 0.2, exposureRate: -0.2, staminaRegen: 1 };

    expect(isHazardWeather(storm)).toBe(true);
    expect(isHazardWeather(clear)).toBe(false);

    const watch = waitForWeatherWindow(
      state,
      time,
      weather,
      { protected: true, functional: true, hasWarmth: true, comfort: 5 },
      (nextTime) => nextTime.minute >= 15 * 60 + 30 ? clear : storm,
    );

    expect(watch).toMatchObject({
      ok: true,
      cleared: true,
      minutesWaited: 90,
      label: 'weather window',
      stamina: 77,
      exposure: 22,
    });
    expect(time.minute).toBe(15 * 60 + 30);
    expect(state).toMatchObject({ stamina: 77, exposure: 22 });
    expect(watch.message).toContain('storm front cleared after 90m');
  });

  it('blocks weather watch without weather-safe shelter and does not wait on clear weather', () => {
    const stormState: SurvivalState = { stamina: 38, exposure: 64, mealsEaten: 0, collapseCount: 0 };
    const clearState: SurvivalState = { stamina: 70, exposure: 8, mealsEaten: 0, collapseCount: 0 };
    const stormTime = normalizeTimeState({ day: 0, minute: 10 * 60 });
    const clearTime = normalizeTimeState({ day: 0, minute: 12 * 60 });
    const weather = normalizeWeatherState({ phase: 0 });
    const storm: WeatherReport = { kind: 'storm', label: 'storm front', intensity: 0.95, exposureRate: 2.1, staminaRegen: 0.4 };
    const clear: WeatherReport = { kind: 'clear', label: 'clear', intensity: 0.2, exposureRate: -0.2, staminaRegen: 1 };

    const blocked = waitForWeatherWindow(stormState, stormTime, weather, { protected: false, functional: false }, () => storm);
    expect(blocked).toMatchObject({
      ok: false,
      cleared: false,
      minutesWaited: 0,
      label: 'weather watch blocked',
    });
    expect(stormTime.minute).toBe(10 * 60);
    expect(stormState).toMatchObject({ stamina: 38, exposure: 64 });

    const alreadyClear = waitForWeatherWindow(clearState, clearTime, weather, { protected: true, functional: false, hasWarmth: true }, () => clear);
    expect(alreadyClear).toMatchObject({
      ok: false,
      cleared: true,
      minutesWaited: 0,
      label: 'weather already passable',
    });
    expect(clearTime.minute).toBe(12 * 60);
    expect(clearState).toMatchObject({ stamina: 70, exposure: 8 });
  });
});
