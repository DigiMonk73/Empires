import { EKind } from '../core/entities.ts';
import type { World } from '../world.ts';

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
    if (e.kind[s] === EKind.unit) p.pop += st.pop;
    else if (e.build[s]! >= 1) p.popCap += st.popProvided;
  }
  for (const p of w.players) p.popCap = Math.min(p.popCap, w.popLimit);
}
