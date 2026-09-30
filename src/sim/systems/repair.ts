import { Act, EKind } from '../core/entities.ts';
import { dir16 } from '../math/trig.ts';
import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';
import { edgeDist } from './combat.ts';
import { approachRect, isVillager, REACH } from './gather.ts';

/**
 * Repair (M8.3, D36): villagers mend their player's damaged buildings, ships and siege weapons (mil:4 "buildings
 * and ships are repaired by villagers"). One repairer restores HP at the repairer rate 0.4 (econ:1.2) of the
 * builder's, measured against the target's build or train time — a full repair by one villager takes 2.5× as
 * long as building it; several stack like builders, (n + 2) / 3. Buildings mend for free; ships and siege cost
 * half their price pro rata (mil:1b "costs a share of the ship's wood/gold" — the share is unverified), and the
 * work waits while the player can't pay.
 */
const REPAIR_COST_SHARE = 0.5;

/** Can `player` repair slot `t` now (own, finished, damaged, and a building, ship or siege weapon)? */
export function repairable(w: World, player: number, t: number): boolean {
  const e = w.ents;
  if (t < 0 || !e.alive[t] || e.owner[t] !== player) return false;
  const tt = TYPES[e.type[t]!]!;
  if (e.hp[t]! >= w.stats(player, e.type[t]!).hp - 1e-9) return false;
  if (e.kind[t] === EKind.building) return e.build[t]! >= 1 && tt.building?.kind !== 'farm';
  return !!tt.unit && (tt.unit.tags.includes('ship') || tt.unit.cls === 'siege');
}

/** Start (or queue) a repair order on `h`. */
export function startRepair(w: World, s: number, h: number, queue: boolean): boolean {
  if (!isVillager(w, s)) return false;
  const t = w.ents.slotOf(h);
  if (!repairable(w, w.ents.owner[s]!, t)) return false;
  const order = { k: 'repair' as const, h, phase: 0 as 0 | 1, retry: 0 };
  const q = w.orders[s];
  if (queue && q && q.length) q.push(order);
  else {
    w.orders[s] = [order];
    w.paths[s] = undefined;
    w.pathing.cancel(s);
    w.ents.stuck[s] = 0;
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

/** Scratch: repairers per target slot this tick. */
const repairers: number[] = [];

export function repairSystem(w: World): void {
  const e = w.ents;
  repairers.length = 0;
  // Pass 1: walk into reach; count those working.
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const o = w.orders[s]?.[0];
    if (!o || o.k !== 'repair') continue;
    const t = e.slotOf(o.h);
    if (!repairable(w, e.owner[s]!, t)) {
      finish(w, s);
      continue;
    }
    if (edgeDist(w, s, t) <= REACH) {
      o.phase = 1;
      w.paths[s] = [];
      w.pathing.cancel(s);
      repairers[t] = (repairers[t] ?? 0) + 1;
      const f = dir16(e.x[t]! - e.x[s]!, e.y[t]! - e.y[s]!);
      if (f >= 0) e.facing[s] = f;
      continue;
    }
    if (o.phase === 1) {
      o.phase = 0; // the ship drifted off, or we were pushed away
      w.paths[s] = undefined;
    }
    if (e.act[s] === Act.build) {
      e.act[s] = Act.idle;
      e.actStart[s] = w.tick;
    }
    const size = e.kind[t] === EKind.building ? TYPES[e.type[t]!]!.size : 1;
    const x0 = e.kind[t] === EKind.building ? Math.round(e.x[t]! - size / 2) : Math.floor(e.x[t]!);
    const y0 = e.kind[t] === EKind.building ? Math.round(e.y[t]! - size / 2) : Math.floor(e.y[t]!);
    if (w.paths[s] === undefined && !w.pathing.pending(s)) {
      w.pathing.request(s, { k: 'rect', x0, y0, x1: x0 + size - 1, y1: y0 + size - 1, range: 1 });
    } else if (w.paths[s] !== undefined && w.paths[s]!.length === 0) {
      if (e.kind[t] === EKind.building && approachRect(w, s, x0, y0, x0 + size, y0 + size)) continue;
      if (++o.retry > 4) finish(w, s); // out of reach (a ship away from the shore)
      else w.paths[s] = undefined;
    }
  }
  // Pass 2: mend, paying for ships and siege as the HP comes back.
  for (let t = 0; t < repairers.length; t++) {
    const n = repairers[t];
    if (!n) continue;
    const owner = e.owner[t]!;
    const p = w.players[owner]!;
    const st = w.stats(owner, e.type[t]!);
    const ticks = e.kind[t] === EKind.building ? st.buildTicks : st.trainTicks;
    let dhp = Math.min(st.hp - e.hp[t]!, ((n + 2) / 3) * ((p.stats.work.repair * 20) / Math.max(1, ticks)) * st.hp);
    if (e.kind[t] !== EKind.building) {
      // Pay pro rata; with too little of anything, mend only what can be paid for.
      const frac = dhp / st.hp;
      let k = 1;
      for (let r = 0; r < 4; r++) {
        const due = st.cost[r]! * REPAIR_COST_SHARE * frac;
        if (due > 0) k = Math.min(k, p.res[r]! / due);
      }
      dhp *= Math.max(0, k);
      for (let r = 0; r < 4; r++) p.res[r] = p.res[r]! - st.cost[r]! * REPAIR_COST_SHARE * (dhp / st.hp);
    }
    e.hp[t] = Math.min(st.hp, e.hp[t]! + dhp);
    const working = dhp > 0;
    for (let s = 0; s < e.top; s++) {
      const o = w.orders[s]?.[0];
      if (!e.alive[s] || o?.k !== 'repair' || o.phase !== 1 || e.slotOf(o.h) !== t) continue;
      if (working && e.act[s] !== Act.build) {
        e.act[s] = Act.build; // the hammer
        e.actStart[s] = w.tick;
      } else if (!working && e.act[s] === Act.build) {
        e.act[s] = Act.idle; // waiting for resources
        e.actStart[s] = w.tick;
      }
    }
  }
}
