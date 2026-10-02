import { describe, expect, it } from 'vitest';
import { Tactics, worth } from '../../src/ai/tactics.ts';
import { UPGRADE_TIER } from '../../src/ai/upgrades.ts';
import { runMatch } from '../../src/game/aiMatch.ts';
import { Sim } from '../../src/sim/index.ts';
import { HARDEST_BONUS } from '../../src/data/setup.ts';
import { AiPlayer, lateStart } from '../../src/ai/ai.ts';
import { PlayerView } from '../../src/sim/view/playerView.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { EKind } from '../../src/sim/core/entities.ts';
import type { Command } from '../../src/sim/index.ts';
import { GameSession } from '../../src/game/session.ts';
import { setupFromQuery, skirmishConfig } from '../../src/game/skirmish.ts';

describe('AI v2 (M13.2)', () => {
  it('values units by price and health left', () => {
    expect(worth('clubman', 40)).toBe(50); // 50 food, full health
    expect(worth('clubman', 20)).toBe(25);
    expect(worth('nonsense', 10)).toBe(0);
  });

  it('pushes only when clearly stronger than the enemy it remembers', () => {
    const t = new Tactics();
    t.seen.set(1, { h: 1, type: 'clubman', hp: 40, x: 0, y: 0, tick: 0 });
    t.seen.set(2, { h: 2, type: 'clubman', hp: 40, x: 0, y: 0, tick: 0 });
    const army = (n: number) => Array.from({ length: n }, (_, i) => ({ h: 10 + i, type: 'clubman', cls: 'infantry', x: 0, y: 0, hp: 40, idle: true, order: null, target: -1, job: null, carry: 0, act: 0, aboard: 0 }));
    expect(t.readyToPush(army(2), false)).toBe(false);
    expect(t.readyToPush(army(3), false)).toBe(true); // 150 ≥ 1.5 × 100
    expect(t.readyToPush(army(1), true)).toBe(true); // population full: go anyway
  });

  it('the harder levels research further down the upgrade programme', () => {
    expect([UPGRADE_TIER.easiest, UPGRADE_TIER.easy, UPGRADE_TIER.moderate, UPGRADE_TIER.hard, UPGRADE_TIER.hardest]).toEqual([0, 1, 2, 3, 4]);
    const r = runMatch({ seed: 104, type: 'continental', size: 'tiny', levels: ['hard', 'easiest'], minutes: 30 });
    const econ = ['woodworking', 'domestication', 'toolworking', 'wheel', 'leatherArmorSoldiers', 'leatherArmorArchers', 'leatherArmorCavalry'];
    expect(r.techs[0]!.filter((t) => econ.includes(t)).length).toBeGreaterThan(0);
    expect(r.techs[1]!.filter((t) => econ.includes(t))).toEqual([]); // Easiest researches none
  });

  it('Hardest starts with its head start (D48); other computers and humans do not', () => {
    const sim = Sim.create({ seed: 1, map: { w: 24, h: 24 }, players: [{ civ: 'greek' }, { civ: 'greek', ai: 'hardest' }, { civ: 'greek', ai: 'hard' }] });
    const food = sim.world.players.map((p) => p.res[0]);
    expect(food[2]! - food[1]!).toBe(HARDEST_BONUS.food);
    expect(food[3]).toBe(food[1]);
  });
});

