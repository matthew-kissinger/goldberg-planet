import { describe, expect, it } from 'vitest';
import {
  addRoutePlanLeg,
  chartBearingDegrees,
  chartTurnLabel,
  createRoutePlanFromGuide,
  createRoutePlanFromGuides,
  deferActiveRoutePlanLeg,
  formatChartDistance,
  greatCircleDistanceMeters,
  hearthBeaconSignal,
  markRoutePlanLegReached,
  nextHorizonChartSignal,
  normalizeRoutePlan,
  planExpedition,
  removeActiveRoutePlanLeg,
  routeAdjacentTile,
  routeEcologyForExpedition,
  routeAtlasVisible,
  routeGuide,
  routeGuideCandidates,
  routePlanItineraryStatus,
  routePlanSignal,
  routeSlate,
} from '../src/sim/navigation';
import type { PentagonLandmark } from '../src/sim/landmarks';
import type { StructureSave, StructureTopology } from '../src/sim/structures';

const centers = Float64Array.from([
  0, 0, 1,
  1, 0, 0,
  0, 1, 0,
  -1, 0, 0,
]);

const frame = { east: [1, 0, 0], north: [0, 1, 0] };

const landmarks: PentagonLandmark[] = [
  { index: 0, tile: 1, name: 'East Gate', clue: '', discovered: false },
  { index: 1, tile: 2, name: 'North Gate', clue: '', discovered: false },
  { index: 2, tile: 3, name: 'West Gate', clue: '', discovered: false },
];

const homeTopology: StructureTopology = {
  degreeOf: (tile) => (tile === 1 ? 2 : 1),
  neighbor: (tile, edge) => (tile === 1 ? 2 + edge : 1),
};

