import { MOVE_WATER } from '../../data/terrain.ts';
import { ARMOR_CLASS } from '../../data/types.ts';
import { HUNTER_ATTACK } from '../../data/units.ts';
import type { ProjectileDef } from '../../data/types.ts';
import { Act, EKind } from '../core/entities.ts';
import { NO_ENTITY } from '../core/handles.ts';
import { ResState } from '../core/resources.ts';
import { DIR16_X, DIR16_Y, dir16 } from '../math/trig.ts';
import { nearestTile } from '../path/service.ts';
import { RESOURCE_KINDS, TYPES, resourceKindIndex } from '../rules/registry.ts';
import type { TypeStats } from '../rules/playerStats.ts';
import type { World } from '../world.ts';
import { approachRect, depleteNode, isVillager, REACH, startGather } from './gather.ts';
import { refundQueue } from './production.ts';
import { FAITH_MAX, isPriest, startConvert } from './priest.ts';
import { ENEMY, allied, stanceOf } from '../rules/diplomacy.ts';

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

/** Can `a`'s owner attack `b`? Gaia animals are fair game; players attack anyone they don't call Ally (M12.3). */
export function hostile(w: World, a: number, b: number): boolean {
  const oa = w.ents.owner[a]!;
  const ob = w.ents.owner[b]!;
  if (oa === ob) return false;
  if (w.ents.kind[b] === EKind.building && TYPES[w.ents.type[b]!]!.building!.kind === 'relic') return false; // Ruins and Artifacts (M14.1)
  if (ob === 0) return !!TYPES[w.ents.type[b]!]!.animal;
  if (oa === 0) return true;
  return !allied(w, oa, ob);
}

/** Villagers and boats that don't fight: left alone by units acting on their own against a Neutral player. */
const CIVILIAN = new Set(['villager', 'fishingShip', 'tradeShip']);

/**
 * Would `a` attack `b` on its own (auto-acquire, towers)? Enemies: anything. Neutrals: soldiers, not villagers or
 * working boats (research §4).
 */
export function autoHostile(w: World, a: number, b: number): boolean {
  if (!hostile(w, a, b)) return false;
  const oa = w.ents.owner[a]!;
  const ob = w.ents.owner[b]!;
  if (oa === 0 || ob === 0 || stanceOf(w, oa, ob) === ENEMY) return true;
  return !CIVILIAN.has(TYPES[w.ents.type[b]!]!.unit?.cls ?? '');
}

/** Hunters throw spears: the villager's attack against animals (mil:1a, mil:2). */
const HUNT_ATK: (number | undefined)[] = [];
HUNT_ATK[ARMOR_CLASS.pierce] = HUNTER_ATTACK.atk.pierce!;

/** Hunters' spears fly like light javelins (speed unverified). */
const SPEAR: ProjectileDef = { speed: 6, accuracy: HUNTER_ATTACK.accuracy };

interface AttackStats {
  atk: readonly (number | undefined)[];
  range: number;
  minRange: number;
  reload: number;
  /** Missile weapons fire projectiles; melee strikes directly. */
  missile: ProjectileDef | null;
}

function attackStats(w: World, owner: number, type: number, villager: boolean, hunting: boolean): AttackStats {
  const st: TypeStats = w.stats(owner, type);
  if (hunting && villager) return { atk: HUNT_ATK, range: HUNTER_ATTACK.range, minRange: 0, reload: st.reloadTicks, missile: SPEAR };
  const t = TYPES[type]!;
  const missile = st.range > 0 ? (t.unit?.projectile ?? t.building?.projectile ?? { speed: 8 }) : null;
  return { atk: st.atk, range: st.range, minRange: st.minRange, reload: st.reloadTicks, missile };
}

/**
 * Ticks from the start of an attack to the blow landing or the missile leaving — the art's `hit` marker sits at the
 * same moment (0.35 s). The reload timer runs from the start of the swing.
 */
export const WINDUP_TICKS = 7;

/**
 * Kill an entity. Animals leave a carcass (food) where they fall; buildings free their footprint and refund their
 * queue (unverified for 1.0 — D25). The sim forgets the dead at once; corpses and rubble are the renderer's
 * (from the `died` / `destroyed` events). Returns the carcass node, or −1.
 */
