/**
 * Procedural sound effects (D13): every effect is synthesised once into an AudioBuffer at startup — no sound
 * files. A tiny seeded PRNG keeps them identical run to run.
 */
export type SfxName =
  | 'chop' | 'mine' | 'hammer' | 'hoe' | 'forage'
  | 'clash' | 'club' | 'bow' | 'sling' | 'thunk'
  | 'collapse' | 'thud'
  | 'built' | 'trained' | 'fanfare' | 'defeat' | 'alert' | 'click'
  | 'chant' | 'converted'
  // M11.1
  | 'hooves' | 'neigh' | 'trumpet' | 'camel' | 'roar'
  | 'launch' | 'crash' | 'twang'
  | 'splash' | 'sink' | 'fish'
  | 'heal' | 'coins' | 'fire' | 'place' | 'deny';

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
    // A priest's chant: a low voice-like drone rising a fifth ("oh — ah"), buzzy source through a soft formant.
    chant: render(ctx, 1.6, 19, (t) => {
      const f = t < 0.5 ? 146.8 : 220;
      const vib = 1 + 0.01 * Math.sin(2 * Math.PI * 5.5 * t);
      const src = saw(f * vib, t) * 0.6 + tone(f * vib, t) + 0.5 * tone(2 * f * vib, t);
      return src * env(t, 0.08, 0.42) * (t < 0.5 ? 1 : 0.9);
    }, (x, r) => lowpass(x, r, 900)),
    // Converted: two bright bell partials.
    converted: render(ctx, 1.2, 20, (t) => (tone(1046.5, t) + 0.6 * tone(1568, t) + 0.3 * tone(2637, t)) * env(t, 0.003, 0.35)),
    // ── M11.1 ────────────────────────────────────────────────────────────────────────────────────────────
    // Hooves: a gallop's four beats on turf.
    hooves: render(ctx, 0.5, 21, (t, _i, n) => {
      let v = 0;
      for (const at of [0, 0.07, 0.19, 0.26]) if (t >= at) v += (tone(95, t - at) * 0.8 + n() * 0.5) * env(t - at, 0.002, 0.025);
      return v;
    }, (x, r) => lowpass(x, r, 900)),
    // A horse's whinny: a nasal tone sweeping up then shaking down, through a formant-ish filter.
    neigh: render(ctx, 1.0, 22, (t, _i, n) => {
      const f = t < 0.25 ? 500 + 900 * (t / 0.25) : 1400 - 700 * ((t - 0.25) / 0.75);
      const shake = 1 + 0.06 * Math.sin(2 * Math.PI * (18 + 10 * t) * t);
      return (saw(f * shake, t) * 0.5 + tone(f * shake, t) + 0.15 * n()) * env(t, 0.03, 0.35);
    }, (x, r) => {
      highpass(x, r, 350);
      lowpass(x, r, 3200);
    }),
    // Elephant trumpet: a loud brassy blare with a rough growl, rising.
    trumpet: render(ctx, 1.2, 23, (t, _i, n) => {
      const f = 330 + 180 * Math.min(1, t / 0.4);
      const growl = 1 + 0.25 * Math.sin(2 * Math.PI * 32 * t);
      return (saw(f, t) * growl + 0.6 * saw(f * 1.5, t) + 0.2 * n()) * env(t, 0.05, 0.45);
    }, (x, r) => lowpass(x, r, 2600)),
    // Camel: a low, gargling bellow.
    camel: render(ctx, 0.8, 24, (t, _i, n) => (saw(110 + 20 * Math.sin(t * 9), t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 23 * t)) + 0.3 * n()) * env(t, 0.06, 0.3), (x, r) => lowpass(x, r, 700)),
    // Lion roar: a noisy low rumble swelling and dying.
    roar: render(ctx, 1.3, 25, (t, _i, n) => (n() * 0.8 + saw(90 - 20 * t, t) * 0.5) * Math.sin(Math.PI * Math.min(1, t / 1.3)) ** 1.4, (x, r) => {
      lowpass(x, r, 500);
      lowpass(x, r, 700);
    }),
    // Catapult launch: a creak of the winch, the arm's thump and the whoosh of the stone.
    launch: render(ctx, 0.8, 26, (t, _i, n) => {
      const creak = t < 0.15 ? saw(60 + 400 * t, t) * 0.4 * env(t, 0.01, 0.08) : 0;
      const thump = t > 0.12 ? tone(65, t - 0.12) * env(t - 0.12, 0.003, 0.08) : 0;
      const whoosh = t > 0.15 ? n() * Math.sin(Math.PI * Math.min(1, (t - 0.15) / 0.6)) * 0.5 : 0;
      return creak + thump + whoosh;
    }, (x, r) => lowpass(x, r, 1600)),
    // A boulder landing: a heavy thud and scattering stone.
    crash: render(ctx, 0.9, 27, (t, _i, n) => tone(55, t) * env(t, 0.002, 0.12) + n() * env(t, 0.002, 0.18) * 0.8 + (n() > 0.9 ? n() * env(t, 0.05, 0.25) : 0), (x, r) => lowpass(x, r, 1100)),
    // Ballista: a heavy, low bowstring.
    twang: pluck(ctx, 98, 0.6, 28),
    // Splash: a burst of bright water noise.
    splash: render(ctx, 0.6, 29, (t, _i, n) => n() * env(t, 0.004, 0.14) * (0.7 + 0.3 * Math.sin(t * 90)), (x, r) => {
      highpass(x, r, 500);
      lowpass(x, r, 5000);
    }),
    // A ship going down: timbers groaning, then a long gurgle.
    sink: render(ctx, 2.2, 30, (t, _i, n) => {
      const groan = saw(70 + 30 * Math.sin(t * 3), t) * env(t, 0.1, 0.5) * 0.6;
      const bubbles = (n() > 0.985 ? 1 : 0) * tone(300 + 400 * Math.abs(n()), t) * env(t, 0.3, 1.2);
      return groan + bubbles + n() * 0.25 * env(t, 0.05, 0.9);
    }, (x, r) => lowpass(x, r, 1400)),
    // Fishing: a small plop.
    fish: render(ctx, 0.25, 31, (t, _i, n) => tone(420 - 900 * t, t) * env(t, 0.002, 0.04) + 0.4 * n() * env(t, 0.001, 0.03), (x, r) => lowpass(x, r, 2500)),
    // A priest's healing: a soft rising chime.
    heal: render(ctx, 1.0, 32, (t) => {
      const note = (hz: number, at: number) => (t > at ? tone(hz, t - at) * env(t - at, 0.01, 0.3) : 0);
      return note(784, 0) + note(988, 0.1) * 0.8 + note(1175, 0.2) * 0.6;
    }),
    // Coins: a few small metallic clinks.
    coins: render(ctx, 0.5, 33, (t) => {
      let v = 0;
      for (const [at, hz] of [[0, 3200], [0.06, 4100], [0.11, 3600], [0.19, 4600]] as const) if (t >= at) v += (tone(hz, t - at) + 0.5 * tone(hz * 1.51, t - at)) * env(t - at, 0.001, 0.04);
      return v;
    }),
    // Fire: a crackle over a soft roar.
    fire: render(ctx, 1.4, 34, (t, _i, n) => n() * 0.25 + (n() > 0.97 ? n() * 1.2 : 0) * env(t % 0.35, 0.001, 0.01) * 4, (x, r) => lowpass(x, r, 2600)),
    // Placing a building: a solid wooden knock.
    place: render(ctx, 0.18, 35, (t, _i, n) => tone(180, t) * env(t, 0.002, 0.04) + tone(360, t) * 0.4 * env(t, 0.002, 0.03) + 0.2 * n() * env(t, 0.001, 0.01), (x, r) => lowpass(x, r, 2200)),
    // A refused order: a short low double blip.
    deny: render(ctx, 0.3, 36, (t) => {
      const note = (at: number) => (t > at ? (tone(196, t - at) + 0.3 * saw(196, t - at)) * env(t - at, 0.004, 0.05) : 0);
      return note(0) + note(0.12);
    }, (x, r) => lowpass(x, r, 1500)),
  };
}
