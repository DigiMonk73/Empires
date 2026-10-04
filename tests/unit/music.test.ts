import { describe, expect, it } from 'vitest';
import { MusicGen, type Culture, type Mood } from '../../src/audio/music.ts';

/** M11.3: the generator is deterministic, seamless across slices, under −1 dBFS and never silent. */
const RATE = 8000; // low rate keeps the test fast; the maths is rate-independent

describe('generative music', () => {
  it('two 2 s slices are the same audio as one 4 s slice (tails and drone carry over)', () => {
    const a = new MusicGen(RATE, 'greek', 3);
    const b = new MusicGen(RATE, 'greek', 3);
    a.setMood('tension');
    b.setMood('tension');
    const [whole] = a.next(4);
    const [p1] = b.next(2);
    const [p2] = b.next(2);
    const joined = new Float32Array(whole.length);
    joined.set(p1);
    joined.set(p2, p1.length);
    let worst = 0;
    for (let i = 0; i < whole.length; i++) worst = Math.max(worst, Math.abs(whole[i]! - joined[i]!));
    expect(worst).toBeLessThan(1e-4);
  });

  it('every culture and mood: peaks under −1 dBFS, no silent second over two minutes', () => {
    for (const c of ['greek', 'roman', 'egyptian', 'babylonian', 'asian'] as Culture[]) {
      for (const m of ['peace', 'tension', 'battle'] as Mood[]) {
        const g = new MusicGen(RATE, c, 11);
        g.setMood(m);
        let peak = 0;
        let quietest = 1;
        for (let k = 0; k < 30; k++) {
          const [L, R] = g.next(4);
          for (let w = 0; w < L.length; w += RATE) {
            let sq = 0;
            for (let i = w; i < Math.min(L.length, w + RATE); i++) {
              sq += L[i]! * L[i]!;
              peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!));
            }
            quietest = Math.min(quietest, Math.sqrt(sq / RATE));
          }
        }
        expect(peak, `${c} ${m} peak`).toBeLessThanOrEqual(0.891);
        expect(20 * Math.log10(quietest), `${c} ${m} quietest second`).toBeGreaterThan(-50);
      }
    }
  }, 60_000); // 6.0s on the GitHub runner; the default 5s fails it (M16.25)

  it('is deterministic for a seed and different across seeds', () => {
    const x = new MusicGen(RATE, 'asian', 5).next(3)[0];
    const y = new MusicGen(RATE, 'asian', 5).next(3)[0];
    const z = new MusicGen(RATE, 'asian', 6).next(3)[0];
    expect(Array.from(x)).toEqual(Array.from(y));
    expect(Array.from(x)).not.toEqual(Array.from(z));
  });
});
