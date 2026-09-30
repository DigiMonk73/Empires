import { EKind } from '../core/entities.ts';
import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';
import { edgeDist } from './combat.ts';
import { REACH } from './gather.ts';

/**
 * Sea trade (M8.5, D38): a Trade Boat (Merchant Ship) loads 20 of its good — food, wood or stone — from the
 * stockpile at its own Dock, sails to another player's Dock and sells it for gold, brings the gold home, and goes
 * again (econ:1.3: carry 20). The price grows with the distance between the two Docks: 20 goods fetch
 * 20 × distance ÷ 40 gold — a 40-tile voyage breaks even (the original's formula is unverified).
 */
export const TRADE_LOAD = 20;
/** Tiles between Docks at which a load sells for its own amount in gold. */
export const TRADE_PAR = 40;
const GOODS = [0, 1, 3] as const; // food, wood, stone

export function isTradeBoat(w: World, s: number): boolean {
  return TYPES[w.ents.type[s]!]!.unit?.cls === 'tradeShip';
}

/** The resource index trade boat `s` sells (wood unless set). */
export function tradeGood(w: World, s: number): number {
  const g = w.ents.trade[s]! - 1;
  return (GOODS as readonly number[]).includes(g) ? g : 1;
}

function isDock(w: World, b: number): boolean {
  return b >= 0 && w.ents.alive[b] === 1 && w.ents.kind[b] === EKind.building && w.ents.build[b]! >= 1 && !!TYPES[w.ents.type[b]!]!.building?.shore;
}

/** Nearest finished own Dock to (x, y), or −1. */
function homeDock(w: World, owner: number, x: number, y: number): number {
  const e = w.ents;
  let best = -1;
  let bd = Infinity;
  for (let b = 0; b < e.top; b++) {
    if (e.owner[b] !== owner || !isDock(w, b)) continue;
    const d = (e.x[b]! - x) * (e.x[b]! - x) + (e.y[b]! - y) * (e.y[b]! - y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Gold a load fetches between Docks `a` and `b`. */
export function tradePrice(w: World, a: number, b: number, load = TRADE_LOAD): number {
  const e = w.ents;
  const dx = e.x[a]! - e.x[b]!;
  const dy = e.y[a]! - e.y[b]!;
  return (load * Math.sqrt(dx * dx + dy * dy)) / TRADE_PAR;
}

/** Send trade boat `s` to trade with another player's Dock `h`. */
export function startTrade(w: World, s: number, h: number): boolean {
  const e = w.ents;
  const d = e.slotOf(h);
  if (!isTradeBoat(w, s) || !isDock(w, d) || e.owner[d] === e.owner[s] || e.owner[d] === 0) return false;
  w.orders[s] = [{ k: 'trade', dock: h, phase: 0, load: 0, gold: 0, retry: 0 }];
  w.paths[s] = undefined;
  w.pathing.cancel(s);
  e.stuck[s] = 0;
  return true;
}

/** Set the good trade boats sell (resource index 0 food, 1 wood, 3 stone). */
export function setTradeGood(w: World, s: number, good: number): boolean {
  if (!isTradeBoat(w, s) || !(GOODS as readonly number[]).includes(good)) return false;
  w.ents.trade[s] = good + 1;
  return true;
}

function finish(w: World, s: number): void {
  w.orders[s] = undefined;
  w.paths[s] = undefined;
}

/** Walk (sail) boat `s` to Dock `b`; true once alongside. */
function reach(w: World, s: number, b: number, o: { retry: number }): boolean {
  if (edgeDist(w, s, b) <= REACH) {
    w.paths[s] = undefined;
    w.pathing.cancel(s);
    return true;
  }
  if (w.paths[s] === undefined && !w.pathing.pending(s)) {
    const size = TYPES[w.ents.type[b]!]!.size;
    const x0 = Math.round(w.ents.x[b]! - size / 2);
    const y0 = Math.round(w.ents.y[b]! - size / 2);
    w.pathing.request(s, { k: 'rect', x0, y0, x1: x0 + size - 1, y1: y0 + size - 1, range: 1 });
  } else if (w.paths[s] !== undefined && w.paths[s]!.length === 0) {
    if (++o.retry > 6) finish(w, s);
    else w.paths[s] = undefined;
  }
  return false;
}

export function tradeSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
    const o = w.orders[s]?.[0];
    if (o?.k !== 'trade') continue;
    const owner = e.owner[s]!;
    const home = homeDock(w, owner, e.x[s]!, e.y[s]!);
    const far = e.slotOf(o.dock);
    if (o.phase === 0) {
      // Load at home: 20 of the good from the stockpile (waits while there isn't enough).
      if (!isDock(w, far) || e.owner[far] === owner || home < 0) {
        finish(w, s);
        continue;
      }
      if (!reach(w, s, home, o)) continue;
      const p = w.players[owner]!;
      const g = tradeGood(w, s);
      if (p.res[g]! < TRADE_LOAD) continue;
      p.res[g] = p.res[g]! - TRADE_LOAD;
      o.load = TRADE_LOAD;
      o.gold = tradePrice(w, home, far);
      o.phase = 1;
      o.retry = 0;
    } else if (o.phase === 1) {
      // Sell at the foreign Dock; if it's gone, bring the goods back.
      if (!isDock(w, far) || e.owner[far] === owner) {
        if (home >= 0 && reach(w, s, home, o)) {
          w.players[owner]!.res[tradeGood(w, s)] += o.load; // unsold: back in the stockpile
          finish(w, s);
        } else if (home < 0) finish(w, s);
        continue;
      }
      if (!reach(w, s, far, o)) continue;
      o.load = 0;
      o.phase = 2;
      o.retry = 0;
    } else {
      // Home with the gold, then go again.
      if (home < 0) {
        finish(w, s);
        continue;
      }
      if (!reach(w, s, home, o)) continue;
      const p = w.players[owner]!;
      p.res[2] = p.res[2]! + o.gold;
      p.tally.gathered[2] = p.tally.gathered[2]! + o.gold;
      w.events.push({ t: 'deposit', player: owner, res: 2, amount: o.gold });
      o.gold = 0;
      o.phase = 0;
      o.retry = 0;
    }
  }
}
