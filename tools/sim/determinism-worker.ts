/** One determinism-at-scale seed per message (tools/sim/determinism.ts): straight run, save → load, replay. */
import { parentPort } from 'node:worker_threads';
import { checkScale } from '../../src/game/determinism.ts';

parentPort!.on('message', (m: { id: number; opts: { seed: number; ticks: number; saveAt: number; every: number } }) => {
  try {
    const t0 = performance.now();
    const { run, problems } = checkScale(m.opts.seed, m.opts.ticks, m.opts.saveAt, m.opts.every);
    parentPort!.postMessage({ id: m.id, result: { seed: run.seed, trace: run.trace, final: run.final, problems, ms: performance.now() - t0 } });
  } catch (err) {
    parentPort!.postMessage({ id: m.id, error: String((err as Error)?.stack ?? err) });
  }
});
