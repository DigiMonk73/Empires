import { Act, EKind } from '../core/entities.ts';
import { dir16, DIR16_X, DIR16_Y } from '../math/trig.ts';
import type { Goal } from '../path/goals.ts';
import { PathGrid } from '../path/grid.ts';
import { lineWalkable } from '../path/los.ts';
import { stringPull } from '../path/service.ts';
import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';

/** Absorbs float error so a unit arriving exactly on schedule doesn't take an extra tick. */
const ARRIVE_EPS = 1e-9;
/** A tick counts as blocked when the unit closes less than this fraction of its speed on its waypoint. */
const BLOCKED_PROGRESS = 0.3;
/** Blocked ticks before re-pathing (3 s) and before giving up (8 s). */
const STUCK_REPATH = 60;
const STUCK_GIVE_UP = 160;
/** A crowded destination: stop when this close to the final point and blocked for a while. */
const CROWD_ARRIVE_DIST = 1.5;
const CROWD_ARRIVE_TICKS = 12;
/** Max separation push per tick, in tiles. */
const MAX_PUSH = 0.06;

function gridFor(w: World, moveClass: number): PathGrid {
  return w.pathGrid(moveClass);
}

function pointGoal(x: number, y: number): Goal {
  return { k: 'point', tx: Math.floor(x), ty: Math.floor(y), x, y };
}

/**
 * Phase 1: units with a move order and no path get one. Cheap cases first: a straight walkable line to the
 * target needs no search. Group followers wait for their leader's path (derived in phase 2).
 */
export function pathRequestSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const order = w.orders[s]?.[0];
    if (!order || order.k !== 'move' || w.paths[s] !== undefined || w.pathing.pending(s)) continue;
    const grid = gridFor(w, TYPES[e.type[s]!]!.moveClass);
    if (lineWalkable(grid, e.x[s]!, e.y[s]!, order.x, order.y)) {
      w.paths[s] = [order.x, order.y];
      w.moveStats.directPaths++;
      continue;
    }
    const isFollower = order.leader !== undefined && order.leader !== e.handleOf(s) && e.valid(order.leader);
    if (!isFollower) w.pathing.request(s, pointGoal(order.x, order.y));
  }
}

/**
 * Phase 2 (after the path service ran): followers derive their path from the leader's — leader waypoints then
 * their own formation target — when both joins are walkable; otherwise they search their own.
 */
export function followerPathSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const order = w.orders[s]?.[0];
    if (!order || order.k !== 'move' || order.leader === undefined || w.paths[s] !== undefined || w.pathing.pending(s)) continue;
    const ls = e.slotOf(order.leader);
    if (ls === s) continue;
    const lo = ls >= 0 ? w.orders[ls]?.[0] : undefined;
    if (ls >= 0 && lo?.leader === order.leader && w.pathing.pending(ls)) continue; // leader's path not ready yet
    const lp = ls >= 0 && lo?.leader === order.leader ? w.paths[ls] : undefined;
    const grid = gridFor(w, TYPES[e.type[s]!]!.moveClass);
    if (lp && lp.length >= 4) {
      const via = lp.slice(0, lp.length - 2);
      const n = via.length;
      if (lineWalkable(grid, e.x[s]!, e.y[s]!, via[0]!, via[1]!) && lineWalkable(grid, via[n - 2]!, via[n - 1]!, order.x, order.y)) {
        const full = stringPull(grid, [e.x[s]!, e.y[s]!, ...via, order.x, order.y]);
        w.paths[s] = full.slice(2);
        w.moveStats.sharedPaths++;
        continue;
      }
    }
    w.pathing.request(s, pointGoal(order.x, order.y));
  }
}

function finishOrder(w: World, s: number, arrived: boolean): void {
  const q = w.orders[s]!;
  q.shift();
  w.paths[s] = undefined;
  w.ents.stuck[s] = 0;
  if (!q.length) {
    w.orders[s] = undefined;
    const h = w.ents.handleOf(s);
    w.events.push(arrived ? { t: 'arrived', h } : { t: 'stuck', h });
  }
}

