import type { Job } from '../../data/types.ts';
import { Act, EKind } from '../core/entities.ts';
import { NO_ENTITY } from '../core/handles.ts';
import { ResState } from '../core/resources.ts';
import { Occ } from '../map/tilemap.ts';
import { dir16 } from '../math/trig.ts';
import type { Goal } from '../path/goals.ts';
import { RESOURCE_KINDS, TYPES } from '../rules/registry.ts';
import type { Order, World } from '../world.ts';

/**
 * The villager gather cycle (econ:1.2): walk beside a resource node, work at the job's rate until the load is
 * full, carry it to the nearest reachable drop site that accepts it (TC: everything; Granary: forage and farm
 * food; Storage Pit: wood, gold, stone, meat, fish), deposit, and return. Depleted nodes vanish and the villager
 * moves on to the nearest node of the same kind.
 *
 * Fishing boats (M8.1, econ:1.3) run the same cycle on fish only — shore fish and the boats-only deep fish and
 * whales — at their own rate and carry (0.4/s, 15; Fishing Ship 20), look for more within 8 tiles, and deliver
 * only to a Dock. Villagers deliver shore fish to the TC or a Storage Pit, never to a Dock (1.0c).
 */
export const JOBS: readonly Job[] = ['forage', 'farm', 'hunt', 'fish', 'wood', 'gold', 'stone', 'build', 'repair'];
const RES_INDEX: Record<Job, number> = { forage: 0, farm: 0, hunt: 0, fish: 0, wood: 1, gold: 2, stone: 3, build: -1, repair: -1 };
const DROP_KEY: Record<Job, string> = { forage: 'food', farm: 'food', hunt: 'meat', fish: 'fish', wood: 'wood', gold: 'gold', stone: 'stone', build: '', repair: '' };

/** Max distance (tiles) from a villager to a node's or building's footprint to work or deposit. */
export const REACH = 0.9;
/** How far (tiles) a villager (a boat: 8, econ:1.3) looks for another node of the same kind when one runs out. */
const RETARGET_RADIUS = 10;
const BOAT_RETARGET_RADIUS = 8;
const RETRY_TICKS = 20;

type GatherOrder = Extract<Order, { k: 'gather' }>;

export function isVillager(w: World, slot: number): boolean {
  return TYPES[w.ents.type[slot]!]!.unit?.cls === 'villager';
}

export function isFishingBoat(w: World, slot: number): boolean {
  return TYPES[w.ents.type[slot]!]!.unit?.cls === 'fishingShip';
}

/** Euclidean distance from a point to a [x0,x1]×[y0,y1] rectangle (0 inside). */
function rectDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * The path service ends a rect goal on any tile adjacent to the rect (diagonals included), but work starts only
 * within REACH of the rect itself, so a unit standing off-centre on a diagonal tile can "arrive" out of reach
 * (≈1.03 tiles). When a unit has an empty path and is that close, walk it straight in: the nearest point of the
 * rect, backed off 0.45 toward the unit, always lies in the unit's own tile. Returns false when it isn't close
 * enough to be a pure reach problem (then the caller repaths or gives up as before).
 */
export function approachRect(w: World, s: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const ux = w.ents.x[s]!;
  const uy = w.ents.y[s]!;
  const d = rectDist(ux, uy, x0, y0, x1, y1);
  if (d <= REACH || d > 1.5) return false;
  const qx = ux < x0 ? x0 : ux > x1 ? x1 : ux;
  const qy = uy < y0 ? y0 : uy > y1 ? y1 : uy;
  const k = 0.45 / d;
  w.paths[s] = [qx + (ux - qx) * k, qy + (uy - qy) * k];
  w.pathing.cancel(s);
  return true;
}

function nodeDist(w: World, i: number, x: number, y: number): number {
  const size = RESOURCE_KINDS[w.res.kind[i]!]!.size;
  return rectDist(x, y, w.res.tx[i]!, w.res.ty[i]!, w.res.tx[i]! + size, w.res.ty[i]! + size);
}

function buildingRect(w: World, slot: number): [number, number, number, number] {
  const half = TYPES[w.ents.type[slot]!]!.size / 2;
  return [w.ents.x[slot]! - half, w.ents.y[slot]! - half, w.ents.x[slot]! + half, w.ents.y[slot]! + half];
}

