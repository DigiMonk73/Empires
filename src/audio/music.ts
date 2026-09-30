/**
 * Generative music (M11.3, D13): a small ensemble synthesised in plain JavaScript — a plucked lyre (Karplus–Strong),
 * a breathy reed, a frame drum and a drone — playing in each culture's mode, in three moods (peace, tension,
 * battle). `MusicGen.next()` renders the next slice of stereo audio; note tails ring on into the following slices
 * (they are carried, not cut) and the drone keeps its phase, so slices join seamlessly. Deterministic for a seed,
 * so the offline checker (tools/audio-check.ts) hears exactly what the game plays. A soft limiter keeps every
 * sample under −1 dBFS.
 */
export type Mood = 'peace' | 'tension' | 'battle';
export type Culture = 'egyptian' | 'greek' | 'babylonian' | 'asian' | 'roman';

interface Style {
  tonic: number; // Hz
  mode: readonly number[]; // semitones above the tonic
  reed: number; // how much the reed sings (0–1)
}
const STYLES: Record<Culture, Style> = {
  greek: { tonic: 146.83, mode: [0, 2, 3, 5, 7, 9, 10], reed: 0.8 }, // D dorian
  roman: { tonic: 130.81, mode: [0, 2, 4, 5, 7, 9, 10], reed: 0.5 }, // C mixolydian
  egyptian: { tonic: 164.81, mode: [0, 1, 4, 5, 7, 8, 10], reed: 1 }, // E hijaz
  babylonian: { tonic: 138.59, mode: [0, 1, 3, 5, 7, 8, 10], reed: 0.9 }, // C# phrygian
  asian: { tonic: 146.83, mode: [0, 2, 5, 7, 9], reed: 0.7 }, // D yo pentatonic
};
const MOODS: Record<Mood, { bpm: number; lyre: number; drum: number; reed: number; drone: number; low: boolean }> = {
  peace: { bpm: 66, lyre: 0.45, drum: 0.18, reed: 0.35, drone: 0.2, low: false },
  tension: { bpm: 84, lyre: 0.7, drum: 0.55, reed: 0.2, drone: 0.3, low: true },
  battle: { bpm: 112, lyre: 0.9, drum: 1, reed: 0.1, drone: 0.34, low: true },
};

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

export class MusicGen {
  readonly rate: number;
  private culture: Culture;
  private mood: Mood = 'peace';
  private readonly r: () => number;
  /** Rendered but not yet delivered (note tails spill into it), stereo. */
  private carryL: Float32Array;
  private carryR: Float32Array;
  private carryLen = 0;
  /** Musical time (beats) at the start of the next slice, and the melody's position in the mode. */
  private beat = 0;
  /** Seconds rendered so far (the drone's breathing runs on it). */
  private time = 0;
  private degree = 0;
  private chord = 0;
  private dronePhase = [0, 0, 0];
  private droneGain = 0.2;
  private readonly tail: number;

  constructor(rate: number, culture: Culture, seed = 1) {
    this.rate = rate;
    this.culture = culture;
    this.r = rng(seed * 2654435761 + culture.length);
    this.tail = Math.floor(rate * 4); // longest ring-out
    this.carryL = new Float32Array(this.tail);
    this.carryR = new Float32Array(this.tail);
  }

  setMood(m: Mood): void {
    this.mood = m;
  }
  getMood(): Mood {
    return this.mood;
  }
  setCulture(c: Culture): void {
    this.culture = c;
  }

  private hz(degree: number, octave = 0): number {
    const mode = STYLES[this.culture].mode;
    const n = mode.length;
    const o = Math.floor(degree / n);
    const d = ((degree % n) + n) % n;
    return STYLES[this.culture].tonic * 2 ** (o + octave + mode[d]! / 12);
  }

  /** Render the next `secs` seconds: [left, right]. */
  next(secs = 4): [Float32Array, Float32Array] {
    const n = Math.floor(secs * this.rate);
    const L = new Float32Array(n + this.tail);
    const R = new Float32Array(n + this.tail);
    L.set(this.carryL.subarray(0, this.carryLen));
    R.set(this.carryR.subarray(0, this.carryLen));
    const md = MOODS[this.mood];
    const st = STYLES[this.culture];
    this.drone(L, R, n, md.drone);
    // Notes on an eighth-note grid.
    const beatSecs = 60 / md.bpm;
    const step = beatSecs / 2;
    const first = Math.ceil(this.beat * 2 - 1e-9) / 2;
    for (let b = first; (b - this.beat) * beatSecs < secs; b += 0.5) {
      const at = Math.floor((b - this.beat) * beatSecs * this.rate);
      const bar = Math.floor(b / 4);
      const inBar = b - bar * 4;
      if (inBar === 0) this.chord = [0, 3, 4, 0, 5, 3, 4, 6][bar % 8]! + (this.r() < 0.2 ? 1 : 0);
      this.drum(L, R, at, inBar, md.drum);
      this.lyre(L, R, at, inBar, md, step);
      if (inBar === 0 && this.r() < md.reed * st.reed) this.reed(L, R, at, beatSecs * (2 + Math.floor(this.r() * 3)));
    }
    this.beat += secs / beatSecs;
    this.time += n / this.rate;
    // Soft limiter: peaks stay under −1 dBFS (0.891).
    for (let i = 0; i < n; i++) {
      L[i] = 0.88 * Math.tanh(L[i]! * 1.1);
      R[i] = 0.88 * Math.tanh(R[i]! * 1.1);
    }
    this.carryLen = this.tail;
    this.carryL = L.slice(n, n + this.tail);
    this.carryR = R.slice(n, n + this.tail);
    return [L.subarray(0, n), R.subarray(0, n)];
  }

