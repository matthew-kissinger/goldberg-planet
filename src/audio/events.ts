export type AudioGroup = 'ui' | 'sfx' | 'ambience' | 'music';

export type AudioAssetId =
  | 'uiConfirm'
  | 'uiDeny'
  | 'uiOpen'
  | 'craftConfirm'
  | 'structurePlace'
  | 'gatherSoft'
  | 'routeSlate'
  | 'skyfallGather'
  | 'fishingCatch'
  | 'hearthRest'
  | 'caveRead'
  | 'waterCatch'
  | 'landmarkAwaken'
  | 'planetWindLoop';

export interface AudioAssetDef {
  id: AudioAssetId;
  url: string;
  group: AudioGroup;
  volume: number;
  loop?: boolean;
}

export const AUDIO_ASSETS: Record<AudioAssetId, AudioAssetDef> = {
  uiConfirm: { id: 'uiConfirm', url: '/audio/sfx/ui-confirm.mp3', group: 'ui', volume: 0.35 },
  uiDeny: { id: 'uiDeny', url: '/audio/sfx/ui-deny.mp3', group: 'ui', volume: 0.34 },
  uiOpen: { id: 'uiOpen', url: '/audio/sfx/ui-open.mp3', group: 'ui', volume: 0.32 },
  craftConfirm: { id: 'craftConfirm', url: '/audio/sfx/craft-confirm.mp3', group: 'sfx', volume: 0.52 },
  structurePlace: { id: 'structurePlace', url: '/audio/sfx/structure-place.mp3', group: 'sfx', volume: 0.5 },
  gatherSoft: { id: 'gatherSoft', url: '/audio/sfx/gather-soft.mp3', group: 'sfx', volume: 0.42 },
  routeSlate: { id: 'routeSlate', url: '/audio/sfx/route-slate.mp3', group: 'sfx', volume: 0.48 },
  skyfallGather: { id: 'skyfallGather', url: '/audio/sfx/skyfall-gather.mp3', group: 'sfx', volume: 0.58 },
  fishingCatch: { id: 'fishingCatch', url: '/audio/sfx/fishing-catch.mp3', group: 'sfx', volume: 0.5 },
  hearthRest: { id: 'hearthRest', url: '/audio/sfx/hearth-rest.mp3', group: 'sfx', volume: 0.5 },
  caveRead: { id: 'caveRead', url: '/audio/sfx/cave-read.mp3', group: 'sfx', volume: 0.48 },
  waterCatch: { id: 'waterCatch', url: '/audio/sfx/water-catch.mp3', group: 'sfx', volume: 0.47 },
  landmarkAwaken: { id: 'landmarkAwaken', url: '/audio/sfx/landmark-awaken.mp3', group: 'sfx', volume: 0.6 },
  planetWindLoop: { id: 'planetWindLoop', url: '/audio/ambience/planet-wind-loop.mp3', group: 'ambience', volume: 0.28, loop: true },
};

export type AudioEventId =
  | 'uiConfirm'
  | 'uiDeny'
  | 'uiOpen'
  | 'craftConfirm'
  | 'structurePlace'
  | 'gatherSoft'
  | 'routeSlate'
  | 'skyfallGather'
  | 'fishingCatch'
  | 'hearthRest'
  | 'caveRead'
  | 'waterCatch'
  | 'landmarkAwaken';

export interface AudioCue {
  asset: AudioAssetId;
  cooldownMs: number;
  volume?: number;
}

export const AUDIO_EVENT_CUES: Record<AudioEventId, AudioCue> = {
  uiConfirm: { asset: 'uiConfirm', cooldownMs: 90 },
  uiDeny: { asset: 'uiDeny', cooldownMs: 140 },
  uiOpen: { asset: 'uiOpen', cooldownMs: 180 },
  craftConfirm: { asset: 'craftConfirm', cooldownMs: 160 },
  structurePlace: { asset: 'structurePlace', cooldownMs: 140 },
  gatherSoft: { asset: 'gatherSoft', cooldownMs: 120 },
  routeSlate: { asset: 'routeSlate', cooldownMs: 350 },
  skyfallGather: { asset: 'skyfallGather', cooldownMs: 400 },
  fishingCatch: { asset: 'fishingCatch', cooldownMs: 300 },
  hearthRest: { asset: 'hearthRest', cooldownMs: 500 },
  caveRead: { asset: 'caveRead', cooldownMs: 320 },
  waterCatch: { asset: 'waterCatch', cooldownMs: 250 },
  landmarkAwaken: { asset: 'landmarkAwaken', cooldownMs: 650 },
};

