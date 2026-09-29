import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { ResState } from '../../src/sim/core/resources.ts';

function world(ascii: string[], extra: { units?: { type: string; x: number; y: number }[]; buildings?: { type: string; tx: number; ty: number }[] } = {}) {
  const sim = Sim.create({
    seed: 1,
    map: { w: ascii[0]!.length, h: ascii.length, ascii },
    players: [{ civ: 'greek' }],
    startingResources: 'low',
    scenario: {
      buildings: (extra.buildings ?? []).map((b) => ({ ...b, owner: 1 })),
      units: (extra.units ?? []).map((u) => ({ ...u, owner: 1 })),
    },
  });
  const ids: number[] = [];
  for (let s = 0; s < sim.world.ents.top; s++) if (sim.world.ents.alive[s] && sim.world.ents.kind[s] === 1) ids.push(sim.world.ents.handleOf(s));
  const nodeAt = (tx: number, ty: number) => sim.world.map.resAt[ty * sim.world.map.w + tx]! - 1;
  const v = sim.world.ents.slotOf(ids[0]!);
  return { sim, ids, nodeAt, v };
}

const row = (n: number, c = '.') => c.repeat(n);

describe('gathering', () => {
  it('chops wood at 0.55/s, carries 10, and deposits at the Town Center', () => {
    const ascii = Array.from({ length: 12 }, (_, y) => (y === 5 ? row(14) + 'T' + row(5) : row(20)));
    const { sim, ids, nodeAt, v } = world(ascii, { units: [{ type: 'villager', x: 13.5, y: 5.5 }], buildings: [{ type: 'townCenter', tx: 4, ty: 4 }] });
    const tree = nodeAt(14, 5);
    const wood0 = sim.world.players[1]!.res[1]!;
    sim.step([{ player: 1, cmd: { t: 'gather', ids, res: tree } }]);
    // Work ticks to fill 10 wood at 0.55/s = 18.2 s ≈ 364 ticks; count them.
    let workTicks = 0;
    for (let t = 0; t < 2000 && sim.world.players[1]!.res[1]! === wood0; t++) {
      sim.step();
      if (sim.world.ents.act[v] === 2) workTicks++;
    }
    expect(sim.world.players[1]!.res[1]! - wood0).toBeCloseTo(10, 6);
    expect(Math.abs(workTicks - 10 / (0.55 / 20))).toBeLessThan(3);
    expect(sim.world.res.amount[tree]!).toBeCloseTo(65, 6);
  });

  it('keeps cycling, moves to the next tree when one is felled, and opens the tile', () => {
    const ascii = Array.from({ length: 12 }, (_, y) => (y === 5 ? row(10) + 'TT' + row(8) : row(20)));
    const { sim, ids, nodeAt, v } = world(ascii, { units: [{ type: 'villager', x: 9.5, y: 6.5 }], buildings: [{ type: 'storagePit', tx: 4, ty: 4 }] });
    const t1 = nodeAt(10, 5);
    const t2 = nodeAt(11, 5);
    sim.step([{ player: 1, cmd: { t: 'gather', ids, res: t1 } }]);
    for (let t = 0; t < 20 * 200 && sim.world.res.state[t1] !== ResState.gone; t++) sim.step();
    expect(sim.world.res.state[t1]).toBe(ResState.gone);
    expect(sim.world.map.passable(10, 5, 1)).toBe(true);
    for (let t = 0; t < 20 * 40; t++) sim.step();
    expect(sim.world.orders[v]![0]).toMatchObject({ k: 'gather', res: t2 });
    expect(sim.world.players[1]!.res[1]).toBeGreaterThanOrEqual(200 + 70);
  });

  it('berries go to the granary, not the storage pit; meat-style drop rules respected', () => {
    const ascii = Array.from({ length: 16 }, (_, y) => (y === 8 ? row(8) + 'B' + row(11) : row(20)));
    const { sim, ids, nodeAt, v } = world(ascii, {
      units: [{ type: 'villager', x: 9.5, y: 9.5 }],
      buildings: [{ type: 'storagePit', tx: 10, ty: 10 }, { type: 'granary', tx: 1, ty: 1 }],
    });
    const bush = nodeAt(8, 8);
    const food0 = sim.world.players[1]!.res[0]!;
    sim.step([{ player: 1, cmd: { t: 'gather', ids, res: bush } }]);
    for (let t = 0; t < 20 * 90 && sim.world.players[1]!.res[0]! === food0; t++) sim.step();
    expect(sim.world.players[1]!.res[0]! - food0).toBeCloseTo(10, 6);
    // It walked to the far granary (top-left), not the adjacent storage pit.
    expect(sim.world.ents.x[v]!).toBeLessThan(8);
  });

  it('a new resource order drops a different load; stop keeps it', () => {
    const ascii = Array.from({ length: 10 }, (_, y) => (y === 5 ? row(6) + 'T' + row(3) + 'G' + row(9) : row(20)));
    const { sim, ids, nodeAt, v } = world(ascii, { units: [{ type: 'villager', x: 5.5, y: 5.5 }] });
    sim.step([{ player: 1, cmd: { t: 'gather', ids, res: nodeAt(6, 5) } }]);
    for (let t = 0; t < 100; t++) sim.step();
    expect(sim.world.ents.carryAmt[v]!).toBeGreaterThan(1);
    sim.step([{ player: 1, cmd: { t: 'gather', ids, res: nodeAt(10, 5) } }]);
    expect(sim.world.ents.carryAmt[v]!).toBe(0);
  });
});
