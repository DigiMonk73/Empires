import type { TileMap } from '../map/tilemap.ts';

/** Walkability accessor for one movement class, with bounds checks. */
export class PathGrid {
  readonly w: number;
  readonly h: number;
  private readonly pass: Uint8Array;
  private readonly mask: number;

  constructor(map: TileMap, moveClass: number) {
    this.w = map.w;
    this.h = map.h;
    this.pass = map.pass;
    this.mask = moveClass;
  }

  walkable(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && (this.pass[y * this.w + x]! & this.mask) !== 0;
  }
}
