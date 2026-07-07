import {
  AUDIO_ASSETS,
  AUDIO_EVENT_CUES,
  MUSIC_TRACKS,
  type AudioAssetDef,
  type AudioAssetId,
  type AudioEventId,
  type AudioGroup,
} from './events';

type AudioContextCtor = new () => AudioContext;

export interface GameAudioState {
  supported: boolean;
  unlocked: boolean;
  muted: boolean;
  contextState: AudioContextState | 'unavailable';
  loaded: AudioAssetId[];
  loading: AudioAssetId[];
  failed: AudioAssetId[];
  lastEvent: AudioEventId | null;
  lastAsset: AudioAssetId | null;
  pendingEvents: number;
  playCounts: Partial<Record<AudioEventId, number>>;
  assetPlayCounts: Partial<Record<AudioAssetId, number>>;
  ambiencePlaying: boolean;
  musicStarted: boolean;
  musicPlaying: boolean;
  musicQueued: boolean;
  musicTrackId: string | null;
  musicTrack: string | null;
  musicTrackCount: number;
  errors: string[];
  volumes: Record<AudioGroup | 'master', number>;
}

const DEFAULT_VOLUMES: Record<AudioGroup | 'master', number> = {
  master: 0.85,
  ui: 0.9,
  sfx: 0.85,
  ambience: 0.46,
  music: 0.5,
};

