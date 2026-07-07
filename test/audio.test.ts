import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_ASSETS,
  AUDIO_EVENT_CUES,
  MUSIC_TRACKS,
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
      expect(AUDIO_ASSETS[cue.asset].url).toMatch(/^\/audio\/(sfx|ambience)\//);
      expect(cue.cooldownMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('routes survival verbs to readable feedback sounds', () => {
    expect(audioEventForCraft(true)).toBe('craftConfirm');
    expect(audioEventForCraft(false)).toBe('uiDeny');
    expect(audioEventForPlacement(true)).toBe('structurePlace');
    expect(audioEventForStructure('campfire', 'lit', true)).toBe('hearthRest');
    expect(audioEventForStructure('bedroll', 'home', true)).toBe('hearthRest');
    expect(audioEventForStructure('rainCistern', 'collectWater', true)).toBe('waterCatch');
    expect(audioEventForStructure('cropPlot', 'harvest', true)).toBe('gatherSoft');
    expect(audioEventForStructure('caveAnchor', 'anchor', true)).toBe('caveRead');
    expect(audioEventForStructure('weatherVane', 'forecast', true)).toBe('routeSlate');
    expect(audioEventForStructure('fishTrap', 'setTrap', true)).toBe('gatherSoft');
    expect(audioEventForStructure('fishTrap', 'collectTrap', true)).toBe('fishingCatch');
    expect(audioEventForStructure('shoreNet', 'setNet', true)).toBe('gatherSoft');
    expect(audioEventForStructure('shoreNet', 'collectNet', true)).toBe('fishingCatch');
    expect(audioEventForStructure('campfire', 'inspect', false)).toBe('uiDeny');
    expect(audioEventForFoodAction('fish', true)).toBe('fishingCatch');
    expect(audioEventForFoodAction('forage', true)).toBe('gatherSoft');
    expect(audioEventForFoodAction('eat', true)).toBe('hearthRest');
  });

  it('records events even before browser audio unlocks', () => {
    const audio = new GameAudio();
    expect(audio.state().unlocked).toBe(false);
    expect(audio.playEvent('skyfallGather')).toBe(false);
    expect(audio.playEvent('routeSlate')).toBe(false);
    const state = audio.state();
    expect(state.lastEvent).toBe('routeSlate');
    expect(state.lastAsset).toBe('routeSlate');
    expect(state.pendingEvents).toBeGreaterThanOrEqual(2);
    expect(state.playCounts.skyfallGather).toBe(1);
    expect(state.assetPlayCounts.skyfallGather).toBe(1);
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
      expect(track.url).toMatch(/^\/audio\/music\/\d\d-[a-z-]+\.mp3$/);
      expect(track.title.length).toBeGreaterThan(3);
      expect(Object.keys(AUDIO_ASSETS)).not.toContain(track.id);
    }
  });

  it('keeps committed soundtrack files inside the browser-game streaming budget', () => {
    let totalBytes = 0;
    for (const track of MUSIC_TRACKS) {
      const file = join(process.cwd(), 'public', track.url);
      expect(existsSync(file), track.url).toBe(true);
      const bytes = statSync(file).size;
      totalBytes += bytes;
      expect(bytes, track.url).toBeLessThanOrEqual(3.1 * 1024 * 1024);
    }
    expect(totalBytes).toBeLessThanOrEqual(36 * 1024 * 1024);
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
      planetWindLoop: {
        id: 'planetWindLoop',
        url: '/audio/ambience/planet-wind-loop.mp3',
        group: 'ambience',
        volume: 0.28,
        loop: true,
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
});

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
}
