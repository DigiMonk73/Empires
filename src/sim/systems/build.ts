import { CIV_BY_ID } from '../../data/index.ts';
import { MOVE_WATER, TERRAINS } from '../../data/terrain.ts';
import { Act, EKind } from '../core/entities.ts';
import { NO_ENTITY } from '../core/handles.ts';
import { Occ } from '../map/tilemap.ts';
import { dir16 } from '../math/trig.ts';
import { nearestTile } from '../path/service.ts';
import { TYPES, buildingTypeIndex } from '../rules/registry.ts';
import type { World } from '../world.ts';
import { isVillager, REACH } from './gather.ts';
import { sowFarm, startFarm } from './farm.ts';

/**
 * Construction (econ:4): placing a foundation pays the full cost; villagers walk beside it and build. Several
 * builders speed it up by (n + 2) / 3 (the AoE2 rule — unverified for 1.0, `verify` in DECISIONS). HP grows with
 * progress, so damage taken during construction persists. Completed buildings start providing housing and drop-off.
 */
export type PlaceCheck = { ok: true } | { ok: false; reason: string };

/** Can `player` build `typeIdx` right now (age, prerequisites, civ, tech enable)? Ignores cost and placement. */
export function buildingAvailable(w: World, player: number, typeIdx: number): PlaceCheck {
  const t = TYPES[typeIdx]!;
  const b = t.building;
  if (!b) return { ok: false, reason: 'not a building' };
  const p = w.players[player]!;
  if (p.stats.age < b.age) return { ok: false, reason: `requires ${['', 'Stone', 'Tool', 'Bronze', 'Iron'][b.age]} Age` };
  const civ = CIV_BY_ID.get(p.civ);
  if (civ?.disabled.buildings.includes(b.id)) return { ok: false, reason: 'not available to this civilization' };
  if (b.startsEnabled === false && !p.stats.enabled.has(`building:${b.id}`)) return { ok: false, reason: 'requires research' };
  const e = w.ents;
  for (const req of b.requiresBuilding ?? []) {
    const ri = buildingTypeIndex(req);
    let have = false;
    for (let s = 0; s < e.top && !have; s++) have = !!e.alive[s] && e.owner[s] === player && e.type[s] === ri && e.build[s]! >= 1;
    if (!have) return { ok: false, reason: `requires a ${TYPES[ri]!.name}` };
  }
  if (b.id === 'townCenter') {
    let tcs = 0;
    let gov = false;
    const gi = buildingTypeIndex('governmentCenter');
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.owner[s] !== player) continue;
      if (e.type[s] === typeIdx) tcs++;
      if (e.type[s] === gi && e.build[s]! >= 1) gov = true;
    }
    if (tcs > 0 && !gov) return { ok: false, reason: 'another Town Center requires a Government Center' };
  }
  return { ok: true };
}

/**
 * Is the footprint free and buildable? `tileOk` (optional) receives each tile's verdict for the placement ghost.
 * Docks (`shore`) go on water tiles instead, and at least one tile around the footprint must be dry land (D23).
 */
export function placementValid(w: World, typeIdx: number, tx: number, ty: number, tileOk?: boolean[]): boolean {
  const t = TYPES[typeIdx]!;
  const shore = !!t.building?.shore;
  const m = w.map;
  let ok = true;
  for (let dy = 0; dy < t.size; dy++) {
    for (let dx = 0; dx < t.size; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      let good = m.inBounds(x, y);
      if (good) {
        const i = m.idx(x, y);
        const ter = TERRAINS[m.terrain[i]!]!;
        const free = (m.occ[i]! & (Occ.building | Occ.farm)) === 0 && (shore || (m.occ[i]! & Occ.resource) === 0);
        good = free && (shore ? (ter.pass & MOVE_WATER) !== 0 && !ter.buildable && !m.resAt[i] : ter.buildable);
      }
      if (tileOk) tileOk.push(good);
      ok &&= good;
    }
  }
  if (ok && shore) {
    let land = false;
    for (let k = -1; k <= t.size && !land; k++) {
      for (const [x, y] of [[tx + k, ty - 1], [tx + k, ty + t.size], [tx - 1, ty + k], [tx + t.size, ty + k]] as const) {
        if (m.inBounds(x, y) && TERRAINS[m.terrain[m.idx(x, y)]!]!.buildable) land = true;
      }
    }
    if (!land && tileOk) tileOk.fill(false);
    ok = land;
  }
  return ok;
}

export function canAfford(w: World, player: number, cost: readonly number[]): boolean {
  const r = w.players[player]!.res;
  return cost.every((c, i) => r[i]! >= c - 1e-9);
}

export function pay(w: World, player: number, cost: readonly number[], sign = 1): void {
  const r = w.players[player]!.res;
  for (let i = 0; i < 4; i++) r[i] = r[i]! - sign * cost[i]!;
}

/** Nudge units off a new footprint to the nearest free tile. */
function evictUnits(w: World, tx: number, ty: number, size: number): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const x = Math.floor(e.x[s]!);
    const y = Math.floor(e.y[s]!);
    if (x < tx || y < ty || x >= tx + size || y >= ty + size) continue;
    const grid = w.pathGrid(TYPES[e.type[s]!]!.moveClass);
    const t = nearestTile(w.map.w, w.map.h, x, y, (qx, qy) => grid.walkable(qx, qy));
    if (t < 0) continue;
    e.x[s] = e.px[s] = (t % w.map.w) + 0.5;
    e.y[s] = e.py[s] = Math.floor(t / w.map.w) + 0.5;
    w.paths[s] = undefined;
  }
}

