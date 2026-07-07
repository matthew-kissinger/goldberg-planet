import type { PentagonInsightEffect, PentagonLandmark } from './landmarks';
import type { InventoryItems } from './crafting';
import type { SurvivalState, WeatherReport } from './survival';
import { caveAnchorKindLabel, shelterReport, waystoneMarkLabel, type CaveAnchorKind, type StructureSave, type StructureTopology, type WaystoneMark } from './structures';
import { bestToolLabelForTarget, hasToolForTarget } from './tools';

export interface ChartFrame {
  east: readonly number[];
  north: readonly number[];
}

export interface HorizonChartSignal {
  target: PentagonLandmark;
  distanceM: number;
  distanceLabel: string;
  bearingDeg: number;
  turn: 'ahead' | 'right' | 'left' | 'behind';
  remaining: number;
  total: number;
  label: string;
}

export interface HearthBeaconSignal {
  homeTile: number;
  sourceTile: number | null;
  active: boolean;
  strength: number;
  distanceM: number;
  distanceLabel: string;
  bearingDeg: number;
  turn: HorizonChartSignal['turn'];
  shelterLabel: string;
  label: string;
  message: string;
}

export interface RouteSlateCaveSignal {
  tile?: number;
  kind: 'arch' | 'dryCave' | 'seaCave';
  distance: number;
  label?: string;
  depth: number;
  flooded: boolean;
  spring?: boolean;
  clearance?: number;
  mouth?: boolean;
}

export interface RouteSlateCaveResonanceSignal {
  tile?: number;
  label: string;
  detail: string;
  note: string;
  rewardLabel: string;
  rewardCount: number;
  observed: boolean;
}

export interface RouteSlateFishSignal {
  kind: string;
  label: string;
  strength: number;
  catchCount: number;
  baitUseful?: boolean;
  trapCount?: number;
  trapReady?: number;
  netCount?: number;
  netReady?: number;
}

export interface RouteSlateForageSignal {
  kind: string;
  label: string;
  strength: number;
}

export interface RouteSlateNativeLifeSignal {
  tile?: number;
  kind: string;
  label: string;
  detail: string;
  temperament: 'harmless' | 'territorial' | 'combative';
  rewardLabel: string;
  rewardCount: number;
  distanceM?: number;
  tended?: boolean;
  warded?: boolean;
  hint: string;
  distanceLabel?: string;
  turn?: HorizonChartSignal['turn'];
  telegraph?: string;
  weakness?: string;
  result?: string;
}

export interface RouteSlateDomainSignal {
  label: string;
  domainLabel: string;
  landmarkName: string;
  discovered: boolean;
  ring: number;
  intensity: number;
  challenge: string;
  boon: string;
  routeHint: string;
}

export interface RouteSlateSiteSignal {
  label: string;
  siteLabel: string;
  landmarkName: string;
  discovered: boolean;
  completed?: boolean;
  ready?: boolean;
  ring: number;
  intensity: number;
  problem: string;
  opportunity: string;
  buildHint: string;
  routeHint: string;
  wonder: string;
  workDetail?: string;
  missing?: string[];
  rewardLabel?: string;
  rewardCount?: number;
  thresholdLabel?: string;
  thresholdDetail?: string;
  thresholdOpen?: boolean;
  thresholdTraversal?: string;
}

export interface RouteSlateResourceSignal {
  label: string;
  dormantLabel: string;
  detail: string;
  rewardLabel: string;
  rewardCount: number;
  discovered: boolean;
  harvested: boolean;
  hint: string;
}

export interface RouteSlateSkyfallSignal {
  tile?: number;
  kind: string;
  label: string;
  detail: string;
  omenLabel?: string;
  omenDetail?: string;
  rewardLabel: string;
  rewardCount: number;
  distanceM: number;
  distanceLabel: string;
  turn: HorizonChartSignal['turn'];
  minutesRemaining: number;
  active: boolean;
  harvested: boolean;
}

export interface RouteSlateMurmurSignal {
  tile?: number;
  kind: string;
  label: string;
  detail: string;
  note: string;
  distanceM: number;
  distanceLabel: string;
  turn: HorizonChartSignal['turn'];
  minutesRemaining: number;
  active: boolean;
  observed: boolean;
}

export interface RouteSlateSeasonSignal {
  label: string;
  detail: string;
  tradeoff: string;
  routeHint: string;
  startsInMinutes: number;
  endsInMinutes: number;
  urgency: 'now' | 'soon' | 'later';
  focus: 'fall' | 'listening' | 'split' | 'quiet';
  chain?: {
    progressLabel: string;
    payoffLabel: string;
    payoffDetail: string;
    routeEffect: string;
    linked: boolean;
    fullChord: boolean;
  };
}

export interface RouteSlateSeasonAfterglowSignal {
  tile?: number;
  id: number;
  label: string;
  detail: string;
  note: string;
  routeHint: string;
  read: boolean;
  distanceM: number;
  distanceLabel: string;
  turn: HorizonChartSignal['turn'];
  focusMinutes: number;
}

export interface RouteSlateThresholdChamberSignal {
  label: string;
  detail: string;
  note: string;
  rewardLabel: string;
  rewardCount: number;
  landmarkName: string;
  thresholdLabel: string;
  open: boolean;
  observed: boolean;
  hint: string;
}

export interface RouteSlateWaystoneSignal {
  tile?: number;
  mark: WaystoneMark;
  label: string;
  distanceM?: number;
  distanceLabel: string;
  turn: HorizonChartSignal['turn'];
}

export interface RouteSlateCaveAnchorSignal {
  tile?: number;
  kind: CaveAnchorKind;
  label: string;
  distanceM: number;
  distanceLabel: string;
  turn: HorizonChartSignal['turn'];
  depth: number;
  flooded: boolean;
  spring?: boolean;
  clearance?: number;
  uses?: number;
}

export type RoutePlanSourceKind = 'target' | 'home' | 'waystone' | 'cave' | 'caveAnchor' | 'skyfall' | 'murmur' | 'seasonAfterglow' | 'nativeHazard' | 'nativeLife';

export const ROUTE_ITINERARY_MAX_LEGS = 5;

export interface RoutePlanLegSave {
  targetTile: number;
  sourceKind: RoutePlanSourceKind;
  label: string;
  detail: string;
  originTile: number;
  setDay: number;
  setMinute: number;
  reached?: boolean;
  reachedDay?: number;
  reachedMinute?: number;
}

export interface RoutePlanSave extends RoutePlanLegSave {
  legs?: RoutePlanLegSave[];
}

export interface RoutePlanSignal {
  targetTile: number;
  sourceKind: RoutePlanSourceKind;
  label: string;
  detail: string;
  distanceM: number;
  distanceLabel: string;
  bearingDeg: number;
  turn: HorizonChartSignal['turn'];
  arrived: boolean;
  complete: boolean;
  legIndex: number;
  legCount: number;
  reachedCount: number;
  message: string;
}

export interface RoutePlanAddResult {
  ok: boolean;
  reason: 'created' | 'added' | 'duplicate' | 'full' | 'invalid';
  plan: RoutePlanSave | null;
  label: string;
  legCount: number;
}

export interface RoutePlanEditResult {
  ok: boolean;
  reason: 'deferred' | 'removed' | 'single' | 'complete' | 'locked' | 'invalid';
  plan: RoutePlanSave | null;
  label: string;
  legCount: number;
  activeIndex: number;
}

export interface RoutePlanArrivalResult {
  changed: boolean;
  plan: RoutePlanSave | null;
  complete: boolean;
  advanced: boolean;
  label: string;
  legIndex: number;
  legCount: number;
  message: string;
}

export interface RouteGuide {
  kind: RoutePlanSourceKind | 'planned';
  targetTile: number;
  label: string;
  detail: string;
  priority: number;
}

export interface RoutePlanItineraryStatus {
  legs: RoutePlanLegSave[];
  active: RoutePlanLegSave;
  activeIndex: number;
  reachedCount: number;
  complete: boolean;
}

export function routeAtlasVisible(guide: Pick<RouteGuide, 'kind'> | null | undefined, cameraDistance: number): boolean {
  if (!guide) return false;
  const d = Number.isFinite(cameraDistance) ? cameraDistance : 0;
  return guide.kind === 'planned' || d >= 140;
}

export interface RoutePin {
  id: 'planned' | 'target' | 'home' | 'domain' | 'site' | 'thresholdChamber' | 'resource' | 'skyfall' | 'murmur' | 'season' | 'seasonAfterglow' | 'caveResonance' | 'cave' | 'caveAnchor' | 'waystone' | 'fish' | 'forage' | 'nativeHazard' | 'nativeLife' | 'weather' | 'insight' | 'prep';
  label: string;
  detail: string;
  priority: number;
  ready: boolean;
}

