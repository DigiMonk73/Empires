import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { syncHud } from '../../src/ui/sync.ts';
import { hud } from '../../src/ui/store.ts';
import { ARMOR_CLASS } from '../../src/data/types.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';

/** M15.10 P42: the status box shows the unit as the game has it — civ bonuses and technologies included. */
describe('HUD status box (M15.10 P42)', () => {
  it('shows compiled hit points, attack, armour and range, not the base data', () => {
    const sim = Sim.create({
      seed: 1,
      map: { w: 24, h: 24 },
      players: [{ civ: 'choson' }, { civ: 'hittite' }],
      victory: 'none',
      scenario: { units: [{ type: 'longSwordsman', owner: 1, x: 5.5, y: 5.5 }, { type: 'warGalley', owner: 2, x: 15.5, y: 15.5 }] },
    });
    const w = sim.world;
    for (const t of ['toolAge', 'bronzeAge', 'ironAge', 'bronzeShield', 'ironShield']) completeResearch(w, 1, t);
    const e = w.ents;
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s]) continue;
      syncHud(w, 1, [e.handleOf(s)]);
      const box = hud.selection.value[0]!;
      const st = w.stats(e.owner[s]!, e.type[s]!);
      expect(box.maxHp).toBe(st.hp);
      expect(box.range).toBe(st.range);
      expect(box.atk).toBe(String(Math.round(st.atk[ARMOR_CLASS.melee] ?? st.atk[ARMOR_CLASS.pierce] ?? 0)));
      expect(box.arm).toBe(`${Math.round(st.arm[ARMOR_CLASS.melee] ?? 0)}/${Math.round(st.arm[ARMOR_CLASS.pierce] ?? 0)}`);
    }
  });
});
