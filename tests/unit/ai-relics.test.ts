import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { AiPlayer } from '../../src/ai/ai.ts';
import { PlayerView } from '../../src/sim/view/playerView.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';
import type { AiLevel, VictoryMode } from '../../src/sim/world.ts';

type U = { type: string; owner: number; x: number; y: number };
type B = { type: string; owner: number; tx: number; ty: number };

/** Player 1 is a computer on a revealed 48×48 map; player 2 (no AI) sits in the far corner. */
function scene(buildings: B[], units: U[], victory: VictoryMode = 'standard', level: AiLevel = 'moderate') {
  const sim = Sim.create({
    seed: 12,
    map: { w: 48, h: 48 },
    victory,
    revealMap: true,
    players: [{ civ: 'greek', ai: level }, { civ: 'persian' }],
    scenario: {
      buildings: [{ type: 'townCenter', owner: 1, tx: 4, ty: 4 }, { type: 'townCenter', owner: 2, tx: 41, ty: 41 }, ...buildings],
      units: [...[0, 1, 2, 3, 4, 5].map((i) => ({ type: 'villager', owner: 1, x: 5 + i, y: 9.5 })), { type: 'villager', owner: 2, x: 40.5, y: 45.5 }, ...units],
    },
  });
  const w = sim.world;
  const ai = new AiPlayer(1, level, 3, { civ: 'greek' });
  const view = new PlayerView(w, 1);
  const run = (ticks: number, until?: () => boolean) => {
    for (let t = 0; t < ticks && !until?.(); t++) {
      sim.step(ai.think(view).map((cmd) => ({ player: 1, cmd })));
      sim.drainEvents();
    }
  };
  const find = (type: string, owner?: number) => {
    const e = w.ents;
    for (let s = 0; s < e.top; s++) if (e.alive[s] && TYPES[e.type[s]!]!.id === type && (owner === undefined || e.owner[s] === owner)) return s;
    return -1;
  };
  return { sim, w, ai, run, find };
}

describe('AI Standard-victory play (M14.6)', () => {
  it('claims a free Artifact near home — but only in a Standard game', () => {
    const std = scene([{ type: 'artifact', owner: 0, tx: 18, ty: 14 }], []);
    const art = std.find('artifact');
    std.run(20 * 180, () => std.w.ents.owner[art] === 1);
    expect(std.w.ents.owner[art]).toBe(1);
    const con = scene([{ type: 'artifact', owner: 0, tx: 18, ty: 14 }], [], 'conquest');
    con.run(20 * 180);
    expect(con.w.ents.owner[con.find('artifact')]).toBe(0);
  });

  it("sends the army at an enemy Wonder once its clock runs", () => {
    const g = scene([{ type: 'wonder', owner: 2, tx: 30, ty: 30 }], Array.from({ length: 6 }, (_, i) => ({ type: 'axeman', owner: 1, x: 12.5 + i, y: 12.5 })));
    g.run(20 * 20);
    expect(g.w.countdowns.map((c) => c.kind)).toEqual(['wonder']);
    const wonder = g.w.ents.handleOf(g.find('wonder'));
    const e = g.w.ents;
    let on = 0;
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === 1 && g.w.orders[s]?.[0]?.k === 'attack' && (g.w.orders[s]![0] as { h: number }).h === wonder) on++;
    expect(on).toBeGreaterThanOrEqual(4);
  });

  it('takes back one of a set of relics an enemy holds', () => {
    const g = scene(
      [
        { type: 'ruins', owner: 2, tx: 24, ty: 20 },
        { type: 'ruins', owner: 2, tx: 34, ty: 12 },
      ],
      Array.from({ length: 6 }, (_, i) => ({ type: 'axeman', owner: 1, x: 12.5 + i, y: 12.5 })),
    );
    g.run(20 * 180, () => g.w.countdowns.length === 0 && g.w.tick > 40);
    expect(g.w.countdowns).toEqual([]);
    const e = g.w.ents;
    let ours = 0;
    for (let s = 0; s < e.top; s++) if (e.alive[s] && TYPES[e.type[s]!]!.id === 'ruins' && e.owner[s] === 1) ours++;
    expect(ours).toBeGreaterThanOrEqual(1);
  });

  it('Hard, rich in the Iron Age, lays out a Wonder; Moderate does not', () => {
    for (const [level, want] of [['hard', true], ['moderate', false]] as const) {
      const g = scene([], [], 'standard', level);
      for (const t of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(g.w, 1, t);
      g.w.players[1]!.res.set([3000, 3000, 3000, 3000]);
      g.run(20 * 30, () => g.find('wonder', 1) >= 0);
      expect(g.find('wonder', 1) >= 0, level).toBe(want);
    }
  });
});