export interface ExpeditionInsightState {
  count: number;
  total?: number;
  effects?: readonly PentagonInsightEffect[];
  labels?: readonly string[];
  prepLabel?: string;
}

export interface RouteSlateInput {
  chart: HorizonChartSignal | null;
  beacon: HearthBeaconSignal | null;
  routePlan?: RoutePlanSignal | null;
  plan: ExpeditionPlan;
  cave?: RouteSlateCaveSignal | null;
  caveResonance?: RouteSlateCaveResonanceSignal | null;
  caveAnchors?: readonly RouteSlateCaveAnchorSignal[];
  waystones?: readonly RouteSlateWaystoneSignal[];
  fish?: RouteSlateFishSignal | null;
  forage?: RouteSlateForageSignal | null;
  weather?: WeatherReport;
  insights?: ExpeditionInsightState | null;
  domain?: RouteSlateDomainSignal | null;
  site?: RouteSlateSiteSignal | null;
  thresholdChamber?: RouteSlateThresholdChamberSignal | null;
  resource?: RouteSlateResourceSignal | null;
  skyfall?: RouteSlateSkyfallSignal | null;
  murmur?: RouteSlateMurmurSignal | null;
  season?: RouteSlateSeasonSignal | null;
  seasonAfterglow?: RouteSlateSeasonAfterglowSignal | null;
  nativeLife?: readonly RouteSlateNativeLifeSignal[];
}

export interface RouteSlate {
  title: string;
  summary: string;
  primary: RoutePin | null;
  pins: RoutePin[];
}

export interface RouteGuideInput {
  chart: HorizonChartSignal | null;
  beacon: HearthBeaconSignal | null;
  routePlan?: RoutePlanSignal | null;
  cave?: RouteSlateCaveSignal | null;
  caveAnchors?: readonly RouteSlateCaveAnchorSignal[];
  waystones?: readonly RouteSlateWaystoneSignal[];
  skyfall?: RouteSlateSkyfallSignal | null;
  murmur?: RouteSlateMurmurSignal | null;
  seasonAfterglow?: RouteSlateSeasonAfterglowSignal | null;
  seasonGuides?: readonly RouteGuide[];
  nativeLife?: readonly RouteSlateNativeLifeSignal[];
}

export interface ExpeditionHomeState {
  label?: string;
  protected?: boolean;
  functional?: boolean;
  weatherVane?: boolean;
  forecastLabel?: string;
  cellarProvisions?: number;
}

export interface ExpeditionEcologyState {
  fishLabel?: string;
  fishStrength?: number;
  fishTrapReady?: number;
  shoreNetReady?: number;
  fishTrapOffRouteReady?: number;
  shoreNetOffRouteReady?: number;
}

export interface ExpeditionEcologySite {
  tile: number;
  ready?: boolean;
}

export interface RouteEcologyStagingInput {
  centers: ArrayLike<number>;
  fromTile: number;
  targetTile: number | null | undefined;
  radius: number;
  fishLabel?: string;
  fishStrength?: number;
  traps?: readonly ExpeditionEcologySite[];
  nets?: readonly ExpeditionEcologySite[];
  endpointMeters?: number;
  detourMeters?: number;
}

export interface ExpeditionPlanInput {
  signal: HorizonChartSignal | null;
  items: InventoryItems;
  survival: SurvivalState;
  weather?: WeatherReport;
  home?: ExpeditionHomeState;
  ecology?: ExpeditionEcologyState;
  planeCrafted?: boolean;
  insights?: ExpeditionInsightState | null;
  seasonChain?: NonNullable<RouteSlateSeasonSignal['chain']> | null;
}

export interface ExpeditionCheck {
  id: 'route' | 'food' | 'rest' | 'shelter' | 'tools' | 'light' | 'travel' | 'weather';
  label: string;
  ready: boolean;
  detail: string;
}

export interface ExpeditionPlan {
  ready: boolean;
  score: number;
  max: number;
  range: 'near' | 'far' | 'planetary';
  targetLabel: string;
  routeLabel: string;
  prepLabel: string;
  missing: string[];
  checks: ExpeditionCheck[];
}

function routePlanKind(value: unknown): RoutePlanSourceKind | null {
  return value === 'target'
    || value === 'home'
    || value === 'waystone'
    || value === 'cave'
    || value === 'caveAnchor'
    || value === 'skyfall'
    || value === 'murmur'
    || value === 'seasonAfterglow'
    || value === 'nativeHazard'
    || value === 'nativeLife'
    ? value
    : null;
}

function routePlanCleanText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > 0 ? clean : fallback;
}

function clampRoutePlanText(clean: string, max = 80): string {
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max).trimEnd();
  const separator = Math.max(clipped.lastIndexOf(' · '), clipped.lastIndexOf('; '), clipped.lastIndexOf(', '));
  if (separator >= Math.floor(max * 0.55)) return clipped.slice(0, separator).trimEnd();
  const word = clipped.lastIndexOf(' ');
  return word >= Math.floor(max * 0.55) ? clipped.slice(0, word).trimEnd() : clipped;
}

function routePlanText(value: unknown, fallback: string): string {
  return clampRoutePlanText(routePlanCleanText(value, fallback));
}

function routePlanDetailFromGuide(detail: string): string {
  const clean = routePlanCleanText(detail, 'route pinned');
  const withoutLiveDistance = clean
    .replace(/^(?:\d+(?:\.\d+)?\s*km|\d+\s*m)\s+(?:ahead|right|left|behind)(?:\s*·\s*)?/, '')
    .trim();
  return withoutLiveDistance.length > 0 ? clampRoutePlanText(withoutLiveDistance) : 'route pinned';
}

function normalizeRoutePlanLeg(raw: unknown, tileCount: number): RoutePlanLegSave | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<RoutePlanLegSave>;
  const targetTile = Number.isFinite(value.targetTile) ? Math.trunc(value.targetTile!) : -1;
  const originTile = Number.isFinite(value.originTile) ? Math.trunc(value.originTile!) : 0;
  const sourceKind = routePlanKind(value.sourceKind);
  if (!sourceKind || targetTile < 0 || targetTile >= tileCount) return null;
  const reached = value.reached === true;
  const leg: RoutePlanLegSave = {
    targetTile,
    sourceKind,
    label: routePlanText(value.label, 'planned path'),
    detail: routePlanText(value.detail, 'route pinned'),
    originTile: Math.max(0, Math.min(Math.max(0, tileCount - 1), originTile)),
    setDay: Math.max(0, Math.trunc(Number.isFinite(value.setDay) ? value.setDay! : 0)),
    setMinute: Math.max(0, Math.min(24 * 60 - 0.001, Number.isFinite(value.setMinute) ? value.setMinute! : 0)),
  };
  if (reached) {
    leg.reached = true;
    leg.reachedDay = Math.max(0, Math.trunc(Number.isFinite(value.reachedDay) ? value.reachedDay! : leg.setDay));
    leg.reachedMinute = Math.max(0, Math.min(24 * 60 - 0.001, Number.isFinite(value.reachedMinute) ? value.reachedMinute! : leg.setMinute));
  }
  return leg;
}

function routePlanLegKey(leg: Pick<RoutePlanLegSave, 'sourceKind' | 'targetTile'>): string {
  return `tile:${Math.trunc(leg.targetTile)}`;
}

function routePlanLegEditLocked(leg: Pick<RoutePlanLegSave, 'sourceKind' | 'label'>): boolean {
  return (leg.sourceKind === 'skyfall' || leg.sourceKind === 'murmur') && leg.label.startsWith('Season ');
}

function distinctRoutePlanLegs(legs: readonly RoutePlanLegSave[], maxLegs = ROUTE_ITINERARY_MAX_LEGS): RoutePlanLegSave[] {
  const out: RoutePlanLegSave[] = [];
  const seen = new Set<string>();
  for (const leg of legs) {
    const key = routePlanLegKey(leg);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...leg });
    if (out.length >= maxLegs) break;
  }
  return out;
}

function routePlanFromLegs(legs: readonly RoutePlanLegSave[]): RoutePlanSave | null {
  const clean = distinctRoutePlanLegs(legs);
  if (clean.length === 0) return null;
  const activeIndex = clean.findIndex((leg) => leg.reached !== true);
  const active = clean[activeIndex >= 0 ? activeIndex : clean.length - 1];
  return { ...active, legs: clean };
}

