import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import type { Command } from '../../src/sim/index.ts';
import { ALLY, ENEMY, NEUTRAL, stanceOf } from '../../src/sim/rules/diplomacy.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { computeScores } from '../../src/sim/rules/score.ts';

type Unit = { type: string; owner: number; x: number; y: number };
function world(units: Unit[], opts: { market?: boolean; victory?: 'conquest' | 'none' } = {}) {
  return Sim.create({
    seed: 3,
    map: { w: 40, h: 40 },
    victory: opts.victory ?? 'none',
    players: [{ civ: 'greek', team: 1 }, { civ: 'egyptian', team: 2 }, { civ: 'persian', team: 1 }],
    scenario: {
      buildings: [
        { type: 'townCenter', owner: 1, tx: 2, ty: 2 },
        { type: 'townCenter', owner: 2, tx: 34, ty: 2 },
        { type: 'townCenter', owner: 3, tx: 2, ty: 34 },
        ...(opts.market ? [{ type: 'market', owner: 1, tx: 8, ty: 2 }] : []),
      ],
      units,
    },
  });
}
const first = (sim: Sim, type: string, owner: number): number => {
  const e = sim.world.ents;
  for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === owner && TYPES[e.type[s]!]!.id === type) return e.handleOf(s);
  throw new Error(`${type} of ${owner}`);
};
const cmd = (sim: Sim, player: number, c: Command) => sim.step([{ player, cmd: c }]);
const attacking = (sim: Sim, h: number) => sim.world.orders[sim.world.ents.slotOf(h)]?.[0]?.k === 'attack';

