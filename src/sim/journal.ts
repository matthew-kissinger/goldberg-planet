export type JournalTone = 'ready' | 'warn' | 'quiet' | 'wonder';

export interface JournalEntry {
  label: string;
  detail: string;
  tone?: JournalTone;
}

export interface JournalSection {
  id: 'hearth' | 'route' | 'discoveries' | 'field';
  title: string;
  summary: string;
  entries: JournalEntry[];
}

export interface HearthJournal {
  title: string;
  summary: string;
  next: JournalEntry[];
  sections: JournalSection[];
}

export interface HearthJournalInput {
  home: {
    label: string;
    functional: boolean;
    protected: boolean;
    missing: readonly string[];
    storedItems: number;
    cellarProvisions: number;
    structures: number;
  };
  survival: {
    label: string;
    status: string;
    stamina: number;
    exposure: number;
    trailFocus?: number;
    collapseCount?: number;
    day: number;
    minute: number;
    weatherLabel: string;
    weatherNote?: string;
  };
  food: {
    berries?: number;
    cookedFish?: number;
    campMeal?: number;
    trailRation?: number;
    expeditionStew?: number;
    rawFish?: number;
    kelp?: number;
    snowHerb?: number;
    caveMushroom?: number;
    cellarProvisions?: number;
  };
  crops: {
    plots: number;
    planted: number;
    ready: number;
    blocked: number;
  };
  route: {
    chartKnown: boolean;
    slateSummary: string;
    primaryLabel?: string;
    primaryDetail?: string;
    planReady: boolean;
    planPrepLabel: string;
    planMissing: readonly string[];
    guideLabel?: string;
    guideDetail?: string;
    routePlanLabel?: string;
    routePlanDetail?: string;
    hearthBeacon?: string;
    waystones: number;
    caveAnchors: number;
  };
  discoveries: {
    pentagonsKnown: number;
    pentagonsTotal: number;
    insightLabel: string;
    domainLabel?: string;
    siteLabel?: string;
    siteDetail?: string;
    siteDiscovered?: boolean;
    siteCompleted?: boolean;
    siteReady?: boolean;
    siteMissing?: readonly string[];
    resourcesDiscovered: number;
    resourcesHarvested: number;
    resourcesTotal: number;
    thresholdChambersOpen?: number;
    thresholdChambersObserved?: number;
    thresholdChambersTotal?: number;
    thresholdChamberLabel?: string;
    thresholdChamberDetail?: string;
    caveResonancesObserved?: number;
    caveResonanceLabel?: string;
    caveResonanceDetail?: string;
    caveResonanceObserved?: boolean;
  };
  world: {
    skyfallActive: number;
    skyfallHarvested: number;
    skyfallCurrent?: string;
    skyfallOmen?: string;
    skyfallRoute?: string;
    murmursActive: number;
    murmursObserved: number;
    murmurRoute?: string;
    seasonLabel?: string;
    seasonDetail?: string;
    seasonChainLabel?: string;
    seasonChainDetail?: string;
    seasonChainComplete?: boolean;
    seasonAfterglowLabel?: string;
    seasonAfterglowDetail?: string;
    seasonAfterglowNote?: string;
    seasonAfterglowRead?: boolean;
    seasonAfterglowFocusMinutes?: number;
    recentMurmurs: readonly JournalEntry[];
    caveSignal?: string;
    caveDetail?: string;
    caveResonance?: string;
    caveResonanceDetail?: string;
    caveResonanceObserved?: boolean;
    nativeLifeVisible?: number;
    nativeLifeTended?: number;
    nativeLifeWarded?: number;
    nativeHelperLabel?: string;
    nativeHelperDetail?: string;
    nativeHazardLabel?: string;
    nativeHazardDetail?: string;
    fishLabel: string;
    fishStrength: number;
    fishTraps?: number;
    fishTrapReady?: number;
    shoreNets?: number;
    shoreNetReady?: number;
    forageLabel: string;
    forageStrength: number;
  };
}

function clampInt(n: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0));
}

function timeLabel(day: number, minute: number): string {
  const safeMinute = ((Math.trunc(Number.isFinite(minute) ? minute : 0) % 1440) + 1440) % 1440;
  const h = Math.floor(safeMinute / 60).toString().padStart(2, '0');
  const m = Math.floor(safeMinute % 60).toString().padStart(2, '0');
  return `day ${clampInt(day) + 1} ${h}:${m}`;
}

