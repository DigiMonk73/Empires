import { MOVE_LAND } from '../../data/terrain.ts';
import { EKind } from '../core/entities.ts';
import { nearestTile } from '../path/service.ts';
import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';
import { edgeDist } from './combat.ts';
import { REACH } from './gather.ts';

/**
 * Transports (M8.4, D37): a Light Transport carries 5 land units, a Heavy Transport 10 (mil:1b). Land units
 * right-clicked onto an own transport walk to the shore beside it and step aboard — they leave the map and ride
 * as records in the transport's cargo (population still counts them). Right-clicked on land, the transport sails
 * to the water nearest that point and lands everyone on the free ground around it (L: land here). A sunk
 * transport takes its cargo down with it; units come ashore as the transport's owner (a converted transport
 * converts its cargo).
 */
export interface CargoUnit {
  type: number;
  hp: number;
  faith: number;
  stance: number;
  carryJob: number;
  carryAmt: number;
}

/** How far (tiles) from the transport's centre cargo can be set down. */
const LAND_RADIUS = 2.6;

export function isTransport(w: World, s: number): boolean {
  return TYPES[w.ents.type[s]!]!.unit?.cls === 'transport';
}

/** Free places aboard transport `t`. */
export function room(w: World, t: number): number {
  return w.stats(w.ents.owner[t]!, w.ents.type[t]!).capacity - (w.cargo[t]?.length ?? 0);
}

/** Start (or queue) boarding own transport `h`: any land unit (not ships, not buildings). */
export function startBoard(w: World, s: number, h: number, queue: boolean): boolean {
  const e = w.ents;
  const t = e.slotOf(h);
  if (t < 0 || t === s || e.kind[s] !== EKind.unit || TYPES[e.type[s]!]!.moveClass !== MOVE_LAND) return false;
  if (!isTransport(w, t) || e.owner[t] !== e.owner[s] || room(w, t) <= 0) return false;
  const order = { k: 'board' as const, h, retry: 0 };
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

/** Sail transport `s` to the shore nearest (x, y) and land its cargo there. */
export function startUnload(w: World, s: number, x: number, y: number): boolean {
  if (!isTransport(w, s) || !w.cargo[s]?.length) return false;
  w.orders[s] = [{ k: 'unload', x, y, retry: 0 }];
  w.paths[s] = undefined;
  w.pathing.cancel(s);
  w.ents.stuck[s] = 0;
  return true;
}

function finish(w: World, s: number): void {
  const q = w.orders[s]!;
  q.shift();
  w.paths[s] = undefined;
  if (!q.length) w.orders[s] = undefined;
}

/** Unit `s` steps aboard transport `t`: its record goes into the cargo and it leaves the map. */
function board(w: World, s: number, t: number): void {
  const e = w.ents;
  (w.cargo[t] ??= []).push({ type: e.type[s]!, hp: e.hp[s]!, faith: e.faith[s]!, stance: e.stance[s]!, carryJob: e.carryJob[s]!, carryAmt: e.carryAmt[s]! });
  w.removeEntity(e.handleOf(s));
}

/** Set transport `t`'s cargo down on the free land within LAND_RADIUS; whoever finds no room stays aboard. */
function landCargo(w: World, t: number): number {
  const e = w.ents;
  const cargo = w.cargo[t];
  if (!cargo?.length) return 0;
  const cx = e.x[t]!;
  const cy = e.y[t]!;
  const used = new Set<number>();
  let landed = 0;
  while (cargo.length) {
    const i = nearestTile(w.map.w, w.map.h, Math.floor(cx), Math.floor(cy), (tx, ty) => {
      if (used.has(ty * w.map.w + tx) || !w.map.passable(tx, ty, MOVE_LAND)) return false;
      const dx = tx + 0.5 - cx;
      const dy = ty + 0.5 - cy;
      return dx * dx + dy * dy <= LAND_RADIUS * LAND_RADIUS;
    });
    if (i < 0) break;
    used.add(i);
    const c = cargo.shift()!;
    const h = w.spawnUnit(c.type, e.owner[t]!, (i % w.map.w) + 0.5, Math.floor(i / w.map.w) + 0.5);
    const u = e.slotOf(h);
    e.hp[u] = Math.min(c.hp, w.stats(e.owner[t]!, c.type).hp);
    e.faith[u] = c.faith;
    e.stance[u] = c.stance;
    e.carryJob[u] = c.carryJob;
    e.carryAmt[u] = c.carryAmt;
    landed++;
  }
  if (!cargo.length) w.cargo[t] = undefined;
  return landed;
}

export function transportSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const o = w.orders[s]?.[0];
    if (o?.k === 'board') {
      const t = e.slotOf(o.h);
      if (t < 0 || e.owner[t] !== e.owner[s] || room(w, t) <= 0) {
        finish(w, s);
        continue;
      }
      if (edgeDist(w, s, t) <= REACH + 0.4) {
        board(w, s, t);
        continue;
      }
      if (w.paths[s] === undefined && !w.pathing.pending(s)) {
        const tx = Math.floor(e.x[t]!);
        const ty = Math.floor(e.y[t]!);
        w.pathing.request(s, { k: 'rect', x0: tx, y0: ty, x1: tx, y1: ty, range: 1 });
      } else if (w.paths[s] !== undefined && w.paths[s]!.length === 0) {
        if (++o.retry > 6) finish(w, s); // the transport isn't at a shore we can reach
        else w.paths[s] = undefined;
      }
    } else if (o?.k === 'unload') {
      if (!w.cargo[s]?.length) {
        finish(w, s);
        continue;
      }
      if (w.paths[s] === undefined && !w.pathing.pending(s)) {
        w.pathing.request(s, { k: 'point', tx: Math.floor(o.x), ty: Math.floor(o.y), x: o.x, y: o.y });
      } else if (w.paths[s] !== undefined && w.paths[s]!.length === 0) {
        landCargo(w, s); // as close as the water goes: land whoever fits
        finish(w, s);
      }
    }
  }
}
