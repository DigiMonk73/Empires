import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex, TYPES, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { damageBetween } from '../../src/sim/systems/combat.ts';
import { startHeal } from '../../src/sim/systems/priest.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';

/**
 * M8.2: warships (mil:1b). Damage from the data matches the research — including the Fire Galley's weakness to
 * ballistae (+5) and stone throwers / Catapult Triremes (+10) and the catapult ships' building and tower bonuses —
 * and ships fight at sea and against the shore as the formula predicts.
 */
type U = { type: string; owner: number; x: number; y: number };
// Land x < 12 (a grove on the shore at x 9–11, y 8–12), sea from x 12.
const ascii = Array.from({ length: 24 }, (_, y) => Array.from({ length: 32 }, (_, x) => (x >= 12 ? '~' : x >= 9 && y >= 8 && y <= 12 ? 'T' : '.')).join(''));

function setup(units: U[]) {
  const sim = Sim.create({ seed: 4, map: { w: 32, h: 24, ascii }, players: [{ civ: 'greek' }, { civ: 'persian' }], victory: 'none', startingResources: 'deathmatch', scenario: { units, buildings: [] } });
  const w = sim.world;
  const e = w.ents;
  for (const p of [1, 2]) for (const a of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(w, p, a);
  const first = (type: string, owner: number) => {
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === owner && TYPES[e.type[s]!]!.id === type) return s;
    return -1;
  };
  return { sim, w, e, first };
}

describe('naval damage anchors (mil:1b)', () => {
  const w = Sim.create({ seed: 1, map: { w: 24, h: 24 }, players: [{ civ: 'greek' }, { civ: 'persian' }] }).world;
  const u = (id: string) => w.stats(1, unitTypeIndex(id));
  const b = (id: string) => w.stats(1, buildingTypeIndex(id));
  const cases: [string, string, number, string][] = [
    ['scoutShip', 'bowman', 5, 'pierce 5'],
    ['warGalley', 'scoutShip', 8, 'pierce 8'],
    ['trireme', 'warGalley', 12, 'pierce 12'],
    ['bowman', 'scoutShip', 3, 'pierce 3 from the shore'],
    ['fireGalley', 'trireme', 24, 'melee 24 at range 1'],
    ['ballista', 'fireGalley', 45, 'pierce 40 + 5 vs Fire Galley'],
    ['stoneThrower', 'fireGalley', 60, 'melee 50 + 10 vs Fire Galley'],
    ['catapultTrireme', 'fireGalley', 45, '35 + 10 vs Fire Galley'],
    ['catapultTrireme', 'warGalley', 35, '35'],
  ];
  for (const [a, d, want, why] of cases) it(`${a} → ${d} = ${want} (${why})`, () => expect(damageBetween(u(a).atk, u(d).arm)).toBe(want));
  it('catapult ships: +140 vs buildings, +50 vs towers (then × 0.2)', () => {
    expect(damageBetween(u('catapultTrireme').atk, b('house').arm, true)).toBeCloseTo(35, 9);
    expect(damageBetween(u('catapultTrireme').atk, b('watchTower').arm, true)).toBeCloseTo(17, 9);
  });
});

describe('warships at sea and against the shore (M8.2)', () => {
  it('a War Galley sinks an idle Light Transport (150 HP) in 19 arrows, 1.7 s apart', () => {
    const { sim, w, e, first } = setup([{ type: 'warGalley', owner: 1, x: 16.5, y: 11.5 }, { type: 'lightTransport', owner: 2, x: 20.5, y: 11.5 }]);
    const g = first('warGalley', 1);
    const tr = first('lightTransport', 2);
    const th = e.handleOf(tr);
    sim.step([{ player: 1, cmd: { t: 'act', ids: [e.handleOf(g)], h: th } }]);
    let sunk = -1;
    for (let t = 1; t < 20 * 60 && sunk < 0; t++) {
      sim.step();
      if (e.slotOf(th) < 0) sunk = t;
    }
    const reload = 34; // 1.7 s
    expect(sunk).toBeGreaterThanOrEqual(18 * reload);
    expect(sunk).toBeLessThanOrEqual(18 * reload + 40); // + windup and the arrow's flight
    expect(w.ents.hp[g]).toBe(w.stats(1, unitTypeIndex('warGalley')).hp);
  });

  it('a clubman told to attack a ship at sea gives up; the ship shoots it from the water', () => {
    const { sim, w, e, first } = setup([{ type: 'clubman', owner: 1, x: 6.5, y: 4.5 }, { type: 'scoutShip', owner: 2, x: 15.5, y: 4.5 }]);
    const c = first('clubman', 1);
    const s = first('scoutShip', 2);
    const hp = e.hp[s]!;
    sim.step([{ player: 1, cmd: { t: 'act', ids: [e.handleOf(c)], h: e.handleOf(s) } }]);
    for (let t = 0; t < 20 * 40; t++) sim.step();
    expect(e.hp[s]).toBe(hp); // never reached
    expect(e.alive[c] ? w.orders[c]?.[0]?.k : 'dead').not.toBe('attack');
  });

  it('a Juggernaught’s stones knock down shore trees; a Catapult Trireme’s do not', () => {
    const shoot = (type: string) => {
      const { sim, w, e, first } = setup([{ type, owner: 1, x: 20.5, y: 10.5 }, { type: 'clubman', owner: 2, x: 10.5, y: 10.5 }]);
      const trees = () => {
        let n = 0;
        for (let i = 0; i < w.res.count; i++) if (w.res.amount[i]! > 0) n++;
        return n;
      };
      const before = trees();
      sim.step([{ player: 1, cmd: { t: 'act', ids: [e.handleOf(first(type, 1))], h: e.handleOf(first('clubman', 2)) } }]);
      for (let t = 0; t < 20 * 12; t++) sim.step();
      return before - trees();
    };
    expect(shoot('juggernaught')).toBeGreaterThan(0);
    expect(shoot('catapultTrireme')).toBe(0);
  });

  it('priests cannot heal ships (mil:3)', () => {
    const { w, e, first } = setup([{ type: 'priest', owner: 1, x: 11.5, y: 16.5 }, { type: 'warGalley', owner: 1, x: 12.5, y: 16.5 }]);
    const g = first('warGalley', 1);
    e.hp[g] = 50;
    expect(startHeal(w, first('priest', 1), e.handleOf(g), false)).toBe(false);
  });
});
