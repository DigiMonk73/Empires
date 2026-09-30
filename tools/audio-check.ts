/**
 * Audio review (M11.5): renders every synthesised effect, reads every voice line, and renders 10 minutes of music
 * for each culture × mood offline (the same code the game runs) — then checks the M11 exit gates:
 *   · every peak ≤ −1 dBFS
 *   · no music gap > 10 s (a gap = 100 ms windows under −50 dBFS in a row)
 * and draws spectrograms to artifacts/audio/spec/ for the review (effects whole, music as 60 s excerpts).
 *   node tools/audio-check.ts [--minutes 10]
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { makeSfx } from '../src/audio/synth.ts';
import { MusicGen, type Culture, type Mood } from '../src/audio/music.ts';
import { readWav } from './wav.ts';

const mArg = process.argv.indexOf('--minutes');
const minutes = mArg >= 0 ? Number(process.argv[mArg + 1]) : 10;
const OUT = 'artifacts/audio/spec';
mkdirSync(OUT, { recursive: true });
const LIMIT = 10 ** (-1 / 20); // −1 dBFS
const fails: string[] = [];
const db = (v: number): string => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');

// ── Spectrogram ─────────────────────────────────────────────────────────────────────────────────────────────
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k);
        const wi = Math.sin(a * k);
        const xr = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi;
        const xi = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
        re[i + k + len / 2] = re[i + k]! - xr;
        im[i + k + len / 2] = im[i + k]! - xi;
        re[i + k] = re[i + k]! + xr;
        im[i + k] = im[i + k]! + xi;
      }
    }
  }
}

/** A log-frequency spectrogram PNG (time →, frequency ↑ 40 Hz…nyquist, −90…0 dB in a heat ramp). */
function spectrogram(x: Float32Array, rate: number, file: string, width = 600, height = 200): void {
  const N = 1024;
  const png = new PNG({ width, height });
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const fLo = Math.log(40);
  const fHi = Math.log(rate / 2);
  for (let c = 0; c < width; c++) {
    const start = Math.floor((c / width) * Math.max(0, x.length - N));
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = (x[start + i] ?? 0) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let r = 0; r < height; r++) {
      const f = Math.exp(fLo + ((height - 1 - r) / (height - 1)) * (fHi - fLo));
      const bin = Math.min(N / 2 - 1, Math.round((f / rate) * N));
      const mag = Math.hypot(re[bin]!, im[bin]!) / (N / 4);
      const d = Math.max(0, Math.min(1, (20 * Math.log10(mag + 1e-9) + 90) / 90));
      const o = (r * width + c) * 4;
      png.data[o] = Math.round(255 * Math.min(1, d * 1.8));
      png.data[o + 1] = Math.round(255 * Math.max(0, Math.min(1, d * 1.8 - 0.6)));
      png.data[o + 2] = Math.round(255 * Math.max(0, d * 3 - 2.2) + 40 * (1 - d));
      png.data[o + 3] = 255;
    }
  }
  writeFileSync(file, PNG.sync.write(png));
}

function peakOf(x: Float32Array): number {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  return p;
}

// ── Effects ─────────────────────────────────────────────────────────────────────────────────────────────────
const RATE = 44100;
const ctx = {
  sampleRate: RATE,
  createBuffer: (_c: number, n: number) => {
    const d = new Float32Array(n);
    return { length: n, getChannelData: () => d };
  },
} as unknown as BaseAudioContext;
const sfx = makeSfx(ctx);
let worstSfx = 0;
for (const [name, buf] of Object.entries(sfx)) {
  const x = buf.getChannelData(0);
  const p = peakOf(x);
  worstSfx = Math.max(worstSfx, p);
  if (p > LIMIT) fails.push(`effect ${name} peaks at ${db(p)} dBFS`);
  spectrogram(x, RATE, join(OUT, `sfx-${name}.png`), 300, 120);
}
console.log(`effects: ${Object.keys(sfx).length}, loudest peak ${db(worstSfx)} dBFS`);

// ── Voices ──────────────────────────────────────────────────────────────────────────────────────────────────
const VOICES = 'public/audio/voices';
const manifest = JSON.parse(readFileSync(join(VOICES, 'manifest.json'), 'utf8')) as Record<string, string[]>;
let nVoices = 0;
let worstVoice = 0;
for (const files of Object.values(manifest)) {
  for (const f of files) {
    const w = readWav(join(VOICES, f));
    const x = Float32Array.from(w.samples, (v) => v / 32768);
    const p = peakOf(x);
    worstVoice = Math.max(worstVoice, p);
    if (p > LIMIT + 1e-4) fails.push(`voice ${f} peaks at ${db(p)} dBFS`);
    nVoices++;
  }
}
console.log(`voices: ${nVoices}, loudest peak ${db(worstVoice)} dBFS (sets: ${Object.keys(manifest).length})`);
void readdirSync;

// ── Music ───────────────────────────────────────────────────────────────────────────────────────────────────
const MRATE = 22050;
const cultures: Culture[] = ['greek', 'roman', 'egyptian', 'babylonian', 'asian'];
const moods: Mood[] = ['peace', 'tension', 'battle'];
for (const c of cultures) {
  const cells: string[] = [];
  for (const m of moods) {
    const g = new MusicGen(MRATE, c, 17);
    g.setMood(m);
    const total = minutes * 60;
    const win = Math.floor(MRATE * 0.1);
    let peak = 0;
    let quiet = 0;
    let longestGap = 0;
    const excerpt = new Float32Array(MRATE * 60);
    let at = 0;
    for (let t = 0; t < total; t += 4) {
      const [L, R] = g.next(4);
      peak = Math.max(peak, peakOf(L), peakOf(R));
      for (let w = 0; w + win <= L.length; w += win) {
        let sq = 0;
        for (let i = w; i < w + win; i++) sq += L[i]! * L[i]!;
        if (Math.sqrt(sq / win) < 10 ** (-50 / 20)) {
          quiet++;
          longestGap = Math.max(longestGap, quiet * 0.1);
        } else quiet = 0;
      }
      if (at < excerpt.length) {
        excerpt.set(L.subarray(0, Math.min(L.length, excerpt.length - at)), at);
        at += L.length;
      }
    }
    if (peak > LIMIT) fails.push(`music ${c} ${m} peaks at ${db(peak)} dBFS`);
    if (longestGap > 10) fails.push(`music ${c} ${m}: a ${longestGap.toFixed(1)} s gap`);
    spectrogram(excerpt, MRATE, join(OUT, `music-${c}-${m}.png`));
    cells.push(`${m} peak ${db(peak)} gap ${longestGap.toFixed(1)} s`);
  }
  console.log(`music ${c} (${minutes} min each): ${cells.join(' · ')}`);
}

console.log(fails.length ? `AUDIO CHECK FAILED:\n  ${fails.join('\n  ')}` : `audio check ok → spectrograms in ${OUT}`);
process.exit(fails.length ? 1 : 0);
