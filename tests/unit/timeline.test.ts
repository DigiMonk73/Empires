import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { niceStep, SAMPLE_TICKS, TimelineRecorder } from '../../src/game/timeline.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';

function sim() {
  return Sim.create({
    seed: 2,
    map: { w: 32, h: 32 },
    victory: 'none',
    players: [{ civ: 'greek' }, { civ: 'egyptian' }],
    scenario: {
      buildings: [{ type: 'townCenter', owner: 1, tx: 3, ty: 3 }, { type: 'townCenter', owner: 2, tx: 24, ty: 24 }],
      units: [{ type: 'villager', owner: 1, x: 8.5, y: 8.5 }, { type: 'clubman', owner: 2, x: 20.5, y: 20.5 }],
    },
  });
}

describe('post-game timeline (M12.4)', () => {
  it('samples every 30 s of game time and once more when asked, per player', () => {
    const s = sim();
    const rec = new TimelineRecorder(s.world);
    for (let i = 0; i < SAMPLE_TICKS * 2 + 100; i++) {
      s.step([]);
      rec.onTick();
    }
    const t = rec.finish();
    expect(t.players).toEqual([1, 2]);
    expect(t.ticks).toEqual([0, SAMPLE_TICKS, SAMPLE_TICKS * 2, SAMPLE_TICKS * 2 + 100]);
    expect(t.series.villagers[0]).toEqual([1, 0]);
    expect(t.series.military[0]).toEqual([0, 1]);
    expect(t.series.pop.every((row) => row.length === 2)).toBe(true);
    expect(rec.finish().ticks).toHaveLength(4); // no duplicate sample for the same tick
  });

  it('records when each age was reached', () => {
    const s = sim();
    const rec = new TimelineRecorder(s.world);
    for (let i = 0; i < 50; i++) s.step([]);
    completeResearch(s.world, 2, 'toolAge');
    expect(rec.finish().ages).toEqual([[0, 0, 0], [50, 0, 0]]);
  });

  it('carries on from a saved timeline, dropping samples later than the save', () => {
    const s = sim();
    const rec = new TimelineRecorder(s.world);
    for (let i = 0; i < SAMPLE_TICKS; i++) {
      s.step([]);
      rec.onTick();
    }
    const saved = rec.finish();
    const later = { ...saved, ticks: [...saved.ticks, SAMPLE_TICKS * 5], series: Object.fromEntries(Object.entries(saved.series).map(([k, v]) => [k, [...v, [9, 9]]])) as typeof saved.series };
    const again = new TimelineRecorder(s.world, later).finish();
    expect(again.ticks).toEqual([0, SAMPLE_TICKS]);
    // A timeline from another game (different players) is ignored.
    expect(new TimelineRecorder(s.world, { ...saved, players: [1, 2, 3] }).finish().ticks).toEqual([SAMPLE_TICKS]);
  });

  it('graph axes step by round numbers', () => {
    expect([niceStep(333), niceStep(50), niceStep(7), niceStep(12000), niceStep(0)]).toEqual([100, 20, 2, 5000, 1]);
  });
});
