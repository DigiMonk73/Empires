import type { EconBenchResult } from './econBench.ts';

/** The M4 economy gates (shared by the unit test and tools/sim/econ.ts). */
export const ECON_GATES = { rateTolerance: 0.05, minEfficiency: 0.75, maxIdlePct: 3 } as const;

export function econGates(r: EconBenchResult): { fails: string[]; idleNoHunt: number } {
  const fails: string[] = [];
  for (const [job, m] of Object.entries(r.jobs)) {
    if (Math.abs(m.workRate / m.expected - 1) > ECON_GATES.rateTolerance) fails.push(`${job} work rate ${m.workRate.toFixed(3)} vs ${m.expected}`);
    if (job !== 'hunt' && m.efficiency < ECON_GATES.minEfficiency) fails.push(`${job} efficiency ${(m.efficiency * 100).toFixed(0)}%`);
  }
  for (const job of ['forage', 'farm', 'fish', 'wood', 'gold', 'stone']) if (!r.jobs[job]) fails.push(`${job}: nothing gathered`);
  const groups = Object.entries(r.idleByGroup).filter(([g]) => g !== 'hunt');
  const idleNoHunt = groups.reduce((a, [, v]) => a + v, 0) / Math.max(1, groups.length);
  if (idleNoHunt > ECON_GATES.maxIdlePct) fails.push(`idle ${idleNoHunt.toFixed(2)}%`);
  return { fails, idleNoHunt };
}