export function kill(w: World, s: number, by = -1): number {
  const e = w.ents;
  const t = TYPES[e.type[s]!]!;
  // Tallies for the score: kills/razes to the killer, losses to the owner (Gaia keeps none).
  const owner = e.owner[s]!;
  const building = e.kind[s] === EKind.building;
  if (owner > 0) {
    const ot = w.players[owner]!.tally;
    if (building) ot.buildingsLost++;
    else ot.losses++;
  }
  if (by > 0 && by !== owner && owner > 0) {
    const bt = w.players[by]!.tally;
    if (building) bt.razed++;
    else bt.kills++;
  }
  // A sunk transport takes everyone aboard down with it (M8.4).
  const aboard = w.cargo[s]?.length ?? 0;
  if (aboard && owner > 0) {
    w.players[owner]!.tally.losses += aboard;
    if (by > 0 && by !== owner) w.players[by]!.tally.kills += aboard;
  }
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

/** Elevation advantage (D44): the chance that a hit on a lower target does triple damage. */
export const ELEVATION_CHANCE = 0.25;

/** Apply damage from `attacker` to `target`; handles death and animal reactions. */
export function hit(
  w: World,
  attacker: number,
  target: number,
  amount: number,
  fromX = attacker >= 0 ? w.ents.x[attacker]! : w.ents.x[target]!,
  fromY = attacker >= 0 ? w.ents.y[attacker]! : w.ents.y[target]!,
  by = attacker >= 0 ? w.ents.owner[attacker]! : -1,
): void {
  const e = w.ents;
  // Elevation (D44, the 1.0 manual): striking down at a lower target, each hit has a 25% chance of triple damage.
  // The combat stream is only drawn from when the attacker is higher, so flat ground plays exactly as before.
  if (by >= 0 && amount > 0 && w.map.levelAt(fromX, fromY) > w.map.levelAt(e.x[target]!, e.y[target]!) && w.rng.combat.chance(ELEVATION_CHANCE)) amount *= 3;
  e.hp[target] = e.hp[target]! - amount;
  const victim = e.owner[target]!;
  if (by > 0 && victim > 0 && by !== victim) {
    const hb = w.players[victim]!.tally.hitsBy;
    while (hb.length <= by) hb.push(0); // dense (a saved game carries it as JSON)
    hb[by] = hb[by]! + 1;
  }
  const t = TYPES[e.type[target]!]!;
  if (e.hp[target]! <= 0) {
    const huntersTarget = e.handleOf(target);
    const carcass = kill(w, target, by);
    // Villagers hunting this animal switch to butchering its carcass.
    if (carcass >= 0) {
      for (let s = 0; s < e.top; s++) {
        const o = w.orders[s]?.[0];
        if (e.alive[s] && o?.k === 'attack' && o.h === huntersTarget && o.hunt && isVillager(w, s)) startGather(w, s, carcass, false);
      }
    }
    return;
  }
  if (t.animal) reactToAttack(w, target, attacker, fromX, fromY);
  else if (attacker >= 0 && e.kind[target] === EKind.unit) retaliate(w, target, attacker);
}

/** Leash for self-given attack orders: tiles beyond the unit's line of sight (unverified for 1.0 — D27). */
export const LEASH = 3;
/** Patch 1.0a: own and allied units within this many tiles of an attacked unit respond (mil:2). */
export const RESPONSE_RADIUS = 2;

/** Would `s` react on its own (auto-acquire / retaliate)? Idle units that can fight; never Scouts (mil:2). */
function mayReact(w: World, s: number): boolean {
  const e = w.ents;
  if (!e.alive[s] || e.kind[s] !== EKind.unit || w.orders[s]) return false;
  const t = TYPES[e.type[s]!]!;
  if (t.unit?.noAutoAttack || t.animal) return false;
  return canAttack(w, s);
}

/**
 * Patch 1.0a (mil:2): when a unit is attacked, it and every idle own or allied unit within 2 tiles turn on the
 * attacker — even if the attacker is out of their sight. Busy units (villagers at work, units on the march)
 * carry on.
 */
function retaliate(w: World, target: number, attacker: number): void {
  const e = w.ents;
  if (!hostile(w, target, attacker)) return;
  const victim = e.owner[target]!;
  const ah = e.handleOf(attacker);
  const x = e.x[target]!;
  const y = e.y[target]!;
  const r2 = RESPONSE_RADIUS * RESPONSE_RADIUS;
  w.grid.forEachNear(x, y, RESPONSE_RADIUS, (s) => {
    if (s !== target && !allied(w, e.owner[s]!, victim)) return; // own and allied units answer
    if (e.owner[s] === 0 || !hostile(w, s, attacker)) return;
    const dx = e.x[s]! - x;
    const dy = e.y[s]! - y;
    if (dx * dx + dy * dy > r2 || !mayReact(w, s)) return;
    startAttack(w, s, ah, false, true);
  });
  if (mayReact(w, target)) startAttack(w, target, ah, false, true);
  // A priest under attack answers by converting the attacker (mil:3), once its faith is full.
  else if (isPriest(w, target) && e.faith[target]! >= FAITH_MAX && !w.orders[target]) startConvert(w, target, ah, false, true);
}

/**
 * Auto-acquire (mil:2): idle soldiers attack the nearest enemy unit in their line of sight (Stand Ground: only
 * within reach); aggressive animals (lions) go for units near them. Each unit looks every 10 ticks, staggered.
 * Runs after separation, so the unit grid is current.
 */
export function targetSystem(w: World): void {
  const e = w.ents;
  const phase = w.tick % 10;
  for (let s = phase; s < e.top; s += 10) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const head = w.orders[s]?.[0];
    // Idle units look around; so do units on an attack-move (they stop to fight, then march on).
    const marching = head?.k === 'move' && head.am === true;
    if (head && !marching) continue;
    const t = TYPES[e.type[s]!]!;
    const owner = e.owner[s]!;
    const lion = owner === 0 && t.animal?.behavior === 'aggressive';
    if (!lion && (owner === 0 || isVillager(w, s) || t.unit?.noAutoAttack || !canAttack(w, s))) continue;
    const st = w.stats(owner, e.type[s]!);
    const reach = st.range > 0 ? st.range : t.radius + 0.25;
    const look = e.stance[s] === 1 ? reach + 0.5 : lion ? 3 : st.los;
    const x = e.x[s]!;
    const y = e.y[s]!;
    let best = -1;
    let bestD = Infinity;
    w.grid.forEachNear(x, y, look + 0.6, (j) => {
      if (j === s || !e.alive[j] || e.kind[j] !== EKind.unit) return;
      if (lion ? e.owner[j] === 0 || TYPES[e.type[j]!]!.moveClass === MOVE_WATER : !autoHostile(w, s, j) || e.owner[j] === 0) return; // soldiers ignore wildlife; predators, ships
      if (!lion && !w.fog.vis[owner]![Math.floor(e.y[j]!) * w.map.w + Math.floor(e.x[j]!)]) return;
      const d = edgeDist(w, s, j);
      if (d > look || d > bestD || (d === bestD && j > best)) return;
      best = j;
      bestD = d;
    });
    if (best < 0) continue;
    if (marching) {
      // Fight first, then resume the march (the move order stays queued behind the attack).
      w.orders[s]!.unshift({ k: 'attack', h: e.handleOf(best), hunt: false, retarget: 0, windup: 0, auto: true });
      w.paths[s] = undefined;
      w.pathing.cancel(s);
    } else startAttack(w, s, e.handleOf(best), false, true);
  }
}

