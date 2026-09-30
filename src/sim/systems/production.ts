import { CIV_BY_ID, TECH_BY_ID, UNIT_BY_ID } from '../../data/index.ts';
import { compilePlayerStats } from '../rules/playerStats.ts';
import { TICKS_PER_SECOND } from '../time.ts';
import { EKind } from '../core/entities.ts';
import { nearestTile } from '../path/service.ts';
import { TYPES, buildingTypeIndex, unitTypeIndex } from '../rules/registry.ts';
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
  /** Queue: unit type indices (training) or tech ids (research); the head is in progress. */
  items: (number | string)[];
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

/** Why `player` can't research `techId` at building slot `b` right now (null = can). */
export function researchBlocker(w: World, player: number, b: number, techId: string): string | null {
  const e = w.ents;
  const tech = TECH_BY_ID.get(techId);
  if (!tech) return 'unknown technology';
  if (e.owner[b] !== player || e.kind[b] !== EKind.building || e.build[b]! < 1) return 'building not ready';
  if (TYPES[e.type[b]!]!.building!.id !== tech.at) return 'not researched here';
  const p = w.players[player]!;
  if (p.techs.includes(techId)) return 'already researched';
  if (CIV_BY_ID.get(p.civ)?.disabled.techs.includes(techId)) return 'not available to this civilization';
  if (p.stats.age < tech.age) return `requires the ${AGE_NAMES[tech.age]}`;
  for (const r of tech.requires ?? []) if (!p.techs.includes(r)) return `requires ${TECH_BY_ID.get(r)?.name ?? r}`;
  if (tech.requiresAnyBuildings) {
    const { count, of } = tech.requiresAnyBuildings;
    const have = new Set<string>();
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.owner[s] !== player || e.kind[s] !== EKind.building || e.build[s]! < 1) continue;
      const id = TYPES[e.type[s]!]!.building!.id;
      if (of.includes(id)) have.add(id);
    }
    if (have.size < count) return `requires ${count} of: ${of.map((id) => TYPES[buildingTypeIndex(id)]!.name).join(', ')}`;
  }
  // One research of a tech at a time across the player's buildings.
  for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === player && w.prod[s]?.items.includes(techId)) return 'already being researched';
  return null;
}

export const AGE_NAMES = ['', 'Stone Age', 'Tool Age', 'Bronze Age', 'Iron Age'];

export function queueResearch(w: World, player: number, bh: number, techId: string): void {
  const b = w.ents.slotOf(bh);
  if (b < 0) return;
  const why = researchBlocker(w, player, b, techId);
  const cost = techCost(techId);
  const reason = why ?? ((w.prod[b]?.items.length ?? 0) >= MAX_QUEUE ? 'queue is full' : !canAfford(w, player, cost) ? 'not enough resources' : null);
  if (reason) {
    w.events.push({ t: 'rejected', player, reason });
    return;
  }
  pay(w, player, cost);
  let prod = w.prod[b];
  if (!prod) w.prod[b] = prod = { items: [], progress: 0, housed: false };
  prod.items.push(techId);
}

function techCost(techId: string): number[] {
  const c = TECH_BY_ID.get(techId)!.cost as Partial<Record<string, number>>;
  return [c.food ?? 0, c.wood ?? 0, c.gold ?? 0, c.stone ?? 0];
}

/** Cost of a queue item (unit type index or tech id). */
function itemCost(w: World, player: number, item: number | string): readonly number[] {
  return typeof item === 'string' ? techCost(item) : w.stats(player, item).cost;
}

/** Ticks a queue item takes. */
function itemTicks(w: World, player: number, item: number | string): number {
  return typeof item === 'string' ? Math.round(TECH_BY_ID.get(item)!.researchTime * TICKS_PER_SECOND) : w.stats(player, item).trainTicks;
}

/**
 * A finished research: record it, recompile the player's stats, and bring the field up to date — units of an
 * upgraded line become the new type (econ:5), and every unit gains any increase in max HP.
 */
export function completeResearch(w: World, player: number, techId: string): void {
  const p = w.players[player]!;
  const before = p.stats;
  p.techs.push(techId);
  p.stats = compilePlayerStats(p.civ, p.techs);
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.owner[s] !== player) continue;
    const t = TYPES[e.type[s]!]!;
    if (e.kind[s] === EKind.unit && t.unit) {
      let root = t.unit.id;
      while (UNIT_BY_ID.get(root)?.upgradeOf) root = UNIT_BY_ID.get(root)!.upgradeOf!;
      const want = p.stats.upgrades.get(root);
      if (want && want !== t.unit.id) e.type[s] = unitTypeIndex(want);
    }
    const oldMax = before.types[t.index]!.hp;
    const newMax = p.stats.types[e.type[s]!]!.hp;
    if (e.kind[s] === EKind.building && e.build[s]! < 1) continue;
    if (newMax > oldMax) e.hp[s] = e.hp[s]! + (newMax - oldMax);
  }
  if (p.stats.age > before.age) p.tally.ageTick[p.stats.age] = w.tick;
  w.events.push({ t: 'researched', player, tech: techId });
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
  // Nothing queued (e.g. unaffordable): don't leave an empty queue behind.
  if (!prod.items.length) w.prod[b] = undefined;
}

/** Cancel the last queued unit (or the one at `index`) and refund it. */
export function cancelUnit(w: World, player: number, bh: number, index = -1): void {
  const b = w.ents.slotOf(bh);
  const prod = b >= 0 ? w.prod[b] : undefined;
  if (!prod || !prod.items.length || w.ents.owner[b] !== player) return;
  const i = index < 0 || index >= prod.items.length ? prod.items.length - 1 : index;
  const [item] = prod.items.splice(i, 1);
  pay(w, player, itemCost(w, player, item!), -1);
  if (i === 0) {
    prod.progress = 0;
    prod.housed = false;
  }
  if (!prod.items.length) w.prod[b] = undefined;
}

/** A destroyed building refunds what was queued — but not the item already in production (mil:5 UI notes). */
export function refundQueue(w: World, b: number): void {
  const prod = w.prod[b];
  if (!prod) return;
  const player = w.ents.owner[b]!;
  for (let i = 1; i < prod.items.length; i++) pay(w, player, itemCost(w, player, prod.items[i]!), -1);
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
    if (!prod.items.length) {
      w.prod[b] = undefined;
      continue;
    }
    const player = e.owner[b]!;
    const p = w.players[player]!;
    const head = prod.items[0]!;
    if (typeof head === 'string') {
      // Research (econ:5): not affected by housing or the Dock's faster work rate.
      prod.progress += 1;
      if (prod.progress + 1e-9 < itemTicks(w, player, head)) continue;
      prod.items.shift();
      prod.progress = 0;
      if (!prod.items.length) w.prod[b] = undefined;
      completeResearch(w, player, head);
      continue;
    }
    const type = head;
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
