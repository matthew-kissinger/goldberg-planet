import type { InventoryItems, ItemId } from './crafting';
import type { PlaceableItemId, StructureSave } from './structures';

export interface GoldbergTopology {
  count: number;
  degreeOf(id: number): number;
}

export interface PentagonDomainTopology {
  degreeOf(id: number): number;
  neighbor(id: number, edge: number): number;
}

export type PentagonInsightEffect =
  | 'hearth'
  | 'weather'
  | 'tide'
  | 'light'
  | 'root'
  | 'stone'
  | 'cold'
  | 'glass'
  | 'storm'
  | 'water'
  | 'cave'
  | 'horizon';

export interface PentagonInsightReward {
  item: ItemId;
  count: number;
  label: string;
}

export interface PentagonInsight {
  id: string;
  label: string;
  effect: PentagonInsightEffect;
  detail: string;
  reward: readonly PentagonInsightReward[];
}

export interface PentagonLandmark {
  index: number;
  tile: number;
  name: string;
  clue: string;
  insight?: PentagonInsight;
  discovered: boolean;
}

export interface PentagonDiscoveryResult {
  ok: boolean;
  alreadyKnown: boolean;
  landmark?: PentagonLandmark;
  discovered: number[];
  count: number;
  total: number;
  message: string;
}

export interface PentagonInsightReport {
  count: number;
  total: number;
  insights: PentagonInsight[];
  ids: string[];
  labels: string[];
  effects: PentagonInsightEffect[];
  label: string;
  prepLabel: string;
}

export interface PentagonDomainProfile {
  label: string;
  challenge: string;
  boon: string;
  routeHint: string;
}

export interface PentagonDomainReport {
  tile: number;
  originTile: number;
  ring: number;
  radius: number;
  intensity: number;
  discovered: boolean;
  landmark: PentagonLandmark;
  effect: PentagonInsightEffect;
  label: string;
  domainLabel: string;
  challenge: string;
  boon: string;
  routeHint: string;
}

export type PentagonLandscapeSilhouette =
  | 'hearth-ring'
  | 'rain-fins'
  | 'salt-ribs'
  | 'lantern-spires'
  | 'root-knuckles'
  | 'red-scree'
  | 'snow-steps'
  | 'glass-teeth'
  | 'storm-prongs'
  | 'reed-crown'
  | 'bell-stones'
  | 'horizon-vanes';

export interface PentagonLandscapeProfile {
  index: number;
  effect: PentagonInsightEffect;
  label: string;
  silhouette: PentagonLandscapeSilhouette;
  terrainCue: string;
  ribCount: number;
  markerCount: number;
  markerHeight: number;
}

export type PentagonExpeditionSiteKind =
  | 'hearthNiche'
  | 'rainBlind'
  | 'tideDock'
  | 'lanternLookout'
  | 'rootShelter'
  | 'screeCut'
  | 'snowClock'
  | 'glassTerrace'
  | 'stormBlind'
  | 'reedSpring'
  | 'bellCave'
  | 'horizonGate';

export interface PentagonExpeditionSiteProfile {
  kind: PentagonExpeditionSiteKind;
  label: string;
  problem: string;
  opportunity: string;
  buildHint: string;
  routeHint: string;
  wonder: string;
}

export interface PentagonExpeditionSiteReport {
  tile: number;
  originTile: number;
  ring: number;
  radius: number;
  intensity: number;
  discovered: boolean;
  landmark: PentagonLandmark;
  effect: PentagonInsightEffect;
  landscape: PentagonLandscapeProfile;
  kind: PentagonExpeditionSiteKind;
  label: string;
  siteLabel: string;
  problem: string;
  opportunity: string;
  buildHint: string;
  routeHint: string;
  wonder: string;
}

export type PentagonSiteStructureState = 'present' | 'lit' | 'home' | 'forecast' | 'waystone' | 'anchor' | 'planted' | 'water' | 'provisions';

export interface PentagonSiteRequirement {
  id: string;
  label: string;
  structure?: PlaceableItemId;
  state?: PentagonSiteStructureState;
  carried?: ItemId;
  count?: number;
}

export interface PentagonSiteWorkPlan {
  kind: PentagonExpeditionSiteKind;
  label: string;
  summary: string;
  completion: string;
  requirements: PentagonSiteRequirement[];
  reward: { item: ItemId; count: number; label: string };
}

export interface PentagonSiteRequirementStatus extends PentagonSiteRequirement {
  satisfied: boolean;
}

export interface PentagonSiteWorkStatus {
  site: PentagonExpeditionSiteReport;
  plan: PentagonSiteWorkPlan;
  completed: boolean;
  ready: boolean;
  requirements: PentagonSiteRequirementStatus[];
  missing: PentagonSiteRequirementStatus[];
  reward: { item: ItemId; count: number; label: string };
  label: string;
  detail: string;
}

export interface PentagonSiteCompletionResult {
  ok: boolean;
  alreadyComplete: boolean;
  status: PentagonSiteWorkStatus;
  message: string;
  reward?: { item: ItemId; count: number; label: string };
}

export type PentagonSiteThresholdKind = 'arch' | 'caveMouth' | 'terrace' | 'weatherPocket' | 'springMouth' | 'sealedChamber' | 'gate';

export type PentagonSiteThresholdShape = 'lowArch' | 'fins' | 'underpass' | 'skylight' | 'rootRoom' | 'cutGate' | 'steppedTerrace' | 'glassLedge' | 'stormPocket' | 'springMouth' | 'bellChamber' | 'vaneGate';

export interface PentagonSiteThresholdProfile {
  kind: PentagonSiteThresholdKind;
  shape: PentagonSiteThresholdShape;
  dormantLabel: string;
  openLabel: string;
  landform: string;
  sealedDetail: string;
  openDetail: string;
  routeHint: string;
  traversal: string;
  wonder: string;
}

export interface PentagonSiteThresholdReport {
  tile: number;
  originTile: number;
  ring: number;
  radius: number;
  discovered: boolean;
  completed: boolean;
  open: boolean;
  landmark: PentagonLandmark;
  site: PentagonExpeditionSiteReport;
  kind: PentagonSiteThresholdKind;
  shape: PentagonSiteThresholdShape;
  label: string;
  dormantLabel: string;
  openLabel: string;
  landform: string;
  detail: string;
  routeHint: string;
  traversal: string;
  wonder: string;
}

export type PentagonSiteThresholdEffectKind =
  | 'homewardWarmth'
  | 'weatherShelter'
  | 'tideRun'
  | 'routeSight'
  | 'rootCache'
  | 'toolPass'
  | 'coldRest'
  | 'stormWatch'
  | 'springWater'
  | 'caveListening'
  | 'returnGate';

export interface PentagonSiteThresholdEffectReport {
  kind: PentagonSiteThresholdEffectKind;
  label: string;
  detail: string;
  routePrep?: 'home' | 'weather' | 'food' | 'tools' | 'light' | 'cave' | 'travel';
  survival: {
    staminaRegenBonus?: number;
    exposureRateDelta?: number;
    weatherExposureMultiplier?: number;
    caveExposureMultiplier?: number;
    recoveryBonus?: number;
  };
  fishBoost?: number;
  forageBoost?: number;
}

export type PentagonSiteThresholdTerrainRole = 'underpass' | 'chamber' | 'terrace' | 'weatherPocket' | 'gate';

export interface PentagonSiteThresholdTerrainSpec {
  role: PentagonSiteThresholdTerrainRole;
  label: string;
  detail: string;
  carveDepthCells: number;
  tileSpan: number;
}

export type PentagonThresholdChamberKind =
  | 'hearthAlcove'
  | 'rainHollow'
  | 'tideCrawl'
  | 'lanternShaft'
  | 'rootPocket'
  | 'screeNotch'
  | 'snowShelf'
  | 'glassShelf'
  | 'stormSeat'
  | 'springSeep'
  | 'bellThroat'
  | 'horizonSlot';

export interface PentagonThresholdChamberReward {
  item: ItemId;
  count: number;
  label: string;
}

export interface PentagonThresholdChamberProfile {
  kind: PentagonThresholdChamberKind;
  label: string;
  detail: string;
  note: string;
  reward: PentagonThresholdChamberReward;
}

export interface PentagonThresholdChamberSite {
  id: number;
  tile: number;
  landmarkTile: number;
  landmarkIndex: number;
  landmarkName: string;
  siteLabel: string;
  thresholdLabel: string;
  role: PentagonSiteThresholdTerrainRole;
  kind: PentagonThresholdChamberKind;
  label: string;
  detail: string;
  note: string;
  reward: PentagonThresholdChamberReward;
  open: boolean;
  observed: boolean;
  hint: string;
}