/** Animals: gazelles flee from attackers; elephants and predators fight back (econ:1.1). */
function reactToAttack(w: World, s: number, attacker: number, fromX: number, fromY: number): void {
  const e = w.ents;
  const a = TYPES[e.type[s]!]!.animal!;
  if (a.behavior === 'flee') {
    const dx = e.x[s]! - fromX;
    const dy = e.y[s]! - fromY;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const x = Math.min(w.map.w - 0.5, Math.max(0.5, e.x[s]! + (dx / d) * 5));
    const y = Math.min(w.map.h - 0.5, Math.max(0.5, e.y[s]! + (dy / d) * 5));
    w.orders[s] = [{ k: 'move', x: Math.round(x * 256) / 256, y: Math.round(y * 256) / 256 }];
    w.paths[s] = undefined;
    w.pathing.cancel(s);
  } else if (attacker >= 0 && w.orders[s]?.[0]?.k !== 'attack') {
    w.orders[s] = [{ k: 'attack', h: e.handleOf(attacker), hunt: false, retarget: 0, windup: 0, auto: true }];
    w.paths[s] = undefined;
  }
}

/**
 * Start an attack order on a hostile unit or building (villagers attacking animals are hunting). `auto` marks
 * orders the unit gave itself (auto-acquire, retaliation).
 */
