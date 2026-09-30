import { EKind } from '../core/entities.ts';
import { VICTORY } from '../../data/setup.ts';
import { mutualAllies } from '../rules/diplomacy.ts';
import { TYPES } from '../rules/registry.ts';
import type { Countdown, WinHow, World } from '../world.ts';

/**
 * Conquest (econ:7): a player is defeated once they have no villagers, military units, warships or buildings
 * left — trade, transport and fishing boats, walls, Ruins and Artifacts don't count. When the survivors are all
 * allies of one another (with Allied Victory ticked) the game is won (the sim keeps running so players can look
 * around). Checked once a second.
 *
 * Standard (M14.2, econ:7) adds three countdowns of 2000 years (1000 s at speed 1.0): a finished Wonder, or
 * every Artifact or every Ruin held by one side. Losing the Wonder or one of the objects stops the clock; the
 * holder wins, with the standing players who are its mutual allies (all ticking Allied Victory), when it runs out.
 */
const EXEMPT = new Set(['tradeShip', 'transport', 'fishingShip']);
export const COUNTDOWN_TICKS = VICTORY.countdownYears * VICTORY.secondsPerYear * 20;

export function victorySystem(w: World): void {
  if (w.tick % 20 !== 0 || w.victory === 'none') return;
  const e = w.ents;
  const n = w.players.length;
  const counts = new Array<number>(n).fill(0);
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s]) continue;
    const t = TYPES[e.type[s]!]!;
    counts[e.owner[s]!]! += w.cargo[s]?.length ?? 0; // an army aboard a transport is still an army
    if (e.kind[s] === EKind.building ? t.building!.kind === 'wall' || t.building!.kind === 'relic' : EXEMPT.has(t.unit?.cls ?? '')) continue;
    counts[e.owner[s]!]!++;
  }
  for (let p = 1; p < n; p++) {
    const pl = w.players[p]!;
    if (pl.defeated === null && counts[p] === 0) {
      pl.defeated = w.tick;
      w.events.push({ t: 'defeated', player: p });
    }
  }
  if (w.gameOver || n <= 2) return; // a one-player sandbox never ends
  const standing = w.players.filter((pl) => pl.id > 0 && pl.defeated === null);
  // Won when one player stands, or everyone standing calls everyone else Ally and all tick Allied Victory (M12.3).
  const together = standing.every((a) => a.alliedVictory && standing.every((b) => mutualAllies(w, a.id, b.id)));
  if (standing.length === 1 || (standing.length > 1 && together)) {
    win(w, standing[0]!.team, standing.map((pl) => pl.id), 'conquest');
  } else if (standing.length === 0) {
    win(w, 0, [], 'conquest'); // everyone fell together
  } else if (w.victory === 'standard') countdowns(w);
}

function win(w: World, team: number, winners: number[], how: WinHow, by = 0): void {
  w.gameOver = { tick: w.tick, team, winners, how };
  w.events.push({ t: 'victory', team, players: [...winners], how, by });
}

/** Start, stop and finish the Standard countdowns. */
function countdowns(w: World): void {
  const e = w.ents;
  // What should be running now: one clock per finished Wonder, one per relic kind held entirely by one side.
  const want: Countdown[] = [];
  const holders: Record<'artifacts' | 'ruins', number[]> = { artifacts: [], ruins: [] };
  const totals = { artifacts: 0, ruins: 0 };
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.building) continue;
    const t = TYPES[e.type[s]!]!;
    const o = e.owner[s]!;
    if (t.building!.kind === 'wonder') {
      if (e.build[s]! >= 1 && o > 0 && w.players[o]!.defeated === null) want.push({ kind: 'wonder', player: o, h: e.handleOf(s), end: 0 });
    } else if (t.building!.kind === 'relic') {
      const k = t.id === 'artifact' ? 'artifacts' : 'ruins';
      totals[k]++;
      holders[k].push(o);
    }
  }
  for (const k of ['artifacts', 'ruins'] as const) {
    const hs = holders[k];
    if (!totals[k] || hs.some((o) => o === 0 || w.players[o]!.defeated !== null)) continue;
    const first = Math.min(...hs);
    if (hs.every((o) => o === first || mutualAllies(w, o, first))) want.push({ kind: k, player: first, h: 0, end: 0 });
  }
  // A clock keeps running while its Wonder stands, or while the same side still holds the whole set.
  const same = (a: Countdown, b: Countdown) => a.kind === b.kind && a.h === b.h && (a.player === b.player || (a.kind !== 'wonder' && mutualAllies(w, a.player, b.player)));
  const kept: Countdown[] = [];
  for (const c of w.countdowns) {
    if (want.some((x) => same(c, x))) kept.push(c);
    else w.events.push({ t: 'countdownStopped', kind: c.kind, player: c.player });
  }
  for (const x of want) {
    if (kept.some((c) => same(c, x))) continue;
    const c = { ...x, end: w.tick + COUNTDOWN_TICKS };
    kept.push(c);
    w.events.push({ t: 'countdown', kind: c.kind, player: c.player, end: c.end });
  }
  w.countdowns = kept;
  // The first clock to run out wins (ties: the one started first).
  const done = kept.find((c) => c.end <= w.tick);
  if (!done) return;
  const p = w.players[done.player]!;
  const side = w.players.filter((q) => q.id > 0 && q.defeated === null && (q.id === p.id || (p.alliedVictory && q.alliedVictory && mutualAllies(w, p.id, q.id))));
  w.countdowns = [];
  win(w, p.team, side.map((q) => q.id), done.kind, p.id);
}
