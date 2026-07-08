import type { InventoryItems, ItemId } from './crafting';

export interface TimeState {
  day: number;
  minute: number;
}

export interface WeatherState {
  phase: number;
}

export interface SurvivalState {
  stamina: number;
  exposure: number;
  mealsEaten: number;
  collapseCount?: number;
  trailFocus?: number;
}

export interface WeatherReport {
  kind: 'clear' | 'mist' | 'rain' | 'storm' | 'cold' | 'soaked';
  label: string;
  intensity: number;
  exposureRate: number;
  staminaRegen: number;
}

export interface SurvivalContext {
  dt: number;
  moving: boolean;
  sprinting: boolean;
  swimming: boolean;
  flying?: boolean;
  minutesElapsed?: number;
  packBurden?: PackBurdenContext | null;
  sheltered: boolean;
  functionalShelter: boolean;
  nearWarmth: boolean;
  weather: WeatherReport;
  weatherProtection?: WeatherProtectionContext | null;
  thresholdEffect?: SurvivalThresholdEffect | null;
}

export interface PackBurdenContext {
  label: string;
  staminaDrain: number;
  exposureRate: number;
  sprintBlocked?: boolean;
}

export interface SurvivalThresholdEffect {
  label: string;
  staminaRegenBonus?: number;
  exposureRateDelta?: number;
  weatherExposureMultiplier?: number;
  caveExposureMultiplier?: number;
  recoveryBonus?: number;
}

export interface WeatherProtectionContext {
  active: boolean;
  label: string;
  detail: string;
  weatherExposureMultiplier: number;
  staminaRegenBonus: number;
}

export interface SurvivalReport {
  stamina: number;
  exposure: number;
  trailFocus: number;
  status: 'rested' | 'steady' | 'winded' | 'exposed' | 'worn';
  label: string;
  weather: WeatherReport;
}

export interface EatResult {
  ok: boolean;
  item?: ItemId;
  label?: string;
  staminaGain?: number;
  exposureDrop?: number;
  trailFocusGain?: number;
  message: string;
}

export interface HearthSupperContext extends RestShelterContext {
  cellarProvisions: number;
}

export interface HearthSupperResult {
  ok: boolean;
  provisionsSpent: number;
  staminaGain: number;
  exposureDrop: number;
  trailFocusGain: number;
  label: string;
  message: string;
}

export interface RestShelterContext {
  protected: boolean;
  functional: boolean;
  hasWarmth?: boolean;
  comfort?: number;
}

export interface RestResult {
  minutesSlept: number;
  staminaGain: number;
  exposureDrop: number;
  day: number;
  minute: number;
  label: string;
  message: string;
}

/**
 * Force-relocates the player home/to spawn and resets stamina/exposure. No longer invoked
 * automatically from the survival loop — normal exposure pressure is handled by
 * isExposureWarning/isExposureCritical + the ongoing stamina-drain penalty in updateSurvival.
 * recoverFromCollapse is kept only as an explicit, developer-invoked rescue (see main.ts's
 * debug.collapse hook); it is never called as a silent background mechanic.
 */
export interface CollapseRecoveryContext extends RestShelterContext {
  hasHome: boolean;
}

export interface CollapseRecoveryResult {
  collapsed: boolean;
  destination: 'home' | 'spawn';
  minutesLost: number;
  day: number;
  minute: number;
  stamina: number;
  exposure: number;
  collapseCount: number;
  label: string;
  message: string;
}

export interface WeatherWindowContext extends RestShelterContext {
  nearWarmth?: boolean;
}

export interface WeatherWindowResult {
  ok: boolean;
  cleared: boolean;
  minutesWaited: number;
  day: number;
  minute: number;
  weather: WeatherReport;
  stamina: number;
  exposure: number;
  label: string;
  message: string;
}

const TRAIL_FOCUS_MAX = 720;

/** exposure >= this is the 'exposed' status band */
export const EXPOSURE_EXPOSED_THRESHOLD = 55;
/** exposure >= this is the 'worn' status band — also where the HUD raises a clear warning */
export const EXPOSURE_WARNING_THRESHOLD = 82;
/** exposure at this ceiling applies an ongoing "cold is winning" penalty instead of a hard collapse */
export const EXPOSURE_CRITICAL_THRESHOLD = 100;