export function startAttack(w: World, s: number, targetHandle: number, queue: boolean, auto = false): boolean {
  const e = w.ents;
  const t = e.slotOf(targetHandle);
  if (t < 0 || t === s || e.kind[s] !== EKind.unit || !hostile(w, s, t)) return false;
  if (!canAttack(w, s)) return false;
  const hunting = !!TYPES[e.type[t]!]!.animal && isVillager(w, s);
  const order = { k: 'attack' as const, h: targetHandle, hunt: hunting, retarget: 0, windup: 0, auto };
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
    const st = attackStats(w, e.owner[s]!, e.type[s]!, isVillager(w, s), o.hunt);
    const dx = e.x[t]! - e.x[s]!;
    const dy = e.y[t]! - e.y[s]!;
    const building = e.kind[t] === EKind.building;
    const d = edgeDist(w, s, t);
    // Ranged: range to the target's edge. Melee: touching (buildings: the same reach as villager work).
    const reach = st.range > 0 ? st.range : building ? REACH : TYPES[e.type[s]!]!.radius + 0.25;
    // Self-given orders give up when the target escapes: Stand Ground never chases, others leash at LOS + 3.
    if (o.auto && d > reach && (e.stance[s] === 1 || d > w.stats(e.owner[s]!, e.type[s]!).los + LEASH)) {
      finish(w, s);
      continue;
    }
    if (d < st.minRange) {
      // Too close for siege to fire (min range): self-given orders give up; commanded ones back off to firing
      // distance, straight away from the target (a few tries, then give up as unreachable).
      o.windup = 0;
      if (o.auto || (o.stall = (o.stall ?? 0) + 1) > 60) {
        finish(w, s);
        continue;
      }
      if (!w.paths[s]?.length) {
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const back = st.minRange - d + 0.6;
        const bx = Math.min(w.map.w - 0.5, Math.max(0.5, e.x[s]! - (dx / len) * back));
        const by = Math.min(w.map.h - 0.5, Math.max(0.5, e.y[s]! - (dy / len) * back));
        w.paths[s] = [Math.round(bx * 256) / 256, Math.round(by * 256) / 256];
      }
      continue;
    }
    if (d <= reach) {
      w.paths[s] = [];
      w.pathing.cancel(s);
      const f = dir16(dx, dy);
      if (f >= 0) e.facing[s] = f;
      if (e.act[s] !== Act.attack) {
        e.act[s] = Act.attack;
        e.actStart[s] = w.tick;
      }
      if (o.windup > 0) {
        if (--o.windup === 0) {
          w.events.push({ t: 'strike', h: e.handleOf(s), tgt: e.handleOf(t), type: e.type[s]!, x: e.x[s]!, y: e.y[s]!, missile: !!st.missile, building });
          if (st.missile) launch(w, s, t, st.missile, o.hunt);
          else {
            const tx = e.x[t]!;
            const ty = e.y[t]!;
            hit(w, s, t, damageBetween(st.atk, w.stats(e.owner[t]!, e.type[t]!).arm, building));
            const tr = TYPES[e.type[s]!]!.unit?.trample ?? 0;
            if (tr > 0 && e.alive[s]) splash(w, s, e.owner[s]!, e.type[s]!, tx, ty, tr, t, false, 1);
          }
        }
      } else if (e.timer[s]! <= 0) {
        e.timer[s] = st.reload;
        e.actStart[s] = w.tick; // restart the attack animation on each swing
        o.windup = WINDUP_TICKS;
      }
      continue;
    }
    o.windup = 0; // out of reach: the swing is abandoned
    if (building) {
      // Buildings don't move: path once to the footprint (ranged units stop as soon as they are in range).
      if (w.paths[s] === undefined && !w.pathing.pending(s)) {
        const size = TYPES[e.type[t]!]!.size;
        const x0 = Math.round(e.x[t]! - size / 2);
        const y0 = Math.round(e.y[t]! - size / 2);
        // The goal counts tiles along the worst axis (a square) but a shot needs the true distance (a circle): a
        // ship at the square's corner stood 6.4 tiles from a Dock with range 5 and gave up (M13.7). Aim for the
        // square that fits inside the circle (range / √2, less half a tile for tile centres).
        const reachTiles = st.range > 0 ? Math.max(1, Math.floor(st.range * 0.7071 - 0.5)) : 1;
        w.pathing.request(s, { k: 'rect', x0, y0, x1: x0 + size - 1, y1: y0 + size - 1, range: reachTiles });
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
    if (o.auto && e.stuck[s]! > 40) {
      // Blocked for 2 s (a scrum around the target): let the next scan pick an enemy we can reach.
      e.stuck[s] = 0;
      finish(w, s);
      continue;
    }
    if (path !== undefined && !path.length && d <= 1.5) {
      // Arrived on (or beside) the target's tile but not touching it: a tile path can't get closer, so step
      // straight at it (separation stops us at arm's length, inside melee reach).
      w.paths[s] = [e.x[t]!, e.y[t]!];
      continue;
    }
    if (path !== undefined && !path.length && d > 1.5) {
      // Arrived as close as the map allows but still far off: the target is somewhere we can't reach (a gazelle
      // that fled across water or into a forest). Give up after repeated tries rather than chase forever.
      o.stall = (o.stall ?? 0) + 1;
      if (o.stall > 20) {
        finish(w, s);
        continue;
      }
    }
    if ((path === undefined || (!path.length && d > reach) || (stale && ++o.retarget % 10 === 0)) && !w.pathing.pending(s)) {
      w.pathing.request(s, { k: 'point', tx: Math.floor(e.x[t]!), ty: Math.floor(e.y[t]!), x: e.x[t]!, y: e.y[t]! });
    }
  }
}

/**
 * Towers (mil:1c): a finished tower shoots the nearest hostile unit it can see within range, and keeps shooting
 * the same one while it stays in range. Arrows fly like any missile (dodgeable, damage on landing). Towers ignore
 * wildlife and buildings; Town Centers have no attack in 1.0c.
 */
export function towerSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.building || e.build[s]! < 1) continue;
    const owner = e.owner[s]!;
    const st = w.stats(owner, e.type[s]!);
    if (st.range <= 0) continue;
    if (e.timer[s]! > 0) {
      e.timer[s] = e.timer[s]! - 1;
      continue;
    }
    const half = TYPES[e.type[s]!]!.size / 2;
    const bx = e.x[s]!;
    const by = e.y[s]!;
    // Distance from the tower's footprint edge to the unit's edge.
    const gap = (j: number): number => {
      const dx = Math.max(0, Math.abs(e.x[j]! - bx) - half);
      const dy = Math.max(0, Math.abs(e.y[j]! - by) - half);
      const d = Math.sqrt(dx * dx + dy * dy) - TYPES[e.type[j]!]!.radius;
      return d < 0 ? 0 : d;
    };
    const fair = (j: number): boolean =>
      e.alive[j] === 1 && e.kind[j] === EKind.unit && e.owner[j] !== 0 && autoHostile(w, s, j) && !!w.fog.vis[owner]![Math.floor(e.y[j]!) * w.map.w + Math.floor(e.x[j]!)];
    let t = e.slotOf(e.target[s]!);
    if (t >= 0 && (!fair(t) || gap(t) > st.range)) t = -1;
    if (t < 0) {
      let bestD = Infinity;
      w.grid.forEachNear(bx, by, st.range + half + 1, (j) => {
        if (!fair(j)) return;
        const d = gap(j);
        if (d > st.range || d > bestD || (d === bestD && j > t)) return;
        t = j;
        bestD = d;
      });
    }
    if (t < 0) {
      e.target[s] = NO_ENTITY;
      continue;
    }
    e.target[s] = e.handleOf(t);
    e.timer[s] = st.reloadTicks;
    const def = TYPES[e.type[s]!]!.building!.projectile ?? { speed: 8 };
    w.events.push({ t: 'strike', h: e.handleOf(s), tgt: e.handleOf(t), type: e.type[s]!, x: bx, y: by, missile: true, building: false });
    launch(w, s, t, def, false);
  }
}

