import { describe, expect, it } from 'vitest';
import { decodeCommands, encodeCommands } from '../../src/sim/commands/codec.ts';
import { Act } from '../../src/sim/core/entities.ts';
import { Sim } from '../../src/sim/index.ts';
import { TYPES, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { repairable } from '../../src/sim/systems/repair.ts';

/**
 * M8.3 (D36): villagers repair their own damaged buildings, ships and siege at the repairer rate 0.4 (econ:1.2)
 * against the build/train time, several stacking like builders; buildings mend free, ships and siege for half
 * their price pro rata, pausing while the player can't pay.
 */
type U = { type: string; owner: number; x: number; y: number };
type B = { type: string; owner: number; tx: number; ty: number };
// Land x < 12, sea from x 12.
const ascii = Array.from({ length: 24 }, () => '.'.repeat(12) + '~'.repeat(20));

function setup(units: U[], buildings: B[] = []) {
  const sim = Sim.create({ seed: 2, map: { w: 32, h: 24, ascii }, players: [{ civ: 'greek' }, { civ: 'persian' }], victory: 'none', startingResources: 'high', scenario: { units, buildings } });
  const w = sim.world;
  const e = w.ents;
  const all = (type: string, owner: number) => {
    const out: number[] = [];
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === owner && TYPES[e.type[s]!]!.id === type) out.push(s);
    return out;
  };
  const first = (type: string, owner = 1) => all(type, owner)[0]!;
  const repair = (ids: number[], t: number) => sim.step([{ player: 1, cmd: { t: 'repair', ids: ids.map((s) => e.handleOf(s)), h: e.handleOf(t) } }]);
  return { sim, w, e, all, first, repair, p: w.players[1]! };
}

/** Ticks until slot t is at full HP (or the limit). */
function untilFull(sim: Sim, t: number, limit: number): number {
  const w = sim.world;
  const max = w.stats(w.ents.owner[t]!, w.ents.type[t]!).hp;
  for (let k = 1; k <= limit; k++) {
    sim.step();
    if (w.ents.hp[t]! >= max - 1e-9) return k;
  }
  return -1;
}

