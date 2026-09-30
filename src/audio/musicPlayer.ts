import { MusicGen, type Culture, type Mood } from './music.ts';

/**
 * Plays MusicGen in the browser (M11.3): renders 2-second slices at the context's own sample rate (no resampling
 * seams) and schedules them back to back a few seconds ahead; the generator carries note tails and drone phase
 * across slices, so the joins are seamless. Mood and culture changes take effect at the next slice.
 */
const SLICE_S = 2;
const AHEAD_S = 5;

export class MusicPlayer {
  private readonly ctx: AudioContext;
  private readonly bus: GainNode;
  private readonly gen: MusicGen;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Slices scheduled so far (debug/e2e). */
  slices = 0;

  constructor(ctx: AudioContext, bus: GainNode, culture: Culture, seed: number) {
    this.ctx = ctx;
    this.bus = bus;
    this.gen = new MusicGen(ctx.sampleRate, culture, seed);
  }

  start(): void {
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.15;
    this.pump();
    this.timer = setInterval(() => this.pump(), 400);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get mood(): Mood {
    return this.gen.getMood();
  }

  setMood(m: Mood): void {
    this.gen.setMood(m);
  }

  setCulture(c: Culture): void {
    this.gen.setCulture(c);
  }

  private pump(): void {
    // If the context was suspended or the tab slept, restart the timeline instead of scheduling in the past.
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime - this.ctx.currentTime < AHEAD_S) {
      const [L, R] = this.gen.next(SLICE_S);
      const buf = this.ctx.createBuffer(2, L.length, this.gen.rate);
      buf.getChannelData(0).set(L);
      buf.getChannelData(1).set(R);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.bus);
      src.start(this.nextTime);
      this.nextTime += L.length / this.gen.rate;
      this.slices++;
    }
  }
}
