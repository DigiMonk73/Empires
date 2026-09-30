import { Act, EKind } from '../core/entities.ts';
import { NO_ENTITY } from '../core/handles.ts';
import { TYPES } from '../rules/registry.ts';
import type { Order, World } from '../world.ts';
import { approachRect, findDropSite, isVillager, JOBS, REACH } from './gather.ts';

/**
 * Farms (econ:1.4): a completed farm holds the player's farm food (250 base; +75 per farm tech; Sumerian ×2). One
 * farmer works it at a time, standing in the field; food goes to a Granary or Town Center. An exhausted farm
 * disappears — in 1.0 there is no reseeding.
 */
type FarmOrder = Extract<Order, { k: 'farm' }>;
const FARM_JOB = JOBS.indexOf('farm') + 1;

function farmRect(w: World, f: number): [number, number, number, number] {
  const half = TYPES[w.ents.type[f]!]!.size / 2;
  return [w.ents.x[f]! - half, w.ents.y[f]! - half, w.ents.x[f]! + half, w.ents.y[f]! + half];
}

function inside(x: number, y: number, r: [number, number, number, number], pad = 0): boolean {
  return x >= r[0] - pad && y >= r[1] - pad && x <= r[2] + pad && y <= r[3] + pad;
}

/** Is `farm` free for villager `s` (nobody else is farming it)? */
function farmFree(w: World, f: number, s: number): boolean {
  const other = w.ents.slotOf(w.ents.target[f]!);
  if (other < 0 || other === s) return true;
  const o = w.orders[other]?.[0];
  return !(o && o.k === 'farm' && o.h === w.ents.handleOf(f));
}

export function startFarm(w: World, s: number, farmHandle: number, queue: boolean): boolean {
  const e = w.ents;
  const f = e.slotOf(farmHandle);
  if (!isVillager(w, s) || f < 0 || TYPES[e.type[f]!]!.building?.kind !== 'farm' || e.build[f]! < 1) return false;
  if (e.owner[f] !== e.owner[s] || !farmFree(w, f, s)) return false;
  const order: FarmOrder = { k: 'farm', h: farmHandle, phase: 0, drop: NO_ENTITY, retry: 0 };
  const q = w.orders[s];
  if (queue && q && q.length) q.push(order);
  else {
    if (e.carryJob[s] && e.carryJob[s] !== FARM_JOB) {
      e.carryJob[s] = 0;
      e.carryAmt[s] = 0;
    }
    w.orders[s] = [order];
    w.paths[s] = undefined;
    w.pathing.cancel(s);
  }
  e.target[f] = e.handleOf(s);
  return true;
}

/** Completed farm: fill it with the owner's farm food. */
export function sowFarm(w: World, f: number): void {
  w.ents.stock[f] = w.players[w.ents.owner[f]!]!.stats.farmFood;
}

function removeFarm(w: World, f: number): void {
  const e = w.ents;
  w.events.push({ t: 'farmDepleted', h: e.handleOf(f), player: e.owner[f]! });
  w.removeEntity(e.handleOf(f));
}

function finish(w: World, s: number): void {
  const q = w.orders[s]!;
  q.shift();
  w.paths[s] = undefined;
  if (!q.length) w.orders[s] = undefined;
  w.ents.act[s] = Act.idle;
  w.ents.actStart[s] = w.tick;
}