/** Release a missile from `s` at `t`: aim at where the target is now; a failed accuracy roll lands it nearby. */
function launch(w: World, s: number, t: number, def: ProjectileDef, hunt: boolean): void {
  const e = w.ents;
  let x1 = e.x[t]!;
  let y1 = e.y[t]!;
  if (e.kind[t] === EKind.unit && w.players[e.owner[s]!]!.stats.flags.has('ballistics')) {
    // Ballistics (econ:5): lead a moving target — aim where its last step carries it by the time the missile lands.
    const vx = e.x[t]! - e.px[t]!;
    const vy = e.y[t]! - e.py[t]!;
    const d0 = Math.sqrt((x1 - e.x[s]!) * (x1 - e.x[s]!) + (y1 - e.y[s]!) * (y1 - e.y[s]!));
    const flight = Math.max(1, Math.round((d0 / def.speed) * 20));
    x1 = Math.min(w.map.w - 0.01, Math.max(0, x1 + vx * flight));
    y1 = Math.min(w.map.h - 0.01, Math.max(0, y1 + vy * flight));
  }
  if ((def.accuracy ?? 1) < 1 && !w.rng.combat.chance(def.accuracy!)) {
    // A miss lands 0.6–1.2 tiles off, in a random direction (sector of 16 via the trig table).
    const d = 0.6 + w.rng.combat.float() * 0.6;
    const dir = w.rng.combat.int(16);
    x1 += DIR16_X[dir]! * d;
    y1 += DIR16_Y[dir]! * d;
  }
  const dx = x1 - e.x[s]!;
  const dy = y1 - e.y[s]!;
  const dist = Math.sqrt(dx * dx + dy * dy);
  w.projectiles.push({
    type: e.type[s]!,
    owner: e.owner[s]!,
    src: e.handleOf(s),
    target: e.handleOf(t),
    x0: e.x[s]!,
    y0: e.y[s]!,
    x1: Math.round(x1 * 256) / 256,
    y1: Math.round(y1 * 256) / 256,
    t0: w.tick,
    dur: Math.max(1, Math.round((dist / def.speed) * 20)),
    hunt,
    arc: !!def.arc,
  });
}