function nodeGoal(w: World, i: number): Goal {
  const size = RESOURCE_KINDS[w.res.kind[i]!]!.size;
  return { k: 'rect', x0: w.res.tx[i]!, y0: w.res.ty[i]!, x1: w.res.tx[i]! + size - 1, y1: w.res.ty[i]! + size - 1, range: 1 };
}

function buildingGoal(w: World, slot: number): Goal {
  const size = TYPES[w.ents.type[slot]!]!.size;
  const x0 = Math.round(w.ents.x[slot]! - size / 2);
  const y0 = Math.round(w.ents.y[slot]! - size / 2);
  return { k: 'rect', x0, y0, x1: x0 + size - 1, y1: y0 + size - 1, range: 1 };
}

/** Is any tile adjacent to the rect in `region` (so a unit in that region can reach it)? */
function rectReachable(w: World, labels: Int32Array, region: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const W = w.map.w;
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
      if (x < 0 || y < 0 || x >= W || y >= w.map.h) continue;
      if (labels[y * W + x] === region) return true;
    }
  }
  return false;
}

function unitRegion(w: World, s: number): { labels: Int32Array; region: number } {
  const labels = w.pathing.regions.labels(TYPES[w.ents.type[s]!]!.moveClass);
  return { labels, region: labels[Math.floor(w.ents.y[s]!) * w.map.w + Math.floor(w.ents.x[s]!)] ?? 0 };
}

/** Nearest reachable completed drop site owned by the villager's player that accepts `job`'s resource. */
export function findDropSite(w: World, s: number, job: Job): number {
  const e = w.ents;
  const key = DROP_KEY[job];
  const boat = isFishingBoat(w, s);
  const { labels, region } = unitRegion(w, s);
  let best = NO_ENTITY;
  let bestD = Infinity;
  for (let b = 0; b < e.top; b++) {
    if (!e.alive[b] || e.kind[b] !== EKind.building || e.owner[b] !== e.owner[s] || e.build[b]! < 1) continue;
    const def = TYPES[e.type[b]!]!.building!;
    if (!def.dropoff?.includes(key as never) || !!def.shore !== boat) continue;
    const dx = e.x[b]! - e.x[s]!;
    const dy = e.y[b]! - e.y[s]!;
    const d = dx * dx + dy * dy;
    if (d >= bestD) continue;
    const [x0, y0, x1, y1] = buildingRect(w, b);
    if (region && !rectReachable(w, labels, region, Math.round(x0), Math.round(y0), Math.round(x1) - 1, Math.round(y1) - 1)) continue;
    bestD = d;
    best = e.handleOf(b);
  }
  return best;
}

/** Nearest standing, reachable node gathered with the same job within RETARGET_RADIUS of (x, y). */
export function findNearbyNode(w: World, s: number, job: Job, x: number, y: number): number {
  const r = w.res;
  const { labels, region } = unitRegion(w, s);
  const boat = isFishingBoat(w, s);
  const R = boat ? BOAT_RETARGET_RADIUS : RETARGET_RADIUS;
  let best = -1;
  let bestD = Infinity;
  const cx0 = Math.max(0, Math.floor((x - R) / 16));
  const cx1 = Math.min(r.chunksAcross - 1, Math.floor((x + R) / 16));
  const cy0 = Math.max(0, Math.floor((y - R) / 16));
  const cy1 = Math.floor((y + R) / 16);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const list = r.chunks[cy * r.chunksAcross + cx];
      if (!list) continue;
      for (const i of list) {
        if (r.state[i] !== ResState.standing || r.amount[i]! <= 0) continue;
        const def = RESOURCE_KINDS[r.kind[i]!]!;
        if (def.job !== job || (def.boatsOnly && !boat)) continue;
        const dx = r.tx[i]! + def.size / 2 - x;
        const dy = r.ty[i]! + def.size / 2 - y;
        const d = dx * dx + dy * dy;
        if (d > R * R || d >= bestD) continue;
        if (region && !rectReachable(w, labels, region, r.tx[i]!, r.ty[i]!, r.tx[i]! + def.size - 1, r.ty[i]! + def.size - 1)) continue;
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}

/** Remove an exhausted node from the map (tiles become passable again). */
export function depleteNode(w: World, i: number): void {
  const r = w.res;
  if (r.state[i] === ResState.gone) return;
  r.state[i] = ResState.gone;
  r.amount[i] = 0;
  const def = RESOURCE_KINDS[r.kind[i]!]!;
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      const tx = r.tx[i]! + dx;
      const ty = r.ty[i]! + dy;
      if (!w.map.inBounds(tx, ty)) continue;
      w.map.resAt[w.map.idx(tx, ty)] = 0;
      w.map.setOcc(tx, ty, Occ.resource, false);
    }
  }
  w.events.push({ t: 'depleted', res: i });
}

