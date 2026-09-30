import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { computeScores } from '../../src/sim/rules/score.ts';

type U = { type: string; owner: number; x: number; y: number };
type B = { type: string; owner: number; tx: number; ty: number };

function game(units: U[], buildings: B[] = [], teams: number[] = [1, 2], victory: 'conquest' | 'none' = 'conquest') {
  const sim = Sim.create({
    seed: 4,
    victory,
    map: { w: 32, h: 32 },
    players: teams.map((team, i) => ({ civ: i % 2 ? 'persian' : 'greek', team })),
    scenario: { units, buildings },
  });
  const events: { t: string; player?: number; players?: number[] }[] = [];
  const e = sim.world.ents;
  const handles = (owner: number, type: string) => {
    const out: number[] = [];
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === owner && (type === '*' || e.type[s] === e.type[s])) out.push(e.handleOf(s));
    return out;
  };
  const step = (n: number, cmds: Parameters<Sim['step']>[0] = []) => {
    for (let i = 0; i < n; i++) {
      sim.step(i === 0 ? cmds : []);
      events.push(...(sim.drainEvents() as { t: string }[]));
    }
  };
  return { sim, w: sim.world, events, handles, step };
}

describe('conquest victory (econ:7)', () => {
  it('killing the last villager defeats a player; the survivor wins; tallies record it', () => {
    const { w, events, handles, step } = game([
      { type: 'clubman', owner: 1, x: 10.5, y: 10.5 },
      { type: 'clubman', owner: 1, x: 10.5, y: 11.5 },
      { type: 'villager', owner: 2, x: 12.5, y: 10.5 },
    ]);
    step(1, [{ player: 1, cmd: { t: 'act', ids: handles(1, '*'), h: handles(2, '*')[0]! } }]);
    step(20 * 20);
    expect(events.some((ev) => ev.t === 'defeated' && ev.player === 2)).toBe(true);
    expect(events.find((ev) => ev.t === 'victory')).toMatchObject({ players: [1] });
    expect(w.gameOver).toMatchObject({ team: 1, winners: [1] });
    expect(w.players[1]!.tally.kills).toBe(1);
    expect(w.players[2]!.tally.losses).toBe(1);
    const [s1, s2] = computeScores(w);
    // Military: ½ per kill + (kills − losses) + 25 for most military units → 26.5 → 26.
    expect(s1!.military).toBe(26);
    expect(s2!.other).toBe(-100);
  });

  it('walls do not keep a player alive', () => {
    const { w, events, step } = game([{ type: 'villager', owner: 1, x: 5.5, y: 5.5 }], [{ type: 'smallWall', owner: 2, tx: 20, ty: 20 }]);
    step(25);
    expect(events.some((ev) => ev.t === 'defeated' && ev.player === 2)).toBe(true);
    expect(w.gameOver?.winners).toEqual([1]);
  });

  it('allies win together; a sandbox game never ends', () => {
    const a = game([{ type: 'villager', owner: 1, x: 5.5, y: 5.5 }, { type: 'villager', owner: 2, x: 7.5, y: 5.5 }], [], [1, 1, 2]);
    a.step(25);
    expect(a.w.gameOver).toMatchObject({ team: 1, winners: [1, 2] });
    const b = game([{ type: 'villager', owner: 1, x: 5.5, y: 5.5 }], [], [1, 2], 'none');
    b.step(60);
    expect(b.w.gameOver).toBeNull();
    expect(b.events.some((ev) => ev.t === 'defeated')).toBe(false);
  });

  it('tallies and game-over survive save/load', () => {
    const { sim, handles, step } = game([
      { type: 'clubman', owner: 1, x: 10.5, y: 10.5 },
      { type: 'villager', owner: 2, x: 11.5, y: 10.5 },
    ]);
    step(1, [{ player: 1, cmd: { t: 'act', ids: handles(1, '*'), h: handles(2, '*')[0]! } }]);
    step(20 * 20);
    const b = Sim.deserialize(sim.serialize());
    expect(b.world.gameOver).toEqual(sim.world.gameOver);
    expect(b.world.players[1]!.tally).toEqual(sim.world.players[1]!.tally);
    expect(b.hash()).toBe(sim.hash());
  });
});