/** Phase 3: move units along their waypoints, detect lack of progress, and handle crowded arrivals. */
export function movementSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    e.px[s] = e.x[s]!;
    e.py[s] = e.y[s]!;
    const order = w.orders[s]?.[0];
    if (!order || order.k !== 'move') {
      if (e.act[s] === Act.move) {
        e.act[s] = Act.idle;
        e.actStart[s] = w.tick;
      }
      continue;
    }
    const path = w.paths[s];
    if (path === undefined) continue; // waiting for a path
    if (!path.length) {
      finishOrder(w, s, true); // no route at all (already as close as possible)
      continue;
    }
    if (e.act[s] !== Act.move) {
      e.act[s] = Act.move;
      e.actStart[s] = w.tick;
      e.lastDist[s] = Infinity;
    }
    let budget = w.stats(e.owner[s]!, e.type[s]!).speed;
    while (budget > 0 && path.length) {
      const dx = path[0]! - e.x[s]!;
      const dy = path[1]! - e.y[s]!;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const f = dir16(dx, dy);
      if (f >= 0) e.facing[s] = f;
      if (dist <= budget + ARRIVE_EPS) {
        e.x[s] = path[0]!;
        e.y[s] = path[1]!;
        budget -= dist;
        path.splice(0, 2);
        e.lastDist[s] = Infinity;
      } else {
        e.x[s] = e.x[s]! + (dx / dist) * budget;
        e.y[s] = e.y[s]! + (dy / dist) * budget;
        budget = 0;
      }
    }
    w.moveStats.movingTicks++;
    if (!path.length) {
      finishOrder(w, s, true);
      continue;
    }
  }
}

/**
 * Phase 4: resolve overlaps between unit circles. Idle units yield to moving ones; pushes never enter tiles the
 * unit can't stand on. Then judge progress (after pushes) for stuck detection.
 */
export function separationSystem(w: World): void {
  const e = w.ents;
  w.grid.rebuild(e);
  const n = e.top;
  const pushX = scratch(w, 'px', n);
  const pushY = scratch(w, 'py', n);
  pushX.fill(0, 0, n);
  pushY.fill(0, 0, n);
  for (let s = 0; s < n; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const rs = TYPES[e.type[s]!]!.radius;
    const xs = e.x[s]!;
    const ys = e.y[s]!;
    const movingS = w.paths[s] !== undefined && w.paths[s]!.length > 0;
    w.grid.forEachNear(xs, ys, rs + 0.6, (j) => {
      if (j <= s) return;
      const rj = TYPES[e.type[j]!]!.radius;
      let dx = e.x[j]! - xs;
      let dy = e.y[j]! - ys;
      const min = rs + rj;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) return;
      let d = Math.sqrt(d2);
      if (d < 1e-6) {
        const k = (s * 7 + j * 3) & 15; // deterministic tie-break direction for coincident units
        dx = DIR16_X[k]!;
        dy = DIR16_Y[k]!;
        d = 1;
      }
      const overlap = min - Math.sqrt(d2);
      const movingJ = w.paths[j] !== undefined && w.paths[j]!.length > 0;
      const ux = dx / d; // radial unit vector s → j
      const uy = dy / d;
      const add = (k: number, vx: number, vy: number): void => {
        pushX[k] = pushX[k]! + vx;
        pushY[k] = pushY[k]! + vy;
      };
      if (movingS !== movingJ) {
        // A mover meets an idle unit: the idle one steps aside (perpendicular to the mover's heading).
        const m = movingS ? s : j;
        const i = movingS ? j : s;
        const hx = headingX(w, m);
        const hy = headingY(w, m);
        const rx = movingS ? ux : -ux; // mover → idle
        const ry = movingS ? uy : -uy;
        const cross = hx * ry - hy * rx;
        const side = cross > 0 ? 1 : cross < 0 ? -1 : (m + i) & 1 ? 1 : -1;
        const perpX = -hy * side;
        const perpY = hx * side;
        add(i, (perpX * 0.7 + rx * 0.3) * overlap * 0.9, (perpY * 0.7 + ry * 0.3) * overlap * 0.9);
        add(m, -perpX * overlap * 0.1, -perpY * overlap * 0.1);
      } else {
        // Radial split; movers meeting head-on also keep to their right so they pass each other.
        add(s, -ux * overlap * 0.5, -uy * overlap * 0.5);
        add(j, ux * overlap * 0.5, uy * overlap * 0.5);
        if (movingS) {
          const hsx = headingX(w, s);
          const hsy = headingY(w, s);
          const hjx = headingX(w, j);
          const hjy = headingY(w, j);
          if (hsx * hjx + hsy * hjy < -0.3) {
            add(s, hsy * overlap * 0.5, -hsx * overlap * 0.5);
            add(j, hjy * overlap * 0.5, -hjx * overlap * 0.5);
          }
        }
      }
    });
  }
  for (let s = 0; s < n; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    let px = pushX[s]!;
    let py = pushY[s]!;
    const m = Math.sqrt(px * px + py * py);
    if (m > MAX_PUSH) {
      px *= MAX_PUSH / m;
      py *= MAX_PUSH / m;
    }
    if (m > 0) {
      const grid = gridFor(w, TYPES[e.type[s]!]!.moveClass);
      const x = e.x[s]!;
      const y = e.y[s]!;
      if (grid.walkable(Math.floor(x + px), Math.floor(y + py))) {
        e.x[s] = x + px;
        e.y[s] = y + py;
      } else if (grid.walkable(Math.floor(x + px), Math.floor(y))) e.x[s] = x + px;
      else if (grid.walkable(Math.floor(x), Math.floor(y + py))) e.y[s] = y + py;
    }
    stuckCheck(w, s);
  }
}

