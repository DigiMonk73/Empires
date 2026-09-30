/**
 * Headless simulation runner: runs a fuzzed stress scenario and reports performance and movement metrics.
 *   node tools/sim/cli.ts [--seed 1] [--size 96] [--units 250] [--ticks 4000] [--every 15] [--out file.json]
 * Exits non-zero if a gate fails (sim p99 per tick, stuck rate).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Sim } from '../../src/sim/index.ts';
import { OrderFuzzer, stressConfig } from '../../src/sim/testing/fuzz.ts';

const arg = (name: string, def: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const outIdx = process.argv.indexOf('--out');
const out = outIdx > 0 ? process.argv[outIdx + 1]! : 'artifacts/sim/stress.json';

const seed = arg('seed', 1);
const size = arg('size', 96);
const units = arg('units', 250);
const ticks = arg('ticks', 4000);
const every = arg('every', 15);
const GATE_P99_MS = arg('gate-p99', 6);

const sim = Sim.create(stressConfig(seed, size, units));
const fz = new OrderFuzzer(seed + 1, every);
const times: number[] = [];
const e = sim.world.ents;
const longStuck = new Set<number>();
for (let t = 0; t < ticks; t++) {
  const cmds = fz.commands(sim);
  const t0 = performance.now();
  sim.step(cmds);
  times.push(performance.now() - t0);
  sim.drainEvents();
  for (let s = 0; s < e.top; s++) if (e.stuck[s]! > 100) longStuck.add(s);
}
const sorted = [...times].sort((a, b) => a - b);
const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
const ms = sim.world.moveStats;
const ps = sim.world.pathing.stats;
const report = {
  scenario: { seed, size, units: units * 2, ticks, fuzzEvery: every },
  tickMs: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: sorted[sorted.length - 1], mean: times.reduce((a, b) => a + b, 0) / times.length },
  movement: {
    blockedPct: (100 * ms.blockedTicks) / Math.max(1, ms.movingTicks),
    stuckOver5sUnits: longStuck.size,
    gaveUp: ms.gaveUp,
    repaths: ms.repaths,
    directPaths: ms.directPaths,
    sharedPaths: ms.sharedPaths,
  },
  pathing: { ...ps, avgWork: ps.work / Math.max(1, ps.served) },
  finalHash: sim.hash(),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
const stuckPct = (100 * longStuck.size) / (units * 2);
const line = `sim ${units * 2} units × ${ticks} ticks: p50 ${report.tickMs.p50.toFixed(3)} p99 ${report.tickMs.p99.toFixed(3)} max ${report.tickMs.max!.toFixed(2)} ms/tick · blocked ${report.movement.blockedPct.toFixed(1)}% · stuck>5s ${stuckPct.toFixed(1)}% · gaveUp ${ms.gaveUp} · searches ${ps.served} (avg work ${report.pathing.avgWork.toFixed(0)})`;
console.log(line);
const fails: string[] = [];
if (report.tickMs.p99 > GATE_P99_MS) fails.push(`p99 ${report.tickMs.p99.toFixed(2)} ms > ${GATE_P99_MS}`);
if (stuckPct >= 1) fails.push(`stuck ${stuckPct.toFixed(1)}% ≥ 1%`);
if (fails.length) {
  console.error(`GATE FAIL: ${fails.join('; ')}`);
  process.exit(1);
}
