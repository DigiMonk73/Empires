import { Act, EKind } from '../core/entities.ts';
import { dir16 } from '../math/trig.ts';
import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';
import { edgeDist, hostile, kill } from './combat.ts';
import { approachRect, REACH } from './gather.ts';

/**
 * Priests (mil:3). Converting: from range (10; Afterlife +3) with full faith the priest chants, and each chant
 * (1.5 s) converts with probability 30% × conversionRate (Astrology ×1.3) ÷ the target's resistance (chariots 8,
 * ships 2, Macedonian units 4). A conversion empties the faith, which refills at 2/s (Fanaticism +1.5). Priests,
 * and buildings other than Town Centers and Wonders, need Monotheism; buildings are converted from alongside.
 * Healing: alongside, 3 HP/s × healRate (Medicine ×3); a priest keeps healing wounded allies near it. Priests
 * never convert on their own — unless attacked, when they answer the attacker.
 */
export const CHANT_TICKS = 30;
export const BASE_CONVERT = 0.3;
export const FAITH_MAX = 100;
const TICKS = 20;

export function isPriest(w: World, s: number): boolean {
  return TYPES[w.ents.type[s]!]!.unit?.cls === 'priest';
}

/** Can `s`'s owner's priests convert `t` at all? */
export function convertible(w: World, s: number, t: number): string | null {
  const e = w.ents;
  if (t < 0 || !e.alive[t]) return 'gone';
  if (!hostile(w, s, t) || e.owner[t] === 0) return 'not an enemy';
  const mono = w.players[e.owner[s]!]!.stats.flags.has('monotheism');
  const tt = TYPES[e.type[t]!]!;
  if (e.kind[t] === EKind.building) {
    if (!mono) return 'needs Monotheism';
    if (tt.building!.kind === 'wonder' || tt.id === 'townCenter') return 'cannot be converted';
    if (e.build[t]! < 1) return 'not finished';
    return null;
  }
  if (tt.unit?.cls === 'priest' && !mono) return 'needs Monotheism';
  return null;
}

export function startConvert(w: World, s: number, h: number, queue: boolean, auto = false): boolean {
  const t = w.ents.slotOf(h);
  if (!isPriest(w, s) || convertible(w, s, t)) return false;
  push(w, s, { k: 'convert', h, chant: 0, auto }, queue);
  return true;
}

export function startHeal(w: World, s: number, h: number, queue: boolean, auto = false): boolean {
  const e = w.ents;
  const t = e.slotOf(h);
  if (!isPriest(w, s) || t < 0 || t === s || e.kind[t] !== EKind.unit || hostile(w, s, t) || e.owner[t] === 0) return false;
  if (TYPES[e.type[t]!]!.unit?.tags.includes('ship')) return false; // priests cannot heal boats (mil:3)
  push(w, s, { k: 'heal', h, auto }, queue);
  return true;
}

function push(w: World, s: number, o: { k: 'convert'; h: number; chant: number; auto: boolean } | { k: 'heal'; h: number; auto: boolean }, queue: boolean): void {
  const q = w.orders[s];
  if (queue && q?.length) q.push(o);
  else {
    w.orders[s] = [o];
    w.paths[s] = undefined;
    w.pathing.cancel(s);
    w.ents.stuck[s] = 0;
  }
}

function finish(w: World, s: number): void {
  const q = w.orders[s]!;
  q.shift();
  w.paths[s] = undefined;
  if (!q.length) w.orders[s] = undefined;
  w.ents.act[s] = Act.idle;
  w.ents.actStart[s] = w.tick;
}

/** Change sides: `t` joins `owner` (it keeps its hit points; pop is recounted; orders and queues drop). */
export function convert(w: World, t: number, owner: number, priest: number): void {
  const e = w.ents;
  const from = e.owner[t]!;
  e.owner[t] = owner;
  w.orders[t] = undefined;
  w.paths[t] = undefined;
  w.pathing.cancel(t);
  e.act[t] = Act.idle;
  e.actStart[t] = w.tick;
  if (w.prod[t]) w.prod[t] = undefined;
  w.players[owner]!.tally.conversions++;
  w.events.push({ t: 'converted', h: e.handleOf(t), from, to: owner, x: e.x[t]!, y: e.y[t]!, priest: priest >= 0 ? e.handleOf(priest) : -1 });
}

