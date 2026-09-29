/**
 * Path goals are sets of tiles, not single points:
 *  - `point`: reach tile (tx, ty) exactly (the final waypoint is the exact point).
 *  - `rect`: reach any tile within `range` (Chebyshev, in tiles) of a rectangle — `range` 1 means "adjacent to
 *    the footprint" (gathering, building, melee on buildings); larger values serve ranged attackers.
 */
export type Goal =
  | { k: 'point'; tx: number; ty: number; x: number; y: number }
  | { k: 'rect'; x0: number; y0: number; x1: number; y1: number; range: number };

/** Chebyshev distance from a tile to the goal rect (0 inside). */
function rectDist(g: Extract<Goal, { k: 'rect' }>, tx: number, ty: number): number {
  const dx = tx < g.x0 ? g.x0 - tx : tx > g.x1 ? tx - g.x1 : 0;
  const dy = ty < g.y0 ? g.y0 - ty : ty > g.y1 ? ty - g.y1 : 0;
  return dx > dy ? dx : dy;
}

export function isGoalTile(g: Goal, tx: number, ty: number): boolean {
  if (g.k === 'point') return tx === g.tx && ty === g.ty;
  const d = rectDist(g, tx, ty);
  return d >= 1 && d <= g.range; // never inside the footprint itself
}

const SQRT2 = 1.4142135623730951;

/** Admissible octile-distance heuristic to the goal set. */
export function heuristic(g: Goal, tx: number, ty: number): number {
  let dx: number;
  let dy: number;
  if (g.k === 'point') {
    dx = Math.abs(tx - g.tx);
    dy = Math.abs(ty - g.ty);
  } else {
    const ex = tx < g.x0 ? g.x0 - tx : tx > g.x1 ? tx - g.x1 : 0;
    const ey = ty < g.y0 ? g.y0 - ty : ty > g.y1 ? ty - g.y1 : 0;
    // Reaching Chebyshev distance `range` needs max(0, e − range) steps along each axis at least.
    dx = Math.max(0, ex - g.range);
    dy = Math.max(0, ey - g.range);
  }
  const mn = dx < dy ? dx : dy;
  const mx = dx < dy ? dy : dx;
  return mn * SQRT2 + (mx - mn);
}
