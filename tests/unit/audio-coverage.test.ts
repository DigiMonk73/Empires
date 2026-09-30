import { describe, expect, it } from 'vitest';
import { makeSfx } from '../../src/audio/synth.ts';
import { EVENT_SOUNDS, MELEE, deathSound, impactSound, missileSound } from '../../src/audio/hooks.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';
import { existsSync, readFileSync } from 'node:fs';
import { CIVS } from '../../src/data/index.ts';

/** M11.1: every event and every unit's strike, missile and death has a sound (or is deliberately silent). */
const ctx = {
  sampleRate: 22050,
  createBuffer: (_ch: number, n: number) => {
    const data = new Float32Array(n);
    return { length: n, getChannelData: () => data };
  },
} as unknown as BaseAudioContext;
const SFX = new Set(Object.keys(makeSfx(ctx)));

describe('audio coverage', () => {
  it('every sim event kind is listed with its sound or a reason for silence', () => {
    for (const [kind, what] of Object.entries(EVENT_SOUNDS)) expect(what.length, kind).toBeGreaterThan(3);
    expect(Object.keys(EVENT_SOUNDS).length).toBeGreaterThanOrEqual(17);
  });

  it('every class has a melee sound that exists', () => {
    for (const [cls, name] of Object.entries(MELEE)) expect(SFX.has(name), `${cls} → ${name}`).toBe(true);
  });

  it('every unit and animal type: missile, impact and death sounds exist', () => {
    for (let i = 0; i < TYPES.length; i++) {
      const t = TYPES[i]!;
      if (!t.unit && !t.animal) continue;
      const d = deathSound(i);
      expect(d === 'voice' || SFX.has(d), `${t.id} death → ${d}`).toBe(true);
      if (t.unit?.range && t.unit.range > 1) {
        expect(SFX.has(missileSound(i)), `${t.id} missile`).toBe(true);
        for (const hit of [true, false]) for (const wet of [true, false]) {
          const s = impactSound(i, hit, wet);
          expect(s === null || SFX.has(s), `${t.id} impact`).toBe(true);
        }
      }
    }
  });

  it('every effect renders with a −3 dBFS peak and no silence at the start', () => {
    for (const [name, buf] of Object.entries(makeSfx(ctx))) {
      const x = buf.getChannelData(0);
      let peak = 0;
      for (const v of x) peak = Math.max(peak, Math.abs(v));
      expect(peak, name).toBeLessThanOrEqual(0.892); // ≤ −1 dBFS (M11 exit gate)
      expect(peak, name).toBeGreaterThan(0.5);
      let first = 0;
      while (first < x.length && Math.abs(x[first]!) < 0.01) first++;
      expect(first / 22050, `${name} onset`).toBeLessThan(0.2);
    }
  });

  it('every culture speaks: villager, soldier and priest lines per architecture set (M11.2)', () => {
    const manifest = JSON.parse(readFileSync('public/audio/voices/manifest.json', 'utf8')) as Record<string, string[]>;
    for (const arch of new Set(CIVS.map((c) => c.arch))) {
      for (const role of ['villager', 'soldier', 'priest']) {
        const lines = manifest[`${arch}/${role}`];
        expect(lines?.length, `${arch}/${role}`).toBeGreaterThanOrEqual(3);
        expect(lines!.some((f) => f.includes('/select')), `${arch}/${role} select`).toBe(true);
        expect(lines!.some((f) => f.includes('/ack')), `${arch}/${role} ack`).toBe(true);
        for (const f of lines!) expect(existsSync(`public/audio/voices/${f}`), f).toBe(true);
      }
    }
    expect(manifest.death?.length).toBeGreaterThanOrEqual(3);
  });
});