/** Missiles land: the target takes the blow if it is still where the missile was aimed (buildings always are). */
export function projectileSystem(w: World): void {
  const e = w.ents;
  let k = 0;
  const list = w.projectiles;
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    if (w.tick < p.t0 + p.dur) {
      list[k++] = p;
      continue;
    }
    const t = e.slotOf(p.target);
    const blast = w.stats(p.owner, p.type).blastRadius;
    w.events.push({ t: 'impact', type: p.type, x: p.x1, y: p.y1, hit: t >= 0 });
    if (blast > 0) {
      // Stones burst where they land: everyone near the impact point is hurt, own units included (mil:2).
      splash(w, e.slotOf(p.src), p.owner, p.type, p.x1, p.y1, blast, -1, true, 0.5, p.x0, p.y0);
      if (TYPES[p.type]!.unit?.tags.includes('fellsTrees')) fellTrees(w, p.x1, p.y1, blast);
      continue;
    }
    if (t < 0) continue;
    const tt = TYPES[e.type[t]!]!;
    let on: boolean;
    if (e.kind[t] === EKind.building) {
      const h = tt.size / 2 + 0.1;
      on = Math.abs(p.x1 - e.x[t]!) <= h && Math.abs(p.y1 - e.y[t]!) <= h;
    } else {
      const dx = p.x1 - e.x[t]!;
      const dy = p.y1 - e.y[t]!;
      const r = tt.radius + 0.15;
      on = dx * dx + dy * dy <= r * r;
    }
    if (!on) continue;
    const atk = p.hunt ? HUNT_ATK : w.stats(p.owner, p.type).atk;
    const src = e.slotOf(p.src);
    hit(w, src, t, damageBetween(atk, w.stats(e.owner[t]!, e.type[t]!).arm, e.kind[t] === EKind.building), p.x0, p.y0, p.owner);
  }
  list.length = k;
}