describe('AI v2 fixes (M13.4)', () => {
  it('a full population never freezes the Town Center: the computers still age up at the game\'s limit', () => {
    // M13.4: a villager queued at a full population waited for a house forever, the age could not be queued behind
    // it, and Hardest floated 14,000 resources in the Tool Age. A peaceful game with a 25 limit puts both computers
    // at the limit early (M14: the fix had 50 hard-coded — a 25 limit brought the deadlock back on seed 103).
    for (const seed of [101, 103]) {
      const r = runMatch({ seed, type: 'inland', size: 'tiny', levels: ['hardest', 'hard'], minutes: 30, peaceful: true, popCap: 25 });
      for (const p of [0, 1]) {
        expect(Math.max(...r.samples.map((x) => x.players[p]!.pop)), `seed ${seed} P${p + 1} at the limit`).toBe(25);
        expect(r.ageTick[p]![4], `seed ${seed} P${p + 1} Iron Age`).toBeGreaterThan(0);
      }
    }
  });

  it('a won war is finished: the army hunts down the last building in explored ground', () => {
    // M13.4: a lone Granary in an explored corner kept won wars open past the hour. (Was a fixed-seed war — seed 14
    // — until the maps changed under it, D59; this scene guards finishing a won war on any map.)
    const sim = Sim.create({
      seed: 3,
      map: { w: 48, h: 48 },
      victory: 'conquest',
      revealMap: true,
      players: [{ civ: 'greek', ai: 'moderate' }, { civ: 'persian' }],
      scenario: {
        buildings: [{ type: 'townCenter', owner: 1, tx: 4, ty: 4 }, { type: 'granary', owner: 2, tx: 42, ty: 42 }],
        units: [...Array.from({ length: 8 }, (_, i) => ({ type: 'axeman', owner: 1, x: 9.5 + (i % 4), y: 9.5 + Math.floor(i / 4) })), ...[0, 1, 2].map((i) => ({ type: 'villager', owner: 1, x: 5 + i, y: 9 }))],
      },
    });
    const w = sim.world;
    w.players[1]!.res.set([1000, 1000, 500, 200]);
    const ai = new AiPlayer(1, 'moderate', 1, { civ: 'greek' });
    const view = new PlayerView(w, 1);
    for (let t = 0; t < 20 * 60 * 6 && w.players[2]!.defeated === null; t++) {
      sim.step(ai.think(view).map((cmd) => ({ player: 1, cmd })));
      sim.drainEvents();
    }
    expect(w.players[2]!.defeated).not.toBeNull();
  });
});

describe('AI priests (M13.5)', () => {
  it('Hard converts the valuable enemy in reach with its priests and researches the Temple from spare gold', () => {
    const sim = Sim.create({
      seed: 7,
      map: { w: 40, h: 40 },
      victory: 'none',
      players: [{ civ: 'egyptian', ai: 'hard' }, { civ: 'greek' }],
      scenario: {
        buildings: [
          { type: 'townCenter', owner: 1, tx: 4, ty: 4 },
          { type: 'temple', owner: 1, tx: 10, ty: 4 },
          { type: 'townCenter', owner: 2, tx: 32, ty: 32 },
        ],
        units: [
          { type: 'priest', owner: 1, x: 14.5, y: 12.5 },
          { type: 'priest', owner: 1, x: 15.5, y: 12.5 },
          { type: 'warElephant', owner: 2, x: 19.5, y: 15.5 },
          ...[0, 1, 2, 3].map((i) => ({ type: 'villager', owner: 1, x: 6.5 + i, y: 10.5 })),
        ],
      },
    });
    const w = sim.world;
    for (const age of ['toolAge', 'bronzeAge']) completeResearch(w, 1, age);
    w.players[1]!.res.set([3000, 1000, 1000, 0]);
    const ai = new AiPlayer(1, 'hard', 1, { civ: 'egyptian' });
    const view = new PlayerView(w, 1);
    let converting = false;
    for (let t = 0; t < 20 * 60; t++) {
      sim.step(ai.think(view).map((cmd) => ({ player: 1, cmd })));
      sim.drainEvents();
      converting ||= w.orders.some((q, s) => q?.[0]?.k === 'convert' && w.ents.owner[s] === 1);
    }
    expect(converting).toBe(true);
    expect(w.players[1]!.techs).toContain('astrology');
  });
});