describe('diplomacy (M12.3)', () => {
  it('starts from the teams and changes one side at a time', () => {
    const sim = world([]);
    const w = sim.world;
    expect([stanceOf(w, 1, 2), stanceOf(w, 1, 3), stanceOf(w, 2, 3), stanceOf(w, 1, 1), stanceOf(w, 1, 0)]).toEqual([ENEMY, ALLY, ENEMY, ALLY, ENEMY]);
    cmd(sim, 1, { t: 'diplomacy', to: 2, stance: NEUTRAL });
    expect(stanceOf(w, 1, 2)).toBe(NEUTRAL);
    expect(stanceOf(w, 2, 1)).toBe(ENEMY); // the other side decides for itself
    expect(sim.drainEvents().filter((e) => e.t === 'diplomacy')).toEqual([{ t: 'diplomacy', from: 1, to: 2, stance: NEUTRAL }]);
    cmd(sim, 1, { t: 'diplomacy', to: 1, stance: ENEMY });
    cmd(sim, 1, { t: 'diplomacy', to: 2, stance: 7 });
    expect(sim.drainEvents().filter((e) => e.t === 'rejected')).toHaveLength(2);
  });

  it('Neutral: soldiers leave villagers alone but fight soldiers; Enemy: everything', () => {
    const sim = world([
      { type: 'clubman', owner: 1, x: 20.5, y: 20.5 },
      { type: 'villager', owner: 2, x: 22.5, y: 20.5 },
    ]);
    const club = first(sim, 'clubman', 1);
    cmd(sim, 1, { t: 'diplomacy', to: 2, stance: NEUTRAL });
    cmd(sim, 2, { t: 'diplomacy', to: 1, stance: NEUTRAL });
    for (let i = 0; i < 40; i++) sim.step([]);
    expect(attacking(sim, club)).toBe(false);
    cmd(sim, 1, { t: 'diplomacy', to: 2, stance: ENEMY });
    for (let i = 0; i < 20; i++) sim.step([]);
    expect(attacking(sim, club)).toBe(true);

    const s2 = world([
      { type: 'clubman', owner: 1, x: 20.5, y: 20.5 },
      { type: 'clubman', owner: 2, x: 22.5, y: 20.5 },
    ]);
    cmd(s2, 1, { t: 'diplomacy', to: 2, stance: NEUTRAL });
    for (let i = 0; i < 20; i++) s2.step([]);
    expect(attacking(s2, first(s2, 'clubman', 1))).toBe(true); // a neutral's soldier is fair game
  });

  it('calling a player Ally stops the attacks on them and the soldiers leave each other be', () => {
    const sim = world([
      { type: 'clubman', owner: 1, x: 20.5, y: 20.5 },
      { type: 'clubman', owner: 2, x: 22.5, y: 20.5 },
    ]);
    const a = first(sim, 'clubman', 1);
    const b = first(sim, 'clubman', 2);
    for (let i = 0; i < 20; i++) sim.step([]);
    expect(attacking(sim, a) && attacking(sim, b)).toBe(true);
    cmd(sim, 1, { t: 'diplomacy', to: 2, stance: ALLY });
    cmd(sim, 2, { t: 'diplomacy', to: 1, stance: ALLY });
    expect(attacking(sim, a) || attacking(sim, b)).toBe(false);
    for (let i = 0; i < 40; i++) sim.step([]);
    expect(attacking(sim, a) || attacking(sim, b)).toBe(false);
  });

  it('tribute needs a Market and costs a 25% fee on top until Coinage', () => {
    const none = world([]);
    cmd(none, 1, { t: 'tribute', to: 2, res: 0, amount: 100 });
    expect(none.drainEvents().find((e) => e.t === 'rejected')).toMatchObject({ reason: 'tribute requires a Market' });

    const sim = world([], { market: true });
    const p1 = sim.world.players[1]!;
    const p2 = sim.world.players[2]!;
    p1.res[0] = 1000;
    p2.res[0] = 0;
    cmd(sim, 1, { t: 'tribute', to: 2, res: 0, amount: 100 });
    expect(p1.res[0]).toBe(875);
    expect(p2.res[0]).toBe(100);
    expect(sim.drainEvents().find((e) => e.t === 'tribute')).toEqual({ t: 'tribute', from: 1, to: 2, res: 0, amount: 100, fee: 25 });
    expect(p1.tally.tribute).toBe(100);
    cmd(sim, 1, { t: 'tribute', to: 2, res: 0, amount: 800 }); // 1000 needed, 875 held
    expect(sim.drainEvents().find((e) => e.t === 'rejected')).toMatchObject({ reason: 'not enough food' });
    completeResearch(sim.world, 1, 'coinage');
    cmd(sim, 1, { t: 'tribute', to: 2, res: 0, amount: 600 });
    expect(p1.res[0]).toBe(275);
    expect(p1.tally.tribute).toBe(700);
    // Economy score: tribute ÷ 60.
    const eco = computeScores(sim.world).find((s) => s.player === 1)!.economy;
    p1.tally.tribute = 0;
    expect(eco - computeScores(sim.world).find((s) => s.player === 1)!.economy).toBe(11);
  });

  it('allies win together only while every survivor calls every other Ally and ticks Allied Victory', () => {
    const run = (setup: (sim: Sim) => void) => {
      const sim = world([], { victory: 'conquest' });
      setup(sim);
      cmd(sim, 2, { t: 'resign' });
      for (let i = 0; i < 40; i++) sim.step([]);
      return sim.world.gameOver;
    };
    expect(run(() => {})?.winners).toEqual([1, 3]);
    expect(run((sim) => cmd(sim, 1, { t: 'diplomacy', to: 3, stance: NEUTRAL }))).toBeNull();
    expect(run((sim) => cmd(sim, 3, { t: 'alliedVictory', on: false }))).toBeNull();
  });

  it('Writing shares sight with the players we call Ally, and stops when we stop', () => {
    const sim = world([{ type: 'scout', owner: 1, x: 30.5, y: 30.5 }]);
    completeResearch(sim.world, 1, 'writing');
    sim.step([]);
    const seen = () => sim.world.fog.vis[3]![30 * 40 + 30]! > 0;
    expect(seen()).toBe(true);
    cmd(sim, 1, { t: 'diplomacy', to: 3, stance: NEUTRAL });
    sim.step([]);
    expect(seen()).toBe(false);
  });

  it('stances and Allied Victory survive a save and load', () => {
    const sim = world([]);
    cmd(sim, 1, { t: 'diplomacy', to: 2, stance: NEUTRAL });
    cmd(sim, 3, { t: 'alliedVictory', on: false });
    const back = Sim.deserialize(sim.serialize());
    expect(back.world.players[1]!.stance).toEqual(sim.world.players[1]!.stance);
    expect(back.world.players[3]!.alliedVictory).toBe(false);
    expect(back.hash()).toBe(sim.hash());
  });
});
