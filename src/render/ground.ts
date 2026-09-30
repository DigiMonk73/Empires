import type { TileMap } from '../sim/map/tilemap.ts';

/**
 * The height the ground is drawn at (M10.1b): the sim's heights are whole levels on tile corners — terraces
 * joined by one-tile ramps — so the drawn surface averages them over a small neighbourhood, turning the terraces
 * into rounded mounds. Terrain, sprites, effects and picking all use this one function, so everything stands on
 * the ground it is drawn on; the sim keeps the exact levels for its rules (D44).
 */
const R = 0.6;
const OFFS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-R, 0],
  [R, 0],
  [0, -R],
  [0, R],
  [-R, -R],
  [R, -R],
  [-R, R],
  [R, R],
];

export function groundHeight(map: TileMap, x: number, y: number): number {
  let s = 0;
  for (const [dx, dy] of OFFS) s += map.heightAt(x + dx, y + dy);
  return s / OFFS.length;
}
