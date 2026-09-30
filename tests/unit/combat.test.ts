import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { damageBetween } from '../../src/sim/systems/combat.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { compilePlayerStats } from '../../src/sim/rules/playerStats.ts';

type U = { type: string; owner: number; x: number; y: number };
type B = { type: string; owner: number; tx: number; ty: number };

function setup(units: U[], buildings: B[] = [], teams?: [number, number]) {
  const sim = Sim.create({
    seed: 3,
    map: { w: 32, h: 32 },
    players: [{ civ: 'greek', ...(teams ? { team: teams[0] } : {}) }, { civ: 'persian', ...(teams ? { team: teams[1] } : {}) }],
    startingResources: 'high',
    scenario: { units, buildings },
  });
  const e = sim.world.ents;
  const of = (type: string, owner: number) => {
    const out: number[] = [];
    let ti: number;
    try {
      ti = unitTypeIndex(type);
    } catch {
      ti = buildingTypeIndex(type);
    }
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.type[s] === ti && e.owner[s] === owner) out.push(e.handleOf(s));
    return out;
  };
  const events: { t: string; h?: number; tick: number }[] = [];
  const step = (n: number, cmds: Parameters<Sim['step']>[0] = []) => {
    for (let i = 0; i < n; i++) {
      sim.step(i === 0 ? cmds : []);
      for (const ev of sim.drainEvents()) events.push({ ...(ev as { t: string; h?: number }), tick: sim.tick });
    }
  };
  return { sim, w: sim.world, e, of, step, events };
}

describe('damage formula (mil:2)', () => {
  it('sums positive attack − armor over the target’s classes, min 1; buildings ×0.2, min 0.1', () => {
    const w = setup([]).w;
    const st = (type: string) => w.stats(1, unitTypeIndex(type));
    const bst = (type: string) => w.stats(1, buildingTypeIndex(type));
    expect(damageBetween(st('clubman').atk, st('villager').arm)).toBe(3);
    expect(damageBetween(st('villager').atk, st('clubman').arm)).toBe(3); // villager melee 3; its −150 tower class is ignored vs units
    expect(damageBetween(st('bowman').atk, st('clubman').arm)).toBe(3);
    expect(damageBetween(st('bowman').atk, bst('house').arm, true)).toBeCloseTo(0.6, 9); // pierce 3 × 0.2
    expect(damageBetween([], bst('house').arm, true)).toBe(0.1); // floor
    expect(damageBetween([], st('villager').arm)).toBe(1); // floor
  });
});

describe('fighting', () => {
  it('a clubman kills a villager in 9 blows (25 HP, 3 per blow, 1.5 s reload)', () => {
    const { of, step, events, e } = setup([
      { type: 'clubman', owner: 1, x: 10.5, y: 10.5 },
      { type: 'villager', owner: 2, x: 11.2, y: 10.5 },
    ]);
    const [c] = of('clubman', 1);
    const [v] = of('villager', 2);
    step(400, [{ player: 1, cmd: { t: 'act', ids: [c!], h: v! } }]);
    const died = events.find((ev) => ev.t === 'died' && ev.h === v);
    expect(died).toBeDefined();
    // First blow lands at once (in reach, timer 0); 8 more reloads of 30 ticks.
    expect(died!.tick).toBeLessThanOrEqual(2 + 8 * 30);
    expect(died!.tick).toBeGreaterThanOrEqual(8 * 30);
    expect(e.slotOf(v!)).toBe(-1);
    expect(e.act[e.slotOf(c!)]).toBe(0); // back to idle
  });

  it('clubmen raze a house: 0.6 per blow, footprint freed, housing lost', () => {
    const units = Array.from({ length: 5 }, (_, i) => ({ type: 'clubman', owner: 1, x: 6.5 + i * 0.6, y: 8.5 }));
    const { of, step, events, w, sim } = setup(units, [{ type: 'house', owner: 2, tx: 12, ty: 12 }, { type: 'townCenter', owner: 2, tx: 20, ty: 20 }]);
    const [house] = of('house', 2);
    sim.step();
    expect(w.players[2]!.popCap).toBe(8);
    step(20 * 90, [{ player: 1, cmd: { t: 'act', ids: of('clubman', 1), h: house! } }]);
    const d = events.find((ev) => ev.t === 'destroyed' && ev.h === house);
    expect(d).toBeDefined();
    // 75 HP / (5 × 0.6 per 1.5 s) = 37.5 s of fighting once all five are swinging.
    expect(d!.tick).toBeGreaterThan(20 * 36);
    expect(d!.tick).toBeLessThan(20 * 60);
    expect(w.map.bldAt[w.map.idx(12, 12)]).toBe(0);
    expect(w.map.passable(13, 13, 1)).toBe(true);
    expect(w.players[2]!.popCap).toBe(4);
  });

  it('a destroyed building refunds its queue', () => {
    const { of, step, w, e } = setup([{ type: 'clubman', owner: 1, x: 8.5, y: 8.5 }], [{ type: 'townCenter', owner: 2, tx: 10, ty: 10 }]);
    const [tc] = of('townCenter', 2);
    const food0 = w.players[2]!.res[0]!;
    step(1, [{ player: 2, cmd: { t: 'train', bld: tc!, unit: 'villager', n: 3 } }]);
    expect(w.players[2]!.res[0]).toBe(food0 - 150);
    e.hp[e.slotOf(tc!)] = 0.5;
    step(60, [{ player: 1, cmd: { t: 'act', ids: of('clubman', 1), h: tc! } }]);
    expect(e.slotOf(tc!)).toBe(-1);
    expect(w.players[2]!.res[0]).toBe(food0);
  });

  it('allies and own units are not attackable; villagers do attack enemies', () => {
    const { of, step, w, e } = setup(
      [
        { type: 'villager', owner: 1, x: 10.5, y: 10.5 },
        { type: 'villager', owner: 1, x: 12.5, y: 10.5 },
        { type: 'villager', owner: 2, x: 11.5, y: 12.5 },
      ],
      [],
      [1, 1],
    );
    const [a, b] = of('villager', 1);
    const [c] = of('villager', 2);
    step(1, [{ player: 1, cmd: { t: 'act', ids: [a!], h: b! } }]);
    expect(w.orders[e.slotOf(a!)]).toBeUndefined();
    step(1, [{ player: 1, cmd: { t: 'act', ids: [a!], h: c! } }]); // same team
    expect(w.orders[e.slotOf(a!)]).toBeUndefined();
    const p2 = w.players[2]!;
    p2.team = 2;
    p2.stats = compilePlayerStats(p2.civ, p2.techs);
    step(1, [{ player: 1, cmd: { t: 'act', ids: [a!], h: c! } }]);
    expect(w.orders[e.slotOf(a!)]?.[0]).toMatchObject({ k: 'attack', hunt: false });
  });
});
