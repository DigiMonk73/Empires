import { CIV_BY_ID, TECH_BY_ID, UNIT_BY_ID } from '../../data/index.ts';
import { EKind } from '../core/entities.ts';
import { nearestTile } from '../path/service.ts';
import { TYPES, unitTypeIndex } from '../rules/registry.ts';
import type { World } from '../world.ts';
import { canAfford, pay } from './build.ts';
import { startGather } from './gather.ts';

/**
 * Unit production (econ:4, mil:5): buildings train from a queue (RoR: up to five, cost paid when queued, refunded
 * on cancel). Training pauses while the player is out of housing. New units appear beside the building on the
 * side facing its rally point and head there; a rally point on a resource sends villagers straight to work.
 */
export const MAX_QUEUE = 5;

export interface Production {
  /** Queued unit type indices; the head is in training. */
  items: number[];
  /** Ticks of training done on the head item (fractional for fast Docks). */
  progress: number;
  /** Set while paused for housing (so the "need houses" event fires once). */
  housed: boolean;
}

export interface Rally {
  x: number;
  y: number;
  /** Resource node to gather, or -1. */
  res: number;
}

/** Why `player` can't train base unit `unitId` at building slot `b` right now (null = can). */
export function trainBlocker(w: World, player: number, b: number, unitId: string): string | null {
  const e = w.ents;
  const bt = TYPES[e.type[b]!]!;
  if (e.owner[b] !== player || e.kind[b] !== EKind.building || e.build[b]! < 1) return 'building not ready';
  if (!bt.building!.trains?.includes(unitId)) return 'not trained here';
  const p = w.players[player]!;
  const current = p.stats.upgrades.get(unitId) ?? unitId;
  const def = UNIT_BY_ID.get(current)!;
  if (CIV_BY_ID.get(p.civ)?.disabled.units.includes(unitId)) return 'not available to this civilization';
  if (p.stats.age < UNIT_BY_ID.get(unitId)!.age) return 'requires a later age';
  const needs = UNIT_BY_ID.get(unitId)!.requires ?? [];
  for (const t of needs) if (!p.techs.includes(t)) return `requires ${TECH_BY_ID.get(t)?.name ?? t}`;
  void def;
  return null;
}

/** The unit type index actually produced for base unit `unitId` (after upgrades). */
export function producedType(w: World, player: number, unitId: string): number {
  return unitTypeIndex(w.players[player]!.stats.upgrades.get(unitId) ?? unitId);
}

export function queueUnit(w: World, player: number, bh: number, unitId: string, n: number): void {
  const b = w.ents.slotOf(bh);
  if (b < 0) return;
  const why = trainBlocker(w, player, b, unitId);
  if (why) {
    w.events.push({ t: 'rejected', player, reason: why });
    return;
  }
  const type = producedType(w, player, unitId);
  const cost = w.stats(player, type).cost;
  let prod = w.prod[b];
  if (!prod) w.prod[b] = prod = { items: [], progress: 0, housed: false };
  for (let k = 0; k < n; k++) {
    if (prod.items.length >= MAX_QUEUE) {
      w.events.push({ t: 'rejected', player, reason: 'queue is full' });
      break;
    }
    if (!canAfford(w, player, cost)) {
      w.events.push({ t: 'rejected', player, reason: 'not enough resources' });
      break;
    }
    pay(w, player, cost);
    prod.items.push(type);
  }
}

/** Cancel the last queued unit (or the one at `index`) and refund it. */
export function cancelUnit(w: World, player: number, bh: number, index = -1): void {
  const b = w.ents.slotOf(bh);
  const prod = b >= 0 ? w.prod[b] : undefined;
  if (!prod || !prod.items.length || w.ents.owner[b] !== player) return;
  const i = index < 0 || index >= prod.items.length ? prod.items.length - 1 : index;
  const [type] = prod.items.splice(i, 1);
  pay(w, player, w.stats(player, type!).cost, -1);
  if (i === 0) {
    prod.progress = 0;
    prod.housed = false;
  }
  if (!prod.items.length) w.prod[b] = undefined;
}

/** Refund everything queued at a building (e.g. when it is destroyed). */
export function refundQueue(w: World, b: number): void {
  const prod = w.prod[b];
  if (!prod) return;
  const player = w.ents.owner[b]!;
  for (const type of prod.items) pay(w, player, w.stats(player, type).cost, -1);
  w.prod[b] = undefined;
}

function spawnSpot(w: World, b: number, typeIdx: number): { x: number; y: number } | null {
  const e = w.ents;
  const size = TYPES[e.type[b]!]!.size;
  const rally = w.rally[b];
  // Aim at the rally point, else the building's front (toward the viewer).
  const tx = rally ? rally.x : e.x[b]! + size;
  const ty = rally ? rally.y : e.y[b]! + size;
  const dx = tx - e.x[b]!;
  const dy = ty - e.y[b]!;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const ex = Math.floor(e.x[b]! + (dx / d) * (size / 2 + 0.6));
  const ey = Math.floor(e.y[b]! + (dy / d) * (size / 2 + 0.6));
  const grid = w.pathGrid(TYPES[typeIdx]!.moveClass);
  const t = nearestTile(w.map.w, w.map.h, ex, ey, (qx, qy) => grid.walkable(qx, qy));
  if (t < 0) return null;
  return { x: (t % w.map.w) + 0.5, y: Math.floor(t / w.map.w) + 0.5 };
}

export function productionSystem(w: World): void {
  const e = w.ents;
  for (let b = 0; b < e.top; b++) {
    const prod = w.prod[b];
    if (!prod) continue;
    if (!e.alive[b]) {
      w.prod[b] = undefined;
      continue;
    }
    const player = e.owner[b]!;
    const p = w.players[player]!;
    const type = prod.items[0]!;
    const st = w.stats(player, type);
    if (p.pop + st.pop > p.popCap) {
      if (!prod.housed) {
        prod.housed = true;
        w.events.push({ t: 'housed', player, h: e.handleOf(b) });
      }
      continue;
    }
    prod.housed = false;
    const bdef = TYPES[e.type[b]!]!.building!;
    prod.progress += bdef.workRateByAge?.[p.stats.age as 1 | 2 | 3 | 4] ?? 1;
    if (prod.progress + 1e-9 < st.trainTicks) continue;
    const spot = spawnSpot(w, b, type);
    if (!spot) continue; // boxed in: try again next tick
    prod.items.shift();
    prod.progress = 0;
    if (!prod.items.length) w.prod[b] = undefined;
    const h = w.spawnUnit(type, player, spot.x, spot.y);
    p.pop += st.pop; // keep this tick's housing check honest for the next building
    w.events.push({ t: 'trained', h, player });
    const rally = w.rally[b];
    if (rally) {
      const s = e.slotOf(h);
      if (rally.res < 0 || !startGather(w, s, rally.res, false)) w.orders[s] = [{ k: 'move', x: rally.x, y: rally.y }];
    }
  }
}
