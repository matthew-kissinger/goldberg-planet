import { MURMUR_WINDOW_MINUTES, murmurSites, type MurmurSite } from './murmurs';
import { SKYFALL_WINDOW_MINUTES, skyfallSites, type SkyfallSite } from './skyfall';

export type StrangerSeasonUrgency = 'now' | 'soon' | 'later';
export type StrangerSeasonFocus = 'fall' | 'listening' | 'split' | 'quiet';
export type StrangerSeasonChainStage = 'unstarted' | 'fallClaimed' | 'notesHeld' | 'linked' | 'fullChord';

export interface StrangerSeasonChain {
  key: string;
  fallClaimed: boolean;
  notesObserved: number;
  notesTotal: number;
  linked: boolean;
  fullChord: boolean;
  stage: StrangerSeasonChainStage;
  progressLabel: string;
  payoffLabel: string;
  payoffDetail: string;
  routeEffect: string;
  journalDetail: string;
}

export interface StrangerSeasonWindow {
  index: number;
  day: number;
  minute: number;
  startsInMinutes: number;
  endsInMinutes: number;
  skyfall: SkyfallSite | null;
  murmurs: MurmurSite[];
  unobservedMurmurs: number;
  urgency: StrangerSeasonUrgency;
  focus: StrangerSeasonFocus;
  label: string;
  detail: string;
  tradeoff: string;
  routeHint: string;
  chain: StrangerSeasonChain;
}

function safeDay(day: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(day) ? day : 0));
}

function normalizedMinute(minute: number): number {
  const m = Number.isFinite(minute) ? minute : 0;
  return ((m % 1440) + 1440) % 1440;
}

function absoluteMinute(day: number, minute: number): number {
  return safeDay(day) * 1440 + normalizedMinute(minute);
}

function dayMinuteFromAbsolute(abs: number): { day: number; minute: number } {
  const safe = Math.max(0, Math.trunc(Number.isFinite(abs) ? abs : 0));
  return { day: Math.floor(safe / 1440), minute: safe % 1440 };
}

function timeUntilLabel(minutes: number): string {
  const m = Math.max(0, Math.ceil(Number.isFinite(minutes) ? minutes : 0));
  if (m <= 0) return 'now';
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `in ${h}h` : `in ${h}h ${rest}m`;
}

function urgencyFor(startsInMinutes: number): StrangerSeasonUrgency {
  return startsInMinutes <= 0 ? 'now' : startsInMinutes <= 180 ? 'soon' : 'later';
}

function seasonFocus(skyfall: SkyfallSite | null, murmurs: readonly MurmurSite[]): StrangerSeasonFocus {
  const fallOpen = !!skyfall && skyfall.active && !skyfall.harvested;
  const unobserved = murmurs.filter((site) => site.active && !site.observed).length;
  if (fallOpen && unobserved >= 2) return 'split';
  if (fallOpen) return 'fall';
  if (unobserved > 0) return 'listening';
  return 'quiet';
}

function seasonTradeoff(focus: StrangerSeasonFocus, skyfall: SkyfallSite | null, murmurs: readonly MurmurSite[]): string {
  const firstMurmur = murmurs.find((site) => site.active && !site.observed) ?? murmurs[0];
  if (focus === 'split') return `${skyfall?.reward.label ?? 'fall reward'} or ${murmurs.filter((site) => !site.observed).length} notes`;
  if (focus === 'fall') return `claim ${skyfall?.reward.label ?? 'fall reward'} before the sky clears`;
  if (focus === 'listening') return `quiet route for ${firstMurmur?.label ?? 'world murmurs'}`;
  return 'all known in this window';
}

function seasonRouteHint(focus: StrangerSeasonFocus, skyfall: SkyfallSite | null, murmurs: readonly MurmurSite[]): string {
  const firstMurmur = murmurs.find((site) => site.active && !site.observed) ?? murmurs[0];
  if (focus === 'split') return `choose whether the itinerary bends toward ${skyfall?.label ?? 'the fall'} or ${firstMurmur?.label ?? 'the nearest murmur'}`;
  if (focus === 'fall') return skyfall?.omen.routeCue ?? 'follow the fall before it fades';
  if (focus === 'listening') return firstMurmur?.hint ?? 'move slowly and listen';
  return 'use this as a travel window or rest at home';
}

