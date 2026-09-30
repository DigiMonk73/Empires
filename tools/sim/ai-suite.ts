/**
 * AI suite (M6 exit gates): headless computer-vs-computer matches.
 *   node tools/sim/ai-suite.ts [--full] [--record]
 * Timing runs (peaceful): every Moderate AI reaches Tool ≤ 12:00 and Bronze ≤ 24:00; villagers idle ≤ 5%.
 * War runs: no crash; ≥ 75% end in conquest within 45 min; units stuck > 5 s ≤ 1%.
 * Ladder (D33): the stronger level wins — or leads 1.5:1 on score at 60 min — in ≥ 75% of games, both seats.
 * --full adds more seeds, bigger maps, 3–4 player free-for-alls, and Hard > Easy, Moderate > Easiest.
 * --adjacent adds every neighbouring pair (Easy > Easiest … Hardest > Hard), the Done definition's ladder (M13).
 * --only timing,war,ladder,water runs just those sections; --pairs hard>moderate,… just those pairings (AI tuning).
 * Matches run on worker threads (M13.1).
 */
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { MatchResult } from '../../src/game/aiMatch.ts';
import { runMatches, type MatchJob } from './pool.ts';
import type { AiLevel, MapSizeId } from '../../src/data/setup.ts';

const FULL = process.argv.includes('--full');
const ADJACENT = process.argv.includes('--adjacent');
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1]!.split(',')) : null;
const want = (section: string): boolean => !ONLY || ONLY.has(section);
const fmt = (t: number): string => (t ? `${Math.floor(t / 1200)}:${String(Math.floor((t % 1200) / 20)).padStart(2, '0')}` : '—');
type Case = { seed: number; type: 'continental' | 'inland'; size: MapSizeId; levels: AiLevel[] };
const timing: Case[] = [1, 2, 3, 4].map((seed) => ({ seed, type: seed % 2 ? 'continental' : 'inland', size: seed > 2 ? 'small' : 'tiny', levels: ['moderate', 'moderate'] }));
const war: Case[] = [1, 2, 3, 4].map((seed) => ({ seed: 10 + seed, type: seed % 2 ? 'continental' : 'inland', size: 'tiny', levels: ['moderate', 'moderate'] }));
if (FULL) {
  for (let k = 0; k < 8; k++) timing.push({ seed: 100 + k, type: k % 2 ? 'inland' : 'continental', size: (['tiny', 'small', 'medium'] as const)[k % 3]!, levels: ['moderate', 'moderate'] });
  for (let k = 0; k < 8; k++) war.push({ seed: 200 + k, type: k % 2 ? 'inland' : 'continental', size: k < 4 ? 'small' : 'medium', levels: k < 4 ? ['moderate', 'moderate', 'moderate'] : ['moderate', 'hard', 'easy', 'moderate'] });
}

// Ladder seeds 101–108 were held out while tuning the AI (M6.10) — keep them as the regression set. The full
// ladder plays 32 maps (D41): on 8, one game was 6% of the score and start position decided half the mirrors.
const ladderSeeds = FULL ? Array.from({ length: 32 }, (_, i) => 101 + i) : [101, 102, 103, 104];
const ladderPairs: [AiLevel, AiLevel][] = FULL ? [['hardest', 'easiest'], ['hard', 'easy'], ['moderate', 'easiest']] : [['hardest', 'easiest']];
/** The Done definition's ladder: each level over the one below (Hardest > Hard needs 65%). Reported with --adjacent. */
const ADJACENT_PAIRS: [AiLevel, AiLevel][] = [['easy', 'easiest'], ['moderate', 'easy'], ['hard', 'moderate'], ['hardest', 'hard']];
if (ADJACENT) for (const pr of ADJACENT_PAIRS) if (!ladderPairs.some(([a, b]) => a === pr[0] && b === pr[1])) ladderPairs.push(pr);
// --pairs hard>moderate,easy>easiest: just these pairings (tuning).
const pairsArg = process.argv.indexOf('--pairs');
if (pairsArg >= 0) ladderPairs.splice(0, ladderPairs.length, ...process.argv[pairsArg + 1]!.split(',').map((p) => p.split('>') as [AiLevel, AiLevel]));
/**
 * Pairings reported but not gated yet: the adjacent ladder until the M13 exit. Hard > Easy (46/64 at M7, D41) is
 * gated again from M13.1 — 53/64 on 32 maps.
 */