/**
 * Area damage around (x, y) within `radius` (to each victim's edge). `friendly`: own and allied units are hit too
 * (stones); otherwise only hostiles (trample). Damage tapers linearly to `edge` × full at the rim. `skip` is a
 * victim already hit directly. Order is slot order — deterministic.
 */
/** A Heavy Catapult's stone knocks down the trees it lands among (mil:1a "kills trees"). */
function fellTrees(w: World, x: number, y: number, radius: number): void {
  const r2 = radius * radius;
  for (let ty = Math.max(0, Math.floor(y - radius)); ty <= Math.min(w.map.h - 1, Math.floor(y + radius)); ty++) {
    for (let tx = Math.max(0, Math.floor(x - radius)); tx <= Math.min(w.map.w - 1, Math.floor(x + radius)); tx++) {
      const i = w.map.resAt[ty * w.map.w + tx]! - 1;
      if (i < 0 || RESOURCE_KINDS[w.res.kind[i]!]!.job !== 'wood') continue;
      const dx = tx + 0.5 - x;
      const dy = ty + 0.5 - y;
      if (dx * dx + dy * dy <= r2) depleteNode(w, i);
    }
  }
}

export function splash(w: World, attacker: number, owner: number, type: number, x: number, y: number, radius: number, skip: number, friendly: boolean, edge: number, fromX = x, fromY = y): void {
  const e = w.ents;
  const atk = w.stats(owner, type).atk;
  const victims: number[] = [];
  const consider = (j: number): void => {
    if (j === skip || !e.alive[j] || j === attacker) return;
    if (!friendly && e.owner[j] !== 0 && allied(w, owner, e.owner[j]!)) return;
    victims.push(j);
  };
  w.grid.forEachNear(x, y, radius + 1, consider);
  // Buildings (not in the unit grid): scan the footprints touching the blast.
  const x0 = Math.max(0, Math.floor(x - radius - 1));
  const x1 = Math.min(w.map.w - 1, Math.floor(x + radius + 1));
  const y0 = Math.max(0, Math.floor(y - radius - 1));
  const y1 = Math.min(w.map.h - 1, Math.floor(y + radius + 1));
  const seen: number[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const bh = w.map.bldAt[ty * w.map.w + tx]! - 1;
      const b = bh >= 0 ? e.slotOf(bh) : -1;
      if (b >= 0 && !seen.includes(b)) {
        seen.push(b);
        consider(b);
      }
    }
  }
  victims.sort((a, b) => a - b);
  for (const j of victims) {
    if (!e.alive[j]) continue;
    const tt = TYPES[e.type[j]!]!;
    let d: number;
    if (e.kind[j] === EKind.building) {
      const h = tt.size / 2;
      const dx = Math.max(0, Math.abs(x - e.x[j]!) - h);
      const dy = Math.max(0, Math.abs(y - e.y[j]!) - h);
      d = Math.sqrt(dx * dx + dy * dy);
    } else {
      const dx = e.x[j]! - x;
      const dy = e.y[j]! - y;
      d = Math.max(0, Math.sqrt(dx * dx + dy * dy) - tt.radius);
    }
    if (d > radius) continue;
    const k = 1 - (1 - edge) * (d / radius);
    const dmg = damageBetween(atk, w.stats(e.owner[j]!, e.type[j]!).arm, e.kind[j] === EKind.building) * k;
    hit(w, attacker >= 0 && e.alive[attacker] ? attacker : -1, j, dmg, fromX, fromY, owner);
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