/** Faith refills, and each priest works its head order. */
export function priestSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit || !isPriest(w, s)) continue;
    const p = w.players[e.owner[s]!]!.stats;
    if (e.faith[s]! < FAITH_MAX) e.faith[s] = Math.min(FAITH_MAX, e.faith[s]! + p.faithRegen / TICKS);
    const o = w.orders[s]?.[0];
    if (!o) {
      if ((w.tick + s) % 10 === 0) autoHeal(w, s);
      continue;
    }
    if (o.k !== 'convert' && o.k !== 'heal') continue;
    const t = e.slotOf(o.h);
    if (t < 0) {
      finish(w, s);
      continue;
    }
    if (o.k === 'convert') {
      if (convertible(w, s, t)) {
        finish(w, s);
        continue;
      }
      const building = e.kind[t] === EKind.building;
      const reach = building ? REACH : w.stats(e.owner[s]!, e.type[s]!).range;
      const d = edgeDist(w, s, t);
      if (d > reach) {
        if (o.auto && d > reach + 4) {
          finish(w, s);
          continue;
        }
        approach(w, s, t, reach, o);
        continue;
      }
      w.paths[s] = [];
      w.pathing.cancel(s);
      face(w, s, t);
      if (e.faith[s]! < FAITH_MAX) {
        // Rejuvenating: wait, still facing the target.
        if (e.act[s] !== Act.idle) {
          e.act[s] = Act.idle;
          e.actStart[s] = w.tick;
        }
        continue;
      }
      if (e.act[s] !== Act.convert) {
        e.act[s] = Act.convert;
        e.actStart[s] = w.tick;
      }
      if (++o.chant % CHANT_TICKS !== 0) continue;
      const resist = w.stats(e.owner[t]!, e.type[t]!).convResist || 1;
      if (w.rng.conversion.chance((BASE_CONVERT * p.conversionRate) / resist)) {
        convert(w, t, e.owner[s]!, s);
        e.faith[s] = 0;
        finish(w, s);
      }
    } else {
      const max = w.stats(e.owner[t]!, e.type[t]!).hp;
      if (!e.alive[t] || hostile(w, s, t) || e.hp[t]! >= max) {
        finish(w, s);
        if (!w.orders[s]) autoHeal(w, s);
        continue;
      }
      const reach = TYPES[e.type[t]!]!.radius + 0.35;
      const d = edgeDist(w, s, t);
      if (d > reach) {
        approach(w, s, t, reach, o);
        continue;
      }
      w.paths[s] = [];
      w.pathing.cancel(s);
      face(w, s, t);
      if (e.act[s] !== Act.heal) {
        e.act[s] = Act.heal;
        e.actStart[s] = w.tick;
      }
      e.hp[t] = Math.min(max, e.hp[t]! + p.healRate / TICKS); // healRate is HP/s: 3, Medicine ×3
    }
  }
}

function face(w: World, s: number, t: number): void {
  const f = dir16(w.ents.x[t]! - w.ents.x[s]!, w.ents.y[t]! - w.ents.y[s]!);
  if (f >= 0) w.ents.facing[s] = f;
}

/** Walk toward the target (buildings: to the footprint edge); give up if it proves unreachable. */
function approach(w: World, s: number, t: number, reach: number, o: { stall?: number }): void {
  const e = w.ents;
  if (e.act[s] !== Act.move && e.act[s] !== Act.idle) {
    e.act[s] = Act.idle;
    e.actStart[s] = w.tick;
  }
  if (w.pathing.pending(s)) return;
  const path = w.paths[s];
  if (e.kind[t] === EKind.building) {
    const h = TYPES[e.type[t]!]!.size / 2;
    if (path === undefined) {
      const x0 = Math.round(e.x[t]! - h);
      const y0 = Math.round(e.y[t]! - h);
      w.pathing.request(s, { k: 'rect', x0, y0, x1: x0 + TYPES[e.type[t]!]!.size - 1, y1: y0 + TYPES[e.type[t]!]!.size - 1, range: 1 });
    } else if (!path.length && !approachRect(w, s, e.x[t]! - h, e.y[t]! - h, e.x[t]! + h, e.y[t]! + h)) {
      if ((o.stall = (o.stall ?? 0) + 1) > 40) finish(w, s);
      else w.paths[s] = undefined;
    }
    return;
  }
  const end = path && path.length ? [path[path.length - 2]!, path[path.length - 1]!] : null;
  const stale = !end || Math.abs(end[0]! - e.x[t]!) + Math.abs(end[1]! - e.y[t]!) > Math.max(1.5, reach * 0.5);
  if (path !== undefined && !path.length && edgeDist(w, s, t) <= 1.5) {
    w.paths[s] = [e.x[t]!, e.y[t]!];
    return;
  }
  if (path !== undefined && !path.length && (o.stall = (o.stall ?? 0) + 1) > 20) {
    finish(w, s);
    return;
  }
  if (path === undefined || !path.length || stale) w.pathing.request(s, { k: 'point', tx: Math.floor(e.x[t]!), ty: Math.floor(e.y[t]!), x: e.x[t]!, y: e.y[t]! });
}

/** An idle priest tends the most wounded ally in sight (mil:3: "keeps auto-healing nearby units"). */
function autoHeal(w: World, s: number): void {
  const e = w.ents;
  const los = w.stats(e.owner[s]!, e.type[s]!).los;
  let best = -1;
  let worst = 1;
  w.grid.forEachNear(e.x[s]!, e.y[s]!, los, (j) => {
    if (j === s || !e.alive[j] || e.kind[j] !== EKind.unit || e.owner[j] === 0 || hostile(w, s, j)) return;
    if (TYPES[e.type[j]!]!.unit?.tags.includes('ship')) return;
    const k = e.hp[j]! / w.stats(e.owner[j]!, e.type[j]!).hp;
    if (k < worst || (k === worst && j < best)) {
      worst = k;
      best = j;
    }
  });
  if (best >= 0) startHeal(w, s, e.handleOf(best), false, true);
}

/**
 * Delete (the original's Delete key): own units and buildings are destroyed. A priest deleted in mid-conversion
 * with Martyrdom converts its target on the spot (RoR).
 */
export function deleteOwn(w: World, player: number, slots: readonly number[]): void {
  const e = w.ents;
  for (const s of slots) {
    if (!e.alive[s] || e.owner[s] !== player) continue;
    const o = w.orders[s]?.[0];
    if (o?.k === 'convert' && isPriest(w, s) && w.players[player]!.stats.flags.has('martyrdom')) {
      const t = e.slotOf(o.h);
      if (t >= 0 && !convertible(w, s, t) && edgeDist(w, s, t) <= w.stats(player, e.type[s]!).range) convert(w, t, player, s);
    }
    kill(w, s);
  }
}