describe('AI villagers under attack (M15.10 P3)', () => {
  it('a militia already fighting stays in the fight: flee does not call it home', () => {
    // Every militia villager already had its order, so `militia` reported nothing sent and `flee` called them home;
    // the next think sent them back — they jittered under the raider's arrows (lens A, g2: 726 flips in 2.5 min).
    const t = new Tactics();
    const vil = (h: number) => ({ h, type: 'villager', cls: 'villager', x: 20 + h * 0.5, y: 20, hp: 25, idle: false, order: 'attack', target: 99, job: null, carry: 0, act: 0, aboard: 0 });
    const raider = { h: 99, type: 'clubman', cls: 'infantry', x: 22, y: 21, hp: 40, owner: 2, building: false };
    const s = { busy: new Set<number>(), villagers: [1, 2, 3, 4].map(vil), tc: { x: 5, y: 5 }, v: { tick: 100 } };
    const cmds: Command[] = [];
    expect(t.militia(s as never, [], [raider as never], cmds)).toBe(true);
    t.flee(s as never, [raider as never], cmds);
    expect(cmds).toEqual([]);
  });

  it('villagers fleeing raiders are not sent at an alligator on the way home', () => {
    // Two villagers (too few for a militia) with an enemy bowman and an alligator beside them: `flee` sent them home,
    // the next think `predators` sent them at the alligator, the next home again — 497 flips for one player in g2.
    const sim = Sim.create({
      seed: 5,
      map: { w: 40, h: 40 },
      victory: 'none',
      players: [{ civ: 'greek', ai: 'hard' }, { civ: 'greek' }],
      scenario: {
        buildings: [{ type: 'townCenter', owner: 1, tx: 4, ty: 4 }, { type: 'townCenter', owner: 2, tx: 34, ty: 34 }],
        units: [
          { type: 'villager', owner: 1, x: 15.5, y: 15.5 },
          { type: 'villager', owner: 1, x: 16.5, y: 15.5 },
          { type: 'alligator', owner: 0, x: 17.5, y: 12.5 },
          { type: 'bowman', owner: 2, x: 18.5, y: 17.5 },
        ],
      },
    });
    const w = sim.world;
    const ai = new AiPlayer(1, 'hard', 1, { civ: 'greek' });
    const view = new PlayerView(w, 1);
    const bow = w.ents.slotOf(w.ents.handleOf(w.ents.top - 1));
    const full = w.ents.hp[bow]!;
    const last = new Map<number, string | null>();
    let sentHome = 0;
    for (let t = 0; t < 20 * 40; t++) {
      sim.step(ai.think(view).map((cmd) => ({ player: 1, cmd })));
      sim.drainEvents();
      if (w.ents.alive[bow]) w.ents.hp[bow] = full; // the bowman stays: the villagers must keep clear of it
      for (let s = 0; s < w.ents.top; s++) {
        if (!w.ents.alive[s] || w.ents.owner[s] !== 1 || w.ents.kind[s] !== EKind.unit) continue;
        const k = w.orders[s]?.[0]?.k ?? null;
        if (last.get(s) === 'attack' && k === 'move') sentHome++;
        last.set(s, k);
      }
    }
    expect(sentHome).toBeLessThanOrEqual(2);
  });
});

describe('AI building sites (M15.10 P21)', () => {
  it('a computer never puts a building on land its villagers cannot walk to', () => {
    // A 7×7 island: the Town Center and its margin leave no room for a house. Open land lies 5 tiles across the
    // water: the search (to 16, then 18 tiles of the Town Center) placed houses there, never built and in a
    // neighbour's way (crowded island maps).
    const W = 40;
    const ascii = Array.from({ length: W }, (_, y) => Array.from({ length: W }, (_, x) => ((x >= 2 && x <= 8 && y >= 2 && y <= 8) || (x >= 14 && x <= 34 && y >= 2 && y <= 30) ? '.' : 'w')).join(''));
    const sim = Sim.create({
      seed: 4,
      map: { w: W, h: W, ascii },
      victory: 'none',
      players: [{ civ: 'greek', ai: 'moderate' }, { civ: 'persian' }],
      scenario: {
        buildings: [{ type: 'townCenter', owner: 1, tx: 4, ty: 4 }],
        units: [{ type: 'villager', owner: 1, x: 3.5, y: 3.5 }, { type: 'villager', owner: 1, x: 7.5, y: 3.5 }, { type: 'villager', owner: 1, x: 3.5, y: 7.5 }, { type: 'villager', owner: 1, x: 7.5, y: 7.5 }],
      },
    });
    const w = sim.world;
    w.players[1]!.res.set([1000, 1000, 500, 200]);
    const ai = new AiPlayer(1, 'moderate', 1, { civ: 'greek' });
    const view = new PlayerView(w, 1);
    for (let t = 0; t < 20 * 60; t++) {
      sim.step(ai.think(view).map((cmd) => ({ player: 1, cmd })));
      sim.drainEvents();
    }
    const away = view.ownBuildings().filter((b) => b.x > 10);
    expect(away.map((b) => `${b.type}@${b.x},${b.y}`)).toEqual([]);
  });
});

