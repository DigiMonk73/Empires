import { describe, expect, it } from 'vitest';
import { BUILDINGS, CIVS } from '../../src/data/index.ts';
import { RECIPES } from '../../src/art/models/arch/kit.ts';
import { MODELS } from '../../src/art/models/index.ts';
import { archModelId, archOf } from '../../src/render/arch.ts';

/** M9.2 (D43): buildings are drawn in their owner's architecture set, falling back to the shared set. */
describe('architecture sets', () => {
  it('maps each civilization to its set (Greek when unknown)', () => {
    expect(archOf('egyptian')).toBe('egyptian');
    expect(archOf('sumerian')).toBe('egyptian');
    expect(archOf('hittite')).toBe('babylonian');
    expect(archOf('yamato')).toBe('asian');
    expect(archOf('carthaginian')).toBe('roman');
    expect(archOf('minoan')).toBe('greek');
    expect(archOf(undefined)).toBe('greek');
    expect(archOf('atlantis')).toBe('greek');
    for (const c of CIVS) expect(['egyptian', 'greek', 'babylonian', 'asian', 'roman']).toContain(archOf(c.id));
  });

  it("picks the set's model when it is baked, else the shared one", () => {
    const has = (id: string) => id === 'house_egyptian';
    expect(archModelId('house', 'egyptian', has)).toBe('house_egyptian');
    expect(archModelId('dock', 'egyptian', has)).toBe('dock');
    expect(archModelId('house', 'greek', has)).toBe('house');
    expect(archModelId('house', 'roman', has)).toBe('house');
  });

  it('every recipe is a real building, with one variant per age from its own age to Iron', () => {
    for (const [id, r] of Object.entries(RECIPES)) {
      const b = BUILDINGS.find((x) => x.id === id);
      expect(b, id).toBeDefined();
      expect(r.own, id).toBe(b!.age - 1);
      expect(r.footprint, id).toBe(b!.size);
    }
    const sets = new Set(MODELS.map((m) => /_([a-z]+)$/.exec(m.id)?.[1]).filter((x): x is string => !!x));
    expect(sets.has('egyptian')).toBe(true);
    for (const set of sets) {
      const ms = MODELS.filter((m) => m.id.endsWith(`_${set}`));
      expect(ms.map((m) => m.id.replace(`_${set}`, '')).sort(), set).toEqual(Object.keys(RECIPES).sort());
      for (const m of ms) expect(m.variants, m.id).toBe(4 - RECIPES[m.id.replace(`_${set}`, '')]!.own);
    }
  });
});
