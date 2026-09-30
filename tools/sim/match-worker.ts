/** One AI-vs-AI match per message (tools/sim/pool.ts). Deterministic: the same match on any thread. */
import { parentPort } from 'node:worker_threads';
import { runMatch, type MatchOptions } from '../../src/game/aiMatch.ts';

parentPort!.on('message', (m: { id: number; opts: MatchOptions }) => {
  try {
    const result = runMatch({ ...m.opts, clock: () => performance.now() });
    parentPort!.postMessage({ id: m.id, result });
  } catch (err) {
    parentPort!.postMessage({ id: m.id, error: String((err as Error)?.stack ?? err) });
  }
});