const FOOD_ORDER: { item: ItemId; label: string; stamina: number; exposureDrop: number; trailFocus?: number }[] = [
  { item: 'expeditionStew', label: 'expedition stew', stamina: 64, exposureDrop: 22, trailFocus: 240 },
  { item: 'campMeal', label: 'camp meal', stamina: 56, exposureDrop: 16 },
  { item: 'trailRation', label: 'trail ration', stamina: 48, exposureDrop: 14 },
  { item: 'cookedFish', label: 'cooked fish', stamina: 36, exposureDrop: 8 },
  { item: 'snowHerb', label: 'snow herb', stamina: 10, exposureDrop: 18 },
  { item: 'caveMushroom', label: 'cave mushroom', stamina: 24, exposureDrop: 4 },
  { item: 'berries', label: 'berries', stamina: 18, exposureDrop: 2 },
  { item: 'kelp', label: 'kelp', stamina: 14, exposureDrop: 1 },
  { item: 'rawFish', label: 'raw fish', stamina: 12, exposureDrop: 0 },
];

const DAWN_MINUTE = 6 * 60;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function count(items: InventoryItems, id: keyof InventoryItems): number {
  return Math.max(0, Math.trunc(items[id] ?? 0));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeTimeState(raw: unknown): TimeState {
  const value = raw && typeof raw === 'object' ? raw as Partial<TimeState> : {};
  const day = Math.max(0, Math.trunc(finiteNumber(value.day, 0)));
  const minute = finiteNumber(value.minute, 8 * 60);
  return {
    day,
    minute: clamp(minute, 0, 24 * 60 - 0.001),
  };
}

export function normalizeWeatherState(raw: unknown): WeatherState {
  const value = raw && typeof raw === 'object' ? raw as Partial<WeatherState> : {};
  return { phase: finiteNumber(value.phase, 0) };
}

export function normalizeSurvivalState(raw: unknown): SurvivalState {
  const value = raw && typeof raw === 'object' ? raw as Partial<SurvivalState> : {};
  return {
    stamina: clamp(finiteNumber(value.stamina, 100), 0, 100),
    exposure: clamp(finiteNumber(value.exposure, 0), 0, 100),
    mealsEaten: Math.max(0, Math.trunc(finiteNumber(value.mealsEaten, 0))),
    collapseCount: Math.max(0, Math.trunc(finiteNumber(value.collapseCount, 0))),
    trailFocus: clamp(finiteNumber(value.trailFocus, 0), 0, TRAIL_FOCUS_MAX),
  };
}

function trailFocus(state: SurvivalState): number {
  return clamp(finiteNumber(state.trailFocus, 0), 0, TRAIL_FOCUS_MAX);
}

function spendTrailFocus(state: SurvivalState, minutes: number): void {
  state.trailFocus = Math.max(0, trailFocus(state) - Math.max(0, minutes));
}

export function advanceTime(time: TimeState, weather: WeatherState, dt: number, scale = 10): void {
  const minutes = Math.max(0, dt) * Math.max(0, scale);
  addMinutes(time, weather, minutes);
}

function addMinutes(time: TimeState, weather: WeatherState, minutes: number): void {
  const amount = Math.max(0, minutes);
  time.minute += amount;
  while (time.minute >= 24 * 60) {
    time.minute -= 24 * 60;
    time.day++;
  }
  weather.phase = (weather.phase + amount / (24 * 60)) % 1;
}

function minutesUntil(time: TimeState, targetMinute: number): number {
  const target = clamp(targetMinute, 0, 24 * 60 - 0.001);
  if (time.minute < target) return target - time.minute;
  return 24 * 60 - time.minute + target;
}

export function weatherAt(
  time: TimeState,
  weather: WeatherState,
  tile: number,
  height: number,
  submerged: number,
): WeatherReport {
  const stormWave = Math.sin((weather.phase * 2 + tile * 0.019 + time.day * 0.37) * Math.PI);
  const local = 0.5 + 0.5 * stormWave;
  const cold = height > 42;
  if (submerged > 0.45) {
    return { kind: 'soaked', label: 'soaked', intensity: 1, exposureRate: 2.1, staminaRegen: 0.35 };
  }
  if (cold && local > 0.28) {
    return { kind: 'cold', label: 'cold wind', intensity: clamp(local * 0.85, 0, 1), exposureRate: 0.9 + local * 0.9, staminaRegen: 0.65 };
  }
  if (local > 0.82) {
    return { kind: 'storm', label: 'storm front', intensity: local, exposureRate: 1.5 + local * 0.65, staminaRegen: 0.45 };
  }
  if (local > 0.58) {
    return { kind: 'rain', label: 'rain', intensity: local, exposureRate: 0.75 + local * 0.35, staminaRegen: 0.72 };
  }
  if (local > 0.38) {
    return { kind: 'mist', label: 'mist', intensity: local, exposureRate: 0.22, staminaRegen: 0.9 };
  }
  return { kind: 'clear', label: 'clear', intensity: local, exposureRate: -0.2, staminaRegen: 1 };
}

export function weatherProtectionForInventory(items: InventoryItems, weather: WeatherReport): WeatherProtectionContext | null {
  if (count(items, 'stormCloak') <= 0) return null;
  const active = weather.kind === 'storm'
    || weather.kind === 'rain'
    || weather.kind === 'cold'
    || weather.kind === 'soaked'
    || weather.exposureRate >= 0.7;
  return {
    active,
    label: 'storm cloak',
    detail: active ? `${weather.label} softened by cloak` : 'packed for bad weather',
    weatherExposureMultiplier: active ? 0.68 : 1,
    staminaRegenBonus: active ? 0.08 : 0,
  };
}

export function updateSurvival(state: SurvivalState, ctx: SurvivalContext): SurvivalState {
  const dt = Math.max(0, Math.min(5, ctx.dt));
  const focusBefore = trailFocus(state);
  const focusActive = focusBefore > 0;
  const focusRelief = focusActive
    ? ctx.flying ? 2.2 : ctx.swimming ? 1.5 : ctx.sprinting ? 1.1 : ctx.moving ? 0.6 : 0
    : 0;
  const pack = ctx.packBurden;
  const packDrain = ctx.moving && !ctx.flying
    ? Math.max(0, pack?.staminaDrain ?? 0) * (ctx.sprinting ? 1.45 : ctx.swimming ? 1.25 : 1)
    : 0;
  const exertion = Math.max(0, (ctx.sprinting ? 7.2 : 0) + (ctx.swimming ? 4.5 : 0) + (ctx.moving && !ctx.sprinting ? 0.45 : 0) + packDrain - focusRelief);
  const shelterRecovery = ctx.functionalShelter ? 5.4 : ctx.sheltered ? 3.2 : 0;
  const warmthRecovery = ctx.nearWarmth ? 2.2 : 0;
  const threshold = ctx.thresholdEffect;
  const protection = ctx.weatherProtection?.active ? ctx.weatherProtection : null;
  const thresholdRecovery = Math.max(0, threshold?.recoveryBonus ?? 0);
  const thresholdStamina = threshold?.staminaRegenBonus ?? 0;
  const protectionStamina = protection?.staminaRegenBonus ?? 0;
  const baseRegen = ctx.sprinting || ctx.swimming ? 0 : 3.4 * Math.max(0.1, ctx.weather.staminaRegen + thresholdStamina + protectionStamina);
  // Once exposure is maxed out, the old design hard-teleported the player home/to spawn.
  // Instead: a steep ongoing stamina drain kicks in and only eases once exposure actually
  // drops below the ceiling again (i.e. the player finds shelter/warmth), which happens
  // naturally via shelterFactor/warmth below on the very next tick.
  const exposurePenalty = state.exposure >= EXPOSURE_CRITICAL_THRESHOLD
    ? 6
    : state.exposure > 70
    ? 2.5
    : state.exposure > 45
    ? 1.1
    : 0;
  state.stamina = clamp(state.stamina + (baseRegen + shelterRecovery + warmthRecovery + thresholdRecovery - exertion - exposurePenalty) * dt, 0, 100);

  const shelterFactor = ctx.functionalShelter ? -6.5 : ctx.sheltered ? -4.2 : 1;
  const warmth = ctx.nearWarmth ? -3.3 : 0;
  const weatherMultiplier = (threshold?.weatherExposureMultiplier ?? 1) * (protection?.weatherExposureMultiplier ?? 1);
  const weatherRate = (ctx.weather.exposureRate + (threshold?.exposureRateDelta ?? 0))
    * (ctx.sheltered ? 0.18 : Math.max(0.15, Math.min(1.25, weatherMultiplier)));
  const focusExposureRelief = focusActive && !ctx.sheltered ? (ctx.flying ? -0.35 : ctx.swimming ? -0.18 : -0.22) : 0;
  const packExposure = ctx.moving && !ctx.flying && !ctx.sheltered
    ? Math.max(0, pack?.exposureRate ?? 0) * (ctx.swimming ? 1.4 : 1)
    : 0;
  state.exposure = clamp(state.exposure + (weatherRate + focusExposureRelief + packExposure + shelterFactor + warmth) * dt, 0, 100);
  if (focusActive) spendTrailFocus(state, ctx.minutesElapsed ?? dt * 8);
  return state;
}

export function survivalStatus(state: SurvivalState): SurvivalReport['status'] {
  if (state.exposure >= EXPOSURE_WARNING_THRESHOLD) return 'worn';
  if (state.exposure >= EXPOSURE_EXPOSED_THRESHOLD) return 'exposed';
  if (state.stamina <= 24) return 'winded';
  if (state.stamina >= 86 && state.exposure <= 12) return 'rested';
  return 'steady';
}

export function survivalReport(state: SurvivalState, weather: WeatherReport): SurvivalReport {
  const status = survivalStatus(state);
  const focus = Math.round(trailFocus(state));
  const focusLabel = focus > 0 ? ` · trail focus ${focus}m` : '';
  return {
    stamina: Math.round(state.stamina),
    exposure: Math.round(state.exposure),
    trailFocus: focus,
    status,
    label: `${status} · stamina ${Math.round(state.stamina)} · exposure ${Math.round(state.exposure)}${focusLabel} · ${weather.label}`,
    weather,
  };
}

/** true once exposure has entered the warning band (same threshold as the 'worn' status) — HUD should raise a clear alert */
export function isExposureWarning(state: SurvivalState): boolean {
  return state.exposure >= EXPOSURE_WARNING_THRESHOLD;
}

/** true once exposure is fully maxed out — updateSurvival applies an ongoing stamina-drain penalty while this holds, no relocation */
export function isExposureCritical(state: SurvivalState): boolean {
  return state.exposure >= EXPOSURE_CRITICAL_THRESHOLD;
}

export function isHazardWeather(weather: WeatherReport): boolean {
  return weather.kind === 'storm'
    || weather.kind === 'rain'
    || weather.kind === 'cold'
    || weather.kind === 'soaked'
    || weather.exposureRate >= 0.7;
}

export function waitForWeatherWindow(
  state: SurvivalState,
  time: TimeState,
  weatherState: WeatherState,
  shelter: WeatherWindowContext,
  sampleWeather: (time: TimeState, weather: WeatherState) => WeatherReport,
  maxMinutes = 6 * 60,
  stepMinutes = 30,
): WeatherWindowResult {
  const firstWeather = sampleWeather(time, weatherState);
  if (!shelter.protected) {
    return {
      ok: false,
      cleared: false,
      minutesWaited: 0,
      day: time.day,
      minute: time.minute,
      weather: firstWeather,
      stamina: Math.round(state.stamina),
      exposure: Math.round(state.exposure),
      label: 'weather watch blocked',
      message: 'weather watch needs roof, door, and warmth',
    };
  }
  if (!isHazardWeather(firstWeather)) {
    return {
      ok: false,
      cleared: true,
      minutesWaited: 0,
      day: time.day,
      minute: time.minute,
      weather: firstWeather,
      stamina: Math.round(state.stamina),
      exposure: Math.round(state.exposure),
      label: 'weather already passable',
      message: `${firstWeather.label} already passable`,
    };
  }

  const maxWait = Math.max(0, Math.trunc(maxMinutes));
  const step = clamp(Math.trunc(stepMinutes), 5, 90);
  const comfort = clamp(shelter.comfort ?? 0, 0, 6);
  const warm = shelter.hasWarmth || shelter.nearWarmth;
  let waited = 0;
  let currentWeather = firstWeather;
  while (waited < maxWait && isHazardWeather(currentWeather)) {
    const amount = Math.min(step, maxWait - waited);
    addMinutes(time, weatherState, amount);
    waited += amount;
    const hours = amount / 60;
    const staminaGainPerHour = shelter.functional ? 16 + comfort * 2 : 10 + (warm ? 4 : 0);
    const exposureDropPerHour = shelter.functional ? 18 + comfort * 2 : 11 + (warm ? 4 : 0);
    state.stamina = clamp(state.stamina + staminaGainPerHour * hours, 0, 100);
    state.exposure = clamp(state.exposure - exposureDropPerHour * hours, 0, 100);
    spendTrailFocus(state, amount);
    currentWeather = sampleWeather(time, weatherState);
  }

  const cleared = !isHazardWeather(currentWeather);
  const label = cleared ? 'weather window' : 'weather held';
  const outcome = cleared
    ? `${firstWeather.label} cleared`
    : `${currentWeather.label} still on`;
  return {
    ok: waited > 0,
    cleared,
    minutesWaited: waited,
    day: time.day,
    minute: time.minute,
    weather: currentWeather,
    stamina: Math.round(state.stamina),
    exposure: Math.round(state.exposure),
    label,
    message: `${label} · ${outcome} after ${waited}m · stamina ${Math.round(state.stamina)} · exposure ${Math.round(state.exposure)}`,
  };
}

export function eatBestFood(items: InventoryItems, state: SurvivalState): EatResult {
  for (const food of FOOD_ORDER) {
    const have = Math.max(0, Math.trunc(items[food.item] ?? 0));
    if (have <= 0) continue;
    if (have === 1) delete items[food.item];
    else items[food.item] = have - 1;
    state.stamina = clamp(state.stamina + food.stamina, 0, 100);
    state.exposure = clamp(state.exposure - food.exposureDrop, 0, 100);
    if (food.trailFocus) state.trailFocus = Math.max(trailFocus(state), food.trailFocus);
    state.mealsEaten++;
    const focusText = food.trailFocus ? ` · trail focus ${Math.round(trailFocus(state))}m` : '';
    return {
      ok: true,
      item: food.item,
      label: food.label,
      staminaGain: food.stamina,
      exposureDrop: food.exposureDrop,
      trailFocusGain: food.trailFocus,
      message: `ate ${food.label}${focusText} · stamina ${Math.round(state.stamina)}`,
    };
  }
  return { ok: false, message: 'no food packed' };
}

export function prepareHearthSupper(state: SurvivalState, shelter: HearthSupperContext): HearthSupperResult {
  const provisions = Math.max(0, Math.trunc(shelter.cellarProvisions));
  if (!shelter.functional || !shelter.hasWarmth) {
    return {
      ok: false,
      provisionsSpent: 0,
      staminaGain: 0,
      exposureDrop: 0,
      trailFocusGain: 0,
      label: 'hearth supper blocked',
      message: 'hearth supper needs a warm functional home',
    };
  }
  if (provisions <= 0) {
    return {
      ok: false,
      provisionsSpent: 0,
      staminaGain: 0,
      exposureDrop: 0,
      trailFocusGain: 0,
      label: 'hearth supper blocked',
      message: 'hearth supper needs cellar provisions',
    };
  }

  const comfort = clamp(shelter.comfort ?? 0, 0, 6);
  const beforeStamina = state.stamina;
  const beforeExposure = state.exposure;
  const focus = Math.min(TRAIL_FOCUS_MAX, 180 + comfort * 12);
  state.stamina = clamp(state.stamina + 28 + comfort * 3, 0, 100);
  state.exposure = clamp(state.exposure - (8 + comfort * 2), 0, 100);
  state.trailFocus = Math.max(trailFocus(state), focus);
  state.mealsEaten++;

  return {
    ok: true,
    provisionsSpent: 1,
    staminaGain: Math.round(state.stamina - beforeStamina),
    exposureDrop: Math.round(beforeExposure - state.exposure),
    trailFocusGain: focus,
    label: 'hearth supper',
    message: `hearth supper · cellar provision -1 · trail focus ${Math.round(trailFocus(state))}m · stamina ${Math.round(state.stamina)}`,
  };
}

export function restAtShelter(
  state: SurvivalState,
  time: TimeState,
  weather: WeatherState,
  shelter: RestShelterContext,
  wakeMinute = DAWN_MINUTE,
): RestResult {
  const beforeStamina = state.stamina;
  const beforeExposure = state.exposure;
  const minutesSlept = minutesUntil(time, wakeMinute);
  addMinutes(time, weather, minutesSlept);
  spendTrailFocus(state, minutesSlept);

  const comfort = clamp(shelter.comfort ?? 0, 0, 6);
  const staminaGain = shelter.functional ? 82 : shelter.protected ? 58 : 34;
  const exposureDrop = shelter.functional
    ? 72 + comfort * 2
    : shelter.protected
    ? 42 + (shelter.hasWarmth ? 8 : 0)
    : 18;
  state.stamina = clamp(state.stamina + staminaGain, 0, 100);
  state.exposure = clamp(state.exposure - exposureDrop, 0, 100);

  const label = shelter.functional ? 'shelter sleep' : shelter.protected ? 'weather-safe rest' : 'rough dawn rest';
  return {
    minutesSlept: Math.round(minutesSlept),
    staminaGain: Math.round(state.stamina - beforeStamina),
    exposureDrop: Math.round(beforeExposure - state.exposure),
    day: time.day,
    minute: time.minute,
    label,
    message: `${label} · day ${time.day + 1} dawn · stamina ${Math.round(state.stamina)} · exposure ${Math.round(state.exposure)}`,
  };
}

export function recoverFromCollapse(
  state: SurvivalState,
  time: TimeState,
  weather: WeatherState,
  shelter: CollapseRecoveryContext,
  wakeMinute = DAWN_MINUTE,
): CollapseRecoveryResult {
  const beforeDay = time.day;
  const beforeMinute = time.minute;
  const destination: CollapseRecoveryResult['destination'] = shelter.hasHome ? 'home' : 'spawn';
  const baseMinutes = shelter.hasHome ? minutesUntil(time, wakeMinute) : 4 * 60;
  const extraMinutes = shelter.functional ? 0 : shelter.protected ? 45 : shelter.hasHome ? 90 : 150;
  const minutesLost = Math.max(1, Math.round(baseMinutes + extraMinutes));
  addMinutes(time, weather, minutesLost);
  spendTrailFocus(state, minutesLost);

  const comfort = clamp(shelter.comfort ?? 0, 0, 6);
  if (shelter.functional) {
    state.stamina = clamp(76 + comfort * 3, 0, 100);
    state.exposure = clamp(10 - comfort, 0, 100);
  } else if (shelter.protected) {
    state.stamina = clamp(58 + (shelter.hasWarmth ? 8 : 0), 0, 100);
    state.exposure = shelter.hasWarmth ? 24 : 32;
  } else if (shelter.hasHome) {
    state.stamina = 42;
    state.exposure = 46;
  } else {
    state.stamina = 30;
    state.exposure = 62;
  }
  state.collapseCount = Math.max(0, Math.trunc(state.collapseCount ?? 0)) + 1;

  const label = shelter.functional
    ? 'shelter rescue'
    : shelter.protected
    ? 'weather-safe rescue'
    : shelter.hasHome
    ? 'rough home rescue'
    : 'spawn rescue';
  const slept = time.day !== beforeDay || Math.abs(time.minute - beforeMinute) > 0.01;
  const timeText = slept ? ` · lost ${minutesLost}m` : '';
  return {
    collapsed: true,
    destination,
    minutesLost,
    day: time.day,
    minute: time.minute,
    stamina: Math.round(state.stamina),
    exposure: Math.round(state.exposure),
    collapseCount: state.collapseCount,
    label,
    message: `${label} · woke at ${destination === 'home' ? 'home' : 'spawn'}${timeText} · stamina ${Math.round(state.stamina)} · exposure ${Math.round(state.exposure)}`,
  };
}
