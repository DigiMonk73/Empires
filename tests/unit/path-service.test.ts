import { describe, expect, it } from 'vitest';
import { Sim, type SimConfig } from '../../src/sim/index.ts';
import { MOVE_LAND } from '../../src/data/terrain.ts';
import { PathGrid } from '../../src/sim/path/grid.ts';
import { lineWalkable } from '../../src/sim/path/los.ts';

function sim(ascii: string[], units: { x: number; y: number }[]): { sim: Sim; ids: number[] } {
  const cfg: SimConfig = {
    seed: 1,
    map: { w: ascii[0]!.length, h: ascii.length, ascii },
    players: [{ civ: 'greek' }],
    scenario: { units: units.map((u) => ({ type: 'villager', owner: 1, ...u })) },
  };
  const s = Sim.create(cfg);
  const ids: number[] = [];
  for (let i = 0; i < s.world.ents.top; i++) if (s.world.ents.alive[i]) ids.push(s.world.ents.handleOf(i));
  return { sim: s, ids };
}

function runUntilIdle(s: Sim, id: number, max = 3000): number {
  let t = 0;
  while (t < max && s.world.orders[s.world.ents.slotOf(id)]) {
    s.step();
    t++;
  }
  return t;
}

const pos = (s: Sim, id: number): [number, number] => {
  const k = s.world.ents.slotOf(id);
  return [s.world.ents.x[k]!, s.world.ents.y[k]!];
};

describe('path service + movement', () => {
  it('walks around a wall and never enters blocked tiles', () => {
    const { sim: s, ids } = sim(
      ['..........', '....T.....', '....T.....', '....T.....', '....T.....', '..........'],
      [{ x: 1.5, y: 2.5 }],
    );
    s.step([{ player: 1, cmd: { t: 'move', ids, x: 8.5, y: 2.5 } }]);
    const grid = new PathGrid(s.world.map, MOVE_LAND);
    let t = 0;
    while (s.world.orders[s.world.ents.slotOf(ids[0]!)] && t++ < 2000) {
      s.step();
      const [x, y] = pos(s, ids[0]!);
      expect(grid.walkable(Math.floor(x), Math.floor(y))).toBe(true);
    }
    expect(pos(s, ids[0]!)).toEqual([8.5, 2.5]);
    // Straight line is 7 tiles; the detour must be longer but reasonable.
    expect(t).toBeGreaterThan((7 / 1.1) * 20);
    expect(t).toBeLessThan((12 / 1.1) * 20);
  });

  it('crosses open ground in one straight segment (smoothing)', () => {
    const { sim: s, ids } = sim(Array.from({ length: 20 }, () => '.'.repeat(20)), [{ x: 1.5, y: 1.5 }]);
    s.step([{ player: 1, cmd: { t: 'move', ids, x: 17.25, y: 11.75 } }]);
    const p = s.world.paths[s.world.ents.slotOf(ids[0]!)]!;
    expect(p.length).toBe(2); // one waypoint left after the first move step: the destination
    expect(p).toEqual([17.25, 11.75]);
  });

  it('retargets an unreachable goal to the nearest reachable tile and completes the order', () => {
    const { sim: s, ids } = sim(['.....~~~~~', '.....~~.~~', '.....~~~~~'], [{ x: 0.5, y: 1.5 }]);
    s.step([{ player: 1, cmd: { t: 'move', ids, x: 7.5, y: 1.5 } }]);
    const ticks = runUntilIdle(s, ids[0]!);
    expect(ticks).toBeLessThan(200);
    const [x] = pos(s, ids[0]!);
    expect(Math.floor(x)).toBe(4); // stopped at the shore
  });

  it('a click on a tree walks to an adjacent open tile', () => {
    const { sim: s, ids } = sim(['.......', '...T...', '.......'], [{ x: 0.5, y: 1.5 }]);
    s.step([{ player: 1, cmd: { t: 'move', ids, x: 3.5, y: 1.5 } }]);
    runUntilIdle(s, ids[0]!);
    const [x, y] = pos(s, ids[0]!);
    expect(Math.max(Math.abs(Math.floor(x) - 3), Math.abs(Math.floor(y) - 1))).toBe(1);
  });

  it('spreads many requests across ticks under the budget, deterministically', () => {
    const rows = Array.from({ length: 120 }, (_, y) => Array.from({ length: 120 }, (_, x) => ((x * 7 + y * 13) % 29 === 0 ? 'T' : '.')).join(''));
    const units = Array.from({ length: 300 }, (_, i) => ({ x: 2.5 + (i % 20), y: 2.5 + Math.floor(i / 20) }));
    const a = sim(rows, units);
    const b = sim(rows, units);
    a.sim.step([{ player: 1, cmd: { t: 'move', ids: a.ids, x: 110.5, y: 105.5 } }]);
    b.sim.step([{ player: 1, cmd: { t: 'move', ids: b.ids, x: 110.5, y: 105.5 } }]);
    expect(a.sim.world.pathing.stats.served).toBeLessThan(300); // not all served in the first tick
    for (let t = 0; t < 90; t++) {
      a.sim.step();
      b.sim.step();
    }
    expect(a.sim.world.pathing.stats.served).toBe(300);
    expect(a.sim.hash()).toBe(b.sim.hash());
  });
});

describe('lineWalkable', () => {
  it('refuses to squeeze between diagonal obstacles', () => {
    const { sim: s } = sim(['.T.', 'T..', '...'], []);
    const g = new PathGrid(s.world.map, MOVE_LAND);
    expect(lineWalkable(g, 0.5, 0.5, 2.5, 2.5)).toBe(false);
    expect(lineWalkable(g, 1.5, 1.5, 2.5, 2.5)).toBe(true);
    expect(lineWalkable(g, 2.5, 0.5, 2.5, 2.5)).toBe(true);
  });
});
