import { describe, expect, it } from 'vitest';
import { TECHS } from '../../src/data/index.ts';
import { MODEL_BY_ID } from '../../src/art/models/index.ts';
import { techIcon } from '../../src/ui/techIcons.ts';

/** M9.7: every research button and tech-tree chip has a baked icon (no ⚙ placeholders). */
describe('tech icons', () => {
  it('every tech maps to a model that is baked, and to one of its variants', () => {
    for (const t of TECHS) {
      const icon = techIcon(t.id);
      expect(icon, t.id).toBeTruthy();
      const [model, v] = icon!.split('#');
      const def = MODEL_BY_ID.get(model!) ?? MODEL_BY_ID.get(`${model}Icon`); // walls have a dedicated icon model
      expect(def, `${t.id} → ${model}`).toBeDefined();
      if (v !== undefined) expect(Number(v), t.id).toBeLessThan(def!.variants ?? 1);
    }
  });

  it('an age advance shows the Town Center of that age', () => {
    expect(techIcon('toolAge')).toBe('townCenter#1');
    expect(techIcon('ironAge')).toBe('townCenter#3');
    expect(techIcon('broadSword')).toBe('broadSwordsman');
    expect(techIcon('chainMailCavalry')).toBe('iconArmor#8');
  });
});
