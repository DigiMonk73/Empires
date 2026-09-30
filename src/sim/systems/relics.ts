import { EKind } from '../core/entities.ts';
import { allied } from '../rules/diplomacy.ts';
import { TYPES } from '../rules/registry.ts';
import { unstampLos } from './fog.ts';
import type { World } from '../world.ts';

/**
 * Ruins and Artifacts (M14.1, econ:7). A player claims one by bringing a unit beside it; it changes hands only
 * while none of its owner's (or the owner's allies') units stand by it and every unit there belongs to one side —
 * then it goes to the nearest of them (ties: the lower slot). Checked once a second. They are never attacked,
 * converted or counted for conquest (combat, priest and victory systems skip `kind: 'relic'`).
 */
export const RELIC_REACH = 1.6; // tiles from the footprint's edge

export function isRelic(w: World, s: number): boolean {
  return w.ents.kind[s] === EKind.building && TYPES[w.ents.type[s]!]!.building!.kind === 'relic';
}

export function relicSystem(w: World): void {
  if (w.tick % 20 !== 5) return;
  const e = w.ents;
  for (let r = 0; r < e.top; r++) {
    if (!e.alive[r] || !isRelic(w, r)) continue;
    const half = TYPES[e.type[r]!]!.size / 2;
    const x = e.x[r]!;
    const y = e.y[r]!;
    const owner = e.owner[r]!;
    let guarded = false;
    let claimant = -1;
    let claimD = Infinity;
    let contested = false;
    w.grid.forEachNear(x, y, half + RELIC_REACH + 1, (s) => {
      if (!e.alive[s] || e.kind[s] !== EKind.unit) return;
      const o = e.owner[s]!;
      if (o === 0) return; // wildlife claims nothing
      const dx = Math.max(0, Math.abs(e.x[s]! - x) - half);
      const dy = Math.max(0, Math.abs(e.y[s]! - y) - half);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > RELIC_REACH) return;
      if (owner !== 0 && allied(w, o, owner)) {
        guarded = true;
        return;
      }
      if (claimant >= 0 && e.owner[claimant]! !== o && !allied(w, o, e.owner[claimant]!)) contested = true;
      if (d < claimD || (d === claimD && s < claimant)) {
        claimD = d;
        claimant = s;
      }
    });
    if (guarded || contested || claimant < 0) continue;
    const to = e.owner[claimant]!;
    if (to === owner) continue;
    unstampLos(w, r); // its sight changes sides (fogSystem restamps it)
    e.owner[r] = to;
    w.events.push({ t: 'captured', h: e.handleOf(r), type: e.type[r]!, from: owner, to, x, y });
  }
}
