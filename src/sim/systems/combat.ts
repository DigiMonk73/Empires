import { ARMOR_CLASS } from '../../data/types.ts';
import { HUNTER_ATTACK } from '../../data/units.ts';
import { Act, EKind } from '../core/entities.ts';
import { ResState } from '../core/resources.ts';
import { dir16 } from '../math/trig.ts';
import { nearestTile } from '../path/service.ts';
import { RESOURCE_KINDS, TYPES, resourceKindIndex } from '../rules/registry.ts';
import type { TypeStats } from '../rules/playerStats.ts';
import type { World } from '../world.ts';
import { approachRect, depleteNode, isVillager, REACH, startGather } from './gather.ts';
import { refundQueue } from './production.ts';

/**
 * Combat core (mil:2). Damage = max(1, Σ over armor classes the target has: max(0, attack − armor)); against
 * buildings the sum is ×0.2 with a floor of 0.1. Bonus classes work through negative armor (buildings −140 in
 * class 6, infantry −5 in class 9 …) meeting an attacker's 0 in that class.
 */
export function damageBetween(atk: readonly (number | undefined)[], arm: readonly (number | undefined)[], building = false): number {
  let sum = 0;
  for (let c = 0; c < arm.length; c++) {
    const a = arm[c];
    const t = atk[c];
    if (a === undefined || t === undefined) continue;
    if (t > a) sum += t - a;
  }
  if (building) {
    const d = sum * 0.2;
    return d < 0.1 ? 0.1 : d;
  }
  return sum < 1 ? 1 : sum;
}

/** Can `a`'s owner attack `b`? Gaia animals are fair game; players attack anyone not on their team. */
export function hostile(w: World, a: number, b: number): boolean {
  const oa = w.ents.owner[a]!;
  const ob = w.ents.owner[b]!;
  if (oa === ob) return false;
  if (ob === 0) return !!TYPES[w.ents.type[b]!]!.animal;
  if (oa === 0) return true;
  return w.players[oa]!.team !== w.players[ob]!.team;
}

/** Hunters throw spears: the villager's attack against animals (mil:1a, mil:2). */
const HUNT_ATK: (number | undefined)[] = [];
HUNT_ATK[ARMOR_CLASS.pierce] = HUNTER_ATTACK.atk.pierce!;

function attackStats(w: World, s: number, hunting: boolean): { atk: readonly (number | undefined)[]; range: number; reload: number; accuracy: number } {
  const st: TypeStats = w.stats(w.ents.owner[s]!, w.ents.type[s]!);
  if (hunting && isVillager(w, s)) return { atk: HUNT_ATK, range: HUNTER_ATTACK.range, reload: st.reloadTicks, accuracy: HUNTER_ATTACK.accuracy };
  return { atk: st.atk, range: st.range, reload: st.reloadTicks, accuracy: 1 };
}

/**
 * Kill an entity. Animals leave a carcass (food) where they fall; buildings free their footprint and refund their
 * queue (unverified for 1.0 — D25). The sim forgets the dead at once; corpses and rubble are the renderer's
 * (from the `died` / `destroyed` events). Returns the carcass node, or −1.
 */
export function kill(w: World, s: number): number {
  const e = w.ents;
  const t = TYPES[e.type[s]!]!;
  let carcass = -1;
  if (t.animal) {
    const kind = resourceKindIndex(`carcass:${t.animal.id}`);
    let tx = Math.floor(e.x[s]!);
    let ty = Math.floor(e.y[s]!);
    if (w.map.resAt[w.map.idx(tx, ty)]) {
      const i = nearestTile(w.map.w, w.map.h, tx, ty, (x, y) => !w.map.resAt[w.map.idx(x, y)] && w.map.passable(x, y, 1));
      if (i >= 0) {
        tx = i % w.map.w;
        ty = Math.floor(i / w.map.w);
      }
    }
    carcass = w.addResource(kind, tx, ty);
    w.res.variant[carcass] = ((e.facing[s]! + 1) >> 1) & 7; // the facing it fell in (8 sectors), for its sprite
    w.carcasses.push(carcass);
  }
  if (e.kind[s] === EKind.building) {
    refundQueue(w, s);
    w.events.push({ t: 'destroyed', h: e.handleOf(s), owner: e.owner[s]!, type: e.type[s]!, x: e.x[s]!, y: e.y[s]!, built: e.build[s]! >= 1 });
  } else w.events.push({ t: 'died', h: e.handleOf(s), owner: e.owner[s]!, type: e.type[s]!, x: e.x[s]!, y: e.y[s]!, facing: e.facing[s]! });
  w.removeEntity(e.handleOf(s));
  return carcass;
}

