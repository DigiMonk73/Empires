import { describe, expect, it } from 'vitest';
import { Hasher, hex32 } from '../../src/sim/math/hash.ts';
import { Rng } from '../../src/sim/math/rng.ts';
import { cosStep, DIR16_X, DIR16_Y, dir16, dir8, sinStep, TRIG_STEPS } from '../../src/sim/math/trig.ts';
import { secondsToTicks, perTick } from '../../src/sim/time.ts';

describe('Rng', () => {
  it('produces a pinned sequence (regression: changing it breaks saves and replays)', () => {
    const r = new Rng(42, 0);
    expect([r.u32(), r.u32(), r.u32(), r.u32()]).toEqual([1302909849, 4156217449, 1554496841, 2827295010]);
    const q = new Rng(42, 1);
    expect([q.u32(), q.u32()]).toEqual([3698112990, 1105630742]);
  });

  it('streams are independent and state round-trips', () => {
    const a = new Rng(7, 2);
    a.u32();
    const s = a.getState();
    const next = [a.u32(), a.u32()];
    const b = new Rng(1, 1);
    b.setState(s);
    expect([b.u32(), b.u32()]).toEqual(next);
  });

  it('int() is roughly uniform and in range', () => {
    const r = new Rng(123);
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) counts[r.int(10)]++;
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
    }
  });
});

describe('trig tables', () => {
  it('matches Math.sin/cos closely', () => {
    for (let i = 0; i < TRIG_STEPS; i += 7) {
      expect(Math.abs(sinStep(i) - Math.sin((2 * Math.PI * i) / TRIG_STEPS))).toBeLessThan(1e-12);
      expect(Math.abs(cosStep(i) - Math.cos((2 * Math.PI * i) / TRIG_STEPS))).toBeLessThan(1e-12);
    }
  });

  it('dir16 matches atan2 sectors exactly', () => {
    for (let a = 0; a < 360; a += 0.5) {
      // Skip exact sector boundaries (odd multiples of 11.25°), where rounding decides.
      if (Math.abs(((a + 11.25) % 22.5) - 0) < 1e-9 || Math.abs(((a + 11.25) % 22.5) - 22.5) < 1e-9) continue;
      const rad = (a * Math.PI) / 180;
      const expected = Math.round(a / 22.5) % 16;
      expect(dir16(Math.cos(rad) * 10, Math.sin(rad) * 10)).toBe(expected);
    }
    expect(dir16(0, 0)).toBe(-1);
    expect(dir16(1, 0)).toBe(0);
    expect(dir16(0, 1)).toBe(4);
    expect(dir16(-1, 0)).toBe(8);
    expect(dir16(0, -1)).toBe(12);
    expect(dir8(1, 1)).toBe(1);
    expect(dir8(-1, -1)).toBe(5);
  });

  it('direction unit vectors are unit length', () => {
    for (let k = 0; k < 16; k++) expect(Math.hypot(DIR16_X[k]!, DIR16_Y[k]!)).toBeCloseTo(1, 12);
  });
});

describe('Hasher', () => {
  it('is stable (regression) and sensitive', () => {
    expect(hex32(new Hasher().u32(1).f64(0.1).str('empires').digest())).toBe('78cd8f4f');
    const a = new Hasher().array(new Float64Array([1, 2, 3])).digest();
    const b = new Hasher().array(new Float64Array([1, 2, 3.0000000000000004])).digest();
    expect(a).not.toBe(b);
    expect(new Hasher().array(new Int32Array([1, 2]), 2).digest()).not.toBe(new Hasher().array(new Int32Array([2, 1]), 2).digest());
  });
});

describe('time', () => {
  it('converts seconds and rates to ticks', () => {
    expect(secondsToTicks(1.5)).toBe(30);
    expect(secondsToTicks(0.01)).toBe(1);
    expect(secondsToTicks(0)).toBe(0);
    expect(perTick(1.1)).toBeCloseTo(0.055, 12);
  });
});