export function routePlanItineraryStatus(plan: RoutePlanSave | null | undefined): RoutePlanItineraryStatus | null {
  if (!plan) return null;
  const legs = distinctRoutePlanLegs(Array.isArray(plan.legs) && plan.legs.length > 0 ? plan.legs : [plan]);
  if (legs.length === 0) return null;
  const activeIndex = legs.findIndex((leg) => leg.reached !== true);
  const complete = activeIndex < 0;
  const index = complete ? legs.length - 1 : activeIndex;
  return {
    legs,
    active: legs[index],
    activeIndex: index,
    reachedCount: legs.filter((leg) => leg.reached === true).length,
    complete,
  };
}

export function normalizeRoutePlan(raw: unknown, tileCount: number): RoutePlanSave | null {
  const single = normalizeRoutePlanLeg(raw, tileCount);
  if (!single) return null;
  const value = raw as Partial<RoutePlanSave>;
  if (!Array.isArray(value.legs) || value.legs.length === 0) return single;
  const legs = distinctRoutePlanLegs(
    value.legs
      .map((leg) => normalizeRoutePlanLeg(leg, tileCount))
      .filter((leg): leg is RoutePlanLegSave => leg !== null),
  );
  return routePlanFromLegs(legs.length > 0 ? legs : [single]);
}

export function createRoutePlanFromGuide(
  guide: RouteGuide | null,
  originTile: number,
  day: number,
  minute: number,
): RoutePlanSave | null {
  if (!guide || guide.kind === 'planned') return null;
  const sourceKind = routePlanKind(guide.kind);
  const targetTile = Number.isFinite(guide.targetTile) ? Math.trunc(guide.targetTile) : -1;
  if (!sourceKind || targetTile < 0) return null;
  return {
    targetTile,
    sourceKind,
    label: routePlanText(guide.label, 'planned path'),
    detail: routePlanDetailFromGuide(guide.detail),
    originTile: Math.max(0, Math.trunc(Number.isFinite(originTile) ? originTile : 0)),
    setDay: Math.max(0, Math.trunc(Number.isFinite(day) ? day : 0)),
    setMinute: Math.max(0, Math.min(24 * 60 - 0.001, Number.isFinite(minute) ? minute : 0)),
  };
}

export function createRoutePlanFromGuides(
  guides: readonly RouteGuide[],
  originTile: number,
  day: number,
  minute: number,
  maxLegs = ROUTE_ITINERARY_MAX_LEGS,
): RoutePlanSave | null {
  const legs = distinctRoutePlanLegs(
    guides
      .map((guide) => createRoutePlanFromGuide(guide, originTile, day, minute))
      .filter((leg): leg is RoutePlanLegSave => leg !== null),
    maxLegs,
  );
  return routePlanFromLegs(legs);
}

export function addRoutePlanLeg(
  plan: RoutePlanSave | null | undefined,
  guide: RouteGuide | null,
  originTile: number,
  day: number,
  minute: number,
  maxLegs = ROUTE_ITINERARY_MAX_LEGS,
): RoutePlanAddResult {
  const leg = createRoutePlanFromGuide(guide, originTile, day, minute);
  if (!leg) {
    return { ok: false, reason: 'invalid', plan: plan ?? null, label: '', legCount: routePlanItineraryStatus(plan)?.legs.length ?? 0 };
  }
  const status = routePlanItineraryStatus(plan);
  if (!status) {
    const next = routePlanFromLegs([leg]);
    return { ok: next !== null, reason: next ? 'created' : 'invalid', plan: next, label: leg.label, legCount: next?.legs?.length ?? 0 };
  }
  const legs = status.legs.slice();
  const duplicate = legs.some((existing) => existing.reached !== true && routePlanLegKey(existing) === routePlanLegKey(leg));
  if (duplicate) {
    return { ok: false, reason: 'duplicate', plan: routePlanFromLegs(legs), label: leg.label, legCount: legs.length };
  }
  if (legs.length >= Math.max(1, Math.trunc(maxLegs))) {
    return { ok: false, reason: 'full', plan: routePlanFromLegs(legs), label: leg.label, legCount: legs.length };
  }
  legs.push(leg);
  const next = routePlanFromLegs(legs);
  return { ok: next !== null, reason: 'added', plan: next, label: leg.label, legCount: next?.legs?.length ?? legs.length };
}

export function deferActiveRoutePlanLeg(plan: RoutePlanSave | null | undefined): RoutePlanEditResult {
  const status = routePlanItineraryStatus(plan);
  if (!status) return { ok: false, reason: 'invalid', plan: plan ?? null, label: '', legCount: 0, activeIndex: 0 };
  if (status.complete) {
    return { ok: false, reason: 'complete', plan: routePlanFromLegs(status.legs), label: status.active.label, legCount: status.legs.length, activeIndex: status.activeIndex };
  }
  if (routePlanLegEditLocked(status.active)) {
    return { ok: false, reason: 'locked', plan: routePlanFromLegs(status.legs), label: status.active.label, legCount: status.legs.length, activeIndex: status.activeIndex };
  }
  const laterUnreached = status.legs.some((leg, index) => index > status.activeIndex && leg.reached !== true);
  if (!laterUnreached) {
    return { ok: false, reason: 'single', plan: routePlanFromLegs(status.legs), label: status.active.label, legCount: status.legs.length, activeIndex: status.activeIndex };
  }
  const legs = status.legs.map((leg) => ({ ...leg }));
  const [active] = legs.splice(status.activeIndex, 1);
  legs.push(active);
  const next = routePlanFromLegs(legs);
  const nextStatus = routePlanItineraryStatus(next);
  return {
    ok: next !== null,
    reason: next ? 'deferred' : 'invalid',
    plan: next,
    label: active.label,
    legCount: nextStatus?.legs.length ?? legs.length,
    activeIndex: nextStatus?.activeIndex ?? 0,
  };
}

export function removeActiveRoutePlanLeg(plan: RoutePlanSave | null | undefined): RoutePlanEditResult {
  const status = routePlanItineraryStatus(plan);
  if (!status) return { ok: false, reason: 'invalid', plan: plan ?? null, label: '', legCount: 0, activeIndex: 0 };
  if (status.complete) {
    return { ok: false, reason: 'complete', plan: routePlanFromLegs(status.legs), label: status.active.label, legCount: status.legs.length, activeIndex: status.activeIndex };
  }
  if (routePlanLegEditLocked(status.active)) {
    return { ok: false, reason: 'locked', plan: routePlanFromLegs(status.legs), label: status.active.label, legCount: status.legs.length, activeIndex: status.activeIndex };
  }
  const legs = status.legs.map((leg) => ({ ...leg }));
  const [removed] = legs.splice(status.activeIndex, 1);
  const next = routePlanFromLegs(legs);
  const nextStatus = routePlanItineraryStatus(next);
  return {
    ok: true,
    reason: 'removed',
    plan: next,
    label: removed.label,
    legCount: nextStatus?.legs.length ?? 0,
    activeIndex: nextStatus?.activeIndex ?? 0,
  };
}

export function markRoutePlanLegReached(
  plan: RoutePlanSave | null | undefined,
  day: number,
  minute: number,
): RoutePlanArrivalResult {
  const status = routePlanItineraryStatus(plan);
  if (!status || status.complete || status.active.reached === true) {
    return {
      changed: false,
      plan: plan ?? null,
      complete: status?.complete ?? false,
      advanced: false,
      label: status?.active.label ?? '',
      legIndex: status?.activeIndex ?? 0,
      legCount: status?.legs.length ?? 0,
      message: '',
    };
  }
  const legs = status.legs.map((leg, index) => index === status.activeIndex
    ? {
      ...leg,
      reached: true,
      reachedDay: Math.max(0, Math.trunc(Number.isFinite(day) ? day : leg.setDay)),
      reachedMinute: Math.max(0, Math.min(24 * 60 - 0.001, Number.isFinite(minute) ? minute : leg.setMinute)),
    }
    : { ...leg });
  const next = routePlanFromLegs(legs);
  const nextStatus = routePlanItineraryStatus(next);
  const complete = nextStatus?.complete ?? false;
  const label = status.active.label;
  const message = complete
    ? `itinerary complete · ${legs.length}/${legs.length} stops · ${label}`
    : `route stop ${status.activeIndex + 1}/${legs.length} reached · next: ${nextStatus?.active.label ?? 'route'}`;
  return {
    changed: true,
    plan: next,
    complete,
    advanced: !complete,
    label,
    legIndex: status.activeIndex,
    legCount: legs.length,
    message,
  };
}

