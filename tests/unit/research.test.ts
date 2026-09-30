import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { compilePlayerStats } from '../../src/sim/rules/playerStats.ts';
import { buildingAvailable } from '../../src/sim/systems/build.ts';
import { decodeCommands, encodeCommands } from '../../src/sim/commands/codec.ts';

type B = { type: string; owner: number; tx: number; ty: number };
type U = { type: string; owner: number; x: number; y: number };

function setup(buildings: B[], spawn: U[] = [], techs: string[] = []) {
  const sim = Sim.create({ seed: 5, map: { w: 40, h: 40 }, players: [{ civ: 'greek' }], startingResources: 'high', scenario: { buildings, units: spawn } });
  const w = sim.world;
  const p = w.players[1]!;
  if (techs.length) {
    p.techs.push(...techs);
    p.stats = compilePlayerStats(p.civ, p.techs);
  }
  const e = w.ents;
  const bld = (type: string) => {
    const ti = buildingTypeIndex(type);
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.type[s] === ti) return e.handleOf(s);
    return -1;
  };
  const units = (type: string) => {
    const ti = unitTypeIndex(type);
    const out: number[] = [];
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.type[s] === ti) out.push(s);
    return out;
  };
  const events: { t: string; reason?: string; tech?: string }[] = [];
  const step = (n: number, cmds: Parameters<Sim['step']>[0] = []) => {
    for (let i = 0; i < n; i++) {
      sim.step(i === 0 ? cmds : []);
      events.push(...(sim.drainEvents() as { t: string }[]));
    }
  };
  return { sim, w, p, e, bld, units, step, events };
}

const TC: B = { type: 'townCenter', owner: 1, tx: 10, ty: 10 };

describe('research (econ:3, econ:5)', () => {
  it('Tool Age needs two Stone-age buildings, costs 500 food, takes 120 s, and unlocks Tool-age buildings', () => {
    const a = setup([TC]);
    a.step(1, [{ player: 1, cmd: { t: 'research', bld: a.bld('townCenter'), tech: 'toolAge' } }]);
    expect(a.events.some((ev) => ev.t === 'rejected' && /requires 2 of/.test(ev.reason ?? ''))).toBe(true);

    const { step, bld, p, w, events } = setup([TC, { type: 'granary', owner: 1, tx: 20, ty: 10 }, { type: 'barracks', owner: 1, tx: 20, ty: 20 }]);
    const food0 = p.res[0]!;
    step(1, [{ player: 1, cmd: { t: 'research', bld: bld('townCenter'), tech: 'toolAge' } }]);
    expect(p.res[0]).toBe(food0 - 500);
    expect(buildingAvailable(w, 1, buildingTypeIndex('market')).ok).toBe(false);
    step(20 * 120 - 2);
    expect(p.stats.age).toBe(1);
    step(2);
    expect(p.stats.age).toBe(2);
    expect(events.some((ev) => ev.t === 'researched' && ev.tech === 'toolAge')).toBe(true);
    expect(buildingAvailable(w, 1, buildingTypeIndex('market')).ok).toBe(true);
  });

  it('Battle Axe turns clubmen already in the field into axemen (+10 HP) and new ones train as axemen', () => {
    const clubs = [0, 1, 2].map((i) => ({ type: 'clubman', owner: 1, x: 5.5 + i, y: 25.5 }));
    const { step, bld, units, e, p } = setup([TC, { type: 'barracks', owner: 1, tx: 20, ty: 20 }], clubs, ['toolAge']);
    const [c0] = units('clubman');
    e.hp[c0!] = 30; // wounded
    step(1, [{ player: 1, cmd: { t: 'research', bld: bld('barracks'), tech: 'battleAxe' } }]);
    step(20 * 40 + 1);
    expect(p.techs).toContain('battleAxe');
    expect(units('clubman')).toEqual([]);
    expect(units('axeman').length).toBe(3);
    expect(e.hp[c0!]).toBe(40); // 30 + (50 − 40)
    step(1, [{ player: 1, cmd: { t: 'train', bld: bld('barracks'), unit: 'clubman' } }]);
    step(20 * 27);
    expect(units('axeman').length).toBe(4);
  });

  it('cancel refunds research; a tech can only be researched once at a time', () => {
    const { step, bld, p, w, events } = setup([TC, { type: 'townCenter', owner: 1, tx: 25, ty: 25 }, { type: 'granary', owner: 1, tx: 20, ty: 10 }, { type: 'barracks', owner: 1, tx: 20, ty: 20 }]);
    const tcs: number[] = [];
    for (let s = 0; s < w.ents.top; s++) if (w.ents.alive[s] && w.ents.type[s] === buildingTypeIndex('townCenter')) tcs.push(w.ents.handleOf(s));
    const food0 = p.res[0]!;
    step(1, [
      { player: 1, cmd: { t: 'research', bld: tcs[0]!, tech: 'toolAge' } },
      { player: 1, cmd: { t: 'research', bld: tcs[1]!, tech: 'toolAge' } },
    ]);
    expect(p.res[0]).toBe(food0 - 500);
    expect(events.some((ev) => ev.t === 'rejected' && ev.reason === 'already being researched')).toBe(true);
    step(1, [{ player: 1, cmd: { t: 'cancelTrain', bld: tcs[0]! } }]);
    expect(p.res[0]).toBe(food0);
    expect(w.prod[w.ents.slotOf(tcs[0]!)]).toBeUndefined();
    void bld;
  });

  it('research holds the queue: a villager queued behind it waits', () => {
    const { step, bld, units } = setup([TC, { type: 'granary', owner: 1, tx: 20, ty: 10 }, { type: 'barracks', owner: 1, tx: 20, ty: 20 }]);
    step(1, [
      { player: 1, cmd: { t: 'research', bld: bld('townCenter'), tech: 'toolAge' } },
      { player: 1, cmd: { t: 'train', bld: bld('townCenter'), unit: 'villager' } },
    ]);
    step(20 * 100);
    expect(units('villager').length).toBe(0);
    step(20 * 45);
    expect(units('villager').length).toBe(1);
  });

  it('research commands round-trip through the codec', () => {
    const cmds = [{ player: 2, cmd: { t: 'research' as const, bld: 77, tech: 'battleAxe' } }];
    expect(decodeCommands(encodeCommands(cmds))).toEqual(cmds);
  });
});
