import { NodeHeap } from './heap.ts';
import { heuristic, isGoalTile, type Goal } from './goals.ts';
import type { PathGrid } from './grid.ts';

const SQRT2 = 1.4142135623730951;

export interface SearchResult {
  /** True if a goal tile was reached; false = partial path to the closest node found (or none). */
  found: boolean;
  /** Node indices from start to end (JPS: jump points; A*: every tile). */
  nodes: number[];
  /** Nodes expanded. */
  expanded: number;
  /** Deterministic work units (expansions + jump steps) — what the per-tick path budget counts. */
  work: number;
  cost: number;
}

/**
 * Grid search with shared, stamp-reset buffers: `jps` (Jump Point Search, 8-connected, diagonal steps only when
 * both adjacent orthogonal tiles are walkable) for play, and `astar` as the reference implementation it is tested
 * against. Both are deterministic (heap ties broken by h then index).
 */
export class Searcher {
  private readonly w: number;
  private readonly g: Float64Array;
  private readonly f: Float64Array;
  private readonly hh: Float64Array;
  private readonly parent: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private stamp = 0;
  private steps = 0;
  private readonly heap: NodeHeap;
  private grid!: PathGrid;
  private goal!: Goal;

  constructor(w: number, h: number) {
    this.w = w;
    const n = w * h;
    this.g = new Float64Array(n);
    this.f = new Float64Array(n);
    this.hh = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new NodeHeap();
  }

