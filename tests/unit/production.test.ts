import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';

function setup(villagers: number, ascii?: string[]) {
  const sim = Sim.create({
    seed: 2,
    map: ascii ? { w: ascii[0]!.length, h: ascii.length, ascii } : { w: 30, h: 30 },
    players: [{ civ: 'greek' }],
    scenario: {
      buildings: [{ type: 'townCenter', owner: 1, tx: 5, ty: 5 }],
      units: Array.from({ length: villagers }, (_, i) => ({ type: 'villager', owner: 1, x: 12.5 + i, y: 12.5 })),
    },
  });
  const tc = sim.world.ents.handleOf(0);
  return { sim, tc, p: sim.world.players[1]! };
}

const count = (sim: Sim) => {
  let n = 0;
  for (let s = 0; s < sim.world.ents.top; s++) if (sim.world.ents.alive[s] && sim.world.ents.kind[s] === 1) n++;
  return n;
};

describe('production', () => {
  it('a Town Center trains a villager in 20 s, paying 50 food up front', () => {
    const { sim, tc, p } = setup(0);
    sim.step([{ player: 1, cmd: { t: 'train', bld: tc, unit: 'villager' } }]);
    expect(p.res[0]).toBe(150);
    let t = 1;
    while (count(sim) === 0 && t < 1000) {
      sim.step();
      t++;
    }
    expect(t).toBe(400);
    expect(sim.drainEvents().some((e) => e.t === 'trained')).toBe(true);
  });

  it('queues at most five, cancel refunds, and housing pauses training', () => {
    const { sim, tc, p } = setup(3);
    p.res[0] = 1000;
    sim.step([{ player: 1, cmd: { t: 'train', bld: tc, unit: 'villager', n: 7 } }]);
    expect(sim.world.prod[0]!.items.length).toBe(5);
    expect(p.res[0]).toBe(750);
    sim.step([{ player: 1, cmd: { t: 'cancelTrain', bld: tc } }]);
    expect(p.res[0]).toBe(800);
    expect(sim.world.prod[0]!.items.length).toBe(4);
    // Pop cap 4 (TC only) with 3 villagers: one more trains, then training pauses.
    for (let t = 0; t < 400 * 3; t++) sim.step();
    expect(count(sim)).toBe(4);
    expect(sim.world.prod[0]!.housed).toBe(true);
    expect(sim.drainEvents().some((e) => e.t === 'housed')).toBe(true);
  });

  it('a rally point on a berry bush sends new villagers straight to foraging', () => {
    const ascii = Array.from({ length: 30 }, (_, y) => (y === 15 ? '.'.repeat(15) + 'B' + '.'.repeat(14) : '.'.repeat(30)));
    const { sim, tc } = setup(0, ascii);
    const bush = sim.world.map.resAt[15 * 30 + 15]! - 1;
    sim.step([
      { player: 1, cmd: { t: 'rally', blds: [tc], x: 15.5, y: 15.5, res: bush } },
      { player: 1, cmd: { t: 'train', bld: tc, unit: 'villager' } },
    ]);
    for (let t = 0; t < 400 + 200; t++) sim.step();
    const v = [...Array(sim.world.ents.top).keys()].find((s) => sim.world.ents.kind[s] === 1)!;
    expect(sim.world.orders[v]?.[0]).toMatchObject({ k: 'gather', res: bush });
    expect(sim.world.ents.carryAmt[v]!).toBeGreaterThan(0);
  });

  it('rejects units the building does not train or the age does not allow', () => {
    const { sim, tc } = setup(0);
    sim.step([
      { player: 1, cmd: { t: 'train', bld: tc, unit: 'clubman' } },
      { player: 1, cmd: { t: 'train', bld: tc, unit: 'bogus' } },
    ]);
    const reasons = sim.drainEvents().filter((e) => e.t === 'rejected').map((e) => (e as { reason: string }).reason);
    expect(reasons).toEqual(['not trained here', 'not trained here']);
  });
});
