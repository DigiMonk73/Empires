import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { generateMap, type LandMapType } from '../../src/sim/mapgen/generate.ts';
import { RESOURCE_KINDS } from '../../src/sim/rules/registry.ts';
import { EKind } from '../../src/sim/core/entities.ts';
import type { MapSizeId } from '../../src/data/setup.ts';

const CASES: [LandMapType, MapSizeId, number][] = [
  ['continental', 'tiny', 2],
  ['inland', 'small', 3],
  ['continental', 'medium', 4],
  ['inland', 'large', 6],
  ['continental', 'gigantic', 8],
];

/** Resources within `r` tiles of each player's Town Center, by kind. */
function near(sim: Sim, starts: [number, number][], r: number): Record<string, number>[] {
  const w = sim.world;
  return starts.map(([sx, sy]) => {
    const tot: Record<string, number> = {};
    for (let i = 0; i < w.res.count; i++) {
      const dx = w.res.tx[i]! + 0.5 - (sx + 1.5);
      const dy = w.res.ty[i]! + 0.5 - (sy + 1.5);
      if (dx * dx + dy * dy > r * r) continue;
      const id = RESOURCE_KINDS[w.res.kind[i]!]!.id;
      tot[id] = (tot[id] ?? 0) + w.res.amount[i]!;
    }
    return tot;
  });
}

describe('map generation (econ:8)', () => {
  for (const [type, size, n] of CASES) {
    it(`${type} ${size} for ${n}: valid starts, fair near resources, everyone reachable`, () => {
      const m = generateMap({ seed: 11, type, size, players: Array.from({ length: n }, (_, i) => ({ civ: i % 2 ? 'persian' : 'greek' })) });
      const sim = Sim.create(m);
      const w = sim.world;
      // Every player: one Town Center and three villagers standing on walkable ground.
      for (let p = 1; p <= n; p++) {
        let tcs = 0;
        let vills = 0;
        for (let s = 0; s < w.ents.top; s++) {
          if (!w.ents.alive[s] || w.ents.owner[s] !== p) continue;
          if (w.ents.kind[s] === EKind.building) tcs++;
          else {
            vills++;
            expect(w.map.passable(Math.floor(w.ents.x[s]!), Math.floor(w.ents.y[s]!), 1)).toBe(true);
          }
        }
        expect([tcs, vills]).toEqual([1, 3]);
      }
      // Fairness: the personal zone (≤ 20 tiles: berries, near gold/stone) is within ±15% for every player.
      const zone = near(sim, m.starts, 20);
      for (const kind of ['berryBush', 'goldMine', 'stoneMine']) {
        const v = zone.map((z) => z[kind] ?? 0);
        const hi = Math.max(...v);
        const lo = Math.min(...v);
        expect(lo, `${kind} ${v.join('/')}`).toBeGreaterThan(0);
        expect(hi / lo, `${kind} ${v.join('/')}`).toBeLessThanOrEqual(1.15);
      }
      // Every player has wood within 22 tiles.
      for (const z of near(sim, m.starts, 22)) expect((z.forestTree ?? 0) + (z.tree ?? 0)).toBeGreaterThan(1000);
      // Every start can walk to every other start (one land region).
      const labels = w.pathing.regions.labels(1);
      const region = ([x, y]: [number, number]) => labels[(y + 4) * w.map.w + x + 4];
      const r0 = region(m.starts[0]!);
      for (const st of m.starts) expect(region(st)).toBe(r0);
    });
  }

  it('is deterministic and seed-sensitive', () => {
    const a = generateMap({ seed: 3, type: 'inland', size: 'small', players: [{ civ: 'greek' }, { civ: 'egyptian' }] });
    const b = generateMap({ seed: 3, type: 'inland', size: 'small', players: [{ civ: 'greek' }, { civ: 'egyptian' }] });
    const c = generateMap({ seed: 4, type: 'inland', size: 'small', players: [{ civ: 'greek' }, { civ: 'egyptian' }] });
    expect(b.map.ascii).toEqual(a.map.ascii);
    expect(b.scenario).toEqual(a.scenario);
    expect(c.map.ascii).not.toEqual(a.map.ascii);
  });
});