export function farmSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const o = w.orders[s]?.[0];
    if (!o || o.k !== 'farm') continue;
    const stats = w.players[e.owner[s]!]!.stats;
    const cap = stats.carry.farm;
    const f = e.slotOf(o.h);
    if (f < 0 && o.phase !== 2) {
      if (e.carryAmt[s]! > 0) {
        o.phase = 2;
        o.drop = NO_ENTITY;
        w.paths[s] = undefined;
      } else {
        finish(w, s);
        continue;
      }
    }
    if (o.phase === 0) {
      const r = farmRect(w, f);
      if (e.carryAmt[s]! >= cap - 1e-9) {
        o.phase = 2;
        o.drop = NO_ENTITY;
        w.paths[s] = undefined;
      } else if (inside(e.x[s]!, e.y[s]!, r)) {
        o.phase = 1;
        w.paths[s] = [];
        w.pathing.cancel(s);
        e.act[s] = Act.gather;
        e.actStart[s] = w.tick;
      } else if (w.paths[s] === undefined && !w.pathing.pending(s)) {
        // Walk onto the field (farms are walkable): aim a little inside the corner nearest to us.
        const x = Math.min(r[2] - 0.6, Math.max(r[0] + 0.6, e.x[s]!));
        const y = Math.min(r[3] - 0.6, Math.max(r[1] + 0.6, e.y[s]!));
        w.pathing.request(s, { k: 'point', tx: Math.floor(x), ty: Math.floor(y), x, y });
      } else if (w.paths[s] !== undefined && !w.paths[s]!.length) {
        if (++o.retry > 4) finish(w, s);
        else w.paths[s] = undefined;
      }
      continue;
    }
    if (o.phase === 1) {
      if (!inside(e.x[s]!, e.y[s]!, farmRect(w, f), 0.3)) {
        o.phase = 0;
        w.paths[s] = undefined;
        continue;
      }
      if (e.carryJob[s] !== FARM_JOB) {
        e.carryJob[s] = FARM_JOB;
        e.carryAmt[s] = 0;
      }
      const take = Math.min(stats.work.farm, e.stock[f]!, cap - e.carryAmt[s]!);
      e.stock[f] = e.stock[f]! - take;
      e.carryAmt[s] = e.carryAmt[s]! + take;
      if (e.stock[f]! <= 1e-9) removeFarm(w, f);
      if (e.carryAmt[s]! >= cap - 1e-9 || !e.alive[f]) {
        o.phase = 2;
        o.drop = NO_ENTITY;
        w.paths[s] = undefined;
        e.act[s] = Act.idle;
      }
      continue;
    }
    // Phase 2: deliver to a Granary or Town Center.
    let ds = e.slotOf(o.drop);
    if (ds < 0) {
      o.drop = findDropSite(w, s, 'farm');
      ds = e.slotOf(o.drop);
      if (ds < 0) continue;
      w.paths[s] = undefined;
    }
    const half = TYPES[e.type[ds]!]!.size / 2;
    const dx = Math.max(0, Math.abs(e.x[s]! - e.x[ds]!) - half);
    const dy = Math.max(0, Math.abs(e.y[s]! - e.y[ds]!) - half);
    if (Math.sqrt(dx * dx + dy * dy) <= REACH) {
      const p = w.players[e.owner[s]!]!;
      p.res[0] = p.res[0]! + e.carryAmt[s]!;
      w.events.push({ t: 'deposit', player: p.id, res: 0, amount: e.carryAmt[s]! });
      e.carryAmt[s] = 0;
      e.carryJob[s] = 0;
      w.paths[s] = undefined;
      if (e.slotOf(o.h) >= 0) o.phase = 0;
      else finish(w, s);
    } else if (w.paths[s] === undefined && !w.pathing.pending(s)) {
      const size = TYPES[e.type[ds]!]!.size;
      const x0 = Math.round(e.x[ds]! - size / 2);
      const y0 = Math.round(e.y[ds]! - size / 2);
      w.pathing.request(s, { k: 'rect', x0, y0, x1: x0 + size - 1, y1: y0 + size - 1, range: 1 });
    } else if (w.paths[s] !== undefined && !w.paths[s]!.length) {
      const h2 = TYPES[e.type[ds]!]!.size / 2;
      if (!approachRect(w, s, e.x[ds]! - h2, e.y[ds]! - h2, e.x[ds]! + h2, e.y[ds]! + h2)) w.paths[s] = undefined;
    }
  }
}
