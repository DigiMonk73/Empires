/**
 * Sim performance at full population (M15.3, Done 4: "8p × 50 pop, Giant map: sim p99 ≤ 6 ms per tick").
 *   node tools/sim/perf.ts [--minutes 5] [--seed 1] [--record]
 * Plays `?scenario=fullpop` — 8 Hard computers × 50 population on Gigantic — and times every tick as the game runs
 * it: the computers' thinking plus the simulation step. The gate is the p99 of that sum. Appends a row to
 * docs/metrics/perf.csv with --record.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fullPopConfig } from '../../src/game/perfScene.ts';
import { GameSession } from '../../src/game/session.ts';
import { EKind } from '../../src/sim/core/entities.ts';
import { PlayerView } from '../../src/sim/view/playerView.ts';

const arg = (name: string, dflt: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const MINUTES = arg('minutes', 5);
const SEED = arg('seed', 1);
const record = process.argv.includes('--record');
// 6 ms is this Mac. GitHub's shared runner is slower, so CI sets EMPIRES_PERF_MS (D72). A bad number fails closed.
const GATE_P99 = Number(process.env.EMPIRES_PERF_MS ?? 6);

const t0 = performance.now();
const session = new GameSession(fullPopConfig(SEED), 0);
const sim = session.sim;
const createMs = performance.now() - t0;
const w = sim.world;
const pops = (): number[] => w.players.slice(1).map((_, i) => new PlayerView(w, i + 1).me().pop);
const startPop = pops();
// Split each tick into the simulation step and everything else (the computers' thinking, events).
const step = sim.step.bind(sim);
let stepMs = 0;
sim.step = (cmds) => {
  const a = performance.now();
  step(cmds);
  stepMs = performance.now() - a;
};
const units = (): number => {
  let n = 0;
  for (let s = 0; s < w.ents.top; s++) if (w.ents.alive[s] && w.ents.kind[s] === EKind.unit && w.ents.owner[s]! > 0) n++;
  return n;
};
const total: number[] = [];
const simOnly: number[] = [];
/** Ticks while the players' units number ≥ 90% of 400 (the armies march at once and thin it within minutes). */
const full: number[] = [];
let alive = units();
let popTicks = 0;
let popSum = 0;
const ticks = MINUTES * 1200;
for (let t = 0; t < ticks; t++) {
  const a = performance.now();
  session.stepOnce();
  const ms = performance.now() - a;
  total.push(ms);
  simOnly.push(stepMs);
  if (t > 0 && alive >= 360) full.push(ms);
  if (t % 20 === 0) alive = units();
  if (t % 200 === 0) {
    popSum += pops().reduce((x, y) => x + y, 0);
    popTicks++;
  }
}
const q = (a: number[], f: number): number => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * f))]!;
const r = {
  minutes: MINUTES,
  seed: SEED,
  createMs,
  startPop: startPop.reduce((x, y) => x + y, 0),
  avgPop: popSum / popTicks,
  endPop: pops().reduce((x, y) => x + y, 0),
  endUnits: units(),
  p50: q(total, 0.5),
  p99: q(total, 0.99),
  /** The first tick (JIT warm-up, the first fog and pathing pass — part of loading) is reported apart. */
  firstMs: total[0]!,
  max: q(total.slice(1), 1),
  simP99: q(simOnly, 0.99),
  fullTicks: full.length,
  fullP99: full.length ? q(full, 0.99) : 0,
  wallS: (performance.now() - t0) / 1000,
};
mkdirSync('artifacts/perf', { recursive: true });
writeFileSync('artifacts/perf/sim-fullpop.json', JSON.stringify(r, null, 2));
const pass = r.p99 <= GATE_P99 && r.fullP99 <= GATE_P99 && r.fullTicks >= 600;
console.log(
  `perf fullpop (8 × 50 pop, Gigantic, ${MINUTES} min): pop ${r.startPop} → avg ${r.avgPop.toFixed(0)} → ${r.endPop} · tick (AI + sim) p50 ${r.p50.toFixed(2)} p99 ${r.p99.toFixed(2)} max ${r.max.toFixed(1)} ms · at ≥ 360 units p99 ${r.fullP99.toFixed(2)} ms (${(r.fullTicks / 20).toFixed(0)} s) · sim step p99 ${r.simP99.toFixed(2)} ms · setup ${r.createMs.toFixed(0)} ms + first tick ${r.firstMs.toFixed(0)} ms · ${r.wallS.toFixed(0)} s${pass ? '' : ` — GATE FAIL: p99 > ${GATE_P99} ms (or < 30 s at full population)`}`,
);
if (record) {
  const file = 'docs/metrics/perf.csv';
  if (!existsSync(file)) writeFileSync(file, 'date,commit,minutes,start_pop,avg_pop,tick_p50_ms,tick_p99_ms,tick_max_ms,sim_p99_ms,full_pop_p99_ms\n');
  let commit = 'dirty';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {}
  appendFileSync(file, [new Date().toISOString().slice(0, 16), commit, MINUTES, r.startPop, r.avgPop.toFixed(0), r.p50.toFixed(3), r.p99.toFixed(3), r.max.toFixed(2), r.simP99.toFixed(3), r.fullP99.toFixed(3)].join(',') + '\n');
}
if (!pass) process.exit(1);
