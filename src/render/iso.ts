/**
 * Isometric (2:1 dimetric) projection. World units are tiles; screen units are logical (CSS) pixels.
 * A tile is a 64×32 diamond; one elevation level lifts terrain by 16 px (DECISIONS D11).
 */
export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;
export const ELEVATION_PX = 16;

export interface Point {
  x: number;
  y: number;
}

/** World (tile) coordinates → iso screen space (before camera transform). */
export function worldToIso(x: number, y: number, h = 0, out: Point = { x: 0, y: 0 }): Point {
  out.x = (x - y) * HALF_W;
  out.y = (x + y) * HALF_H - h * ELEVATION_PX;
  return out;
}

/** Iso screen space → world (tile) coordinates on the flat ground plane. */
export function isoToWorld(sx: number, sy: number, out: Point = { x: 0, y: 0 }): Point {
  const a = sx / HALF_W;
  const b = sy / HALF_H;
  out.x = (a + b) / 2;
  out.y = (b - a) / 2;
  return out;
}
