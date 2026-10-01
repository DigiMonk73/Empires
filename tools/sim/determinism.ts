/**
 * Determinism at scale (M15.1, Done 2), the Node half:
 *   node tools/sim/determinism.ts [--seeds 100] [--from 1] [--ticks 24000]
 * Plays each seed's 4-AI game (src/game/determinism.ts) on worker threads: the straight run's hash trace, a save
 * at the midpoint loaded and played on, and a replay of the commands must all agree. Writes the traces to
 * artifacts/determinism/node.json for tests/e2e/determinism-scale.spec.ts to compare Chromium and WebKit with.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { SCALE_EVERY, SCALE_SAVE_AT, SCALE_TICKS } from '../../src/game/determinism.ts';
import { runPool } from './pool.ts';

const arg = (name: string, dflt: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const SEEDS = arg('seeds', 100);
const FROM = arg('from', 1);
const TICKS = arg('ticks', SCALE_TICKS);
const SAVE_AT = Math.min(SCALE_SAVE_AT, Math.floor(TICKS / 2 / SCALE_EVERY) * SCALE_EVERY);
const NODE_TRACES = 'artifacts/determinism/node.json';

interface SeedResult {
  seed: number;
  trace: number[];
  final: number;
  problems: string[];
  ms: number;
}

const t0 = performance.now();
const jobs = Array.from({ length: SEEDS }, (_, i) => ({ seed: FROM + i, ticks: TICKS, saveAt: SAVE_AT, every: SCALE_EVERY }));
const results = await runPool<(typeof jobs)[number], SeedResult>(new URL('./determinism-worker.ts', import.meta.url), jobs);
const failures: string[] = [];
const seeds: Record<number, { trace: number[]; final: number }> = {};
let slowest = 0;
results.forEach((r, i) => {
  const seed = jobs[i]!.seed;
  if (r instanceof Error) return failures.push(`seed ${seed}: crashed — ${r.message.split('\n')[0]}`);
  seeds[seed] = { trace: r.trace, final: r.final };
  slowest = Math.max(slowest, r.ms);
  for (const p of r.problems) failures.push(`seed ${seed}: ${p}`);
});
mkdirSync('artifacts/determinism', { recursive: true });
writeFileSync(NODE_TRACES, JSON.stringify({ ticks: TICKS, every: SCALE_EVERY, seeds }));
for (const f of failures) console.log(f);
const secs = ((performance.now() - t0) / 1000).toFixed(1);
console.log(`determinism: ${SEEDS} seeds × ${TICKS} ticks (4 AIs) — straight, save@${SAVE_AT} → load → continue, replay: ${SEEDS - new Set(failures.map((f) => f.split(':')[0])).size}/${SEEDS} agree · slowest seed ${(slowest / 1000).toFixed(1)} s · ${secs} s → ${NODE_TRACES}`);
if (failures.length) process.exit(1);
