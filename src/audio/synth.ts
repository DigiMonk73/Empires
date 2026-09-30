/**
 * Procedural sound effects (D13): every effect is synthesised once into an AudioBuffer at startup — no sound
 * files. A tiny seeded PRNG keeps them identical run to run.
 */
export type SfxName =
  | 'chop' | 'mine' | 'hammer' | 'hoe' | 'forage'
  | 'clash' | 'club' | 'bow' | 'sling' | 'thunk'
  | 'collapse' | 'thud'
  | 'built' | 'trained' | 'fanfare' | 'defeat' | 'alert' | 'click';

type Gen = (t: number, i: number, noise: () => number) => number;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

const env = (t: number, a: number, d: number): number => (t < a ? t / a : Math.exp(-(t - a) / d));

/** One-pole filters applied over a rendered buffer. */
function lowpass(x: Float32Array, rate: number, hz: number): void {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / rate);
  let y = 0;
  for (let i = 0; i < x.length; i++) x[i] = y += k * (x[i]! - y);
}
function highpass(x: Float32Array, rate: number, hz: number): void {
  const k = Math.exp((-2 * Math.PI * hz) / rate);
  let py = 0;
  let px = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    py = k * (py + v - px);
    px = v;
    x[i] = py;
  }
}

function render(ctx: BaseAudioContext, secs: number, seed: number, gen: Gen, post?: (x: Float32Array, rate: number) => void): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.max(1, Math.floor(secs * rate));
  const buf = ctx.createBuffer(1, n, rate);
  const x = buf.getChannelData(0);
  const noise = rng(seed);
  for (let i = 0; i < n; i++) x[i] = gen(i / rate, i, noise);
  post?.(x, rate);
  // A 40 ms release so no effect stops with a click.
  const fade = Math.min(n, Math.floor(rate * 0.04));
  for (let i = 0; i < fade; i++) x[n - 1 - i] = x[n - 1 - i]! * (i / fade);
  // Normalise to −3 dBFS so mixing headroom is predictable.
  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]!));
  const g = 0.708 / peak;
  for (let i = 0; i < n; i++) x[i] = x[i]! * g;
  return buf;
}

/** Karplus–Strong pluck (bow string). */
function pluck(ctx: BaseAudioContext, hz: number, secs: number, seed: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const period = Math.round(rate / hz);
  const noise = rng(seed);
  const line = new Float32Array(period).map(() => noise());
  let k = 0;
  return render(ctx, secs, seed, (t) => {
    const a = line[k]!;
    const b = line[(k + 1) % period]!;
    line[k] = 0.5 * (a + b) * 0.996;
    k = (k + 1) % period;
    return a * env(t, 0.001, 0.12) + noise() * 0.15 * env(t, 0.001, 0.03);
  });
}

const tone = (hz: number, t: number): number => Math.sin(2 * Math.PI * hz * t);
const saw = (hz: number, t: number): number => 2 * ((hz * t) % 1) - 1;

export function makeSfx(ctx: BaseAudioContext): Record<SfxName, AudioBuffer> {
  return {
    // Axe into wood: a woody knock and a short splintery crack.
    chop: render(ctx, 0.22, 1, (t, _i, n) => tone(140, t) * env(t, 0.002, 0.04) * 0.9 + n() * env(t, 0.001, 0.02), (x, r) => lowpass(x, r, 2400)),
    // Pick on rock: inharmonic metallic ping.
    mine: render(ctx, 0.35, 2, (t, _i, n) => (tone(1320, t) + 0.6 * tone(2470, t) + 0.35 * tone(3910, t)) * env(t, 0.001, 0.07) + n() * env(t, 0.001, 0.008)),
    hammer: render(ctx, 0.16, 3, (t, _i, n) => tone(320, t) * env(t, 0.001, 0.03) + 0.5 * n() * env(t, 0.001, 0.01), (x, r) => lowpass(x, r, 3000)),
    hoe: render(ctx, 0.2, 4, (t, _i, n) => n() * env(t, 0.004, 0.05) + tone(90, t) * env(t, 0.002, 0.03), (x, r) => lowpass(x, r, 900)),
    forage: render(ctx, 0.18, 5, (t, _i, n) => n() * env(t, 0.01, 0.05), (x, r) => highpass(x, r, 1500)),
    // Weapons.
    clash: render(ctx, 0.3, 6, (t, _i, n) => (tone(1870, t) + 0.7 * tone(2930, t) + 0.5 * tone(4410, t)) * env(t, 0.001, 0.06) + n() * env(t, 0.001, 0.02), (x, r) => highpass(x, r, 600)),
    club: render(ctx, 0.18, 7, (t, _i, n) => tone(110, t) * env(t, 0.002, 0.05) + 0.6 * n() * env(t, 0.001, 0.015), (x, r) => lowpass(x, r, 1200)),
    bow: pluck(ctx, 196, 0.35, 8),
    sling: render(ctx, 0.3, 9, (t, _i, n) => n() * Math.sin(Math.PI * Math.min(1, t / 0.3)) * (0.6 + 0.4 * tone(18, t)), (x, r) => {
      highpass(x, r, 700);
      lowpass(x, r, 3500);
    }),
    thunk: render(ctx, 0.12, 10, (t, _i, n) => tone(220, t) * env(t, 0.001, 0.02) + 0.4 * n() * env(t, 0.001, 0.01), (x, r) => lowpass(x, r, 2000)),
    // Buildings and bodies.
    collapse: render(ctx, 1.6, 11, (t, _i, n) => n() * env(t, 0.02, 0.5) * (0.7 + 0.3 * Math.sin(t * 37)) + (n() > 0.97 ? n() : 0) * env(t, 0.1, 0.6), (x, r) => lowpass(x, r, 420)),
    thud: render(ctx, 0.25, 12, (t, _i, n) => tone(70, t) * env(t, 0.003, 0.07) + 0.4 * n() * env(t, 0.002, 0.03), (x, r) => lowpass(x, r, 600)),
    // Signals.
    built: render(ctx, 0.9, 13, (t) => (tone(523, t) * env(t, 0.005, 0.3) + tone(784, Math.max(0, t - 0.12)) * (t > 0.12 ? env(t - 0.12, 0.005, 0.35) : 0)) * 0.6),
    trained: render(ctx, 0.6, 14, (t) => (tone(660, t) + 0.4 * tone(1320, t)) * env(t, 0.004, 0.18)),
    fanfare: render(ctx, 2.8, 15, (t) => {
      const note = (hz: number, at: number) => (t > at ? (saw(hz, t) * 0.5 + tone(hz, t)) * env(t - at, 0.04, 0.9) : 0);
      return note(220, 0) + note(277.2, 0.15) + note(329.6, 0.3) + note(440, 0.45) * 1.2;
    }, (x, r) => lowpass(x, r, 1800)),
    defeat: render(ctx, 3.2, 16, (t) => (saw(110, t) * 0.4 + tone(110, t) + tone(130.8, t) * 0.8) * env(t, 0.1, 1.2), (x, r) => lowpass(x, r, 700)),
    // Horn call, high then low: attention without a siren.
    alert: render(ctx, 0.7, 17, (t) => {
      const note = (hz: number, at: number) => (t > at ? (tone(hz, t) + 0.3 * saw(hz, t)) * env(t - at, 0.015, 0.14) : 0);
      return note(880, 0) + note(660, 0.2);
    }, (x, r) => lowpass(x, r, 2500)),
    click: render(ctx, 0.04, 18, (t, _i, n) => n() * env(t, 0.0005, 0.006), (x, r) => highpass(x, r, 2000)),
  };
}
