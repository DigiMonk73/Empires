import { describe, expect, it } from 'vitest';
import { runMatch } from '../../src/game/aiMatch.ts';
import { AiPlayer } from '../../src/ai/ai.ts';
import { UNIT_BY_ID } from '../../src/data/index.ts';
import { Sim } from '../../src/sim/index.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { PlayerView } from '../../src/sim/view/playerView.ts';
import { generateMap } from '../../src/sim/mapgen/generate.ts';

describe('AI v1 economy (M6.4)', () => {
  it('Moderate AIs boom to the Tool Age by 12:00 with villagers kept busy', () => {
    const r = runMatch({ seed: 3, type: 'continental', size: 'small', levels: ['moderate', 'moderate'], minutes: 12, peaceful: true });
    for (const ages of r.ageTick) {
      expect(ages[2]).toBeGreaterThan(0);
      expect(ages[2]).toBeLessThanOrEqual(12 * 60 * 20);
    }
    for (const idle of r.idlePct) expect(idle).toBeLessThan(5);
    const last = r.samples[r.samples.length - 1]!;
    for (const p of last.players) expect(p.villagers).toBeGreaterThanOrEqual(18);
  });

  it('is deterministic', () => {
    const a = runMatch({ seed: 5, levels: ['moderate', 'easy'], minutes: 4 });
    const b = runMatch({ seed: 5, levels: ['moderate', 'easy'], minutes: 4 });
    expect(b.hash).toBe(a.hash);
  });
});

describe('AI v1 military (M6.5)', () => {
  it('Moderate vs Moderate is decided by conquest', () => {
    // Within the hour the Done definition allows for an even 1v1 (25–60 min); the suite gates 75% of 1v1s decided
    // within 45 min. M13.2 (rush odds per level, upgrades) redrew the plans: seeds 1–10 are decided in 9 of 10
    // (median ~35 min); seed 5, used until then, is now the one open game — seed 1 (≈36 min) is typical.
    const r = runMatch({ seed: 1, type: 'continental', size: 'tiny', levels: ['moderate', 'moderate'], minutes: 60 });
    expect(r.winner).not.toBeNull();
    expect(r.winner!.length).toBe(1);
  });
});

