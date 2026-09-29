import { Act, EKind } from '../core/entities.ts';
import { dir16 } from '../math/trig.ts';
import type { Goal } from '../path/goals.ts';
import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';

/** Absorbs float error so a unit arriving exactly on schedule doesn't take an extra tick. */
const ARRIVE_EPS = 1e-9;

function pointGoal(x: number, y: number): Goal {
  return { k: 'point', tx: Math.floor(x), ty: Math.floor(y), x, y };
}

/** Phase 1: units with a move order and no path ask the path service for one. */
export function pathRequestSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const order = w.orders[s]?.[0];
    if (!order || order.k !== 'move') continue;
    if (w.paths[s] === undefined && !w.pathing.pending(s)) w.pathing.request(s, pointGoal(order.x, order.y));
  }
}

/**
 * Phase 3: move units along their waypoints. Records the previous position for render interpolation.
 * (Collision avoidance arrives in M1.5.)
 */
export function movementSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    e.px[s] = e.x[s]!;
    e.py[s] = e.y[s]!;
    const q = w.orders[s];
    const order = q?.[0];
    if (!order || order.k !== 'move') {
      if (e.act[s] === Act.move) {
        e.act[s] = Act.idle;
        e.actStart[s] = w.tick;
      }
      continue;
    }
    const path = w.paths[s];
    if (path === undefined) continue; // waiting for the path service
    if (e.act[s] !== Act.move) {
      e.act[s] = Act.move;
      e.actStart[s] = w.tick;
    }
    let budget = TYPES[e.type[s]!]!.speed;
    // Consume as many waypoints as this tick's movement allows.
    while (budget > 0 && path.length) {
      const dx = path[0]! - e.x[s]!;
      const dy = path[1]! - e.y[s]!;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= budget + ARRIVE_EPS) {
        e.x[s] = path[0]!;
        e.y[s] = path[1]!;
        budget -= dist;
        path.splice(0, 2);
      } else {
        e.x[s] = e.x[s]! + (dx / dist) * budget;
        e.y[s] = e.y[s]! + (dy / dist) * budget;
        budget = 0;
      }
      const f = dir16(dx, dy);
      if (f >= 0) e.facing[s] = f;
    }
    if (!path.length) {
      q!.shift();
      w.paths[s] = undefined;
      if (!q!.length) {
        w.orders[s] = undefined;
        w.events.push({ t: 'arrived', h: e.handleOf(s) });
      }
    }
  }
}