/** Apply damage from `attacker` to `target`; handles death and animal reactions. */
export function hit(w: World, attacker: number, target: number, amount: number): void {
  const e = w.ents;
  e.hp[target] = e.hp[target]! - amount;
  const t = TYPES[e.type[target]!]!;
  if (e.hp[target]! <= 0) {
    const huntersTarget = e.handleOf(target);
    const carcass = kill(w, target);
    // Villagers hunting this animal switch to butchering its carcass.
    if (carcass >= 0) {
      for (let s = 0; s < e.top; s++) {
        const o = w.orders[s]?.[0];
        if (e.alive[s] && o?.k === 'attack' && o.h === huntersTarget && o.hunt && isVillager(w, s)) startGather(w, s, carcass, false);
      }
    }
    return;
  }
  if (t.animal) reactToAttack(w, target, attacker);
}

/** Animals: gazelles flee from attackers; elephants and predators fight back (econ:1.1). */
function reactToAttack(w: World, s: number, attacker: number): void {
  const e = w.ents;
  const a = TYPES[e.type[s]!]!.animal!;
  if (a.behavior === 'flee') {
    const dx = e.x[s]! - e.x[attacker]!;
    const dy = e.y[s]! - e.y[attacker]!;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const x = Math.min(w.map.w - 0.5, Math.max(0.5, e.x[s]! + (dx / d) * 5));
    const y = Math.min(w.map.h - 0.5, Math.max(0.5, e.y[s]! + (dy / d) * 5));
    w.orders[s] = [{ k: 'move', x: Math.round(x * 256) / 256, y: Math.round(y * 256) / 256 }];
    w.paths[s] = undefined;
    w.pathing.cancel(s);
  } else if (w.orders[s]?.[0]?.k !== 'attack') {
    w.orders[s] = [{ k: 'attack', h: e.handleOf(attacker), hunt: false, retarget: 0 }];
    w.paths[s] = undefined;
  }
}

/** Start an attack order on a hostile unit or building (villagers attacking animals are hunting). */
export function startAttack(w: World, s: number, targetHandle: number, queue: boolean): boolean {
  const e = w.ents;
  const t = e.slotOf(targetHandle);
  if (t < 0 || t === s || e.kind[s] !== EKind.unit || !hostile(w, s, t)) return false;
  if (!canAttack(w, s)) return false;
  const hunting = !!TYPES[e.type[t]!]!.animal && isVillager(w, s);
  const order = { k: 'attack' as const, h: targetHandle, hunt: hunting, retarget: 0 };
  const q = w.orders[s];
  if (queue && q && q.length) q.push(order);
  else {
    w.orders[s] = [order];
    w.paths[s] = undefined;
    w.pathing.cancel(s);
    e.stuck[s] = 0;
  }
  return true;
}

function finish(w: World, s: number): void {
  const q = w.orders[s]!;
  q.shift();
  w.paths[s] = undefined;
  if (!q.length) w.orders[s] = undefined;
  w.ents.act[s] = Act.idle;
  w.ents.actStart[s] = w.tick;
}

/** Units with any attack (villagers, soldiers, fighting animals; not priests, boats without weapons…). */
export function canAttack(w: World, s: number): boolean {
  if (isVillager(w, s)) return true;
  const st = w.stats(w.ents.owner[s]!, w.ents.type[s]!);
  return st.atk.some((v) => v !== undefined && v > 0);
}

/** Distance from unit `s` to target `t`'s edge (building footprint or unit circle). */
export function edgeDist(w: World, s: number, t: number): number {
  const e = w.ents;
  const tt = TYPES[e.type[t]!]!;
  if (e.kind[t] === EKind.building) {
    const h = tt.size / 2;
    const dx = Math.max(0, Math.abs(e.x[s]! - e.x[t]!) - h);
    const dy = Math.max(0, Math.abs(e.y[s]! - e.y[t]!) - h);
    return Math.sqrt(dx * dx + dy * dy);
  }
  const dx = e.x[t]! - e.x[s]!;
  const dy = e.y[t]! - e.y[s]!;
  const d = Math.sqrt(dx * dx + dy * dy) - tt.radius;
  return d < 0 ? 0 : d;
}

