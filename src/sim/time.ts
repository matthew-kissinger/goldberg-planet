/**
 * Day/night clock and local weather-flavor sampling. This is what's left of the old
 * survival.ts after the stamina/exposure/collapse pressure system was cut: nothing here
 * changes any player stat, it only drives the visible clock and picks a weather label for
 * fishing/forage/rain-cistern/waystone/weather-vane flavor.
 */

export interface TimeState {
  day: number;
  minute: number;
}

export interface WeatherState {
  phase: number;
}

export interface WeatherReport {
  kind: 'clear' | 'mist' | 'rain' | 'storm' | 'cold' | 'soaked';
  label: string;
  intensity: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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

function addMinutes(time: TimeState, weather: WeatherState, minutes: number): void {
  const amount = Math.max(0, minutes);
  time.minute += amount;
  while (time.minute >= 24 * 60) {
    time.minute -= 24 * 60;
    time.day++;
  }
  weather.phase = (weather.phase + amount / (24 * 60)) % 1;
}

export function advanceTime(time: TimeState, weather: WeatherState, dt: number, scale = 10): void {
  const minutes = Math.max(0, dt) * Math.max(0, scale);
  addMinutes(time, weather, minutes);
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
    return { kind: 'soaked', label: 'soaked', intensity: 1 };
  }
  if (cold && local > 0.28) {
    return { kind: 'cold', label: 'cold wind', intensity: clamp(local * 0.85, 0, 1) };
  }
  if (local > 0.82) {
    return { kind: 'storm', label: 'storm front', intensity: local };
  }
  if (local > 0.58) {
    return { kind: 'rain', label: 'rain', intensity: local };
  }
  if (local > 0.38) {
    return { kind: 'mist', label: 'mist', intensity: local };
  }
  return { kind: 'clear', label: 'clear', intensity: local };
}
