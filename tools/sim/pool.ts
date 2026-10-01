/**
 * Run many headless jobs on worker threads (M13.1): the AI suite's 200+ matches took ~8 minutes on one core.
 * Results come back in input order; a job that throws resolves to an Error. The jobs are deterministic, so the
 * pool changes nothing but the wall-clock time.
 */
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import type { MatchOptions, MatchResult } from '../../src/game/aiMatch.ts';

export type MatchJob = Omit<MatchOptions, 'clock'>;

export function runMatches(jobs: MatchJob[], threads?: number): Promise<(MatchResult | Error)[]> {
  return runPool<MatchJob, MatchResult>(new URL('./match-worker.ts', import.meta.url), jobs, threads);
}

/** Each worker answers `{ id, opts }` with `{ id, result }` or `{ id, error }`. */
export async function runPool<J, R>(worker: URL, jobs: J[], threads = Math.max(1, Math.min(jobs.length, availableParallelism() - 2))): Promise<(R | Error)[]> {
  const out = new Array<R | Error>(jobs.length);
  let next = 0;
  const workers = Array.from({ length: threads }, () => new Worker(worker));
  await Promise.all(
    workers.map(
      (w) =>
        new Promise<void>((resolve, reject) => {
          const feed = () => {
            if (next >= jobs.length) return resolve();
            const id = next++;
            w.postMessage({ id, opts: jobs[id] });
          };
          w.on('message', (m: { id: number; result?: R; error?: string }) => {
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
