import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex } from '../../src/sim/rules/registry.ts';
import { placementValid } from '../../src/sim/systems/build.ts';

function setup(units = 1, civ = 'greek') {
  const sim = Sim.create({
    seed: 1,
    map: { w: 30, h: 30 },
    players: [{ civ }],
    scenario: {
      buildings: [{ type: 'townCenter', owner: 1, tx: 2, ty: 2 }],
      units: Array.from({ length: units }, (_, i) => ({ type: 'villager', owner: 1, x: 9.5 + i * 0.5, y: 9.5 })),
    },
  });
  const ids: number[] = [];
  for (let s = 0; s < sim.world.ents.top; s++) if (sim.world.ents.kind[s] === 1) ids.push(sim.world.ents.handleOf(s));
  return { sim, ids };
}

function findBuilding(sim: Sim, type: string): number {
  const ti = buildingTypeIndex(type);
  for (let s = 0; s < sim.world.ents.top; s++) if (sim.world.ents.alive[s] && sim.world.ents.type[s] === ti) return s;
  return -1;
}

describe('construction', () => {
  it('a house costs 30 wood, takes 20 s for one villager, and adds 4 housing when done', () => {
    const { sim, ids } = setup();
    const p = sim.world.players[1]!;
    expect(p.popCap).toBe(4);
    sim.step([{ player: 1, cmd: { t: 'build', ids, type: 'house', tx: 12, ty: 12 } }]);
    expect(p.res[1]).toBe(170);
    const b = findBuilding(sim, 'house');
    expect(sim.world.ents.build[b]).toBe(0);
    let buildTicks = 0;
    for (let t = 0; t < 2000 && sim.world.ents.build[b]! < 1; t++) {
      sim.step();
      if (sim.world.ents.act[sim.world.ents.slotOf(ids[0]!)] === 3) buildTicks++;
    }
    expect(sim.world.ents.build[b]).toBe(1);
    expect(sim.world.ents.hp[b]).toBeCloseTo(75, 6);
    // One builder at rate 1.0 with the (n+2)/3 rule: 20 s × 3/3 = 400 ticks.
    expect(Math.abs(buildTicks - 400)).toBeLessThanOrEqual(2);
    sim.step();
    expect(p.popCap).toBe(8);
    expect(sim.world.orders[sim.world.ents.slotOf(ids[0]!)]).toBeUndefined();
  });

  it('four builders finish (4+2)/3 = 2× faster', () => {
    const { sim, ids } = setup(4);
    sim.step([{ player: 1, cmd: { t: 'build', ids, type: 'house', tx: 12, ty: 12 } }]);
    const b = findBuilding(sim, 'house');
    let t = 0;
    while (sim.world.ents.build[b]! < 1 && t < 2000) {
      sim.step();
      t++;
    }
    // ≈200 building ticks plus the walk (~3 tiles).
    expect(t).toBeLessThan(200 + 80);
    expect(t).toBeGreaterThan(195);
  });

  it('rejects unaffordable, blocked, and age-locked placements without charging', () => {
    const { sim, ids } = setup();
    const p = sim.world.players[1]!;
    sim.step([{ player: 1, cmd: { t: 'build', ids, type: 'house', tx: 3, ty: 3 } }]); // on the TC
    sim.step([{ player: 1, cmd: { t: 'build', ids, type: 'market', tx: 15, ty: 15 } }]); // Tool Age
    sim.step([{ player: 1, cmd: { t: 'build', ids, type: 'townCenter', tx: 20, ty: 20 } }]); // needs Gov Center
    const reasons = sim.drainEvents().filter((e) => e.t === 'rejected').map((e) => (e as { reason: string }).reason);
    expect(reasons).toEqual(['cannot build there', 'requires Tool Age', 'another Town Center requires a Government Center']);
    expect(p.res[1]).toBe(200);
    p.res[1] = 10;
    sim.step([{ player: 1, cmd: { t: 'build', ids, type: 'house', tx: 12, ty: 12 } }]);
    expect(sim.drainEvents().some((e) => e.t === 'rejected' && e.reason === 'not enough wood')).toBe(true);
  });

  it('units standing on a new foundation are nudged off', () => {
    const { sim, ids } = setup(2);
    const other = sim.world.ents.slotOf(ids[1]!);
    sim.step([{ player: 1, cmd: { t: 'build', ids: [ids[0]!], type: 'granary', tx: 9, ty: 9 } }]);
    const x = Math.floor(sim.world.ents.x[other]!);
    const y = Math.floor(sim.world.ents.y[other]!);
    expect(x < 9 || x > 11 || y < 9 || y > 11).toBe(true);
  });
});

describe('dock placement (D23)', () => {
  it('docks go on water touching the shore — not on land, not out at sea', () => {
    const ascii = Array.from({ length: 20 }, () => '.'.repeat(10) + '~'.repeat(10));
    const sim = Sim.create({ seed: 1, map: { w: 20, h: 20, ascii }, players: [{ civ: 'greek' }] });
    const dock = buildingTypeIndex('dock');
    expect(placementValid(sim.world, dock, 10, 5)).toBe(true); // water, land just west
    expect(placementValid(sim.world, dock, 6, 5)).toBe(false); // on land
    expect(placementValid(sim.world, dock, 9, 5)).toBe(false); // straddles the shore
    expect(placementValid(sim.world, dock, 14, 5)).toBe(false); // open water, no land beside it
    expect(placementValid(sim.world, buildingTypeIndex('house'), 10, 5)).toBe(false); // houses can't go on water
  });
});
