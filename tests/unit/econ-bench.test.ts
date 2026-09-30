import { describe, expect, it } from 'vitest';
import { runEconBench } from '../../src/sim/testing/econBench.ts';
import { econGates } from '../../src/sim/testing/econGates.ts';

describe('economy benchmark (M4 exit gate)', () => {
  it('work rates match the research, trips are efficient, villagers stay busy', () => {
    const r = runEconBench(8);
    expect(econGates(r).fails).toEqual([]);
    // Every food/wood/gold/stone job ran with all four villagers.
    for (const job of ['forage', 'farm', 'fish', 'wood', 'gold', 'stone']) expect(r.jobs[job]!.villagers).toBe(4);
  });

  it('is deterministic', () => {
    expect(runEconBench(1).hash).toBe(runEconBench(1).hash);
  });
});
