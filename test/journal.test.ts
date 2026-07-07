import { describe, expect, it } from 'vitest';
import { buildHearthJournal, journalMealUnits, type HearthJournalInput } from '../src/sim/journal';
import { murmurNotebook, murmurSites, observeMurmur } from '../src/sim/murmurs';

function baseInput(overrides: Partial<HearthJournalInput> = {}): HearthJournalInput {
  const input: HearthJournalInput = {
    home: {
      label: 'shelter needs roof 0/2',
      functional: false,
      protected: false,
      missing: ['roof 0/2', 'door', 'lit campfire'],
      storedItems: 0,
      cellarProvisions: 0,
      structures: 2,
    },
    survival: {
      label: 'steady',
      status: 'rested',
      stamina: 88,
      exposure: 4,
      day: 0,
      minute: 480,
      weatherLabel: 'clear',
    },
    food: { berries: 2 },
    crops: { plots: 1, planted: 1, ready: 0, blocked: 1 },
    route: {
      chartKnown: false,
      slateSummary: 'choose a mystery',
      planReady: false,
      planPrepLabel: 'prep: route',
      planMissing: ['route'],
      waystones: 0,
      caveAnchors: 0,
    },
    discoveries: {
      pentagonsKnown: 0,
      pentagonsTotal: 12,
      insightLabel: 'no insights',
      resourcesDiscovered: 0,
      resourcesHarvested: 0,
      resourcesTotal: 36,
    },
    world: {
      skyfallActive: 0,
      skyfallHarvested: 0,
      murmursActive: 0,
      murmursObserved: 0,
      recentMurmurs: [],
      fishLabel: 'shore nibble',
      fishStrength: 0.2,
      forageLabel: 'shore kelp',
      forageStrength: 0.42,
    },
  };
  return {
    ...input,
    ...overrides,
    home: { ...input.home, ...overrides.home },
    survival: { ...input.survival, ...overrides.survival },
    food: { ...input.food, ...overrides.food },
    crops: { ...input.crops, ...overrides.crops },
    route: { ...input.route, ...overrides.route },
    discoveries: { ...input.discoveries, ...overrides.discoveries },
    world: { ...input.world, ...overrides.world },
  };
}