describe('AI in the Iron Age (M7.4)', () => {
  it('researches Iron-age upgrades and fields Iron-age units when it has the buildings and the bank', () => {
    const blds = ['townCenter', 'barracks', 'archeryRange', 'stable', 'academy', 'siegeWorkshop', 'governmentCenter', 'market', 'granary', 'storagePit'];
    const buildings = [
      ...blds.map((type, i) => ({ type, owner: 1, tx: 3 + (i % 4) * 6, ty: 3 + Math.floor(i / 4) * 6 })),
      ...Array.from({ length: 12 }, (_, i) => ({ type: 'house', owner: 1, tx: 3 + i * 3, ty: 24 })),
      { type: 'townCenter', owner: 2, tx: 52, ty: 52 },
    ];
    const units = Array.from({ length: 12 }, (_, i) => ({ type: 'villager', owner: 1, x: 10.5 + (i % 4), y: 20.5 + Math.floor(i / 4) }));
    const sim = Sim.create({ seed: 8, map: { w: 60, h: 60 }, players: [{ civ: 'roman', ai: 'hard' }, { civ: 'greek' }], startingResources: 'deathmatch', victory: 'none', scenario: { buildings, units } });
    const w = sim.world;
    for (const a of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(w, 1, a);
    const ai = new AiPlayer(1, 'hard', 8 * 31);
    const view = new PlayerView(w, 1);
    for (let t = 0; t < 20 * 60 * 8; t++) {
      sim.step(ai.think(view).map((cmd) => ({ player: 1, cmd })));
      sim.drainEvents();
    }
    const iron = new Set<string>();
    for (let s = 0; s < w.ents.top; s++) {
      if (!w.ents.alive[s] || w.ents.owner[s] !== 1) continue;
      const u = UNIT_BY_ID.get(TYPES[w.ents.type[s]!]!.id);
      if (u && u.age === 4 && !u.tags.includes('ship')) iron.add(u.id);
    }
    const techs = w.players[1]!.techs;
    expect(techs.filter((t) => ['longSword', 'heavyCavalry', 'phalanx', 'catapult', 'heavyHorseArcher'].includes(t)).length).toBeGreaterThanOrEqual(2);
    expect(iron.size).toBeGreaterThanOrEqual(2);
  });
});

describe('AI at sea: economy (M8.8a)', () => {
  it('on a Small Islands start it builds a Dock early and keeps a fishing fleet at work', () => {
    const cfg = generateMap({ seed: 3, type: 'smallIslands', size: 'small', players: [{ civ: 'greek' }, { civ: 'egyptian' }] });
    const sim = Sim.create({ ...cfg, players: cfg.players.map((p) => ({ ...p, ai: 'moderate' as const })) });
    const w = sim.world;
    const ais = [1, 2].map((p) => new AiPlayer(p, 'moderate', 3 * 31 + p, { peaceful: true }));
    const views = [1, 2].map((p) => new PlayerView(w, p));
    let dockAt = 0;
    for (let t = 1; t <= 20 * 60 * 12; t++) {
      sim.step(ais.flatMap((ai, i) => ai.think(views[i]!).map((cmd) => ({ player: i + 1, cmd }))));
      sim.drainEvents();
      if (!dockAt && views[0]!.ownBuildings().some((b) => b.type === 'dock' && b.done)) dockAt = t;
    }
    expect(dockAt).toBeGreaterThan(0);
    expect(dockAt).toBeLessThan(20 * 60 * 7); // Stone Age
    const boats = views[0]!.ownUnits().filter((u) => u.cls === 'fishingShip');
    expect(boats.length).toBeGreaterThanOrEqual(6);
    expect(boats.filter((b) => b.order === 'gather').length).toBeGreaterThanOrEqual(boats.length - 2);
  }, 30_000); // a long simulated game
});

describe('AI at sea: warships (M8.8b)', () => {
  it('island AIs keep a home guard on land and put their wood into a fleet that fights at sea', () => {
    const cfg = generateMap({ seed: 3, type: 'smallIslands', size: 'small', players: [{ civ: 'greek' }, { civ: 'egyptian' }] });
    const sim = Sim.create({ ...cfg, players: cfg.players.map((p) => ({ ...p, ai: 'hard' as const })) });
    const w = sim.world;
    const ais = [1, 2].map((p) => new AiPlayer(p, 'hard', 3 * 31 + p, {}));
    const views = [1, 2].map((p) => new PlayerView(w, p));
    const peak = [0, 0];
    let maxLand = 0; // before either knows where the other lives (then the army grows for the invasion)
    let sunk = 0;
    for (let t = 1; t <= 20 * 60 * 22; t++) {
      sim.step(ais.flatMap((ai, i) => ai.think(views[i]!).map((cmd) => ({ player: i + 1, cmd }))));
      for (const ev of sim.drainEvents()) if (ev.t === 'died' && TYPES[ev.type]!.unit?.tags.includes('ship')) sunk++;
      if (t % 200) continue;
      const scouting = ais.every((a) => !a.naval.invading);
      views.forEach((v, i) => {
        const u = v.ownUnits();
        peak[i] = Math.max(peak[i]!, u.filter((x) => x.cls === 'warship').length);
        if (scouting) maxLand = Math.max(maxLand, u.filter((x) => !['villager', 'fishingShip', 'warship', 'transport', 'tradeShip', 'priest'].includes(x.cls)).length);
      });
    }
    // (Fleets stay small once an invasion is on — three escorts — so each side fields at least one.)
    expect(peak[0]).toBeGreaterThanOrEqual(1);
    expect(peak[1]).toBeGreaterThanOrEqual(1);
    expect(maxLand).toBeLessThanOrEqual(8); // a guard of 4 (+ a few answering a landing)
    expect(sunk).toBeGreaterThan(0); // they met at sea
  }, 30_000); // a long simulated game
});

describe('AI at sea: invasions (M8.8c)', () => {
  it('once the enemy is found across the water, transports land an army on its island', () => {
    const cfg = generateMap({ seed: 3, type: 'smallIslands', size: 'small', players: [{ civ: 'greek' }, { civ: 'egyptian' }] });
    const sim = Sim.create({ ...cfg, players: cfg.players.map((p) => ({ ...p, ai: 'hard' as const })) });
    const w = sim.world;
    const ais = [1, 2].map((p) => new AiPlayer(p, 'hard', 3 * 31 + p, {}));
    const views = [1, 2].map((p) => new PlayerView(w, p));
    // Each player's island: the first land region found round its Town Center (one fixed tile can be a tree).
    const landNear = (x: number, y: number): number => {
      for (let r = 0; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const l = views[0]!.region(1, x + dx, y + dy);
        if (l) return l;
      }
      return 0;
    };
    // (Region labels are renumbered as trees fall and buildings rise: look them up at each check.)
    const islands = () => cfg.starts.map(([x, y]) => landNear(x + 4, y + 1));
    const island0 = islands();
    let landed = 0;
    for (let t = 1; t <= 20 * 60 * 40 && !landed; t++) {
      sim.step(ais.flatMap((ai, i) => ai.think(views[i]!).map((cmd) => ({ player: i + 1, cmd }))));
      sim.drainEvents();
      if (t % 100) continue;
      const island = islands();
      views.forEach((v, i) => {
        for (const u of v.ownUnits()) if (u.cls !== 'villager' && v.region(1, Math.floor(u.x), Math.floor(u.y)) === island[1 - i]) landed = t;
      });
    }
    expect(island0[0]).not.toBe(island0[1]);
    expect(landed).toBeGreaterThan(0);
  }, 30_000); // a long simulated game
});
