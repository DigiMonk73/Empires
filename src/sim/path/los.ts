import type { PathGrid } from './grid.ts';

/**
 * Walkable line of sight between two continuous points: every tile the segment touches (supercover) must be
 * walkable, and where it passes exactly through a tile corner both side tiles must be walkable (no squeezing
 * between diagonal obstacles). Used for string-pull smoothing.
 */
export function lineWalkable(grid: PathGrid, x0: number, y0: number, x1: number, y1: number): boolean {
  let tx = Math.floor(x0);
  let ty = Math.floor(y0);
  const ex = Math.floor(x1);
  const ey = Math.floor(y1);
  if (!grid.walkable(tx, ty)) return false;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  // Parametric distance to the next vertical / horizontal grid line, and per-tile step.
  const tdx = sx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = sy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tmx = sx > 0 ? (tx + 1 - x0) * tdx : sx < 0 ? (x0 - tx) * tdx : Infinity;
  let tmy = sy > 0 ? (ty + 1 - y0) * tdy : sy < 0 ? (y0 - ty) * tdy : Infinity;
  let guard = 0;
  while ((tx !== ex || ty !== ey) && guard++ < 4096) {
    const diff = tmx - tmy;
    if (Math.abs(diff) < 1e-12) {
      // Passing through a corner: both neighbours must be open, then step diagonally.
      if (!grid.walkable(tx + sx, ty) || !grid.walkable(tx, ty + sy)) return false;
      tx += sx;
      ty += sy;
      tmx += tdx;
      tmy += tdy;
    } else if (diff < 0) {
      tx += sx;
      tmx += tdx;
    } else {
      ty += sy;
      tmy += tdy;
    }
    if (!grid.walkable(tx, ty)) return false;
  }
  return true;
}
