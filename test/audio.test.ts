import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_ASSETS,
  AUDIO_EVENT_CUES,
  MUSIC_TRACKS,
  audioUrl,
  type AudioAssetDef,
  type AudioAssetId,
} from '../src/audio/events';
import { GameAudio } from '../src/audio/gameAudio';

describe('audio events', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as { Audio?: unknown }).Audio;
  });

  it('maps every event cue to a declared static asset', () => {
    for (const [event, cue] of Object.entries(AUDIO_EVENT_CUES)) {
      expect(AUDIO_ASSETS[cue.asset], event).toBeTruthy();
      expect(catalogAudioPath(AUDIO_ASSETS[cue.asset].url)).toMatch(/^audio\/(sfx|ambience)\//);
      expect(cue.cooldownMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('resolves audio URLs against the deployed base path', () => {
    expect(audioUrl('audio/music/test.mp3', '/')).toBe('/audio/music/test.mp3');
    expect(audioUrl('audio/music/test.mp3', './')).toBe('./audio/music/test.mp3');
    expect(audioUrl('audio/music/test.mp3', '/goldberg-planet/')).toBe('/goldberg-planet/audio/music/test.mp3');
  });

  it('records events even before browser audio unlocks', () => {
    const audio = new GameAudio();
    expect(audio.state().unlocked).toBe(false);
    expect(audio.playEvent('craftConfirm')).toBe(false);
    expect(audio.playEvent('gatherSoft')).toBe(false);
    const state = audio.state();
    expect(state.lastEvent).toBe('gatherSoft');
    expect(state.lastAsset).toBe('gatherSoft');
    expect(state.pendingEvents).toBeGreaterThanOrEqual(2);
    expect(state.playCounts.craftConfirm).toBe(1);
    expect(state.assetPlayCounts.craftConfirm).toBe(1);
  });

  it('keeps mute state and group volumes in diagnostics', () => {
    const audio = new GameAudio();
    audio.setMuted(true);
    audio.setGroupVolume('ambience', 0.25);
    const state = audio.state();
    expect(state.muted).toBe(true);
    expect(state.volumes.ambience).toBe(0.25);
  });

  it('does not open an audio device or fetch assets for muted input, visibility, or preload calls', async () => {
    const createContext = vi.fn(() => new FakeAudioContext() as unknown as AudioContext);
    const fetchAsset = vi.fn(); vi.stubGlobal('fetch', fetchAsset);
    const audio = new GameAudio(AUDIO_ASSETS, createContext);
    audio.setMuted(true);
    await expect(audio.unlock()).resolves.toBe(false);
    await expect(audio.unlock()).resolves.toBe(false);
    audio.setPageVisible(true);
    audio.loadAll();
    await audio.loadAsset('gatherSoft');
    expect(audio.playEvent('gatherSoft')).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
    expect(fetchAsset).not.toHaveBeenCalled();
    expect(audio.state()).toMatchObject({ muted: true, unlocked: false, contextState: 'unavailable', loading: [], musicStarted: false });
    audio.dispose();
  });

  it('opens and resumes audio on unmute itself after muted gestures, without needing another input', async () => {
    const audioEl = new FakeAudioElement();
    (globalThis as { Audio?: unknown }).Audio = class { constructor() { return audioEl; } };
    const fetchAsset = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal('fetch', fetchAsset);
    const context = new FakeAudioContext(); context.state = 'suspended';
    const resume = vi.spyOn(context, 'resume').mockImplementation(async () => { context.state = 'running'; });
    const createContext = vi.fn(() => context as unknown as AudioContext);
    const assets = { gatherSoft: AUDIO_ASSETS.gatherSoft } as Record<AudioAssetId, AudioAssetDef>;
    const audio = new GameAudio(assets, createContext);
    audio.setMuted(true);
    audio.loadAll(); // Must not mark the deferred preload complete.
    await expect(audio.unlock()).resolves.toBe(false);
    expect(audio.toggleMuted()).toBe(false);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(audio.state().musicPlaying).toBe(true));
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(audio.state().unlocked).toBe(true);
    audio.setMuted(true); expect(audio.state().musicPlaying).toBe(false);
    audio.toggleMuted(); expect(audio.state().musicPlaying).toBe(true);
    expect(createContext).toHaveBeenCalledTimes(1);
    audio.dispose();
  });

  it('keeps the soundtrack as streamed music instead of eager decoded SFX', () => {
    expect(MUSIC_TRACKS).toHaveLength(14);
    for (const track of MUSIC_TRACKS) {
      expect(catalogAudioPath(track.url)).toMatch(/^audio\/music\/\d\d-[a-z-]+\.mp3$/);
      expect(track.title.length).toBeGreaterThan(3);
      expect(Object.keys(AUDIO_ASSETS)).not.toContain(track.id);
    }
  });

  it('keeps runtime music catalog unique and aligned with numeric album order', () => {
    const ids = new Set(MUSIC_TRACKS.map((track) => track.id));
    const urls = new Set(MUSIC_TRACKS.map((track) => track.url));
    const titles = new Set(MUSIC_TRACKS.map((track) => track.title));
    expect(ids.size).toBe(MUSIC_TRACKS.length);
    expect(urls.size).toBe(MUSIC_TRACKS.length);
    expect(titles.size).toBe(MUSIC_TRACKS.length);
    expect(MUSIC_TRACKS.map((track) => catalogAudioPath(track.url).split('/').pop())).toEqual(
      [...MUSIC_TRACKS]
        .map((track) => catalogAudioPath(track.url).split('/').pop())
        .sort(),
    );
  });

  it('keeps committed soundtrack files inside the browser-game streaming budget', () => {
    let totalBytes = 0;
    for (const track of MUSIC_TRACKS) {
      const file = join(process.cwd(), 'public', catalogAudioPath(track.url));
      expect(existsSync(file), track.url).toBe(true);
      const bytes = statSync(file).size;
      totalBytes += bytes;
      expect(bytes, track.url).toBeLessThanOrEqual(3.1 * 1024 * 1024);
    }
    expect(totalBytes).toBeLessThanOrEqual(36 * 1024 * 1024);
  });

  it('keeps the music folder free of orphan or missing album files', () => {
    const runtimeFiles = MUSIC_TRACKS.map((track) => catalogAudioPath(track.url).split('/').pop()).sort();
    const diskFiles = readdirSync(join(process.cwd(), 'public', 'audio', 'music'))
      .filter((name) => name.endsWith('.mp3'))
      .sort();
    expect(runtimeFiles).toEqual(diskFiles);
  });

  it('starts streamed music after unlock and pauses it with page visibility', async () => {
    const audioEl = new FakeAudioElement();
    (globalThis as { Audio?: unknown }).Audio = class {
      constructor() {
        return audioEl;
      }
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })));

    const assets = {
      gatherSoft: {
        id: 'gatherSoft',
        url: '/audio/sfx/gather-soft.mp3',
        group: 'sfx',
        volume: 0.42,
      },
    } as Record<AudioAssetId, AudioAssetDef>;
    const audio = new GameAudio(assets, () => new FakeAudioContext() as unknown as AudioContext);

    await expect(audio.unlock()).resolves.toBe(true);
    expect(audio.state().musicStarted).toBe(true);
    expect(audio.state().musicTrackCount).toBe(14);
    expect(audio.state().musicTrack).toBeTruthy();
    expect(audio.state().musicPlaying).toBe(true);

    audio.setPageVisible(false);
    expect(audio.state().musicPlaying).toBe(false);

    audio.setPageVisible(true);
    expect(audio.state().musicPlaying).toBe(true);

    audio.setMuted(true);
    expect(audio.state().musicPlaying).toBe(false);
  });

  it('does not stall the between-track gap when something re-triggers resumeMusic mid-gap', async () => {
    // Regression: main.ts's click/keydown "unlock audio" listeners used to stay bound
    // for the whole session, so every mine/build click called resumeMusic() again.
    // While a track was playing that was harmless, but once it ended and the soundtrack
    // entered its deliberate silence gap, each of those clicks reset the gap timer and
    // advanced past a track without ever playing it — so the game fell silent after the
    // first track and never recovered, no matter how long you waited.
    vi.useFakeTimers();
    try {
      const audioEl = new FakeAudioElement();
      (globalThis as { Audio?: unknown }).Audio = class {
        constructor() {
          return audioEl;
        }
      };
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })));
      const assets = {
        gatherSoft: {
          id: 'gatherSoft',
          url: '/audio/sfx/gather-soft.mp3',
          group: 'sfx',
          volume: 0.42,
        },
      } as Record<AudioAssetId, AudioAssetDef>;
      const audio = new GameAudio(assets, () => new FakeAudioContext() as unknown as AudioContext);

      await audio.unlock();
      expect(audio.state().musicPlaying).toBe(true);

      // Track 1 ends -> the soundtrack's built-in silence gap begins (28-75s). Real
      // HTMLMediaElement sets ended/paused before firing 'ended'; mirror that here.
      audioEl.ended = true;
      audioEl.paused = true;
      audioEl.dispatch('ended');
      expect(audio.state().musicQueued).toBe(true);
      expect(audio.state().musicPlaying).toBe(false);

      // Simulate ~10 minutes of constant player clicks (every 20s, well under even the
      // minimum 28s gap) each re-invoking resumeMusic(), exactly like the old unlock
      // listener firing on every pointerdown during normal mining/building.
      for (let i = 0; i < 30; i++) {
        await vi.advanceTimersByTimeAsync(20_000);
        audio.resumeMusic();
      }

      // The original gap (max 75s) had far more than enough undisturbed time to fire
      // somewhere in that 600s window. If resumeMusic() were still resetting it on every
      // call, it would still be silently queued right now.
      expect(audio.state().musicQueued).toBe(false);
      expect(audio.state().musicPlaying).toBe(true);
      expect(audio.state().musicTrackId).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces streamed music media errors in diagnostics', async () => {
    const audioEl = new FakeAudioElement();
    (globalThis as { Audio?: unknown }).Audio = class {
      constructor() {
        return audioEl;
      }
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })));
    const assets = {
      gatherSoft: {
        id: 'gatherSoft',
        url: audioUrl('audio/sfx/gather-soft.mp3'),
        group: 'sfx',
        volume: 0.42,
      },
    } as Record<AudioAssetId, AudioAssetDef>;
    const audio = new GameAudio(assets, () => new FakeAudioContext() as unknown as AudioContext);

    await expect(audio.unlock()).resolves.toBe(true);
    audioEl.dispatch('error');

    const state = audio.state();
    expect(state.errors.some((message) => message.includes('music') && message.includes('media'))).toBe(true);
  });
});

