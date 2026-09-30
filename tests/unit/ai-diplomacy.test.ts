import { describe, expect, it } from 'vitest';
import { AiPlayer } from '../../src/ai/ai.ts';
import { NEUTRAL_PATIENCE } from '../../src/ai/diplomacy.ts';
import { Sim } from '../../src/sim/index.ts';
import { ALLY, ENEMY, NEUTRAL, stanceOf } from '../../src/sim/rules/diplomacy.ts';
import { PlayerView } from '../../src/sim/view/playerView.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';
import type { AiLevel } from '../../src/data/setup.ts';
import type { PlayerCommand } from '../../src/sim/commands/types.ts';

/** A free-for-all: a human (P1, with a Market) and computers, each on its own team. */
function ffa(ai: (AiLevel | undefined)[]) {
  const sim = Sim.create({
    seed: 4,
    map: { w: 64, h: 64 },
    victory: 'none',
    players: ai.map((lv, i) => ({ civ: 'greek', team: i + 1, ...(lv ? { ai: lv } : {}) })),
    scenario: {
      buildings: [
        ...ai.map((_, i) => ({ type: 'townCenter', owner: i + 1, tx: 6 + (i % 2) * 48, ty: 6 + Math.floor(i / 2) * 48 })),
        { type: 'market', owner: 1, tx: 12, ty: 6 },
      ],
      units: [{ type: 'bowman', owner: 1, x: 30.5, y: 30.5 }, ...ai.map((_, i) => ({ type: 'villager', owner: i + 1, x: 30.5 + (i ? 2 : 0), y: 32.5 + i }))],
    },
  });
  const ais = ai.map((lv, i) => (lv ? new AiPlayer(i + 1, lv, 9 + i) : null));
  const views = ai.map((_, i) => new PlayerView(sim.world, i + 1));
  const think = (extra: PlayerCommand[] = []) => {
    const cmds: PlayerCommand[] = [...extra];
    ais.forEach((a, i) => {
      if (!a) return;
      // Every level thinks at least every 40 ticks: run a full cycle.
      for (const cmd of a.think(views[i]!)) cmds.push({ player: i + 1, cmd });
    });
    sim.step(cmds);
  };
  const cycle = (n = 45) => {
    for (let t = 0; t < n; t++) think();
  };
  return { sim, w: sim.world, think, cycle };
}

describe("the computers' diplomacy toward a human (M13.8)", () => {
  it('a free-for-all: computers ally with each other; two of three start hostile to the human, one neutral', () => {
    const { w, cycle } = ffa([undefined, 'moderate', 'moderate', 'moderate']);
    cycle();
    expect([stanceOf(w, 2, 3), stanceOf(w, 3, 4), stanceOf(w, 4, 2)]).toEqual([ALLY, ALLY, ALLY]);
    expect([stanceOf(w, 2, 1), stanceOf(w, 3, 1), stanceOf(w, 4, 1)]).toEqual([ENEMY, ENEMY, NEUTRAL]);
  });

  it('a neutral computer turns hostile when the human attacks it', () => {
    const { w, cycle, think } = ffa([undefined, 'moderate', 'moderate', 'moderate']);
    cycle();
    let bow = -1;
    let vil4 = -1;
    for (let s = 0; s < w.ents.top; s++) {
      if (!w.ents.alive[s] || w.ents.kind[s] !== 1) continue;
      if (w.ents.owner[s] === 1 && TYPES[w.ents.type[s]!]!.id === 'bowman') bow = w.ents.handleOf(s);
      if (w.ents.owner[s] === 4) vil4 = w.ents.handleOf(s);
    }
    think([{ player: 1, cmd: { t: 'act', ids: [bow], h: vil4 } }]);
    for (let t = 0; t < 20 * 60 && stanceOf(w, 4, 1) === NEUTRAL; t++) think();
    expect(w.players[4]!.tally.hitsBy[1]).toBeGreaterThanOrEqual(2);
    expect(stanceOf(w, 4, 1)).toBe(ENEMY);
  });

  it('after 12 minutes a neutral computer turns hostile unless the human has paid ~1000 tribute', () => {
    const unpaid = ffa([undefined, 'moderate', 'moderate', 'moderate']);
    unpaid.cycle();
    unpaid.w.tick = NEUTRAL_PATIENCE;
    unpaid.cycle();
    expect(stanceOf(unpaid.w, 4, 1)).toBe(ENEMY);

    const paid = ffa([undefined, 'moderate', 'moderate', 'moderate']);
    paid.cycle();
    paid.w.players[1]!.res.set([3000, 3000, 3000, 3000]);
    paid.think([{ player: 1, cmd: { t: 'tribute', to: 4, res: 2, amount: 1000 } }]);
    paid.w.tick = NEUTRAL_PATIENCE;
    paid.cycle();
    expect(paid.w.players[4]!.tally.tributeFrom[1]).toBe(1000);
    expect(stanceOf(paid.w, 4, 1)).toBe(NEUTRAL);
  });

  it('computers alone (the AI suite) and team games are left as set up', () => {
    const bots = ffa(['moderate', 'moderate', 'moderate']);
    bots.cycle();
    expect([stanceOf(bots.w, 1, 2), stanceOf(bots.w, 2, 3)]).toEqual([ENEMY, ENEMY]);
  });
});