export interface PentagonThresholdChamberObserveResult {
  ok: boolean;
  site: PentagonThresholdChamberSite;
  item?: ItemId;
  count?: number;
  message: string;
  firstObservation: boolean;
}

const NAMES = [
  'First Hearth',
  'Rainward Gate',
  'Salt Mirror',
  'High Lantern',
  'Root Vault',
  'Red Cairn',
  'Snow Dial',
  'Glass Shoal',
  'Storm Seat',
  'Reed Crown',
  'Deep Bell',
  'Last Horizon',
] as const;

const CLUES = [
  'The warm way home is also the first bearing.',
  'Clouds bend before the second point answers.',
  'Where salt reflects the sky, the shore remembers.',
  'A high light can be seen before it is understood.',
  'Roots find rooms the rain never reaches.',
  'The red stone listens for tools, not words.',
  'Snow keeps time differently on the small world.',
  'Glass begins as sand, then becomes a window outward.',
  'Storms do not wander randomly around a sphere.',
  'Reeds mark water that travels below the land.',
  'A bell under stone is quieter than a footprint.',
  'The last horizon is only first from another side.',
] as const;

const INSIGHTS: readonly PentagonInsight[] = [
  {
    id: 'hearthMemory',
    label: 'Hearth Memory',
    effect: 'hearth',
    detail: 'Shelters read warmer return paths and count harder against expedition fear.',
    reward: [{ item: 'campfire', count: 1, label: 'campfire kit' }],
  },
  {
    id: 'rainReading',
    label: 'Rain Reading',
    effect: 'weather',
    detail: 'Cloud fronts become more predictable before distant travel.',
    reward: [{ item: 'roofBundle', count: 2, label: 'roof bundles' }],
  },
  {
    id: 'saltTide',
    label: 'Salt Tide',
    effect: 'tide',
    detail: 'Shore routes need less packed food because fish runs are easier to read.',
    reward: [{ item: 'bait', count: 3, label: 'bait' }],
  },
  {
    id: 'highLantern',
    label: 'High Lantern',
    effect: 'light',
    detail: 'Tall lights and cave lights become part of the same route language.',
    reward: [{ item: 'lantern', count: 1, label: 'lantern' }],
  },
  {
    id: 'rootListening',
    label: 'Root Listening',
    effect: 'root',
    detail: 'Plant and forage knowledge stretches food for long walks.',
    reward: [{ item: 'seeds', count: 2, label: 'berry seeds' }],
  },
  {
    id: 'redStone',
    label: 'Red Stone',
    effect: 'stone',
    detail: 'Tool routes can be judged from stone color and cave wall tone.',
    reward: [{ item: 'stonePick', count: 1, label: 'stone pick' }],
  },
  {
    id: 'snowTime',
    label: 'Snow Time',
    effect: 'cold',
    detail: 'Cold ridges become weather clocks instead of only exposure hazards.',
    reward: [{ item: 'snowHerb', count: 2, label: 'snow herbs' }],
  },
  {
    id: 'glassWake',
    label: 'Glass Wake',
    effect: 'glass',
    detail: 'Sand, windows, and shore visibility start linking home to the horizon.',
    reward: [{ item: 'windowFrame', count: 1, label: 'window frame' }],
  },
  {
    id: 'stormSeat',
    label: 'Storm Seat',
    effect: 'storm',
    detail: 'Storm routes can be timed instead of blindly avoided.',
    reward: [{ item: 'campMeal', count: 1, label: 'camp meal' }],
  },
  {
    id: 'reedWater',
    label: 'Reed Water',
    effect: 'water',
    detail: 'Reeds hint at water moving under land and safer wet-cave approaches.',
    reward: [{ item: 'kelp', count: 2, label: 'kelp' }],
  },
  {
    id: 'deepBell',
    label: 'Deep Bell',
    effect: 'cave',
    detail: 'Cave resonance can be read from crystal and stone pressure.',
    reward: [{ item: 'glowCrystal', count: 2, label: 'glow crystals' }],
  },
  {
    id: 'lastBearing',
    label: 'Last Bearing',
    effect: 'horizon',
    detail: 'The last route makes the planet feel smaller without making it flat.',
    reward: [{ item: 'waystone', count: 2, label: 'waystones' }],
  },
] as const;

const DOMAIN_PROFILES: Record<PentagonInsightEffect, PentagonDomainProfile> = {
  hearth: {
    label: 'warm-ring ground',
    challenge: 'safe-feeling land can still ask for a real hearth',
    boon: 'shelter and home signals read more clearly here',
    routeHint: 'good place to begin or end an expedition',
  },
  weather: {
    label: 'rainward grass',
    challenge: 'rain fronts gather early around the landmark',
    boon: 'weather can be read before it fully arrives',
    routeHint: 'watch clouds before leaving home',
  },
  tide: {
    label: 'salt-tide shore',
    challenge: 'shore routes pull food planning toward water',
    boon: 'fish schools and bait runs become easier to find',
    routeHint: 'walk the waterline before crossing inland',
  },
  light: {
    label: 'high-lantern ridge',
    challenge: 'height and shadow make distance deceptive',
    boon: 'lanterns and glow paths are easier to judge',
    routeHint: 'look for the next bearing from higher ground',
  },
  root: {
    label: 'root-vault hollow',
    challenge: 'food hides in pockets instead of open fields',
    boon: 'berries, seeds, and forage cluster near the shrine',
    routeHint: 'circle the roots before committing to travel',
  },
  stone: {
    label: 'red-stone scree',
    challenge: 'rocky routes want tools before shortcuts',
    boon: 'stone and cave-wall readings improve tool planning',
    routeHint: 'pack a pick or read the stone color',
  },
  cold: {
    label: 'snow-dial slope',
    challenge: 'cold arrives below the usual snowline',
    boon: 'snow herbs and cold timing become more predictable',
    routeHint: 'treat the ridge as a clock before storms',
  },
  glass: {
    label: 'glass-shoal glare',
    challenge: 'bright sand can hide the real route edge',
    boon: 'shore visibility and window materials are easier to read',
    routeHint: 'use reflections to line up the next bearing',
  },
  storm: {
    label: 'storm-seat air',
    challenge: 'squalls cross the area more often than elsewhere',
    boon: 'storm timing can become a tool instead of a stop sign',
    routeHint: 'wait, fish, or fly with the front instead of against it',
  },
  water: {
    label: 'reed-water hollow',
    challenge: 'wet routes may travel below the land',
    boon: 'kelp, reeds, and sea-cave approaches become more legible',
    routeHint: 'follow reed lines toward hidden water',
  },
  cave: {
    label: 'deep-bell stone',
    challenge: 'nearby rock hints at pressure below the surface',
    boon: 'cave resonance and glow-crystal routes become clearer',
    routeHint: 'listen for entrances before digging straight down',
  },
  horizon: {
    label: 'last-bearing rise',
    challenge: 'the obvious way around may not be the shortest story',
    boon: 'long routes and waystones line up more confidently',
    routeHint: 'look across the curve, then mark the return path',
  },
};

const LANDSCAPE_PROFILES: Record<PentagonInsightEffect, Omit<PentagonLandscapeProfile, 'index' | 'effect'>> = {
  hearth: {
    label: 'hearthstone apron',
    silhouette: 'hearth-ring',
    terrainCue: 'five low hearthstones make the safe ground readable before the shrine is used',
    ribCount: 5,
    markerCount: 5,
    markerHeight: 0.72,
  },
  weather: {
    label: 'rainward fin field',
    silhouette: 'rain-fins',
    terrainCue: 'leaning fins point into the weather instead of only coloring the grass',
    ribCount: 6,
    markerCount: 4,
    markerHeight: 1.18,
  },
  tide: {
    label: 'salt-rib shoal',
    silhouette: 'salt-ribs',
    terrainCue: 'pale ribs comb the ground like a stranded tide mark',
    ribCount: 7,
    markerCount: 5,
    markerHeight: 0.88,
  },
  light: {
    label: 'high-lantern spires',
    silhouette: 'lantern-spires',
    terrainCue: 'tall needle stones make height and sightline part of the landmark',
    ribCount: 5,
    markerCount: 3,
    markerHeight: 1.78,
  },
  root: {
    label: 'root-knuckle hollow',
    silhouette: 'root-knuckles',
    terrainCue: 'rounded knots and short ribs imply rooms under the soil',
    ribCount: 6,
    markerCount: 6,
    markerHeight: 0.62,
  },
  stone: {
    label: 'red-scree fan',
    silhouette: 'red-scree',
    terrainCue: 'angular stones point tool routes toward the shrine',
    ribCount: 8,
    markerCount: 5,
    markerHeight: 1.02,
  },
  cold: {
    label: 'snow-step dial',
    silhouette: 'snow-steps',
    terrainCue: 'stepped plates make the cold domain read like a clock face',
    ribCount: 6,
    markerCount: 6,
    markerHeight: 0.78,
  },
  glass: {
    label: 'glass-tooth glare',
    silhouette: 'glass-teeth',
    terrainCue: 'thin bright teeth catch the light like sand that became a window',
    ribCount: 5,
    markerCount: 7,
    markerHeight: 1.1,
  },
  storm: {
    label: 'storm-prong seat',
    silhouette: 'storm-prongs',
    terrainCue: 'jagged prongs frame the air where squalls cross the planet',
    ribCount: 7,
    markerCount: 4,
    markerHeight: 1.48,
  },
  water: {
    label: 'reed-crown wetline',
    silhouette: 'reed-crown',
    terrainCue: 'thin reed posts trace hidden water movement near the shrine',
    ribCount: 8,
    markerCount: 8,
    markerHeight: 1.0,
  },
  cave: {
    label: 'deep-bell stones',
    silhouette: 'bell-stones',
    terrainCue: 'heavy stones leave a low ring that feels louder underfoot than above it',
    ribCount: 5,
    markerCount: 5,
    markerHeight: 1.26,
  },
  horizon: {
    label: 'last-bearing vanes',
    silhouette: 'horizon-vanes',
    terrainCue: 'long vanes point across the curve instead of toward a flat compass',
    ribCount: 9,
    markerCount: 5,
    markerHeight: 1.36,
  },
};

