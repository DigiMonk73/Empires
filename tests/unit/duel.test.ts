import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex, TYPES, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { damageBetween, WINDUP_TICKS } from '../../src/sim/systems/combat.ts';

/**
 * Duel matrix (M5 exit gate): damage per blow from the data matches hand-computed values from the research
 * (mil:1a, mil:2), and simulated melee duels end exactly as the formula predicts — winner and remaining HP —
 * which checks windup, reload and 1.0a retaliation timing together.
 */
function world() {
  return Sim.create({ seed: 1, map: { w: 24, h: 24 }, players: [{ civ: 'greek' }, { civ: 'persian' }] }).world;
}

describe('damage anchors (research numbers)', () => {
  const w = world();
  const u = (id: string) => w.stats(1, unitTypeIndex(id));
  const b = (id: string) => w.stats(1, buildingTypeIndex(id));
  const cases: [string, string, number, string][] = [
    ['clubman', 'villager', 3, 'melee 3'],
    ['axeman', 'clubman', 5, 'melee 5'],
    ['slinger', 'bowman', 4, 'pierce 2 + class-1 bonus 2 (archers −2)'],
    ['slinger', 'clubman', 2, 'pierce 2, no class-1 armour'],
    ['bowman', 'slinger', 1, 'pierce 3 − slinger pierce armour 2'],
    ['cavalry', 'clubman', 13, 'melee 8 + infantry bonus 5'],
    ['camel', 'scout', 14, 'melee 6 + cavalry bonus 8'],
    ['camel', 'cavalry', 14, 'melee 6 + cavalry bonus 8'],
    ['hoplite', 'clubman', 17, 'melee 17'],
    ['clubman', 'hoplite', 1, 'melee 3 − armour 5 → floor 1'],
    ['scout', 'villager', 3, 'melee 3'],
  ];
  for (const [a, d, want, why] of cases) {
    it(`${a} → ${d} = ${want} (${why})`, () => expect(damageBetween(u(a).atk, u(d).arm)).toBe(want));
  }
  it('bowman → house = 0.6 (pierce 3 × 0.2)', () => expect(damageBetween(u('bowman').atk, b('house').arm, true)).toBeCloseTo(0.6, 9));
  it('stone thrower → house = 38 ((50 + 140) × 0.2: "+28 vs buildings")', () =>
    expect(damageBetween(u('stoneThrower').atk, b('house').arm, true)).toBeCloseTo(38, 9));
});

describe('melee duels end as the formula predicts', () => {
  // A attacks B; B (idle) retaliates the tick after A's first blow lands. Both reload 1.5 s (30 ticks).
  const pairs: [string, string][] = [
    ['clubman', 'villager'],
    ['villager', 'clubman'],
    ['axeman', 'clubman'],
    ['clubman', 'axeman'],
    ['scout', 'clubman'],
    ['cavalry', 'axeman'],
    ['hoplite', 'cavalry'],
    ['camel', 'cavalry'],
  ];
  for (const [a, b] of pairs) {
    it(`${a} vs ${b}`, () => {
      const ta = unitTypeIndex(a);
      const tb = unitTypeIndex(b);
      const ra = TYPES[ta]!.radius;
      const rb = TYPES[tb]!.radius;
      const sim = Sim.create({
        seed: 2,
        map: { w: 24, h: 24 },
        players: [{ civ: 'greek' }, { civ: 'persian' }],
        scenario: { units: [{ type: a, owner: 1, x: 10.5, y: 10.5 }, { type: b, owner: 2, x: 10.5 + ra + rb + 0.15, y: 10.5 }] },
      });
      const w = sim.world;
      const e = w.ents;
      const [ha, hb] = [e.handleOf(0), e.handleOf(1)];
      const sa = w.stats(1, ta);
      const sb = w.stats(2, tb);
      const dab = damageBetween(sa.atk, sb.arm);
      const dba = damageBetween(sb.atk, sa.arm);
      const hitsA = Math.ceil(sb.hp / dab); // blows A needs
      const hitsB = Math.ceil(sa.hp / dba);
      sim.step([{ player: 1, cmd: { t: 'act', ids: [ha], h: hb } }]);
      for (let t = 0; t < 20 * 120 && e.slotOf(ha) >= 0 && e.slotOf(hb) >= 0; t++) sim.step();
      // A's k-th blow lands at 7 + 30(k−1); B's j-th at 7 + 1 + 7 + 30(j−1): B gets hitsA − 1 blows in first.
      expect(sa.reloadTicks).toBe(30);
      expect(sb.reloadTicks).toBe(30);
      expect(WINDUP_TICKS).toBe(7);
      if (hitsB >= hitsA) {
        expect(e.slotOf(hb)).toBe(-1);
        expect(e.hp[e.slotOf(ha)]).toBeCloseTo(sa.hp - dba * (hitsA - 1), 9);
      } else {
        expect(e.slotOf(ha)).toBe(-1);
        expect(e.hp[e.slotOf(hb)]).toBeCloseTo(sb.hp - dab * hitsB, 9);
      }
    });
  }
});
