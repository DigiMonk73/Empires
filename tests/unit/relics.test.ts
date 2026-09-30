import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { computeScores } from '../../src/sim/rules/score.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';
import { GEN_MAP_TYPES, generateMap } from '../../src/sim/mapgen/generate.ts';
import { ALLY } from '../../src/sim/rules/diplomacy.ts';

type U = { type: string; owner: number; x: number; y: number };
type B = { type: string; owner: number; tx: number; ty: number };

/** Ruins at tiles (10..11, 10..11) — centre (11, 11) — and an Artifact at (20, 10) — centre (20.5, 10.5). */
function game(units: U[], relics: B[] = [{ type: 'ruins', owner: 0, tx: 10, ty: 10 }, { type: 'artifact', owner: 0, tx: 20, ty: 10 }], victory: 'conquest' | 'none' = 'none', players = 2) {
  const sim = Sim.create({
    seed: 5,
    victory,
    map: { w: 32, h: 32 },
    players: Array.from({ length: players }, (_, i) => ({ civ: i % 2 ? 'persian' : 'greek' })),
    scenario: { units, buildings: relics },
  });
  const w = sim.world;
  const e = w.ents;
  const events: { t: string; from?: number; to?: number }[] = [];
  const step = (n: number, cmds: Parameters<Sim['step']>[0] = []) => {
    for (let i = 0; i < n; i++) {
      sim.step(i === 0 ? cmds : []);
      events.push(...(sim.drainEvents() as { t: string }[]));
    }
  };
  const find = (type: string, owner?: number) => {
    for (let s = 0; s < e.top; s++) if (e.alive[s] && TYPES[e.type[s]!]!.id === type && (owner === undefined || e.owner[s] === owner)) return e.handleOf(s);
    throw new Error(type);
  };
  const ownerOf = (h: number) => e.owner[e.slotOf(h)]!;
  return { sim, w, e, events, step, find, ownerOf };
}