const EXPEDITION_SITE_PROFILES: Record<PentagonInsightEffect, PentagonExpeditionSiteProfile> = {
  hearth: {
    kind: 'hearthNiche',
    label: 'hearth niche',
    problem: 'safe-looking ground still fails without an actual bed, fire, storage, and roof',
    opportunity: 'a compact home ring for first shelters and return-trip recovery',
    buildHint: 'build bedroll + lit campfire + chest inside the apron',
    routeHint: 'return here when a trip needs a dependable reset',
    wonder: 'the stones feel arranged for a home that has not been built yet',
  },
  weather: {
    kind: 'rainBlind',
    label: 'rain-reading blind',
    problem: 'cloud fronts arrive before the route is ready',
    opportunity: 'a place to mount weather vanes and wait for a safer travel window',
    buildHint: 'place roof bundles and a weather vane between the fins',
    routeHint: 'read the sky here before crossing exposed ground',
    wonder: 'the fins lean into wind that has not reached the grass',
  },
  tide: {
    kind: 'tideDock',
    label: 'salt dock cut',
    problem: 'food runs drift toward shore and can strand inland travelers',
    opportunity: 'a dock-and-rack campsite for bait, fish, and preserved rations',
    buildHint: 'build dock segment + drying rack near the salt ribs',
    routeHint: 'fish and preserve before turning inland',
    wonder: 'the ribs count tides even where the water has already pulled away',
  },
  light: {
    kind: 'lanternLookout',
    label: 'lantern lookout',
    problem: 'height makes the next cave or route marker deceptive',
    opportunity: 'a sightline camp where lanterns, cave anchors, and route marks line up',
    buildHint: 'place lantern + waystone where the spires frame the horizon',
    routeHint: 'survey from the ridge before committing to a cave route',
    wonder: 'the spires hold light like a map pin suspended above the sphere',
  },
  root: {
    kind: 'rootShelter',
    label: 'root shelter hollow',
    problem: 'food hides under cover instead of in open fields',
    opportunity: 'a tucked farm pocket for crop plots, compost, and root-cellar provisions',
    buildHint: 'build crop plot + compost bin + root cellar in the hollow',
    routeHint: 'circle the roots for food before a long walk',
    wonder: 'the knuckles make small rooms before anyone digs them',
  },
  stone: {
    kind: 'screeCut',
    label: 'red scree cut',
    problem: 'stone shortcuts punish an under-packed tool kit',
    opportunity: 'a tool camp for picks, cave anchors, and rock collection',
    buildHint: 'carry a pick and mark the best cut with a waystone',
    routeHint: 'read the red stone before mining toward a shortcut',
    wonder: 'some stones look chipped by tools the player has not made',
  },
  cold: {
    kind: 'snowClock',
    label: 'snow-clock step',
    problem: 'cold fronts arrive below the visible snowline',
    opportunity: 'a timed rest stop for warmth, herbs, and weather-safe shelter',
    buildHint: 'build roof + campfire + weather vane on the steps',
    routeHint: 'wait here when cold would turn a near route into exposure',
    wonder: 'the steps cast short shadows like a clock with no sun hands',
  },
  glass: {
    kind: 'glassTerrace',
    label: 'glass terrace',
    problem: 'glare hides the true edge between shore, sand, and route',
    opportunity: 'a window-and-waystone terrace for sightline planning',
    buildHint: 'place window frame + waystone where the teeth catch light',
    routeHint: 'align reflections before flying or walking across the glare',
    wonder: 'the teeth glitter like broken windows from a house that never stood',
  },
  storm: {
    kind: 'stormBlind',
    label: 'storm blind',
    problem: 'squalls cross the site more often than ordinary weather',
    opportunity: 'a risky shelter that can turn storms into timed departures',
    buildHint: 'build protected roof + weather vane before using the prongs as a watch post',
    routeHint: 'do not rush the front; wait, fish, or fly with it',
    wonder: 'the prongs make a chair for weather that should not be able to sit',
  },
  water: {
    kind: 'reedSpring',
    label: 'reed spring line',
    problem: 'water travels below land and can confuse cave camps',
    opportunity: 'a cistern-and-cave approach for wet routes and hidden spring water',
    buildHint: 'place rain cistern + cave anchor along the reed line',
    routeHint: 'follow reeds toward water before digging down',
    wonder: 'the reeds move as if a stream is passing under the hexes',
  },
  cave: {
    kind: 'bellCave',
    label: 'deep-bell throat',
    problem: 'digging blindly finds pressure, darkness, or water before answers',
    opportunity: 'a cave-reading station for echo lanterns, anchors, and glow crystals',
    buildHint: 'bring echo lantern + cave anchor before cutting below the bell stones',
    routeHint: 'listen first, then choose a dry or sea-cave approach',
    wonder: 'the stones ring in the feet instead of the ears',
  },
  horizon: {
    kind: 'horizonGate',
    label: 'last-bearing gate',
    problem: 'the obvious route around the sphere may waste a return trip',
    opportunity: 'a long-route planning gate for waystones, charts, and packed provisions',
    buildHint: 'set waystones and stage food before leaving the vanes',
    routeHint: 'mark the return path before chasing the final horizon',
    wonder: 'the vanes disagree just enough to prove the world is round',
  },
};