describe('AI starting ages (M15.10 P19)', () => {
  it('a Nomad start is a Stone Age start: no late-start villager cap', () => {
    expect(['default', 'nomad', 'tool', 'bronze', 'iron', 'postIron'].map(lateStart)).toEqual([false, false, true, true, true, true]);
  });
});

describe('AI villager share (M15.10 P69, D69)', () => {
  it('at a 50 population a computer keeps at most 70% villagers: room for an army', () => {
    // Hard wants 38 villagers in the Bronze Age, 44 in the Iron: at the default limit of 50 that left 6–12 soldiers,
    // and Hard-vs-Hard games stood still at the limit (2 of 16 undecided at 90 min).
    const r = runMatch({ seed: 101, type: 'inland', size: 'tiny', levels: ['hard', 'hard'], minutes: 35, peaceful: true, popCap: 50 });
    for (const p of [0, 1]) {
      expect(Math.max(...r.samples.map((x) => x.players[p]!.villagers)), `P${p + 1}`).toBeLessThanOrEqual(35);
      // (In peace nothing makes it fill the rest with soldiers; the town still grows.)
      expect(Math.max(...r.samples.map((x) => x.players[p]!.pop)), `P${p + 1} grows`).toBeGreaterThan(30);
    }
  }, 60_000);
});

describe('AI foundations (M15.10 P55)', () => {
  it('a farm foundation nobody is building gets a builder', () => {
    // Farms were left out of `finishFoundations`: a field whose builder was pulled away stayed bare dirt for good (17
    // on one Huge map), and still counted towards the farms the computer wanted.
    const sim = Sim.create({
      seed: 2,
      map: { w: 40, h: 40 },
      victory: 'none',
      players: [{ civ: 'greek', ai: 'hard' }, { civ: 'persian' }],
      scenario: {
        buildings: [{ type: 'townCenter', owner: 1, tx: 6, ty: 6 }, { type: 'farm', owner: 1, tx: 12, ty: 6, progress: 0 }],
        units: [0, 1, 2, 3].map((i) => ({ type: 'villager', owner: 1, x: 5.5 + i, y: 11.5 })),
      },
    });
    const w = sim.world;
    for (const t of ['toolAge']) completeResearch(w, 1, t);
    const ai = new AiPlayer(1, 'hard', 1, { civ: 'greek' });
    const view = new PlayerView(w, 1);
    for (let t = 0; t < 20 * 60; t++) {
      sim.step(ai.think(view).map((cmd) => ({ player: 1, cmd })));
      sim.drainEvents();
    }
    const farm = view.ownBuildings().find((b) => b.type === 'farm')!;
    expect(farm.done).toBe(true);
  });
});

