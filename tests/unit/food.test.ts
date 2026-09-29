import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { ResState } from '../../src/sim/core/resources.ts';
import { compilePlayerStats } from '../../src/sim/rules/playerStats.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { decodeCommands, encodeCommands } from '../../src/sim/commands/codec.ts';
import { kill } from '../../src/sim/systems/combat.ts';

type Spec = { type: string; owner?: number; x: number; y: number };
type BSpec = { type: string; owner?: number; tx: number; ty: number };

function setup(opts: { ascii?: string[]; w?: number; h?: number; units?: Spec[]; buildings?: BSpec[]; techs?: string[] }) {
  const sim = Sim.create({
    seed: 7,
    map: opts.ascii ? { w: opts.ascii[0]!.length, h: opts.ascii.length, ascii: opts.ascii } : { w: opts.w ?? 30, h: opts.h ?? 30 },
    players: [{ civ: 'greek' }],
    startingResources: 'high',
    scenario: {
      buildings: (opts.buildings ?? []).map((b) => ({ owner: 1, ...b })),
      units: (opts.units ?? []).map((u) => ({ owner: 1, ...u })),
    },
  });
  const p = sim.world.players[1]!;
  if (opts.techs) {
    p.techs.push(...opts.techs);
    p.stats = compilePlayerStats(p.civ, p.techs);
  }
  const e = sim.world.ents;
  const of = (type: string) => {
    const out: number[] = [];
    let ti = -1;
    try {
      ti = unitTypeIndex(type);
    } catch {
      ti = buildingTypeIndex(type);
    }
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.type[s] === ti) out.push(s);
    return out;
  };
  return { sim, w: sim.world, e, p, of, h: (s: number) => e.handleOf(s) };
}

const row = (n: number, c = '.') => c.repeat(n);

describe('farming (econ:1.4)', () => {
  it('the builder farms the new field: 250 food at 0.45/s, one farmer, food to the granary, field gone when empty', () => {
    const { sim, w, e, p, of, h } = setup({
      units: [{ type: 'villager', x: 12.5, y: 12.5 }, { type: 'villager', x: 13.5, y: 12.5 }],
      buildings: [{ type: 'granary', tx: 8, ty: 13 }, { type: 'market', tx: 20, ty: 20 }],
      techs: ['toolAge'],
    });
    const [v1, v2] = of('villager');
    const wood0 = p.res[1]!;
    sim.step([{ player: 1, cmd: { t: 'build', ids: [h(v1!)], type: 'farm', tx: 12, ty: 14 } }]);
    expect(p.res[1]).toBe(wood0 - 75);
    const farm = of('farm')[0]!;
    // Build (30 s alone), then it's sown with 250 food and the builder starts farming.
    for (let t = 0; t < 20 * 40 && e.build[farm]! < 1; t++) sim.step();
    expect(e.build[farm]).toBe(1);
    expect(e.stock[farm]).toBe(250);
    sim.step();
    expect(w.orders[v1!]?.[0]).toMatchObject({ k: 'farm', h: h(farm) });
    // A second villager can't take an occupied farm.
    sim.step([{ player: 1, cmd: { t: 'act', ids: [h(v2!)], h: h(farm) } }]);
    expect(w.orders[v2!]).toBeUndefined();
    // Farm it dry: 250 food, then the field disappears and the tiles are free again.
    const food0 = p.res[0]!;
    let work = 0;
    let gone = -1;
    for (let t = 0; t < 20 * 900 && gone < 0; t++) {
      const before = e.stock[farm]!;
      sim.step();
      const ev = sim.drainEvents();
      if (e.stock[farm]! < before || ev.some((x) => x.t === 'farmDepleted')) work++;
      if (ev.some((x) => x.t === 'farmDepleted')) gone = t;
    }
    expect(gone).toBeGreaterThan(0);
    expect(e.alive[farm] && e.type[farm] === buildingTypeIndex('farm')).toBeFalsy();
    expect(w.map.bldAt[14 * w.map.w + 13]).toBe(0);
    for (let t = 0; t < 20 * 30; t++) sim.step(); // deliver the last load
    expect(p.res[0]! - food0).toBeCloseTo(250, 6);
    // 0.45 food/s in the field; each of the 25 loads ends on a partial tick.
    expect(Math.abs(work - 250 / (0.45 / 20))).toBeLessThan(26);
    expect(w.orders[v1!]).toBeUndefined();
  });

  it('farm techs add food to newly sown fields', () => {
    const { sim, e, of, h } = setup({
      units: [{ type: 'villager', x: 12.5, y: 12.5 }],
      buildings: [{ type: 'market', tx: 20, ty: 20 }],
      techs: ['toolAge', 'domestication'],
    });
    sim.step([{ player: 1, cmd: { t: 'build', ids: [h(of('villager')[0]!)], type: 'farm', tx: 12, ty: 14 } }]);
    const farm = of('farm')[0]!;
    for (let t = 0; t < 20 * 40 && e.build[farm]! < 1; t++) sim.step();
    expect(e.stock[farm]).toBe(325);
  });
});