/** Attack orders: close to range, face, strike on reload (instant hits for now; projectiles arrive in M5.2). */
export function attackSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    if (e.timer[s]! > 0) e.timer[s] = e.timer[s]! - 1;
    const o = w.orders[s]?.[0];
    if (!o || o.k !== 'attack') continue;
    const t = e.slotOf(o.h);
    if (t < 0) {
      finish(w, s);
      continue;
    }
    const st = attackStats(w, s, o.hunt);
    const dx = e.x[t]! - e.x[s]!;
    const dy = e.y[t]! - e.y[s]!;
    const building = e.kind[t] === EKind.building;
    const d = edgeDist(w, s, t);
    // Ranged: range to the target's edge. Melee: touching (buildings: the same reach as villager work).
    const reach = st.range > 0 ? st.range : building ? REACH : TYPES[e.type[s]!]!.radius + 0.25;
    if (d <= reach) {
      w.paths[s] = [];
      w.pathing.cancel(s);
      const f = dir16(dx, dy);
      if (f >= 0) e.facing[s] = f;
      if (e.act[s] !== Act.attack) {
        e.act[s] = Act.attack;
        e.actStart[s] = w.tick;
      }
      if (e.timer[s]! <= 0) {
        e.timer[s] = st.reload;
        e.actStart[s] = w.tick; // restart the attack animation on each strike
        if (st.accuracy >= 1 || w.rng.combat.chance(st.accuracy)) {
          hit(w, s, t, damageBetween(st.atk, w.stats(e.owner[t]!, e.type[t]!).arm, building));
        }
      }
      continue;
    }
    if (building) {
      // Buildings don't move: path once to the footprint (ranged units stop as soon as they are in range).
      if (w.paths[s] === undefined && !w.pathing.pending(s)) {
        const size = TYPES[e.type[t]!]!.size;
        const x0 = Math.round(e.x[t]! - size / 2);
        const y0 = Math.round(e.y[t]! - size / 2);
        w.pathing.request(s, { k: 'rect', x0, y0, x1: x0 + size - 1, y1: y0 + size - 1, range: st.range > 0 ? Math.max(1, Math.floor(st.range)) : 1 });
      } else if (w.paths[s] !== undefined && !w.paths[s]!.length) {
        const h = TYPES[e.type[t]!]!.size / 2;
        if (!approachRect(w, s, e.x[t]! - h, e.y[t]! - h, e.x[t]! + h, e.y[t]! + h)) {
          if (++o.retarget > 40) finish(w, s); // unreachable
          else w.paths[s] = undefined;
        }
      }
      continue;
    }
    // Chase: (re)path toward the target when idle or when it has moved away from our path's end.
    const path = w.paths[s];
    const end = path && path.length ? [path[path.length - 2]!, path[path.length - 1]!] : null;
    const stale = !end || Math.abs(end[0]! - e.x[t]!) + Math.abs(end[1]! - e.y[t]!) > 1.5;
    if ((path === undefined || (!path.length && d > reach) || (stale && ++o.retarget % 10 === 0)) && !w.pathing.pending(s)) {
      w.pathing.request(s, { k: 'point', tx: Math.floor(e.x[t]!), ty: Math.floor(e.y[t]!), x: e.x[t]!, y: e.y[t]! });
    }
  }
}

/** Carcasses rot away (econ:1.1: gazelle 0.3 food/s, elephant 0.2/s, …). */
export function decaySystem(w: World): void {
  const r = w.res;
  let k = 0;
  for (const i of w.carcasses) {
    if (r.state[i] !== ResState.standing) continue;
    const def = RESOURCE_KINDS[r.kind[i]!]!;
    r.amount[i] = r.amount[i]! - (def.decay ?? 0) / 20;
    if (r.amount[i]! <= 0) {
      depleteNode(w, i);
      continue;
    }
    w.carcasses[k++] = i;
  }
  w.carcasses.length = k;
}
