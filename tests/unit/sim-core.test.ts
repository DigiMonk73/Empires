import { describe, expect, it } from 'vitest';
import { Sim, type SimConfig } from '../../src/sim/index.ts';
import { decodeCommands, encodeCommands } from '../../src/sim/commands/codec.ts';
import { quantize, type Command, type PlayerCommand } from '../../src/sim/commands/types.ts';
import { MOVE_LAND } from '../../src/data/terrain.ts';

const cfg = (extra: Partial<SimConfig> = {}): SimConfig => ({
  seed: 1234,
  map: { w: 32, h: 32 },
  players: [{ civ: 'greek' }, { civ: 'egyptian' }],
  scenario: {
    units: [
      { type: 'villager', owner: 1, x: 2.5, y: 2.5 },
      { type: 'villager', owner: 1, x: 3.5, y: 2.5 },
      { type: 'clubman', owner: 2, x: 20.5, y: 20.5 },
    ],
  },
  ...extra,
});

const handles = (sim: Sim): number[] => {
  const e = sim.world.ents;
  const out: number[] = [];
  for (let s = 0; s < e.top; s++) if (e.alive[s]) out.push(e.handleOf(s));
  return out;
};

describe('command codec', () => {
  it('round-trips commands with large handles, fractional positions and queue flags', () => {
    const cmds: PlayerCommand[] = [
      { player: 1, cmd: { t: 'move', ids: [0, 5, 2 ** 36 + 7], x: quantize(12.3456), y: quantize(0.001) } },
      { player: 2, cmd: { t: 'move', ids: [1], x: 31.99609375, y: 4, queue: true } },
      { player: 8, cmd: { t: 'stop', ids: [] } },
    ];
    expect(decodeCommands(encodeCommands(cmds))).toEqual(cmds);
    expect(() => decodeCommands(Uint8Array.from([1, 1]))).toThrow();
  });

  it('round-trips every command type (a new one without a sample here does not compile)', () => {
    // M15.2: diplomacy, allied victory and tribute (M12) were encoded as nothing — lockstep would have desynced.
    const SAMPLES: { [K in Command['t']]: Extract<Command, { t: K }>[] } = {
      move: [{ t: 'move', ids: [3], x: 4.25, y: 9, am: true }],
      stop: [{ t: 'stop', ids: [1, 2] }],
      gather: [{ t: 'gather', ids: [4], res: 17, queue: true }],
      build: [{ t: 'build', ids: [4, 5], type: 'house', tx: 10, ty: -1 }],
      construct: [{ t: 'construct', ids: [4], h: 99 }],
      repair: [{ t: 'repair', ids: [4], h: 99, queue: true }],
      unload: [{ t: 'unload', ids: [7], x: 12.5, y: 30.75 }],
      tradeGood: [{ t: 'tradeGood', ids: [8], good: 2 }],
      act: [{ t: 'act', ids: [1], h: 2 ** 40 }],
      resign: [{ t: 'resign' }],
      delete: [{ t: 'delete', ids: [6] }],
      stance: [{ t: 'stance', ids: [6], stand: true }],
      train: [{ t: 'train', bld: 3, unit: 'villager', n: 5 }, { t: 'train', bld: 3, unit: 'scout' }],
      research: [{ t: 'research', bld: 3, tech: 'toolAge' }],
      cancelTrain: [{ t: 'cancelTrain', bld: 3, index: 2 }, { t: 'cancelTrain', bld: 3 }],
      rally: [{ t: 'rally', blds: [3, 4], x: 1, y: 2, res: 5 }],
      diplomacy: [{ t: 'diplomacy', to: 3, stance: 2 }, { t: 'diplomacy', to: -1, stance: 9 }],
      alliedVictory: [{ t: 'alliedVictory', on: true }, { t: 'alliedVictory', on: false }],
      tribute: [{ t: 'tribute', to: 2, res: 3, amount: 500 }, { t: 'tribute', to: 2, res: 0, amount: -100 }],
    };
    const cmds: PlayerCommand[] = Object.values(SAMPLES).flatMap((list, i) => list.map((cmd) => ({ player: 1 + (i % 8), cmd })));
    expect(decodeCommands(encodeCommands(cmds))).toEqual(cmds);
    expect(() => encodeCommands([{ player: 1, cmd: { t: 'nonsense' } as unknown as Command }])).toThrow(/cannot encode/);
  });
});