export function routePlanSignal(
  plan: RoutePlanSave | null | undefined,
  centers: ArrayLike<number>,
  frame: ChartFrame,
  fromTile: number,
  forward: readonly number[],
  radius: number,
): RoutePlanSignal | null {
  const status = routePlanItineraryStatus(plan);
  if (!status) return null;
  const active = status.active;
  const distanceM = greatCircleDistanceMeters(centers, fromTile, active.targetTile, radius);
  const distanceLabel = formatChartDistance(distanceM);
  const bearingDeg = chartBearingDegrees(centers, frame, fromTile, forward, active.targetTile);
  const turn = chartTurnLabel(bearingDeg);
  const complete = status.complete;
  const arrived = complete || distanceM <= 8;
  const label = routePlanText(active.label, 'planned path');
  const detail = routePlanText(active.detail, 'route pinned');
  const legCount = status.legs.length;
  const stopLabel = legCount > 1 ? `stop ${status.activeIndex + 1}/${legCount} · ` : '';
  return {
    targetTile: active.targetTile,
    sourceKind: active.sourceKind,
    label,
    detail,
    distanceM,
    distanceLabel,
    bearingDeg,
    turn,
    arrived,
    complete,
    legIndex: status.activeIndex,
    legCount,
    reachedCount: status.reachedCount,
    message: arrived
      ? complete
        ? `itinerary complete · ${status.reachedCount}/${legCount} stops`
        : `planned ${stopLabel}reached · ${label}`
      : `planned ${stopLabel}${distanceLabel} ${turn} · ${label}`,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function unitAt(centers: ArrayLike<number>, tile: number): [number, number, number] {
  const i = Math.max(0, Math.trunc(tile)) * 3;
  const x = centers[i] ?? 0;
  const y = centers[i + 1] ?? 0;
  const z = centers[i + 2] ?? 1;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

export function formatChartDistance(distanceM: number): string {
  const d = Math.max(0, distanceM);
  if (d >= 1000) return `${(d / 1000).toFixed(d >= 10000 ? 0 : 1)} km`;
  return `${Math.round(d)} m`;
}

export function greatCircleDistanceMeters(
  centers: ArrayLike<number>,
  fromTile: number,
  toTile: number,
  radius: number,
): number {
  const a = unitAt(centers, fromTile);
  const b = unitAt(centers, toTile);
  const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  return Math.acos(dot) * Math.max(0, radius);
}

export function routeAdjacentTile(
  centers: ArrayLike<number>,
  fromTile: number,
  targetTile: number | null | undefined,
  siteTile: number,
  radius: number,
  endpointMeters = 180,
  detourMeters = 220,
): boolean {
  if (!Number.isFinite(targetTile) || !Number.isFinite(siteTile)) return false;
  const target = Math.trunc(targetTile!);
  const site = Math.trunc(siteTile);
  const sphereRadius = Math.max(0, radius);
  const routeDistance = greatCircleDistanceMeters(centers, fromTile, target, sphereRadius);
  const fromDistance = greatCircleDistanceMeters(centers, fromTile, site, sphereRadius);
  const targetDistance = greatCircleDistanceMeters(centers, target, site, sphereRadius);
  if (routeDistance <= 1e-3 || sphereRadius <= 1e-3) return fromDistance <= endpointMeters;
  if (fromDistance <= endpointMeters || targetDistance <= endpointMeters) return true;
  const from = unitAt(centers, fromTile);
  const to = unitAt(centers, target);
  const point = unitAt(centers, site);
  const nx = from[1] * to[2] - from[2] * to[1];
  const ny = from[2] * to[0] - from[0] * to[2];
  const nz = from[0] * to[1] - from[1] * to[0];
  const nl = Math.hypot(nx, ny, nz);
  if (nl <= 1e-6) return fromDistance + targetDistance - routeDistance <= detourMeters;
  const crossTrack = Math.asin(clamp(Math.abs((point[0] * nx + point[1] * ny + point[2] * nz) / nl), 0, 1)) * sphereRadius;
  if (crossTrack > detourMeters) return false;
  return fromDistance + targetDistance - routeDistance <= Math.max(detourMeters * 1.5, endpointMeters);
}

function routeEcologyCount(
  sites: readonly ExpeditionEcologySite[] | undefined,
  input: RouteEcologyStagingInput,
): { ready: number; offRouteReady: number } {
  let ready = 0;
  let offRouteReady = 0;
  for (const site of sites ?? []) {
    if (site.ready !== true) continue;
    if (routeAdjacentTile(
      input.centers,
      input.fromTile,
      input.targetTile,
      site.tile,
      input.radius,
      input.endpointMeters,
      input.detourMeters,
    )) ready += 1;
    else offRouteReady += 1;
  }
  return { ready, offRouteReady };
}

export function routeEcologyForExpedition(input: RouteEcologyStagingInput): ExpeditionEcologyState {
  const traps = routeEcologyCount(input.traps, input);
  const nets = routeEcologyCount(input.nets, input);
  return {
    fishLabel: input.fishLabel,
    fishStrength: input.fishStrength,
    fishTrapReady: traps.ready,
    shoreNetReady: nets.ready,
    fishTrapOffRouteReady: traps.offRouteReady,
    shoreNetOffRouteReady: nets.offRouteReady,
  };
}

export function chartTurnLabel(bearingDeg: number): HorizonChartSignal['turn'] {
  const b = Math.abs(bearingDeg);
  if (b <= 38) return 'ahead';
  if (b >= 142) return 'behind';
  return bearingDeg > 0 ? 'right' : 'left';
}

export function chartBearingDegrees(
  centers: ArrayLike<number>,
  frame: ChartFrame,
  fromTile: number,
  forward: readonly number[],
  toTile: number,
): number {
  const up = unitAt(centers, fromTile);
  const target = unitAt(centers, toTile);
  const targetDot = target[0] * up[0] + target[1] * up[1] + target[2] * up[2];
  let tx = target[0] - up[0] * targetDot;
  let ty = target[1] - up[1] * targetDot;
  let tz = target[2] - up[2] * targetDot;
  let tl = Math.hypot(tx, ty, tz);
  if (tl < 1e-7) return 0;
  tx /= tl; ty /= tl; tz /= tl;

  const fDot = (forward[0] ?? 0) * up[0] + (forward[1] ?? 0) * up[1] + (forward[2] ?? 0) * up[2];
  let fx = (forward[0] ?? 0) - up[0] * fDot;
  let fy = (forward[1] ?? 0) - up[1] * fDot;
  let fz = (forward[2] ?? 0) - up[2] * fDot;
  let fl = Math.hypot(fx, fy, fz);
  if (fl < 1e-7) {
    fx = frame.east[0] ?? 1;
    fy = frame.east[1] ?? 0;
    fz = frame.east[2] ?? 0;
    fl = Math.hypot(fx, fy, fz) || 1;
  }
  fx /= fl; fy /= fl; fz /= fl;

  const rx = fy * up[2] - fz * up[1];
  const ry = fz * up[0] - fx * up[2];
  const rz = fx * up[1] - fy * up[0];
  const ahead = tx * fx + ty * fy + tz * fz;
  const right = tx * rx + ty * ry + tz * rz;
  return Math.atan2(right, ahead) * 180 / Math.PI;
}

export function nextHorizonChartSignal(
  landmarks: readonly PentagonLandmark[],
  discovered: ReadonlySet<number>,
  centers: ArrayLike<number>,
  frame: ChartFrame,
  fromTile: number,
  forward: readonly number[],
  radius: number,
): HorizonChartSignal | null {
  const targets = landmarks.filter((landmark) => !discovered.has(landmark.tile));
  if (targets.length === 0) return null;
  let target = targets[0];
  let distanceM = greatCircleDistanceMeters(centers, fromTile, target.tile, radius);
  for (let i = 1; i < targets.length; i++) {
    const d = greatCircleDistanceMeters(centers, fromTile, targets[i].tile, radius);
    if (d < distanceM) {
      target = targets[i];
      distanceM = d;
    }
  }
  const bearingDeg = chartBearingDegrees(centers, frame, fromTile, forward, target.tile);
  const turn = chartTurnLabel(bearingDeg);
  const distanceLabel = formatChartDistance(distanceM);
  return {
    target,
    distanceM,
    distanceLabel,
    bearingDeg,
    turn,
    remaining: targets.length,
    total: landmarks.length,
    label: `${target.name} ${distanceLabel} ${turn}`,
  };
}

function caveLabel(kind: RouteSlateCaveSignal['kind']): string {
  return kind === 'dryCave' ? 'dry cave' : kind === 'seaCave' ? 'sea cave' : 'natural arch';
}

function insightSet(insights?: ExpeditionInsightState | null): Set<PentagonInsightEffect> {
  return new Set(insights?.effects ?? []);
}

function hasAnyInsight(effects: ReadonlySet<PentagonInsightEffect>, values: readonly PentagonInsightEffect[]): boolean {
  return values.some((value) => effects.has(value));
}

export function routeSlate(input: RouteSlateInput): RouteSlate {
  const pins: RoutePin[] = [];
  if (input.routePlan) {
    const multi = input.routePlan.legCount > 1;
    const routeLabel = input.routePlan.complete
      ? multi ? 'Itinerary Complete' : 'Planned Path Reached'
      : input.routePlan.arrived
      ? multi ? `Itinerary Stop ${input.routePlan.legIndex + 1}/${input.routePlan.legCount} Reached` : 'Planned Path Reached'
      : multi ? `Itinerary Stop ${input.routePlan.legIndex + 1}/${input.routePlan.legCount}` : 'Planned Path';
    const stop = multi ? `stop ${input.routePlan.legIndex + 1}/${input.routePlan.legCount} · ` : '';
    const completeDetail = multi
      ? `${input.routePlan.reachedCount}/${input.routePlan.legCount} stops reached · last: ${input.routePlan.label}`
      : `${input.routePlan.label} · here · ${input.routePlan.detail}`;
    pins.push({
      id: 'planned',
      label: routeLabel,
      detail: input.routePlan.complete
        ? completeDetail
        : input.routePlan.arrived
        ? `${stop}${input.routePlan.label} · here · ${input.routePlan.detail}`
        : `${stop}${input.routePlan.label} · ${input.routePlan.distanceLabel} ${input.routePlan.turn} · ${input.routePlan.detail}`,
      priority: input.routePlan.complete ? 108 : input.routePlan.arrived ? 118 : 126,
      ready: true,
    });
  }
  if (input.chart) {
    const foodDetail = input.plan.checks.find((check) => check.id === 'food')?.detail ?? '';
    const showFoodDetail = foodDetail.length > 0
      && (input.plan.missing.includes('packed food') || /waterline|cellar|insight|season chord/.test(foodDetail));
    pins.push({
      id: 'target',
      label: input.chart.target.name,
      detail: `${input.chart.distanceLabel} ${input.chart.turn} · ${input.plan.prepLabel}${showFoodDetail ? ` · ${foodDetail}` : ''}`,
      priority: input.plan.ready ? 120 : 100,
      ready: input.plan.ready,
    });
  } else if (input.plan.missing.includes('route')) {
    pins.push({
      id: 'prep',
      label: 'choose a mystery',
      detail: 'awaken a pentagon to unlock the Horizon Chart',
      priority: 18,
      ready: false,
    });
  }
  if (input.beacon) {
    pins.push({
      id: 'home',
      label: input.beacon.active ? 'Hearth Beacon' : 'Home Memory',
      detail: input.beacon.message,
      priority: input.beacon.active ? 92 : 48,
      ready: input.beacon.active,
    });
  }
  if (input.domain) {
    const where = input.domain.ring === 0 ? 'at landmark' : `${input.domain.ring} ring${input.domain.ring === 1 ? '' : 's'} from landmark`;
    pins.push({
      id: 'domain',
      label: input.domain.discovered ? input.domain.label : input.domain.domainLabel,
      detail: `${where} · ${input.domain.discovered ? input.domain.boon : input.domain.routeHint}`,
      priority: input.domain.discovered ? 82 : 74,
      ready: input.domain.discovered,
    });
  }
  if (input.site) {
    const where = input.site.ring === 0 ? 'at landmark' : `${input.site.ring} ring${input.site.ring === 1 ? '' : 's'} from landmark`;
    const thresholdDetail = input.site.thresholdLabel
      ? ` · ${input.site.thresholdOpen ? 'opened' : 'threshold'}: ${input.site.thresholdLabel}${input.site.thresholdTraversal ? ` · ${input.site.thresholdTraversal}` : ''}`
      : '';
    const siteDetail = input.site.completed
      ? `${where} · complete · ${input.site.opportunity}${thresholdDetail}`
      : input.site.ready
      ? `${where} · ready to complete · +${input.site.rewardCount ?? 0} ${input.site.rewardLabel ?? 'reward'}${thresholdDetail}`
      : input.site.discovered
      ? `${where} · ${input.site.opportunity} · ${input.site.missing?.length ? `needs ${input.site.missing.join(', ')}` : input.site.buildHint}${thresholdDetail}`
      : `${where} · ${input.site.routeHint}${thresholdDetail}`;
    pins.push({
      id: 'site',
      label: input.site.discovered ? input.site.label : input.site.siteLabel,
      detail: siteDetail,
      priority: input.site.completed ? 96 : input.site.ready ? 92 : input.site.discovered ? 83 + input.site.intensity * 4 : 61,
      ready: input.site.completed || input.site.ready || input.site.discovered,
    });
  }
  if (input.thresholdChamber && input.thresholdChamber.open && !input.thresholdChamber.observed) {
    pins.push({
      id: 'thresholdChamber',
      label: input.thresholdChamber.label,
      detail: `${input.thresholdChamber.thresholdLabel} · ${input.thresholdChamber.detail} · +${input.thresholdChamber.rewardCount} ${input.thresholdChamber.rewardLabel}`,
      priority: 94,
      ready: true,
    });
  }
  if (input.resource && !input.resource.harvested) {
    pins.push({
      id: 'resource',
      label: input.resource.discovered ? input.resource.label : input.resource.dormantLabel,
      detail: input.resource.discovered
        ? `+${input.resource.rewardCount} ${input.resource.rewardLabel} · ${input.resource.detail}`
        : `quiet · ${input.resource.hint}`,
      priority: input.resource.discovered ? 84 : 55,
      ready: input.resource.discovered,
    });
  }
  if (input.skyfall && input.skyfall.active && !input.skyfall.harvested) {
    const omen = input.skyfall.omenLabel ? `${input.skyfall.omenLabel} · ` : '';
    pins.push({
      id: 'skyfall',
      label: input.skyfall.label,
      detail: `${input.skyfall.distanceLabel} ${input.skyfall.turn} · ${omen}${input.skyfall.detail} · +${input.skyfall.rewardCount} ${input.skyfall.rewardLabel} · ${input.skyfall.minutesRemaining}m left`,
      priority: input.skyfall.distanceM <= 12 ? 90 : 84,
      ready: true,
    });
  }
  if (input.murmur && input.murmur.active && !input.murmur.observed) {
    pins.push({
      id: 'murmur',
      label: input.murmur.label,
      detail: `${input.murmur.distanceLabel} ${input.murmur.turn} · ${input.murmur.detail} · ${input.murmur.minutesRemaining}m before it fades`,
      priority: input.murmur.distanceM <= 12 ? 89 : 79,
      ready: true,
    });
  }
  if (input.season) {
    const priority = input.season.urgency === 'now'
      ? input.season.chain?.linked ? 91 : input.season.focus === 'split' ? 87 : 76
      : input.season.urgency === 'soon' ? 67 : 38;
    const chain = input.season.chain
      ? ` · ${input.season.chain.progressLabel} · ${input.season.chain.payoffDetail} · ${input.season.chain.routeEffect}`
      : '';
    pins.push({
      id: 'season',
      label: 'Stranger Season',
      detail: `${input.season.detail} · ${input.season.tradeoff} · ${input.season.routeHint}${chain}`,
      priority,
      ready: input.season.chain?.linked === true || input.season.focus !== 'quiet',
    });
  }
  if (input.seasonAfterglow) {
    const read = input.seasonAfterglow.read === true;
    pins.push({
      id: 'seasonAfterglow',
      label: input.seasonAfterglow.label,
      detail: read
        ? `read · ${input.seasonAfterglow.note}`
        : `${input.seasonAfterglow.distanceLabel} ${input.seasonAfterglow.turn} · ${input.seasonAfterglow.detail} · ${input.seasonAfterglow.routeHint} · focus ${input.seasonAfterglow.focusMinutes}m`,
      priority: read ? 43 : 93,
      ready: !read,
    });
  }
  if (input.cave) {
    const rings = input.cave.distance === 0 ? 'here' : `${input.cave.distance} ring${input.cave.distance === 1 ? '' : 's'}`;
    const mouth = input.cave.mouth ? 'mouth · ' : '';
    const clearance = input.cave.clearance !== undefined ? ` · clearance ${input.cave.clearance} cells` : '';
    const spring = input.cave.spring ? ' · spring seep' : '';
    const archReady = input.cave.kind === 'arch' && (input.cave.clearance ?? 0) >= 4;
    pins.push({
      id: 'cave',
      label: input.cave.label ?? caveLabel(input.cave.kind),
      detail: `${mouth}${rings} · depth ${input.cave.depth.toFixed(1)} m${clearance}${input.cave.flooded ? ' · flooded' : ''}${spring}`,
      priority: input.cave.distance === 0 ? 88 : input.cave.distance === 1 ? 72 : 58,
      ready: input.cave.kind !== 'arch' || archReady,
    });
  }
  if (input.caveResonance) {
    pins.push({
      id: 'caveResonance',
      label: input.caveResonance.label,
      detail: input.caveResonance.observed
        ? `noted · ${input.caveResonance.note}`
        : `${input.caveResonance.detail} · +${input.caveResonance.rewardCount} ${input.caveResonance.rewardLabel}`,
      priority: input.caveResonance.observed ? 57 : 89,
      ready: true,
    });
  }
  for (const anchor of (input.caveAnchors ?? []).slice(0, 3)) {
    const clearance = anchor.clearance !== undefined ? ` · clearance ${anchor.clearance} cells` : '';
    const spring = anchor.spring ? ' · spring seep' : '';
    const uses = anchor.uses && anchor.uses > 1 ? ` · set ${anchor.uses}x` : '';
    pins.push({
      id: 'caveAnchor',
      label: anchor.label || `anchored ${caveAnchorKindLabel(anchor.kind)}`,
      detail: `${anchor.distanceLabel} ${anchor.turn} · anchored ${caveAnchorKindLabel(anchor.kind)} · depth ${anchor.depth.toFixed(1)} m${clearance}${anchor.flooded ? ' · flooded' : ''}${spring}${uses}`,
      priority: anchor.kind === 'arch' ? 68 : 86,
      ready: anchor.kind !== 'arch',
    });
  }
  if (input.insights && input.insights.count > 0) {
    const total = Math.max(input.insights.count, Math.trunc(input.insights.total ?? input.insights.count));
    pins.push({
      id: 'insight',
      label: 'Pentagon Insights',
      detail: `${input.insights.count}/${total} · ${input.insights.prepLabel ?? input.insights.labels?.slice(0, 3).join(' + ') ?? 'new readings'}`,
      priority: input.chart ? 66 : 44,
      ready: true,
    });
  }
  for (const stone of (input.waystones ?? []).slice(0, 3)) {
    const priority = stone.mark === 'home'
      ? 86
      : stone.mark === 'cave'
      ? 78
      : stone.mark === 'shore'
      ? 56
      : stone.mark === 'forage'
      ? 52
      : 46;
    pins.push({
      id: 'waystone',
      label: stone.label || waystoneMarkLabel(stone.mark),
      detail: `${stone.distanceLabel} ${stone.turn} · persistent marker`,
      priority,
      ready: true,
    });
  }
  if (input.weather?.kind === 'storm') {
    const weatherCheck = input.plan.checks.find((check) => check.id === 'weather');
    pins.push({
      id: 'weather',
      label: input.weather.label,
      detail: `${weatherCheck?.detail ?? 'dangerous travel'} · stronger fish runs`,
      priority: 64 + input.weather.intensity * 10,
      ready: weatherCheck?.ready ?? false,
    });
  }
  if (input.fish && input.fish.kind !== 'none' && input.fish.strength > 0.12) {
    const trapDetail = Math.max(0, Math.trunc(input.fish.trapCount ?? 0)) > 0
      ? ` · traps ${Math.max(0, Math.trunc(input.fish.trapReady ?? 0))}/${Math.max(0, Math.trunc(input.fish.trapCount ?? 0))} ready`
      : '';
    const netDetail = Math.max(0, Math.trunc(input.fish.netCount ?? 0)) > 0
      ? ` · nets ${Math.max(0, Math.trunc(input.fish.netReady ?? 0))}/${Math.max(0, Math.trunc(input.fish.netCount ?? 0))} ready`
      : '';
    pins.push({
      id: 'fish',
      label: input.fish.label,
      detail: `strength ${input.fish.strength.toFixed(2)} · catch ${input.fish.catchCount}${trapDetail}${netDetail}${input.fish.baitUseful ? ' · bait helps' : ''}`,
      priority: 42 + input.fish.strength * 28,
      ready: input.fish.catchCount > 0 || Math.max(0, Math.trunc(input.fish.trapReady ?? 0)) > 0 || Math.max(0, Math.trunc(input.fish.netReady ?? 0)) > 0,
    });
  }
  if (input.forage && input.forage.kind !== 'none' && input.forage.strength > 0.18) {
    pins.push({
      id: 'forage',
      label: input.forage.label,
      detail: `nearby forage · strength ${input.forage.strength.toFixed(2)}`,
      priority: 34 + input.forage.strength * 18,
      ready: true,
    });
  }
  const nativePriority = (native: RouteSlateNativeLifeSignal): number => {
    if (native.temperament !== 'harmless' && native.warded !== true) return native.temperament === 'combative' ? 95 : 91;
    if (native.temperament === 'harmless' && native.tended !== true) return 86;
    return 29;
  };
  const activeNativeHelper = (native: RouteSlateNativeLifeSignal): boolean =>
    native.temperament === 'harmless' && native.tended !== true;
  const nativeSignals = [...(input.nativeLife ?? [])].sort((a, b) => nativePriority(b) - nativePriority(a) || a.label.localeCompare(b.label));
  const nativeDisplay = nativeSignals.slice(0, 3);
  const helper = nativeSignals.find(activeNativeHelper);
  if (helper && !nativeDisplay.includes(helper) && nativeDisplay.length >= 3) {
    nativeDisplay[nativeDisplay.length - 1] = helper;
  }
  for (const native of nativeDisplay) {
    const where = native.distanceLabel && native.turn ? `${native.distanceLabel} ${native.turn}` : 'nearby';
    const reward = `+${Math.max(0, Math.trunc(native.rewardCount))} ${native.rewardLabel}`;
    const activeHazard = native.temperament !== 'harmless' && native.warded !== true;
    const activeHelper = native.temperament === 'harmless' && native.tended !== true;
    const detail = activeHazard
      ? `${where} · ${native.telegraph ?? native.detail} · answer: ${native.weakness ?? native.hint} · ${reward}`
      : activeHelper
      ? `${where} · ${native.detail} · tend: ${native.hint} · ${reward}`
      : `${where} · ${native.warded ? native.result ?? 'warded and quiet' : native.tended ? 'tended and remembered' : native.detail} · ${native.hint}`;
    pins.push({
      id: activeHazard ? 'nativeHazard' : 'nativeLife',
      label: native.label,
      detail,
      priority: activeHazard
        ? native.temperament === 'combative' ? 95 : 91
        : activeHelper ? 86 : 29,
      ready: activeHazard ? native.weakness !== undefined || native.hint.length > 0 : activeHelper,
    });
  }
  pins.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
  const primary = pins[0] ?? null;
  const summary = pins.length === 0
    ? 'no route pins'
    : pins.slice(0, 3).map((pin) => pin.label).join(' · ');
  const title = input.chart ? 'Horizon Route Slate' : input.routePlan ? 'Planned Route Slate' : input.beacon ? 'Hearth Route Slate' : 'Local Route Slate';
  return { title, summary, primary, pins };
}

export function routeGuideCandidates(input: RouteGuideInput): RouteGuide[] {
  const candidates: RouteGuide[] = [];
  if (input.routePlan && !input.routePlan.complete && !input.routePlan.arrived && input.routePlan.distanceM > 8) {
    const stop = input.routePlan.legCount > 1 ? `stop ${input.routePlan.legIndex + 1}/${input.routePlan.legCount} · ` : '';
    candidates.push({
      kind: 'planned',
      targetTile: input.routePlan.targetTile,
      label: input.routePlan.label,
      detail: `${stop}${input.routePlan.distanceLabel} ${input.routePlan.turn} · ${input.routePlan.detail}`,
      priority: 132,
    });
  }
  for (const native of input.nativeLife ?? []) {
    if (native.tile === undefined || !Number.isFinite(native.tile)) continue;
    const distanceM = Number.isFinite(native.distanceM) ? Math.max(0, native.distanceM!) : Infinity;
    if (distanceM <= 8 || native.warded === true || native.tended === true) continue;
    const activeHazard = native.temperament !== 'harmless';
    const kind: RoutePlanSourceKind = activeHazard ? 'nativeHazard' : 'nativeLife';
    const distanceLabel = native.distanceLabel ?? (Number.isFinite(distanceM) ? formatChartDistance(distanceM) : 'nearby');
    const turn = native.turn ? ` ${native.turn}` : '';
    const rawAnswer = activeHazard ? native.weakness ?? native.hint : native.hint;
    const answer = rawAnswer.split(/[.;]/)[0]?.trim() || rawAnswer;
    candidates.push({
      kind,
      targetTile: Math.trunc(native.tile),
      label: native.label,
      detail: `${distanceLabel}${turn} · ${activeHazard ? 'answer' : 'tend'}: ${answer} · +${Math.max(0, Math.trunc(native.rewardCount))} ${native.rewardLabel}`,
      priority: activeHazard
        ? native.temperament === 'combative' ? 138 : 134
        : 92,
    });
  }
  if (
    input.seasonAfterglow
    && input.seasonAfterglow.tile !== undefined
    && Number.isFinite(input.seasonAfterglow.tile)
    && input.seasonAfterglow.read !== true
    && input.seasonAfterglow.distanceM > 8
  ) {
    candidates.push({
      kind: 'seasonAfterglow',
      targetTile: Math.trunc(input.seasonAfterglow.tile),
      label: input.seasonAfterglow.label,
      detail: `${input.seasonAfterglow.distanceLabel} ${input.seasonAfterglow.turn} · ${input.seasonAfterglow.routeHint} · focus ${input.seasonAfterglow.focusMinutes}m`,
      priority: 129,
    });
  }
  for (const guide of input.seasonGuides ?? []) {
    if (guide.kind === 'planned') continue;
    const targetTile = Number.isFinite(guide.targetTile) ? Math.trunc(guide.targetTile) : -1;
    if (targetTile < 0) continue;
    candidates.push({
      kind: guide.kind,
      targetTile,
      label: routePlanText(guide.label, guide.kind === 'skyfall' ? 'Season Fall' : 'Season Note'),
      detail: routePlanText(guide.detail, 'season route'),
      priority: Number.isFinite(guide.priority) ? guide.priority : 90,
    });
  }
  if (input.chart) {
    candidates.push({
      kind: 'target',
      targetTile: input.chart.target.tile,
      label: input.chart.target.name,
      detail: `${input.chart.distanceLabel} ${input.chart.turn}`,
      priority: 120,
    });
  }
  if (input.beacon && input.beacon.distanceM > 8) {
    candidates.push({
      kind: 'home',
      targetTile: input.beacon.homeTile,
      label: input.beacon.active ? 'Hearth Beacon' : 'Home Memory',
      detail: input.beacon.message,
      priority: input.beacon.active ? 96 : 62,
    });
  }
  for (const stone of input.waystones ?? []) {
    if (stone.tile === undefined || !Number.isFinite(stone.tile)) continue;
    const priority = stone.mark === 'home'
      ? 90
      : stone.mark === 'cave'
      ? 82
      : stone.mark === 'shore'
      ? 66
      : stone.mark === 'forage'
      ? 62
      : 54;
    candidates.push({
      kind: 'waystone',
      targetTile: Math.trunc(stone.tile!),
      label: stone.label || waystoneMarkLabel(stone.mark),
      detail: `${stone.distanceLabel} ${stone.turn}`,
      priority,
    });
  }
  for (const anchor of input.caveAnchors ?? []) {
    if (anchor.tile === undefined || !Number.isFinite(anchor.tile) || anchor.distanceM <= 8) continue;
    candidates.push({
      kind: 'caveAnchor',
      targetTile: Math.trunc(anchor.tile!),
      label: anchor.label || `anchored ${caveAnchorKindLabel(anchor.kind)}`,
      detail: `${anchor.distanceLabel} ${anchor.turn} · depth ${anchor.depth.toFixed(1)} m${anchor.spring ? ' · spring seep' : ''}`,
      priority: anchor.kind === 'arch' ? 70 : 86,
    });
  }
  if (input.skyfall && input.skyfall.tile !== undefined && Number.isFinite(input.skyfall.tile) && input.skyfall.active && !input.skyfall.harvested && input.skyfall.distanceM > 8) {
    const omen = input.skyfall.omenLabel ? ` · ${input.skyfall.omenLabel}` : '';
    candidates.push({
      kind: 'skyfall',
      targetTile: Math.trunc(input.skyfall.tile),
      label: input.skyfall.label,
      detail: `${input.skyfall.distanceLabel} ${input.skyfall.turn}${omen} · ${input.skyfall.minutesRemaining}m left`,
      priority: 88,
    });
  }
  if (input.murmur && input.murmur.tile !== undefined && Number.isFinite(input.murmur.tile) && input.murmur.active && !input.murmur.observed && input.murmur.distanceM > 8) {
    candidates.push({
      kind: 'murmur',
      targetTile: Math.trunc(input.murmur.tile),
      label: input.murmur.label,
      detail: `${input.murmur.distanceLabel} ${input.murmur.turn} · ${input.murmur.minutesRemaining}m left`,
      priority: 80,
    });
  }
  if (input.cave && input.cave.tile !== undefined && Number.isFinite(input.cave.tile) && input.cave.distance > 0) {
    candidates.push({
      kind: 'cave',
      targetTile: Math.trunc(input.cave.tile!),
      label: input.cave.label ?? caveLabel(input.cave.kind),
      detail: `${input.cave.distance} ring${input.cave.distance === 1 ? '' : 's'} · depth ${input.cave.depth.toFixed(1)} m${input.cave.spring ? ' · spring seep' : ''}`,
      priority: input.cave.kind === 'arch' ? 58 : 74,
    });
  }
  candidates.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
  return candidates;
}

export function routeGuide(input: RouteGuideInput): RouteGuide | null {
  return routeGuideCandidates(input)[0] ?? null;
}

export function hearthBeaconSignal(
  structures: readonly StructureSave[],
  topology: StructureTopology | undefined,
  centers: ArrayLike<number>,
  frame: ChartFrame,
  fromTile: number,
  forward: readonly number[],
  radius: number,
): HearthBeaconSignal | null {
  const home = structures.find((s) => s.item === 'bedroll' && s.state?.home === true) ?? null;
  if (!home) return null;
  const shelter = shelterReport(structures, topology);
  const localTiles = new Set(shelter.tiles.length > 0 ? shelter.tiles : [home.tile]);
  let source: StructureSave | null = null;
  let sourceDistance = Infinity;
  for (const s of structures) {
    if (s.item !== 'campfire' || s.state?.lit !== true || !localTiles.has(s.tile)) continue;
    const d = greatCircleDistanceMeters(centers, home.tile, s.tile, radius);
    if (d < sourceDistance) {
      source = s;
      sourceDistance = d;
    }
  }
  const distanceM = greatCircleDistanceMeters(centers, fromTile, home.tile, radius);
  const distanceLabel = formatChartDistance(distanceM);
  const bearingDeg = chartBearingDegrees(centers, frame, fromTile, forward, home.tile);
  const turn = chartTurnLabel(bearingDeg);
  const active = source !== null;
  const strength = !active ? 0 : shelter.functional ? 1 : shelter.protected ? 0.82 : 0.58;
  const label = active
    ? `hearth smoke ${distanceLabel} ${turn}`
    : `home ${distanceLabel} ${turn}`;
  const message = active
    ? `hearth smoke ${distanceLabel} ${turn} · ${shelter.label}`
    : `home remembered ${distanceLabel} ${turn} · light the hearth`;
  return {
    homeTile: home.tile,
    sourceTile: source?.tile ?? null,
    active,
    strength,
    distanceM,
    distanceLabel,
    bearingDeg,
    turn,
    shelterLabel: shelter.label,
    label,
    message,
  };
}

function count(items: InventoryItems, id: keyof InventoryItems): number {
  return Math.max(0, Math.trunc(items[id] ?? 0));
}

function foodUnits(items: InventoryItems): number {
  return count(items, 'expeditionStew') * 3.6
    + count(items, 'campMeal') * 2
    + count(items, 'trailRation') * 2.4
    + count(items, 'cookedFish') * 1.4
    + count(items, 'snowHerb') * 0.9
    + count(items, 'caveMushroom') * 0.8
    + count(items, 'berries') * 0.45
    + count(items, 'kelp') * 0.35
    + count(items, 'rawFish') * 0.35;
}

function ecologyRouteResupply(input: ExpeditionEcologyState | undefined, range: ExpeditionPlan['range']): { units: number; detail: string; ignored: number } {
  if (!input || range === 'near') return { units: 0, detail: '', ignored: 0 };
  const trapReady = Math.max(0, Math.trunc(input.fishTrapReady ?? 0));
  const netReady = Math.max(0, Math.trunc(input.shoreNetReady ?? 0));
  const ignored = Math.max(0, Math.trunc(input.fishTrapOffRouteReady ?? 0))
    + Math.max(0, Math.trunc(input.shoreNetOffRouteReady ?? 0));
  if (trapReady + netReady <= 0) return { units: 0, detail: '', ignored };
  const trapUnits = Math.min(trapReady, 2) * 0.7;
  const netUnits = Math.min(netReady, 2) * 0.5;
  const fishStrength = Math.max(0, Math.min(1, input.fishStrength ?? 0));
  const runBonus = fishStrength >= 0.5 ? 0.2 : 0;
  const cap = range === 'planetary' ? 1.4 : 1;
  const units = Math.min(cap, trapUnits + netUnits + runBonus);
  const parts: string[] = [];
  if (trapReady > 0) parts.push(`${trapReady} trap${trapReady === 1 ? '' : 's'}`);
  if (netReady > 0) parts.push(`${netReady} net${netReady === 1 ? '' : 's'}`);
  if (runBonus > 0) parts.push(input.fishLabel ?? 'fish run');
  if (ignored > 0) parts.push(`off-route ${ignored} ignored`);
  return { units, detail: parts.join(' + '), ignored };
}

export function planExpedition(input: ExpeditionPlanInput): ExpeditionPlan {
  const signal = input.signal;
  const seasonChain = input.seasonChain?.linked === true ? input.seasonChain : null;
  const seasonRouteReady = seasonChain !== null;
  const seasonRouteDetail = seasonChain
    ? `${seasonChain.payoffLabel} · ${seasonChain.progressLabel} · ${seasonChain.routeEffect}`
    : '';
  const range: ExpeditionPlan['range'] = !signal || signal.distanceM < 650
    ? 'near'
    : signal.distanceM < 1550
    ? 'far'
    : 'planetary';
  const effects = insightSet(input.insights);
  const foodInsight = hasAnyInsight(effects, ['tide', 'root', 'water']);
  const hearthInsight = effects.has('hearth');
  const toolInsight = effects.has('stone');
  const caveLightInsight = hasAnyInsight(effects, ['light', 'cave']);
  const stormInsight = hasAnyInsight(effects, ['weather', 'storm', 'cold']);
  const targetLabel = signal ? signal.target.name : seasonChain ? seasonChain.payoffLabel : 'all pentagons awake';
  const routeLabel = signal
    ? `${signal.distanceLabel} ${signal.turn}`
    : seasonChain
    ? seasonChain.fullChord ? 'full season route memory' : 'linked season route memory'
    : 'return home and choose a new mystery';
  const baseRequiredFood = range === 'planetary' ? 3 : range === 'far' ? 2 : 1;
  const foodDiscount = foodInsight && range !== 'near' ? 1 : 0;
  const seasonFoodDiscount = seasonChain?.fullChord === true && range !== 'near' && foodDiscount === 0 ? 1 : 0;
  const requiredFood = Math.max(1, baseRequiredFood - foodDiscount - seasonFoodDiscount);
  const cellarProvisions = Math.max(0, Math.trunc(input.home?.cellarProvisions ?? 0));
  const ecologyResupply = ecologyRouteResupply(input.ecology, range);
  const focusMinutes = Math.max(0, Math.trunc(input.survival.trailFocus ?? 0));
  const units = foodUnits(input.items) + cellarProvisions * 2.4 + ecologyResupply.units;
  const survivalReady = input.survival.stamina >= (range === 'near' ? 40 : 64) && input.survival.exposure <= (range === 'near' ? 65 : 38);
  const homeReady = input.home?.functional === true || (range === 'near' && input.home?.protected === true) || (hearthInsight && input.home?.protected === true);
  const pickReady = hasToolForTarget(input.items, 'rock');
  const axeReady = hasToolForTarget(input.items, 'wood');
  const pickLabel = bestToolLabelForTarget(input.items, 'rock');
  const axeLabel = bestToolLabelForTarget(input.items, 'wood');
  const toolsReady = pickReady && (range === 'near' || axeReady || toolInsight);
  const lightReady = range === 'near'
    || count(input.items, 'echoLantern') > 0
    || count(input.items, 'lantern') > 0
    || (caveLightInsight && count(input.items, 'glowCrystal') > 0);
  const travelReady = range !== 'planetary' || input.planeCrafted === true || count(input.items, 'planeFrame') > 0;
  const cloakReady = count(input.items, 'stormCloak') > 0;
  const weatherReady = input.weather?.kind !== 'storm'
    || cloakReady
    || input.home?.protected === true
    || input.home?.weatherVane === true
    || stormInsight;
  const insightLabel = input.insights && input.insights.count > 0 ? input.insights.prepLabel ?? input.insights.labels?.[0] : '';

  const checks: ExpeditionCheck[] = [
    {
      id: 'route',
      label: 'route',
      ready: signal !== null || seasonRouteReady,
      detail: signal
        ? `${signal.target.name} · ${routeLabel}${seasonRouteDetail ? ` · ${seasonRouteDetail}` : ''}`
        : seasonRouteDetail || 'chart complete',
    },
    {
      id: 'food',
      label: 'packed food',
      ready: units >= requiredFood,
      detail: `${units.toFixed(units % 1 === 0 ? 0 : 1)}/${requiredFood} meal units${cellarProvisions > 0 ? ` · cellar ${cellarProvisions}` : ''}${ecologyResupply.units > 0 ? ` · waterline ${ecologyResupply.units.toFixed(ecologyResupply.units % 1 === 0 ? 0 : 1)} (${ecologyResupply.detail})` : ecologyResupply.ignored > 0 ? ` · waterline off-route ${ecologyResupply.ignored} ignored` : ''}${foodDiscount > 0 ? ' · insight -1' : ''}${seasonFoodDiscount > 0 ? ' · full season chord -1' : ''}`,
    },
    {
      id: 'rest',
      label: 'rested body',
      ready: survivalReady,
      detail: `stamina ${Math.round(input.survival.stamina)} · exposure ${Math.round(input.survival.exposure)}${focusMinutes > 0 ? ` · trail focus ${focusMinutes}m` : ''}`,
    },
    {
      id: 'shelter',
      label: 'home reset',
      ready: homeReady,
      detail: `${input.home?.label ?? 'no home shelter'}${hearthInsight && input.home?.protected === true && input.home?.functional !== true ? ' · Hearth Memory' : ''}`,
    },
    {
      id: 'tools',
      label: 'tool kit',
      ready: toolsReady,
      detail: range === 'near'
        ? pickLabel
        : toolInsight && pickReady && !axeReady
        ? `${pickLabel} + Red Stone reading`
        : `${pickLabel} + ${axeReady ? axeLabel : 'axe'}`,
    },
    {
      id: 'light',
      label: 'light',
      ready: lightReady,
      detail: count(input.items, 'echoLantern') > 0
        ? 'echo lantern packed'
        : count(input.items, 'lantern') > 0
        ? 'lantern packed'
        : caveLightInsight && count(input.items, 'glowCrystal') > 0
        ? 'glow crystal reading'
        : 'no lantern',
    },
    {
      id: 'travel',
      label: 'travel',
      ready: travelReady,
      detail: range === 'planetary' ? 'plane recommended' : 'walkable route',
    },
  ];
  if (input.weather?.kind === 'storm') {
    checks.push({
      id: 'weather',
      label: 'storm timing',
      ready: weatherReady,
      detail: cloakReady
        ? 'storm cloak packed'
        : stormInsight
        ? `storm read by ${insightLabel || 'pentagon insight'}`
        : input.home?.weatherVane === true
        ? `storm timed by ${input.home.forecastLabel ?? 'weather vane'}`
        : input.home?.protected === true
        ? `${input.home.label ?? 'home shelter'} can wait out storm`
        : 'storm front over route',
    });
  }

  const score = checks.filter((check) => check.ready).length;
  const missing = checks.filter((check) => !check.ready).map((check) => check.label);
  const ready = (signal !== null || seasonRouteReady) && missing.length === 0;
  const prepLabel = ready ? 'expedition ready' : `prep: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' +' : ''}`;
  return {
    ready,
    score,
    max: checks.length,
    range,
    targetLabel,
    routeLabel,
    prepLabel,
    missing,
    checks,
  };
}
