import { describe, expect, it } from 'vitest';
import { compilePlayerStats } from '../../src/sim/rules/playerStats.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { Sim } from '../../src/sim/index.ts';

const V = unitTypeIndex('villager');

describe('player stats compile civ bonuses and techs', () => {
  it('base villager values (per tick)', () => {
    const s = compilePlayerStats('greek');
    expect(s.types[V]!.speed * 20).toBeCloseTo(1.1, 12);
    expect(s.types[V]!.cost).toEqual([50, 0, 0, 0]);
    expect(s.types[V]!.trainTicks).toBe(400);
    expect(s.work.wood * 20).toBeCloseTo(0.55, 12);
    expect(s.carry.wood).toBe(10);
  });

  it('civ bonuses', () => {
    expect(compilePlayerStats('assyrian').types[V]!.speed * 20).toBeCloseTo(1.3, 12);
    expect(compilePlayerStats('shang').types[V]!.cost[0]).toBe(40);
    expect(compilePlayerStats('palmyran').types[V]!.cost[0]).toBe(75);
    expect(compilePlayerStats('palmyran').work.forage * 20).toBeCloseTo(0.65, 12);
    expect(compilePlayerStats('palmyran').work.farm * 20).toBeCloseTo(0.45, 12); // the famous bug: no farm bonus
    expect(compilePlayerStats('roman').types[buildingTypeIndex('house')]!.cost[1]).toBe(26); // 30 × 0.85
    expect(compilePlayerStats('roman').types[buildingTypeIndex('watchTower')]!.cost[3]).toBe(75);
    expect(compilePlayerStats('sumerian').farmFood).toBe(500);
    expect(compilePlayerStats('sumerian').types[V]!.hp).toBe(40);
    expect(compilePlayerStats('choson').types[unitTypeIndex('priest')]!.cost[2]).toBe(85);
    expect(compilePlayerStats('hittite').types[unitTypeIndex('bowman')]!.atk[3]).toBe(4);
  });

  it('techs apply in order and upgrades track the current unit', () => {
    const s = compilePlayerStats('greek', ['toolAge', 'woodworking', 'battleAxe']);
    expect(s.work.wood * 20).toBeCloseTo(0.75, 12);
    expect(s.carry.wood).toBe(12);
    expect(s.types[unitTypeIndex('bowman')]!.range).toBe(6);
    expect(s.upgrades.get('clubman')).toBe('axeman');
    expect(s.age).toBe(2);
    const s2 = compilePlayerStats('greek', ['shortSword', 'broadSword', 'longSword']);
    expect(s2.upgrades.get('shortSwordsman')).toBe('longSwordsman');
  });

  it('starting stockpile applies civ modifiers; population counts units and completed housing', () => {
    const sim = Sim.create({
      seed: 1,
      map: { w: 20, h: 20 },
      players: [{ civ: 'shang' }],
      scenario: { buildings: [{ type: 'townCenter', owner: 1, tx: 5, ty: 5 }, { type: 'house', owner: 1, tx: 10, ty: 10 }], units: [{ type: 'villager', owner: 1, x: 2.5, y: 2.5 }] },
    });
    const p = sim.world.players[1]!;
    expect(p.res[0]).toBe(160);
    expect(p.pop).toBe(1);
    expect(p.popCap).toBe(8);
  });
});
