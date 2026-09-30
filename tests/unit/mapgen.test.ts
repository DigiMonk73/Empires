import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { generateMap, type GenMapType } from '../../src/sim/mapgen/generate.ts';
import { RESOURCE_KINDS } from '../../src/sim/rules/registry.ts';
import { EKind } from '../../src/sim/core/entities.ts';
import type { MapSizeId } from '../../src/data/setup.ts';

const CASES: [GenMapType, MapSizeId, number][] = [
  ['continental', 'tiny', 2],
  ['inland', 'small', 3],
  ['continental', 'medium', 4],
  ['inland', 'large', 6],
  ['continental', 'gigantic', 8],
  // Water maps (M8.7).
  ['coastal', 'tiny', 2],
  ['mediterranean', 'small', 3],
  ['narrows', 'medium', 4],
  ['smallIslands', 'small', 4],
  ['largeIslands', 'medium', 2],
  ['smallIslands', 'huge', 8],
  // Hills (M10.2).
  ['highland', 'small', 3],
  ['hillCountry', 'medium', 4],
  ['highland', 'large', 6],
];
/** Types whose players can all walk to each other; on the others they need boats. */
const WALKABLE = new Set<GenMapType>(['continental', 'inland', 'coastal', 'mediterranean', 'highland', 'hillCountry']);

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
      // Land maps: every start can walk to every other. Water maps: no one can (each on their own land), but a boat
      // from any start's shore reaches every other's.
      const labels = w.pathing.regions.labels(1);
      const region = ([x, y]: [number, number]) => labels[(y + 4) * w.map.w + x + 4]; // just outside the TC
      const r0 = region(m.starts[0]!);
      if (WALKABLE.has(type)) for (const st of m.starts) expect(region(st)).toBe(r0);
      else {
        // Narrows: two landmasses; Small Islands: one per player; Large Islands: one per team (per player here).
        expect(new Set(m.starts.map(region)).size, 'separate lands').toBe(type === 'narrows' ? 2 : n);
        const sea = w.pathing.regions.labels(2);
        const shore = ([sx, sy]: [number, number]): number => {
          for (let r = 1; r < 24; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const x = sx + 1 + dx;
            const y = sy + 1 + dy;
            if (x >= 0 && y >= 0 && x < w.map.w && y < w.map.h && sea[y * w.map.w + x]) return sea[y * w.map.w + x]!;
          }
          return 0;
        };
        const s0 = shore(m.starts[0]!);
        expect(s0).toBeGreaterThan(0);
        for (const st of m.starts) expect(shore(st)).toBe(s0);
      }
      // Water maps: everyone has shore fish and a deep-fish school near home, and water for a Dock within 16 tiles.
      if (!['continental', 'inland', 'coastal', 'highland', 'hillCountry'].includes(type)) {
        const fishZone = near(sim, m.starts, 32);
        for (const z of fishZone) {
          expect(z.shoreFish ?? 0, 'shore fish').toBeGreaterThan(0);
          expect(z.deepFish ?? 0, 'deep fish').toBeGreaterThan(0);
        }
      }
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

  it('alligators lie on beaches and shallows of every map type, ≥ 14 tiles from every start (M14.5, econ:8)', () => {
    for (const type of ['continental', 'inland', 'coastal', 'mediterranean', 'narrows', 'smallIslands', 'largeIslands', 'highland', 'hillCountry'] as const) {
      const m = generateMap({ seed: 5, type, size: 'medium', players: [{ civ: 'greek' }, { civ: 'egyptian' }], alligators: true });
      const gators = m.scenario!.units!.filter((u) => u.type === 'alligator');
      expect(gators.length, type).toBeGreaterThanOrEqual(2);
      for (const a of gators) {
        const ch = m.map.ascii![Math.floor(a.y)]![Math.floor(a.x)];
        expect(['b', ','], type).toContain(ch);
        for (const [sx, sy] of m.starts) expect(Math.hypot(Math.floor(a.x) - sx - 1.5, Math.floor(a.y) - sy - 1.5), type).toBeGreaterThanOrEqual(14);
      }
      // On by default since D59.
      expect(generateMap({ seed: 5, type, size: 'medium', players: [{ civ: 'greek' }, { civ: 'egyptian' }] }).scenario!.units!.some((u) => u.type === 'alligator'), type).toBe(true);
    }
  });

  it('Tiny water maps: forest near enough to last, never over a start (KI-10)', () => {
    for (const type of ['smallIslands', 'largeIslands', 'narrows'] as const) {
      for (const seed of [301, 305, 307, 311]) {
        const m = generateMap({ seed, type, size: 'tiny', players: [{ civ: 'greek' }, { civ: 'egyptian' }] });
        const rows = m.map.ascii!;
        let trees = 0;
        for (const row of rows) for (const ch of row) if (ch === 'F' || ch === 'T') trees++;
        // Wood per player: ~40 per forest tile; a Tiny land map holds ~10,000 a player.
        expect((trees * 40) / 2, `${type} ${seed}`).toBeGreaterThan(6500);
        // No forest under a Town Center (one grew over it: seed 301; the woodline may reach its edge, as always).
        for (const [sx, sy] of m.starts) {
          for (let y = sy; y < sy + 3; y++) for (let x = sx; x < sx + 3; x++) expect(rows[y]?.[x], `${type} ${seed} forest at ${x},${y}`).not.toBe('F');
        }
      }
    }
  });
});
