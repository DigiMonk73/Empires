import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { kill } from '../../src/sim/systems/combat.ts';
import { COUNTDOWN_TICKS } from '../../src/sim/systems/victory.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';
import { ALLY } from '../../src/sim/rules/diplomacy.ts';
import { clockRows, winLine } from '../../src/ui/clocks.ts';
import type { SimEvent, VictoryMode } from '../../src/sim/world.ts';

type U = { type: string; owner: number; x: number; y: number };
type B = { type: string; owner: number; tx: number; ty: number; progress?: number };

/** Three players (1 and 3 on a team only when `allies`), a Town Center each so nobody falls to conquest. */
function game(buildings: B[], units: U[] = [], victory: VictoryMode = 'standard', allies = false) {
  const sim = Sim.create({
    seed: 6,
    victory,
    map: { w: 40, h: 40 },
    players: [{ civ: 'greek', team: 1 }, { civ: 'persian', team: 2 }, { civ: 'egyptian', team: allies ? 1 : 3 }],
    scenario: {
      buildings: [
        { type: 'townCenter', owner: 1, tx: 2, ty: 2 },
        { type: 'townCenter', owner: 2, tx: 34, ty: 34 },
        { type: 'townCenter', owner: 3, tx: 2, ty: 34 },
        ...buildings,
      ],
      units,
    },
  });
  const w = sim.world;
  const e = w.ents;
  const events: SimEvent[] = [];
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      sim.step([]);
      events.push(...sim.drainEvents());
    }
  };
  const find = (type: string) => {
    for (let s = 0; s < e.top; s++) if (e.alive[s] && TYPES[e.type[s]!]!.id === type) return s;
    throw new Error(type);
  };
  return { sim, w, e, events, step, find };
}

describe('Standard victory (M14.2, econ:7)', () => {
  it('2000 years are 1000 s at speed 1.0', () => {
    expect(COUNTDOWN_TICKS).toBe(20000);
  });

  it('a finished Wonder wins after 2000 years; a foundation starts nothing', () => {
    const g = game([
      { type: 'wonder', owner: 2, tx: 15, ty: 15 },
      { type: 'wonder', owner: 3, tx: 25, ty: 5, progress: 0.5 },
    ]);
    g.step(1); // checked at tick 0
    expect(g.w.countdowns).toEqual([{ kind: 'wonder', player: 2, h: g.e.handleOf(g.find('wonder')), end: COUNTDOWN_TICKS }]);
    expect(g.events.filter((x) => x.t === 'countdown')).toEqual([{ t: 'countdown', kind: 'wonder', player: 2, end: COUNTDOWN_TICKS }]);
    // The clock at the upper right counts years: 2000 at the start, 1000 halfway.
    expect(clockRows(g.w, 1)[0]!.text).toBe('Player 2 · Wonder · 2000');
    g.step(COUNTDOWN_TICKS / 2 - 1);
    expect(clockRows(g.w, 2)[0]!.text).toBe('You · Wonder · 1000');
    g.step(COUNTDOWN_TICKS / 2);
    expect(g.w.gameOver).toBeNull();
    g.step(1);
    expect(g.w.gameOver).toMatchObject({ tick: COUNTDOWN_TICKS, winners: [2], how: 'wonder' });
    expect(g.events.find((x) => x.t === 'victory')).toMatchObject({ players: [2], how: 'wonder', by: 2 });
    expect(winLine('wonder', false, 2, 1)).toBe('Player 2’s Wonder has stood for 2000 years.');
  });

  it('losing the Wonder stops its clock; a new one starts from 2000', () => {
    const g = game([{ type: 'wonder', owner: 2, tx: 15, ty: 15 }]);
    g.step(2000);
    kill(g.w, g.find('wonder'));
    g.step(20);
    expect(g.w.countdowns).toEqual([]);
    expect(g.events.some((x) => x.t === 'countdownStopped' && x.kind === 'wonder' && x.player === 2)).toBe(true);
  });

  it('all the Artifacts held by one side start a clock; losing one stops it; the Ruins count apart', () => {
    const g = game(
      [
        { type: 'artifact', owner: 1, tx: 12, ty: 12 },
        { type: 'artifact', owner: 1, tx: 20, ty: 12 },
        { type: 'ruins', owner: 1, tx: 12, ty: 20 },
        { type: 'ruins', owner: 0, tx: 20, ty: 20 },
      ],
      [{ type: 'scout', owner: 2, x: 30.5, y: 12.5 }],
    );
    g.step(21);
    expect(g.w.countdowns.map((c) => [c.kind, c.player])).toEqual([['artifacts', 1]]);
    // Player 2's scout takes an unguarded Artifact.
    g.sim.step([{ player: 2, cmd: { t: 'move', ids: [g.e.handleOf(g.find('scout'))], x: 21.5, y: 13.9 } }]);
    g.step(20 * 10);
    expect(g.w.countdowns).toEqual([]);
    expect(g.events.some((x) => x.t === 'countdownStopped' && x.kind === 'artifacts')).toBe(true);
  });

  it('allies holding the set together share one clock and win together', () => {
    const g = game(
      [
        { type: 'ruins', owner: 1, tx: 12, ty: 12 },
        { type: 'ruins', owner: 3, tx: 20, ty: 12 },
      ],
      [],
      'standard',
      true,
    );
    expect(g.w.players[1]!.stance[3]).toBe(ALLY);
    g.step(21);
    expect(g.w.countdowns.map((c) => [c.kind, c.player])).toEqual([['ruins', 1]]);
    g.step(COUNTDOWN_TICKS);
    expect(g.w.gameOver).toMatchObject({ winners: [1, 3], how: 'ruins' });
  });

  it('conquest games run no clocks; the clocks survive save/load', () => {
    const c = game([{ type: 'wonder', owner: 2, tx: 15, ty: 15 }], [], 'conquest');
    c.step(40);
    expect(c.w.countdowns).toEqual([]);
    const g = game([{ type: 'wonder', owner: 2, tx: 15, ty: 15 }]);
    g.step(500);
    const b = Sim.deserialize(g.sim.serialize());
    expect(b.world.countdowns).toEqual(g.w.countdowns);
    expect(b.hash()).toBe(g.sim.hash());
  });
});
