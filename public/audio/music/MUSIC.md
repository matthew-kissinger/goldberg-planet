# The Twelve Bells — Goldberg Planet soundtrack

Sparse, C418-adjacent ambient score for the planet. The album is a pilgrimage across the
twelve pentagon domains: a **Prelude** states a faint shared motif, twelve short
**leitmotifs** each carry one domain's character (warm-ring, salt-tide, root-vault,
snow-dial, deep-bell, storm-seat, reed-water, ember-ring, star-glass, tide-bell,
wind-thread, root-whisper), and **The Whole Chord** resolves them together as a finale.

Calm-forward, weather-not-a-playlist: tracks stream in shuffled order with long, slightly
random silences between them (see `MUSIC_GAP_*` in `src/audio/gameAudio.ts`).

## Shipping format
Committed music files are optimized for browser streaming as stereo MP3, 44.1 kHz,
128 kbps, stripped of extra metadata/artwork. The full album should stay under roughly
36 MB so the soundtrack can ship with the web build without bloating first-play downloads.
If regenerating from source, export or transcode to the same target before committing.

## Playback wiring
These are full-length pieces, so they **stream** through an `HTMLAudioElement` routed into a
dedicated `music` gain node in `GameAudio` — they are deliberately **not** in `AUDIO_ASSETS`
(decoding 14 multi-minute tracks into `AudioBuffer` PCM would cost gigabytes of RAM). The
track list lives in `src/audio/events.ts` (`MUSIC_TRACKS`). Music starts on audio unlock,
respects mute and the `music` group volume, and pauses/resumes with tab visibility.

## Tracks
Play/shuffle order = numeric filename order. Titles map to `MUSIC_TRACKS` ids.

| # | File | Title |
|---|------|-------|
| 1 | `01-prelude.mp3` | The Twelve Bells (Prelude) |
| 2 | `02-warm-ring.mp3` | Warm-Ring |
| 3 | `03-salt-tide.mp3` | Salt-Tide |
| 4 | `04-root-vault.mp3` | Root-Vault |
| 5 | `05-snow-dial.mp3` | Snow-Dial |
| 6 | `06-deep-bell.mp3` | Deep-Bell |
| 7 | `07-storm-seat.mp3` | Storm-Seat |
| 8 | `08-reed-water.mp3` | Reed-Water |
| 9 | `09-ember-ring.mp3` | Ember-Ring |
| 10 | `10-star-glass.mp3` | Star-Glass |
| 11 | `11-tide-bell.mp3` | Tide-Bell |
| 12 | `12-wind-thread.mp3` | Wind-Thread |
| 13 | `13-root-whisper.mp3` | Root-Whisper |
| 14 | `14-the-whole-chord.mp3` | The Whole Chord (Finale) |

## Provenance
Generated with **Suno v5.5** (instrumental), auditioned two passes per track, keepers
selected by the owner. Suno clip IDs of the chosen takes (for regeneration/extension):

`01` 011e14ba→**ce2bbca1** · `02` **bedaeeb6** · `03` **28b1922e** · `04` **018a1623** ·
`05` **1d13fd2d** · `06` **e9f2abab** · `07` **238898fc** · `08` **56baef50** ·
`09` **c9d0ab15** · `10` **7cf095d0** · `11` **428c3e2f** · `12` **d2d36c30** ·
`13` **ec2c54d0** · `14` **961da2d2**

Full generation pipeline + both passes: `personal/music/projects/goldberg-sphere/` and
`personal/music/tracks/_batch/` in the owner's workspace.
