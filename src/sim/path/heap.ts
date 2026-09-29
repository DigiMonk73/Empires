/**
 * Binary min-heap of grid node indices. Each entry snapshots its (f, h) keys when pushed — a node whose score
 * later improves is pushed again (lazy decrease-key), and the stale entry is skipped by the caller. Ties break
 * by h, then node index, so pop order is fully deterministic.
 */
export class NodeHeap {
  private node: number[] = [];
  private fk: number[] = [];
  private hk: number[] = [];

  get size(): number {
    return this.node.length;
  }

  clear(): void {
    this.node.length = 0;
    this.fk.length = 0;
    this.hk.length = 0;
  }

  private less(a: number, b: number): boolean {
    const fa = this.fk[a]!;
    const fb = this.fk[b]!;
    if (fa !== fb) return fa < fb;
    const ha = this.hk[a]!;
    const hb = this.hk[b]!;
    if (ha !== hb) return ha < hb;
    return this.node[a]! < this.node[b]!;
  }

  private swap(a: number, b: number): void {
    const n = this.node[a]!;
    this.node[a] = this.node[b]!;
    this.node[b] = n;
    const f = this.fk[a]!;
    this.fk[a] = this.fk[b]!;
    this.fk[b] = f;
    const h = this.hk[a]!;
    this.hk[a] = this.hk[b]!;
    this.hk[b] = h;
  }

  push(n: number, f: number, h: number): void {
    this.node.push(n);
    this.fk.push(f);
    this.hk.push(h);
    let i = this.node.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.node[0]!;
    const last = this.node.length - 1;
    this.swap(0, last);
    this.node.pop();
    this.fk.pop();
    this.hk.pop();
    let i = 0;
    const n = this.node.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}
