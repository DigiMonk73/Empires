/**
 * The AI gates' noise band (D70). One suite run is one draw of the games' chance: shifting when the computers think
 * by 1–3 ticks — no rule changed — moved 1v1 wars 22–24/24, Hard > Moderate 46–52/64 and held-out water 42–48/48
 * (M15.10). So an AI change is judged on the full suite at think shifts 0–3, totalled: each total may fall at most
 * its tolerance below the recorded baseline (≈ 1.2 σ of a 4-run total's difference), and the Done bars must hold
 * on the four-run average.
 *   node tools/sim/ai-band.ts            check against docs/metrics/ai-band.json (exit 1 on a failure)
 *   node tools/sim/ai-band.ts --record   run and save a new baseline
 *   node tools/sim/ai-band.ts --keep     check, and on a pass save this run as the new baseline (a kept change's
 *                                        re-record without running the band twice — the games are deterministic)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SHIFTS = [0, 1, 2, 3];
const BASELINE = 'docs/metrics/ai-band.json';
/** How far each 4-run total may fall below the baseline's. */
const TOLERANCE = { wars: 3, hardModerate: 8, hardestHard: 8, water: 8, duels: 3 } as const;
type Key = keyof typeof TOLERANCE;
interface Run { shift: number; wars: number; hardModerate: number; hardestHard: number; water: number; duels: number; duelMedianMin: number; crashes: number }

const num = (s: string, re: RegExp): number => {
  const m = s.match(re);
  if (!m) throw new Error(`suite output has no ${re}`);
  return Number(m[1]);
};

const runs: Run[] = SHIFTS.map((k) => {
  let out: string;
  try {
    out = execFileSync('node', ['tools/sim/ai-suite.ts', '--full', '--adjacent', '--shift', String(k)], { encoding: 'utf8', maxBuffer: 1 << 28 });
  } catch (e) {
    out = (e as { stdout?: string }).stdout ?? ''; // one draw's GATE FAIL exits 1 — the band decides
  }
  const median = out.match(/hard 1v1 median (\d+):(\d+)/);
  const r: Run = {
    shift: k,
    wars: num(out, /1v1 wars decided (\d+)\/24/),
    hardModerate: num(out, /hard>moderate (\d+)\/64/),
    hardestHard: num(out, /hardest>hard (\d+)\/64/),
    water: num(out, /water decided (\d+)\/48 held out/),
    duels: num(out, /hard 1v1 median [0-9:]+ \((\d+)\/16 decided\)/),
    duelMedianMin: median ? Number(median[1]) + Number(median[2]) / 60 : 0,
    crashes: num(out, /crashes (\d+)/),
  };
  console.log(`shift ${k}: wars ${r.wars}/24 · Hard>Moderate ${r.hardModerate}/64 · Hardest>Hard ${r.hardestHard}/64 · water ${r.water}/48 · duels ${r.duels}/16, median ${r.duelMedianMin.toFixed(1)} min · crashes ${r.crashes}`);
  return r;
});

const total = (k: Key): number => runs.reduce((a, r) => a + r[k], 0);
const totals = Object.fromEntries((Object.keys(TOLERANCE) as Key[]).map((k) => [k, total(k)])) as Record<Key, number>;
const n = runs.length;
console.log(`totals (×${n}): wars ${totals.wars}/${24 * n} · Hard>Moderate ${totals.hardModerate}/${64 * n} · Hardest>Hard ${totals.hardestHard}/${64 * n} · water ${totals.water}/${48 * n} · duels ${totals.duels}/${16 * n}`);

if (process.argv.includes('--record')) {
  writeFileSync(BASELINE, JSON.stringify({ shifts: SHIFTS, totals, runs }, null, 2) + '\n');
  console.log(`baseline saved → ${BASELINE}`);
  process.exit(0);
}

const fails: string[] = [];
const base = (JSON.parse(readFileSync(BASELINE, 'utf8')) as { totals: Record<Key, number> }).totals;
for (const k of Object.keys(TOLERANCE) as Key[]) {
  if (totals[k] < base[k] - TOLERANCE[k]) fails.push(`${k} ${totals[k]} < baseline ${base[k]} − ${TOLERANCE[k]}`);
}
// The Done bars (DONE.md §3), on the four-run average.
if (totals.hardModerate / n < 48) fails.push(`Hard > Moderate averages ${(totals.hardModerate / n).toFixed(1)}/64 (bar 48)`);
if (totals.hardestHard / n < 41.6) fails.push(`Hardest > Hard averages ${(totals.hardestHard / n).toFixed(1)}/64 (bar 65%)`);
if (totals.water / n < 44) fails.push(`held-out water averages ${(totals.water / n).toFixed(1)}/48 (bar 44)`);
const med = runs.reduce((a, r) => a + r.duelMedianMin, 0) / n;
if (med < 25 || med > 60) fails.push(`Hard duels' median averages ${med.toFixed(1)} min (Done 25–60)`);
if (runs.some((r) => r.crashes)) fails.push('crashes');
console.log(fails.length ? `BAND FAIL: ${fails.join('; ')}` : `BAND PASS (baseline ${JSON.stringify(base)})`);
if (!fails.length && process.argv.includes('--keep')) {
  writeFileSync(BASELINE, JSON.stringify({ shifts: SHIFTS, totals, runs }, null, 2) + '\n');
  console.log(`baseline saved → ${BASELINE}`);
}
process.exit(fails.length ? 1 : 0);