describe('AI Docks (M15.10 P59)', () => {
  it('a Dock goes on a shore the builders can walk to, not on an islet across the water', () => {
    // Mainland to x 11, sea beyond, an islet at x 17–21 nearer the search than any free mainland shore: Docks went up
    // where no villager could walk, stood unbuilt all game and counted towards the Dock limit.
    const W = 40;
    const ascii = Array.from({ length: W }, (_, y) => Array.from({ length: W }, (_, x) => (x <= 11 || (x >= 17 && x <= 21 && y >= 14 && y <= 20) ? '.' : 'w')).join(''));
    const sim = Sim.create({
      seed: 4,
      map: { w: W, h: W, ascii },
      victory: 'none',
      players: [{ civ: 'greek', ai: 'moderate' }, { civ: 'persian' }],
      scenario: {
        buildings: [{ type: 'townCenter', owner: 1, tx: 3, ty: 16 }],
        units: [0, 1, 2].map((i) => ({ type: 'villager', owner: 1, x: 7.5, y: 15.5 + i })),
      },
    });
    const w = sim.world;
    w.players[1]!.res.set([1000, 1000, 500, 200]);
    const ai = new AiPlayer(1, 'moderate', 1, { civ: 'greek' });
    const view = new PlayerView(w, 1);
    const s = (ai as unknown as { snapshot(v: PlayerView, me: ReturnType<PlayerView['me']>): never }).snapshot(view, view.me());
    const cmds: Command[] = [];
    ai.build(s, cmds, 'dock', 19, 17, 0, 9, 1);
    const b = cmds.find((c) => c.t === 'build') as { tx: number; ty: number } | undefined;
    expect(b, 'a Dock placed').toBeDefined();
    expect(b!.tx + 1, 'on the mainland shore').toBeLessThan(14);
  });
});

