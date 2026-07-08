import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_ASSETS,
  AUDIO_EVENT_CUES,
  MUSIC_TRACKS,
  audioUrl,
  audioEventForCraft,
  audioEventForFoodAction,
  audioEventForPlacement,
  audioEventForStructure,
  type AudioAssetDef,
  type AudioAssetId,
} from '../src/audio/events';
import { GameAudio } from '../src/audio/gameAudio';

describe('Hearth and Horizon audio events', () => {
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

  it('routes survival verbs to readable feedback sounds', () => {
    expect(audioEventForCraft(true)).toBe('craftConfirm');
    expect(audioEventForCraft(false)).toBe('uiDeny');
    expect(audioEventForPlacement(true)).toBe('structurePlace');
    expect(audioEventForStructure('campfire', 'lit', true)).toBe('hearthRest');
    expect(audioEventForStructure('bedroll', 'home', true)).toBe('hearthRest');
    expect(audioEventForStructure('chest', 'deposit', true)).toBe('structurePlace');
    expect(audioEventForStructure('chest', 'withdraw', true)).toBe('structurePlace');
    expect(audioEventForStructure('campfire', 'inspect', false)).toBe('uiDeny');
    expect(audioEventForFoodAction('fish', true)).toBe('fishingCatch');
    expect(audioEventForFoodAction('forage', true)).toBe('gatherSoft');
    expect(audioEventForFoodAction('eat', true)).toBe('hearthRest');
  });

  it('records events even before browser audio unlocks', () => {
    const audio = new GameAudio();
    expect(audio.state().unlocked).toBe(false);
    expect(audio.playEvent('fishingCatch')).toBe(false);
    expect(audio.playEvent('routeSlate')).toBe(false);
    const state = audio.state();
    expect(state.lastEvent).toBe('routeSlate');
    expect(state.lastAsset).toBe('routeSlate');
    expect(state.pendingEvents).toBeGreaterThanOrEqual(2);
    expect(state.playCounts.fishingCatch).toBe(1);
    expect(state.assetPlayCounts.fishingCatch).toBe(1);
  });

  it('keeps mute state and group volumes in diagnostics', () => {
    const audio = new GameAudio();
    audio.setMuted(true);
    audio.setGroupVolume('ambience', 0.25);
    const state = audio.state();
    expect(state.muted).toBe(true);
    expect(state.volumes.ambience).toBe(0.25);
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
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.();
  }
}
