import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';

type U = { type: string; owner: number; x: number; y: number };
type B = { type: string; owner: number; tx: number; ty: number; progress?: number };

/** A Watch Tower of player 1 at tiles (10–11, 10–11): centre (11, 11), range 5 from its edge (mil:1c). */
function setup(units: U[], extra: B[] = [], teams: [number, number] = [1, 2]) {
  const sim = Sim.create({
    seed: 5,
    map: { w: 32, h: 32 },
    players: [{ civ: 'greek', team: teams[0] }, { civ: 'persian', team: teams[1] }],
    victory: 'none',
    scenario: { units, buildings: [{ type: 'watchTower', owner: 1, tx: 10, ty: 10 }, ...extra] },
  });
  const e = sim.world.ents;
  const all = (type: string) => {
    const ti = unitTypeIndex(type);
    const out: number[] = [];
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.type[s] === ti) out.push(s);
    return out;
  };
  const strikes: number[] = [];
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      sim.step();
      for (const ev of sim.drainEvents()) if (ev.t === 'strike' && ev.type === buildingTypeIndex('watchTower')) strikes.push(ev.tgt);
    }
  };
  return { sim, e, all, step, strikes };
}

describe('towers (M7.1)', () => {
  it('shoot the nearest enemy in range until it dies (3 pierce every 1.5 s)', () => {
    // Stand Ground so the clubman takes the arrows without charging the tower.
    const t = setup([{ type: 'clubman', owner: 2, x: 15.5, y: 11 }]);
    const [c] = t.all('clubman');
    t.sim.step([{ player: 2, cmd: { t: 'stance', ids: [t.e.handleOf(c!)], stand: true } }]);
    const hp0 = t.e.hp[c!]!;
    t.step(20 * 6);
    expect(t.e.hp[c!]!).toBeLessThan(hp0);
    // 40 HP / 3 per hit ≈ 14 hits ≈ 21 s (plus misses and flight time).
    t.step(20 * 30);
    expect(t.e.alive[c!]).toBe(0);
    expect(t.strikes.length).toBeGreaterThanOrEqual(13);
  });

  it('ignore units out of range, allies, wildlife and what they cannot see', () => {
    const far = setup([{ type: 'clubman', owner: 2, x: 20.5, y: 11 }]); // 8.5 tiles from the edge: out of range
    far.step(20 * 10);
    expect(far.strikes).toEqual([]);
    const ally = setup([{ type: 'clubman', owner: 2, x: 14.5, y: 11 }], [], [1, 1]);
    ally.step(20 * 10);
    expect(ally.strikes).toEqual([]);
    const wild = Sim.create({
      seed: 5,
      map: { w: 32, h: 32 },
      players: [{ civ: 'greek' }, { civ: 'persian' }],
      victory: 'none',
      scenario: { units: [{ type: 'gazelle', owner: 0, x: 14.5, y: 11 }], buildings: [{ type: 'watchTower', owner: 1, tx: 10, ty: 10 }] },
    });
    expect(wild.world.ents.count).toBe(2); // the tower and the gazelle, in sight and range
    for (let i = 0; i < 200; i++) wild.step();
    expect(wild.drainEvents().some((ev) => ev.t === 'strike')).toBe(false);
  });

  it('do not shoot until built', () => {
    const t = setup([{ type: 'clubman', owner: 2, x: 14.5, y: 11 }], []);
    const site = Sim.create({
      seed: 5,
      map: { w: 32, h: 32 },
      players: [{ civ: 'greek' }, { civ: 'persian' }],
      victory: 'none',
      scenario: { units: [{ type: 'clubman', owner: 2, x: 14.5, y: 11 }], buildings: [{ type: 'watchTower', owner: 1, tx: 10, ty: 10, progress: 0.5 }] },
    });
    for (let i = 0; i < 200; i++) site.step();
    expect(site.drainEvents().some((ev) => ev.t === 'strike' && ev.type === buildingTypeIndex('watchTower'))).toBe(false);
    t.step(200);
    expect(t.strikes.length).toBeGreaterThan(0); // the finished one does
  });

  it('switch to the next target when the first leaves range', () => {
    const t = setup([
      { type: 'clubman', owner: 2, x: 14.5, y: 11 },
      { type: 'clubman', owner: 2, x: 11, y: 15.5 },
    ]);
    const [a, b] = t.all('clubman');
    t.sim.step([{ player: 2, cmd: { t: 'stance', ids: [t.e.handleOf(a!), t.e.handleOf(b!)], stand: true } }]);
    t.step(20 * 3);
    const first = t.strikes[0]!;
    const firstSlot = first === t.e.handleOf(a!) ? a! : b!;
    // The first target walks away out of range; the tower moves on to the other.
    t.sim.step([{ player: 2, cmd: { t: 'move', ids: [first], x: firstSlot === a ? 26.5 : 11, y: firstSlot === a ? 11 : 27.5 } }]);
    t.step(20 * 12);
    expect(t.strikes.slice(-3).every((h) => h !== first)).toBe(true);
  });
});
