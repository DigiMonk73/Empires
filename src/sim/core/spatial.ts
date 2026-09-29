import { EKind, type EntityStore } from './entities.ts';

/** Cell size of the unit grid, in tiles. Must be ≥ the largest interaction distance queried. */
export const CELL = 2;

/**
 * Uniform grid of units (not buildings), rebuilt each tick by counting sort so cell contents are in ascending
 * slot order — neighbor iteration is deterministic.
 */
export class UnitGrid {
  readonly cw: number;
  readonly ch: number;
  /** Start offset of each cell's run in `items` (length cells + 1). */
  start: Int32Array;
  items: Int32Array;
  private cellOf: Int32Array;

  constructor(mapW: number, mapH: number) {
    this.cw = Math.ceil(mapW / CELL);
    this.ch = Math.ceil(mapH / CELL);
    this.start = new Int32Array(this.cw * this.ch + 1);
    this.items = new Int32Array(256);
    this.cellOf = new Int32Array(256);
  }

  cellIndex(x: number, y: number): number {
    let cx = Math.floor(x / CELL);
    let cy = Math.floor(y / CELL);
    if (cx < 0) cx = 0;
    else if (cx >= this.cw) cx = this.cw - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.ch) cy = this.ch - 1;
    return cy * this.cw + cx;
  }

  rebuild(e: EntityStore): void {
    if (this.cellOf.length < e.top) {
      this.cellOf = new Int32Array(e.cap);
      this.items = new Int32Array(e.cap);
    }
    const n = this.cw * this.ch;
    const counts = this.start;
    counts.fill(0);
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.kind[s] !== EKind.unit) {
        this.cellOf[s] = -1;
        continue;
      }
      const c = this.cellIndex(e.x[s]!, e.y[s]!);
      this.cellOf[s] = c;
      counts[c + 1]!++;
    }
    for (let c = 0; c < n; c++) counts[c + 1] = counts[c + 1]! + counts[c]!;
    const fill = counts.slice(0, n);
    for (let s = 0; s < e.top; s++) {
      const c = this.cellOf[s]!;
      if (c >= 0) this.items[fill[c]!++] = s;
    }
  }

  /** Calls `fn(slot)` for units in the cells overlapping the square [x−r, x+r]×[y−r, y+r]. */
  forEachNear(x: number, y: number, r: number, fn: (slot: number) => void): void {
    const x0 = Math.max(0, Math.floor((x - r) / CELL));
    const x1 = Math.min(this.cw - 1, Math.floor((x + r) / CELL));
    const y0 = Math.max(0, Math.floor((y - r) / CELL));
    const y1 = Math.min(this.ch - 1, Math.floor((y + r) / CELL));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * this.cw + cx;
        for (let k = this.start[c]!; k < this.start[c + 1]!; k++) fn(this.items[k]!);
      }
    }
  }
}
