import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { wallLine as line } from '../../src/input/wallLine.ts';

type B = { type: string; owner: number; tx: number; ty: number; progress?: number };
type U = { type: string; owner: number; x: number; y: number };

function setup(buildings: B[], units: U[] = []) {
  const sim = Sim.create({ seed: 7, map: { w: 32, h: 32 }, players: [{ civ: 'greek' }, { civ: 'persian' }], startingResources: 'high', victory: 'none', scenario: { buildings, units } });
  const w = sim.world;
  const e = w.ents;
  const of = (type: string) => {
    const ti = buildingTypeIndex(type);
    const out: number[] = [];
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.type[s] === ti) out.push(s);
    return out;
  };
  const step = (n: number, cmds: Parameters<Sim['step']>[0] = []) => {
    for (let i = 0; i < n; i++) {
      sim.step(i === 0 ? cmds : []);
      sim.drainEvents();
    }
  };
  return { sim, w, e, of, step };
}

describe('walls and tower upgrades (M7.2)', () => {
  it('research upgrades the walls and towers standing in the field, and their hit points', () => {
    const t = setup([
      { type: 'smallWall', owner: 1, tx: 5, ty: 5 },
      { type: 'smallWall', owner: 1, tx: 6, ty: 5 },
      { type: 'smallWall', owner: 1, tx: 7, ty: 5, progress: 0.5 },
      { type: 'watchTower', owner: 1, tx: 10, ty: 10 },
      { type: 'smallWall', owner: 2, tx: 20, ty: 20 },
    ]);
    const [a] = t.of('smallWall');
    t.e.hp[a!] = 150; // damaged: keeps its damage, gains the difference
    completeResearch(t.w, 1, 'smallWall');
    completeResearch(t.w, 1, 'mediumWall');
    completeResearch(t.w, 1, 'watchTower');
    completeResearch(t.w, 1, 'sentryTower');
    expect(t.of('mediumWall').length).toBe(3); // the foundation too
    expect(t.of('smallWall').map((s) => t.e.owner[s])).toEqual([2]); // not the other player's
    expect(t.e.hp[a!]).toBe(250); // 200 → 300 max
    expect(t.of('sentryTower').length).toBe(1);
    expect(t.w.stats(1, buildingTypeIndex('sentryTower')).range).toBe(6);
    completeResearch(t.w, 1, 'fortification');
    expect(t.of('fortification').length).toBe(3);
  });

  it("a 'Small Wall' order builds the line's current level", () => {
    const t = setup([], [{ type: 'villager', owner: 1, x: 8.5, y: 8.5 }]);
    for (const age of ['toolAge', 'bronzeAge']) completeResearch(t.w, 1, age);
    completeResearch(t.w, 1, 'smallWall');
    completeResearch(t.w, 1, 'mediumWall');
    const v = t.e.handleOf(0);
    t.step(1, [{ player: 1, cmd: { t: 'build', ids: [v], type: 'smallWall', tx: 10, ty: 8 } }]);
    expect(t.of('mediumWall').length).toBe(1);
    expect(t.of('smallWall').length).toBe(0);
  });

  it('a dragged line of walls — diagonal steps included — seals the way through', () => {
    // A wall across the whole map at an angle (Bresenham: diagonal steps), with no gap.
    const tiles = line(0, 3, 31, 28);
    const t = setup(tiles.map(([tx, ty]) => ({ type: 'smallWall', owner: 1, tx, ty })), [{ type: 'clubman', owner: 2, x: 20.5, y: 5.5 }]);
    const e = t.e;
    let c = -1;
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.type[s] === unitTypeIndex('clubman')) c = s;
    t.step(1, [{ player: 2, cmd: { t: 'move', ids: [e.handleOf(c)], x: 5.5, y: 25.5 } }]);
    t.step(20 * 60);
    // It stops on its own side of the wall (the line's side test: below the line from (0,3) to (31,28)).
    const side = (x: number, y: number) => (31 - 0) * (y - 3) - (28 - 3) * (x - 0);
    expect(Math.sign(side(e.x[c]!, e.y[c]!))).toBe(Math.sign(side(20.5, 5.5)));
  });
});
