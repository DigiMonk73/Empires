import { makeSfx, type SfxName } from './synth.ts';
import { MusicPlayer } from './musicPlayer.ts';
import type { Culture, Mood } from './music.ts';
import { DEFAULT_AUDIO, type AudioSettings } from './settings.ts';

/**
 * The mixer: master → { sfx, voice } buses, lazy AudioContext (browsers only start audio after a user gesture),
 * per-sound and global voice limits so a battle doesn't turn into noise, and simple 2-D positioning (pan by
 * screen x, quieter off-screen). Counts every sound played for tests (`stats`).
 */
/** Who speaks (M11.2): the role, voiced in the culture of the owner's architecture set. */
export type VoiceRole = 'villager' | 'soldier' | 'priest';
/** A voice set on disk: `<culture>/<role>` (e.g. `egyptian/soldier`) or `death`. */
export type VoiceSet = string;

const MAX_PER_SOUND = 4;
const MAX_TOTAL = 24;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private music: MusicPlayer | null = null;
  /** The music to play once the context exists (null: no music, e.g. tests that never click). */
  private musicWanted: { culture: Culture; seed: number } | null = null;
  private moodWanted: Mood = 'peace';
  private sfx: Record<SfxName, AudioBuffer> | null = null;
  private voices = new Map<string, { name: string; buf: AudioBuffer }[]>();
  private playing = new Map<string, number>();
  private total = 0;
  private lastAck = -1e9;
  muted = false;
  private levels: AudioSettings = { ...DEFAULT_AUDIO };
  /** Sounds started, by name (debug/e2e). */
  readonly stats: Record<string, number> = {};

  /** Create the context on the first user gesture (autoplay policy) and load everything. */
  armOnGesture(target: EventTarget = window): void {
    const start = () => {
      void this.start();
      target.removeEventListener('pointerdown', start);
      target.removeEventListener('keydown', start);
    };
    target.addEventListener('pointerdown', start);
    target.addEventListener('keydown', start);
  }

  async start(): Promise<void> {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.apply(this.levels);
    if (this.musicWanted) this.startMusic(this.musicWanted.culture, this.musicWanted.seed);
    this.sfx = makeSfx(ctx);
    try {
      const manifest = (await (await fetch('./audio/voices/manifest.json')).json()) as Record<string, string[]>;
      await Promise.all(
        Object.entries(manifest).map(async ([set, files]) => {
          const lines = await Promise.all(
            files.map(async (f) => ({
              name: f.slice(f.lastIndexOf('/') + 1).replace(/\.wav$/, ''),
              buf: await ctx.decodeAudioData(await (await fetch(`./audio/voices/${f}`)).arrayBuffer()),
            })),
          );
          this.voices.set(set, lines);
        }),
      );
    } catch (e) {
      console.warn('[audio] voices unavailable', e);
    }
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  }

  /** Generative music in `culture` (starts as soon as the audio context exists). */
  startMusic(culture: Culture, seed = 1): void {
    this.musicWanted = { culture, seed };
    if (!this.ctx || !this.musicBus || this.music) return;
    this.music = new MusicPlayer(this.ctx, this.musicBus, culture, seed);
    this.music.setMood(this.moodWanted);
    this.music.start();
  }

  setMood(m: Mood): void {
    this.moodWanted = m;
    this.music?.setMood(m);
  }

  /** Music state for tests: the mood asked for, the mood playing, slices scheduled. */
  get musicStats(): { mood: Mood; playing: Mood | null; slices: number } {
    return { mood: this.moodWanted, playing: this.music?.mood ?? null, slices: this.music?.slices ?? 0 };
  }

  get ready(): boolean {
    return !!this.ctx && !!this.sfx;
  }

  setMuted(m: boolean): void {
    this.apply({ ...this.levels, muted: m });
  }

  /** The mixer (M11.4): master, music, effects and voice levels (bus trims keep the defaults' balance). */
  apply(s: AudioSettings): void {
    this.levels = { ...s };
    this.muted = s.muted;
    if (!this.master) return;
    this.master.gain.value = s.muted ? 0 : s.master;
    this.sfxBus!.gain.value = s.sfx * 0.875;
    this.voiceBus!.gain.value = s.voice;
    this.musicBus!.gain.value = s.music * 0.75;
  }

  get settings(): AudioSettings {
    return { ...this.levels };
  }

  /** Play a synthesised effect. `pan` −1…1, `gain` 0…1. */
  play(name: SfxName, pan = 0, gain = 1): void {
    this.stats[name] = (this.stats[name] ?? 0) + 1;
    if (!this.ctx || !this.sfx || !this.sfxBus) return;
    this.startBuffer(name, this.sfx[name], this.sfxBus, pan, gain, 0.9 + Math.random() * 0.2);
  }

  /** A voice line from a set (random pick; `prefix` narrows it, e.g. 'ack' or 'select'). */
  voice(set: VoiceSet, prefix = '', pan = 0, gain = 1): void {
    const role = set.slice(set.indexOf('/') + 1);
    const key = `voice:${role}`; // counted by role (tests); the culture only picks the lines
    this.stats[key] = (this.stats[key] ?? 0) + 1;
    const all = this.voices.get(set) ?? this.voices.get(`greek/${role}`);
    if (!this.ctx || !this.voiceBus || !all?.length) return;
    const pick = all.filter((v) => v.name.startsWith(prefix));
    const from = pick.length ? pick : all;
    const line = from[Math.floor(Math.random() * from.length)]!;
    this.startBuffer(key, line.buf, this.voiceBus, pan, gain, set === 'death' ? 0.85 + Math.random() * 0.3 : 1);
  }

  /** Unit acknowledgement (select / command), at most one every 0.6 s — chatter without spam. */
  ack(set: VoiceSet, prefix: string): void {
    const now = performance.now();
    if (now - this.lastAck < 600) return;
    this.lastAck = now;
    this.voice(set, prefix);
  }

  private startBuffer(key: string, buf: AudioBuffer, bus: GainNode, pan: number, gain: number, rate: number): void {
    const ctx = this.ctx!;
    if ((this.playing.get(key) ?? 0) >= MAX_PER_SOUND || this.total >= MAX_TOTAL) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(g).connect(p).connect(bus);
    this.playing.set(key, (this.playing.get(key) ?? 0) + 1);
    this.total++;
    src.onended = () => {
      this.playing.set(key, (this.playing.get(key) ?? 1) - 1);
      this.total--;
    };
    src.start();
  }
}