describe('Sim', () => {
  it('moves a villager to its target at 1.1 tiles/s', () => {
    const sim = Sim.create(cfg());
    const [v] = handles(sim);
    sim.step([{ player: 1, cmd: { t: 'move', ids: [v!], x: 2.5, y: 13.5 } }]); // unobstructed route
    let ticks = 1;
    while (sim.world.orders[sim.world.ents.slotOf(v!)] && ticks < 1000) {
      sim.step();
      ticks++;
    }
    expect(sim.world.ents.y[sim.world.ents.slotOf(v!)]).toBe(13.5);
    expect(ticks).toBe(200); // 11 tiles / (1.1 tiles/s) = 10 s = 200 ticks
    expect(sim.drainEvents().some((e) => e.t === 'arrived')).toBe(true);
  });

  it('ignores commands for units the player does not own', () => {
    const sim = Sim.create(cfg());
    const enemy = handles(sim)[2]!;
    sim.step([{ player: 1, cmd: { t: 'move', ids: [enemy], x: 1, y: 1 } }]);
    sim.step();
    expect(sim.world.ents.x[sim.world.ents.slotOf(enemy)]).toBe(20.5);
  });

  it('executes shift-queued moves in order', () => {
    const sim = Sim.create(cfg());
    const [v] = handles(sim);
    sim.step([
      { player: 1, cmd: { t: 'move', ids: [v!], x: 5.5, y: 2.5 } },
      { player: 1, cmd: { t: 'move', ids: [v!], x: 5.5, y: 6.5, queue: true } },
    ]);
    for (let i = 0; i < 400; i++) sim.step();
    const s = sim.world.ents.slotOf(v!);
    expect([sim.world.ents.x[s], sim.world.ents.y[s]]).toEqual([5.5, 6.5]);
  });

  it('two sims fed identical commands stay hash-identical; a different command diverges', () => {
    const a = Sim.create(cfg());
    const b = Sim.create(cfg());
    const c = Sim.create(cfg());
    const [va, vb] = handles(a);
    for (let t = 0; t < 300; t++) {
      const cmds: PlayerCommand[] = t % 50 === 0 ? [{ player: 1, cmd: { t: 'move', ids: [va!, vb!], x: quantize((t / 10) % 30), y: quantize(7.3) } }] : [];
      a.step(cmds);
      b.step(cmds);
      c.step(t === 100 ? [] : cmds);
      expect(a.hash()).toBe(b.hash());
    }
    expect(a.hash()).not.toBe(c.hash());
    expect(a.hashBreakdown().ents).not.toBe(c.hashBreakdown().ents);
    expect(a.hashBreakdown().map).toBe(c.hashBreakdown().map);
  });

  it('builds maps from ASCII with blocking resources', () => {
    const sim = Sim.create(cfg({
      map: { w: 6, h: 3, ascii: ['..TT~~', '.,GS~w', '..B..F'] },
      scenario: {},
    }));
    const m = sim.world.map;
    expect(sim.world.res.count).toBe(6);
    expect(m.passable(2, 0, MOVE_LAND)).toBe(false); // tree
    expect(m.passable(1, 1, MOVE_LAND)).toBe(true); // shallows
    expect(m.passable(4, 0, MOVE_LAND)).toBe(false); // water
    expect(m.passable(0, 0, MOVE_LAND)).toBe(true);
  });
});
