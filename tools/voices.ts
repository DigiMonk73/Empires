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

/**
 * Set → voice, rate and lines (M11.2): villagers, soldiers and priests for each architecture set, in short words
 * with the flavour of the culture (partly invented — no claim to be the historical language), spoken by the
 * macOS voice nearest to it (D12); death cries are shared. Sets are `<culture>/<role>` (the owner's architecture
 * set speaks) or `death`. Files land in public/audio/voices/<set>/<line>.wav.
 */
const IT_M = 'Grandpa (Italian (Italy))';
const IT_M2 = 'Rocko (Italian (Italy))';
const IT_P = 'Reed (Italian (Italy))';
const JA_M = 'Grandpa (Japanese (Japan))';
const JA_P = 'Reed (Japanese (Japan))';
const SETS: Record<string, { voice: string; rate: number; lines: Record<string, string> }> = {
  'greek/villager': { voice: 'Melina', rate: 190, lines: { select1: 'Ne?', select2: 'Parakalo?', ack1: 'Nai!', ack2: 'Amesos!', ack3: 'Endaxi!', work1: 'Pame!' } },
  'greek/soldier': { voice: IT_M2, rate: 165, lines: { select1: 'Etimos!', select2: 'Diataxe?', ack1: 'Malista!', ack2: 'Embros!', ack3: 'Pame!', attack1: 'Alalai!' } },
  'greek/priest': { voice: 'Melina', rate: 140, lines: { select1: 'Evlogia?', ack1: 'Genito!', ack2: 'Ta theia!' } },
  'roman/villager': { voice: 'Alice', rate: 185, lines: { select1: 'Salve?', select2: 'Quid vis?', ack1: 'Ita!', ack2: 'Statim!', ack3: 'Fiat!', work1: 'Laboremus!' } },
  'roman/soldier': { voice: IT_M, rate: 170, lines: { select1: 'Paratus!', select2: 'Imperia?', ack1: 'Ita!', ack2: 'Ad arma!', ack3: 'Eamus!', attack1: 'Pugnemus!' } },
  'roman/priest': { voice: IT_P, rate: 140, lines: { select1: 'Pax tecum?', ack1: 'Deo volente!', ack2: 'Fiat lux!' } },
  'egyptian/villager': { voice: 'Majed', rate: 185, lines: { select1: 'Hetep?', select2: 'Iy?', ack1: 'Ankh!', ack2: 'Nefer!', ack3: 'Iri!', work1: 'Bak!' } },
  'egyptian/soldier': { voice: 'Majed', rate: 150, lines: { select1: 'Mesha!', select2: 'Ha?', ack1: 'Djed!', ack2: 'Sekhem!', ack3: 'Shemi!', attack1: 'Khepesh!' } },
  'egyptian/priest': { voice: 'Majed', rate: 125, lines: { select1: 'Maat?', ack1: 'Heka!', ack2: 'Ra!' } },
  'babylonian/villager': { voice: 'Carmit', rate: 185, lines: { select1: 'Anaku?', select2: 'Shulmu?', ack1: 'Annu!', ack2: 'Alik!', ack3: 'Epush!', work1: 'Dullu!' } },
  'babylonian/soldier': { voice: IT_M2, rate: 150, lines: { select1: 'Qarradu!', select2: 'Minu?', ack1: 'Annu!', ack2: 'Ina qabli!', ack3: 'Alka!', attack1: 'Dikuu!' } },
  'babylonian/priest': { voice: 'Carmit', rate: 135, lines: { select1: 'Ilu?', ack1: 'Karabu!', ack2: 'Shamash!' } },
  'asian/villager': { voice: 'Kyoko', rate: 190, lines: { select1: 'Hai?', select2: 'Nani?', ack1: 'Hai!', ack2: 'Wakarimashita!', ack3: 'Makasete!', work1: 'Yoshi!' } },
  'asian/soldier': { voice: JA_M, rate: 165, lines: { select1: 'Junbi!', select2: 'Meirei wa?', ack1: 'Ryokai!', ack2: 'Ikuzo!', ack3: 'Susume!', attack1: 'Kakare!' } },
  'asian/priest': { voice: JA_P, rate: 140, lines: { select1: 'Nan desho?', ack1: 'Inori o!', ack2: 'Kami yo!' } },
  death: { voice: IT_M, rate: 200, lines: { die1: 'Ah!', die2: 'Uh!', die3: 'Oh!' } },
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
// The M6 layout had one culture at voices/villager and voices/soldier; those lines now live under greek/ and roman/.
for (const old of ['villager', 'soldier']) rmSync(join(OUT, old), { recursive: true, force: true });
const manifest: Record<string, string[]> = {};
let made = 0;
for (const [set, cfg] of Object.entries(SETS)) {
  mkdirSync(join(OUT, set), { recursive: true });
  manifest[set] = [];
  for (const [name, text] of Object.entries(cfg.lines)) {
    const out = join(OUT, set, `${name}.wav`);
    manifest[set]!.push(`${set}/${name}.wav`);
    if (existsSync(out) && !force) continue;
    const aiff = join(TMP, `${set.replace('/', '-')}-${name}.aiff`);
    const raw = join(TMP, `${set.replace('/', '-')}-${name}.wav`);
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
