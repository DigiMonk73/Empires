import { stressConfig } from '../sim/testing/fuzz.ts';
import { runTrace, type TraceResult } from '../sim/testing/trace.ts';
import { runBattle, type BattleResult } from '../sim/testing/battle.ts';
import { runScale } from '../game/determinism.ts';

/** Runs the same scenarios as the Node tests (fuzzed orders, battles, 4-AI games) inside a browser engine, for cross-engine hash comparison. */
declare global {
  interface Window {
    __simHarness?: {
      run(seed: number, size: number, units: number, ticks: number, fuzzEvery: number): TraceResult & { ms: number };
      battle(seed: number): BattleResult;
      /** One 4-AI game of the determinism-at-scale set (M15.1). */
      scale(seed: number, ticks: number, every: number): { trace: number[]; final: number; ms: number };
    };
  }
}

window.__simHarness = {
  run(seed, size, units, ticks, fuzzEvery) {
    const t0 = performance.now();
    const r = runTrace(stressConfig(seed, size, units), ticks, seed + 1, fuzzEvery);
    return { ...r, ms: performance.now() - t0 };
  },
  battle(seed) {
    return runBattle(seed, 20 * 300);
  },
  scale(seed, ticks, every) {
    const t0 = performance.now();
    const r = runScale(seed, { ticks, every });
    return { trace: r.trace, final: r.final, ms: performance.now() - t0 };
  },
};
