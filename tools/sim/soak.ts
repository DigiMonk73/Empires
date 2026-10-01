/**
 * Two-hour soak (M15.4): computer players for 2 hours of game time, through the game's own session.
 *   node --expose-gc tools/sim/soak.ts [--game ffa8|teams4|all] [--hours 2] [--record]
 * Every 10 game minutes: the heap after a full GC, tick p50/p99 (the computers' thinking + the step), units alive,
 * entity slots. Gates (D64): no crash; units stuck > 5 s ≤ 0.5% of all that lived; no heap growth after the 30th
 * minute; tick p99 flat. Writes artifacts/soak/<game>.json; --record appends to docs/metrics/soak.csv.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { getHeapStatistics } from 'node:v8';
import { GameSession } from '../../src/game/session.ts';
import { DEFAULT_SETUP, skirmishConfig, type SkirmishSetup } from '../../src/game/skirmish.ts';
import { EKind } from '../../src/sim/core/entities.ts';

const arg = (name: string, dflt: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
};
const HOURS = Number(arg('hours', '2'));
const record = process.argv.includes('--record');
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) {
  console.error('run with node --expose-gc (the heap is read after a full collection)');
  process.exit(2);
}

const CIVS = ['greek', 'egyptian', 'persian', 'babylonian', 'yamato', 'hittite', 'roman', 'shang'];
const GAMES: Record<string, SkirmishSetup> = {
  // Eight Hard computers, every one for itself, on the biggest map.
  ffa8: { ...DEFAULT_SETUP, seed: 7, type: 'continental', size: 'gigantic', victory: 'conquest', players: CIVS.map((civ, i) => ({ civ, team: i + 1, controller: 'hard' })) },
  // Four computers of mixed levels in teams, on water — transports, docks, relics and ruins (Standard).
  teams4: {
    ...DEFAULT_SETUP,
    seed: 11,
    type: 'mediterranean',
    size: 'large',
    victory: 'standard',
    players: [
      { civ: 'minoan', team: 1, controller: 'hard' },
      { civ: 'phoenician', team: 2, controller: 'moderate' },
      { civ: 'carthaginian', team: 1, controller: 'easy' },
      { civ: 'macedonian', team: 2, controller: 'hardest' },
    ],
  },
};

interface Window {
  minute: number;
  heapMB: number;
  tickP50: number;
  tickP99: number;
  units: number;
  slots: number;
}

function soak(name: string, setup: SkirmishSetup): { name: string; ok: boolean; problems: string[]; windows: Window[]; stuckPct: number; unitsSeen: number; endTick: number; winner: number[] | null } {
  const session = new GameSession(skirmishConfig(setup), 0);
  const sim = session.sim;
  const w = sim.world;
  const e = w.ents;
  const ticks = HOURS * 60 * 1200;
  const windows: Window[] = [];
  const seen = new Set<number>();
  const stuck = new Set<number>();
  const problems: string[] = [];
  let times: number[] = [];
  const q = (a: number[], f: number): number => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * f))]!;
  const sample = (): void => {
    gc!();
    let units = 0;
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.kind[s] === EKind.unit && e.owner[s]! > 0) units++;
    windows.push({ minute: sim.tick / 1200, heapMB: getHeapStatistics().used_heap_size / 2 ** 20, tickP50: times.length ? q(times, 0.5) : 0, tickP99: times.length ? q(times, 0.99) : 0, units, slots: e.top });
    times = [];
  };
  sample();
  try {
    while (sim.tick < ticks) {
      const a = performance.now();
      session.stepOnce();
      times.push(performance.now() - a);
      if (sim.tick % 20 === 0) {
        for (let s = 0; s < e.top; s++) {
          if (!e.alive[s] || e.kind[s] !== EKind.unit || e.owner[s] === 0) continue;
          const h = e.handleOf(s);
          seen.add(h);
          if (e.stuck[s]! > 100) stuck.add(h);
        }
      }
      if (sim.tick % 12_000 === 0) sample();
    }
  } catch (err) {
    problems.push(`crashed at tick ${sim.tick}: ${String((err as Error)?.stack ?? err).split('\n').slice(0, 3).join(' | ')}`);
  }
  const stuckPct = (100 * stuck.size) / Math.max(1, seen.size);
  if (stuckPct > 0.5) problems.push(`stuck ${stuckPct.toFixed(2)}% > 0.5%`);
  // Heap: after the 30th minute it may wander with the game (armies die, farms rise) but not climb.
  const after30 = windows.filter((x) => x.minute >= 30);
  if (after30.length >= 2) {
    const base = after30[0]!.heapMB;
    const peak = Math.max(...after30.map((x) => x.heapMB));
    const end = after30[after30.length - 1]!.heapMB;
    if (end > base * 1.15 + 5) problems.push(`heap grew ${base.toFixed(1)} → ${end.toFixed(1)} MB after minute 30`);
    if (peak > base * 1.3 + 10) problems.push(`heap peaked at ${peak.toFixed(1)} MB (minute-30 ${base.toFixed(1)} MB)`);
    const p99s = after30.slice(1).map((x) => x.tickP99);
    const p30 = windows.find((x) => x.minute === 30)?.tickP99 ?? p99s[0]!;
    if (Math.max(...p99s) > Math.max(2 * p30, 3)) problems.push(`tick p99 climbed to ${Math.max(...p99s).toFixed(2)} ms (minute 30: ${p30.toFixed(2)})`);
  }
  return { name, ok: !problems.length, problems, windows, stuckPct, unitsSeen: seen.size, endTick: sim.tick, winner: w.gameOver?.winners ?? null };
}

const which = arg('game', 'all');
const names = which === 'all' ? Object.keys(GAMES) : [which];
mkdirSync('artifacts/soak', { recursive: true });
let failed = false;
const lines: string[] = [];
for (const name of names) {
  const t0 = performance.now();
  const r = soak(name, GAMES[name]!);
  const secs = (performance.now() - t0) / 1000;
  writeFileSync(`artifacts/soak/${name}.json`, JSON.stringify(r, null, 2));
  for (const x of r.windows) console.log(`  ${name} min ${String(x.minute).padStart(3)}: heap ${x.heapMB.toFixed(1)} MB · tick p50 ${x.tickP50.toFixed(2)} p99 ${x.tickP99.toFixed(2)} ms · units ${x.units} · slots ${x.slots}`);
  const h30 = r.windows.find((x) => x.minute === 30)?.heapMB ?? 0;
  const hEnd = r.windows[r.windows.length - 1]!.heapMB;
  const p99 = Math.max(...r.windows.map((x) => x.tickP99));
  lines.push(`${name}: ${(r.endTick / 1200).toFixed(0)} min, heap ${h30.toFixed(0)} → ${hEnd.toFixed(0)} MB after min 30, worst tick p99 ${p99.toFixed(2)} ms, stuck ${r.stuckPct.toFixed(2)}% of ${r.unitsSeen}${r.winner ? `, won by ${r.winner.join('+')}` : ''} (${secs.toFixed(0)} s)${r.ok ? '' : ` — FAIL: ${r.problems.join('; ')}`}`);
  if (!r.ok) failed = true;
  if (record) {
    const file = 'docs/metrics/soak.csv';
    if (!existsSync(file)) writeFileSync(file, 'date,commit,game,minutes,heap30_mb,heap_end_mb,worst_tick_p99_ms,stuck_pct,units_seen,ok\n');
    let commit = 'dirty';
    try {
      commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {}
    appendFileSync(file, [new Date().toISOString().slice(0, 16), commit, name, (r.endTick / 1200).toFixed(0), h30.toFixed(1), hEnd.toFixed(1), p99.toFixed(3), r.stuckPct.toFixed(3), r.unitsSeen, r.ok ? 1 : 0].join(',') + '\n');
  }
}
console.log(`soak ${HOURS} h: ${lines.join(' · ')}`);
if (failed) process.exit(1);