describe('Ruins and Artifacts (M14.1, econ:7)', () => {
  it('a unit beside a free one claims it within a second; a unit further off does not', () => {
    const g = game([
      { type: 'scout', owner: 1, x: 12.8, y: 11 }, // 0.8 tiles from the Ruins' edge
      { type: 'clubman', owner: 2, x: 20.5, y: 13.5 }, // 2.5 tiles below the Artifact: out of reach
    ]);
    const ruins = g.find('ruins');
    const art = g.find('artifact');
    g.step(21);
    expect(g.ownerOf(ruins)).toBe(1);
    expect(g.ownerOf(art)).toBe(0);
    expect(g.events.filter((x) => x.t === 'captured')).toEqual([{ t: 'captured', h: ruins, type: TYPES.findIndex((t) => t.id === 'ruins'), from: 0, to: 1, x: 11, y: 11 }]);
  });

  it('changes hands only while none of its owner’s units stand by it', () => {
    const g = game([
      { type: 'villager', owner: 1, x: 12.5, y: 11 },
      { type: 'villager', owner: 2, x: 9.5, y: 11 },
    ], [{ type: 'ruins', owner: 1, tx: 10, ty: 10 }]);
    const ruins = g.find('ruins');
    g.step(60);
    expect(g.ownerOf(ruins)).toBe(1); // guarded
    // The guard walks away: the enemy villager takes it.
    g.step(1, [{ player: 1, cmd: { t: 'move', ids: [g.find('villager', 1)], x: 25.5, y: 25.5 } }]);
    g.step(20 * 12);
    expect(g.ownerOf(ruins)).toBe(2);
  });

  it('an ally’s unit guards it too; two enemies beside a free one leave it free', () => {
    const g = game(
      [
        { type: 'villager', owner: 3, x: 12.5, y: 11 }, // ally of 1
        { type: 'villager', owner: 2, x: 9.5, y: 11 },
        { type: 'villager', owner: 1, x: 19.5, y: 12 }, // 1 and 2 both beside the free Artifact
        { type: 'villager', owner: 2, x: 21.5, y: 12 },
      ],
      [{ type: 'ruins', owner: 1, tx: 10, ty: 10 }, { type: 'artifact', owner: 0, tx: 20, ty: 10 }],
      'none',
      3,
    );
    // Players 1 and 3 allied (both ways); 2 is everyone's enemy.
    g.w.players[1]!.stance[3] = ALLY;
    g.w.players[3]!.stance[1] = ALLY;
    g.step(60);
    expect(g.ownerOf(g.find('ruins'))).toBe(1);
    expect(g.ownerOf(g.find('artifact'))).toBe(0);
  });

  it('cannot be attacked or converted, and does not count for conquest', () => {
    // Player 1 holds only relics: conquest defeats them at the first check; player 2's attack does nothing.
    const g = game(
      [{ type: 'clubman', owner: 2, x: 9.2, y: 11 }],
      [{ type: 'ruins', owner: 1, tx: 10, ty: 10 }, { type: 'artifact', owner: 1, tx: 20, ty: 20 }],
      'conquest',
    );
    const ruins = g.find('ruins');
    const hp = g.e.hp[g.e.slotOf(ruins)]!;
    g.step(1, [{ player: 2, cmd: { t: 'act', ids: [g.find('clubman', 2)], h: ruins } }]);
    g.step(40);
    expect(g.e.hp[g.e.slotOf(ruins)]).toBe(hp);
    expect(g.w.orders[g.e.slotOf(g.find('clubman', 2))]?.[0]?.k).not.toBe('attack');
    expect(g.w.players[1]!.defeated).not.toBeNull();
    expect(g.ownerOf(ruins)).toBe(2); // and nobody guards them any more
  });

  it('scores 10 per object held and 50 for a whole set of one kind', () => {
    const relics: B[] = [
      { type: 'ruins', owner: 1, tx: 4, ty: 4 },
      { type: 'ruins', owner: 1, tx: 8, ty: 4 },
      { type: 'artifact', owner: 1, tx: 12, ty: 4 },
      { type: 'artifact', owner: 2, tx: 16, ty: 4 },
    ];
    const g = game([], relics);
    const lines = computeScores(g.w);
    const [p1, p2] = [lines.find((l) => l.player === 1)!, lines.find((l) => l.player === 2)!];
    expect(p1.religion).toBe(30 + 50); // three held, all Ruins
    expect(p2.religion).toBe(10);
  });

  it('random maps: 5 Ruins and 5 Artifacts with the option, far from every start; none without it', () => {
    const civs = ['greek', 'egyptian', 'persian', 'roman', 'hittite', 'shang', 'yamato', 'minoan'];
    const relicsOf = (m: ReturnType<typeof generateMap>) => m.scenario!.buildings!.filter((b) => b.type === 'ruins' || b.type === 'artifact');
    const dMin = (m: ReturnType<typeof generateMap>, r: B) => Math.min(...m.starts.map(([sx, sy]) => Math.hypot(r.tx - sx - 1.5, r.ty - sy - 1.5)));
    // Every map type and a crowded and a roomy size: always 5 + 5, unowned (on an islet where land runs out).
    for (const type of GEN_MAP_TYPES) {
      for (const [size, n] of [['tiny', 8], ['medium', 2]] as const) {
        const m = generateMap({ seed: 21, type, size, players: civs.slice(0, n).map((civ) => ({ civ })), relics: true });
        const rel = relicsOf(m);
        expect(rel.filter((b) => b.type === 'ruins').length, `${type} ${size}`).toBe(5);
        expect(rel.filter((b) => b.type === 'artifact').length, `${type} ${size}`).toBe(5);
        for (const r of rel) {
          expect(r.owner).toBe(0);
          expect(dMin(m, r), `${type} ${size}`).toBeGreaterThanOrEqual(6);
        }
      }
    }
    // Land maps with room: ≥ 18 tiles from every start, and the rest of the map is the same without them.
    for (const [type, size] of [['continental', 'small'], ['inland', 'small']] as const) {
      const players = civs.slice(0, 4).map((civ) => ({ civ }));
      const m = generateMap({ seed: 21, type, size, players, relics: true });
      for (const r of relicsOf(m)) expect(dMin(m, r), type).toBeGreaterThanOrEqual(18);
      const plain = generateMap({ seed: 21, type, size, players });
      expect(relicsOf(plain)).toEqual([]);
      expect(plain.map.ascii).toEqual(m.map.ascii);
      expect(plain.scenario!.units).toEqual(m.scenario!.units);
    }
  });
});