const SITE_WORK_PLANS: Record<PentagonExpeditionSiteKind, Omit<PentagonSiteWorkPlan, 'kind' | 'label'>> = {
  hearthNiche: {
    summary: 'prove the first home ring can really reset an expedition',
    completion: 'hearth niche complete',
    requirements: [
      { id: 'home-bedroll', label: 'claimed bedroll', structure: 'bedroll', state: 'home' },
      { id: 'lit-campfire', label: 'lit campfire', structure: 'campfire', state: 'lit' },
      { id: 'storage-chest', label: 'material chest', structure: 'chest', state: 'present' },
    ],
    reward: { item: 'expeditionStew', count: 1, label: 'expedition stew' },
  },
  rainBlind: {
    summary: 'turn the rain fins into a roofed weather station',
    completion: 'rain-reading blind complete',
    requirements: [
      { id: 'roof', label: 'roof bundle', structure: 'roofBundle', state: 'present' },
      { id: 'read-vane', label: 'read weather vane', structure: 'weatherVane', state: 'forecast' },
    ],
    reward: { item: 'trailRation', count: 1, label: 'trail ration' },
  },
  tideDock: {
    summary: 'make the salt ribs into a usable shore camp',
    completion: 'salt dock cut complete',
    requirements: [
      { id: 'dock', label: 'dock segment', structure: 'dockSegment', state: 'present' },
      { id: 'rack', label: 'drying rack', structure: 'dryingRack', state: 'present' },
      { id: 'rod', label: 'fishing rod carried', carried: 'fishingRod', count: 1 },
    ],
    reward: { item: 'rawFish', count: 2, label: 'raw fish' },
  },
  lanternLookout: {
    summary: 'make the ridge read as a visible route marker',
    completion: 'lantern lookout complete',
    requirements: [
      { id: 'lit-lantern', label: 'lit lantern', structure: 'lantern', state: 'lit' },
      { id: 'marked-waystone', label: 'attuned waystone', structure: 'waystone', state: 'waystone' },
    ],
    reward: { item: 'glowCrystal', count: 1, label: 'glow crystal' },
  },
  rootShelter: {
    summary: 'make the root hollow support food instead of just hinting at it',
    completion: 'root shelter complete',
    requirements: [
      { id: 'planted-plot', label: 'planted crop plot', structure: 'cropPlot', state: 'planted' },
      { id: 'compost-bin', label: 'compost bin', structure: 'compostBin', state: 'present' },
      { id: 'root-cellar', label: 'root cellar', structure: 'rootCellar', state: 'present' },
    ],
    reward: { item: 'seeds', count: 2, label: 'berry seeds' },
  },
  screeCut: {
    summary: 'turn the red scree into a marked tool route',
    completion: 'red scree cut complete',
    requirements: [
      { id: 'pick', label: 'stone pick carried', carried: 'stonePick', count: 1 },
      { id: 'survey-waystone', label: 'attuned waystone', structure: 'waystone', state: 'waystone' },
    ],
    reward: { item: 'rock', count: 8, label: 'route stone' },
  },
  snowClock: {
    summary: 'make the snow steps into a cold-weather rest point',
    completion: 'snow-clock step complete',
    requirements: [
      { id: 'roof', label: 'roof bundle', structure: 'roofBundle', state: 'present' },
      { id: 'warmth', label: 'lit campfire', structure: 'campfire', state: 'lit' },
      { id: 'read-vane', label: 'read weather vane', structure: 'weatherVane', state: 'forecast' },
    ],
    reward: { item: 'snowHerb', count: 2, label: 'snow herbs' },
  },
  glassTerrace: {
    summary: 'make the glare into a route-reading terrace',
    completion: 'glass terrace complete',
    requirements: [
      { id: 'window', label: 'window frame', structure: 'windowFrame', state: 'present' },
      { id: 'marked-waystone', label: 'attuned waystone', structure: 'waystone', state: 'waystone' },
    ],
    reward: { item: 'sand', count: 8, label: 'bright sand' },
  },
  stormBlind: {
    summary: 'make the prongs into a shelter that can watch storms',
    completion: 'storm blind complete',
    requirements: [
      { id: 'roof', label: 'roof bundle', structure: 'roofBundle', state: 'present' },
      { id: 'read-vane', label: 'read weather vane', structure: 'weatherVane', state: 'forecast' },
      { id: 'meal', label: 'camp meal carried', carried: 'campMeal', count: 1 },
    ],
    reward: { item: 'trailRation', count: 1, label: 'storm ration' },
  },
  reedSpring: {
    summary: 'make the reed line into a water-and-cave approach',
    completion: 'reed spring line complete',
    requirements: [
      { id: 'water', label: 'wet rain cistern', structure: 'rainCistern', state: 'water' },
      { id: 'anchor', label: 'set cave anchor', structure: 'caveAnchor', state: 'anchor' },
    ],
    reward: { item: 'kelp', count: 2, label: 'spring kelp' },
  },
  bellCave: {
    summary: 'make the bell stones into a cave-reading station',
    completion: 'deep-bell throat complete',
    requirements: [
      { id: 'anchor', label: 'set cave anchor', structure: 'caveAnchor', state: 'anchor' },
      { id: 'echo', label: 'echo lantern carried', carried: 'echoLantern', count: 1 },
    ],
    reward: { item: 'glowCrystal', count: 2, label: 'bell crystals' },
  },
  horizonGate: {
    summary: 'make the vanes into a departure gate with a marked return',
    completion: 'last-bearing gate complete',
    requirements: [
      { id: 'marked-waystone', label: 'attuned waystone', structure: 'waystone', state: 'waystone' },
      { id: 'ration', label: 'trail ration carried', carried: 'trailRation', count: 1 },
      { id: 'chart', label: 'horizon chart carried', carried: 'horizonChart', count: 1 },
    ],
    reward: { item: 'waystone', count: 1, label: 'return waystone' },
  },
};

const SITE_THRESHOLD_PROFILES: Record<PentagonExpeditionSiteKind, PentagonSiteThresholdProfile> = {
  hearthNiche: {
    kind: 'arch',
    shape: 'lowArch',
    dormantLabel: 'cold hearth lintel',
    openLabel: 'hearth arch',
    landform: 'a low stone lintel with enough space to pass beneath when the camp is lived in',
    sealedDetail: 'the lintel stays cold until bed, fire, and storage prove this is a real return point',
    openDetail: 'warm air now pulls through the lintel like a small doorway home',
    routeHint: 'duck under the hearth arch to read the first safe threshold',
    traversal: 'walk-under home arch',
    wonder: 'the arch feels built for someone who has returned from a trip you have not taken',
  },
  rainBlind: {
    kind: 'weatherPocket',
    shape: 'fins',
    dormantLabel: 'closed rain fins',
    openLabel: 'rain pocket',
    landform: 'leaning fins that make a sheltered pocket of different air',
    sealedDetail: 'the fins only hiss until a roof and read vane teach them the weather',
    openDetail: 'the pocket holds a quieter weather layer behind the rain fins',
    routeHint: 'step into the rain pocket before leaving exposed ground',
    traversal: 'sheltered weather pocket',
    wonder: 'drops bend around the pocket before they touch the grass',
  },
  tideDock: {
    kind: 'arch',
    shape: 'underpass',
    dormantLabel: 'salt undercut',
    openLabel: 'tide underpass',
    landform: 'a ribbed shore undercut sized like a crawlway under the dock camp',
    sealedDetail: 'the undercut smells of salt but stays unreadable until fish gear lives here',
    openDetail: 'tide marks under the ribs now show where water and food drift next',
    routeHint: 'pass below the salt ribs to read the tide route',
    traversal: 'shore underpass',
    wonder: 'the ribs count waves even when the sea is several hexes away',
  },
  lanternLookout: {
    kind: 'caveMouth',
    shape: 'skylight',
    dormantLabel: 'dark skylight notch',
    openLabel: 'lantern skylight',
    landform: 'a high notch that lines up lantern light, cave echoes, and horizon markers',
    sealedDetail: 'the notch looks like a crack in the sky until a light and mark agree',
    openDetail: 'the skylight throws a narrow sightline from ridge to cave-mouth routes',
    routeHint: 'sight through the lantern skylight before committing to a descent',
    traversal: 'ridge skylight line',
    wonder: 'the notch holds light like the planet briefly forgot which way is up',
  },
  rootShelter: {
    kind: 'sealedChamber',
    shape: 'rootRoom',
    dormantLabel: 'knotted root door',
    openLabel: 'root room',
    landform: 'a low root chamber tucked under the hollow, sized for food storage and starts',
    sealedDetail: 'the knots stay tight until planted food, compost, and cellar work prove the hollow',
    openDetail: 'the root room reads as a cool food pocket below the shelter',
    routeHint: 'circle into the root room before packing food for a long walk',
    traversal: 'under-root chamber',
    wonder: 'the roots make a room without admitting they are architecture',
  },
  screeCut: {
    kind: 'gate',
    shape: 'cutGate',
    dormantLabel: 'red cut seam',
    openLabel: 'scree gate',
    landform: 'a narrow red-stone cut that frames a tool route through the fan',
    sealedDetail: 'the seam looks chipped but waits for a carried pick and marked route',
    openDetail: 'the red cut points through the stone like a route you could mine toward',
    routeHint: 'line up the scree gate before cutting rock shortcuts',
    traversal: 'tool-marked stone cut',
    wonder: 'some of the chips are newer than the world should allow',
  },
  snowClock: {
    kind: 'terrace',
    shape: 'steppedTerrace',
    dormantLabel: 'sleeping snow steps',
    openLabel: 'snow terrace',
    landform: 'stepped cold terraces that hold a different time of day in each shadow',
    sealedDetail: 'the clock has no hand until roof, warmth, and weather reading line up',
    openDetail: 'the snow terrace now works as a timed rest ledge against cold routes',
    routeHint: 'wait on the snow terrace when weather makes a short route dangerous',
    traversal: 'cold-weather terrace',
    wonder: 'the steps keep time with shadows that do not match the sun',
  },
  glassTerrace: {
    kind: 'terrace',
    shape: 'glassLedge',
    dormantLabel: 'blind glass ledge',
    openLabel: 'glass terrace',
    landform: 'a bright ledge whose reflections align only from a marked viewing point',
    sealedDetail: 'the glare hides the edge until a window and waystone make a frame',
    openDetail: 'the glass ledge turns glare into a clean sightline across the curve',
    routeHint: 'stand on the glass terrace to align shore, sand, and route',
    traversal: 'reflective route terrace',
    wonder: 'the ledge reflects places that are just over the horizon',
  },
  stormBlind: {
    kind: 'weatherPocket',
    shape: 'stormPocket',
    dormantLabel: 'empty storm seat',
    openLabel: 'storm pocket',
    landform: 'a pronged weather pocket where squalls bend into a watchable chair',
    sealedDetail: 'the seat only threatens until shelter, vane, and food make waiting possible',
    openDetail: 'the pocket holds the storm edge long enough to choose a departure',
    routeHint: 'sit in the storm pocket before flying or walking with the front',
    traversal: 'storm-watch pocket',
    wonder: 'the prongs make weather feel like something that can sit beside you',
  },
  reedSpring: {
    kind: 'springMouth',
    shape: 'springMouth',
    dormantLabel: 'closed reed mouth',
    openLabel: 'reed spring mouth',
    landform: 'a wet reed mouth where hidden water seems to pass under solid land',
    sealedDetail: 'the reeds twitch but the mouth stays mute until water and a cave anchor agree',
    openDetail: 'the spring mouth now points toward wet cave routes without forcing a blind dig',
    routeHint: 'follow the reed spring mouth before cutting below land',
    traversal: 'spring-fed cave approach',
    wonder: 'the reeds move with a current you cannot see',
  },
  bellCave: {
    kind: 'sealedChamber',
    shape: 'bellChamber',
    dormantLabel: 'silent bell chamber',
    openLabel: 'deep-bell chamber',
    landform: 'a stone throat that sounds through the feet before it opens in the eye',
    sealedDetail: 'the chamber stays silent until an anchor and echo lantern give it a voice',
    openDetail: 'the bell chamber now separates pressure, darkness, and cave promise before digging',
    routeHint: 'listen at the deep-bell chamber before choosing a cave approach',
    traversal: 'echo-reading chamber',
    wonder: 'the ringing seems to come from under your own boots',
  },
  horizonGate: {
    kind: 'gate',
    shape: 'vaneGate',
    dormantLabel: 'misaligned vane gate',
    openLabel: 'horizon gate',
    landform: 'long vanes that form a gate only when a marked return route is staged',
    sealedDetail: 'the vanes disagree until chart, ration, and waystone prove the return path',
    openDetail: 'the gate now frames a long route and the way back in the same glance',
    routeHint: 'step through the horizon gate only after marking the return',
    traversal: 'long-route departure gate',
    wonder: 'the gate points at several horizons and all of them feel partly true',
  },
};