describe('shore fishing (econ:1.1, econ:1.2)', () => {
  it('villagers fish from the shore at 0.6/s and drop fish at a storage pit, not a granary', () => {
    const ascii = Array.from({ length: 16 }, (_, y) => (y < 4 ? row(20, '~') : y === 4 ? row(8, '~') + 'f' + row(11, '~') : row(20)));
    const { sim, w, e, p, of, h } = setup({
      ascii,
      units: [{ type: 'villager', x: 8.5, y: 6.5 }],
      buildings: [{ type: 'granary', tx: 4, ty: 7 }, { type: 'storagePit', tx: 12, ty: 11 }],
    });
    const v = of('villager')[0]!;
    const fish = w.map.resAt[4 * w.map.w + 8]! - 1;
    expect(fish).toBeGreaterThanOrEqual(0);
    const food0 = p.res[0]!;
    sim.step([{ player: 1, cmd: { t: 'gather', ids: [h(v)], res: fish } }]);
    let work = 0;
    for (let t = 0; t < 20 * 120 && p.res[0] === food0; t++) {
      sim.step();
      if (e.act[v] === 2) work++;
      // Never heads for the granary (x < 7) with a load.
      if (e.carryAmt[v]! > 9.99) expect(e.x[v]).toBeGreaterThan(7);
    }
    expect(p.res[0]! - food0).toBeCloseTo(10, 6);
    expect(Math.abs(work - 10 / (0.6 / 20))).toBeLessThan(3);
    expect(w.res.amount[fish]).toBeCloseTo(240, 6);
  });
});