/** Place a paid foundation. Returns its handle, or NO_ENTITY with a rejection event. */
export function placeFoundation(w: World, player: number, typeIdx: number, tx: number, ty: number): number {
  const avail = buildingAvailable(w, player, typeIdx);
  if (!avail.ok) {
    w.events.push({ t: 'rejected', player, reason: avail.reason });
    return NO_ENTITY;
  }
  if (!placementValid(w, typeIdx, tx, ty)) {
    w.events.push({ t: 'rejected', player, reason: 'cannot build there' });
    return NO_ENTITY;
  }
  const cost = w.stats(player, typeIdx).cost;
  if (!canAfford(w, player, cost)) {
    w.events.push({ t: 'rejected', player, reason: 'not enough resources' });
    return NO_ENTITY;
  }
  pay(w, player, cost);
  const h = w.placeBuilding(typeIdx, player, tx, ty, false);
  evictUnits(w, tx, ty, TYPES[typeIdx]!.size);
  return h;
}

/** Start (or queue) a build order on foundation `h`. */
export function startConstruct(w: World, s: number, h: number, queue: boolean): boolean {
  if (!isVillager(w, s)) return false;
  const b = w.ents.slotOf(h);
  if (b < 0 || w.ents.kind[b] !== EKind.building || w.ents.owner[b] !== w.ents.owner[s] || w.ents.build[b]! >= 1) return false;
  const order = { k: 'build' as const, h, phase: 0 as 0 | 1, retry: 0 };
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

function footprint(w: World, b: number): [number, number, number, number] {
  const half = TYPES[w.ents.type[b]!]!.size / 2;
  return [w.ents.x[b]! - half, w.ents.y[b]! - half, w.ents.x[b]! + half, w.ents.y[b]! + half];
}

function distToRect(px: number, py: number, r: [number, number, number, number]): number {
  const dx = px < r[0] ? r[0] - px : px > r[2] ? px - r[2] : 0;
  const dy = py < r[1] ? r[1] - py : py > r[3] ? py - r[3] : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

function finish(w: World, s: number): void {
  const q = w.orders[s]!;
  q.shift();
  w.paths[s] = undefined;
  if (!q.length) w.orders[s] = undefined;
  w.ents.act[s] = Act.idle;
  w.ents.actStart[s] = w.tick;
}

/** Scratch: builders per building slot this tick. */
const builders: number[] = [];

export function buildSystem(w: World): void {
  const e = w.ents;
  builders.length = 0;
  // Pass 1: move builders into reach; count those working.
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const o = w.orders[s]?.[0];
    if (!o || o.k !== 'build') continue;
    const b = e.slotOf(o.h);
    if (b < 0 || e.build[b]! >= 1) {
      finish(w, s);
      continue;
    }
    const rect = footprint(w, b);
    if (distToRect(e.x[s]!, e.y[s]!, rect) <= REACH) {
      o.phase = 1;
      w.paths[s] = [];
      w.pathing.cancel(s);
      builders[b] = (builders[b] ?? 0) + 1;
      const f = dir16(e.x[b]! - e.x[s]!, e.y[b]! - e.y[s]!);
      if (f >= 0) e.facing[s] = f;
      if (e.act[s] !== Act.build) {
        e.act[s] = Act.build;
        e.actStart[s] = w.tick;
      }
      continue;
    }
    o.phase = 0;
    if (w.paths[s] === undefined && !w.pathing.pending(s)) {
      const size = TYPES[e.type[b]!]!.size;
      const x0 = Math.round(rect[0]);
      const y0 = Math.round(rect[1]);
      w.pathing.request(s, { k: 'rect', x0, y0, x1: x0 + size - 1, y1: y0 + size - 1, range: 1 });
    } else if (w.paths[s] !== undefined && w.paths[s]!.length === 0) {
      if (++o.retry > 4) finish(w, s);
      else w.paths[s] = undefined;
    }
  }
  // Pass 2: advance construction.
  for (let b = 0; b < builders.length; b++) {
    const n = builders[b];
    if (!n) continue;
    const st = w.stats(e.owner[b]!, e.type[b]!);
    const rate = w.players[e.owner[b]!]!.stats.work.build * 20; // 1.0 base; Architecture ×1.5
    const delta = Math.min(1 - e.build[b]!, ((n + 2) / 3) * (rate / st.buildTicks));
    e.build[b] = e.build[b]! + delta;
    e.hp[b] = Math.min(st.hp, e.hp[b]! + delta * st.hp);
    if (e.build[b]! >= 1 - 1e-9) {
      e.build[b] = 1;
      w.events.push({ t: 'built', h: e.handleOf(b), player: e.owner[b]! });
      if (TYPES[e.type[b]!]!.building?.kind === 'farm') {
        sowFarm(w, b);
        // The first villager who built it starts farming it (econ:1.4).
        const bh = e.handleOf(b);
        for (let s = 0; s < e.top; s++) {
          const o = w.orders[s]?.[0];
          if (e.alive[s] && o?.k === 'build' && o.h === bh) {
            if (startFarm(w, s, bh, false)) break;
          }
        }
      }
    }
  }
}