describe('Hearth and Horizon horizon chart navigation', () => {
  it('formats planetary travel distances for HUD use', () => {
    expect(formatChartDistance(42.4)).toBe('42 m');
    expect(formatChartDistance(1540)).toBe('1.5 km');
    expect(formatChartDistance(15400)).toBe('15 km');
  });

  it('measures great-circle distance and signed bearing in the local tangent frame', () => {
    expect(greatCircleDistanceMeters(centers, 0, 1, 100)).toBeCloseTo(Math.PI * 50, 5);
    expect(chartBearingDegrees(centers, frame, 0, [1, 0, 0], 1)).toBeCloseTo(0, 5);
    expect(chartBearingDegrees(centers, frame, 0, [1, 0, 0], 2)).toBeCloseTo(-90, 5);
    expect(chartTurnLabel(-90)).toBe('left');
    expect(chartTurnLabel(90)).toBe('right');
    expect(chartTurnLabel(170)).toBe('behind');
  });

  it('points to the nearest undiscovered pentagon and stops when all are known', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100);
    expect(signal).toMatchObject({
      target: { tile: 2, name: 'North Gate' },
      distanceLabel: '157 m',
      turn: 'left',
      remaining: 2,
      total: 3,
    });
    expect(signal?.bearingDeg).toBeCloseTo(-90, 5);
    expect(nextHorizonChartSignal(landmarks, new Set([1, 2, 3]), centers, frame, 0, [1, 0, 0], 100)).toBeNull();
  });

  it('turns the horizon chart into an expedition prep checklist', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = {
      ...signal,
      distanceM: 1800,
      distanceLabel: '1.8 km',
      label: `${signal.target.name} 1.8 km ${signal.turn}`,
    };

    const plan = planExpedition({
      signal: longRoute,
      items: { berries: 2 },
      survival: { stamina: 28, exposure: 76, mealsEaten: 0 },
      weather: { kind: 'storm', label: 'storm front', intensity: 1, exposureRate: 2, staminaRegen: 0.4 },
      home: { label: 'no home', protected: false, functional: false },
      planeCrafted: false,
    });

    expect(plan).toMatchObject({
      ready: false,
      range: 'planetary',
      targetLabel: 'North Gate',
    });
    expect(plan.missing).toEqual(expect.arrayContaining(['packed food', 'rested body', 'home reset', 'tool kit', 'light', 'travel', 'storm timing']));
    expect(plan.prepLabel).toBe('prep: packed food, rested body, home reset +');
  });

  it('lets a storm cloak satisfy the storm timing prep check without pretending the storm is gone', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { campMeal: 2, stonePick: 1, stoneAxe: 1, echoLantern: 1, planeFrame: 1, stormCloak: 1 },
      survival: { stamina: 90, exposure: 5, mealsEaten: 0 },
      weather: { kind: 'storm', label: 'storm front', intensity: 1, exposureRate: 2, staminaRegen: 0.4 },
      home: { label: 'drafty functional camp', protected: false, functional: true },
      planeCrafted: false,
    });

    expect(plan.ready).toBe(true);
    expect(plan.missing).not.toContain('storm timing');
    expect(plan.checks.find((check) => check.id === 'weather')).toMatchObject({
      ready: true,
      detail: 'storm cloak packed',
    });
  });

  it('lets pentagon insights change expedition prep requirements', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { campMeal: 1, stonePick: 1, glowCrystal: 1 },
      survival: { stamina: 90, exposure: 5, mealsEaten: 0 },
      weather: { kind: 'storm', label: 'storm front', intensity: 1, exposureRate: 2, staminaRegen: 0.4 },
      home: { label: 'weather safe', protected: true, functional: false },
      planeCrafted: true,
      insights: {
        count: 5,
        total: 12,
        effects: ['hearth', 'root', 'stone', 'cave', 'storm'],
        prepLabel: 'Hearth Memory + Root Listening + Red Stone',
      },
    });

    expect(plan.ready).toBe(true);
    expect(plan.checks.find((check) => check.id === 'food')?.detail).toBe('2/2 meal units · insight -1');
    expect(plan.checks.find((check) => check.id === 'shelter')?.detail).toContain('Hearth Memory');
    expect(plan.checks.find((check) => check.id === 'tools')?.detail).toBe('stone pick + Red Stone reading');
    expect(plan.checks.find((check) => check.id === 'light')?.detail).toBe('glow crystal reading');
    expect(plan.checks.find((check) => check.id === 'weather')?.detail).toContain('storm read by Hearth Memory');
  });

  it('lets linked season chains stand in as practical route memory', () => {
    const plan = planExpedition({
      signal: null,
      items: { campMeal: 1, stonePick: 1 },
      survival: { stamina: 88, exposure: 4, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'shelter alive', protected: true, functional: true },
      planeCrafted: false,
      seasonChain: {
        progressLabel: 'fall claimed + 1/3 notes',
        payoffLabel: 'season link',
        payoffDetail: 'emberfall crater and 1 note answer each other',
        routeEffect: 'Route Slate can treat this as a linked season route',
        linked: true,
        fullChord: false,
      },
    });

    expect(plan.ready).toBe(true);
    expect(plan.targetLabel).toBe('season link');
    expect(plan.routeLabel).toBe('linked season route memory');
    expect(plan.missing).not.toContain('route');
    expect(plan.checks.find((check) => check.id === 'route')).toMatchObject({
      ready: true,
      detail: 'season link · fall claimed + 1/3 notes · Route Slate can treat this as a linked season route',
    });
  });

  it('lets full season chords reduce one long-route food burden', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { campMeal: 1, stonePick: 1, stoneAxe: 1, echoLantern: 1 },
      survival: { stamina: 92, exposure: 4, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'shelter alive', protected: true, functional: true },
      planeCrafted: true,
      seasonChain: {
        progressLabel: 'fall claimed + 3/3 notes',
        payoffLabel: 'full season chord',
        payoffDetail: 'the fall and every note now read as one route memory',
        routeEffect: 'commit a season itinerary with full chord context',
        linked: true,
        fullChord: true,
      },
    });

    expect(plan.ready).toBe(true);
    expect(plan.checks.find((check) => check.id === 'route')?.detail).toContain('full season chord');
    expect(plan.checks.find((check) => check.id === 'food')?.detail).toBe('2/2 meal units · full season chord -1');
  });

  it('marks a well-packed planetary route as expedition ready', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { campMeal: 2, cookedFish: 1, stonePick: 1, stoneAxe: 1, echoLantern: 1 },
      survival: { stamina: 92, exposure: 4, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'shelter alive', protected: true, functional: true },
      planeCrafted: true,
    });

    expect(plan.ready).toBe(true);
    expect(plan.prepLabel).toBe('expedition ready');
    expect(plan.score).toBe(plan.max);
    expect(plan.checks.find((check) => check.id === 'food')?.detail).toBe('5.4/3 meal units');
  });

  it('counts echo tools as upgraded expedition-ready pick and axe prep', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { campMeal: 2, cookedFish: 1, echoPick: 1, echoAxe: 1, echoLantern: 1 },
      survival: { stamina: 92, exposure: 4, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'shelter alive', protected: true, functional: true },
      planeCrafted: true,
    });

    expect(plan.ready).toBe(true);
    expect(plan.checks.find((check) => check.id === 'tools')?.detail).toBe('echo pick + echo axe');
  });

  it('counts trail rations as strong preserved food for distant routes', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { trailRation: 2, stonePick: 1, stoneAxe: 1, echoLantern: 1 },
      survival: { stamina: 92, exposure: 4, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'shelter alive', protected: true, functional: true },
      planeCrafted: true,
    });

    expect(plan.ready).toBe(true);
    expect(plan.checks.find((check) => check.id === 'food')?.detail).toBe('4.8/3 meal units');
  });

  it('counts expedition stew as a focused meal for planetary routes', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { expeditionStew: 1, stonePick: 1, stoneAxe: 1, echoLantern: 1 },
      survival: { stamina: 92, exposure: 4, mealsEaten: 0, trailFocus: 180 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'shelter alive', protected: true, functional: true },
      planeCrafted: true,
    });

    expect(plan.ready).toBe(true);
    expect(plan.checks.find((check) => check.id === 'food')?.detail).toBe('3.6/3 meal units');
    expect(plan.checks.find((check) => check.id === 'rest')?.detail).toContain('trail focus 180m');
  });

  it('counts home root-cellar provisions as staged expedition food', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { stonePick: 1, stoneAxe: 1, echoLantern: 1 },
      survival: { stamina: 92, exposure: 4, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'shelter alive', protected: true, functional: true, cellarProvisions: 2 },
      planeCrafted: true,
    });

    expect(plan.ready).toBe(true);
    expect(plan.checks.find((check) => check.id === 'food')?.detail).toBe('4.8/3 meal units · cellar 2');
  });

  it('counts ready waterline ecology as capped route resupply', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { campMeal: 1, stonePick: 1, stoneAxe: 1, echoLantern: 1 },
      survival: { stamina: 92, exposure: 4, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'shelter alive', protected: true, functional: true },
      ecology: {
        fishLabel: 'storm fish run',
        fishStrength: 0.72,
        fishTrapReady: 1,
        shoreNetReady: 1,
      },
      planeCrafted: true,
    });

    expect(plan.ready).toBe(true);
    expect(plan.missing).not.toContain('packed food');
    expect(plan.checks.find((check) => check.id === 'food')?.detail).toBe('3.4/3 meal units · waterline 1.4 (1 trap + 1 net + storm fish run)');
  });

  it('does not count fish runs as route resupply until traps or nets are ready', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { campMeal: 1, stonePick: 1, stoneAxe: 1, echoLantern: 1 },
      survival: { stamina: 92, exposure: 4, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'shelter alive', protected: true, functional: true },
      ecology: {
        fishLabel: 'storm fish run',
        fishStrength: 0.72,
        fishTrapReady: 0,
        shoreNetReady: 0,
      },
      planeCrafted: true,
    });

    expect(plan.ready).toBe(false);
    expect(plan.missing).toContain('packed food');
    expect(plan.checks.find((check) => check.id === 'food')?.detail).toBe('2/3 meal units');
  });

  it('only counts route-adjacent waterline gear toward expedition resupply', () => {
    const routeCenters = Float64Array.from([
      0, 0, 1,
      1, 0, 0,
      Math.SQRT1_2, 0, Math.SQRT1_2,
      0, 1, 0,
    ]);
    expect(routeAdjacentTile(routeCenters, 0, 1, 2, 1000, 120, 120)).toBe(true);
    expect(routeAdjacentTile(routeCenters, 0, 1, 3, 1000, 120, 120)).toBe(false);

    const ecology = routeEcologyForExpedition({
      centers: routeCenters,
      fromTile: 0,
      targetTile: 1,
      radius: 1000,
      fishLabel: 'storm fish run',
      fishStrength: 0.72,
      traps: [
        { tile: 2, ready: true },
        { tile: 3, ready: true },
      ],
      nets: [
        { tile: 0, ready: true },
      ],
      endpointMeters: 120,
      detourMeters: 120,
    });
    expect(ecology).toMatchObject({
      fishTrapReady: 1,
      shoreNetReady: 1,
      fishTrapOffRouteReady: 1,
      shoreNetOffRouteReady: 0,
    });

    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { campMeal: 1, stonePick: 1, stoneAxe: 1, echoLantern: 1 },
      survival: { stamina: 92, exposure: 4, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'shelter alive', protected: true, functional: true },
      ecology,
      planeCrafted: true,
    });

    expect(plan.ready).toBe(true);
    expect(plan.checks.find((check) => check.id === 'food')?.detail).toBe('3.4/3 meal units · waterline 1.4 (1 trap + 1 net + storm fish run + off-route 1 ignored)');
  });

  it('lets a read weather vane time storms for expedition prep', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const longRoute = { ...signal, distanceM: 1800, distanceLabel: '1.8 km' };
    const plan = planExpedition({
      signal: longRoute,
      items: { campMeal: 2, cookedFish: 1, stonePick: 1, stoneAxe: 1, echoLantern: 1 },
      survival: { stamina: 92, exposure: 4, mealsEaten: 0 },
      weather: { kind: 'storm', label: 'storm front', intensity: 0.75, exposureRate: 2, staminaRegen: 0.4 },
      home: { label: 'home camp', protected: false, functional: true, weatherVane: true, forecastLabel: 'storm front' },
      planeCrafted: true,
    });

    expect(plan.ready).toBe(true);
    expect(plan.checks.find((check) => check.id === 'weather')).toMatchObject({
      ready: true,
      detail: 'storm timed by storm front',
    });

    const slate = routeSlate({
      chart: longRoute,
      beacon: null,
      plan,
      weather: { kind: 'storm', label: 'storm front', intensity: 0.75, exposureRate: 2, staminaRegen: 0.4 },
    });
    expect(slate.pins.find((pin) => pin.id === 'weather')).toMatchObject({
      ready: true,
      detail: 'storm timed by storm front · stronger fish runs',
    });
  });

  it('returns no hearth beacon until a bedroll has been marked home', () => {
    expect(hearthBeaconSignal([], homeTopology, centers, frame, 0, [1, 0, 0], 100)).toBeNull();
    const campOnly: StructureSave[] = [
      { id: 1, item: 'campfire', tile: 2, layer: 4, yaw: 0, state: { lit: true } },
    ];
    expect(hearthBeaconSignal(campOnly, homeTopology, centers, frame, 0, [1, 0, 0], 100)).toBeNull();
  });

  it('remembers home direction before the hearth is lit', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 1, layer: 4, yaw: 0, state: { home: true } },
    ];
    const signal = hearthBeaconSignal(structures, homeTopology, centers, frame, 0, [1, 0, 0], 100);
    expect(signal).toMatchObject({
      homeTile: 1,
      sourceTile: null,
      active: false,
      strength: 0,
      distanceLabel: '157 m',
      turn: 'ahead',
      shelterLabel: 'shelter needs roof 0/2',
      label: 'home 157 m ahead',
    });
    expect(signal?.message).toContain('light the hearth');
  });

  it('turns a lit home campfire into a return-home beacon', () => {
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: 1, layer: 4, yaw: 0, state: { home: true } },
      { id: 2, item: 'campfire', tile: 2, layer: 4, yaw: 0, state: { lit: true } },
      { id: 3, item: 'roofBundle', tile: 2, layer: 4, yaw: 0 },
      { id: 4, item: 'roofBundle', tile: 3, layer: 4, yaw: 0 },
      { id: 5, item: 'doorKit', tile: 3, layer: 4, yaw: 0 },
      { id: 6, item: 'workbench', tile: 2, layer: 4, yaw: 0 },
      { id: 7, item: 'chest', tile: 3, layer: 4, yaw: 0 },
    ];
    const signal = hearthBeaconSignal(structures, homeTopology, centers, frame, 0, [1, 0, 0], 100);
    expect(signal).toMatchObject({
      homeTile: 1,
      sourceTile: 2,
      active: true,
      strength: 1,
      distanceLabel: '157 m',
      turn: 'ahead',
      shelterLabel: 'shelter alive',
      label: 'hearth smoke 157 m ahead',
    });
    expect(signal?.bearingDeg).toBeCloseTo(0, 5);
    expect(signal?.message).toContain('shelter alive');
  });

  it('builds a ranked route slate from chart, home, cave, and weather signals', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const beacon = hearthBeaconSignal([
      { id: 1, item: 'bedroll', tile: 1, layer: 4, yaw: 0, state: { home: true } },
      { id: 2, item: 'campfire', tile: 2, layer: 4, yaw: 0, state: { lit: true } },
    ], homeTopology, centers, frame, 0, [1, 0, 0], 100)!;
    const plan = planExpedition({
      signal,
      items: { berries: 3 },
      survival: { stamina: 80, exposure: 12, mealsEaten: 0 },
      weather: { kind: 'storm', label: 'storm front', intensity: 0.8, exposureRate: 2, staminaRegen: 0.45 },
      home: { label: 'weather safe', protected: true, functional: false },
      planeCrafted: false,
    });

    const slate = routeSlate({
      chart: signal,
      beacon,
      plan,
      cave: { kind: 'dryCave', distance: 1, depth: 11.5, flooded: false },
      caveAnchors: [{ tile: 2, kind: 'dryCave', label: 'anchored basalt throat', distanceM: 122, distanceLabel: '122 m', turn: 'left', depth: 12.75, flooded: false, clearance: 4, uses: 2 }],
      waystones: [{ tile: 3, mark: 'survey', label: 'survey waystone', distanceLabel: '84 m', turn: 'right' }],
      fish: { kind: 'storm', label: 'storm fish run', strength: 0.72, catchCount: 2, baitUseful: true, trapCount: 2, trapReady: 1, netCount: 1, netReady: 1 },
      forage: { kind: 'kelp', label: 'shore kelp', strength: 0.45 },
      weather: { kind: 'storm', label: 'storm front', intensity: 0.8, exposureRate: 2, staminaRegen: 0.45 },
      insights: { count: 2, total: 12, effects: ['tide', 'storm'], prepLabel: 'Salt Tide + Storm Seat' },
      domain: {
        label: 'Salt Mirror domain',
        domainLabel: 'salt-tide shore',
        landmarkName: 'Salt Mirror',
        discovered: true,
        ring: 1,
        intensity: 0.6,
        challenge: 'shore routes pull food planning toward water',
        boon: 'fish schools and bait runs become easier to find',
        routeHint: 'walk the waterline before crossing inland',
      },
      site: {
        label: 'Salt Mirror salt dock cut',
        siteLabel: 'salt dock cut',
        landmarkName: 'Salt Mirror',
        discovered: true,
        ring: 1,
        intensity: 0.6,
        problem: 'food runs drift toward shore and can strand inland travelers',
        opportunity: 'a dock-and-rack campsite for bait, fish, and preserved rations',
        buildHint: 'build dock segment + drying rack near the salt ribs',
        routeHint: 'fish and preserve before turning inland',
        wonder: 'the ribs count tides even where the water has already pulled away',
      },
      thresholdChamber: {
        label: 'tide-count crawl',
        detail: 'a low crawl where old tide lines count the shore route',
        note: 'the sea measures paths under land before feet find them',
        rewardLabel: 'bait',
        rewardCount: 2,
        landmarkName: 'Salt Mirror',
        thresholdLabel: 'tide underpass',
        open: true,
        observed: false,
        hint: 'inspect the tide-count crawl inside tide underpass',
      },
      resource: {
        label: 'salt shell cache',
        dormantLabel: 'white shell glint',
        detail: 'shells and salt scraps that pull fish toward shore',
        rewardLabel: 'bait',
        rewardCount: 2,
        discovered: true,
        harvested: false,
        hint: 'awaken Salt Mirror to gather salt shell cache',
      },
      skyfall: {
        tile: 3,
        kind: 'emberFall',
        label: 'emberfall crater',
        detail: 'fresh star-slag still ticking with orange heat',
        omenLabel: 'orange fall line',
        omenDetail: 'a warm ember tail hangs high above the impact tile',
        rewardLabel: 'glow crystal',
        rewardCount: 1,
        distanceM: 96,
        distanceLabel: '96 m',
        turn: 'right',
        minutesRemaining: 88,
        active: true,
        harvested: false,
      },
      murmur: {
        tile: 2,
        kind: 'windThread',
        label: 'wind-thread shimmer',
        detail: 'thin air lines comb across the hexes without touching them',
        note: 'the wind bends around something you cannot see yet',
        distanceM: 70,
        distanceLabel: '70 m',
        turn: 'left',
        minutesRemaining: 45,
        active: true,
        observed: false,
      },
      season: {
        label: 'orange fall line / wind-thread shimmer',
        detail: 'now · emberfall crater overlaps 3/3 unnoted murmurs',
        tradeoff: 'glow crystal or 3 notes',
        routeHint: 'choose whether itinerary bends toward emberfall crater or wind-thread shimmer',
        startsInMinutes: 0,
        endsInMinutes: 88,
        urgency: 'now',
        focus: 'split',
        chain: {
          progressLabel: 'fall claimed + 1/3 notes',
          payoffLabel: 'season link',
          payoffDetail: 'emberfall crater and 1 note answer each other',
          routeEffect: 'Route Slate can treat this as a linked season route',
          linked: true,
          fullChord: false,
        },
      },
    });

    expect(slate.title).toBe('Horizon Route Slate');
    expect(slate.primary?.id).toBe('target');
    expect(slate.pins.map((pin) => pin.id)).toEqual(expect.arrayContaining(['target', 'home', 'domain', 'site', 'thresholdChamber', 'resource', 'skyfall', 'murmur', 'season', 'cave', 'caveAnchor', 'waystone', 'weather', 'fish', 'forage', 'insight']));
    expect(slate.pins.find((pin) => pin.id === 'cave')?.detail).toBe('1 ring · depth 11.5 m');
    expect(slate.pins.find((pin) => pin.id === 'caveAnchor')?.detail).toBe('122 m left · anchored dry cave · depth 12.8 m · clearance 4 cells · set 2x');
    expect(slate.pins.find((pin) => pin.id === 'waystone')?.detail).toBe('84 m right · persistent marker');
    expect(slate.pins.find((pin) => pin.id === 'domain')?.detail).toBe('1 ring from landmark · fish schools and bait runs become easier to find');
    expect(slate.pins.find((pin) => pin.id === 'site')?.detail).toBe('1 ring from landmark · a dock-and-rack campsite for bait, fish, and preserved rations · build dock segment + drying rack near the salt ribs');
    expect(slate.pins.find((pin) => pin.id === 'thresholdChamber')?.detail).toBe('tide underpass · a low crawl where old tide lines count the shore route · +2 bait');
    expect(slate.pins.find((pin) => pin.id === 'resource')?.detail).toBe('+2 bait · shells and salt scraps that pull fish toward shore');
    expect(slate.pins.find((pin) => pin.id === 'skyfall')?.detail).toBe('96 m right · orange fall line · fresh star-slag still ticking with orange heat · +1 glow crystal · 88m left');
    expect(slate.pins.find((pin) => pin.id === 'murmur')?.detail).toBe('70 m left · thin air lines comb across the hexes without touching them · 45m before it fades');
    expect(slate.pins.find((pin) => pin.id === 'season')?.detail).toBe('now · emberfall crater overlaps 3/3 unnoted murmurs · glow crystal or 3 notes · choose whether itinerary bends toward emberfall crater or wind-thread shimmer · fall claimed + 1/3 notes · emberfall crater and 1 note answer each other · Route Slate can treat this as a linked season route');
    expect(slate.pins.find((pin) => pin.id === 'insight')?.detail).toBe('2/12 · Salt Tide + Storm Seat');
    expect(slate.pins.find((pin) => pin.id === 'fish')?.detail).toBe('strength 0.72 · catch 2 · traps 1/2 ready · nets 1/1 ready · bait helps');
    expect(slate.summary).toContain('North Gate');
  });

  it('surfaces cave spring seeps in route slate cave details', () => {
    const slate = routeSlate({
      chart: null,
      beacon: null,
      plan: planExpedition({
        signal: null,
        items: {},
        survival: { stamina: 80, exposure: 8, mealsEaten: 0 },
      }),
      cave: { kind: 'dryCave', distance: 1, depth: 13.5, flooded: false, spring: true, label: 'spring cave mouth' },
      caveAnchors: [{ kind: 'dryCave', label: 'anchored spring cave', distanceM: 96, distanceLabel: '96 m', turn: 'ahead', depth: 13.5, flooded: false, spring: true }],
    });

    expect(slate.pins.find((pin) => pin.id === 'cave')?.detail).toBe('1 ring · depth 13.5 m · spring seep');
    expect(slate.pins.find((pin) => pin.id === 'caveAnchor')?.detail).toBe('96 m ahead · anchored dry cave · depth 13.5 m · spring seep');
  });

  it('promotes ready and completed expedition site work in the route slate', () => {
    const plan = planExpedition({
      signal: null,
      items: {},
      survival: { stamina: 96, exposure: 2, mealsEaten: 0 },
    });
    const baseSite = {
      label: 'First Hearth hearth niche',
      siteLabel: 'hearth niche',
      landmarkName: 'First Hearth',
      discovered: true,
      ring: 0,
      intensity: 1,
      problem: 'safe-looking ground still fails without an actual bed',
      opportunity: 'a compact home ring for first shelters and return-trip recovery',
      buildHint: 'build bedroll + lit campfire + chest inside the apron',
      routeHint: 'return here when a trip needs a dependable reset',
      wonder: 'the stones feel arranged for a home that has not been built yet',
    };

    const ready = routeSlate({
      chart: null,
      beacon: null,
      plan,
      site: {
        ...baseSite,
        ready: true,
        missing: [],
        rewardLabel: 'expedition stew',
        rewardCount: 1,
        thresholdLabel: 'cold hearth lintel',
        thresholdOpen: false,
        thresholdTraversal: 'walk-under home arch',
      },
    });
    expect(ready.primary).toMatchObject({
      id: 'site',
      label: 'First Hearth hearth niche',
      ready: true,
      detail: 'at landmark · ready to complete · +1 expedition stew · threshold: cold hearth lintel · walk-under home arch',
    });

    const incomplete = routeSlate({
      chart: null,
      beacon: null,
      plan,
      site: { ...baseSite, missing: ['claimed bedroll', 'lit campfire'] },
    });
    expect(incomplete.pins.find((pin) => pin.id === 'site')?.detail).toBe('at landmark · a compact home ring for first shelters and return-trip recovery · needs claimed bedroll, lit campfire');

    const complete = routeSlate({
      chart: null,
      beacon: null,
      plan,
      site: { ...baseSite, completed: true, ready: true, rewardLabel: 'expedition stew', rewardCount: 1, thresholdLabel: 'hearth arch', thresholdOpen: true, thresholdTraversal: 'walk-under home arch' },
    });
    expect(complete.primary).toMatchObject({
      id: 'site',
      detail: 'at landmark · complete · a compact home ring for first shelters and return-trip recovery · opened: hearth arch · walk-under home arch',
    });
  });

  it('treats high-clearance land arches as routeable cave signals', () => {
    const cramped = routeSlate({
      chart: null,
      beacon: null,
      plan: planExpedition({
        signal: null,
        items: {},
        survival: { stamina: 80, exposure: 8, mealsEaten: 0 },
      }),
      cave: { kind: 'arch', label: 'low land arch', distance: 1, depth: 3.2, flooded: false, clearance: 3 },
    });
    expect(cramped.pins.find((pin) => pin.id === 'cave')).toMatchObject({
      label: 'low land arch',
      ready: false,
    });

    const wide = routeSlate({
      chart: null,
      beacon: null,
      plan: planExpedition({
        signal: null,
        items: {},
        survival: { stamina: 80, exposure: 8, mealsEaten: 0 },
      }),
      cave: { kind: 'arch', label: 'wide land arch', distance: 1, depth: 4.8, flooded: false, clearance: 5 },
    });
    expect(wide.pins.find((pin) => pin.id === 'cave')).toMatchObject({
      label: 'wide land arch',
      detail: '1 ring · depth 4.8 m · clearance 5 cells',
      ready: true,
    });
  });

  it('pins a route guide into a saved planned path that can own slate and ribbon priority', () => {
    const guide = {
      kind: 'skyfall' as const,
      targetTile: 1,
      label: 'emberfall crater',
      detail: '96 m right · orange fall line · 88m left',
      priority: 88,
    };
    const saved = createRoutePlanFromGuide(guide, 0, 2, 725)!;
    expect(saved).toEqual({
      targetTile: 1,
      sourceKind: 'skyfall',
      label: 'emberfall crater',
      detail: 'orange fall line · 88m left',
      originTile: 0,
      setDay: 2,
      setMinute: 725,
    });

    expect(normalizeRoutePlan({
      ...saved,
      label: '  emberfall   crater  ',
      detail: ' route   pinned ',
      setMinute: 99999,
    }, 4)).toMatchObject({
      label: 'emberfall crater',
      detail: 'route pinned',
      setMinute: 1439.999,
    });

    const planSignal = routePlanSignal(saved, centers, frame, 0, [1, 0, 0], 100)!;
    expect(planSignal).toMatchObject({
      sourceKind: 'skyfall',
      label: 'emberfall crater',
      distanceLabel: '157 m',
      turn: 'ahead',
      arrived: false,
    });

    const slate = routeSlate({
      chart: null,
      beacon: null,
      routePlan: planSignal,
      plan: planExpedition({
        signal: null,
        items: {},
        survival: { stamina: 80, exposure: 8, mealsEaten: 0 },
      }),
      forage: { kind: 'berries', label: 'berry patch', strength: 0.55 },
    });
    expect(slate.title).toBe('Planned Route Slate');
    expect(slate.primary).toMatchObject({
      id: 'planned',
      label: 'Planned Path',
      detail: 'emberfall crater · 157 m ahead · orange fall line · 88m left',
    });
    expect(routeGuide({ chart: null, beacon: null, routePlan: planSignal })).toMatchObject({
      kind: 'planned',
      targetTile: 1,
      label: 'emberfall crater',
    });

    const arrived = routePlanSignal(saved, centers, frame, 1, [1, 0, 0], 100)!;
    expect(arrived.arrived).toBe(true);
    expect(routeGuide({ chart: null, beacon: null, routePlan: arrived })).toBeNull();
  });

  it('can save a deliberately selected non-primary route candidate', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const beacon = hearthBeaconSignal([
      { id: 1, item: 'bedroll', tile: 2, layer: 4, yaw: 0, state: { home: true } },
      { id: 2, item: 'campfire', tile: 2, layer: 4, yaw: 0, state: { lit: true } },
    ], homeTopology, centers, frame, 0, [1, 0, 0], 100)!;
    const candidates = routeGuideCandidates({
      chart: signal,
      beacon,
      skyfall: {
        tile: 3,
        kind: 'emberFall',
        label: 'emberfall crater',
        detail: 'fresh star-slag still ticking with orange heat',
        rewardLabel: 'glow crystal',
        rewardCount: 1,
        distanceM: 96,
        distanceLabel: '96 m',
        turn: 'right',
        minutesRemaining: 88,
        active: true,
        harvested: false,
      },
    });

    expect(candidates[0].kind).toBe('target');
    const selected = candidates.find((candidate) => candidate.kind === 'home')!;
    const saved = createRoutePlanFromGuides([selected], 0, 4, 360)!;

    expect(saved).toMatchObject({
      sourceKind: 'home',
      targetTile: beacon.homeTile,
      label: 'Hearth Beacon',
    });
  });

  it('builds, extends, advances, and completes saved multi-leg route itineraries', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const candidates = routeGuideCandidates({
      chart: signal,
      beacon: null,
      waystones: [{ tile: 3, mark: 'cave', label: 'cave waystone', distanceLabel: '84 m', turn: 'right' }],
      skyfall: { tile: 1, kind: 'glassRain', label: 'glass-rain shoal', detail: 'sand fused into pale window-glass ribs', omenLabel: 'pale shard halo', omenDetail: 'a thin ring of sky-glass glints above the fall', rewardLabel: 'sand', rewardCount: 6, distanceM: 140, distanceLabel: '140 m', turn: 'ahead', minutesRemaining: 42, active: true, harvested: false },
      murmur: { tile: 2, kind: 'starGlass', label: 'star-glass glimmer', detail: 'a faint shard reflection appears only when you move', note: 'the sky leaves fingerprints even where nothing has fallen', distanceM: 120, distanceLabel: '120 m', turn: 'left', minutesRemaining: 31, active: true, observed: false },
    });
    expect(candidates.map((candidate) => candidate.kind)).toEqual(['target', 'skyfall', 'waystone', 'murmur']);

    let plan = createRoutePlanFromGuides(candidates, 0, 4, 360, 3)!;
    expect(plan.legs?.map((leg) => leg.label)).toEqual(['North Gate', 'glass-rain shoal', 'cave waystone']);
    expect(routePlanItineraryStatus(plan)).toMatchObject({ activeIndex: 0, reachedCount: 0, complete: false });
    expect(routePlanSignal(plan, centers, frame, 0, [1, 0, 0], 100)).toMatchObject({
      label: 'North Gate',
      legIndex: 0,
      legCount: 3,
      reachedCount: 0,
      complete: false,
      message: 'planned stop 1/3 · 157 m left · North Gate',
    });

    const duplicate = addRoutePlanLeg(plan, candidates[1], 0, 4, 370, 3);
    expect(duplicate).toMatchObject({ ok: false, reason: 'duplicate', label: 'glass-rain shoal', legCount: 3 });

    const firstArrival = markRoutePlanLegReached(plan, 4, 390);
    expect(firstArrival).toMatchObject({ changed: true, complete: false, advanced: true, label: 'North Gate', legIndex: 0, legCount: 3 });
    plan = firstArrival.plan!;
    expect(plan.legs?.[0]).toMatchObject({ label: 'North Gate', reached: true, reachedDay: 4, reachedMinute: 390 });
    expect(routePlanSignal(plan, centers, frame, 0, [1, 0, 0], 100)).toMatchObject({
      label: 'glass-rain shoal',
      legIndex: 1,
      legCount: 3,
      reachedCount: 1,
      complete: false,
    });

    const slate = routeSlate({
      chart: null,
      beacon: null,
      routePlan: routePlanSignal(plan, centers, frame, 0, [1, 0, 0], 100),
      plan: planExpedition({ signal: null, items: {}, survival: { stamina: 80, exposure: 8, mealsEaten: 0 } }),
    });
    expect(slate.primary).toMatchObject({
      id: 'planned',
      label: 'Itinerary Stop 2/3',
      detail: 'stop 2/3 · glass-rain shoal · 157 m ahead · pale shard halo · 42m left',
    });
    expect(routeGuide({ chart: null, beacon: null, routePlan: routePlanSignal(plan, centers, frame, 0, [1, 0, 0], 100) })).toMatchObject({
      kind: 'planned',
      detail: 'stop 2/3 · 157 m ahead · pale shard halo · 42m left',
    });

    plan = markRoutePlanLegReached(plan, 4, 420).plan!;
    const finalArrival = markRoutePlanLegReached(plan, 4, 450);
    expect(finalArrival).toMatchObject({ changed: true, complete: true, advanced: false, label: 'cave waystone' });
    const complete = routePlanSignal(finalArrival.plan, centers, frame, 3, [1, 0, 0], 100)!;
    expect(complete).toMatchObject({ complete: true, arrived: true, reachedCount: 3, legCount: 3 });
    expect(routeGuide({ chart: null, beacon: null, routePlan: complete })).toBeNull();
  });

  it('moves or drops the active saved itinerary stop without desyncing the active route', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const candidates = routeGuideCandidates({
      chart: signal,
      beacon: null,
      waystones: [{ tile: 3, mark: 'cave', label: 'cave waystone', distanceLabel: '84 m', turn: 'right' }],
      skyfall: { tile: 1, kind: 'glassRain', label: 'glass-rain shoal', detail: 'sand fused into pale window-glass ribs', omenLabel: 'pale shard halo', omenDetail: 'a thin ring of sky-glass glints above the fall', rewardLabel: 'sand', rewardCount: 6, distanceM: 140, distanceLabel: '140 m', turn: 'ahead', minutesRemaining: 42, active: true, harvested: false },
      murmur: { tile: 2, kind: 'starGlass', label: 'star-glass glimmer', detail: 'a faint shard reflection appears only when you move', note: 'the sky leaves fingerprints even where nothing has fallen', distanceM: 120, distanceLabel: '120 m', turn: 'left', minutesRemaining: 31, active: true, observed: false },
    });
    let plan = createRoutePlanFromGuides(candidates, 0, 4, 360, 3)!;

    const deferred = deferActiveRoutePlanLeg(plan);
    expect(deferred).toMatchObject({ ok: true, reason: 'deferred', label: 'North Gate', legCount: 3, activeIndex: 0 });
    plan = deferred.plan!;
    expect(plan.label).toBe('glass-rain shoal');
    expect(plan.legs?.map((leg) => leg.label)).toEqual(['glass-rain shoal', 'cave waystone', 'North Gate']);
    expect(routePlanSignal(plan, centers, frame, 0, [1, 0, 0], 100)).toMatchObject({
      label: 'glass-rain shoal',
      legIndex: 0,
      legCount: 3,
      reachedCount: 0,
    });

    const dropped = removeActiveRoutePlanLeg(plan);
    expect(dropped).toMatchObject({ ok: true, reason: 'removed', label: 'glass-rain shoal', legCount: 2, activeIndex: 0 });
    plan = dropped.plan!;
    expect(plan.label).toBe('cave waystone');
    expect(plan.legs?.map((leg) => leg.label)).toEqual(['cave waystone', 'North Gate']);

    const reached = markRoutePlanLegReached(plan, 4, 420).plan!;
    expect(routePlanItineraryStatus(reached)).toMatchObject({ activeIndex: 1, reachedCount: 1, complete: false });
    const reachedDeferred = deferActiveRoutePlanLeg(reached);
    expect(reachedDeferred).toMatchObject({ ok: false, reason: 'single', label: 'North Gate', legCount: 2, activeIndex: 1 });

    const oneStop = createRoutePlanFromGuides([candidates[0]], 0, 4, 360, 3)!;
    expect(deferActiveRoutePlanLeg(oneStop)).toMatchObject({ ok: false, reason: 'single', label: 'North Gate' });
    expect(removeActiveRoutePlanLeg(oneStop)).toMatchObject({ ok: true, reason: 'removed', label: 'North Gate', plan: null, legCount: 0 });
  });

  it('lets active Stranger Seasons produce seasonal multi-stop route itineraries', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const seasonGuides = [
      {
        kind: 'skyfall' as const,
        targetTile: 1,
        label: 'Season Fall: glass-rain shoal',
        detail: '140 m ahead · season fall · pale shard halo · 42m left',
        priority: 126,
      },
      {
        kind: 'murmur' as const,
        targetTile: 2,
        label: 'Season Note: star-glass glimmer',
        detail: '120 m left · season note 1/3 · a faint shard reflection appears only when you move · 31m left',
        priority: 122,
      },
      {
        kind: 'murmur' as const,
        targetTile: 3,
        label: 'Season Note: tide-bell hush',
        detail: '84 m right · season note 2/3 · a low glass bell answers from under soil and water · 31m left',
        priority: 121,
      },
    ];
    const candidates = routeGuideCandidates({
      chart: signal,
      beacon: null,
      seasonGuides,
      skyfall: { tile: 1, kind: 'glassRain', label: 'glass-rain shoal', detail: 'sand fused into pale window-glass ribs', omenLabel: 'pale shard halo', omenDetail: 'a thin ring of sky-glass glints above the fall', rewardLabel: 'sand', rewardCount: 6, distanceM: 140, distanceLabel: '140 m', turn: 'ahead', minutesRemaining: 42, active: true, harvested: false },
      murmur: { tile: 2, kind: 'starGlass', label: 'star-glass glimmer', detail: 'a faint shard reflection appears only when you move', note: 'the sky leaves fingerprints even where nothing has fallen', distanceM: 120, distanceLabel: '120 m', turn: 'left', minutesRemaining: 31, active: true, observed: false },
    });

    expect(candidates.slice(0, 4).map((candidate) => candidate.label)).toEqual([
      'Season Fall: glass-rain shoal',
      'Season Note: star-glass glimmer',
      'Season Note: tide-bell hush',
      'North Gate',
    ]);
    const plan = createRoutePlanFromGuides(seasonGuides, 0, 4, 360, 5)!;
    expect(plan.legs?.map((leg) => `${leg.sourceKind}:${leg.label}`)).toEqual([
      'skyfall:Season Fall: glass-rain shoal',
      'murmur:Season Note: star-glass glimmer',
      'murmur:Season Note: tide-bell hush',
    ]);
    expect(plan.legs?.[0].detail).toBe('season fall · pale shard halo · 42m left');
    expect(deferActiveRoutePlanLeg(plan)).toMatchObject({ ok: false, reason: 'locked', label: 'Season Fall: glass-rain shoal' });
    expect(removeActiveRoutePlanLeg(plan)).toMatchObject({ ok: false, reason: 'locked', label: 'Season Fall: glass-rain shoal' });
    expect(routePlanSignal(plan, centers, frame, 0, [1, 0, 0], 100)).toMatchObject({
      label: 'Season Fall: glass-rain shoal',
      legCount: 3,
      message: 'planned stop 1/3 · 157 m ahead · Season Fall: glass-rain shoal',
    });
  });

  it('promotes unread season afterglows as routeable world consequences', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    const afterglow = {
      tile: 1,
      id: 77,
      label: 'orange fall line afterglow',
      detail: 'fall claimed + 3/3 notes resolved at emberfall crater',
      note: 'the fall and three murmurs hold one remembered path',
      routeHint: 'read the crater echo before the window fades',
      read: false,
      distanceM: 157,
      distanceLabel: '157 m',
      turn: 'ahead' as const,
      focusMinutes: 420,
    };
    const plan = planExpedition({
      signal: null,
      items: {},
      survival: { stamina: 92, exposure: 6, mealsEaten: 0 },
    });
    const slate = routeSlate({
      chart: null,
      beacon: null,
      plan,
      seasonAfterglow: afterglow,
    });
    expect(slate.primary).toMatchObject({
      id: 'seasonAfterglow',
      label: 'orange fall line afterglow',
      ready: true,
    });
    expect(slate.primary?.detail).toContain('focus 420m');

    const candidates = routeGuideCandidates({
      chart: signal,
      beacon: null,
      seasonAfterglow: afterglow,
    });
    expect(candidates[0]).toMatchObject({
      kind: 'seasonAfterglow',
      targetTile: 1,
      label: 'orange fall line afterglow',
      priority: 129,
    });

    const saved = createRoutePlanFromGuide(candidates[0], 0, 4, 360)!;
    expect(saved).toMatchObject({
      sourceKind: 'seasonAfterglow',
      targetTile: 1,
      label: 'orange fall line afterglow',
      detail: 'read the crater echo before the window fades · focus 420m',
    });
    expect(normalizeRoutePlan(saved, 4)).toMatchObject({ sourceKind: 'seasonAfterglow', targetTile: 1 });
    expect(routeGuideCandidates({ chart: signal, beacon: null, seasonAfterglow: { ...afterglow, read: true } })[0].kind).toBe('target');
  });

  it('shows the orbit atlas only for globe zooms unless the path was deliberately planned', () => {
    expect(routeAtlasVisible(null, 900)).toBe(false);
    expect(routeAtlasVisible({ kind: 'skyfall' }, 120)).toBe(false);
    expect(routeAtlasVisible({ kind: 'skyfall' }, 140)).toBe(true);
    expect(routeAtlasVisible({ kind: 'planned' }, 0)).toBe(true);
    expect(routeAtlasVisible({ kind: 'planned' }, Number.NaN)).toBe(true);
  });

  it('still produces local route pins without the Horizon Chart', () => {
    const plan = planExpedition({
      signal: null,
      items: {},
      survival: { stamina: 96, exposure: 2, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'no home', protected: false, functional: false },
    });
    const slate = routeSlate({
      chart: null,
      beacon: null,
      plan,
      cave: { kind: 'seaCave', distance: 0, depth: 6.25, flooded: true },
      waystones: [{ tile: 3, mark: 'shore', label: 'shore waystone', distanceLabel: '22 m', turn: 'left' }],
      forage: { kind: 'caveMushroom', label: 'cave mushroom shelf', strength: 0.66 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
    });

    expect(slate.title).toBe('Local Route Slate');
    expect(slate.primary).toMatchObject({ id: 'cave', label: 'sea cave', ready: true });
    expect(slate.pins.find((pin) => pin.id === 'prep')?.detail).toContain('Horizon Chart');
    expect(slate.pins.find((pin) => pin.id === 'cave')?.detail).toBe('here · depth 6.3 m · flooded');
    expect(slate.pins.find((pin) => pin.id === 'waystone')?.label).toBe('shore waystone');
  });

  it('surfaces nearby native hazards and helpers as route work', () => {
    const plan = planExpedition({
      signal: null,
      items: {},
      survival: { stamina: 96, exposure: 2, mealsEaten: 0 },
      weather: { kind: 'clear', label: 'clear', intensity: 0, exposureRate: -0.2, staminaRegen: 1 },
      home: { label: 'no home', protected: false, functional: false },
    });
    const slate = routeSlate({
      chart: null,
      beacon: null,
      plan,
      cave: { kind: 'dryCave', distance: 0, depth: 8.25, flooded: false },
      nativeLife: [
        {
          kind: 'screeSnapper',
          label: 'slate-back scree-snapper',
          detail: 'a flat rocky snapper hiding under loose scree',
          temperament: 'combative',
          rewardLabel: 'scree plates',
          rewardCount: 4,
          hint: 'stun with blade, hatchet, axe, or whistling arrow',
          distanceLabel: '9 m',
          turn: 'right',
          telegraph: 'shell plates lift before the snap',
          weakness: 'short blade, hatchet, axe, or whistling arrow',
          result: 'stun once, then it flees under the scree',
        },
        {
          kind: 'caveBlinker',
          label: 'cave blinker',
          detail: 'a harmless cave helper with sleepy glow eyes',
          temperament: 'harmless',
          rewardLabel: 'blinkcap mushroom',
          rewardCount: 1,
          hint: 'match its blink rhythm for cave-focus breath',
          distanceLabel: '12 m',
          turn: 'left',
        },
      ],
    });

    expect(slate.primary).toMatchObject({ id: 'nativeHazard', label: 'slate-back scree-snapper', ready: true });
    expect(slate.pins.find((pin) => pin.id === 'nativeHazard')?.detail).toBe('9 m right · shell plates lift before the snap · answer: short blade, hatchet, axe, or whistling arrow · +4 scree plates');
    expect(slate.pins.find((pin) => pin.id === 'nativeLife')?.detail).toBe('12 m left · a harmless cave helper with sleepy glow eyes · tend: match its blink rhythm for cave-focus breath · +1 blinkcap mushroom');

    const crowded = routeSlate({
      chart: null,
      beacon: null,
      plan,
      nativeLife: [
        ...Array.from({ length: 4 }, (_, i) => ({
          kind: 'stormBurr',
          label: `storm burr ${i + 1}`,
          detail: 'a wind burr leaning into weather',
          temperament: 'territorial' as const,
          rewardLabel: 'wind-burr fibers',
          rewardCount: 2,
          hint: 'brace with cloak, blade, hatchet, axe, or arrow',
          distanceLabel: `${8 + i} m`,
          turn: 'left' as const,
        })),
        {
          kind: 'reedbackGrazer',
          label: 'reedback grazer',
          detail: 'a sheepish shore grazer carrying compost',
          temperament: 'harmless',
          rewardLabel: 'compost pellet',
          rewardCount: 1,
          hint: 'scratch its reed mane for compost',
          distanceLabel: '14 m',
          turn: 'right',
        },
      ],
    });
    expect(crowded.pins.filter((pin) => pin.id === 'nativeHazard')).toHaveLength(2);
    expect(crowded.pins.find((pin) => pin.id === 'nativeLife')?.label).toBe('reedback grazer');
  });

  it('promotes unread cave resonances above generic cave pins', () => {
    const plan = planExpedition({
      signal: null,
      items: { echoLantern: 1 },
      survival: { stamina: 96, exposure: 2, mealsEaten: 0 },
    });
    const slate = routeSlate({
      chart: null,
      beacon: null,
      plan,
      cave: { kind: 'dryCave', distance: 0, depth: 12.5, flooded: false },
      caveResonance: {
        tile: 12,
        label: 'stone-bell seam',
        detail: 'a bell tone repeats from one hex face to the next',
        note: 'some rocks ring as if they were placed around an older passage',
        rewardLabel: 'glow crystal',
        rewardCount: 2,
        observed: false,
      },
    });

    expect(slate.primary).toMatchObject({
      id: 'caveResonance',
      label: 'stone-bell seam',
      ready: true,
    });
    expect(slate.pins.find((pin) => pin.id === 'caveResonance')?.detail).toBe('a bell tone repeats from one hex face to the next · +2 glow crystal');
    expect(slate.pins.find((pin) => pin.id === 'cave')).toMatchObject({ label: 'dry cave' });
  });

  it('selects a visible route guide target without drawing zero-length local pins', () => {
    const signal = nextHorizonChartSignal(landmarks, new Set([1]), centers, frame, 0, [1, 0, 0], 100)!;
    expect(routeGuide({
      chart: signal,
      beacon: null,
      waystones: [{ tile: 3, mark: 'cave', label: 'cave waystone', distanceLabel: '84 m', turn: 'right' }],
      cave: { tile: 0, kind: 'seaCave', distance: 0, depth: 6, flooded: true },
    })).toMatchObject({ kind: 'target', targetTile: 2, label: 'North Gate' });

    expect(routeGuide({
      chart: null,
      beacon: null,
      waystones: [{ tile: 3, mark: 'cave', label: 'cave waystone', distanceLabel: '84 m', turn: 'right' }],
      caveAnchors: [{ tile: 2, kind: 'dryCave', label: 'anchored basalt throat', distanceM: 112, distanceLabel: '112 m', turn: 'left', depth: 12.75, flooded: false }],
      skyfall: { tile: 1, kind: 'glassRain', label: 'glass-rain shoal', detail: 'sand fused into pale window-glass ribs', omenLabel: 'pale shard halo', omenDetail: 'a thin ring of sky-glass glints above the fall', rewardLabel: 'sand', rewardCount: 6, distanceM: 140, distanceLabel: '140 m', turn: 'ahead', minutesRemaining: 42, active: true, harvested: false },
      murmur: { tile: 2, kind: 'starGlass', label: 'star-glass glimmer', detail: 'a faint shard reflection appears only when you move', note: 'the sky leaves fingerprints even where nothing has fallen', distanceM: 120, distanceLabel: '120 m', turn: 'left', minutesRemaining: 31, active: true, observed: false },
      cave: { tile: 0, kind: 'seaCave', distance: 0, depth: 6, flooded: true },
    })).toMatchObject({ kind: 'skyfall', targetTile: 1, label: 'glass-rain shoal', detail: '140 m ahead · pale shard halo · 42m left' });

    expect(routeGuide({
      chart: null,
      beacon: null,
      waystones: [{ tile: 3, mark: 'cave', label: 'cave waystone', distanceLabel: '84 m', turn: 'right' }],
      caveAnchors: [{ tile: 2, kind: 'dryCave', label: 'anchored basalt throat', distanceM: 4, distanceLabel: '4 m', turn: 'left', depth: 12.75, flooded: false }],
      cave: { tile: 0, kind: 'seaCave', distance: 0, depth: 6, flooded: true },
    })).toMatchObject({ kind: 'waystone', targetTile: 3, label: 'cave waystone' });

    expect(routeGuide({
      chart: null,
      beacon: null,
      waystones: [],
      murmur: { tile: 2, kind: 'starGlass', label: 'star-glass glimmer', detail: 'a faint shard reflection appears only when you move', note: 'the sky leaves fingerprints even where nothing has fallen', distanceM: 120, distanceLabel: '120 m', turn: 'left', minutesRemaining: 31, active: true, observed: false },
      cave: { tile: 0, kind: 'seaCave', distance: 0, depth: 6, flooded: true },
    })).toMatchObject({ kind: 'murmur', targetTile: 2, label: 'star-glass glimmer' });

    expect(routeGuide({
      chart: null,
      beacon: null,
      waystones: [],
      cave: { tile: 0, kind: 'seaCave', distance: 0, depth: 6, flooded: true },
    })).toBeNull();
  });

  it('turns nearby native encounters into route guide and itinerary targets', () => {
    const nativeHazard = {
      tile: 4,
      kind: 'screeSnapper',
      label: 'scree-snapper',
      detail: 'a low rock native beside the cave route',
      temperament: 'combative' as const,
      rewardLabel: 'scree plates',
      rewardCount: 3,
      distanceM: 24,
      distanceLabel: '24 m',
      turn: 'right' as const,
      hint: 'watch its jaw wind-up',
      telegraph: 'shell plates lift before the snap',
      weakness: 'short blade, hatchet, axe, or whistling arrow',
      result: 'stun once, then it flees under the scree',
    };
    const seasonGuide = {
      kind: 'skyfall' as const,
      targetTile: 2,
      label: 'Season Fall: emberfall crater',
      detail: '140 m ahead · season fall · orange line',
      priority: 126,
    };
    const guide = routeGuide({
      chart: null,
      beacon: null,
      seasonGuides: [seasonGuide],
      nativeLife: [nativeHazard],
    });

    expect(guide).toMatchObject({
      kind: 'nativeHazard',
      targetTile: 4,
      label: 'scree-snapper',
      detail: '24 m right · answer: short blade, hatchet, axe, or whistling arrow · +3 scree plates',
    });
    const saved = createRoutePlanFromGuide(guide, 0, 5, 600)!;
    expect(saved).toMatchObject({
      sourceKind: 'nativeHazard',
      targetTile: 4,
      label: 'scree-snapper',
    });
    expect(saved.detail).toContain('answer: short blade, hatchet, axe, or whistling arrow');

    expect(routeGuide({
      chart: null,
      beacon: null,
      seasonGuides: [seasonGuide],
      nativeLife: [{ ...nativeHazard, warded: true }],
    })).toMatchObject({ kind: 'skyfall', label: 'Season Fall: emberfall crater' });

    expect(routeGuide({
      chart: null,
      beacon: null,
      nativeLife: [{
        tile: 5,
        kind: 'reedbackGrazer',
        label: 'reedback grazer',
        detail: 'a sheepish shore grazer',
        temperament: 'harmless',
        rewardLabel: 'compost pellet',
        rewardCount: 1,
        distanceM: 32,
        distanceLabel: '32 m',
        turn: 'left',
        hint: 'scratch its reed mane for compost; gardens near water grow better',
      }],
    })).toMatchObject({
      kind: 'nativeLife',
      targetTile: 5,
      detail: '32 m left · tend: scratch its reed mane for compost · +1 compost pellet',
    });
  });
});