export function journalMealUnits(food: HearthJournalInput['food']): number {
  return (food.expeditionStew ?? 0) * 3.6
    + (food.campMeal ?? 0) * 2
    + (food.trailRation ?? 0) * 2.4
    + (food.cookedFish ?? 0) * 1.4
    + (food.cellarProvisions ?? 0) * 2.4
    + (food.snowHerb ?? 0) * 0.9
    + (food.caveMushroom ?? 0) * 0.8
    + (food.berries ?? 0) * 0.45
    + (food.kelp ?? 0) * 0.35
    + (food.rawFish ?? 0) * 0.35;
}

function addNext(next: JournalEntry[], label: string, detail: string, tone: JournalTone = 'quiet'): void {
  if (next.length >= 5) return;
  if (next.some((entry) => entry.label === label)) return;
  next.push({ label, detail, tone });
}

export function buildHearthJournal(input: HearthJournalInput): HearthJournal {
  const next: JournalEntry[] = [];
  const mealUnits = journalMealUnits(input.food);
  const homeMissing = input.home.missing.slice(0, 3).join(', ');
  if (!input.home.functional) {
    addNext(next, 'Finish the hearth', homeMissing ? `needs ${homeMissing}` : input.home.label, 'warn');
  }
  if (!input.route.chartKnown) {
    addNext(next, 'Wake a pentagon', 'the Horizon Chart starts after the first landmark', 'wonder');
  } else if (!input.route.planReady) {
    addNext(next, 'Pack the route', input.route.planPrepLabel, 'warn');
  }
  if (input.route.routePlanLabel && input.route.routePlanDetail) {
    addNext(next, 'Follow planned path', `${input.route.routePlanLabel} · ${input.route.routePlanDetail}`, 'ready');
  }
  if (input.discoveries.thresholdChamberLabel && input.discoveries.thresholdChamberDetail) {
    addNext(next, 'Read the threshold', `${input.discoveries.thresholdChamberLabel} · ${input.discoveries.thresholdChamberDetail}`, 'wonder');
  }
  if (input.world.nativeHazardLabel && input.world.nativeHazardDetail) {
    addNext(next, 'Answer native hazard', `${input.world.nativeHazardLabel} · ${input.world.nativeHazardDetail}`, 'warn');
  }
  if (input.world.nativeHelperLabel && input.world.nativeHelperDetail) {
    addNext(next, 'Tend native helper', `${input.world.nativeHelperLabel} · ${input.world.nativeHelperDetail}`, 'ready');
  }
  if (input.world.skyfallActive > 0 && input.world.skyfallRoute) {
    addNext(next, 'Chase the fall', input.world.skyfallRoute, 'wonder');
  }
  if (input.world.murmursActive > 0 && input.world.murmurRoute) {
    addNext(next, 'Listen to the world', input.world.murmurRoute, 'wonder');
  }
  if (input.world.seasonAfterglowLabel && input.world.seasonAfterglowRead !== true) {
    const focus = clampInt(input.world.seasonAfterglowFocusMinutes ?? 0);
    addNext(
      next,
      'Read season afterglow',
      `${input.world.seasonAfterglowLabel} · ${input.world.seasonAfterglowDetail ?? 'season chord echo'}${focus > 0 ? ` · focus ${focus}m` : ''}`,
      'wonder',
    );
  }
  if (input.world.seasonChainLabel && input.world.seasonChainDetail) {
    addNext(
      next,
      input.world.seasonChainComplete ? 'Use season chain' : 'Complete season chain',
      `${input.world.seasonChainLabel} · ${input.world.seasonChainDetail}`,
      input.world.seasonChainComplete ? 'ready' : 'wonder',
    );
  }
  if (input.world.seasonLabel && input.world.seasonDetail) {
    addNext(next, 'Plan the season', `${input.world.seasonLabel} · ${input.world.seasonDetail}`, 'wonder');
  }
  if (input.world.caveResonance && input.world.caveResonanceObserved !== true) {
    addNext(next, 'Read cave echo', input.world.caveResonanceDetail ?? input.world.caveResonance, 'wonder');
  }
  if (clampInt(input.world.fishTrapReady ?? 0) > 0) {
    addNext(next, 'Check fish traps', `${clampInt(input.world.fishTrapReady ?? 0)}/${clampInt(input.world.fishTraps ?? 0)} traps ready`, 'ready');
  }
  if (clampInt(input.world.shoreNetReady ?? 0) > 0) {
    addNext(next, 'Comb shore nets', `${clampInt(input.world.shoreNetReady ?? 0)}/${clampInt(input.world.shoreNets ?? 0)} nets ready`, 'ready');
  }
  if (mealUnits < 2) {
    addNext(next, 'Make travel food', `${mealUnits.toFixed(mealUnits % 1 === 0 ? 0 : 1)} meal units packed`, 'quiet');
  }
  if (input.world.caveSignal && input.route.caveAnchors <= 0) {
    addNext(next, 'Mark a cave', input.world.caveDetail ?? input.world.caveSignal, 'quiet');
  }
  if (input.discoveries.siteReady && !input.discoveries.siteCompleted && input.discoveries.siteLabel) {
    addNext(next, 'Finish site work', `${input.discoveries.siteLabel} is ready; read the landmark again`, 'ready');
  } else if (input.discoveries.siteDiscovered && !input.discoveries.siteCompleted && input.discoveries.siteMissing?.length && input.discoveries.siteLabel) {
    addNext(next, 'Prepare site work', `${input.discoveries.siteLabel} needs ${input.discoveries.siteMissing.slice(0, 3).join(', ')}`, 'quiet');
  }
  if (next.length === 0) {
    addNext(next, 'Follow the horizon', input.route.slateSummary || 'walk until the next signal changes', 'ready');
  }

  const hearthEntries: JournalEntry[] = [
    {
      label: input.home.label,
      detail: input.home.functional
        ? `${input.home.structures} props · ${input.home.cellarProvisions} cellar provisions`
        : input.home.protected
        ? `weather safe · ${homeMissing ? `missing ${homeMissing}` : 'needs utility'}`
        : homeMissing ? `missing ${homeMissing}` : `${input.home.structures} props placed`,
      tone: input.home.functional ? 'ready' : input.home.protected ? 'quiet' : 'warn',
    },
    {
      label: input.survival.label,
      detail: `${input.survival.status} · stamina ${Math.round(input.survival.stamina)} · exposure ${Math.round(input.survival.exposure)}${clampInt(input.survival.trailFocus ?? 0) > 0 ? ` · trail focus ${clampInt(input.survival.trailFocus ?? 0)}m` : ''} · ${timeLabel(input.survival.day, input.survival.minute)} · ${input.survival.weatherLabel}${clampInt(input.survival.collapseCount ?? 0) > 0 ? ` · rescues ${clampInt(input.survival.collapseCount ?? 0)}` : ''}${input.survival.weatherNote ? ` · ${input.survival.weatherNote}` : ''}`,
      tone: input.survival.exposure > 55 || input.survival.stamina < 35 ? 'warn' : 'ready',
    },
    {
      label: 'provisions',
      detail: `${mealUnits.toFixed(mealUnits % 1 === 0 ? 0 : 1)} meal units · stews ${clampInt(input.food.expeditionStew ?? 0)} · meals ${clampInt(input.food.campMeal ?? 0)} · rations ${clampInt(input.food.trailRation ?? 0)} · cellar ${clampInt(input.food.cellarProvisions ?? 0)}`,
      tone: mealUnits >= 2 ? 'ready' : 'quiet',
    },
    {
      label: 'garden',
      detail: `${input.crops.plots} plots · ${input.crops.planted} planted · ${input.crops.ready} ready · ${input.crops.blocked} waiting`,
      tone: input.crops.blocked > 0 ? 'warn' : input.crops.plots > 0 ? 'ready' : 'quiet',
    },
  ];

  const routeEntries: JournalEntry[] = [
    ...(input.route.routePlanLabel ? [{
      label: 'planned path',
      detail: `${input.route.routePlanLabel}${input.route.routePlanDetail ? ` · ${input.route.routePlanDetail}` : ''}`,
      tone: 'ready' as const,
    }] : []),
    {
      label: input.route.primaryLabel ?? (input.route.chartKnown ? 'route slate' : 'local slate'),
      detail: input.route.primaryDetail ?? input.route.slateSummary,
      tone: input.route.planReady ? 'ready' : input.route.chartKnown ? 'warn' : 'quiet',
    },
    {
      label: input.route.planReady ? 'expedition ready' : 'expedition prep',
      detail: input.route.planReady ? input.route.planPrepLabel : input.route.planMissing.slice(0, 4).join(', ') || input.route.planPrepLabel,
      tone: input.route.planReady ? 'ready' : 'warn',
    },
    {
      label: 'markers',
      detail: `${input.route.waystones} waystones · ${input.route.caveAnchors} cave anchors${input.route.hearthBeacon ? ` · ${input.route.hearthBeacon}` : ''}`,
      tone: input.route.waystones + input.route.caveAnchors > 0 || input.route.hearthBeacon ? 'ready' : 'quiet',
    },
  ];
  if (input.route.guideLabel) {
    routeEntries.push({
      label: input.route.guideLabel,
      detail: input.route.guideDetail ?? 'route ribbon active',
      tone: 'ready',
    });
  }

  const discoveryEntries: JournalEntry[] = [
    {
      label: 'pentagons',
      detail: `${input.discoveries.pentagonsKnown}/${input.discoveries.pentagonsTotal} awake · ${input.discoveries.insightLabel}`,
      tone: input.discoveries.pentagonsKnown > 0 ? 'ready' : 'wonder',
    },
    {
      label: 'domain resources',
      detail: `${input.discoveries.resourcesHarvested}/${input.discoveries.resourcesTotal} gathered · ${input.discoveries.resourcesDiscovered} revealed`,
      tone: input.discoveries.resourcesHarvested > 0 ? 'ready' : 'quiet',
    },
    {
      label: 'threshold chambers',
      detail: `${clampInt(input.discoveries.thresholdChambersObserved ?? 0)}/${clampInt(input.discoveries.thresholdChambersTotal ?? 0)} read · ${clampInt(input.discoveries.thresholdChambersOpen ?? 0)} open${input.discoveries.thresholdChamberLabel ? ` · nearby ${input.discoveries.thresholdChamberLabel}` : ''}`,
      tone: (input.discoveries.thresholdChambersOpen ?? 0) > (input.discoveries.thresholdChambersObserved ?? 0) ? 'wonder' : (input.discoveries.thresholdChambersObserved ?? 0) > 0 ? 'ready' : 'quiet',
    },
    {
      label: 'cave resonances',
      detail: `${clampInt(input.discoveries.caveResonancesObserved ?? 0)} read${input.discoveries.caveResonanceLabel ? ` · nearby ${input.discoveries.caveResonanceLabel}` : ''}${input.discoveries.caveResonanceDetail ? ` · ${input.discoveries.caveResonanceDetail}` : ''}`,
      tone: input.discoveries.caveResonanceLabel && input.discoveries.caveResonanceObserved !== true ? 'wonder' : clampInt(input.discoveries.caveResonancesObserved ?? 0) > 0 ? 'ready' : 'quiet',
    },
    {
      label: 'skyfall',
      detail: input.world.skyfallCurrent
        ? `${input.world.skyfallCurrent}${input.world.skyfallOmen ? ` · ${input.world.skyfallOmen}` : ''} · ${input.world.skyfallHarvested} gathered`
        : `${input.world.skyfallActive} active · ${input.world.skyfallHarvested} gathered`,
      tone: input.world.skyfallActive > 0 ? 'wonder' : 'quiet',
    },
    {
      label: 'world murmurs',
      detail: `${input.world.murmursObserved} noted · ${input.world.murmursActive} active${input.world.murmurRoute ? ` · ${input.world.murmurRoute}` : ''}`,
      tone: input.world.murmursActive > 0 ? 'wonder' : input.world.murmursObserved > 0 ? 'ready' : 'quiet',
    },
    ...input.world.recentMurmurs.slice(-3),
  ];
  if (input.discoveries.domainLabel) {
    discoveryEntries.splice(1, 0, {
      label: input.discoveries.domainLabel,
      detail: 'local landmark domain underfoot',
      tone: 'wonder',
    });
  }
  if (input.discoveries.siteLabel) {
    discoveryEntries.splice(2, 0, {
      label: input.discoveries.siteLabel,
      detail: input.discoveries.siteDetail ?? 'landmark approach site underfoot',
      tone: input.discoveries.siteCompleted || input.discoveries.siteReady ? 'ready' : input.discoveries.siteDiscovered ? 'quiet' : 'wonder',
    });
  }

  const fieldEntries: JournalEntry[] = [
    ...(input.world.seasonLabel ? [{
      label: 'stranger season',
      detail: `${input.world.seasonLabel}${input.world.seasonDetail ? ` · ${input.world.seasonDetail}` : ''}`,
      tone: 'wonder' as const,
    }] : []),
    ...(input.world.seasonChainLabel ? [{
      label: 'season chain',
      detail: `${input.world.seasonChainLabel}${input.world.seasonChainDetail ? ` · ${input.world.seasonChainDetail}` : ''}`,
      tone: input.world.seasonChainComplete ? 'ready' as const : 'wonder' as const,
    }] : []),
    ...(input.world.seasonAfterglowLabel ? [{
      label: 'season afterglow',
      detail: `${input.world.seasonAfterglowLabel} · ${input.world.seasonAfterglowRead ? 'read' : 'unread'}${input.world.seasonAfterglowDetail ? ` · ${input.world.seasonAfterglowDetail}` : ''}${input.world.seasonAfterglowNote ? ` · ${input.world.seasonAfterglowNote}` : ''}`,
      tone: input.world.seasonAfterglowRead ? 'ready' as const : 'wonder' as const,
    }] : []),
    {
      label: input.world.caveSignal ?? 'caves',
      detail: input.world.caveDetail
        ? `${input.world.caveDetail}${input.world.caveResonance ? ` · ${input.world.caveResonance}${input.world.caveResonanceObserved ? ' noted' : ' unread'}` : ''}`
        : `${input.route.caveAnchors} anchored cave routes${input.world.caveResonance ? ` · ${input.world.caveResonance}${input.world.caveResonanceObserved ? ' noted' : ' unread'}` : ''}`,
      tone: input.world.caveResonance && input.world.caveResonanceObserved !== true ? 'wonder' : input.world.caveSignal ? 'wonder' : input.route.caveAnchors > 0 ? 'ready' : 'quiet',
    },
    {
      label: 'native life',
      detail: `${clampInt(input.world.nativeLifeVisible ?? 0)} nearby · ${clampInt(input.world.nativeLifeTended ?? 0)} tended · ${clampInt(input.world.nativeLifeWarded ?? 0)} warded${input.world.nativeHazardLabel ? ` · hazard ${input.world.nativeHazardLabel}` : input.world.nativeHelperLabel ? ` · helper ${input.world.nativeHelperLabel}` : ''}`,
      tone: input.world.nativeHazardLabel ? 'warn' : input.world.nativeHelperLabel ? 'ready' : clampInt(input.world.nativeLifeVisible ?? 0) > 0 ? 'wonder' : 'quiet',
    },
    {
      label: input.world.fishLabel,
      detail: `fish strength ${input.world.fishStrength.toFixed(2)}${clampInt(input.world.fishTraps ?? 0) > 0 ? ` · traps ${clampInt(input.world.fishTrapReady ?? 0)}/${clampInt(input.world.fishTraps ?? 0)} ready` : ''}${clampInt(input.world.shoreNets ?? 0) > 0 ? ` · nets ${clampInt(input.world.shoreNetReady ?? 0)}/${clampInt(input.world.shoreNets ?? 0)} ready` : ''}`,
      tone: clampInt(input.world.fishTrapReady ?? 0) > 0 || clampInt(input.world.shoreNetReady ?? 0) > 0 || input.world.fishStrength > 0.5 ? 'ready' : 'quiet',
    },
    {
      label: input.world.forageLabel,
      detail: `forage strength ${input.world.forageStrength.toFixed(2)}`,
      tone: input.world.forageStrength > 0.35 ? 'ready' : 'quiet',
    },
  ];

  const sections: JournalSection[] = [
    { id: 'hearth', title: 'Hearth', summary: input.home.label, entries: hearthEntries },
    { id: 'route', title: 'Route', summary: input.route.slateSummary || input.route.planPrepLabel, entries: routeEntries },
    { id: 'discoveries', title: 'Discoveries', summary: `${input.discoveries.pentagonsKnown}/${input.discoveries.pentagonsTotal} pentagons`, entries: discoveryEntries },
    { id: 'field', title: 'Field', summary: input.world.caveSignal ?? input.world.forageLabel, entries: fieldEntries },
  ];

  return {
    title: 'Hearth Journal',
    summary: `${input.home.label} · ${input.survival.status} · ${input.discoveries.pentagonsKnown}/${input.discoveries.pentagonsTotal} pentagons`,
    next,
    sections,
  };
}
