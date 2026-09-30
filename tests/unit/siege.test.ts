import { describe, expect, it } from 'vitest';
import { Sim, type SimConfig } from '../../src/sim/index.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { damageBetween } from '../../src/sim/systems/combat.ts';

type U = { type: string; owner: number; x: number; y: number };
type B = { type: string; owner: number; tx: number; ty: number };

function setup(units: U[], buildings: B[] = [], ascii?: string[], res: SimConfig['startingResources'] = 'high') {
  const cfg: SimConfig = {
    seed: 11,
    map: ascii ? { w: ascii[0]!.length, h: ascii.length, ascii } : { w: 32, h: 32 },
    players: [{ civ: 'greek' }, { civ: 'persian' }],
    startingResources: res,
    victory: 'none',
    scenario: { units, buildings },
  };
  const sim = Sim.create(cfg);
  const e = sim.world.ents;
  const first = (type: string, owner: number) => {
    let ti: number;
    try {
      ti = unitTypeIndex(type);
    } catch {
      ti = buildingTypeIndex(type);
    }
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.type[s] === ti && e.owner[s] === owner) return s;
    return -1;
  };
  const step = (n: number, cmds: Parameters<Sim['step']>[0] = []) => {
    for (let i = 0; i < n; i++) {
      sim.step(i === 0 ? cmds : []);
      sim.drainEvents();
    }
  };
  return { sim, w: sim.world, e, first, step };
}

describe('siege (M7.3, mil:1a, mil:2)', () => {
  it('a Stone Thrower flattens a house in two stones (50 melee + 140 vs buildings, ×0.2)', () => {
    const t = setup([{ type: 'stoneThrower', owner: 1, x: 6.5, y: 10.5 }], [{ type: 'house', owner: 2, tx: 12, ty: 10 }]);
    const st = t.w.stats(1, unitTypeIndex('stoneThrower'));
    const hs = t.w.stats(2, buildingTypeIndex('house'));
    expect(damageBetween(st.atk, hs.arm, true)).toBe(38);
    const s = t.first('stoneThrower', 1);
    const h = t.first('house', 2);
    t.step(1, [{ player: 1, cmd: { t: 'act', ids: [t.e.handleOf(s)], h: t.e.handleOf(h) } }]);
    t.step(20 * 14); // two shots 5 s apart plus the stone's flight
    expect(t.e.alive[h]).toBe(0);
  });

  it('backs off from a target inside its minimum range, then shoots it', () => {
    const t = setup([
      { type: 'stoneThrower', owner: 1, x: 10.5, y: 10.5 },
      { type: 'clubman', owner: 2, x: 11.6, y: 10.5 },
    ]);
    const s = t.first('stoneThrower', 1);
    const c = t.first('clubman', 2);
    t.step(1, [
      { player: 1, cmd: { t: 'act', ids: [t.e.handleOf(s)], h: t.e.handleOf(c) } },
      { player: 2, cmd: { t: 'stance', ids: [t.e.handleOf(c)], stand: true } },
    ]);
    t.step(20 * 12);
    expect(Math.abs(t.e.x[s]! - t.e.x[c]!)).toBeGreaterThan(2); // stepped back
    expect(t.e.hp[c]!).toBeLessThan(t.w.stats(2, unitTypeIndex('clubman')).hp); // and hit it
  });

  it('cannot shoot what stands inside its minimum range (2 tiles)', () => {
    const t = setup([
      { type: 'stoneThrower', owner: 1, x: 10.5, y: 10.5 },
      { type: 'clubman', owner: 2, x: 11.6, y: 10.5 },
    ]);
    const s = t.first('stoneThrower', 1);
    const c = t.first('clubman', 2);
    // Standing its ground (no command): it never fires at the clubman at its wheels.
    t.step(1, [
      { player: 1, cmd: { t: 'stance', ids: [t.e.handleOf(s)], stand: true } },
      { player: 2, cmd: { t: 'stance', ids: [t.e.handleOf(c)], stand: true } },
    ]);
    t.step(20 * 6);
    expect(t.w.projectiles.length + t.e.hp[c]! - t.w.stats(2, unitTypeIndex('clubman')).hp).toBe(0); // nothing thrown, no damage
  });

  it('a Heavy Catapult’s stone knocks down the trees it lands among; a Catapult’s does not', () => {
    const rows = Array.from({ length: 24 }, (_, y) => Array.from({ length: 24 }, (_, x) => (x >= 14 && x <= 17 && y >= 9 && y <= 13 ? 'T' : '.')).join(''));
    const shoot = (type: string) => {
      const t = setup([{ type, owner: 1, x: 4.5, y: 11.5 }], [{ type: 'house', owner: 2, tx: 15, ty: 11 }], rows);
      for (const tech of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(t.w, 1, tech);
      const trees = () => {
        let n = 0;
        for (let i = 0; i < t.w.res.count; i++) if (t.w.res.amount[i]! > 0) n++;
        return n;
      };
      const before = trees();
      const s = t.first(type, 1);
      t.step(1, [{ player: 1, cmd: { t: 'act', ids: [t.e.handleOf(s)], h: t.e.handleOf(t.first('house', 2)) } }]);
      t.step(20 * 8);
      return before - trees();
    };
    expect(shoot('heavyCatapult')).toBeGreaterThan(0);
    expect(shoot('catapult')).toBe(0);
  });

  it('the Siege Workshop trains Stone Throwers in the Bronze Age; research upgrades them to Catapults', () => {
    // Siege costs gold, which only Death Match starts with (econ:1.5); the Town Center houses it.
    const t = setup([{ type: 'villager', owner: 1, x: 3.5, y: 3.5 }], [
      { type: 'townCenter', owner: 1, tx: 3, ty: 20 },
      { type: 'siegeWorkshop', owner: 1, tx: 10, ty: 10 },
      { type: 'archeryRange', owner: 1, tx: 14, ty: 10 },
    ], undefined, 'deathmatch');
    for (const tech of ['toolAge', 'bronzeAge']) completeResearch(t.w, 1, tech);
    const ws = t.e.handleOf(t.first('siegeWorkshop', 1));
    t.step(1, [{ player: 1, cmd: { t: 'train', bld: ws, unit: 'stoneThrower' } }]);
    t.step(20 * 62);
    const st = t.first('stoneThrower', 1);
    expect(st).toBeGreaterThanOrEqual(0);
    completeResearch(t.w, 1, 'ironAge');
    completeResearch(t.w, 1, 'catapult');
    expect(t.e.type[st]).toBe(unitTypeIndex('catapult'));
  });
});
