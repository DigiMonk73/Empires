import { EKind } from '../core/entities.ts';
import type { World } from '../world.ts';
import { riderOwner } from './transport.ts';

/** Recompute each player's population and housing (completed buildings only), capped by the game limit. */
export function populationSystem(w: World): void {
  for (const p of w.players) {
    p.pop = 0;
    p.popCap = 0;
  }
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s]) continue;
    const p = w.players[e.owner[s]!]!;
    const st = p.stats.types[e.type[s]!]!;
    if (e.kind[s] === EKind.unit) {
      p.pop += st.pop;
      // Aboard a transport (M8.4), counted for the rider's own side (a converted transport's riders, P26).
      for (const c of w.cargo[s] ?? []) {
        const rp = w.players[riderOwner(w, s, c)]!;
        rp.pop += rp.stats.types[c.type]!.pop;
      }
    }
    else if (e.build[s]! >= 1) p.popCap += st.popProvided;
  }
  for (const p of w.players) p.popCap = Math.min(p.popCap, w.popLimit);
}
