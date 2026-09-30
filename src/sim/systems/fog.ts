import type { World } from '../world.ts';
import { allied } from '../rules/diplomacy.ts';

/**
 * Fog of war (mil:6): per player, a visibility count per tile (how many of the player's entities see it) and an
 * explored flag. Each entity stamps a disc of its line of sight at its tile; it restamps only when its tile or
 * LOS changes, so the per-tick cost is proportional to movement, not unit count.
 */
export interface FogState {
  /** vis[player][tile] = number of the player's entities seeing the tile. */
  vis: Uint16Array[];
  /** explored[player][tile] = 1 once ever seen. */
  explored: Uint8Array[];
  /** Bumped when a player's visibility changes (render/minimap caches key on it). Not hashed. */
  version: number[];
}

export function createFog(players: number, w: number, h: number, revealAll: boolean): FogState {
  const vis: Uint16Array[] = [];
  const explored: Uint8Array[] = [];
  const version: number[] = [];
  for (let p = 0; p < players; p++) {
    vis.push(new Uint16Array(w * h));
    explored.push(new Uint8Array(w * h).fill(revealAll ? 1 : 0));
    version.push(0);
  }
  return { vis, explored, version };
}

/** Disc offsets per radius (integer tiles), computed once. Rounder than a plain r² test. */
const DISCS: Int16Array[] = [];
function disc(r: number): Int16Array {
  let d = DISCS[r];
  if (d) return d;
  const pts: number[] = [];
  const lim = r * r + r;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= lim) pts.push(dx, dy);
  DISCS[r] = d = Int16Array.from(pts);
  return d;
}

function stamp(w: World, player: number, tx: number, ty: number, r: number, delta: 1 | -1): void {
  const vis = w.fog.vis[player]!;
  const exp = w.fog.explored[player]!;
  const d = disc(r);
  const W = w.map.w;
  const H = w.map.h;
  for (let k = 0; k < d.length; k += 2) {
    const x = tx + d[k]!;
    const y = ty + d[k + 1]!;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    vis[i] = vis[i]! + delta;
    if (delta > 0) exp[i] = 1;
  }
  w.fog.version[player]!++;
}

/** Remove an entity's stamp (death, removal, a change of sides) from every player it was given to. */
export function unstampLos(w: World, slot: number): void {
  const e = w.ents;
  const r = e.losR[slot]!;
  if (!r) return;
  const mask = e.losMask[slot]!;
  for (let p = 0; p < w.players.length; p++) if (mask & (1 << p)) stamp(w, p, e.losTx[slot]!, e.losTy[slot]!, r, -1);
  e.losR[slot] = 0;
  e.losMask[slot] = 0;
}

/**
 * Who sees what `owner`'s entities see: the owner, plus the players it calls Ally once it has researched Writing
 * ("allies share your line of sight", econ:5).
 */
function sightMask(w: World, owner: number): number {
  let m = 1 << owner;
  const p = w.players[owner]!;
  if (p.stats.flags.has('writing')) {
    for (let q = 1; q < w.players.length; q++) if (q !== owner && allied(w, owner, q)) m |= 1 << q;
  }
  return m;
}

/** Restamp entities whose tile or line of sight changed. Gaia (player 0) has no fog. */
export function fogSystem(w: World): void {
  const e = w.ents;
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.owner[s] === 0) continue;
    const tx = Math.floor(e.x[s]!);
    const ty = Math.floor(e.y[s]!);
    // Line of sight as compiled for the owner (ages, Woodworking, Afterlife, civ bonuses change it).
    const r = Math.max(1, Math.round(w.stats(e.owner[s]!, e.type[s]!).los));
    const mask = sightMask(w, e.owner[s]!);
    if (e.losR[s] === r && e.losTx[s] === tx && e.losTy[s] === ty && e.losMask[s] === mask) continue;
    unstampLos(w, s);
    for (let p = 0; p < w.players.length; p++) if (mask & (1 << p)) stamp(w, p, tx, ty, r, 1);
    e.losTx[s] = tx;
    e.losTy[s] = ty;
    e.losR[s] = r;
    e.losMask[s] = mask;
  }
}
