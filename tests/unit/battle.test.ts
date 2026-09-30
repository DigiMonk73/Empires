import { describe, expect, it } from 'vitest';
import { runBattle } from '../../src/sim/testing/battle.ts';

describe('20v20 battle (M5 exit gate)', () => {
  it('is decided, nobody gets stuck, and a rerun is identical', () => {
    const a = runBattle(3);
    const b = runBattle(3);
    expect(a.winner).not.toBe(0);
    expect(a.stuckUnits).toBe(0);
    expect(a.ticks).toBeLessThan(20 * 300);
    expect(b.trace).toEqual(a.trace);
    expect(b.final).toBe(a.final);
  });
});
