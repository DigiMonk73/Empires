import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { damageBetween, LEASH, WINDUP_TICKS } from '../../src/sim/systems/combat.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { compilePlayerStats } from '../../src/sim/rules/playerStats.ts';
import { decodeCommands, encodeCommands } from '../../src/sim/commands/codec.ts';

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
    // The first swing starts at once (in reach, timer 0) and lands WINDUP_TICKS later; 8 more reloads of 30 ticks.
    expect(died!.tick).toBeLessThanOrEqual(2 + 8 * 30 + WINDUP_TICKS);
    expect(died!.tick).toBeGreaterThanOrEqual(8 * 30 + WINDUP_TICKS);
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

  it('a destroyed building refunds its queue, except the unit already in training (mil:5)', () => {
    const { of, step, w, e } = setup([{ type: 'clubman', owner: 1, x: 8.5, y: 8.5 }], [{ type: 'townCenter', owner: 2, tx: 10, ty: 10 }]);
    const [tc] = of('townCenter', 2);
    const food0 = w.players[2]!.res[0]!;
    step(1, [{ player: 2, cmd: { t: 'train', bld: tc!, unit: 'villager', n: 3 } }]);
    expect(w.players[2]!.res[0]).toBe(food0 - 150);
    e.hp[e.slotOf(tc!)] = 0.5;
    step(60, [{ player: 1, cmd: { t: 'act', ids: of('clubman', 1), h: tc! } }]);
    expect(e.slotOf(tc!)).toBe(-1);
    expect(w.players[2]!.res[0]).toBe(food0 - 50);
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

describe('projectiles (mil:2)', () => {
  it('arrows fly for distance ÷ speed and hit a standing target', () => {
    const { of, step, events, w, e } = setup([
      { type: 'bowman', owner: 1, x: 8.5, y: 10.5 },
      { type: 'villager', owner: 2, x: 12.5, y: 10.5 },
    ]);
    const [b] = of('bowman', 1);
    const [v] = of('villager', 2);
    step(1, [{ player: 1, cmd: { t: 'act', ids: [b!], h: v! } }]);
    for (let i = 0; i < WINDUP_TICKS; i++) step(1);
    expect(w.projectiles.length).toBe(1);
    const p = w.projectiles[0]!;
    // 4 tiles at 8 tiles/s = 0.5 s = 10 ticks.
    expect(p.dur).toBe(10);
    step(p.dur + 1);
    expect(e.hp[e.slotOf(v!)]).toBe(25 - 3);
    // 25 HP / 3 per arrow → 9 arrows; the villager dies well inside 20 s.
    step(20 * 20);
    expect(events.some((ev) => ev.t === 'died' && ev.h === v)).toBe(true);
  });

  it('a target that walks out of the aim point dodges', () => {
    const { of, step, w, e } = setup([
      { type: 'bowman', owner: 1, x: 6.5, y: 10.5 },
      { type: 'villager', owner: 2, x: 11.5, y: 10.5 },
    ]);
    const [b] = of('bowman', 1);
    const [v] = of('villager', 2);
    step(1, [{ player: 1, cmd: { t: 'act', ids: [b!], h: v! } }]);
    for (let i = 0; i < WINDUP_TICKS; i++) step(1);
    expect(w.projectiles.length).toBe(1);
    // Sidestep at once: 1.1 tiles/s × 0.6 s ≈ 0.6 tiles off the aim point > radius + 0.15.
    step(w.projectiles[0]!.dur + 1, [{ player: 2, cmd: { t: 'move', ids: [v!], x: 11.5, y: 16.5 } }]);
    expect(e.hp[e.slotOf(v!)]).toBe(25);
  });

  it('projectiles in flight survive save/load', () => {
    const { of, step, w, sim } = setup([
      { type: 'bowman', owner: 1, x: 6.5, y: 10.5 },
      { type: 'villager', owner: 2, x: 11.5, y: 10.5 },
    ]);
    step(1, [{ player: 1, cmd: { t: 'act', ids: of('bowman', 1), h: of('villager', 2)[0]! } }]);
    step(WINDUP_TICKS + 2);
    expect(w.projectiles.length).toBe(1);
    const b = Sim.deserialize(sim.serialize());
    expect(b.hashBreakdown()).toEqual(sim.hashBreakdown());
    for (let i = 0; i < 200; i++) {
      sim.step();
      b.step();
    }
    expect(b.hash()).toBe(sim.hash());
  });
});

describe('auto-acquire and retaliation (mil:2)', () => {
  it('idle soldiers attack enemies that come into sight; scouts never do', () => {
    const { of, step, w, e } = setup([
      { type: 'clubman', owner: 1, x: 10.5, y: 10.5 },
      { type: 'scout', owner: 1, x: 10.5, y: 12.5 },
      { type: 'villager', owner: 2, x: 13.5, y: 11.5 },
    ]);
    step(12);
    const [c] = of('clubman', 1);
    const [sc] = of('scout', 1);
    const [v] = of('villager', 2);
    expect(w.orders[e.slotOf(c!)]?.[0]).toMatchObject({ k: 'attack', h: v, auto: true });
    expect(w.orders[e.slotOf(sc!)]).toBeUndefined();
  });

  it('1.0a: idle units within 2 tiles of an attacked unit respond — busy ones carry on', () => {
    const { of, step, w, e } = setup([
      { type: 'villager', owner: 2, x: 20.5, y: 20.5 },
      { type: 'villager', owner: 2, x: 21.5, y: 20.5 }, // idle, 1 tile away: responds
      { type: 'villager', owner: 2, x: 20.5, y: 24.5 }, // idle, 4 tiles away: doesn't
      { type: 'bowman', owner: 1, x: 15.5, y: 20.5 },
    ]);
    const [a, b, far] = of('villager', 2);
    const [bow] = of('bowman', 1);
    step(1, [{ player: 1, cmd: { t: 'act', ids: [bow!], h: a! } }]);
    step(40);
    expect(w.orders[e.slotOf(a!)]?.[0]).toMatchObject({ k: 'attack', h: bow, auto: true });
    expect(w.orders[e.slotOf(b!)]?.[0]).toMatchObject({ k: 'attack', h: bow, auto: true });
    expect(w.orders[e.slotOf(far!)]).toBeUndefined();
  });

  it('self-given attacks give up beyond LOS + leash; Stand Ground units never chase', () => {
    const { of, step, w, e } = setup([
      { type: 'clubman', owner: 1, x: 10.5, y: 10.5 },
      { type: 'clubman', owner: 1, x: 10.5, y: 14.5 },
      { type: 'scout', owner: 2, x: 13.5, y: 12.5 },
    ]);
    const [c1, c2] = of('clubman', 1);
    const [sc] = of('scout', 2);
    step(1, [{ player: 1, cmd: { t: 'stance', ids: [c2!], stand: true } }]);
    step(12);
    expect(w.orders[e.slotOf(c1!)]?.[0]).toMatchObject({ k: 'attack', h: sc, auto: true });
    expect(w.orders[e.slotOf(c2!)]).toBeUndefined(); // standing: the scout is out of reach
    // The (faster) scout runs off: the chaser gives up once it is LOS + LEASH away.
    step(20 * 20, [{ player: 2, cmd: { t: 'move', ids: [sc!], x: 30.5, y: 30.5 } }]);
    expect(w.orders[e.slotOf(c1!)]).toBeUndefined();
    const s1 = e.slotOf(c1!);
    expect(Math.hypot(e.x[s1]! - 10.5, e.y[s1]! - 10.5)).toBeGreaterThan(1); // it did chase for a while
    expect(e.x[e.slotOf(c2!)]).toBeCloseTo(10.5, 1);
    void LEASH;
  });

  it('lions attack villagers that wander near', () => {
    const { of, step, w, e } = setup([
      { type: 'villager', owner: 1, x: 10.5, y: 10.5 },
      { type: 'lion', owner: 0, x: 12.5, y: 10.5 },
    ]);
    step(12);
    const [lion] = of('lion', 0);
    expect(w.orders[e.slotOf(lion!)]?.[0]).toMatchObject({ k: 'attack', h: of('villager', 1)[0], auto: true });
  });

  it('stance commands round-trip through the codec', () => {
    const cmds = [{ player: 1, cmd: { t: 'stance' as const, ids: [3, 9], stand: true } }];
    expect(decodeCommands(encodeCommands(cmds))).toEqual(cmds);
  });
});

describe('attack-move, splash, trample, min range (M5.6)', () => {
  it('attack-move engages enemies met on the way, then carries on; a plain move walks past', () => {
    const units = [0, 1, 2].map((i) => ({ type: 'clubman', owner: 1, x: 4.5, y: 10.5 + i * 0.7 }));
    const run = (am: boolean) => {
      const t = setup([...units, { type: 'villager', owner: 2, x: 14.5, y: 11.2 }]);
      const ids = t.of('clubman', 1);
      t.step(1, [{ player: 1, cmd: { t: 'move', ids, x: 26.5, y: 11.5, ...(am ? { am: true } : {}) } }]);
      t.step(20 * 45);
      return t;
    };
    const a = run(true);
    expect(a.events.some((ev) => ev.t === 'died')).toBe(true);
    for (const h of a.of('clubman', 1)) expect(a.e.x[a.e.slotOf(h)]).toBeGreaterThan(22); // arrived after the fight
    const b = run(false);
    expect(b.events.some((ev) => ev.t === 'died')).toBe(false);
  });

  it('stones splash everyone near the impact point — own units too', () => {
    // Villagers (they don't start fights) so only the stone does damage.
    const { of, step, e } = setup([
      { type: 'stoneThrower', owner: 1, x: 4.5, y: 10.5 },
      { type: 'villager', owner: 2, x: 12.5, y: 10.5 },
      { type: 'villager', owner: 2, x: 12.5, y: 11.1 },
      { type: 'villager', owner: 1, x: 12.9, y: 10.2 },
      { type: 'villager', owner: 2, x: 16.5, y: 16.5 }, // far away: untouched
    ]);
    const [target, near, far] = of('villager', 2);
    const [own] = of('villager', 1);
    const hurt = (h: number) => e.slotOf(h) < 0 || e.hp[e.slotOf(h)]! < 25;
    step(1, [{ player: 1, cmd: { t: 'act', ids: of('stoneThrower', 1), h: target! } }]);
    step(80); // windup + flight (8 tiles at 2.7/s ≈ 3 s)
    expect(e.slotOf(target!)).toBe(-1); // 50 melee on a 25-HP villager
    expect(hurt(near!)).toBe(true);
    expect(hurt(own!)).toBe(true); // friendly fire
    expect(e.hp[e.slotOf(far!)]!).toBe(25);
  });

  it('siege cannot fire inside its minimum range', () => {
    const { of, step, w } = setup([
      { type: 'stoneThrower', owner: 1, x: 10.5, y: 10.5 },
      { type: 'clubman', owner: 2, x: 11.9, y: 10.5 },
    ]);
    step(1, [
      { player: 1, cmd: { t: 'act', ids: of('stoneThrower', 1), h: of('clubman', 2)[0]! } },
      { player: 2, cmd: { t: 'stance', ids: of('clubman', 2), stand: true } },
    ]);
    step(60);
    expect(w.projectiles.length).toBe(0);
  });

  it('elephant trample hits enemies beside the target, not own units', () => {
    const { of, step, e } = setup([
      { type: 'warElephant', owner: 1, x: 10.5, y: 10.5 },
      { type: 'clubman', owner: 2, x: 11.4, y: 10.5 },
      { type: 'clubman', owner: 2, x: 11.6, y: 11.3 },
      { type: 'clubman', owner: 1, x: 11.4, y: 9.6 },
    ]);
    const [t1, t2] = of('clubman', 2);
    const [own] = of('clubman', 1);
    step(1, [
      { player: 1, cmd: { t: 'act', ids: of('warElephant', 1), h: t1! } },
      { player: 1, cmd: { t: 'stance', ids: [own!], stand: true } },
      { player: 2, cmd: { t: 'stance', ids: [t1!, t2!], stand: true } },
    ]);
    step(12);
    expect(e.hp[e.slotOf(t1!)]!).toBeLessThan(40);
    expect(e.hp[e.slotOf(t2!)]!).toBeLessThan(40);
    expect(e.hp[e.slotOf(own!)]!).toBe(40);
  });

  it('attack-move flag round-trips through the codec', () => {
    const cmds = [{ player: 1, cmd: { t: 'move' as const, ids: [4], x: 3.5, y: 7.25, queue: true, am: true } }];
    expect(decodeCommands(encodeCommands(cmds))).toEqual(cmds);
  });
});
