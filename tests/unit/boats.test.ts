import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex, resourceKindIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { findDropSite } from '../../src/sim/systems/gather.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';

/**
 * M8.1: fishing boats (econ:1.3) gather fish from the water — deep fish only they can reach — at 0.4/s with a
 * load of 15 (Fishing Ship 20), and deliver only to a Dock; villagers never deliver to a Dock.
 */
// Rows 0–9 sea, 10–15 land; a shore fish at (9, 9).
const ascii = Array.from({ length: 16 }, (_, y) => (y < 9 ? '~'.repeat(24) : y === 9 ? '~'.repeat(9) + 'f' + '~'.repeat(14) : '.'.repeat(24)));

function setup() {
  const sim = Sim.create({
    seed: 3,
    map: { w: 24, h: 16, ascii },
    players: [{ civ: 'greek' }],
    startingResources: 'high',
    victory: 'none',
    scenario: {
      buildings: [
        { type: 'dock', owner: 1, tx: 3, ty: 7 },
        { type: 'townCenter', owner: 1, tx: 16, ty: 11 },
      ],
      units: [
        { type: 'fishingBoat', owner: 1, x: 7.5, y: 5.5 },
        { type: 'villager', owner: 1, x: 9.5, y: 10.5 },
      ],
    },
  });
  const w = sim.world;
  const e = w.ents;
  const of = (ti: number) => {
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.type[s] === ti) return s;
    return -1;
  };
  const deep = w.addResource(resourceKindIndex('deepFish'), 11, 3);
  return { sim, w, e, p: w.players[1]!, boat: of(unitTypeIndex('fishingBoat')), vil: of(unitTypeIndex('villager')), dock: of(buildingTypeIndex('dock')), tc: of(buildingTypeIndex('townCenter')), deep };
}

describe('fishing boats (M8.1)', () => {
  it('gather deep fish at 0.4/s, carry 15, and deliver to the Dock', () => {
    const { sim, w, e, p, boat, dock, deep } = setup();
    const food0 = p.res[0]!;
    sim.step([{ player: 1, cmd: { t: 'gather', ids: [e.handleOf(boat)], res: deep } }]);
    let work = 0;
    let delivered = 0;
    for (let t = 0; t < 20 * 180 && !delivered; t++) {
      sim.step();
      if (w.orders[boat]?.[0]?.k === 'gather' && (w.orders[boat]![0] as { phase: number }).phase === 1) work++;
      for (const ev of sim.drainEvents()) if (ev.t === 'deposit') delivered = ev.amount;
    }
    expect(delivered).toBeCloseTo(15, 6);
    expect(p.res[0]! - food0).toBeCloseTo(15, 6);
    expect(Math.abs(work - 15 / (0.4 / 20)) / (15 / (0.4 / 20))).toBeLessThan(0.05);
    expect(w.res.amount[deep]).toBeCloseTo(235, 6);
    // Delivered at the Dock: the boat is beside it, far from the Town Center.
    expect(Math.hypot(e.x[boat]! - e.x[dock]!, e.y[boat]! - e.y[dock]!)).toBeLessThan(1.5 + 1.5); // within reach of the 3×3 footprint
  });

  it('boats deliver only to a Dock; villagers never do (they take shore fish to the Town Center)', () => {
    const { w, e, boat, vil, dock, tc } = setup();
    expect(findDropSite(w, boat, 'fish')).toBe(e.handleOf(dock));
    expect(findDropSite(w, vil, 'fish')).toBe(e.handleOf(tc)); // the Dock is nearer
  });

  it('villagers cannot gather deep fish; boats cannot gather anything but fish', () => {
    const { sim, w, e, boat, vil, deep } = setup();
    const tree = w.addResource(resourceKindIndex('tree'), 20, 14);
    sim.step([
      { player: 1, cmd: { t: 'gather', ids: [e.handleOf(vil)], res: deep } },
      { player: 1, cmd: { t: 'gather', ids: [e.handleOf(boat)], res: tree } },
    ]);
    expect(w.orders[vil]?.[0]?.k).not.toBe('gather');
    expect(w.orders[boat]?.[0]?.k).not.toBe('gather');
  });

  it('the Fishing Ship upgrade carries 20', () => {
    const { sim, w, e, p, boat, deep } = setup();
    completeResearch(w, 1, 'fishingShip');
    expect(e.type[boat]).toBe(unitTypeIndex('fishingShip'));
    sim.step([{ player: 1, cmd: { t: 'gather', ids: [e.handleOf(boat)], res: deep } }]);
    const food0 = p.res[0]!;
    let delivered = 0;
    for (let t = 0; t < 20 * 180 && !delivered; t++) {
      sim.step();
      for (const ev of sim.drainEvents()) if (ev.t === 'deposit') delivered = ev.amount;
    }
    expect(delivered).toBeCloseTo(20, 6);
    expect(p.res[0]! - food0).toBeCloseTo(20, 6);
  });

  it('a Dock rally point on fish sends new boats fishing', () => {
    const { sim, w, e, dock, deep } = setup();
    sim.step([{ player: 1, cmd: { t: 'rally', blds: [e.handleOf(dock)], x: 12, y: 4, res: deep } }]);
    sim.step([{ player: 1, cmd: { t: 'train', bld: e.handleOf(dock), unit: 'fishingBoat' } }]);
    let fresh = -1;
    for (let t = 0; t < 20 * 60 && fresh < 0; t++) {
      sim.step();
      for (const ev of sim.drainEvents()) if (ev.t === 'trained') fresh = e.slotOf(ev.h);
    }
    expect(fresh).toBeGreaterThanOrEqual(0);
    expect(w.orders[fresh]?.[0]).toMatchObject({ k: 'gather', res: deep });
  });
});
