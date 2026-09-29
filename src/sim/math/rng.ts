/**
 * Seeded PRNG for the simulation (DECISIONS D1): sfc32, 128-bit state, integer ops only. Each purpose gets its
 * own stream (mapgen, combat, conversion, per-player AI, …) so consuming one never perturbs another.
 */

/** splitmix32 — expands a seed into well-mixed 32-bit words. */
function splitmix32(state: { s: number }): number {
  state.s = (state.s + 0x9e3779b9) | 0;
  let z = state.s;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

export type RngState = [number, number, number, number];

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number, stream = 0) {
    const st = { s: (seed ^ Math.imul(stream + 1, 0x632be5ab)) | 0 };
    this.a = splitmix32(st);
    this.b = splitmix32(st);
    this.c = splitmix32(st);
    this.d = splitmix32(st);
    for (let i = 0; i < 12; i++) this.u32(); // warm up
  }

  /** Uniform 32-bit unsigned integer. */
  u32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.u32() / 4294967296;
  }

  /** Uniform integer in [0, n) for 0 < n ≤ 2^32. */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  /** Uniform integer in [lo, hi] inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Deterministic in-place Fisher–Yates shuffle. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = t;
    }
    return arr;
  }

  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  setState(s: RngState): void {
    [this.a, this.b, this.c, this.d] = s;
  }
}

/** Named streams owned by the world. Player AI streams are created per player slot. */
export const STREAM = { mapgen: 1, combat: 2, conversion: 3, animals: 4, misc: 5, aiBase: 100 } as const;
