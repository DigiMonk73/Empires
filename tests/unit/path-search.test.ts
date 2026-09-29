import { describe, expect, it } from 'vitest';
import { terrainIndex, MOVE_LAND } from '../../src/data/terrain.ts';
import { Rng } from '../../src/sim/math/rng.ts';
import { Occ, TileMap } from '../../src/sim/map/tilemap.ts';
import { PathGrid } from '../../src/sim/path/grid.ts';
import { Regions } from '../../src/sim/path/regions.ts';
import { Searcher } from '../../src/sim/path/search.ts';
import type { Goal } from '../../src/sim/path/goals.ts';

function randomMap(seed: number, w: number, h: number, density: number): TileMap {
  const m = new TileMap(w, h, terrainIndex('grass'));
  const r = new Rng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (r.chance(density)) m.setOcc(x, y, Occ.resource, true);
  return m;
}

function asciiMap(rows: string[]): TileMap {
  const m = new TileMap(rows[0]!.length, rows.length, terrainIndex('grass'));
  rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && m.setOcc(x, y, Occ.resource, true)));
  return m;
}

const point = (tx: number, ty: number): Goal => ({ k: 'point', tx, ty, x: tx + 0.5, y: ty + 0.5 });

describe('JPS matches reference A*', () => {
  it('finds the same optimal cost and reachability on 300 random maps', () => {
    let compared = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const w = 20 + (seed % 17);
      const h = 18 + (seed % 13);
      const m = randomMap(seed, w, h, 0.05 + (seed % 7) * 0.05);
      const grid = new PathGrid(m, MOVE_LAND);
      const s = new Searcher(w, h);
      const r = new Rng(seed * 7919);
      for (let q = 0; q < 4; q++) {
        const sx = r.int(w);
        const sy = r.int(h);
        const gx = r.int(w);
        const gy = r.int(h);
        if (!grid.walkable(sx, sy) || !grid.walkable(gx, gy)) continue;
        const a = s.astar(grid, sx, sy, point(gx, gy));
        const j = s.jps(grid, sx, sy, point(gx, gy));
        expect(j.found, `seed ${seed} q ${q}`).toBe(a.found);
        if (a.found) expect(j.cost, `seed ${seed} q ${q}`).toBeCloseTo(a.cost, 9);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(500);
  });

  it('expands far fewer nodes than A* on a clumped-forest map', () => {
    const m = new TileMap(200, 200, terrainIndex('grass'));
    const r = new Rng(5);
    for (let k = 0; k < 60; k++) {
      const cx = r.int(200);
      const cy = r.int(200);
      const rad = 3 + r.int(10);
      for (let y = cy - rad; y <= cy + rad; y++)
        for (let x = cx - rad; x <= cx + rad; x++)
          if (m.inBounds(x, y) && (x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad && !(x < 5 && y < 5) && !(x > 185 && y > 175)) m.setOcc(x, y, Occ.resource, true);
    }
    const grid = new PathGrid(m, MOVE_LAND);
    const s = new Searcher(200, 200);
    const a = s.astar(grid, 2, 3, point(190, 180));
    const j = s.jps(grid, 2, 3, point(190, 180));
    expect(j.found && a.found).toBe(true);
    expect(j.expanded * 5).toBeLessThan(a.expanded);
  });
});

describe('goal sets', () => {
  it('reaches a tile adjacent to a building footprint (range 1), never inside', () => {
    const m = asciiMap(['..........', '....###...', '....###...', '....###...', '..........']);
    const grid = new PathGrid(m, MOVE_LAND);
    const s = new Searcher(m.w, m.h);
    const r = s.jps(grid, 0, 2, { k: 'rect', x0: 4, y0: 1, x1: 6, y1: 3, range: 1 });
    expect(r.found).toBe(true);
    const last = r.nodes[r.nodes.length - 1]!;
    expect([last % m.w, Math.floor(last / m.w)]).toEqual([3, 2]);
    expect(r.cost).toBe(3);
  });

  it('ranged goal stops as soon as the target is within range', () => {
    const m = asciiMap(['....................']);
    const s = new Searcher(m.w, m.h);
    const r = s.jps(new PathGrid(m, MOVE_LAND), 0, 0, { k: 'rect', x0: 19, y0: 0, x1: 19, y1: 0, range: 5 });
    expect(r.cost).toBe(14);
  });

  it('reports unreachable goals, and A* returns a partial path to the closest node when capped', () => {
    const m = asciiMap(['.....#....', '.....#....', '.....#....']);
    const s = new Searcher(m.w, m.h);
    expect(s.jps(new PathGrid(m, MOVE_LAND), 0, 1, point(9, 1)).found).toBe(false);
    const a = s.astar(new PathGrid(m, MOVE_LAND), 0, 1, point(9, 1));
    expect(a.found).toBe(false);
    expect(a.nodes[a.nodes.length - 1]! % m.w).toBe(4);
    const capped = s.astar(new PathGrid(randomMap(3, 100, 100, 0.1), MOVE_LAND), 0, 0, point(99, 99), 50);
    expect(capped.found).toBe(false);
    expect(capped.expanded).toBeLessThanOrEqual(51);
  });
});

describe('regions', () => {
  it('labels connected areas and updates when passability changes', () => {
    const m = asciiMap(['...#...', '...#...', '...#...']);
    const reg = new Regions(m);
    expect(reg.regionAt(MOVE_LAND, 0, 0)).not.toBe(reg.regionAt(MOVE_LAND, 6, 0));
    expect(reg.regionAt(MOVE_LAND, 0, 0)).toBe(reg.regionAt(MOVE_LAND, 2, 2));
    expect(reg.regionAt(MOVE_LAND, 3, 1)).toBe(0);
    m.setOcc(3, 1, Occ.resource, false); // a tree is cut
    expect(reg.regionAt(MOVE_LAND, 0, 0)).toBe(reg.regionAt(MOVE_LAND, 6, 0));
  });
});