const THRESHOLD_CHAMBER_PROFILES: Record<PentagonSiteThresholdShape, PentagonThresholdChamberProfile> = {
  lowArch: {
    kind: 'hearthAlcove',
    label: 'hearth ember alcove',
    detail: 'a warm side niche just inside the first opened arch',
    note: 'the first return was prepared before the first departure',
    reward: { item: 'trailRation', count: 1, label: 'trail ration' },
  },
  fins: {
    kind: 'rainHollow',
    label: 'rain-silent hollow',
    detail: 'a pocket of still air behind the opened weather fins',
    note: 'rain has edges if you wait long enough to see them',
    reward: { item: 'roofBundle', count: 1, label: 'roof bundle' },
  },
  underpass: {
    kind: 'tideCrawl',
    label: 'tide-count crawl',
    detail: 'a low crawl where old tide lines count the shore route',
    note: 'the sea measures paths under land before feet find them',
    reward: { item: 'bait', count: 2, label: 'bait' },
  },
  skylight: {
    kind: 'lanternShaft',
    label: 'lantern shaft',
    detail: 'a short shaft where cave dark and sky light trade places',
    note: 'a light above can still belong to the cave below',
    reward: { item: 'glowCrystal', count: 1, label: 'glow crystal' },
  },
  rootRoom: {
    kind: 'rootPocket',
    label: 'root memory pocket',
    detail: 'a cool food pocket shaped by roots before tools',
    note: 'roots store directions the way people store food',
    reward: { item: 'seeds', count: 2, label: 'berry seeds' },
  },
  cutGate: {
    kind: 'screeNotch',
    label: 'red scree notch',
    detail: 'a chipped notch where tool marks point farther than they cut',
    note: 'some marks are instructions, not damage',
    reward: { item: 'rock', count: 8, label: 'rock' },
  },
  steppedTerrace: {
    kind: 'snowShelf',
    label: 'snow-shadow shelf',
    detail: 'a small cold shelf where shadows seem to pause',
    note: 'cold keeps a memory of when you should stop moving',
    reward: { item: 'snowHerb', count: 2, label: 'snow herbs' },
  },
  glassLedge: {
    kind: 'glassShelf',
    label: 'glass sight shelf',
    detail: 'a bright shelf that reflects a route just past the horizon',
    note: 'glass does not show where you are; it shows where you might stand',
    reward: { item: 'sand', count: 8, label: 'sand' },
  },
  stormPocket: {
    kind: 'stormSeat',
    label: 'storm-count seat',
    detail: 'a scooped seat where squalls arrive as pulses instead of chaos',
    note: 'weather can be listened to like a footstep',
    reward: { item: 'campMeal', count: 1, label: 'camp meal' },
  },
  springMouth: {
    kind: 'springSeep',
    label: 'reed seep pocket',
    detail: 'a damp pocket where water moves without showing its full route',
    note: 'water under land still wants to be found gently',
    reward: { item: 'kelp', count: 2, label: 'kelp' },
  },
  bellChamber: {
    kind: 'bellThroat',
    label: 'deep-bell throat',
    detail: 'a resonant throat where stone answers after your step',
    note: 'some caves open first as sound and only later as space',
    reward: { item: 'glowCrystal', count: 2, label: 'glow crystals' },
  },
  vaneGate: {
    kind: 'horizonSlot',
    label: 'return-gate slot',
    detail: 'a narrow slot that points two ways around the same world',
    note: 'the last horizon is a door if you arrive from the other side',
    reward: { item: 'waystone', count: 1, label: 'waystone' },
  },
};

export function pentagonTileIds(geo: GoldbergTopology): number[] {
  const out: number[] = [];
  for (let id = 0; id < geo.count; id++) {
    if (geo.degreeOf(id) === 5) out.push(id);
  }
  return out.sort((a, b) => a - b);
}

export function normalizePentagonList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const id = Math.trunc(value);
    if (id >= 0) seen.add(id);
  }
  return [...seen].sort((a, b) => a - b);
}

export function normalizePentagonDiscoveries(raw: unknown, pentagonTiles: readonly number[]): number[] {
  const valid = new Set(pentagonTiles);
  return normalizePentagonList(raw).filter((tile) => valid.has(tile));
}

export function normalizePentagonSiteCompletions(raw: unknown, pentagonTiles: readonly number[]): number[] {
  return normalizePentagonDiscoveries(raw, pentagonTiles);
}

export function normalizeThresholdChamberObservations(raw: unknown): number[] {
  return normalizePentagonList(raw);
}

function carriedCount(inventory: InventoryItems, item: ItemId): number {
  if (item === 'stonePick') return Math.max(0, Math.trunc(inventory.stonePick ?? 0)) + Math.max(0, Math.trunc(inventory.echoPick ?? 0));
  if (item === 'stoneAxe') return Math.max(0, Math.trunc(inventory.stoneHatchet ?? 0)) + Math.max(0, Math.trunc(inventory.stoneAxe ?? 0)) + Math.max(0, Math.trunc(inventory.echoAxe ?? 0));
  if (item === 'stoneShovel') return Math.max(0, Math.trunc(inventory.stoneShovel ?? 0)) + Math.max(0, Math.trunc(inventory.echoShovel ?? 0));
  return Math.max(0, Math.trunc(inventory[item] ?? 0));
}

function structureStateSatisfied(structure: StructureSave, state: PentagonSiteStructureState | undefined): boolean {
  if (!state || state === 'present') return true;
  const s = structure.state;
  if (state === 'lit') return s?.lit === true;
  if (state === 'home') return s?.home === true;
  if (state === 'forecast') return Math.trunc(s?.forecastReads ?? 0) > 0;
  if (state === 'waystone') return !!s?.waystone;
  if (state === 'anchor') return !!s?.anchorKind || s?.anchorTile !== undefined;
  if (state === 'planted') return !!s?.crop;
  if (state === 'water') return Math.trunc(s?.water ?? 0) > 0 || Math.trunc(s?.fills ?? 0) > 0;
  if (state === 'provisions') return Math.trunc(s?.provisions ?? 0) > 0 || Math.trunc(s?.caches ?? 0) > 0;
  return false;
}

