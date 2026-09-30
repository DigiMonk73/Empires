import { describe, expect, it } from 'vitest';
import { Tactics, worth } from '../../src/ai/tactics.ts';
import { UPGRADE_TIER } from '../../src/ai/upgrades.ts';
import { runMatch } from '../../src/game/aiMatch.ts';
import { Sim } from '../../src/sim/index.ts';
import { HARDEST_BONUS } from '../../src/data/setup.ts';

describe('AI v2 (M13.2)', () => {
  it('values units by price and health left', () => {
    expect(worth('clubman', 40)).toBe(50); // 50 food, full health
    expect(worth('clubman', 20)).toBe(25);
    expect(worth('nonsense', 10)).toBe(0);
  });

  it('pushes only when clearly stronger than the enemy it remembers', () => {
    const t = new Tactics();
    t.seen.set(1, { h: 1, type: 'clubman', hp: 40, x: 0, y: 0, tick: 0 });
    t.seen.set(2, { h: 2, type: 'clubman', hp: 40, x: 0, y: 0, tick: 0 });
    const army = (n: number) => Array.from({ length: n }, (_, i) => ({ h: 10 + i, type: 'clubman', cls: 'infantry', x: 0, y: 0, hp: 40, idle: true, order: null, target: -1, job: null, carry: 0, act: 0, aboard: 0 }));
    expect(t.readyToPush(army(2), false)).toBe(false);
    expect(t.readyToPush(army(3), false)).toBe(true); // 150 ≥ 1.5 × 100
    expect(t.readyToPush(army(1), true)).toBe(true); // population full: go anyway
  });

  it('the harder levels research further down the upgrade programme', () => {
    expect([UPGRADE_TIER.easiest, UPGRADE_TIER.easy, UPGRADE_TIER.moderate, UPGRADE_TIER.hard, UPGRADE_TIER.hardest]).toEqual([0, 1, 2, 3, 4]);
    const r = runMatch({ seed: 104, type: 'continental', size: 'tiny', levels: ['hard', 'easiest'], minutes: 30 });
    const econ = ['woodworking', 'domestication', 'toolworking', 'wheel', 'leatherArmorSoldiers', 'leatherArmorArchers', 'leatherArmorCavalry'];
    expect(r.techs[0]!.filter((t) => econ.includes(t)).length).toBeGreaterThan(0);
    expect(r.techs[1]!.filter((t) => econ.includes(t))).toEqual([]); // Easiest researches none
  });

  it('Hardest starts with its head start (D48); other computers and humans do not', () => {
    const sim = Sim.create({ seed: 1, map: { w: 24, h: 24 }, players: [{ civ: 'greek' }, { civ: 'greek', ai: 'hardest' }, { civ: 'greek', ai: 'hard' }] });
    const food = sim.world.players.map((p) => p.res[0]);
    expect(food[2]! - food[1]!).toBe(HARDEST_BONUS.food);
    expect(food[3]).toBe(food[1]);
  });
});

describe('AI v2 fixes (M13.4)', () => {
  it('a full population never freezes the Town Center: Hardest reaches the Iron Age (it sat in the Tool Age)', () => {
    // Seed 101: Hardest vs Hard. Before the fix a villager queued at 50/50 waited for a house forever, the age
    // could not be queued behind it, and Hardest floated 14,000 resources in the Tool Age at 40 minutes.
    const r = runMatch({ seed: 101, type: 'inland', size: 'tiny', levels: ['hardest', 'hard'], minutes: 36 });
    expect(r.ageTick[0]![3]).toBeGreaterThan(0);
    expect(r.ageTick[0]![4]).toBeGreaterThan(0);
  });

  it('a won war is finished: the hunt finds a building put up where it had already looked', () => {
    // Seed 14 (inland): the last Granary stood in an explored corner; the sweep skipped explored ground.
    const r = runMatch({ seed: 14, type: 'inland', size: 'tiny', levels: ['moderate', 'moderate'], minutes: 45 });
    expect(r.winner).not.toBeNull();
  });
});

describe('AI priests (M13.5)', () => {
  it('Hard builds a Temple, trains priests from its gold, researches the Temple and converts enemies', () => {
    const r = runMatch({ seed: 103, type: 'inland', size: 'tiny', levels: ['hard', 'moderate'], minutes: 45 });
    expect(r.conversions[0]).toBeGreaterThan(0);
    expect(r.techs[0]).toContain('astrology');
  });
});
