/**
 * Static gatherable objects — trees, mines, berry bushes, fish, carcasses. Thousands of trees make per-entity
 * overhead matter, so these live in a compact SoA store addressed by index, indexed by tile and by 16×16 chunk.
 * Nodes are never moved; a depleted node is marked `gone` (its index is not reused, keeping indices stable
 * for saves, replays and renderer caches).
 */
export const ResState = { standing: 0, felled: 1, gone: 2 } as const;
export const CHUNK = 16;

export class ResourceStore {
  count = 0;
  cap = 0;
  /** Index into the resource registry (data RESOURCE_OBJECTS order, then carcass kinds). */
  kind = new Uint8Array(0);
  /** Tile the node occupies (top-left for multi-tile nodes). */
  tx = new Int16Array(0);
  ty = new Int16Array(0);
  /** Remaining amount of its resource. */
  amount = new Float64Array(0);
  state = new Uint8Array(0);
  /** Visual variant (render picks the sprite); set by mapgen. */
  variant = new Uint8Array(0);
  /** Per-chunk lists of node indices, for rendering and nearest-node searches. */
  chunks: number[][] = [];
  private chunksW = 0;

  readonly mapW: number;
  readonly mapH: number;

  constructor(mapW: number, mapH: number, initialCap = 1024) {
    this.mapW = mapW;
    this.mapH = mapH;
    this.chunksW = Math.ceil(mapW / CHUNK);
    const n = this.chunksW * Math.ceil(mapH / CHUNK);
    for (let i = 0; i < n; i++) this.chunks.push([]);
    this.grow(initialCap);
  }

  private grow(newCap: number): void {
    const k = new Uint8Array(newCap);
    k.set(this.kind);
    const tx = new Int16Array(newCap);
    tx.set(this.tx);
    const ty = new Int16Array(newCap);
    ty.set(this.ty);
    const a = new Float64Array(newCap);
    a.set(this.amount);
    const s = new Uint8Array(newCap);
    s.set(this.state);
    const v = new Uint8Array(newCap);
    v.set(this.variant);
    this.kind = k;
    this.tx = tx;
    this.ty = ty;
    this.amount = a;
    this.state = s;
    this.variant = v;
    this.cap = newCap;
  }

  add(kind: number, tx: number, ty: number, amount: number, variant = 0): number {
    if (this.count === this.cap) this.grow(this.cap * 2);
    const i = this.count++;
    this.kind[i] = kind;
    this.tx[i] = tx;
    this.ty[i] = ty;
    this.amount[i] = amount;
    this.state[i] = ResState.standing;
    this.variant[i] = variant;
    this.chunks[this.chunkIndex(tx, ty)]!.push(i);
    return i;
  }

  chunkIndex(tx: number, ty: number): number {
    return Math.floor(ty / CHUNK) * this.chunksW + Math.floor(tx / CHUNK);
  }

  get chunksAcross(): number {
    return this.chunksW;
  }
}