// Silence between soundtrack tracks — long and slightly random so the score reads as
// weather, not a playlist (à la C418), and never lands on a fixed cadence.
const MUSIC_GAP_MIN_MS = 28_000;
const MUSIC_GAP_MAX_MS = 75_000;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<AudioAssetId, AudioBuffer>();
  private readonly loading = new Map<AudioAssetId, Promise<void>>();
  private readonly failed = new Set<AudioAssetId>();
  private readonly gains = new Map<AudioGroup | 'master', GainNode>();
  private readonly lastPlayedAt = new Map<AudioEventId, number>();
  private readonly eventCounts = new Map<AudioEventId, number>();
  private readonly assetCounts = new Map<AudioAssetId, number>();
  private readonly errors: string[] = [];
  private ambienceSource: AudioBufferSourceNode | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private musicOrder: number[] = [];
  private musicPos = 0;
  private musicStarted = false;
  private musicTrackId: string | null = null;
  private musicTitle: string | null = null;
  private musicGapTimer: ReturnType<typeof setTimeout> | null = null;
  private unlocked = false;
  private muted = false;
  private pendingEvents = 0;
  private lastEvent: AudioEventId | null = null;
  private lastAsset: AudioAssetId | null = null;
  private loadAllStarted = false;
  private volumes = { ...DEFAULT_VOLUMES };

  constructor(
    private readonly assets: Record<AudioAssetId, AudioAssetDef> = AUDIO_ASSETS,
    private readonly createContext: (() => AudioContext | null) | null = null,
  ) {}

  get supported(): boolean {
    return this.contextFactory() !== null;
  }

  async unlock(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      if (ctx.state !== 'running') await ctx.resume();
      this.unlocked = ctx.state === 'running';
      if (this.unlocked) {
        this.startUnlockedAudio();
      }
      return this.unlocked;
    } catch (err) {
      this.recordError(`unlock failed: ${errorMessage(err)}`);
      return false;
    }
  }

  playEvent(id: AudioEventId, volume = 1): boolean {
    const cue = AUDIO_EVENT_CUES[id];
    this.lastEvent = id;
    this.eventCounts.set(id, (this.eventCounts.get(id) ?? 0) + 1);
    if (!cue) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const lastAt = this.lastPlayedAt.get(id) ?? -Infinity;
    if (now - lastAt < cue.cooldownMs) return false;
    this.lastPlayedAt.set(id, now);
    return this.playAsset(cue.asset, volume * (cue.volume ?? 1));
  }

  playAsset(id: AudioAssetId, volume = 1): boolean {
    this.lastAsset = id;
    this.assetCounts.set(id, (this.assetCounts.get(id) ?? 0) + 1);
    if (this.muted) return false;
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || ctx.state !== 'running') {
      this.pendingEvents++;
      return false;
    }
    const buffer = this.buffers.get(id);
    if (!buffer) {
      void this.loadAsset(id);
      this.pendingEvents++;
      return false;
    }
    try {
      const def = this.assets[id];
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = def.loop === true;
      gain.gain.value = Math.max(0, Math.min(1.5, def.volume * volume));
      source.connect(gain).connect(this.gains.get(def.group) ?? ctx.destination);
      source.start();
      if (def.loop) this.ambienceSource = source;
      return true;
    } catch (err) {
      this.recordError(`play ${id} failed: ${errorMessage(err)}`);
      return false;
    }
  }

  startAmbience(): boolean {
    if (this.ambienceSource || this.muted) return false;
    return this.playAsset('planetWindLoop');
  }

  stopAmbience(): void {
    if (!this.ambienceSource) return;
    try {
      this.ambienceSource.stop();
    } catch {
      // Already stopped by the browser.
    }
    this.ambienceSource.disconnect();
    this.ambienceSource = null;
  }

  /**
   * Start streaming "The Twelve Bells" through an HTMLAudioElement routed into the
   * `music` gain node. Shuffled album order, long silences between tracks. Safe to call
   * before unlock or in a headless/test context — it no-ops when the DOM audio element
   * or a running AudioContext is unavailable.
   */
  startMusic(): void {
    if (this.musicStarted || this.muted || MUSIC_TRACKS.length === 0) return;
    if (typeof Audio === 'undefined') return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    let el: HTMLAudioElement;
    try {
      el = new Audio();
      el.preload = 'none';
      el.loop = false;
      const source = ctx.createMediaElementSource(el);
      source.connect(this.gains.get('music') ?? ctx.destination);
      el.addEventListener('ended', () => this.scheduleNextMusic());
      el.addEventListener('error', () => this.scheduleNextMusic());
      this.musicSource = source;
    } catch (err) {
      this.recordError(`music init failed: ${errorMessage(err)}`);
      return;
    }
    this.musicEl = el;
    this.musicStarted = true;
    this.musicOrder = this.shuffledTrackOrder();
    this.musicPos = 0;
    this.playCurrentMusic();
  }

  stopMusic(): void {
    if (this.musicGapTimer) {
      clearTimeout(this.musicGapTimer);
      this.musicGapTimer = null;
    }
    if (this.musicEl) {
      try {
        this.musicEl.pause();
      } catch {
        // Already stopped by the browser.
      }
    }
    this.musicSource?.disconnect();
    this.musicSource = null;
    this.musicEl = null;
    this.musicStarted = false;
    this.musicTrackId = null;
    this.musicTitle = null;
  }

  /** Pause soundtrack playback (e.g. hidden tab); the gap timer is paused with it. */
  pauseMusic(): void {
    if (this.musicGapTimer) {
      clearTimeout(this.musicGapTimer);
      this.musicGapTimer = null;
    }
    try {
      this.musicEl?.pause();
    } catch {
      // ignore
    }
  }

  /** Resume soundtrack playback after a pause; restarts the gap loop if between tracks. */
  resumeMusic(): void {
    if (this.muted) return;
    if (!this.musicStarted) {
      if (this.unlocked) this.startMusic();
      return;
    }
    if (!this.musicEl) return;
    if (this.musicEl.src && !this.musicEl.ended) {
      void this.musicEl.play().catch(() => {});
    } else {
      this.scheduleNextMusic();
    }
  }

  private playCurrentMusic(): void {
    const el = this.musicEl;
    if (!el || this.musicOrder.length === 0) return;
    const track = MUSIC_TRACKS[this.musicOrder[this.musicPos]];
    if (!track) return;
    this.musicTrackId = track.id;
    this.musicTitle = track.title;
    el.src = track.url;
    void el.play().catch((err) => {
      this.recordError(`music play failed: ${errorMessage(err)}`);
    });
  }

  private scheduleNextMusic(): void {
    if (!this.musicStarted || !this.musicEl) return;
    if (this.musicGapTimer) clearTimeout(this.musicGapTimer);
    this.musicPos += 1;
    if (this.musicPos >= this.musicOrder.length) {
      this.musicOrder = this.shuffledTrackOrder();
      this.musicPos = 0;
    }
    const span = MUSIC_GAP_MAX_MS - MUSIC_GAP_MIN_MS;
    const gap = MUSIC_GAP_MIN_MS + Math.floor(Math.random() * (span + 1));
    this.musicGapTimer = setTimeout(() => {
      this.musicGapTimer = null;
      if (!this.muted) this.playCurrentMusic();
    }, gap);
  }

  private shuffledTrackOrder(): number[] {
    const order = MUSIC_TRACKS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
    if (muted) this.pauseMusic();
    else this.startUnlockedAudio();
  }

  setPageVisible(visible: boolean): void {
    if (!visible) {
      this.stopAmbience();
      this.pauseMusic();
      return;
    }
    this.startUnlockedAudio();
  }

  setGroupVolume(group: AudioGroup | 'master', volume: number): void {
    this.volumes[group] = Math.max(0, Math.min(1, volume));
    this.applyVolumes();
  }

  loadAll(): void {
    if (this.loadAllStarted) return;
    this.loadAllStarted = true;
    for (const id of Object.keys(this.assets) as AudioAssetId[]) void this.loadAsset(id);
  }

  async loadAsset(id: AudioAssetId): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || this.buffers.has(id)) return;
    const existing = this.loading.get(id);
    if (existing) return existing;
    const task = fetch(this.assets[id].url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(id, buffer);
        this.failed.delete(id);
      })
      .catch((err) => {
        this.failed.add(id);
        this.recordError(`load ${id} failed: ${errorMessage(err)}`);
      })
      .finally(() => {
        this.loading.delete(id);
      });
    this.loading.set(id, task);
    return task;
  }

  state(): GameAudioState {
    return {
      supported: this.supported,
      unlocked: this.unlocked,
      muted: this.muted,
      contextState: this.ctx?.state ?? 'unavailable',
      loaded: [...this.buffers.keys()].sort(),
      loading: [...this.loading.keys()].sort(),
      failed: [...this.failed].sort(),
      lastEvent: this.lastEvent,
      lastAsset: this.lastAsset,
      pendingEvents: this.pendingEvents,
      playCounts: Object.fromEntries(this.eventCounts) as Partial<Record<AudioEventId, number>>,
      assetPlayCounts: Object.fromEntries(this.assetCounts) as Partial<Record<AudioAssetId, number>>,
      ambiencePlaying: this.ambienceSource !== null,
      musicStarted: this.musicStarted,
      musicPlaying: this.musicEl !== null && !this.musicEl.paused,
      musicQueued: this.musicGapTimer !== null,
      musicTrackId: this.musicTrackId,
      musicTrack: this.musicTitle,
      musicTrackCount: MUSIC_TRACKS.length,
      errors: this.errors.slice(-8),
      volumes: { ...this.volumes },
    };
  }

  dispose(): void {
    this.stopAmbience();
    this.stopMusic();
    this.buffers.clear();
    this.loading.clear();
    this.failed.clear();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.unlocked = false;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const make = this.contextFactory();
    if (!make) return null;
    try {
      const ctx = make();
      this.ctx = ctx;
      const master = ctx.createGain();
      this.gains.set('master', master);
      master.connect(ctx.destination);
      for (const group of ['ui', 'sfx', 'ambience', 'music'] as const) {
        const gain = ctx.createGain();
        gain.connect(master);
        this.gains.set(group, gain);
      }
      this.applyVolumes();
      return ctx;
    } catch (err) {
      this.recordError(`context failed: ${errorMessage(err)}`);
      return null;
    }
  }

  private startUnlockedAudio(): void {
    if (!this.unlocked || this.muted) return;
    this.loadAll();
    void this.loadAsset('planetWindLoop').then(() => this.startAmbience());
    if (this.musicStarted) this.resumeMusic();
    else this.startMusic();
  }

  private applyVolumes(): void {
    for (const [group, gain] of this.gains) {
      const volume = this.muted ? 0 : this.volumes[group];
      gain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  private contextFactory(): (() => AudioContext) | null {
    if (this.createContext) {
      const created = this.createContext;
      return () => {
        const ctx = created();
        if (!ctx) throw new Error('AudioContext unavailable');
        return ctx;
      };
    }
    if (typeof window === 'undefined') return null;
    const win = window as Window & { webkitAudioContext?: AudioContextCtor };
    const Ctor = window.AudioContext ?? win.webkitAudioContext;
    return Ctor ? () => new Ctor() : null;
  }

  private recordError(message: string): void {
    this.errors.push(message);
    if (this.errors.length > 16) this.errors.splice(0, this.errors.length - 16);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