function plural(count: number, singular: string, pluralWord = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function seasonChain(day: number, skyfallWindow: number, skyfall: SkyfallSite | null, murmurs: readonly MurmurSite[]): StrangerSeasonChain {
  const notesTotal = murmurs.length;
  const notesObserved = murmurs.filter((site) => site.observed).length;
  const fallClaimed = !!skyfall && skyfall.harvested;
  const linked = fallClaimed && notesObserved > 0;
  const fullChord = linked && notesObserved >= notesTotal && notesTotal > 0;
  const stage: StrangerSeasonChainStage = fullChord
    ? 'fullChord'
    : linked
    ? 'linked'
    : fallClaimed
    ? 'fallClaimed'
    : notesObserved > 0
    ? 'notesHeld'
    : 'unstarted';
  const progressLabel = fallClaimed
    ? notesObserved > 0
      ? `fall claimed + ${notesObserved}/${notesTotal} notes`
      : 'fall claimed · needs one note'
    : notesObserved > 0
    ? `${notesObserved}/${notesTotal} notes · claim the fall`
    : `0/${notesTotal} notes · fall unclaimed`;
  const payoffLabel = fullChord
    ? 'full season chord'
    : linked
    ? 'season link'
    : fallClaimed
    ? 'fall waiting for a note'
    : notesObserved > 0
    ? 'note waiting for the fall'
    : 'chain unstarted';
  const firstMurmur = murmurs.find((site) => site.observed) ?? murmurs[0];
  const payoffDetail = fullChord
    ? `the fall and every note now read as one route memory`
    : linked
    ? `${skyfall?.label ?? 'the fall'} and ${plural(notesObserved, 'note')} answer each other`
    : fallClaimed
    ? `listen to one overlapping Murmur before the window closes`
    : notesObserved > 0
    ? `claim ${skyfall?.label ?? 'the fall'} while ${firstMurmur?.label ?? 'the note'} is still fresh`
    : `claim the fall or listen first to start the chain`;
  const routeEffect = fullChord
    ? 'commit a season itinerary with full chord context'
    : linked
    ? 'Route Slate can treat this as a linked season route'
    : fallClaimed
    ? 'listen before routing away from the crater'
    : notesObserved > 0
    ? 'bend the route back through the fall'
    : 'choose a first season action';
  return {
    key: `${day}:${skyfallWindow}:${skyfall?.id ?? 'none'}`,
    fallClaimed,
    notesObserved,
    notesTotal,
    linked,
    fullChord,
    stage,
    progressLabel,
    payoffLabel,
    payoffDetail,
    routeEffect,
    journalDetail: `${progressLabel} · ${payoffDetail}`,
  };
}

export function strangerSeasonForecast(
  seed: string,
  day: number,
  minute: number,
  tileCount: number,
  harvestedSkyfalls: ReadonlySet<number>,
  observedMurmurs: ReadonlySet<number>,
  windows = 4,
): StrangerSeasonWindow[] {
  const count = Math.max(0, Math.trunc(tileCount));
  if (count <= 0) return [];
  const absNow = absoluteMinute(day, minute);
  const currentSkyfallWindow = Math.floor(absNow / SKYFALL_WINDOW_MINUTES);
  const out: StrangerSeasonWindow[] = [];
  const wanted = Math.max(1, Math.trunc(Number.isFinite(windows) ? windows : 4));
  for (let index = 0; index < wanted; index++) {
    const skyfallWindow = currentSkyfallWindow + index;
    const startAbs = skyfallWindow * SKYFALL_WINDOW_MINUTES;
    const sampleAbs = index === 0 ? absNow : startAbs;
    const sample = dayMinuteFromAbsolute(sampleAbs);
    const startsInMinutes = Math.max(0, startAbs - absNow);
    const endsInMinutes = Math.max(1, startAbs + SKYFALL_WINDOW_MINUTES - absNow);
    const skyfall = skyfallSites(seed, sample.day, sample.minute, count, harvestedSkyfalls)[0] ?? null;
    const murmurs = murmurSites(seed, sample.day, sample.minute, count, observedMurmurs);
    const focus = seasonFocus(skyfall, murmurs);
    const urgency = urgencyFor(startsInMinutes);
    const primaryMurmur = murmurs.find((site) => site.active && !site.observed) ?? murmurs[0];
    const unobservedMurmurs = murmurs.filter((site) => site.active && !site.observed).length;
    const time = timeUntilLabel(startsInMinutes);
    const label = skyfall && primaryMurmur
      ? `${skyfall.omen.label} / ${primaryMurmur.label}`
      : skyfall?.omen.label ?? primaryMurmur?.label ?? 'quiet season';
    const detail = `${time} · ${skyfall?.label ?? 'no fall'} overlaps ${unobservedMurmurs}/${murmurs.length} unnoted murmurs`;
    const tradeoff = seasonTradeoff(focus, skyfall, murmurs);
    const routeHint = seasonRouteHint(focus, skyfall, murmurs);
    const chain = seasonChain(sample.day, skyfallWindow, skyfall, murmurs);
    out.push({
      index,
      day: sample.day,
      minute: sample.minute,
      startsInMinutes,
      endsInMinutes,
      skyfall,
      murmurs,
      unobservedMurmurs,
      urgency,
      focus,
      label,
      detail,
      tradeoff,
      routeHint,
      chain,
    });
  }
  return out;
}

export function currentStrangerSeason(
  seed: string,
  day: number,
  minute: number,
  tileCount: number,
  harvestedSkyfalls: ReadonlySet<number>,
  observedMurmurs: ReadonlySet<number>,
): StrangerSeasonWindow | null {
  return strangerSeasonForecast(seed, day, minute, tileCount, harvestedSkyfalls, observedMurmurs, 1)[0] ?? null;
}

export { MURMUR_WINDOW_MINUTES, SKYFALL_WINDOW_MINUTES };
