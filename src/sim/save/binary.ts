/** Minimal UTF-8 codec and typed-array container helpers (the sim has no DOM/Node libs). */

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i++]!;
    let cp: number;
    if (c < 0x80) cp = c;
    else if (c < 0xe0) cp = ((c & 31) << 6) | (b[i++]! & 63);
    else if (c < 0xf0) cp = ((c & 15) << 12) | ((b[i++]! & 63) << 6) | (b[i++]! & 63);
    else cp = ((c & 7) << 18) | ((b[i++]! & 63) << 12) | ((b[i++]! & 63) << 6) | (b[i++]! & 63);
    if (cp >= 0x10000) {
      cp -= 0x10000;
      s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
    } else s += String.fromCharCode(cp);
  }
  return s;
}

export type TypedArray = Uint8Array | Uint16Array | Int16Array | Int32Array | Uint32Array | Float64Array;

export const ARRAY_TYPES: Record<string, new (n: number) => TypedArray> = {
  u8: Uint8Array,
  u16: Uint16Array,
  i16: Int16Array,
  i32: Int32Array,
  u32: Uint32Array,
  f64: Float64Array,
};

export function typeTag(a: TypedArray): string {
  if (a instanceof Uint8Array) return 'u8';
  if (a instanceof Uint16Array) return 'u16';
  if (a instanceof Int16Array) return 'i16';
  if (a instanceof Int32Array) return 'i32';
  if (a instanceof Uint32Array) return 'u32';
  return 'f64';
}

/** Copy a typed array's bytes into a fresh, 8-byte-alignable byte array. */
export function bytesOf(a: TypedArray): Uint8Array {
  return new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));
}