const DEFERRED = new Set(ADJACENT_PAIRS.filter(([a, b]) => !(a === 'moderate' && b === 'easy')).map(([a, b]) => `${a}>${b}`));
const WATER_TYPES = ['smallIslands', 'largeIslands', 'narrows'] as const;
const water: Case[] = [];
if (FULL) for (let k = 0; k < 12; k++) water.push({ seed: 301 + k, type: WATER_TYPES[k % 3]! as never, size: k % 2 ? 'small' : 'tiny', levels: k % 2 ? ['hard', 'hard'] : ['moderate', 'moderate'] });

const fails: string[] = [];
let crashes = 0;
const t0 = performance.now();
// Every match up front, run on the worker pool; the sections below read the results in the same order.
const jobs: MatchJob[] = [];
const slot = (c: Case, minutes: number, peaceful: boolean): number => jobs.push({ ...c, minutes, peaceful }) - 1;
const timingJobs = want('timing') ? timing.map((c) => slot(c, 25, true)) : [];
const warJobs = want('war') ? war.map((c) => slot(c, 45, false)) : [];
const ladderJobs = want('ladder')
  ? ladderPairs.map(([strong, weak]) => ladderSeeds.flatMap((seed) => [0, 1].map((seat) => slot({ seed, type: seed % 2 ? 'inland' : 'continental', size: 'tiny', levels: seat ? [weak, strong] : [strong, weak] }, 60, false))))
  : ladderPairs.map(() => []);
const waterJobs = want('water') ? water.map((c) => slot(c, 120, false)) : [];
const results = await runMatches(jobs);
const got = (i: number, c: { seed: number }): MatchResult | null => {
  const r = results[i]!;
  if (r instanceof Error) {
    crashes++;
    fails.push(`crash seed ${c.seed}: ${String(r.message).slice(0, 120)}`);
    return null;
  }
  return r;
};

