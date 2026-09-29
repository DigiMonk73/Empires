import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';
import { isGoalTile, type Goal } from './goals.ts';
import { PathGrid } from './grid.ts';
import { lineWalkable } from './los.ts';
import { Regions } from './regions.ts';
import { Searcher } from './search.ts';

export interface PathRequest {
  slot: number;
  handle: number;
  goal: Goal;
}

/** Per-tick deterministic path budget (work units: expansions + jump steps). */
export const PATH_BUDGET_PER_TICK = 100_000; // ≈1.8 ms on the M4 reference (≈57k work units per ms)
/** Cap for a single search; beyond it the best partial path is used. */
export const PATH_MAX_WORK = 150_000;

/**
 * Serves path requests FIFO under a deterministic work budget. A request whose goal is unreachable from the
 * unit's region is retargeted to the nearest reachable tile first, so units never spin on impossible orders.
 * Results are written to `world.paths[slot]` as smoothed waypoints [x0, y0, x1, y1, …].
 */
export class PathService {
  private readonly world: World;
  readonly regions: Regions;
  private readonly searcher: Searcher;
  private queue: PathRequest[] = [];
  private pendingSlots = new Set<number>();
  /** Stats for metrics. */
  stats = { requests: 0, served: 0, partial: 0, work: 0, maxQueue: 0 };

  constructor(world: World) {
    this.world = world;
    this.regions = new Regions(world.map);
    this.searcher = new Searcher(world.map.w, world.map.h);
  }

  pending(slot: number): boolean {
    return this.pendingSlots.has(slot);
  }

  request(slot: number, goal: Goal): void {
    const handle = this.world.ents.handleOf(slot);
    if (this.pendingSlots.has(slot)) this.queue = this.queue.filter((r) => r.slot !== slot);
    this.queue.push({ slot, handle, goal });
    this.pendingSlots.add(slot);
    this.stats.requests++;
    if (this.queue.length > this.stats.maxQueue) this.stats.maxQueue = this.queue.length;
  }

  /** Pending requests in queue order (save/load). */
  queueSnapshot(): PathRequest[] {
    return this.queue.map((r) => ({ ...r }));
  }

  restoreQueue(list: readonly PathRequest[]): void {
    this.queue = list.map((r) => ({ ...r }));
    this.pendingSlots = new Set(this.queue.map((r) => r.slot));
  }

  cancel(slot: number): void {
    if (!this.pendingSlots.delete(slot)) return;
    this.queue = this.queue.filter((r) => r.slot !== slot);
  }

  /** Serve queued requests until the tick's budget is spent (at least one request always runs). */
  process(budget = PATH_BUDGET_PER_TICK): void {
    let spent = 0;
    while (this.queue.length && (spent < budget || spent === 0)) {
      const req = this.queue.shift()!;
      this.pendingSlots.delete(req.slot);
      if (this.world.ents.slotOf(req.handle) !== req.slot) continue; // entity gone
      spent += this.serve(req);
    }
    this.stats.work += spent;
  }

  private serve(req: PathRequest): number {
    const w = this.world;
    const e = w.ents;
    const s = req.slot;
    const moveClass = TYPES[e.type[s]!]!.moveClass;
    const grid = new PathGrid(w.map, moveClass);
    const labels = this.regions.labels(moveClass);
    const W = w.map.w;
    const ux = e.x[s]!;
    const uy = e.y[s]!;
    let sx = Math.floor(ux);
    let sy = Math.floor(uy);
    const waypoints: number[] = [];
    // Standing on a blocked tile (e.g. a new foundation): step to the nearest open tile first.
    if (!grid.walkable(sx, sy)) {
      const t = nearestTile(W, w.map.h, sx, sy, (tx, ty) => grid.walkable(tx, ty));
      if (t < 0) {
        w.paths[s] = [];
        return 1;
      }
      sx = t % W;
      sy = (t - sx) / W;
      waypoints.push(sx + 0.5, sy + 0.5);
    }
    const region = labels[sy * W + sx]!;
    let goal = req.goal;
    if (!goalReachable(goal, labels, region, W, w.map.h)) {
      const [gx, gy] = goal.k === 'point' ? [goal.tx, goal.ty] : [(goal.x0 + goal.x1) >> 1, (goal.y0 + goal.y1) >> 1];
      const t = nearestTile(W, w.map.h, gx, gy, (tx, ty) => labels[ty * W + tx] === region);
      if (t < 0) {
        w.paths[s] = waypoints;
        return 1;
      }
      const tx = t % W;
      const ty = (t - tx) / W;
      goal = { k: 'point', tx, ty, x: tx + 0.5, y: ty + 0.5 };
    }
    const res = this.searcher.jps(grid, sx, sy, goal, PATH_MAX_WORK);
    this.stats.served++;
    if (!res.found) this.stats.partial++;
    const pts: number[] = [];
    for (const n of res.nodes) {
      const tx = n % W;
      pts.push(tx + 0.5, (n - tx) / W + 0.5);
    }
    // Exact final point for point goals inside the reached tile.
    if (res.found && goal.k === 'point' && pts.length) {
      const last = res.nodes[res.nodes.length - 1]!;
      if (isGoalTile(goal, last % W, Math.floor(last / W))) {
        pts[pts.length - 2] = goal.x;
        pts[pts.length - 1] = goal.y;
      }
    }
    // Replace the start tile center with the unit's actual position, then smooth.
    if (pts.length >= 2 && !waypoints.length) {
      pts[0] = ux;
      pts[1] = uy;
    }
    const smooth = stringPull(grid, pts);
    // Drop the first point (where the unit already is).
    w.paths[s] = [...waypoints, ...smooth.slice(waypoints.length ? 0 : 2)];
    return res.work;
  }
}

function goalReachable(goal: Goal, labels: Int32Array, region: number, W: number, H: number): boolean {
  if (goal.k === 'point') {
    return goal.tx >= 0 && goal.ty >= 0 && goal.tx < W && goal.ty < H && labels[goal.ty * W + goal.tx] === region;
  }
  for (let y = goal.y0 - goal.range; y <= goal.y1 + goal.range; y++) {
    for (let x = goal.x0 - goal.range; x <= goal.x1 + goal.range; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (isGoalTile(goal, x, y) && labels[y * W + x] === region) return true;
    }
  }
  return false;
}

/** Nearest tile (by ring distance, then scan order) satisfying `ok`, searching outward from (cx, cy). */
export function nearestTile(W: number, H: number, cx: number, cy: number, ok: (tx: number, ty: number) => boolean): number {
  const maxR = Math.max(W, H);
  for (let r = 0; r <= maxR; r++) {
    let best = -1;
    let bestD = Infinity;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        if (x < 0 || y < 0 || x >= W || y >= H || !ok(x, y)) continue;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bestD) {
          bestD = d;
          best = y * W + x;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** Greedy string pulling: keep only waypoints needed to maintain walkable line of sight. */
export function stringPull(grid: PathGrid, pts: number[]): number[] {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const out = [pts[0]!, pts[1]!];
  let anchor = 0;
  for (let i = 2; i < n; i++) {
    if (!lineWalkable(grid, pts[anchor * 2]!, pts[anchor * 2 + 1]!, pts[i * 2]!, pts[i * 2 + 1]!)) {
      anchor = i - 1;
      out.push(pts[anchor * 2]!, pts[anchor * 2 + 1]!);
    }
  }
  out.push(pts[(n - 1) * 2]!, pts[(n - 1) * 2 + 1]!);
  return out;
}
