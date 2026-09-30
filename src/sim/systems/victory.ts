import { EKind } from '../core/entities.ts';
import { mutualAllies } from '../rules/diplomacy.ts';
import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';

/**
 * Conquest (econ:7): a player is defeated once they have no villagers, military units, warships or buildings
 * left — trade, transport and fishing boats and walls don't count. When the survivors are all allies of one
 * another (with Allied Victory ticked) the game is won (the sim keeps running so players can look around).
 * Checked once a second.
 */
const EXEMPT = new Set(['tradeShip', 'transport', 'fishingShip']);

export function victorySystem(w: World): void {
  if (w.tick % 20 !== 0 || w.victory === 'none') return;
  const e = w.ents;
  const n = w.players.length;
  const counts = new Array<number>(n).fill(0);
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s]) continue;
    const t = TYPES[e.type[s]!]!;
    counts[e.owner[s]!]! += w.cargo[s]?.length ?? 0; // an army aboard a transport is still an army
    if (e.kind[s] === EKind.building ? t.building!.kind === 'wall' : EXEMPT.has(t.unit?.cls ?? '')) continue;
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
    const team = standing[0]!.team;
    w.gameOver = { tick: w.tick, team, winners: standing.map((pl) => pl.id) };
    w.events.push({ t: 'victory', team, players: [...w.gameOver.winners] });
  } else if (standing.length === 0) {
    w.gameOver = { tick: w.tick, team: 0, winners: [] }; // everyone fell together
    w.events.push({ t: 'victory', team: 0, players: [] });
  }
}
