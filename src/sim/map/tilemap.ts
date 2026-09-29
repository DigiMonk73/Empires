import { TERRAINS } from '../../data/terrain.ts';

/** Tile-level occupancy flags (beyond terrain). */
export const Occ = { none: 0, resource: 1, building: 2, farm: 4 } as const;

/**
 * The tile grid: terrain, corner elevation, and what occupies each tile. Passability for a movement class is
 * derived: terrain allows the class and nothing solid occupies the tile (farms are walkable).
 */
export class TileMap {
  readonly terrain: Uint8Array;
  /** Elevation at tile corners, (w+1)×(h+1), levels 0..7. */
  readonly height: Uint8Array;
  /** Occ flags per tile. */
  readonly occ: Uint8Array;
  /** Building handle per tile (+1 so 0 = none; handles fit in float64). */
  readonly bldAt: Float64Array;
  /** Resource node index per tile (+1 so 0 = none). */
  readonly resAt: Int32Array;
  /** Cached passability bitmask per tile (MOVE_* bits); rebuilt incrementally. */
  readonly pass: Uint8Array;
  /** Bumped whenever passability changes (pathing caches key on it). */
  passVersion = 0;

  readonly w: number;
  readonly h: number;

  constructor(w: number, h: number, fillTerrain = 0) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.terrain = new Uint8Array(n).fill(fillTerrain);
    this.height = new Uint8Array((w + 1) * (h + 1));
    this.occ = new Uint8Array(n);
    this.bldAt = new Float64Array(n);
    this.resAt = new Int32Array(n);
    this.pass = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.pass[i] = TERRAINS[this.terrain[i]!]!.pass;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  setTerrain(tx: number, ty: number, t: number): void {
    const i = this.idx(tx, ty);
    this.terrain[i] = t;
    this.refreshPass(i);
  }

  /** Recompute passability of one tile from terrain and occupancy. */
  refreshPass(i: number): void {
    const occ = this.occ[i]!;
    const solid = (occ & (Occ.resource | Occ.building)) !== 0;
    const p = solid ? 0 : TERRAINS[this.terrain[i]!]!.pass;
    if (this.pass[i] !== p) {
      this.pass[i] = p;
      this.passVersion++;
    }
  }

  setOcc(tx: number, ty: number, flag: number, on: boolean): void {
    const i = this.idx(tx, ty);
    this.occ[i] = on ? this.occ[i]! | flag : this.occ[i]! & ~flag;
    this.refreshPass(i);
  }

  passable(tx: number, ty: number, moveClass: number): boolean {
    return this.inBounds(tx, ty) && (this.pass[this.idx(tx, ty)]! & moveClass) !== 0;
  }
}