function catalogAudioPath(url: string): string {
  const match = url.match(/audio\/(?:ambience|music|sfx)\/[^?#]+/);
  if (!match) throw new Error(`Unexpected audio URL: ${url}`);
  return match[0];
}

class FakeGainNode {
  gain = { value: 1 };
  connect(): FakeGainNode {
    return this;
  }
}

class FakeSourceNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  connect(): FakeGainNode {
    return new FakeGainNode();
  }
  start(): void {}
  stop(): void {}
  disconnect(): void {}
}

class FakeMediaElementSourceNode {
  connect(): FakeGainNode {
    return new FakeGainNode();
  }
  disconnect(): void {}
}

class FakeAudioContext {
  state: AudioContextState = 'running';
  destination = new FakeGainNode();
  async resume(): Promise<void> {}
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createBufferSource(): FakeSourceNode {
    return new FakeSourceNode();
  }
  createMediaElementSource(): FakeMediaElementSourceNode {
    return new FakeMediaElementSourceNode();
  }
  async decodeAudioData(): Promise<AudioBuffer> {
    return {} as AudioBuffer;
  }
  async close(): Promise<void> {}
}

class FakeAudioElement {
  preload = '';
  loop = false;
  src = '';
  ended = false;
  paused = true;
  error: { code: number } | null = { code: 4 };
  private listeners = new Map<string, () => void>();

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  async play(): Promise<void> {
    // Real HTMLMediaElement resets `ended` whenever a new `src` starts playing;
    // mirror that so repeated play() calls after a track change behave correctly.
    this.ended = false;
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.();
  }
}
