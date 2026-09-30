import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex } from '../../src/sim/rules/registry.ts';
import { computeScores } from '../../src/sim/rules/score.ts';
import { buildingAvailable } from '../../src/sim/systems/build.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';

describe('the Wonder (M7.7, econ:4)', () => {
  it('needs the Iron Age; 1000 wood/stone/gold; 8000 builder-seconds; +100 score standing', () => {
    const units = Array.from({ length: 10 }, (_, i) => ({ type: 'villager', owner: 1, x: 12.5 + (i % 5), y: 8.5 + Math.floor(i / 5) }));
    const sim = Sim.create({ seed: 4, map: { w: 40, h: 40 }, players: [{ civ: 'greek' }, { civ: 'persian' }], startingResources: 'deathmatch', victory: 'none', scenario: { units, buildings: [{ type: 'townCenter', owner: 1, tx: 3, ty: 3 }, { type: 'townCenter', owner: 2, tx: 34, ty: 34 }] } });
    const w = sim.world;
    const ti = buildingTypeIndex('wonder');
    expect(buildingAvailable(w, 1, ti).ok).toBe(false);
    for (const a of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(w, 1, a);
    expect(buildingAvailable(w, 1, ti).ok).toBe(true);
    const res0 = [...w.players[1]!.res];
    const ids: number[] = [];
    for (let s = 0; s < w.ents.top; s++) if (w.ents.alive[s] && w.ents.owner[s] === 1 && w.ents.kind[s] === 1) ids.push(w.ents.handleOf(s));
    sim.step([{ player: 1, cmd: { t: 'build', ids, type: 'wonder', tx: 12, ty: 11 } }]);
    const res1 = w.players[1]!.res;
    expect([res0[1]! - res1[1]!, res0[2]! - res1[2]!, res0[3]! - res1[3]!]).toEqual([1000, 1000, 1000]);
    let wonder = -1;
    for (let s = 0; s < w.ents.top; s++) if (w.ents.alive[s] && w.ents.type[s] === ti) wonder = s;
    const scoreOf = () => computeScores(w).find((l) => l.player === 1)!.other;
    expect(scoreOf()).toBe(0);
    // Ten builders work (10 + 2) / 3 = 4× as fast: 8000 s / 4 = 2000 s, plus the walk in.
    let t = 0;
    while (w.ents.build[wonder]! < 1 && t < 20 * 2400) {
      sim.step();
      sim.drainEvents();
      t++;
    }
    expect(w.ents.build[wonder]).toBe(1);
    expect(t / 20).toBeGreaterThan(1950);
    expect(t / 20).toBeLessThan(2100);
    expect(scoreOf()).toBe(100);
  });
});
