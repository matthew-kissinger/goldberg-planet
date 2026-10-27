export type AudioGroup = 'ui' | 'sfx' | 'ambience' | 'music';

export type AudioAssetId =
  | 'uiConfirm'
  | 'uiDeny'
  | 'uiOpen'
  | 'craftConfirm'
  | 'structurePlace'
  | 'gatherSoft';

export interface AudioAssetDef {
  id: AudioAssetId;
  url: string;
  group: AudioGroup;
  volume: number;
  loop?: boolean;
}

export function audioUrl(relativePath: string, base = import.meta.env.BASE_URL): string {
  const normalizedBase = base && base !== '/' ? base.replace(/\/?$/, '/') : '/';
  return `${normalizedBase}${relativePath.replace(/^\/+/, '')}`;
}

export const AUDIO_ASSETS: Record<AudioAssetId, AudioAssetDef> = {
  uiConfirm: { id: 'uiConfirm', url: audioUrl('audio/sfx/ui-confirm.mp3'), group: 'ui', volume: 0.35 },
  uiDeny: { id: 'uiDeny', url: audioUrl('audio/sfx/ui-deny.mp3'), group: 'ui', volume: 0.34 },
  uiOpen: { id: 'uiOpen', url: audioUrl('audio/sfx/ui-open.mp3'), group: 'ui', volume: 0.32 },
  craftConfirm: { id: 'craftConfirm', url: audioUrl('audio/sfx/craft-confirm.mp3'), group: 'sfx', volume: 0.52 },
  structurePlace: { id: 'structurePlace', url: audioUrl('audio/sfx/structure-place.mp3'), group: 'sfx', volume: 0.5 },
  gatherSoft: { id: 'gatherSoft', url: audioUrl('audio/sfx/gather-soft.mp3'), group: 'sfx', volume: 0.42 },
};

export type AudioEventId =
  | 'uiConfirm'
  | 'uiDeny'
  | 'uiOpen'
  | 'craftConfirm'
  | 'structurePlace'
  | 'gatherSoft';

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
};

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
  { id: 'prelude', url: audioUrl('audio/music/01-prelude.mp3'), title: 'The Twelve Bells (Prelude)' },
  { id: 'warmRing', url: audioUrl('audio/music/02-warm-ring.mp3'), title: 'Warm-Ring' },
  { id: 'saltTide', url: audioUrl('audio/music/03-salt-tide.mp3'), title: 'Salt-Tide' },
  { id: 'rootVault', url: audioUrl('audio/music/04-root-vault.mp3'), title: 'Root-Vault' },
  { id: 'snowDial', url: audioUrl('audio/music/05-snow-dial.mp3'), title: 'Snow-Dial' },
  { id: 'deepBell', url: audioUrl('audio/music/06-deep-bell.mp3'), title: 'Deep-Bell' },
  { id: 'stormSeat', url: audioUrl('audio/music/07-storm-seat.mp3'), title: 'Storm-Seat' },
  { id: 'reedWater', url: audioUrl('audio/music/08-reed-water.mp3'), title: 'Reed-Water' },
  { id: 'emberRing', url: audioUrl('audio/music/09-ember-ring.mp3'), title: 'Ember-Ring' },
  { id: 'starGlass', url: audioUrl('audio/music/10-star-glass.mp3'), title: 'Star-Glass' },
  { id: 'tideBell', url: audioUrl('audio/music/11-tide-bell.mp3'), title: 'Tide-Bell' },
  { id: 'windThread', url: audioUrl('audio/music/12-wind-thread.mp3'), title: 'Wind-Thread' },
  { id: 'rootWhisper', url: audioUrl('audio/music/13-root-whisper.mp3'), title: 'Root-Whisper' },
  { id: 'wholeChord', url: audioUrl('audio/music/14-the-whole-chord.mp3'), title: 'The Whole Chord (Finale)' },
];
