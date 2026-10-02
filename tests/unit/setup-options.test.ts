import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import type { SimConfig } from '../../src/sim/world.ts';
import { CIV_BY_ID, TECHS } from '../../src/data/index.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';
import { DEFAULT_SETUP, setupFromQuery, setupToQuery, skirmishConfig } from '../../src/game/skirmish.ts';
import { SCORE_TARGETS, scoreTargetsFor } from '../../src/data/setup.ts';
import { clockRows, winLine } from '../../src/ui/clocks.ts';
import { AiPlayer } from '../../src/ai/ai.ts';
import { PlayerView } from '../../src/sim/view/playerView.ts';

/** Two players: player 1 with four villagers, player 2 with one (so player 1 leads on score). */
function game(extra: Partial<SimConfig>) {
  const sim = Sim.create({
    seed: 8,
    map: { w: 32, h: 32 },
    players: [{ civ: 'greek' }, { civ: 'persian' }],
    scenario: {
      buildings: [
        { type: 'townCenter', owner: 1, tx: 3, ty: 3 },
        { type: 'townCenter', owner: 2, tx: 26, ty: 26 },
      ],
      units: [
        ...[0, 1, 2, 3].map((i) => ({ type: 'villager', owner: 1, x: 8.5 + i, y: 8.5 })),
        { type: 'clubman', owner: 1, x: 10.5, y: 12.5 },
        { type: 'villager', owner: 2, x: 24.5, y: 24.5 },
      ],
    },
    ...extra,
  });
  return sim;
}

describe('setup options (M14.3, econ:7)', () => {
  it('a later starting age researches the ages before the first tick, silently and with no first-to bonus', () => {
    const sim = game({ startingAge: 'bronze' });
    const p = sim.world.players[1]!;
    expect(p.stats.age).toBe(3);
    expect(p.techs).toEqual(['toolAge', 'bronzeAge']);
    expect(sim.drainEvents()).toEqual([]);
    expect(p.tally.ageTick).toEqual([0, 0, 0, 0, 0]);
    // Units already on the map take the age's upgrades (none here: the clubman stays a clubman until Battle Axe).
    expect(game({}).world.players[1]!.stats.age).toBe(1);
  });

  it('Post-Iron researches every technology the civilization has', () => {
    const sim = game({ startingAge: 'postIron' });
    for (const p of [1, 2]) {
      const pl = sim.world.players[p]!;
      expect(pl.stats.age).toBe(4);
      const disabled = CIV_BY_ID.get(pl.civ)!.disabled.techs;
      const left = TECHS.filter((t) => !pl.techs.includes(t.id) && !disabled.includes(t.id) && (t.requires ?? []).every((r) => pl.techs.includes(r)));
      expect(left.map((t) => t.id), pl.civ).toEqual([]);
      expect(pl.techs.length).toBeGreaterThan(50);
    }
    // The clubman became the top of its line.
    const e = sim.world.ents;
    const types = new Set<string>();
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === 1 && e.kind[s] === 1) types.add(TYPES[e.type[s]!]!.id);
    expect([...types].some((t) => t !== 'clubman' && t !== 'villager')).toBe(true);
  });

  it('Score: the first to the target wins; Time Limit: the highest score when time is up', () => {
    const s = game({ victory: 'score', scoreTarget: 5 });
    s.step([]);
    expect(s.world.gameOver).toMatchObject({ winners: [1], how: 'score', tick: 0 });
    const far = game({ victory: 'score', scoreTarget: 5000 });
    for (let i = 0; i < 100; i++) far.step([]);
    expect(far.world.gameOver).toBeNull();
    const t = game({ victory: 'time', timeLimit: 1 });
    expect(t.world.timeLimitTicks).toBe(1200);
    expect(clockRows(t.world, 1)[0]!.text).toBe('Time left · 1:00');
    for (let i = 0; i < 1200; i++) t.step([]);
    expect(t.world.gameOver).toBeNull();
    t.step([]);
    expect(t.world.gameOver).toMatchObject({ winners: [1], how: 'time', tick: 1200 });
    expect(winLine('time', false, 1, 2)).toBe('Player 1 had the highest score when time ran out.');
    expect(winLine('score', true, 1, 1)).toBe('You reached the target score first.');
  });

  it('the skirmish setup carries victory, target, limit, age and population through the URL into the sim', () => {
    const s = { ...DEFAULT_SETUP, victory: 'time' as const, timeLimit: 90, startingAge: 'iron' as const, popCap: 150 };
    const back = setupFromQuery(new URLSearchParams(setupToQuery(s)));
    expect(back).toEqual(s);
    const cfg = skirmishConfig(back);
    expect(cfg).toMatchObject({ victory: 'time', timeLimit: 90, startingAge: 'iron', popCap: 150 });
    expect(cfg.scenario!.buildings!.some((b) => b.type === 'ruins')).toBe(false); // relics only with Standard
    expect(Sim.create(cfg).world.popLimit).toBe(150);
    // Unknown values fall back to the defaults.
    const bad = setupFromQuery(new URLSearchParams('scenario=skirmish&win=bogus&age=stone&pop=33&target=7'));
    expect([bad.victory, bad.startingAge, bad.popCap, bad.scoreTarget]).toEqual(['standard', 'default', 50, 1000]);
  });

  it('a Post-Iron start offers no Score target its starting techs already reach (M15.10 P9)', () => {
    // Every tech researched scores 231–290 at the first tick: Score 250 was won before anyone moved.
    expect(scoreTargetsFor('postIron')[0]).toBeGreaterThan(290);
    expect(scoreTargetsFor('default')).toEqual(SCORE_TARGETS);
    for (const [fullTech, reveal] of [[false, false], [true, true]] as const) {
      const setup = { ...DEFAULT_SETUP, victory: 'score' as const, scoreTarget: 250, startingAge: 'postIron' as const, fullTech, reveal };
      const sim = Sim.create(skirmishConfig(setup));
      for (let t = 0; t < 20 * 60; t++) sim.step([]);
      expect(sim.world.gameOver, `FTT ${fullTech}, reveal ${reveal}`).toBeNull();
      expect(sim.world.scoreTarget).toBe(scoreTargetsFor('postIron')[0]);
    }
  });

  it('Nomad (D60): no Town Centers, three villagers each; a computer founds one within two minutes', () => {
    const cfg = skirmishConfig({ ...DEFAULT_SETUP, startingAge: 'nomad', players: [{ civ: 'greek', team: 1, controller: 'moderate' }, { civ: 'persian', team: 2, controller: 'moderate' }] });
    expect(cfg.scenario!.buildings!.filter((b) => b.type === 'townCenter')).toEqual([]);
    expect(cfg.scenario!.units!.filter((u) => u.type === 'villager' && u.owner === 1).length).toBe(3);
    const sim = Sim.create(cfg);
    const ai = new AiPlayer(1, 'moderate', 1, { civ: 'greek' });
    const view = new PlayerView(sim.world, 1);
    const hasTc = () => view.ownBuildings().some((b) => b.type === 'townCenter' && b.done);
    for (let t = 0; t < 20 * 120 && !hasTc(); t++) sim.step(ai.think(view).map((cmd) => ({ player: 1, cmd })));
    expect(hasTc()).toBe(true);
  });
});
