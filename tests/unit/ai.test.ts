import { describe, expect, it } from 'vitest';
import { runMatch } from '../../src/game/aiMatch.ts';

describe('AI v1 economy (M6.4)', () => {
  it('Moderate AIs boom to the Tool Age by 12:00 with villagers kept busy', () => {
    const r = runMatch({ seed: 3, type: 'continental', size: 'small', levels: ['moderate', 'moderate'], minutes: 12 });
    for (const ages of r.ageTick) {
      expect(ages[2]).toBeGreaterThan(0);
      expect(ages[2]).toBeLessThanOrEqual(12 * 60 * 20);
    }
    for (const idle of r.idlePct) expect(idle).toBeLessThan(5);
    const last = r.samples[r.samples.length - 1]!;
    for (const p of last.players) expect(p.villagers).toBeGreaterThanOrEqual(18);
  });

  it('is deterministic', () => {
    const a = runMatch({ seed: 5, levels: ['moderate', 'easy'], minutes: 4 });
    const b = runMatch({ seed: 5, levels: ['moderate', 'easy'], minutes: 4 });
    expect(b.hash).toBe(a.hash);
  });
});
