/**
 * Voice acknowledgements (D12): rendered with macOS `say` (built-in voices — the user allowed them), converted to
 * 22 kHz 16-bit WAV with `afconvert`, then trimmed and normalised here. Outputs are committed under
 * public/audio/voices/ so builds (and Docker) never need macOS.
 *   node tools/voices.ts [--force]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readWav, writeWav, type Wav } from './wav.ts';

const OUT = 'public/audio/voices';
const TMP = 'artifacts/voices';
const force = process.argv.includes('--force');

/** Set → voice, rate and lines. Greek villagers, Latin soldiers (the one architecture set of M6). */
const SETS: Record<string, { voice: string; rate: number; lines: Record<string, string> }> = {
  villager: {
    voice: 'Melina',
    rate: 190,
    lines: { select1: 'Ne?', select2: 'Parakalo?', ack1: 'Nai!', ack2: 'Amesos!', ack3: 'Endaxi!', work1: 'Pame!' },
  },
  soldier: {
    voice: 'Grandpa (Italian (Italy))',
    rate: 170,
    lines: { select1: 'Paratus!', select2: 'Imperia?', ack1: 'Ita!', ack2: 'Ad arma!', ack3: 'Eamus!', attack1: 'Pugnemus!' },
  },
  death: {
    voice: 'Grandpa (Italian (Italy))',
    rate: 200,
    lines: { die1: 'Ah!', die2: 'Uh!', die3: 'Oh!' },
  },
};

/** Trim silence (−45 dBFS) with 20 ms margins, fade 5 ms at the ends, normalise the peak to −1 dBFS. */
function tidy(w: Wav): Wav {
  const s = w.samples;
  const thr = 32768 * 10 ** (-45 / 20);
  let a = 0;
  let z = s.length - 1;
  while (a < s.length && Math.abs(s[a]!) < thr) a++;
  while (z > a && Math.abs(s[z]!) < thr) z--;
  const pad = Math.round(w.rate * 0.02);
  a = Math.max(0, a - pad);
  z = Math.min(s.length - 1, z + pad);
  const out = new Float64Array(z - a + 1);
  let peak = 1;
  for (let i = 0; i < out.length; i++) {
    out[i] = s[a + i]!;
    peak = Math.max(peak, Math.abs(out[i]!));
  }
  const gain = (32767 * 10 ** (-1 / 20)) / peak;
  const fade = Math.round(w.rate * 0.005);
  const res = new Int16Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const f = Math.min(1, i / fade, (out.length - 1 - i) / fade);
    res[i] = Math.round(out[i]! * gain * f);
  }
  return { rate: w.rate, samples: res };
}

mkdirSync(TMP, { recursive: true });
const manifest: Record<string, string[]> = {};
let made = 0;
for (const [set, cfg] of Object.entries(SETS)) {
  mkdirSync(join(OUT, set), { recursive: true });
  manifest[set] = [];
  for (const [name, text] of Object.entries(cfg.lines)) {
    const out = join(OUT, set, `${name}.wav`);
    manifest[set]!.push(`${set}/${name}.wav`);
    if (existsSync(out) && !force) continue;
    const aiff = join(TMP, `${set}-${name}.aiff`);
    const raw = join(TMP, `${set}-${name}.wav`);
    execFileSync('say', ['-v', cfg.voice, '-r', String(cfg.rate), '-o', aiff, text]);
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@22050', '-c', '1', aiff, raw]);
    writeWav(out, tidy(readWav(raw)));
    rmSync(aiff);
    rmSync(raw);
    made++;
  }
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`voices: ${made} rendered, manifest → ${join(OUT, 'manifest.json')}`);