describe('repair (M8.3, D36)', () => {
  it('one villager mends half a house in 0.5 × 20 s / 0.4 = 25 s, for free', () => {
    const { sim, w, e, first, repair, p } = setup([{ type: 'villager', owner: 1, x: 3.5, y: 5.3 }], [{ type: 'house', owner: 1, tx: 4, ty: 4 }]);
    const h = first('house');
    e.hp[h] = 75 / 2;
    const wood = p.res[1]!;
    repair([first('villager')], h);
    const t = untilFull(sim, h, 20 * 60) + 1; // + the tick the command applied on (already in reach: work starts)
    expect(t).toBeGreaterThanOrEqual(500);
    expect(t).toBeLessThanOrEqual(500 + 20); // + a step or two to reach it
    expect(p.res[1]).toBe(wood);
    sim.step();
    expect(w.orders[first('villager')]).toBeUndefined(); // done: idle again
  });

  it('three villagers work (3 + 2) / 3 as fast as one, like builders', () => {
    const { sim, e, all, first, repair } = setup(
      [
        { type: 'villager', owner: 1, x: 3.5, y: 5.3 },
        { type: 'villager', owner: 1, x: 6.5, y: 5.3 },
        { type: 'villager', owner: 1, x: 5.0, y: 3.5 },
      ],
      [{ type: 'house', owner: 1, tx: 4, ty: 4 }],
    );
    const h = first('house');
    e.hp[h] = 75 / 2;
    repair(all('villager', 1), h);
    const t = untilFull(sim, h, 20 * 60);
    expect(Math.abs(t - 500 * (3 / 5))).toBeLessThanOrEqual(20);
  });

  it('a ship alongside the shore is repaired from the land for half its price pro rata', () => {
    const { sim, w, e, first, repair, p } = setup([{ type: 'villager', owner: 1, x: 11.4, y: 10.5 }, { type: 'warGalley', owner: 1, x: 12.6, y: 10.5 }]);
    for (const a of ['toolAge', 'bronzeAge']) completeResearch(w, 1, a);
    const g = first('warGalley');
    e.hp[g] = 80; // half of 160
    const wood = p.res[1]!;
    repair([first('villager')], g);
    const t = untilFull(sim, g, 20 * 120);
    expect(Math.abs(t - 0.5 * 1200 / 0.4)).toBeLessThanOrEqual(20); // train time 60 s
    expect(wood - p.res[1]!).toBeCloseTo(0.5 * 135 * 0.5, 6); // half the price of half the HP
  });

  it('repair waits while the player cannot pay, then goes on', () => {
    const { sim, w, e, first, repair, p } = setup([{ type: 'villager', owner: 1, x: 11.4, y: 10.5 }, { type: 'warGalley', owner: 1, x: 12.6, y: 10.5 }]);
    const g = first('warGalley');
    const v = first('villager');
    e.hp[g] = 80;
    p.res[1] = 0;
    repair([v], g);
    for (let k = 0; k < 20 * 10; k++) sim.step();
    expect(e.hp[g]).toBe(80);
    expect(w.orders[v]?.[0]?.k).toBe('repair');
    expect(e.act[v]).toBe(Act.idle);
    p.res[1] = 100;
    for (let k = 0; k < 20 * 10; k++) sim.step();
    expect(e.hp[g]).toBeGreaterThan(80);
    expect(e.act[v]).toBe(Act.build);
  });

  it('only own, finished, damaged buildings, ships and siege; not farms, soldiers or enemies', () => {
    const { w, e, first } = setup(
      [
        { type: 'clubman', owner: 1, x: 8.5, y: 18.5 },
        { type: 'villager', owner: 1, x: 2.5, y: 2.5 },
      ],
      [
        { type: 'house', owner: 1, tx: 4, ty: 4 },
        { type: 'house', owner: 2, tx: 8, ty: 4 },
        { type: 'farm', owner: 1, tx: 4, ty: 12 },
      ],
    );
    const own = first('house');
    expect(repairable(w, 1, own)).toBe(false); // full HP
    e.hp[own] = 10;
    expect(repairable(w, 1, own)).toBe(true);
    const theirs = first('house', 2);
    e.hp[theirs] = 10;
    expect(repairable(w, 1, theirs)).toBe(false);
    const farm = first('farm');
    e.hp[farm] = 1;
    expect(repairable(w, 1, farm)).toBe(false);
    const c = first('clubman');
    e.hp[c] = 5;
    expect(repairable(w, 1, c)).toBe(false);
    const stone = w.spawnUnit(unitTypeIndex('stoneThrower'), 1, 9.5, 20.5);
    e.hp[e.slotOf(stone)] = 20;
    expect(repairable(w, 1, e.slotOf(stone))).toBe(true);
  });

  it('a ship out at sea is out of reach: the villager gives up', () => {
    const { sim, w, e, first, repair } = setup([{ type: 'villager', owner: 1, x: 11.4, y: 10.5 }, { type: 'scoutShip', owner: 1, x: 22.5, y: 10.5 }]);
    const s = first('scoutShip');
    e.hp[s] = 60;
    const v = first('villager');
    repair([v], s);
    for (let k = 0; k < 20 * 30; k++) sim.step();
    expect(w.orders[v]).toBeUndefined();
    expect(e.hp[s]).toBe(60);
  });

  it('the repair command survives the replay codec', () => {
    const cmds = [{ player: 1, cmd: { t: 'repair' as const, ids: [3, 9], h: 17 } }, { player: 2, cmd: { t: 'repair' as const, ids: [4], h: 5, queue: true } }];
    expect(decodeCommands(encodeCommands(cmds))).toEqual(cmds);
  });
});