function requirementSatisfied(req: PentagonSiteRequirement, structures: readonly StructureSave[], inventory: InventoryItems): boolean {
  if (req.carried && carriedCount(inventory, req.carried) < Math.max(1, Math.trunc(req.count ?? 1))) return false;
  if (req.structure) return structures.some((structure) => structure.item === req.structure && structureStateSatisfied(structure, req.state));
  return true;
}

export function pentagonSiteWorkPlan(kind: PentagonExpeditionSiteKind): PentagonSiteWorkPlan {
  const base = SITE_WORK_PLANS[kind];
  return { kind, label: base.completion, ...base, requirements: base.requirements.map((req) => ({ ...req })) };
}

export function evaluatePentagonSiteWork(
  site: PentagonExpeditionSiteReport,
  structures: readonly StructureSave[] = [],
  inventory: InventoryItems = {},
  completedSites: ReadonlySet<number> = new Set(),
): PentagonSiteWorkStatus {
  const plan = pentagonSiteWorkPlan(site.kind);
  const requirements = plan.requirements.map((req) => ({ ...req, satisfied: requirementSatisfied(req, structures, inventory) }));
  const missing = requirements.filter((req) => !req.satisfied);
  const completed = completedSites.has(site.tile);
  const ready = site.discovered && missing.length === 0;
  return {
    site,
    plan,
    completed,
    ready,
    requirements,
    missing,
    reward: plan.reward,
    label: completed ? `${site.label} complete` : ready ? `${site.label} ready` : `${site.label} incomplete`,
    detail: completed
      ? `${plan.completion} · ${plan.summary}`
      : ready
      ? `${plan.completion} ready · reward +${plan.reward.count} ${plan.reward.label}`
      : `${plan.summary} · needs ${missing.map((req) => req.label).join(', ')}`,
  };
}

export function completePentagonSiteWork(
  completedSites: Set<number>,
  site: PentagonExpeditionSiteReport,
  structures: readonly StructureSave[] = [],
  inventory: InventoryItems = {},
): PentagonSiteCompletionResult {
  const status = evaluatePentagonSiteWork(site, structures, inventory, completedSites);
  if (status.completed) {
    return {
      ok: true,
      alreadyComplete: true,
      status,
      message: `${status.plan.completion} already complete · ${status.plan.summary}`,
    };
  }
  if (!status.ready) {
    return {
      ok: false,
      alreadyComplete: false,
      status,
      message: status.site.discovered
        ? `${status.site.siteLabel} needs ${status.missing.map((req) => req.label).join(', ')}`
        : `awaken ${status.site.landmark.name} before working the ${status.site.siteLabel}`,
    };
  }
  completedSites.add(site.tile);
  const completedStatus = evaluatePentagonSiteWork(site, structures, inventory, completedSites);
  return {
    ok: true,
    alreadyComplete: false,
    status: completedStatus,
    reward: status.reward,
    message: `${status.plan.completion} · +${status.reward.count} ${status.reward.label} · ${status.plan.summary}`,
  };
}

export function pentagonSiteThresholdProfile(kind: PentagonExpeditionSiteKind): PentagonSiteThresholdProfile {
  return SITE_THRESHOLD_PROFILES[kind];
}

export function pentagonSiteThreshold(
  site: PentagonExpeditionSiteReport,
  completedSites: ReadonlySet<number> = new Set(),
): PentagonSiteThresholdReport {
  const profile = pentagonSiteThresholdProfile(site.kind);
  const completed = completedSites.has(site.tile);
  const discovered = site.discovered;
  const label = discovered
    ? completed ? profile.openLabel : profile.dormantLabel
    : profile.dormantLabel;
  return {
    tile: site.tile,
    originTile: site.originTile,
    ring: site.ring,
    radius: site.radius,
    discovered,
    completed,
    open: discovered && completed,
    landmark: site.landmark,
    site,
    kind: profile.kind,
    shape: profile.shape,
    label,
    dormantLabel: profile.dormantLabel,
    openLabel: profile.openLabel,
    landform: profile.landform,
    detail: !discovered
      ? `quiet ${profile.dormantLabel} · awaken ${site.landmark.name} to understand the threshold`
      : completed
      ? `${profile.openDetail} · ${profile.traversal}`
      : `${profile.sealedDetail} · complete the ${site.siteLabel} to open the threshold`,
    routeHint: discovered ? profile.routeHint : `awaken ${site.landmark.name} to read the ${profile.dormantLabel}`,
    traversal: profile.traversal,
    wonder: profile.wonder,
  };
}

export function pentagonSiteThresholdEffect(threshold: PentagonSiteThresholdReport | null | undefined): PentagonSiteThresholdEffectReport | null {
  if (!threshold?.open) return null;
  switch (threshold.shape) {
    case 'lowArch':
      return {
        kind: 'homewardWarmth',
        label: `${threshold.label} warmth`,
        detail: 'stamina returns a little faster and exposure settles near the opened home arch',
        routePrep: 'home',
        survival: { staminaRegenBonus: 0.18, exposureRateDelta: -0.18, recoveryBonus: 0.9 },
      };
    case 'fins':
      return {
        kind: 'weatherShelter',
        label: `${threshold.label} shelter`,
        detail: 'rain exposure softens inside the opened weather pocket',
        routePrep: 'weather',
        survival: { weatherExposureMultiplier: 0.62, staminaRegenBonus: 0.08 },
      };
    case 'underpass':
      return {
        kind: 'tideRun',
        label: `${threshold.label} run`,
        detail: 'fish routes pull more strongly around the opened tide underpass',
        routePrep: 'food',
        survival: { staminaRegenBonus: 0.06 },
        fishBoost: 0.18,
      };
    case 'skylight':
      return {
        kind: 'routeSight',
        label: `${threshold.label} sightline`,
        detail: 'cave pressure is easier to read from the lantern skylight',
        routePrep: 'light',
        survival: { caveExposureMultiplier: 0.78, staminaRegenBonus: 0.08 },
      };
    case 'rootRoom':
      return {
        kind: 'rootCache',
        label: `${threshold.label} cache`,
        detail: 'food forage and recovery improve around the opened root room',
        routePrep: 'food',
        survival: { recoveryBonus: 0.7, exposureRateDelta: -0.08 },
        forageBoost: 0.2,
      };
    case 'cutGate':
      return {
        kind: 'toolPass',
        label: `${threshold.label} pass`,
        detail: 'tool routes cost a little less stamina near the opened scree gate',
        routePrep: 'tools',
        survival: { staminaRegenBonus: 0.1 },
      };
    case 'steppedTerrace':
      return {
        kind: 'coldRest',
        label: `${threshold.label} rest`,
        detail: 'cold exposure softens on the opened snow terrace',
        routePrep: 'weather',
        survival: { exposureRateDelta: -0.34, weatherExposureMultiplier: 0.7, recoveryBonus: 0.4 },
        forageBoost: 0.12,
      };
    case 'glassLedge':
      return {
        kind: 'routeSight',
        label: `${threshold.label} sightline`,
        detail: 'long-route planning reads cleaner from the opened glass ledge',
        routePrep: 'travel',
        survival: { staminaRegenBonus: 0.08 },
      };
    case 'stormPocket':
      return {
        kind: 'stormWatch',
        label: `${threshold.label} watch`,
        detail: 'storm exposure drops sharply inside the opened storm pocket',
        routePrep: 'weather',
        survival: { weatherExposureMultiplier: 0.48, exposureRateDelta: -0.22, recoveryBonus: 0.4 },
        fishBoost: 0.1,
      };
    case 'springMouth':
      return {
        kind: 'springWater',
        label: `${threshold.label} water`,
        detail: 'hidden water steadies wet cave approaches and nearby fish runs',
        routePrep: 'cave',
        survival: { exposureRateDelta: -0.12, caveExposureMultiplier: 0.86 },
        fishBoost: 0.16,
        forageBoost: 0.12,
      };
    case 'bellChamber':
      return {
        kind: 'caveListening',
        label: `${threshold.label} listening`,
        detail: 'dark cave pressure is much easier to read from the opened bell chamber',
        routePrep: 'cave',
        survival: { caveExposureMultiplier: 0.5, staminaRegenBonus: 0.12 },
        forageBoost: 0.14,
      };
    case 'vaneGate':
      return {
        kind: 'returnGate',
        label: `${threshold.label} return`,
        detail: 'long-route departure and return planning steady near the opened horizon gate',
        routePrep: 'travel',
        survival: { staminaRegenBonus: 0.12, exposureRateDelta: -0.06 },
      };
    default:
      return null;
  }
}