export function audioEventForCraft(ok: boolean): AudioEventId {
  return ok ? 'craftConfirm' : 'uiDeny';
}

export function audioEventForPlacement(ok: boolean): AudioEventId {
  return ok ? 'structurePlace' : 'uiDeny';
}

export function audioEventForStructure(item: string, mode?: string, ok = true): AudioEventId {
  if (!ok) return 'uiDeny';
  if (mode === 'home' || item === 'bedroll') return 'hearthRest';
  if (item === 'campfire' || item === 'lantern' || mode === 'lit' || mode === 'unlit' || mode === 'cook') return 'hearthRest';
  if (item === 'rainCistern' || mode === 'collectWater' || mode === 'irrigate') return 'waterCatch';
  if (item === 'caveAnchor' || mode === 'anchor') return 'caveRead';
  if (item === 'weatherVane' || item === 'waystone' || mode === 'forecast' || mode === 'mark') return 'routeSlate';
  if (item === 'dockSegment') return 'fishingCatch';
  if (item === 'fishTrap' || mode === 'setTrap' || mode === 'checkTrap' || mode === 'collectTrap') return mode === 'collectTrap' ? 'fishingCatch' : 'gatherSoft';
  if (item === 'shoreNet' || mode === 'setNet' || mode === 'checkNet' || mode === 'collectNet') return mode === 'collectNet' ? 'fishingCatch' : 'gatherSoft';
  if (mode === 'plant' || mode === 'tend' || mode === 'harvest' || mode === 'fertilize' || mode === 'compost') return 'gatherSoft';
  if (mode === 'preserve' || mode === 'cache' || mode === 'withdrawProvision') return 'craftConfirm';
  if (mode === 'deposit' || mode === 'withdraw') return 'structurePlace';
  return 'uiConfirm';
}

export function audioEventForFoodAction(action: 'eat' | 'fish' | 'forage', ok = true): AudioEventId {
  if (!ok) return 'uiDeny';
  if (action === 'fish') return 'fishingCatch';
  if (action === 'forage') return 'gatherSoft';
  return 'hearthRest';
}

/**
 * "The Twelve Bells" — the game soundtrack. Sparse, C418-adjacent ambient. Twelve
 * pentagon-domain leitmotifs bracketed by a prelude and a full-chord finale.
 *
 * These are long, full-length pieces, so they stream through an HTMLAudioElement in
 * GameAudio's music subsystem rather than being decoded into AudioBuffers like the
 * short SFX/ambience assets (decoded PCM for 14 multi-minute tracks would be gigabytes).
 * Kept out of AUDIO_ASSETS on purpose so the eager buffer loader never touches them.
 * Source: generated with Suno v5.5 (instrumental); see public/audio/music/MUSIC.md.
 */
export interface MusicTrackDef {
  id: string;
  url: string;
  title: string;
}

export const MUSIC_TRACKS: MusicTrackDef[] = [
  { id: 'prelude', url: '/audio/music/01-prelude.mp3', title: 'The Twelve Bells (Prelude)' },
  { id: 'warmRing', url: '/audio/music/02-warm-ring.mp3', title: 'Warm-Ring' },
  { id: 'saltTide', url: '/audio/music/03-salt-tide.mp3', title: 'Salt-Tide' },
  { id: 'rootVault', url: '/audio/music/04-root-vault.mp3', title: 'Root-Vault' },
  { id: 'snowDial', url: '/audio/music/05-snow-dial.mp3', title: 'Snow-Dial' },
  { id: 'deepBell', url: '/audio/music/06-deep-bell.mp3', title: 'Deep-Bell' },
  { id: 'stormSeat', url: '/audio/music/07-storm-seat.mp3', title: 'Storm-Seat' },
  { id: 'reedWater', url: '/audio/music/08-reed-water.mp3', title: 'Reed-Water' },
  { id: 'emberRing', url: '/audio/music/09-ember-ring.mp3', title: 'Ember-Ring' },
  { id: 'starGlass', url: '/audio/music/10-star-glass.mp3', title: 'Star-Glass' },
  { id: 'tideBell', url: '/audio/music/11-tide-bell.mp3', title: 'Tide-Bell' },
  { id: 'windThread', url: '/audio/music/12-wind-thread.mp3', title: 'Wind-Thread' },
  { id: 'rootWhisper', url: '/audio/music/13-root-whisper.mp3', title: 'Root-Whisper' },
  { id: 'wholeChord', url: '/audio/music/14-the-whole-chord.mp3', title: 'The Whole Chord (Finale)' },
];
