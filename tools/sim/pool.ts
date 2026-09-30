/**
 * Run many headless AI matches on worker threads (M13.1): the AI suite's 200+ matches took ~8 minutes on one
 * core. Results come back in input order; a match that throws resolves to an Error. Matches are deterministic, so
 * the pool changes nothing but the wall-clock time.
 */
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import type { MatchOptions, MatchResult } from '../../src/game/aiMatch.ts';

export type MatchJob = Omit<MatchOptions, 'clock'>;

export async function runMatches(jobs: MatchJob[], threads = Math.max(1, Math.min(jobs.length, availableParallelism() - 2))): Promise<(MatchResult | Error)[]> {
  const out = new Array<MatchResult | Error>(jobs.length);
  let next = 0;
  const workers = Array.from({ length: threads }, () => new Worker(new URL('./match-worker.ts', import.meta.url)));
  await Promise.all(
    workers.map(
      (w) =>
        new Promise<void>((resolve, reject) => {
          const feed = () => {
            if (next >= jobs.length) return resolve();
            const id = next++;
            w.postMessage({ id, opts: jobs[id] });
          };
          w.on('message', (m: { id: number; result?: MatchResult; error?: string }) => {
            out[m.id] = m.error !== undefined ? new Error(m.error) : m.result!;
            feed();
          });
          w.on('error', reject);
          feed();
        }),
    ),
  );
  await Promise.all(workers.map((w) => w.terminate()));
  return out;
}
