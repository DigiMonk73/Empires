/**
 * State hashing for determinism checks and lockstep desync detection. Word-wise FNV-1a variant over 32-bit
 * words; doubles are hashed by their exact bit pattern.
 */
const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);

export class Hasher {
  h = 0x811c9dc5 | 0;

  u32(w: number): this {
    this.h = Math.imul(this.h ^ (w | 0), 0x01000193);
    return this;
  }

  f64(v: number): this {
    F64[0] = v;
    return this.u32(U32[0]!).u32(U32[1]!);
  }

  /** Hash the first `length` elements of an array-like of numbers. Integer arrays hash as words, floats by bits. */
  array(a: ArrayLike<number>, length = a.length, floats = a instanceof Float64Array || a instanceof Float32Array): this {
    this.u32(length);
    if (floats) for (let i = 0; i < length; i++) this.f64(a[i]!);
    else for (let i = 0; i < length; i++) this.u32(a[i]!);
    return this;
  }

  str(s: string): this {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) this.u32(s.charCodeAt(i));
    return this;
  }

  /** Final avalanche; returns an unsigned 32-bit value. */
  digest(): number {
    let h = this.h;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }
}

export function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}