export function pentagonSiteThresholdTerrainSpec(threshold: PentagonSiteThresholdReport | null | undefined): PentagonSiteThresholdTerrainSpec | null {
  if (!threshold?.open) return null;
  switch (threshold.shape) {
    case 'lowArch':
      return {
        role: 'underpass',
        label: `${threshold.label} mouth`,
        detail: `carves a shallow walk-under mouth through the opened ${threshold.landform}`,
        carveDepthCells: 4,
        tileSpan: 5,
      };
    case 'underpass':
      return {
        role: 'underpass',
        label: `${threshold.label} crawl`,
        detail: `cuts the first crawlable tide route below the opened ${threshold.landform}`,
        carveDepthCells: 4,
        tileSpan: 3,
      };
    case 'cutGate':
      return {
        role: 'underpass',
        label: `${threshold.label} notch`,
        detail: `opens a tool-cut notch where the ${threshold.landform} points through the stone`,
        carveDepthCells: 4,
        tileSpan: 3,
      };
    case 'vaneGate':
      return {
        role: 'gate',
        label: `${threshold.label} cut`,
        detail: `cuts a return gate slot into the opened ${threshold.landform}`,
        carveDepthCells: 3,
        tileSpan: 3,
      };
    case 'rootRoom':
      return {
        role: 'chamber',
        label: `${threshold.label} pocket`,
        detail: `hollows a cool starter pocket below the opened ${threshold.landform}`,
        carveDepthCells: 5,
        tileSpan: 2,
      };
    case 'bellChamber':
      return {
        role: 'chamber',
        label: `${threshold.label} throat`,
        detail: `hollows the first resonant throat of the opened ${threshold.landform}`,
        carveDepthCells: 6,
        tileSpan: 4,
      };
    case 'springMouth':
      return {
        role: 'chamber',
        label: `${threshold.label} seep`,
        detail: `hollows a wet approach pocket at the opened ${threshold.landform}`,
        carveDepthCells: 5,
        tileSpan: 2,
      };
    case 'skylight':
      return {
        role: 'chamber',
        label: `${threshold.label} shaft`,
        detail: `cuts a short light shaft through the opened ${threshold.landform}`,
        carveDepthCells: 5,
        tileSpan: 2,
      };
    case 'steppedTerrace':
      return {
        role: 'terrace',
        label: `${threshold.label} shelf`,
        detail: `planes a buildable rest shelf into the opened ${threshold.landform}`,
        carveDepthCells: 2,
        tileSpan: 3,
      };
    case 'glassLedge':
      return {
        role: 'terrace',
        label: `${threshold.label} shelf`,
        detail: `planes a sightline ledge into the opened ${threshold.landform}`,
        carveDepthCells: 2,
        tileSpan: 3,
      };
    case 'fins':
      return {
        role: 'weatherPocket',
        label: `${threshold.label} hollow`,
        detail: `scoops a sheltered air pocket behind the opened ${threshold.landform}`,
        carveDepthCells: 2,
        tileSpan: 3,
      };
    case 'stormPocket':
      return {
        role: 'weatherPocket',
        label: `${threshold.label} hollow`,
        detail: `scoops a storm-watch hollow into the opened ${threshold.landform}`,
        carveDepthCells: 2,
        tileSpan: 3,
      };
    default:
      return null;
  }
}

export function pentagonThresholdChamberProfile(shape: PentagonSiteThresholdShape): PentagonThresholdChamberProfile {
  return THRESHOLD_CHAMBER_PROFILES[shape];
}

export function pentagonThresholdChamber(
  site: PentagonExpeditionSiteReport,
  topology: PentagonDomainTopology,
  completedSites: ReadonlySet<number> = new Set(),
  observedChambers: ReadonlySet<number> = new Set(),
): PentagonThresholdChamberSite {
  const threshold = pentagonSiteThreshold(site, completedSites);
  const terrain = pentagonSiteThresholdTerrainSpec(threshold);
  const profile = pentagonThresholdChamberProfile(threshold.shape);
  const degree = Math.max(0, Math.trunc(topology.degreeOf(site.tile)));
  const edge = degree > 0 ? (site.landmark.index * 2 + 2) % degree : 0;
  const tile = degree > 0 ? topology.neighbor(site.tile, edge) : site.tile;
  const id = site.landmark.index;
  const open = threshold.open && terrain !== null;
  return {
    id,
    tile,
    landmarkTile: site.tile,
    landmarkIndex: site.landmark.index,
    landmarkName: site.landmark.name,
    siteLabel: site.siteLabel,
    thresholdLabel: threshold.label,
    role: terrain?.role ?? 'chamber',
    kind: profile.kind,
    label: profile.label,
    detail: open
      ? `${profile.detail} · ${terrain?.detail ?? threshold.traversal}`
      : `${profile.detail} · complete the ${site.siteLabel} to open this threshold chamber`,
    note: profile.note,
    reward: profile.reward,
    open,
    observed: observedChambers.has(id),
    hint: open
      ? `inspect the ${profile.label} inside ${threshold.label}`
      : `complete ${site.landmark.name} ${site.siteLabel} to open ${profile.label}`,
  };
}

export function pentagonThresholdChambers(
  pentagonTiles: readonly number[],
  topology: PentagonDomainTopology,
  discovered: ReadonlySet<number> = new Set(),
  completedSites: ReadonlySet<number> = new Set(),
  observedChambers: ReadonlySet<number> = new Set(),
): PentagonThresholdChamberSite[] {
  return pentagonExpeditionSites(pentagonTiles, discovered)
    .map((site) => pentagonThresholdChamber(site, topology, completedSites, observedChambers))
    .sort((a, b) => a.id - b.id);
}

export function nearestThresholdChamberSite(
  tiles: readonly number[],
  sites: readonly PentagonThresholdChamberSite[],
): PentagonThresholdChamberSite | null {
  const tileOrder = new Map<number, number>();
  tiles.forEach((tile, index) => {
    if (!tileOrder.has(tile)) tileOrder.set(tile, index);
  });
  let best: PentagonThresholdChamberSite | null = null;
  let bestOrder = Infinity;
  for (const site of sites) {
    if (!site.open || site.observed) continue;
    const order = tileOrder.get(site.tile);
    if (order === undefined) continue;
    if (!best || order < bestOrder || (order === bestOrder && site.id < best.id)) {
      best = site;
      bestOrder = order;
    }
  }
  return best;
}

export function observeThresholdChamber(
  observedChambers: Set<number>,
  site: PentagonThresholdChamberSite,
): PentagonThresholdChamberObserveResult {
  if (!site.open) {
    return { ok: false, site, firstObservation: false, message: site.hint };
  }
  if (site.observed || observedChambers.has(site.id)) {
    return { ok: false, site, firstObservation: false, message: `${site.label} already read` };
  }
  observedChambers.add(site.id);
  return {
    ok: true,
    site,
    item: site.reward.item,
    count: site.reward.count,
    firstObservation: true,
    message: `read ${site.label} · ${site.note} · +${site.reward.count} ${site.reward.label}`,
  };
}

export function pentagonInsightForIndex(index: number): PentagonInsight {
  const i = Math.max(0, Math.min(INSIGHTS.length - 1, Math.trunc(index)));
  return INSIGHTS[i];
}

export function pentagonLandmark(tile: number, pentagonTiles: readonly number[], discovered: ReadonlySet<number>): PentagonLandmark | null {
  const index = pentagonTiles.indexOf(tile);
  if (index < 0) return null;
  return {
    index,
    tile,
    name: NAMES[index] ?? `Pentagon ${index + 1}`,
    clue: CLUES[index] ?? 'Something here is waiting to be named.',
    insight: pentagonInsightForIndex(index),
    discovered: discovered.has(tile),
  };
}

export function allPentagonLandmarks(pentagonTiles: readonly number[], discovered: ReadonlySet<number>): PentagonLandmark[] {
  return pentagonTiles.map((tile) => pentagonLandmark(tile, pentagonTiles, discovered)!).filter(Boolean);
}

export function pentagonInsightRewardText(insight: PentagonInsight | undefined): string {
  if (!insight || insight.reward.length === 0) return '';
  return insight.reward.map((reward) => `+${reward.count} ${reward.label}`).join(', ');
}

export function pentagonInsightReport(pentagonTiles: readonly number[], discovered: ReadonlySet<number>): PentagonInsightReport {
  const landmarks = allPentagonLandmarks(pentagonTiles, discovered).filter((landmark) => landmark.discovered);
  const insights = landmarks.map((landmark) => landmark.insight).filter((insight): insight is PentagonInsight => !!insight);
  const effects: PentagonInsightEffect[] = [];
  for (const insight of insights) {
    if (!effects.includes(insight.effect)) effects.push(insight.effect);
  }
  const labels = insights.map((insight) => insight.label);
  const count = insights.length;
  const total = pentagonTiles.length;
  return {
    count,
    total,
    insights,
    ids: insights.map((insight) => insight.id),
    labels,
    effects,
    label: count > 0 ? `insights ${count}/${total}` : 'insights quiet',
    prepLabel: count > 0 ? labels.slice(0, 3).join(' + ') : 'no pentagon insights',
  };
}

