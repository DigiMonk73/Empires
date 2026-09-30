/**
 * Scripted 20v20 battle (M5 exit gate): mirrored armies attack-move at each other.
 *   node tools/sim/battle.ts [--seeds 1,2,3] [--record]
 * Gates per seed: decided within 5 game minutes, no unit blocked > 5 s, sim p99 ≤ 6 ms/tick.
 */
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runBattle } from '../../src/sim/testing/battle.ts';

const idx = process.argv.indexOf('--seeds');
const seeds = (idx > 0 ? process.argv[idx + 1]! : '1,2,3').split(',').map(Number);
const fails: string[] = [];
const rows: string[] = [];
let worstP99 = 0;
let totalStuck = 0;
for (const seed of seeds) {
  const r = runBattle(seed, 20 * 300, () => performance.now());
  worstP99 = Math.max(worstP99, r.tickMs.p99);
  totalStuck += r.stuckUnits;
  rows.push(`seed ${seed}: ${(r.ticks / 20).toFixed(0)} s, ${r.winner ? `P${r.winner} wins with ${r.survivors[r.winner - 1]}` : `undecided ${r.survivors.join(':')}`}`);
  if (!r.winner) fails.push(`seed ${seed} undecided after 5 min`);
  if (r.stuckUnits) fails.push(`seed ${seed}: ${r.stuckUnits} stuck`);
  if (r.tickMs.p99 > 6) fails.push(`seed ${seed}: p99 ${r.tickMs.p99.toFixed(2)} ms`);
}
console.log(`battle 20v20 × ${seeds.length}: ${rows.join(' · ')} · p99 ≤ ${worstP99.toFixed(3)} ms · stuck ${totalStuck}`);
if (process.argv.includes('--record')) {
  const file = 'docs/metrics/battle.csv';
  if (!existsSync(file)) writeFileSync(file, 'date,commit,seeds,worst_p99_ms,stuck,summary\n');
  let commit = 'dirty';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {}
  appendFileSync(file, [new Date().toISOString().slice(0, 16), commit, seeds.join(' '), worstP99.toFixed(3), totalStuck, `"${rows.join('; ')}"`].join(',') + '\n');
}
if (fails.length) {
  console.log(`GATE FAIL: ${fails.join('; ')}`);
  process.exit(1);
}