/** Start a gather order (used by commands and rally points). Returns false for non-villagers or bad nodes. */
export function startGather(w: World, s: number, node: number, queue: boolean): boolean {
  const r = w.res;
  if (node < 0 || node >= r.count || r.state[node] !== ResState.standing) return false;
  const def = RESOURCE_KINDS[r.kind[node]!]!;
  if (isFishingBoat(w, s) ? def.job !== 'fish' : !isVillager(w, s) || def.boatsOnly) return false;
  const order: GatherOrder = { k: 'gather', res: node, phase: 0, drop: NO_ENTITY, retry: 0 };
  const q = w.orders[s];
  if (queue && q && q.length) {
    q.push(order);
    return true;
  }
  // Switching to a different resource drops the current load (AoE1 rule, econ:1.2).
  const job = JOBS.indexOf(def.job) + 1;
  if (w.ents.carryJob[s] && w.ents.carryJob[s] !== job) {
    w.ents.carryJob[s] = 0;
    w.ents.carryAmt[s] = 0;
  }
  w.orders[s] = [order];
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
  w.ents.act[s] = Act.idle;
  w.ents.actStart[s] = w.tick;
}

function deposit(w: World, s: number): void {
  const e = w.ents;
  const job = JOBS[e.carryJob[s]! - 1];
  if (!job || e.carryAmt[s]! <= 0) return;
  const p = w.players[e.owner[s]!]!;
  const ri = RES_INDEX[job];
  const amount = e.carryAmt[s]! * (ri === 2 ? p.stats.goldYield : 1);
  p.res[ri] = p.res[ri]! + amount;
  p.tally.gathered[ri] = p.tally.gathered[ri]! + amount;
  w.events.push({ t: 'deposit', player: p.id, res: ri, amount });
  e.carryAmt[s] = 0;
  e.carryJob[s] = 0;
}

