import type { TileMap } from '../map/tilemap.ts';

/**
 * Connected regions per movement class (4-connected flood fill; with no corner cutting, diagonal moves never
 * connect tiles that 4-connectivity doesn't). Region 0 = impassable. Labels are recomputed lazily when the map's
 * passability version changes — O(w·h), well under a millisecond for the largest maps.
 */
export class Regions {
  private readonly cache = new Map<number, { version: number; labels: Int32Array; count: number }>();
  private stack: Int32Array;
  private readonly map: TileMap;

  constructor(map: TileMap) {
    this.map = map;
    this.stack = new Int32Array(map.w * map.h);
  }

  labels(moveClass: number): Int32Array {
    let c = this.cache.get(moveClass);
    if (!c) {
      c = { version: -1, labels: new Int32Array(this.map.w * this.map.h), count: 0 };
      this.cache.set(moveClass, c);
    }
    if (c.version !== this.map.passVersion) {
      c.count = this.flood(moveClass, c.labels);
      c.version = this.map.passVersion;
    }
    return c.labels;
  }

  regionAt(moveClass: number, tx: number, ty: number): number {
    if (!this.map.inBounds(tx, ty)) return 0;
    return this.labels(moveClass)[ty * this.map.w + tx]!;
  }

  private flood(moveClass: number, labels: Int32Array): number {
    const { w, h, pass } = this.map;
    labels.fill(0);
    let next = 0;
    const st = this.stack;
    for (let start = 0; start < w * h; start++) {
      if (labels[start] !== 0 || (pass[start]! & moveClass) === 0) continue;
      next++;
      let sp = 0;
      st[sp++] = start;
      labels[start] = next;
      while (sp > 0) {
        const i = st[--sp]!;
        const x = i % w;
        const y = (i - x) / w;
        if (x > 0) sp = this.visit(i - 1, moveClass, labels, next, sp);
        if (x < w - 1) sp = this.visit(i + 1, moveClass, labels, next, sp);
        if (y > 0) sp = this.visit(i - w, moveClass, labels, next, sp);
        if (y < h - 1) sp = this.visit(i + w, moveClass, labels, next, sp);
      }
    }
    return next;
  }

  private visit(j: number, moveClass: number, labels: Int32Array, label: number, sp: number): number {
    if (labels[j] === 0 && (this.map.pass[j]! & moveClass) !== 0) {
      labels[j] = label;
      this.stack[sp++] = j;
    }
    return sp;
  }
}
