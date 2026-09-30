import { RESOURCES } from '../../data/types.ts';
import { TRIBUTE } from '../../data/setup.ts';
import { EKind } from '../core/entities.ts';
import { ALLY, STANCE_NAMES } from '../rules/diplomacy.ts';
import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';

/**
 * Tribute (M12.3, econ:1.5): give another player resources. Needs a finished Market; the giver pays a 25% fee on
 * top (to give 100 you pay 125) until Coinage or the Palmyran bonus sets the fee to 0 (`tributeFee`). Counts for
 * the giver's economy score (÷ 60).
 */
export const MAX_TRIBUTE = 100000;

function hasMarket(w: World, player: number): boolean {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (e.alive[s] && e.kind[s] === EKind.building && e.owner[s] === player && e.build[s]! >= 1 && TYPES[e.type[s]!]!.id === TRIBUTE.requiresBuilding) return true;
  }
  return false;
}

/** What giving `amount` costs `player` in all (the amount plus the fee). */
export function tributeCost(w: World, player: number, amount: number): number {
  return amount * (1 + w.players[player]!.stats.tributeFee);
}

/** Why `from` can't send this tribute, or null. */
export function tributeBlocker(w: World, from: number, to: number, res: number, amount: number): string | null {
  const target = w.players[to];
  if (!Number.isInteger(to) || to < 1 || to === from || !target) return 'bad tribute target';
  if (target.defeated !== null) return 'that player has been defeated';
  if (!Number.isInteger(res) || res < 0 || res >= RESOURCES.length || !Number.isInteger(amount) || amount < 1 || amount > MAX_TRIBUTE) return 'bad tribute amount';
  if (!hasMarket(w, from)) return 'tribute requires a Market';
  if (w.players[from]!.res[res]! < tributeCost(w, from, amount) - 1e-9) return `not enough ${RESOURCES[res]}`;
  return null;
}

export function payTribute(w: World, from: number, to: number, res: number, amount: number): void {
  const why = tributeBlocker(w, from, to, res, amount);
  if (why) {
    w.events.push({ t: 'rejected', player: from, reason: why });
    return;
  }
  const fee = tributeCost(w, from, amount) - amount;
  const g = w.players[from]!;
  g.res[res] = g.res[res]! - amount - fee;
  w.players[to]!.res[res] = w.players[to]!.res[res]! + amount;
  g.tally.tribute += amount;
  const tf = w.players[to]!.tally.tributeFrom;
  while (tf.length <= from) tf.push(0);
  tf[from] = tf[from]! + amount;
  w.events.push({ t: 'tribute', from, to, res, amount, fee });
}

/** `player` changes its stance toward `to`. Calling someone Ally stops the attacks already under way on them. */
export function setStance(w: World, player: number, to: number, stance: number): void {
  const p = w.players[player]!;
  if (!Number.isInteger(to) || to < 1 || to >= w.players.length || to === player || !Number.isInteger(stance) || !STANCE_NAMES[stance]) {
    w.events.push({ t: 'rejected', player, reason: 'bad diplomacy command' });
    return;
  }
  if (p.stance[to] === stance) return;
  p.stance[to] = stance;
  if (stance === ALLY) {
    const e = w.ents;
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.owner[s] !== player) continue;
      const q = w.orders[s];
      const head = q?.[0];
      if (head?.k !== 'attack') continue;
      const t = e.slotOf(head.h);
      if (t < 0 || e.owner[t] !== to) continue;
      q!.shift();
      if (!q!.length) w.orders[s] = undefined;
      w.paths[s] = undefined;
      w.pathing.cancel(s);
    }
  }
  w.events.push({ t: 'diplomacy', from: player, to, stance });
}