  /** Tonic, fifth and octave, slowly breathing; its level eases toward the mood's. */
  private drone(L: Float32Array, R: Float32Array, n: number, target: number): void {
    const f = [this.hz(0, -1), this.hz(0, -1) * 1.5, this.hz(0, 0)];
    const amp = [1, 0.55, 0.3];
    for (let i = 0; i < n; i++) {
      this.droneGain += (target - this.droneGain) * 0.00002;
      let v = 0;
      for (let k = 0; k < 3; k++) {
        this.dronePhase[k] = (this.dronePhase[k]! + f[k]! / this.rate) % 1;
        const ph = this.dronePhase[k]!;
        v += amp[k]! * (Math.sin(TAU * ph) + 0.25 * Math.sin(TAU * 2 * ph));
      }
      const breath = 0.8 + 0.2 * Math.sin(TAU * 0.07 * (i / this.rate + this.time));
      v *= this.droneGain * 0.22 * breath;
      L[i] = L[i]! + v;
      R[i] = R[i]! + v;
    }
  }

  private drum(L: Float32Array, R: Float32Array, at: number, inBar: number, level: number): void {
    if (level <= 0) return;
    const md = this.mood;
    // Patterns (eighths in a 4/4 bar): peace — beats 1 and 3; tension — a steady pulse; battle — driving.
    const hitsOn: Record<Mood, readonly number[]> = { peace: [0, 2.5], tension: [0, 1, 2, 3, 3.5], battle: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] };
    if (!hitsOn[md].includes(inBar)) return;
    const strong = inBar === 0 || inBar === 2;
    const g = level * (strong ? 0.55 : 0.3) * (0.85 + 0.3 * this.r());
    const len = Math.floor(this.rate * 0.35);
    const rr = rng(Math.floor(this.r() * 1e9));
    let ph = 0;
    for (let i = 0; i < len && at + i < L.length; i++) {
      const t = i / this.rate;
      const f = 55 + 70 * Math.exp(-t * 30);
      ph += f / this.rate;
      const body = Math.sin(TAU * ph) * Math.exp(-t * 9);
      const slap = (rr() * 2 - 1) * Math.exp(-t * 60) * (strong ? 0.35 : 0.55);
      const v = (body + slap) * g;
      L[at + i] = L[at + i]! + v * 0.95;
      R[at + i] = R[at + i]! + v * 1.05;
    }
  }

  private lyre(L: Float32Array, R: Float32Array, at: number, inBar: number, md: (typeof MOODS)[Mood], step: number): void {
    const density = md.lyre;
    // Chord tones on the strong eighths, passing notes between; battle repeats the chord root fast.
    const strong = inBar === Math.floor(inBar);
    if (this.r() > density * (strong ? 1 : 0.6)) return;
    let degree: number;
    if (this.mood === 'battle' && strong) degree = this.chord;
    else if (strong) degree = this.chord + [0, 2, 4][Math.floor(this.r() * 3)]!;
    else {
      this.degree += this.r() < 0.5 ? -1 : 1;
      if (Math.abs(this.degree - this.chord) > 5) this.degree = this.chord + 2;
      degree = this.degree;
    }
    const octave = md.low ? 0 : 1;
    this.pluck(L, R, at, this.hz(degree, octave), 0.32 + 0.15 * this.r(), (this.r() - 0.5) * 0.6, Math.min(3.2, step * 6));
  }

  /** Karplus–Strong pluck into the buffers at `at`, panned. */
  private pluck(L: Float32Array, R: Float32Array, at: number, hz: number, gain: number, pan: number, secs: number): void {
    const period = Math.max(2, Math.round(this.rate / hz));
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = this.r() * 2 - 1;
    const len = Math.min(Math.floor(secs * this.rate), L.length - at);
    const gl = gain * (1 - pan) * 0.5;
    const gr = gain * (1 + pan) * 0.5;
    let k = 0;
    for (let i = 0; i < len; i++) {
      const a = line[k]!;
      const b = line[(k + 1) % period]!;
      line[k] = 0.5 * (a + b) * 0.997;
      k = (k + 1) % period;
      const fade = i > len - 400 ? (len - i) / 400 : 1;
      L[at + i] = L[at + i]! + a * gl * fade;
      R[at + i] = R[at + i]! + a * gr * fade;
    }
  }

  /** A breathy reed (ney) holding a mode note with a slow swell, vibrato and breath noise. */
  private reed(L: Float32Array, R: Float32Array, at: number, secs: number): void {
    const hz = this.hz(this.chord + [4, 2, 5, 7][Math.floor(this.r() * 4)]!, 1);
    const len = Math.min(Math.floor(secs * this.rate), L.length - at);
    const rr = rng(Math.floor(this.r() * 1e9));
    let ph = 0;
    let nz = 0;
    for (let i = 0; i < len; i++) {
      const t = i / this.rate;
      const u = t / secs;
      const envv = Math.min(1, u * 5) * Math.min(1, (1 - u) * 4);
      ph += (hz * (1 + 0.012 * Math.sin(TAU * 5 * t) * Math.min(1, t * 2))) / this.rate;
      nz += ((rr() * 2 - 1) - nz) * 0.15;
      const v = (Math.sin(TAU * ph) + 0.2 * Math.sin(TAU * 2 * ph) + 0.25 * nz) * envv * 0.13;
      L[at + i] = L[at + i]! + v * 1.1;
      R[at + i] = R[at + i]! + v * 0.9;
    }
  }
}
