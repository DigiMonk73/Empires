import { Act, EKind } from '../core/entities.ts';
import { dir16 } from '../math/trig.ts';
import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';

/**
 * Unit movement toward the head order. M1.3 placeholder: straight line, no obstacles (pathing lands in M1.4,
 * collision in M1.5). Records the previous position for render interpolation.
 */
/** Absorbs float error so a unit arriving exactly on schedule doesn't take an extra tick. */
const ARRIVE_EPS = 1e-9;

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
    const speed = TYPES[e.type[s]!]!.speed;
    const dx = order.x - e.x[s]!;
    const dy = order.y - e.y[s]!;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (e.act[s] !== Act.move) {
      e.act[s] = Act.move;
      e.actStart[s] = w.tick;
    }
    if (dist <= speed + ARRIVE_EPS) {
      e.x[s] = order.x;
      e.y[s] = order.y;
      q!.shift();
      if (!q!.length) {
        w.orders[s] = undefined;
        w.events.push({ t: 'arrived', h: e.handleOf(s) });
      }
    } else {
      e.x[s] = e.x[s]! + (dx / dist) * speed;
      e.y[s] = e.y[s]! + (dy / dist) * speed;
      const f = dir16(dx, dy);
      if (f >= 0) e.facing[s] = f;
    }
  }
}
