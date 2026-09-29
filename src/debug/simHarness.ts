import { stressConfig } from '../sim/testing/fuzz.ts';
import { runTrace, type TraceResult } from '../sim/testing/trace.ts';

/** Runs the same fuzzed scenarios as the Node tests inside a browser engine, for cross-engine hash comparison. */
declare global {
  interface Window {
    __simHarness?: { run(seed: number, size: number, units: number, ticks: number, fuzzEvery: number): TraceResult & { ms: number } };
  }
}

window.__simHarness = {
  run(seed, size, units, ticks, fuzzEvery) {
    const t0 = performance.now();
    const r = runTrace(stressConfig(seed, size, units), ticks, seed + 1, fuzzEvery);
    return { ...r, ms: performance.now() - t0 };
  },
};
