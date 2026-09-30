/**
 * Scripted economy benchmark (M4 exit gate): villagers on every resource with drop sites beside them.
 *   node tools/sim/econ.ts [--minutes 8] [--out artifacts/sim/econ.json]
 * Gates: each job's work rate within ±5% of the research rate; effective rate ≥ 75% of it (hunting excepted —
 * hunters chase and lose meat to decay); villagers idle < 3% of the time (hunters excepted: they stop when their
 * carcass is gone, as in the original). Appends a row to docs/metrics/econ.csv.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { runEconBench } from '../../src/sim/testing/econBench.ts';
import { econGates } from '../../src/sim/testing/econGates.ts';

const idx = (n: string): number => process.argv.indexOf(`--${n}`);
const minutes = idx('minutes') > 0 ? Number(process.argv[idx('minutes') + 1]) : 8;
const out = idx('out') > 0 ? process.argv[idx('out') + 1]! : 'artifacts/sim/econ.json';
const record = process.argv.includes('--record');

const r = runEconBench(minutes);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(r, null, 2));
const { fails, idleNoHunt } = econGates(r);
const j = r.jobs;
const pct = (k: string): string => (j[k] ? `${(j[k].efficiency * 100).toFixed(0)}%` : '–');
console.log(
  `econ ${minutes} min: idle ${idleNoHunt.toFixed(2)}% (hunters ${r.idleByGroup.hunt!.toFixed(0)}%) · efficiency forage ${pct('forage')} farm ${pct('farm')} fish ${pct('fish')} wood ${pct('wood')} gold ${pct('gold')} stone ${pct('stone')} hunt ${pct('hunt')}`,
);
if (record) {
  const file = 'docs/metrics/econ.csv';
  if (!existsSync(file)) writeFileSync(file, 'date,commit,idle_pct,forage_eff,farm_eff,fish_eff,wood_eff,gold_eff,stone_eff,hunt_eff\n');
  let commit = 'dirty';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {}
  const e = (k: string): string => (j[k] ? j[k].efficiency.toFixed(3) : '');
  appendFileSync(file, [new Date().toISOString().slice(0, 16), commit, idleNoHunt.toFixed(2), e('forage'), e('farm'), e('fish'), e('wood'), e('gold'), e('stone'), e('hunt')].join(',') + '\n');
}
if (fails.length) {
  console.log(`GATE FAIL: ${fails.join('; ')}`);
  process.exit(1);
}