describe('hunting (econ:1.1, mil:1a)', () => {
  it('a gazelle dies to spears, leaves a 150-food carcass the hunter butchers and takes to the storage pit', () => {
    const { sim, w, e, p, of, h } = setup({
      units: [{ type: 'villager', x: 8.5, y: 10.5 }, { type: 'gazelle', owner: 0, x: 14.5, y: 10.5 }],
      buildings: [{ type: 'granary', tx: 2, ty: 2 }, { type: 'storagePit', tx: 20, ty: 20 }],
    });
    const v = of('villager')[0]!;
    const g = of('gazelle')[0]!;
    const gh = h(g);
    const food0 = p.res[0]!;
    sim.step([{ player: 1, cmd: { t: 'act', ids: [h(v)], h: gh } }]);
    expect(w.orders[v]?.[0]).toMatchObject({ k: 'attack', hunt: true });
    let died: { x: number; y: number } | null = null;
    for (let t = 0; t < 20 * 60 && !died; t++) {
      sim.step();
      for (const ev of sim.drainEvents()) if (ev.t === 'died' && ev.h === gh) died = ev;
    }
    expect(died).not.toBeNull();
    expect(w.carcasses.length).toBe(1);
    const c = w.carcasses[0]!;
    expect(w.res.kind[c]).toBeGreaterThan(0);
    expect(w.res.amount[c]).toBeGreaterThan(145);
    expect(w.orders[v]?.[0]).toMatchObject({ k: 'gather', res: c });
    // The first load goes to the storage pit (meat), not the granary.
    for (let t = 0; t < 20 * 120 && p.res[0] === food0; t++) sim.step();
    expect(p.res[0]! - food0).toBeCloseTo(10, 6);
    expect(e.x[v]).toBeGreaterThan(15);
  });

  it('carcasses rot at the animal decay rate and vanish', () => {
    const { sim, w, of } = setup({ units: [{ type: 'gazelle', owner: 0, x: 10.5, y: 10.5 }] });
    const c = kill(w, of('gazelle')[0]!);
    expect(w.res.amount[c]).toBe(150);
    for (let t = 0; t < 20 * 100; t++) sim.step();
    expect(w.res.amount[c]).toBeCloseTo(150 - 0.3 * 100, 6); // gazelle: 0.3 food/s
    for (let t = 0; t < 20 * 401 && w.res.state[c] === ResState.standing; t++) sim.step();
    expect(w.res.state[c]).toBe(ResState.gone);
    expect(w.carcasses.length).toBe(0);
  });

  it('an elephant fights back', () => {
    const { sim, w, e, of, h } = setup({ units: [{ type: 'villager', x: 8.5, y: 10.5 }, { type: 'elephant', owner: 0, x: 12.5, y: 10.5 }] });
    const v = of('villager')[0]!;
    const el = of('elephant')[0]!;
    sim.step([{ player: 1, cmd: { t: 'act', ids: [h(v)], h: h(el) } }]);
    let hurt = false;
    for (let t = 0; t < 20 * 30 && !hurt; t++) {
      sim.step();
      hurt = !e.alive[v] || e.hp[v]! < 25;
    }
    expect(hurt).toBe(true);
    expect(w.orders[el]?.[0]?.k).toBe('attack');
  });

  it('villagers can only attack animals; act commands round-trip through the codec', () => {
    const { sim, w, of, h } = setup({ units: [{ type: 'villager', x: 8.5, y: 10.5 }, { type: 'villager', x: 9.5, y: 10.5 }] });
    const [a, b] = of('villager');
    sim.step([{ player: 1, cmd: { t: 'act', ids: [h(a!)], h: h(b!) } }]);
    expect(w.orders[a!]).toBeUndefined();
    const cmds = [{ player: 1, cmd: { t: 'act' as const, ids: [h(a!)], h: 12345, queue: true } }];
    expect(decodeCommands(encodeCommands(cmds))).toEqual(cmds);
  });

  it('hunting and farming survive save/load identically', () => {
    const { sim, of, h } = setup({
      units: [{ type: 'villager', x: 8.5, y: 10.5 }, { type: 'villager', x: 12.5, y: 12.5 }, { type: 'gazelle', owner: 0, x: 12.5, y: 8.5 }],
      buildings: [{ type: 'market', tx: 20, ty: 20 }, { type: 'townCenter', tx: 2, ty: 14 }],
      techs: ['toolAge'],
    });
    const [v1, v2] = of('villager');
    sim.step([
      { player: 1, cmd: { t: 'act', ids: [h(v1!)], h: h(of('gazelle')[0]!) } },
      { player: 1, cmd: { t: 'build', ids: [h(v2!)], type: 'farm', tx: 12, ty: 14 } },
    ]);
    for (let t = 0; t < 20 * 45; t++) sim.step(); // gazelle dead, carcass rotting; farm sown and worked
    expect(sim.world.carcasses.length).toBe(1);
    const b = Sim.deserialize(sim.serialize());
    expect(b.hashBreakdown()).toEqual(sim.hashBreakdown());
    for (let t = 0; t < 20 * 60; t++) {
      sim.step();
      b.step();
    }
    expect(b.hash()).toBe(sim.hash());
  });
});