describe('AI workers at the limit (M15.10 P71)', () => {
  it('idle fishing boats count with the villagers in the 70% (D69)', () => {
    // A winner at 50 kept 35 villagers + 8 idle fishing boats (no fish left) + 5 soldiers and couldn't finish the war.
    // (No fish here: the boats stand idle.)
    const W = 40;
    const ascii = Array.from({ length: W }, () => Array.from({ length: W }, (_, x) => (x < 26 ? '.' : 'w')).join(''));
    const sim = Sim.create({
      seed: 3,
      map: { w: W, h: W, ascii },
      victory: 'none',
      popCap: 50,
      players: [{ civ: 'greek', ai: 'hard' }, { civ: 'persian' }],
      scenario: {
        buildings: [{ type: 'townCenter', owner: 1, tx: 4, ty: 4 }, ...Array.from({ length: 12 }, (_, i) => ({ type: 'house', owner: 1, tx: 2 + (i % 6) * 3, ty: 30 + Math.floor(i / 6) * 3 }))],
        units: [
          ...Array.from({ length: 24 }, (_, i) => ({ type: 'villager', owner: 1, x: 10.5 + (i % 6), y: 10.5 + Math.floor(i / 6) })),
          ...Array.from({ length: 8 }, (_, i) => ({ type: 'fishingBoat', owner: 1, x: 30.5 + (i % 4) * 2, y: 10.5 + Math.floor(i / 4) * 2 })),
        ],
      },
    });
    const w = sim.world;
    w.players[1]!.res.set([5000, 5000, 5000, 5000]);
    for (const t of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(w, 1, t); // Hard wants 44 villagers here
    const ai = new AiPlayer(1, 'hard', 1, { civ: 'greek' });
    const view = new PlayerView(w, 1);
    for (let t = 0; t < 20 * 240; t++) {
      sim.step(ai.think(view).map((cmd) => ({ player: 1, cmd })));
      sim.drainEvents();
    }
    const vils = view.ownUnits().filter((u) => u.cls === 'villager').length;
    const boats = view.ownUnits().filter((u) => u.cls === 'fishingShip').length;
    expect(vils + boats).toBeLessThanOrEqual(35);
  }, 60_000);
});

describe('AI Docks under attack (M15.10 P73)', () => {
  it('a Dock does not go back down where raiders were just seen', () => {
    const W = 40;
    const ascii = Array.from({ length: W }, () => Array.from({ length: W }, (_, x) => (x <= 11 ? '.' : 'w')).join(''));
    const sim = Sim.create({
      seed: 4,
      map: { w: W, h: W, ascii },
      victory: 'none',
      players: [{ civ: 'greek', ai: 'hard' }, { civ: 'persian' }],
      scenario: { buildings: [{ type: 'townCenter', owner: 1, tx: 3, ty: 16 }], units: [0, 1, 2].map((i) => ({ type: 'villager', owner: 1, x: 7.5, y: 15.5 + i })) },
    });
    sim.world.players[1]!.res.set([1000, 1000, 500, 200]);
    const ai = new AiPlayer(1, 'hard', 1, { civ: 'greek' });
    const view = new PlayerView(sim.world, 1);
    // Raiders seen on the shore just east of the Town Center (as `flee` marks them).
    (ai.military as unknown as { tactics: { dangers: { x: number; y: number; until: number }[] } }).tactics.dangers.push({ x: 11, y: 17, until: 100000 });
    const s = (ai as unknown as { snapshot(v: PlayerView, me: ReturnType<PlayerView['me']>): never }).snapshot(view, view.me());
    const cmds: Command[] = [];
    ai.build(s, cmds, 'dock', 11, 17, 0, 12, 1);
    const b = cmds.find((c) => c.t === 'build') as { tx: number; ty: number } | undefined;
    expect(b, 'a Dock placed elsewhere on the shore').toBeDefined();
    expect(Math.hypot(b!.tx + 1.5 - 11, b!.ty + 1.5 - 17)).toBeGreaterThanOrEqual(7);
  });
});

describe('AI on a Deathmatch bank (M15.10 P54)', () => {
  it('ages up as soon as it can instead of booming villagers first', () => {
    // The Town Center's queue never emptied of villagers, and the age waits behind it: Hard reached the Tool Age at
    // 8:00 on 20,000 food and wood (the buildings it needs stood by 3:00).
    let early = 0;
    for (const seed of [71, 72, 73]) {
      const q = `type=continental&size=small&seed=${seed}&res=deathmatch&p=shang.1.hard,roman.2.hard,hittite.3.hard`;
      const s = new GameSession(skirmishConfig(setupFromQuery(new URLSearchParams(q))), 0);
      while (s.sim.tick < 6 * 1200) s.stepOnce();
      for (const p of [1, 2, 3]) if (new PlayerView(s.sim.world, p).me().age >= 2) early++;
    }
    expect(early, 'players in the Tool Age by 6:00, of 9').toBeGreaterThanOrEqual(7);
  }, 60_000);
});

describe('AI army at a raised population limit (M15.10 P78)', () => {
  it('raises its army with the limit instead of stopping at the default-50 numbers', () => {
    // At a 200 limit no computer passed 81 units: the army target (22 in the Iron Age) ignored the limit.
    const W = 50;
    const sim = Sim.create({
      seed: 7,
      map: { w: W, h: W },
      victory: 'none',
      popCap: 200,
      players: [{ civ: 'greek', ai: 'hard' }, { civ: 'persian' }],
      scenario: {
        buildings: [
          { type: 'townCenter', owner: 1, tx: 4, ty: 4 },
          { type: 'barracks', owner: 1, tx: 14, ty: 4 },
          { type: 'archeryRange', owner: 1, tx: 20, ty: 4 },
          { type: 'stable', owner: 1, tx: 26, ty: 4 },
          ...Array.from({ length: 24 }, (_, i) => ({ type: 'house', owner: 1, tx: 2 + (i % 12) * 3, ty: 40 + Math.floor(i / 12) * 3 })),
        ],
        units: Array.from({ length: 30 }, (_, i) => ({ type: 'villager', owner: 1, x: 10.5 + (i % 6), y: 14.5 + Math.floor(i / 6) })),
      },
    });
    const w = sim.world;
    w.players[1]!.res.set([20000, 20000, 20000, 5000]);
    for (const t of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(w, 1, t);
    const ai = new AiPlayer(1, 'hard', 1, { civ: 'greek' });
    const view = new PlayerView(w, 1);
    for (let t = 0; t < 20 * 60 * 8; t++) {
      sim.step(ai.think(view).map((cmd) => ({ player: 1, cmd })));
      sim.drainEvents();
    }
    const army = view.ownUnits().filter((u) => u.cls !== 'villager' && u.cls !== 'fishingShip').length;
    expect(army, 'soldiers after 8 minutes (40 at the default-50 target)').toBeGreaterThan(55);
  }, 60_000);
});