/** Unit heading toward its current waypoint (0 when not moving). */
function headingX(w: World, s: number): number {
  const p = w.paths[s];
  if (!p || !p.length) return 0;
  const dx = p[0]! - w.ents.x[s]!;
  const dy = p[1]! - w.ents.y[s]!;
  const d = Math.sqrt(dx * dx + dy * dy);
  return d > 1e-9 ? dx / d : 0;
}

function headingY(w: World, s: number): number {
  const p = w.paths[s];
  if (!p || !p.length) return 0;
  const dx = p[0]! - w.ents.x[s]!;
  const dy = p[1]! - w.ents.y[s]!;
  const d = Math.sqrt(dx * dx + dy * dy);
  return d > 1e-9 ? dy / d : 0;
}

function stuckCheck(w: World, s: number): void {
  const e = w.ents;
  const path = w.paths[s];
  if (!path || !path.length) return;
  const dx = path[0]! - e.x[s]!;
  const dy = path[1]! - e.y[s]!;
  const d = Math.sqrt(dx * dx + dy * dy);
  const speed = w.stats(e.owner[s]!, e.type[s]!).speed;
  const progressed = e.lastDist[s]! - d;
  e.lastDist[s] = d;
  if (progressed < speed * BLOCKED_PROGRESS) {
    e.stuck[s] = e.stuck[s]! + 1;
    w.moveStats.blockedTicks++;
  } else if (e.stuck[s]! > 0) e.stuck[s] = e.stuck[s]! - 1;
  const st = e.stuck[s]!;
  const finalLeg = path.length === 2;
  if (finalLeg && d < CROWD_ARRIVE_DIST && st >= CROWD_ARRIVE_TICKS) {
    finishOrder(w, s, true); // destination is crowded: close enough
  } else if (st === STUCK_REPATH) {
    w.paths[s] = undefined; // ask for a fresh path next tick
    w.moveStats.repaths++;
  } else if (st >= STUCK_GIVE_UP) {
    w.moveStats.gaveUp++;
    finishOrder(w, s, false);
  }
}

function scratch(w: World, key: 'px' | 'py', n: number): Float64Array {
  let a = w.scratch[key];
  if (a.length < n) w.scratch[key] = a = new Float64Array(Math.max(256, n * 2));
  return a;
}