  private begin(grid: PathGrid, goal: Goal): void {
    this.grid = grid;
    this.goal = goal;
    this.heap.clear();
    this.steps = 0;
    this.stamp++;
    if (this.stamp === 0xffffffff) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.stamp = 1;
    }
  }

  private open(i: number, g: number, parent: number): void {
    const x = i % this.w;
    const y = (i - x) / this.w;
    if (this.seen[i] !== this.stamp) {
      this.seen[i] = this.stamp;
      this.hh[i] = heuristic(this.goal, x, y);
      this.g[i] = g;
      this.f[i] = g + this.hh[i]!;
      this.parent[i] = parent;
      this.heap.push(i, this.f[i]!, this.hh[i]!);
    } else if (g < this.g[i]! && this.closed[i] !== this.stamp) {
      this.g[i] = g;
      this.f[i] = g + this.hh[i]!;
      this.parent[i] = parent;
      this.heap.push(i, this.f[i]!, this.hh[i]!); // lazy decrease-key: the stale entry is skipped when popped
    }
  }

  private finish(end: number, found: boolean, expanded: number): SearchResult {
    const work = expanded + this.steps;
    if (end < 0) return { found: false, nodes: [], expanded, work, cost: Infinity };
    const nodes: number[] = [];
    for (let i = end; i >= 0; i = this.parent[i]!) nodes.push(i);
    nodes.reverse();
    return { found, nodes, expanded, work, cost: this.g[end]! };
  }

  private run(sx: number, sy: number, maxExpand: number, expand: (i: number, x: number, y: number) => void): SearchResult {
    const start = sy * this.w + sx;
    this.open(start, 0, -1);
    let expanded = 0;
    let best = start;
    while (this.heap.size) {
      const i = this.heap.pop();
      if (this.closed[i] === this.stamp) continue;
      this.closed[i] = this.stamp;
      const x = i % this.w;
      const y = (i - x) / this.w;
      if (isGoalTile(this.goal, x, y)) return this.finish(i, true, expanded);
      if (this.hh[i]! < this.hh[best]! || (this.hh[i] === this.hh[best] && this.g[i]! < this.g[best]!)) best = i;
      if (++expanded > maxExpand) break;
      expand(i, x, y);
    }
    return this.finish(best, false, expanded);
  }

  /** Reference A* over all 8 neighbors (no corner cutting). */
  astar(grid: PathGrid, sx: number, sy: number, goal: Goal, maxExpand = 1e9): SearchResult {
    this.begin(grid, goal);
    return this.run(sx, sy, maxExpand, (i, x, y) => {
      const gi = this.g[i]!;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!grid.walkable(nx, ny)) continue;
          if (dx && dy && !(grid.walkable(x + dx, y) && grid.walkable(x, y + dy))) continue;
          this.open(ny * this.w + nx, gi + (dx && dy ? SQRT2 : 1), i);
        }
      }
    });
  }

  /** Jump Point Search (Harabor & Grastien) for the no-corner-cutting 8-connected grid. */
  jps(grid: PathGrid, sx: number, sy: number, goal: Goal, maxExpand = 1e9): SearchResult {
    this.begin(grid, goal);
    const nb: number[] = [];
    return this.run(sx, sy, maxExpand, (i, x, y) => {
      const p = this.parent[i]!;
      nb.length = 0;
      if (p >= 0) {
        const px = p % this.w;
        const py = (p - px) / this.w;
        const dx = Math.sign(x - px);
        const dy = Math.sign(y - py);
        this.prunedNeighbors(x, y, dx, dy, nb);
      } else {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (!grid.walkable(x + dx, y + dy)) continue;
            if (dx && dy && !(grid.walkable(x + dx, y) && grid.walkable(x, y + dy))) continue;
            nb.push(x + dx, y + dy);
          }
        }
      }
      const gi = this.g[i]!;
      for (let k = 0; k < nb.length; k += 2) {
        const jp = this.jump(nb[k]!, nb[k + 1]!, x, y);
        if (jp < 0) continue;
        const jx = jp % this.w;
        const jy = (jp - jx) / this.w;
        const ddx = Math.abs(jx - x);
        const ddy = Math.abs(jy - y);
        const mn = ddx < ddy ? ddx : ddy;
        const d = mn * SQRT2 + (ddx + ddy - 2 * mn);
        this.open(jp, gi + d, i);
      }
    });
  }

  private prunedNeighbors(x: number, y: number, dx: number, dy: number, out: number[]): void {
    const g = this.grid;
    if (dx && dy) {
      const v = g.walkable(x, y + dy);
      const hz = g.walkable(x + dx, y);
      if (v) out.push(x, y + dy);
      if (hz) out.push(x + dx, y);
      if (v && hz && g.walkable(x + dx, y + dy)) out.push(x + dx, y + dy);
    } else if (dx) {
      const next = g.walkable(x + dx, y);
      const top = g.walkable(x, y + 1);
      const bottom = g.walkable(x, y - 1);
      if (next) {
        out.push(x + dx, y);
        if (top && g.walkable(x + dx, y + 1)) out.push(x + dx, y + 1);
        if (bottom && g.walkable(x + dx, y - 1)) out.push(x + dx, y - 1);
      }
      if (top) out.push(x, y + 1);
      if (bottom) out.push(x, y - 1);
    } else {
      const next = g.walkable(x, y + dy);
      const right = g.walkable(x + 1, y);
      const left = g.walkable(x - 1, y);
      if (next) {
        out.push(x, y + dy);
        if (right && g.walkable(x + 1, y + dy)) out.push(x + 1, y + dy);
        if (left && g.walkable(x - 1, y + dy)) out.push(x - 1, y + dy);
      }
      if (right) out.push(x + 1, y);
      if (left) out.push(x - 1, y);
    }
  }

  /** Walk from (x, y) (arrived from (px, py)) until a jump point, goal, or obstacle. Returns node index or -1. */
  private jump(x: number, y: number, px: number, py: number): number {
    const g = this.grid;
    const dx = x - px;
    const dy = y - py;
    for (;;) {
      this.steps++;
      if (!g.walkable(x, y)) return -1;
      if (isGoalTile(this.goal, x, y)) return y * this.w + x;
      if (dx && dy) {
        // Diagonal: a jump point if a straight jump from here finds something.
        if (this.jump(x + dx, y, x, y) >= 0 || this.jump(x, y + dy, x, y) >= 0) return y * this.w + x;
        if (!(g.walkable(x + dx, y) && g.walkable(x, y + dy))) return -1;
      } else if (dx) {
        if ((g.walkable(x, y - 1) && !g.walkable(x - dx, y - 1)) || (g.walkable(x, y + 1) && !g.walkable(x - dx, y + 1))) {
          return y * this.w + x;
        }
      } else if (dy) {
        if ((g.walkable(x - 1, y) && !g.walkable(x - 1, y - dy)) || (g.walkable(x + 1, y) && !g.walkable(x + 1, y - dy))) {
          return y * this.w + x;
        }
      }
      x += dx;
      y += dy;
    }
  }
}