export function pentagonDomainProfile(effect: PentagonInsightEffect): PentagonDomainProfile {
  return DOMAIN_PROFILES[effect];
}

export function pentagonLandscapeProfileForIndex(index: number): PentagonLandscapeProfile {
  const safeIndex = Math.max(0, Math.min(INSIGHTS.length - 1, Math.trunc(Number.isFinite(index) ? index : 0)));
  const effect = pentagonInsightForIndex(safeIndex).effect;
  const profile = LANDSCAPE_PROFILES[effect];
  return { index: safeIndex, effect, ...profile };
}

export function pentagonLandscapeProfiles(pentagonTiles: readonly number[]): PentagonLandscapeProfile[] {
  return pentagonTiles.map((_, index) => pentagonLandscapeProfileForIndex(index));
}

export function pentagonExpeditionSiteProfile(effect: PentagonInsightEffect): PentagonExpeditionSiteProfile {
  return EXPEDITION_SITE_PROFILES[effect];
}

export function pentagonExpeditionSiteForIndex(index: number): PentagonExpeditionSiteReport {
  const landscape = pentagonLandscapeProfileForIndex(index);
  const profile = pentagonExpeditionSiteProfile(landscape.effect);
  const landmark = pentagonLandmark(landscape.index, INSIGHTS.map((_, i) => i), new Set([landscape.index]))!;
  return {
    tile: landscape.index,
    originTile: landscape.index,
    ring: 0,
    radius: 0,
    intensity: 1,
    discovered: true,
    landmark,
    effect: landscape.effect,
    landscape,
    kind: profile.kind,
    label: `${landmark.name} ${profile.label}`,
    siteLabel: profile.label,
    problem: profile.problem,
    opportunity: profile.opportunity,
    buildHint: profile.buildHint,
    routeHint: profile.routeHint,
    wonder: profile.wonder,
  };
}

export function pentagonExpeditionSites(pentagonTiles: readonly number[], discovered: ReadonlySet<number> = new Set()): PentagonExpeditionSiteReport[] {
  return pentagonTiles.map((tile, index) => {
    const landmark = pentagonLandmark(tile, pentagonTiles, discovered)!;
    const landscape = pentagonLandscapeProfileForIndex(index);
    const profile = pentagonExpeditionSiteProfile(landscape.effect);
    const known = discovered.has(tile);
    return {
      tile,
      originTile: tile,
      ring: 0,
      radius: 0,
      intensity: 1,
      discovered: known,
      landmark,
      effect: landscape.effect,
      landscape,
      kind: profile.kind,
      label: known ? `${landmark.name} ${profile.label}` : profile.label,
      siteLabel: profile.label,
      problem: profile.problem,
      opportunity: profile.opportunity,
      buildHint: profile.buildHint,
      routeHint: known ? profile.routeHint : `awaken ${landmark.name} to read the ${profile.label}`,
      wonder: profile.wonder,
    };
  });
}

export function pentagonSiteThresholds(
  pentagonTiles: readonly number[],
  discovered: ReadonlySet<number> = new Set(),
  completedSites: ReadonlySet<number> = new Set(),
): PentagonSiteThresholdReport[] {
  return pentagonExpeditionSites(pentagonTiles, discovered).map((site) => pentagonSiteThreshold(site, completedSites));
}

export function pentagonDomainAt(
  originTile: number,
  topology: PentagonDomainTopology,
  pentagonTiles: readonly number[],
  discovered: ReadonlySet<number>,
  radius = 2,
): PentagonDomainReport | null {
  const origin = Math.max(0, Math.trunc(originTile));
  const maxRing = Math.max(0, Math.trunc(radius));
  const pentagons = new Set(pentagonTiles);
  const visited = new Set<number>([origin]);
  let frontier = [origin];

  for (let ring = 0; ring <= maxRing; ring++) {
    const candidates = frontier.filter((tile) => pentagons.has(tile)).sort((a, b) => a - b);
    if (candidates.length > 0) {
      const tile = candidates[0];
      const landmark = pentagonLandmark(tile, pentagonTiles, discovered);
      if (!landmark?.insight) return null;
      const profile = pentagonDomainProfile(landmark.insight.effect);
      const intensity = maxRing === 0 ? 1 : Math.max(0.18, 1 - ring / (maxRing + 0.6));
      const known = discovered.has(tile);
      return {
        tile,
        originTile: origin,
        ring,
        radius: maxRing,
        intensity,
        discovered: known,
        landmark,
        effect: landmark.insight.effect,
        label: known ? `${landmark.name} domain` : profile.label,
        domainLabel: profile.label,
        challenge: profile.challenge,
        boon: profile.boon,
        routeHint: known ? profile.routeHint : `awaken ${landmark.name} to understand this place`,
      };
    }
    const next: number[] = [];
    for (const tile of frontier) {
      const degree = Math.max(0, Math.trunc(topology.degreeOf(tile)));
      for (let edge = 0; edge < degree; edge++) {
        const n = topology.neighbor(tile, edge);
        if (n < 0 || visited.has(n)) continue;
        visited.add(n);
        next.push(n);
      }
    }
    frontier = next.sort((a, b) => a - b);
    if (frontier.length === 0) break;
  }
  return null;
}

export function pentagonExpeditionSiteAt(
  originTile: number,
  topology: PentagonDomainTopology,
  pentagonTiles: readonly number[],
  discovered: ReadonlySet<number>,
  radius = 2,
): PentagonExpeditionSiteReport | null {
  const domain = pentagonDomainAt(originTile, topology, pentagonTiles, discovered, radius);
  if (!domain) return null;
  const index = domain.landmark.index;
  const landscape = pentagonLandscapeProfileForIndex(index);
  const profile = pentagonExpeditionSiteProfile(domain.effect);
  return {
    tile: domain.tile,
    originTile: domain.originTile,
    ring: domain.ring,
    radius: domain.radius,
    intensity: domain.intensity,
    discovered: domain.discovered,
    landmark: domain.landmark,
    effect: domain.effect,
    landscape,
    kind: profile.kind,
    label: domain.discovered ? `${domain.landmark.name} ${profile.label}` : profile.label,
    siteLabel: profile.label,
    problem: profile.problem,
    opportunity: profile.opportunity,
    buildHint: profile.buildHint,
    routeHint: domain.discovered ? profile.routeHint : `awaken ${domain.landmark.name} to read the ${profile.label}`,
    wonder: profile.wonder,
  };
}

export function nearestPentagonOnTiles(tiles: readonly number[], pentagonTiles: readonly number[]): number | null {
  const candidates = new Set(pentagonTiles);
  for (const tile of tiles) if (candidates.has(tile)) return tile;
  return null;
}

export function pentagonProgress(discovered: ReadonlySet<number>, pentagonTiles: readonly number[]): {
  discovered: number[];
  count: number;
  total: number;
  label: string;
  complete: boolean;
} {
  const normalized = normalizePentagonDiscoveries([...discovered], pentagonTiles);
  const count = normalized.length;
  const total = pentagonTiles.length;
  return {
    discovered: normalized,
    count,
    total,
    label: count === total ? 'all pentagons awake' : count > 0 ? `pentagons ${count}/${total}` : 'pentagons quiet',
    complete: total > 0 && count === total,
  };
}

export function discoverPentagon(
  discovered: Set<number>,
  tile: number,
  pentagonTiles: readonly number[],
): PentagonDiscoveryResult {
  const landmark = pentagonLandmark(tile, pentagonTiles, discovered);
  if (!landmark) {
    const progress = pentagonProgress(discovered, pentagonTiles);
    return {
      ok: false,
      alreadyKnown: false,
      discovered: progress.discovered,
      count: progress.count,
      total: progress.total,
      message: 'no pentagon landmark nearby',
    };
  }
  const alreadyKnown = discovered.has(tile);
  if (!alreadyKnown) discovered.add(tile);
  const next = pentagonLandmark(tile, pentagonTiles, discovered)!;
  const progress = pentagonProgress(discovered, pentagonTiles);
  return {
    ok: true,
    alreadyKnown,
    landmark: next,
    discovered: progress.discovered,
    count: progress.count,
    total: progress.total,
    message: alreadyKnown
      ? `${next.name}: ${next.clue}`
      : `${next.name} awakened ${progress.count}/${progress.total} - ${next.clue}`,
  };
}