export function gatherSystem(w: World): void {
  const e = w.ents;
  const r = w.res;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const o = w.orders[s]?.[0];
    if (!o || o.k !== 'gather') continue;
    const stats = w.players[e.owner[s]!]!.stats;
    let def = RESOURCE_KINDS[r.kind[o.res]!]!;
    const job = def.job;
    // Boats work at their own type's rate and carry (the Fishing Ship upgrade carries more).
    const boat = isFishingBoat(w, s) ? w.stats(e.owner[s]!, e.type[s]!) : null;
    const cap = boat ? boat.carry : stats.carry[job];
    const rate = boat ? boat.gatherPerTick : stats.work[job];

    // Node gone: find another of the same kind, or deliver what we carry and stop.
    if (r.state[o.res] !== ResState.standing && o.phase !== 2) {
      const next = findNearbyNode(w, s, job, r.tx[o.res]! + 0.5, r.ty[o.res]! + 0.5);
      if (next >= 0) {
        o.res = next;
        o.phase = 0;
        w.paths[s] = undefined;
        def = RESOURCE_KINDS[r.kind[next]!]!;
      } else if (e.carryAmt[s]! > 0) {
        o.phase = 2;
        o.drop = NO_ENTITY;
        w.paths[s] = undefined;
      } else {
        finish(w, s);
        continue;
      }
    }

    if (o.phase === 0) {
      if (e.carryAmt[s]! >= cap - 1e-9) {
        o.phase = 2;
        o.drop = NO_ENTITY;
        w.paths[s] = undefined;
        continue;
      }
      if (nodeDist(w, o.res, e.x[s]!, e.y[s]!) <= REACH) {
        o.phase = 1;
        o.retry = 0;
        w.paths[s] = [];
        w.pathing.cancel(s);
        e.act[s] = Act.gather;
        e.actStart[s] = w.tick;
      } else if (w.paths[s] === undefined && !w.pathing.pending(s)) {
        w.pathing.request(s, nodeGoal(w, o.res));
      } else if (w.paths[s] !== undefined && w.paths[s]!.length === 0) {
        const size = def.size;
        if (approachRect(w, s, r.tx[o.res]!, r.ty[o.res]!, r.tx[o.res]! + size, r.ty[o.res]! + size)) continue;
        // Arrived but not in reach (blocked/unreachable): try another node, then give up.
        if (++o.retry > 3) {
          const next = findNearbyNode(w, s, job, e.x[s]!, e.y[s]!);
          if (next >= 0 && next !== o.res) {
            o.res = next;
            o.retry = 0;
          } else {
            finish(w, s);
            continue;
          }
        }
        w.paths[s] = undefined;
      }
      continue;
    }

    if (o.phase === 1) {
      if (nodeDist(w, o.res, e.x[s]!, e.y[s]!) > REACH + 0.3) {
        o.phase = 0; // pushed away
        w.paths[s] = undefined;
        continue;
      }
      const cx = r.tx[o.res]! + def.size / 2 - e.x[s]!;
      const cy = r.ty[o.res]! + def.size / 2 - e.y[s]!;
      const f = dir16(cx, cy);
      if (f >= 0) e.facing[s] = f;
      if (e.act[s] !== Act.gather) {
        e.act[s] = Act.gather;
        e.actStart[s] = w.tick;
      }
      const jobIdx = JOBS.indexOf(job) + 1;
      if (e.carryJob[s] !== jobIdx) {
        e.carryJob[s] = jobIdx;
        e.carryAmt[s] = 0;
      }
      const take = Math.min(rate, r.amount[o.res]!, cap - e.carryAmt[s]!);
      r.amount[o.res] = r.amount[o.res]! - take;
      e.carryAmt[s] = e.carryAmt[s]! + take;
      if (r.amount[o.res]! <= 1e-9) depleteNode(w, o.res);
      if (e.carryAmt[s]! >= cap - 1e-9 || r.state[o.res] !== ResState.standing) {
        o.phase = 2;
        o.drop = NO_ENTITY;
        w.paths[s] = undefined;
        e.act[s] = Act.idle;
        e.actStart[s] = w.tick;
      }
      continue;
    }

    // Phase 2: carry the load to a drop site.
    let ds = e.slotOf(o.drop);
    if (ds < 0 || e.build[ds]! < 1) {
      if (o.retry > 0) {
        o.retry--;
        continue;
      }
      const carriedJob = JOBS[e.carryJob[s]! - 1] ?? job;
      o.drop = findDropSite(w, s, carriedJob);
      ds = e.slotOf(o.drop);
      if (ds < 0) {
        o.retry = RETRY_TICKS; // nowhere to drop: wait and look again
        e.act[s] = Act.idle;
        continue;
      }
      w.paths[s] = undefined;
    }
    const [x0, y0, x1, y1] = buildingRect(w, ds);
    if (rectDist(e.x[s]!, e.y[s]!, x0, y0, x1, y1) <= REACH) {
      deposit(w, s);
      w.paths[s] = undefined;
      w.pathing.cancel(s);
      if (r.state[o.res] === ResState.standing) o.phase = 0;
      else {
        const next = findNearbyNode(w, s, job, r.tx[o.res]! + 0.5, r.ty[o.res]! + 0.5);
        if (next < 0) {
          finish(w, s);
          continue;
        }
        o.res = next;
        o.phase = 0;
      }
    } else if (w.paths[s] === undefined && !w.pathing.pending(s)) {
      w.pathing.request(s, buildingGoal(w, ds));
    } else if (w.paths[s] !== undefined && w.paths[s]!.length === 0) {
      if (!approachRect(w, s, x0, y0, x1, y1)) w.paths[s] = undefined; // arrived short of the building: path again
    }
  }
}
