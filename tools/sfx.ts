/**
 * Render every synthesised effect (src/audio/synth.ts) to artifacts/audio/sfx/<name>.wav and print its length,
 * peak and RMS — for listening at a playtest and for the M11 audio review.
 *   node tools/sfx.ts
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeSfx } from '../src/audio/synth.ts';
import { writeWav } from './wav.ts';

const OUT = 'artifacts/audio/sfx';
const RATE = 44100;
mkdirSync(OUT, { recursive: true });
// makeSfx only needs sampleRate and createBuffer: a Node stand-in for BaseAudioContext.
const ctx = {
  sampleRate: RATE,
  createBuffer: (_ch: number, n: number) => {
    const data = new Float32Array(n);
    return { length: n, getChannelData: () => data };
  },
} as unknown as BaseAudioContext;
const db = (v: number): string => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
for (const [name, buf] of Object.entries(makeSfx(ctx))) {
  const x = buf.getChannelData(0);
  let peak = 0;
  let sq = 0;
  for (const v of x) {
    peak = Math.max(peak, Math.abs(v));
    sq += v * v;
  }
  const samples = Int16Array.from(x, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767));
  writeWav(join(OUT, `${name}.wav`), { rate: RATE, samples });
  console.log(`${name.padEnd(9)} ${(x.length / RATE).toFixed(2)} s  peak ${db(peak)} dBFS  rms ${db(Math.sqrt(sq / x.length))} dBFS`);
}
console.log(`sfx → ${OUT}`);
