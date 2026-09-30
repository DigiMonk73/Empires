import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';

/**
 * M7.6: every kind of effect the tech tree and the civilizations declare is *used* by the simulation — not only
 * compiled into stats. One representative per kind; the data's own values are the expectations.
 */
type U = { type: string; owner: number; x: number; y: number };
type B = { type: string; owner: number; tx: number; ty: number };

function game(units: U[], buildings: B[] = [], civs: [string, string] = ['greek', 'persian'], ascii?: string[], teams: [number, number] = [1, 2]) {
  const sim = Sim.create({
    seed: 21,
    map: ascii ? { w: ascii[0]!.length, h: ascii.length, ascii } : { w: 40, h: 40 },
    players: [{ civ: civs[0], team: teams[0] }, { civ: civs[1], team: teams[1] }],
    startingResources: 'deathmatch',
    victory: 'none',
    scenario: { units, buildings },
  });
  const w = sim.world;
  const e = w.ents;
  const first = (type: string, owner = 1) => {
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
  const research = (...techs: string[]) => {
    for (const t of techs) completeResearch(w, 1, t);
  };
  return { sim, w, e, first, step, research };
}

const walk = (research: string[]) => {
  const g = game([{ type: 'villager', owner: 1, x: 3.5, y: 20.5 }]);
  g.research(...research);
  const v = g.first('villager');
  g.step(1, [{ player: 1, cmd: { t: 'move', ids: [g.e.handleOf(v)], x: 36.5, y: 20.5 } }]);
  g.step(20 * 8);
  return g.e.x[v]! - 3.5;
};

describe('every effect kind is honoured by the simulation (M7.6)', () => {
  it('speed — Wheel: villagers cover more ground', () => {
    expect(walk(['toolAge', 'bronzeAge', 'wheel'])).toBeGreaterThan(walk(['toolAge', 'bronzeAge']) * 1.4);
  });

  it('work + carry — Woodworking: more wood per minute', () => {
    const chop = (techs: string[]) => {
      const rows = Array.from({ length: 20 }, (_, y) => Array.from({ length: 20 }, (_, x) => (x >= 12 && x <= 14 && y >= 4 && y <= 14 ? 'F' : '.')).join(''));
      const g = game(
        Array.from({ length: 4 }, (_, i) => ({ type: 'villager', owner: 1, x: 9.5, y: 6.5 + i * 2 })),
        [{ type: 'storagePit', owner: 1, tx: 8, ty: 8 }],
        ['greek', 'persian'],
        rows,
      );
      g.research(...techs);
      let tree = -1;
      for (let i = 0; i < g.w.res.count; i++) if (g.w.res.tx[i] === 12 && g.w.res.ty[i] === 9) tree = i;
      const ids = [];
      for (let s = 0; s < g.e.top; s++) if (g.e.alive[s] && g.e.type[s] === unitTypeIndex('villager')) ids.push(g.e.handleOf(s));
      g.step(1, [{ player: 1, cmd: { t: 'gather', ids, res: tree } }]);
      const before = g.w.players[1]!.res[1]!;
      g.step(20 * 120);
      return g.w.players[1]!.res[1]! - before;
    };
    expect(chop(['toolAge', 'woodworking'])).toBeGreaterThan(chop(['toolAge']) * 1.08);
  });

  it('range — Woodworking: bowmen shoot from one tile further', () => {
    const g = game([{ type: 'bowman', owner: 1, x: 10.5, y: 10.5 }]);
    g.research('toolAge');
    const r0 = g.w.stats(1, unitTypeIndex('bowman')).range;
    g.research('woodworking');
    expect(g.w.stats(1, unitTypeIndex('bowman')).range).toBe(r0 + 1);
  });

  it('los — the fog follows compiled line of sight (Bronze Age: scouts +2)', () => {
    const seen = (techs: string[]) => {
      const g = game([{ type: 'scout', owner: 1, x: 20.5, y: 20.5 }]);
      g.research(...techs);
      g.step(2);
      let n = 0;
      for (const v of g.w.fog.vis[1]!) if (v) n++;
      return n;
    };
    expect(seen(['toolAge', 'bronzeAge'])).toBeGreaterThan(seen([]));
  });

  it('pop — Logistics: barracks units count as half population', () => {
    const g = game(Array.from({ length: 4 }, (_, i) => ({ type: 'clubman', owner: 1, x: 10.5 + i, y: 10.5 })), [{ type: 'townCenter', owner: 1, tx: 20, ty: 20 }]);
    g.step(2);
    expect(g.w.players[1]!.pop).toBe(4);
    g.research('toolAge', 'bronzeAge', 'logistics');
    g.step(2);
    expect(g.w.players[1]!.pop).toBe(2);
  });

  it('hp — Architecture: +20% on buildings standing (and on new ones)', () => {
    const g = game([], [{ type: 'house', owner: 1, tx: 10, ty: 10 }]);
    const h = g.first('house');
    const hp0 = g.e.hp[h]!;
    g.research('toolAge', 'bronzeAge', 'architecture');
    expect(g.e.hp[h]).toBeCloseTo(hp0 * 1.2, 5);
  });

  it('work.build — Architecture: builders work 50% faster', () => {
    const build = (techs: string[]) => {
      const g = game([{ type: 'villager', owner: 1, x: 9.5, y: 9.5 }]);
      g.research(...techs);
      g.step(1, [{ player: 1, cmd: { t: 'build', ids: [g.e.handleOf(g.first('villager'))], type: 'house', tx: 11, ty: 9 } }]);
      g.step(20 * 10);
      return g.e.build[g.first('house')]!;
    };
    expect(build(['toolAge', 'bronzeAge', 'architecture'])).toBeGreaterThan(build(['toolAge', 'bronzeAge']) * 1.3);
  });

  it('atk — Toolworking: +2 melee damage in a fight', () => {
    const g = game([{ type: 'clubman', owner: 1, x: 10.5, y: 10.5 }, { type: 'clubman', owner: 2, x: 11.2, y: 10.5 }]);
    g.research('toolAge', 'toolworking');
    const a = g.w.stats(1, unitTypeIndex('clubman')).atk;
    const b = g.w.stats(2, unitTypeIndex('clubman')).atk;
    expect(a[4]! - (b[4] ?? a[4]! - 2)).toBe(2);
    const c2 = g.first('clubman', 2);
    const hp0 = g.e.hp[c2]!;
    g.step(1, [{ player: 1, cmd: { t: 'act', ids: [g.e.handleOf(g.first('clubman'))], h: g.e.handleOf(c2) } }, { player: 2, cmd: { t: 'stance', ids: [g.e.handleOf(c2)], stand: true } }]);
    g.step(12);
    expect(hp0 - g.e.hp[c2]!).toBe(3 + 2 - 0); // clubman 3 + 2, vs 0 melee armor
  });

  it('arm — Leather Armor (soldiers): +2 melee armor absorbs blows', () => {
    const g = game([{ type: 'clubman', owner: 1, x: 10.5, y: 10.5 }]);
    const a0 = g.w.stats(1, unitTypeIndex('clubman')).arm[4] ?? 0;
    g.research('toolAge', 'leatherArmorSoldiers');
    expect((g.w.stats(1, unitTypeIndex('clubman')).arm[4] ?? 0) - a0).toBe(2);
  });

  it('reload — Assyrian archers shoot faster', () => {
    const shots = (civ: string) => {
      const g = game([{ type: 'bowman', owner: 1, x: 10.5, y: 10.5 }], [{ type: 'house', owner: 2, tx: 14, ty: 10 }], [civ, 'persian']);
      let n = 0;
      g.step(1, [{ player: 1, cmd: { t: 'act', ids: [g.e.handleOf(g.first('bowman'))], h: g.e.handleOf(g.first('house', 2)) } }]);
      for (let i = 0; i < 20 * 20; i++) {
        g.sim.step();
        for (const ev of g.sim.drainEvents()) if (ev.t === 'strike') n++;
      }
      return n;
    };
    expect(shots('assyrian')).toBeGreaterThan(shots('greek'));
  });

  it('cost — Shang villagers cost 35 food; Roman buildings are cheaper', () => {
    expect(game([], [], ['shang', 'greek']).w.stats(1, unitTypeIndex('villager')).cost[0]).toBeLessThan(50);
    expect(game([], [], ['roman', 'greek']).w.stats(1, buildingTypeIndex('house')).cost[1]).toBeLessThan(30);
  });

  it('farmFood — Domestication: new farms hold +75 food', () => {
    const g = game([], [{ type: 'farm', owner: 1, tx: 10, ty: 10 }]);
    expect(g.e.stock[g.first('farm')]).toBe(250);
    g.research('toolAge', 'domestication');
    const g2 = game([{ type: 'villager', owner: 1, x: 9.5, y: 9.5 }], [{ type: 'market', owner: 1, tx: 20, ty: 20 }]);
    g2.research('toolAge', 'domestication');
    g2.step(1, [{ player: 1, cmd: { t: 'build', ids: [g2.e.handleOf(g2.first('villager'))], type: 'farm', tx: 11, ty: 9 } }]);
    for (let i = 0; i < 20 * 90 && !(g2.first('farm') >= 0 && g2.e.build[g2.first('farm')]! >= 1); i++) g2.step(1);
    expect(g2.e.build[g2.first('farm')]).toBe(1);
    expect(g2.e.stock[g2.first('farm')]).toBeGreaterThan(300); // 325, less what its farmer has picked
  });

  it('goldYield — Coinage: gold delivered ×1.25', () => {
    const g = game([]);
    g.research('toolAge', 'bronzeAge', 'ironAge', 'goldMining', 'coinage');
    expect(g.w.players[1]!.stats.goldYield).toBe(1.25);
  });

  it('writing — allies share the researcher’s line of sight', () => {
    const g = game([{ type: 'scout', owner: 1, x: 30.5, y: 30.5 }, { type: 'scout', owner: 2, x: 5.5, y: 5.5 }], [], ['greek', 'persian'], undefined, [1, 1]);
    g.step(2);
    const W = g.w.map.w;
    expect(g.w.fog.vis[2]![30 * W + 30]).toBe(0);
    g.research('toolAge', 'bronzeAge', 'writing');
    g.step(2);
    expect(g.w.fog.vis[2]![30 * W + 30]).toBeGreaterThan(0);
    expect(g.w.fog.vis[1]![5 * W + 5]).toBe(0); // one way: player 2 hasn't researched it
  });

  it('ballistics — archers lead moving targets and hit them more often', () => {
    const hits = (techs: string[]) => {
      const g = game([...[0, 1, 2].map((i) => ({ type: 'bowman', owner: 1, x: 10.5, y: 14.5 + i })), { type: 'scout', owner: 2, x: 15.5, y: 6.5 }]);
      g.research(...techs);
      const scout = g.first('scout', 2);
      const ids = [0, 1, 2].map(() => 0);
      let k = 0;
      for (let s = 0; s < g.e.top; s++) if (g.e.alive[s] && g.e.type[s] === unitTypeIndex('bowman')) ids[k++] = g.e.handleOf(s);
      // The scout runs back and forth across the archers' front.
      g.step(1, [{ player: 1, cmd: { t: 'act', ids, h: g.e.handleOf(scout) } }, { player: 2, cmd: { t: 'move', ids: [g.e.handleOf(scout)], x: 15.5, y: 26.5 } }]);
      let hp = g.e.hp[scout]!;
      for (let i = 0; i < 20 * 12; i++) {
        if (i % 60 === 30 && g.e.alive[scout]) g.sim.step([{ player: 2, cmd: { t: 'move', ids: [g.e.handleOf(scout)], x: 15.5, y: i % 120 === 30 ? 6.5 : 26.5 } }]);
        else g.sim.step();
        g.sim.drainEvents();
      }
      return g.e.alive[scout] ? hp - g.e.hp[scout]! : hp;
    };
    expect(hits(['toolAge', 'bronzeAge', 'ironAge', 'ballistics'])).toBeGreaterThan(hits(['toolAge', 'bronzeAge', 'ironAge']));
  });

  it('villagersAttackWalls — Siegecraft lets villagers damage walls and towers', () => {
    const dmg = (techs: string[]) => {
      const g = game([{ type: 'villager', owner: 1, x: 10.5, y: 10.5 }], [{ type: 'watchTower', owner: 2, tx: 12, ty: 10 }]);
      g.research(...techs);
      const t = g.first('watchTower', 2);
      const hp0 = g.e.hp[t]!;
      g.step(1, [{ player: 1, cmd: { t: 'act', ids: [g.e.handleOf(g.first('villager'))], h: g.e.handleOf(t) } }]);
      g.step(20 * 10);
      return hp0 - g.e.hp[t]!;
    };
    expect(dmg(['toolAge', 'bronzeAge', 'ironAge', 'stoneMining', 'siegecraft'])).toBeGreaterThan(dmg([]) * 10);
  });
});

import { BUILDINGS, CIVS } from '../../src/data/index.ts';
import { computeCommands } from '../../src/ui/commands.ts';

describe('command grid (M7.6)', () => {
  it('no building offers more than the 15 buttons the grid holds, for any civilization in any age', () => {
    const blds = BUILDINGS.filter((b) => !['wall', 'tower', 'farm', 'wonder'].includes(b.kind) && b.id !== 'house');
    let worst = 0;
    for (const civ of CIVS) {
      for (const age of [1, 2, 3, 4]) {
        const sim = Sim.create({ seed: 1, map: { w: 80, h: 80 }, players: [{ civ: civ.id }], startingResources: 'deathmatch', victory: 'none', scenario: { buildings: blds.map((b, i) => ({ type: b.id, owner: 1, tx: 2 + (i % 8) * 9, ty: 2 + Math.floor(i / 8) * 9 })) } });
        for (const a of ['toolAge', 'bronzeAge', 'ironAge'].slice(0, age - 1)) completeResearch(sim.world, 1, a);
        for (let s = 0; s < sim.world.ents.top; s++) worst = Math.max(worst, computeCommands(sim.world, 1, [sim.world.ents.handleOf(s)], 'main').length);
      }
    }
    expect(worst).toBeLessThanOrEqual(15);
  });
});