let worstTool = 0;
let worstBronze = 0;
const idles: number[] = [];
for (const [k, c] of timing.entries()) {
  if (!want('timing')) break;
  const r = got(timingJobs[k]!, c);
  if (!r) continue;
  for (const [i, ages] of r.ageTick.entries()) {
    worstTool = Math.max(worstTool, ages[2] || Infinity);
    worstBronze = Math.max(worstBronze, ages[3] || Infinity);
    if (!ages[2] || ages[2] > 12 * 1200) fails.push(`seed ${c.seed} P${i + 1} Tool ${fmt(ages[2]!)} > 12:00`);
    if (!ages[3] || ages[3] > 24 * 1200) fails.push(`seed ${c.seed} P${i + 1} Bronze ${fmt(ages[3]!)} > 24:00`);
  }
  idles.push(...r.idlePct);
}
let decided = 0;
let duels = 0;
let stuck = 0;
let units = 0;
let lengths: number[] = [];
for (const [k, c] of war.entries()) {
  if (!want('war')) break;
  const r = got(warJobs[k]!, c);
  if (!r) continue;
  // Conquest is gated on 1v1s; free-for-alls (AI v1 is weak at finishing weakened players) only must not crash.
  if (c.levels.length === 2) duels++;
  if (r.winner && c.levels.length === 2) {
    decided++;
    lengths.push(r.ticks);
  }
  if (process.argv.includes('--verbose')) {
    const last = r.samples[r.samples.length - 1]!;
    console.log(`  war seed ${c.seed} ${c.type} ${c.size} ${c.levels.join('/')}: ${r.winner ? `P${r.winner.join('+')} wins at ${fmt(r.ticks)}` : 'undecided'} · ${last.players.map((p, i) => `P${i + 1} v${p.villagers} m${p.military} b${p.buildings} age${p.age}`).join(' | ')}`);
  }
  stuck += r.stuckUnits;
  units += r.unitsSeen;
}
const ladder: string[] = [];
for (const [pi, [strong, weak]] of ladderPairs.entries()) {
  if (!want('ladder')) break;
  let ok = 0;
  let n = 0;
  let j = 0;
  for (const seed of ladderSeeds) {
    for (const seat of [0, 1]) {
      const r = got(ladderJobs[pi]![j++]!, { seed });
      if (!r) continue;
      n++;
      const won = r.winner ? r.winner.includes(seat + 1) : r.scores[seat]! >= 1.5 * r.scores[1 - seat]!;
      if (won) ok++;
      stuck += r.stuckUnits;
      units += r.unitsSeen;
      if (process.argv.includes('--verbose')) console.log(`  ladder ${strong}>${weak} seed ${seed} seat ${seat + 1}: ${r.winner ? `P${r.winner.join('+')} wins at ${fmt(r.ticks)}` : `score ${r.scores.join(':')}`} ${won ? 'ok' : 'FAIL'}`);
    }
  }
  const deferred = DEFERRED.has(`${strong}>${weak}`);
  ladder.push(`${strong}>${weak} ${ok}/${n}${deferred ? ' (gate: M13)' : ''}`);
  if (ok < Math.ceil(n * 0.75) && !deferred) fails.push(`ladder ${strong}>${weak} only ${ok}/${n}`);
}
// Water maps (M8.8d): island and Narrows 1v1s should be decided (≥ 90%) within 120 min — the AI has to find the
// enemy by sea and ferry armies over. Reported, gated again in M13 (7/12 at M8 — KI-8, D42). Full runs only.
const WATER_GATED = false;
let waterLine = '';
if (FULL && want('water')) {
  let won = 0;
  const times: number[] = [];
  for (const [k, c] of water.entries()) {
    const r = got(waterJobs[k]!, c);
    if (!r) continue;
    if (r.winner) {
      won++;
      times.push(r.ticks);
    }
    stuck += r.stuckUnits;
    units += r.unitsSeen;
    if (process.argv.includes('--verbose')) console.log(`  water ${c.type} ${c.size} seed ${c.seed} ${c.levels.join('/')}: ${r.winner ? `P${r.winner.join('+')} wins at ${fmt(r.ticks)}` : 'undecided at 2:00:00'}`);
  }
  times.sort((a, b) => a - b);
  waterLine = ` · water decided ${won}/${water.length}${times.length ? ` (median ${fmt(times[times.length >> 1]!)})` : ''}${WATER_GATED ? '' : ' (gate: M13)'}`;
  if (WATER_GATED && won < Math.ceil(water.length * 0.9)) fails.push(`water maps: only ${won}/${water.length} decided in 2 h`);
}
const idle = idles.reduce((a, b) => a + b, 0) / Math.max(1, idles.length);
const stuckPct = (100 * stuck) / Math.max(1, units);
if (want('timing') && idle > 5) fails.push(`idle ${idle.toFixed(1)}%`);
if (want('war') && decided < Math.ceil(duels * 0.75)) fails.push(`only ${decided}/${duels} 1v1 wars decided`);
if (stuckPct > 1) fails.push(`stuck ${stuckPct.toFixed(2)}%`);
lengths = lengths.sort((a, b) => a - b);
const median = lengths.length ? lengths[Math.floor(lengths.length / 2)]! : 0;
console.log(
  `ai suite ${timing.length}+${war.length}+${ladderPairs.length * ladderSeeds.length * 2} matches in ${((performance.now() - t0) / 1000).toFixed(1)} s: worst Tool ${fmt(worstTool)} Bronze ${fmt(worstBronze)} · idle ${idle.toFixed(1)}% · 1v1 wars decided ${decided}/${duels} (median ${fmt(median)}) · ladder ${ladder.join(', ')}${waterLine} · stuck ${stuckPct.toFixed(2)}% · crashes ${crashes}`,
);
if (process.argv.includes('--record')) {
  const file = 'docs/metrics/ai.csv';
  if (!existsSync(file)) writeFileSync(file, 'date,commit,matches,worst_tool,worst_bronze,idle_pct,decided,median_war,stuck_pct,crashes\n');
  let commit = 'dirty';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {}
  appendFileSync(file, [new Date().toISOString().slice(0, 16), commit, timing.length + war.length, fmt(worstTool), fmt(worstBronze), idle.toFixed(2), `${decided}/${duels}`, fmt(median), stuckPct.toFixed(3), crashes].join(',') + '\n');
}
if (fails.length) {
  console.log(`GATE FAIL: ${fails.join('; ')}`);
  process.exit(1);
}