describe('Hearth Journal', () => {
  it('prioritizes home, first pentagon, travel food, and cave marking for a new player', () => {
    const journal = buildHearthJournal(baseInput({
      world: {
        skyfallActive: 0,
        skyfallHarvested: 0,
        murmursActive: 0,
        murmursObserved: 0,
        recentMurmurs: [],
        caveSignal: 'dry cave mouth',
        caveDetail: '1 ring · depth 8.2 m',
        fishLabel: 'shore nibble',
        fishStrength: 0.2,
        forageLabel: 'shore kelp',
        forageStrength: 0.42,
      },
    }));

    expect(journal.summary).toBe('shelter needs roof 0/2 · rested · 0/12 pentagons');
    expect(journal.next.map((entry) => entry.label)).toEqual(expect.arrayContaining([
      'Finish the hearth',
      'Wake a pentagon',
      'Make travel food',
      'Mark a cave',
    ]));
    expect(journal.sections.find((section) => section.id === 'hearth')?.entries[0]).toMatchObject({
      label: 'shelter needs roof 0/2',
      tone: 'warn',
    });
  });

  it('surfaces ready fish traps in next actions and field notes', () => {
    const journal = buildHearthJournal(baseInput({
      home: { functional: true, protected: true, missing: [], label: 'hearth alive', storedItems: 4, cellarProvisions: 1, structures: 8 },
      route: { chartKnown: true, planReady: true, planPrepLabel: 'ready', planMissing: [], slateSummary: 'fish camp', waystones: 1, caveAnchors: 1 },
      world: {
        skyfallActive: 0,
        skyfallHarvested: 0,
        murmursActive: 0,
        murmursObserved: 0,
        recentMurmurs: [],
        fishLabel: 'dockside fish run',
        fishStrength: 0.44,
        fishTraps: 2,
        fishTrapReady: 1,
        shoreNets: 1,
        shoreNetReady: 1,
        forageLabel: 'shore kelp',
        forageStrength: 0.42,
      },
    }));

    expect(journal.next).toContainEqual(expect.objectContaining({
      label: 'Check fish traps',
      detail: '1/2 traps ready',
      tone: 'ready',
    }));
    expect(journal.next).toContainEqual(expect.objectContaining({
      label: 'Comb shore nets',
      detail: '1/1 nets ready',
      tone: 'ready',
    }));
    expect(journal.sections.find((section) => section.id === 'field')?.entries.find((entry) => entry.label === 'dockside fish run')).toMatchObject({
      detail: 'fish strength 0.44 · traps 1/2 ready · nets 1/1 ready',
      tone: 'ready',
    });
  });

  it('surfaces native hazards and helper creatures in next actions and field notes', () => {
    const journal = buildHearthJournal(baseInput({
      home: { functional: true, protected: true, missing: [], label: 'hearth alive', storedItems: 4, cellarProvisions: 1, structures: 8 },
      route: { chartKnown: true, planReady: true, planPrepLabel: 'ready', planMissing: [], slateSummary: 'native trail', waystones: 1, caveAnchors: 1 },
      food: { trailRation: 2 },
      world: {
        skyfallActive: 0,
        skyfallHarvested: 0,
        murmursActive: 0,
        murmursObserved: 0,
        recentMurmurs: [],
        nativeLifeVisible: 3,
        nativeLifeTended: 1,
        nativeLifeWarded: 0,
        nativeHazardLabel: 'storm burr',
        nativeHazardDetail: '9 m right · quills lean flat · brace with storm cloak',
        nativeHelperLabel: 'reedback grazer',
        nativeHelperDetail: 'near garden · scratch for compost',
        fishLabel: 'shore nibble',
        fishStrength: 0.2,
        forageLabel: 'shore kelp',
        forageStrength: 0.42,
      },
    }));

    expect(journal.next).toContainEqual({
      label: 'Answer native hazard',
      detail: 'storm burr · 9 m right · quills lean flat · brace with storm cloak',
      tone: 'warn',
    });
    expect(journal.next).toContainEqual({
      label: 'Tend native helper',
      detail: 'reedback grazer · near garden · scratch for compost',
      tone: 'ready',
    });
    expect(journal.sections.find((section) => section.id === 'field')?.entries.find((entry) => entry.label === 'native life')).toMatchObject({
      detail: '3 nearby · 1 tended · 0 warded · hazard storm burr',
      tone: 'warn',
    });
  });

  it('surfaces unread and recorded cave resonances in the journal', () => {
    const journal = buildHearthJournal(baseInput({
      home: {
        label: 'shelter alive',
        functional: true,
        protected: true,
        missing: [],
        storedItems: 2,
        cellarProvisions: 1,
        structures: 6,
      },
      food: { trailRation: 1 },
      route: {
        chartKnown: true,
        slateSummary: 'stone-bell seam · dry cave',
        primaryLabel: 'stone-bell seam',
        primaryDetail: 'a bell tone repeats · +2 glow crystal',
        planReady: true,
        planPrepLabel: 'expedition ready',
        planMissing: [],
        waystones: 0,
        caveAnchors: 0,
      },
      discoveries: {
        pentagonsKnown: 1,
        pentagonsTotal: 12,
        insightLabel: 'Cave Listening',
        resourcesDiscovered: 0,
        resourcesHarvested: 0,
        resourcesTotal: 36,
        caveResonancesObserved: 2,
        caveResonanceLabel: 'stone-bell seam',
        caveResonanceDetail: 'a bell tone repeats · +2 glow crystal',
        caveResonanceObserved: false,
      },
      world: {
        skyfallActive: 0,
        skyfallHarvested: 0,
        murmursActive: 0,
        murmursObserved: 0,
        recentMurmurs: [],
        caveSignal: 'dry cave',
        caveDetail: 'here · depth 12.5 m',
        caveResonance: 'stone-bell seam',
        caveResonanceDetail: 'a bell tone repeats · some rocks ring',
        caveResonanceObserved: false,
        fishLabel: 'quiet water',
        fishStrength: 0.1,
        forageLabel: 'cave mushroom shelf',
        forageStrength: 0.44,
      },
    }));

    expect(journal.next).toContainEqual({
      label: 'Read cave echo',
      detail: 'a bell tone repeats · some rocks ring',
      tone: 'wonder',
    });
    expect(journal.sections.find((section) => section.id === 'discoveries')?.entries.find((entry) => entry.label === 'cave resonances')).toMatchObject({
      detail: '2 read · nearby stone-bell seam · a bell tone repeats · +2 glow crystal',
      tone: 'wonder',
    });
    expect(journal.sections.find((section) => section.id === 'field')?.entries.find((entry) => entry.label === 'dry cave')?.detail).toContain('stone-bell seam unread');
  });

  it('surfaces route prep, skyfall, and murmurs after the chart is known', () => {
    const journal = buildHearthJournal(baseInput({
      home: {
        label: 'shelter alive',
        functional: true,
        protected: true,
        missing: [],
        storedItems: 5,
        cellarProvisions: 2,
        structures: 9,
      },
      survival: {
        label: 'steady',
        status: 'rested',
        stamina: 88,
        exposure: 4,
        trailFocus: 120,
        day: 0,
        minute: 480,
        weatherLabel: 'clear',
        weatherNote: 'weather window · storm front cleared',
      },
      food: { trailRation: 2, cellarProvisions: 2 },
      route: {
        chartKnown: true,
        slateSummary: 'North Gate · emberfall crater · root-whisper knot',
        primaryLabel: 'North Gate',
        primaryDetail: '1.4 km left · prep: light',
        planReady: false,
        planPrepLabel: 'prep: light',
        planMissing: ['light'],
        guideLabel: 'emberfall crater',
        guideDetail: '622 m right',
        routePlanLabel: 'emberfall crater',
        routePlanDetail: '622 m right · 88m left',
        hearthBeacon: 'hearth smoke 240 m behind',
        waystones: 1,
        caveAnchors: 1,
      },
      discoveries: {
        pentagonsKnown: 3,
        pentagonsTotal: 12,
        insightLabel: 'Salt Tide + Root Listening',
        domainLabel: 'salt-tide shore',
        resourcesDiscovered: 9,
        resourcesHarvested: 4,
        resourcesTotal: 36,
      },
      world: {
        skyfallActive: 1,
        skyfallHarvested: 2,
        skyfallCurrent: 'emberfall crater',
        skyfallOmen: 'orange fall line',
        skyfallRoute: '622 m right · orange fall line',
        murmursActive: 2,
        murmursObserved: 5,
        murmurRoute: 'root-whisper knot 180 m ahead',
        seasonLabel: 'orange fall line / root-whisper knot',
        seasonDetail: 'now · emberfall crater overlaps 2/3 unnoted murmurs · glow crystal or 2 notes',
        recentMurmurs: [{ label: 'wind-thread shimmer', detail: 'the wind bends around something you cannot see yet', tone: 'wonder' }],
        fishLabel: 'storm fish run',
        fishStrength: 0.72,
        forageLabel: 'root-vault seeds',
        forageStrength: 0.55,
      },
    }));

    expect(journal.next.map((entry) => entry.label)).toEqual(expect.arrayContaining([
      'Pack the route',
      'Follow planned path',
      'Chase the fall',
      'Listen to the world',
      'Plan the season',
    ]));
    expect(journal.sections.find((section) => section.id === 'discoveries')?.entries.map((entry) => entry.label)).toEqual(expect.arrayContaining([
      'salt-tide shore',
      'world murmurs',
      'wind-thread shimmer',
    ]));
    expect(journal.sections.find((section) => section.id === 'route')?.entries.find((entry) => entry.label === 'markers')?.detail).toContain('1 cave anchors');
    expect(journal.sections.find((section) => section.id === 'route')?.entries.find((entry) => entry.label === 'planned path')?.detail).toBe('emberfall crater · 622 m right · 88m left');
    expect(journal.sections.find((section) => section.id === 'discoveries')?.entries.find((entry) => entry.label === 'skyfall')?.detail).toBe('emberfall crater · orange fall line · 2 gathered');
    expect(journal.sections.find((section) => section.id === 'field')?.entries.find((entry) => entry.label === 'stranger season')?.detail).toBe('orange fall line / root-whisper knot · now · emberfall crater overlaps 2/3 unnoted murmurs · glow crystal or 2 notes');
    expect(journal.sections.find((section) => section.id === 'hearth')?.entries.find((entry) => entry.label === 'steady')?.detail).toContain('weather window · storm front cleared');
    expect(journal.sections.find((section) => section.id === 'hearth')?.entries.find((entry) => entry.label === 'steady')?.detail).toContain('trail focus 120m');
  });

  it('promotes linked stranger season chains as ready journal work', () => {
    const journal = buildHearthJournal(baseInput({
      home: {
        label: 'shelter alive',
        functional: true,
        protected: true,
        missing: [],
        storedItems: 5,
        cellarProvisions: 2,
        structures: 9,
      },
      food: { expeditionStew: 1, trailRation: 1 },
      route: {
        chartKnown: true,
        slateSummary: 'Stranger Season · emberfall crater · wind-thread shimmer',
        planReady: true,
        planPrepLabel: 'prep complete',
        planMissing: [],
        waystones: 1,
        caveAnchors: 0,
      },
      world: {
        skyfallActive: 0,
        skyfallHarvested: 1,
        murmursActive: 2,
        murmursObserved: 1,
        seasonLabel: 'orange fall line / wind-thread shimmer',
        seasonDetail: 'now · emberfall crater overlaps 2/3 unnoted murmurs · glow crystal or 2 notes',
        seasonChainLabel: 'season link',
        seasonChainDetail: 'fall claimed + 1/3 notes · emberfall crater and 1 note answer each other',
        seasonChainComplete: true,
        recentMurmurs: [],
        fishLabel: 'quiet water',
        fishStrength: 0.2,
        forageLabel: 'no forage',
        forageStrength: 0.1,
      },
    }));

    expect(journal.next).toContainEqual({
      label: 'Use season chain',
      detail: 'season link · fall claimed + 1/3 notes · emberfall crater and 1 note answer each other',
      tone: 'ready',
    });
    expect(journal.sections.find((section) => section.id === 'field')?.entries.find((entry) => entry.label === 'season chain')).toMatchObject({
      detail: 'season link · fall claimed + 1/3 notes · emberfall crater and 1 note answer each other',
      tone: 'ready',
    });
  });

  it('surfaces unread season afterglows as wonder work and records them after reading', () => {
    const unread = buildHearthJournal(baseInput({
      home: {
        label: 'shelter alive',
        functional: true,
        protected: true,
        missing: [],
        storedItems: 5,
        cellarProvisions: 2,
        structures: 9,
      },
      food: { expeditionStew: 1, trailRation: 1 },
      route: {
        chartKnown: true,
        slateSummary: 'orange fall line afterglow',
        planReady: true,
        planPrepLabel: 'prep complete',
        planMissing: [],
        waystones: 1,
        caveAnchors: 0,
      },
      world: {
        skyfallActive: 0,
        skyfallHarvested: 1,
        murmursActive: 0,
        murmursObserved: 3,
        seasonAfterglowLabel: 'orange fall line afterglow',
        seasonAfterglowDetail: '157 m ahead · fall claimed + 3/3 notes resolved at emberfall crater',
        seasonAfterglowNote: 'the fall and three murmurs hold one remembered path',
        seasonAfterglowRead: false,
        seasonAfterglowFocusMinutes: 420,
        recentMurmurs: [],
        fishLabel: 'quiet water',
        fishStrength: 0.2,
        forageLabel: 'no forage',
        forageStrength: 0.1,
      },
    }));

    expect(unread.next).toContainEqual({
      label: 'Read season afterglow',
      detail: 'orange fall line afterglow · 157 m ahead · fall claimed + 3/3 notes resolved at emberfall crater · focus 420m',
      tone: 'wonder',
    });
    expect(unread.sections.find((section) => section.id === 'field')?.entries.find((entry) => entry.label === 'season afterglow')).toMatchObject({
      detail: 'orange fall line afterglow · unread · 157 m ahead · fall claimed + 3/3 notes resolved at emberfall crater · the fall and three murmurs hold one remembered path',
      tone: 'wonder',
    });

    const read = buildHearthJournal(baseInput({
      home: { functional: true, protected: true, missing: [], label: 'shelter alive', storedItems: 5, cellarProvisions: 2, structures: 9 },
      food: { trailRation: 2 },
      route: { chartKnown: true, planReady: true, planPrepLabel: 'ready', planMissing: [], slateSummary: 'afterglow read', waystones: 1, caveAnchors: 0 },
      world: {
        skyfallActive: 0,
        skyfallHarvested: 1,
        murmursActive: 0,
        murmursObserved: 3,
        seasonAfterglowLabel: 'orange fall line afterglow',
        seasonAfterglowDetail: '157 m ahead · fall claimed + 3/3 notes resolved at emberfall crater',
        seasonAfterglowRead: true,
        recentMurmurs: [],
        fishLabel: 'quiet water',
        fishStrength: 0.2,
        forageLabel: 'no forage',
        forageStrength: 0.1,
      },
    }));
    expect(read.next.map((entry) => entry.label)).not.toContain('Read season afterglow');
    expect(read.sections.find((section) => section.id === 'field')?.entries.find((entry) => entry.label === 'season afterglow')?.tone).toBe('ready');
  });

  it('tracks expedition site work as missing, ready, and completed journal goals', () => {
    const missing = buildHearthJournal(baseInput({
      discoveries: {
        pentagonsKnown: 1,
        pentagonsTotal: 12,
        insightLabel: 'Hearth Memory',
        siteLabel: 'First Hearth hearth niche',
        siteDetail: 'hearth niche incomplete · needs claimed bedroll, lit campfire',
        siteDiscovered: true,
        siteCompleted: false,
        siteReady: false,
        siteMissing: ['claimed bedroll', 'lit campfire'],
        resourcesDiscovered: 0,
        resourcesHarvested: 0,
        resourcesTotal: 36,
      },
    }));
    expect(missing.next.map((entry) => entry.label)).toContain('Prepare site work');
    expect(missing.sections.find((section) => section.id === 'discoveries')?.entries.find((entry) => entry.label === 'First Hearth hearth niche')).toMatchObject({
      tone: 'quiet',
      detail: 'hearth niche incomplete · needs claimed bedroll, lit campfire',
    });

    const ready = buildHearthJournal(baseInput({
      discoveries: {
        pentagonsKnown: 1,
        pentagonsTotal: 12,
        insightLabel: 'Hearth Memory',
        siteLabel: 'First Hearth hearth niche',
        siteDetail: 'hearth niche complete ready · reward +1 expedition stew',
        siteDiscovered: true,
        siteCompleted: false,
        siteReady: true,
        siteMissing: [],
        resourcesDiscovered: 0,
        resourcesHarvested: 0,
        resourcesTotal: 36,
      },
    }));
    expect(ready.next.map((entry) => entry.label)).toContain('Finish site work');
    expect(ready.sections.find((section) => section.id === 'discoveries')?.entries.find((entry) => entry.label === 'First Hearth hearth niche')?.tone).toBe('ready');

    const completed = buildHearthJournal(baseInput({
      discoveries: {
        pentagonsKnown: 1,
        pentagonsTotal: 12,
        insightLabel: 'Hearth Memory',
        siteLabel: 'First Hearth hearth niche',
        siteDetail: 'hearth niche complete · prove the first home ring can really reset an expedition · hearth arch: warm air now pulls through the lintel like a small doorway home',
        siteDiscovered: true,
        siteCompleted: true,
        siteReady: true,
        siteMissing: [],
        resourcesDiscovered: 0,
        resourcesHarvested: 0,
        resourcesTotal: 36,
      },
    }));
    expect(completed.next.map((entry) => entry.label)).not.toContain('Finish site work');
    const completedEntry = completed.sections.find((section) => section.id === 'discoveries')?.entries.find((entry) => entry.label === 'First Hearth hearth niche');
    expect(completedEntry?.tone).toBe('ready');
    expect(completedEntry?.detail).toContain('hearth arch');
  });

  it('reconstructs observed murmur notes from saved ids', () => {
    const observed = new Set<number>();
    const first = murmurSites('journal-murmur-seed', 1, 12, 1000, observed)[0];
    const second = murmurSites('journal-murmur-seed', 1, 12, 1000, observed)[1];
    observeMurmur(observed, first);
    observeMurmur(observed, second);

    const notes = murmurNotebook('journal-murmur-seed', 1000, observed);
    expect(notes.map((note) => note.id)).toEqual([first.id, second.id]);
    expect(notes[0]).toMatchObject({
      label: first.label,
      note: first.note,
      observed: true,
    });
  });

  it('weights cellar provisions and trail rations as expedition food', () => {
    expect(journalMealUnits({ trailRation: 2, cellarProvisions: 1, berries: 1 })).toBeCloseTo(7.65, 5);
    expect(journalMealUnits({ expeditionStew: 1, trailRation: 1 })).toBeCloseTo(6, 5);
  });
});
