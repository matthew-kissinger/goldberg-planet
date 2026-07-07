import type { WeatherReport } from './survival';

export type SkyLifeKind = 'sky' | 'shore' | 'forest' | 'storm';

export interface SkyLifeCandidate {
  tile: number;
  ring: number;
  height: number;
  nearWater: boolean;
  nearTrees: boolean;
}

export interface SkyLifeSite {
  id: number;
  tile: number;
  kind: SkyLifeKind;
  label: string;
  intensity: number;
  weatherKind: WeatherReport['kind'];
  weatherLabel: string;
  ring: number;
}

export interface SkyLifeContext {
  centerTile: number;
  day: number;
  minute: number;
  weatherKind: WeatherReport['kind'];
  weatherLabel: string;
  weatherIntensity: number;
  domainEffect?: string | null;
  domainIntensity?: number;
  candidates: readonly SkyLifeCandidate[];
  maxSites?: number;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function stableHash(tile: number, salt: number): number {
  const x = Math.sin(tile * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function bestCandidate(
  candidates: readonly SkyLifeCandidate[],
  dayWindow: number,
  salt: number,
  predicate: (candidate: SkyLifeCandidate) => boolean,
  used: Set<number>,
): SkyLifeCandidate | null {
  let best: SkyLifeCandidate | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const tile = Math.max(0, Math.trunc(candidate.tile));
    if (used.has(tile) || !predicate(candidate)) continue;
    const score = stableHash(tile, dayWindow + salt)
      - Math.max(0, candidate.ring) * 0.085
      + Math.max(-20, Math.min(80, candidate.height)) * 0.001;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function labelFor(kind: SkyLifeKind, weatherLabel: string): string {
  if (kind === 'storm') return `storm finches riding ${weatherLabel}`;
  if (kind === 'shore') return 'shore gulls over the waterline';
  if (kind === 'forest') return 'forest flutters above the canopy';
  return 'sky kites circling high thermals';
}

function idFor(kind: SkyLifeKind, tile: number, dayWindow: number): number {
  const salt = kind === 'storm' ? 29 : kind === 'shore' ? 43 : kind === 'forest' ? 61 : 79;
  return Math.max(1, Math.trunc(tile) * 101 + dayWindow * 17 + salt);
}

function makeSite(
  kind: SkyLifeKind,
  candidate: SkyLifeCandidate,
  ctx: SkyLifeContext,
  dayWindow: number,
  intensityBoost = 0,
): SkyLifeSite {
  const weatherIntensity = clamp01(ctx.weatherIntensity);
  const domainIntensity = clamp01(ctx.domainIntensity ?? 0);
  const intensity = clamp01(0.45 + weatherIntensity * 0.28 + domainIntensity * 0.16 + intensityBoost);
  return {
    id: idFor(kind, candidate.tile, dayWindow),
    tile: Math.max(0, Math.trunc(candidate.tile)),
    kind,
    label: labelFor(kind, ctx.weatherLabel),
    intensity,
    weatherKind: ctx.weatherKind,
    weatherLabel: ctx.weatherLabel,
    ring: Math.max(0, Math.trunc(candidate.ring)),
  };
}

export function skyLifeSitesAround(ctx: SkyLifeContext): SkyLifeSite[] {
  const candidates = ctx.candidates.length > 0
    ? ctx.candidates
    : [{ tile: ctx.centerTile, ring: 0, height: 0, nearWater: false, nearTrees: false }];
  const maxSites = Math.max(1, Math.min(4, Math.trunc(ctx.maxSites ?? 4)));
  const used = new Set<number>();
  const result: SkyLifeSite[] = [];
  const dayWindow = Math.max(0, Math.trunc(ctx.day)) * 24 + Math.trunc(Math.max(0, ctx.minute) / 90);

  const add = (kind: SkyLifeKind, candidate: SkyLifeCandidate | null, intensityBoost = 0): void => {
    if (!candidate || result.length >= maxSites) return;
    used.add(Math.max(0, Math.trunc(candidate.tile)));
    result.push(makeSite(kind, candidate, ctx, dayWindow, intensityBoost));
  };

  const stormy = ctx.weatherKind === 'storm'
    || (ctx.weatherKind === 'rain' && clamp01(ctx.weatherIntensity) >= 0.55)
    || ctx.domainEffect === 'storm'
    || ctx.domainEffect === 'weather';
  if (stormy) {
    add('storm', bestCandidate(candidates, dayWindow, 1103, (candidate) => !candidate.nearTrees || candidate.ring <= 2, used), 0.22);
  }

  add('shore', bestCandidate(candidates, dayWindow, 2207, (candidate) => candidate.nearWater, used), 0.08);
  add('forest', bestCandidate(candidates, dayWindow, 3301, (candidate) => candidate.nearTrees && !candidate.nearWater, used), 0.04);
  add('sky', bestCandidate(candidates, dayWindow, 4409, () => true, used), 0.12);

  if (result.length === 0) add('sky', candidates[0], 0.1);
  return result;
}
