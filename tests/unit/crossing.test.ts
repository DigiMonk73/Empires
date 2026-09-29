import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';

/** M1.5 acceptance: two 100-unit groups cross each other on open ground with a few forest clumps. */
describe('200-unit crossing', () => {
  it('everyone arrives, stuck < 1%, no heavy overlaps at rest', () => {
    const W = 64;
    const rows = Array.from({ length: W }, (_, y) =>
      Array.from({ length: W }, (_, x) => ((x - 32) * (x - 32) + (y - 20) * (y - 20) <= 16 || (x - 30) * (x - 30) + (y - 46) * (y - 46) <= 9 ? 'F' : '.')).join(''),
    );
    const units: { type: string; owner: number; x: number; y: number }[] = [];
    for (let i = 0; i < 100; i++) units.push({ type: i % 3 ? 'clubman' : 'villager', owner: 1, x: 4.5 + (i % 10) * 0.8, y: 24.5 + Math.floor(i / 10) * 0.8 });
    for (let i = 0; i < 100; i++) units.push({ type: i % 2 ? 'bowman' : 'scout', owner: 2, x: 52.5 + (i % 10) * 0.8, y: 24.5 + Math.floor(i / 10) * 0.8 });
    const sim = Sim.create({ seed: 9, map: { w: W, h: W, ascii: rows }, players: [{ civ: 'greek' }, { civ: 'hittite' }], scenario: { units } });
    const e = sim.world.ents;
    const p1: number[] = [];
    const p2: number[] = [];
    for (let s = 0; s < e.top; s++) (e.owner[s] === 1 ? p1 : p2).push(e.handleOf(s));
    sim.step([
      { player: 1, cmd: { t: 'move', ids: p1, x: 56.5, y: 28.5 } },
      { player: 2, cmd: { t: 'move', ids: p2, x: 8.5, y: 28.5 } },
    ]);
    const t0 = performance.now();
    let ticks = 0;
    let maxStuck = 0;
    const longStuck = new Set<number>();
    while (ticks < 3000 && [...p1, ...p2].some((h) => sim.world.orders[e.slotOf(h)])) {
      sim.step();
      ticks++;
      for (let s = 0; s < e.top; s++) {
        maxStuck = Math.max(maxStuck, e.stuck[s]!);
        if (e.stuck[s]! > 100) longStuck.add(s);
      }
    }
    const ms = (performance.now() - t0) / ticks;
    const st = sim.world.moveStats;
    const stuckPct = (100 * longStuck.size) / 200;
    console.log(`crossing: ${ticks} ticks, ${ms.toFixed(3)} ms/tick, blocked ${((100 * st.blockedTicks) / st.movingTicks).toFixed(1)}% of moving ticks, stuck>5s ${stuckPct}%, gaveUp ${st.gaveUp}, maxStuck ${maxStuck}, direct ${st.directPaths}, shared ${st.sharedPaths}, searched ${sim.world.pathing.stats.served}`);
    expect([...p1, ...p2].every((h) => !sim.world.orders[e.slotOf(h)])).toBe(true);
    expect(stuckPct).toBeLessThan(1);
    expect(st.gaveUp).toBe(0);
    // Let everyone settle, then check overlaps.
    for (let t = 0; t < 60; t++) sim.step();
    let worst = 0;
    for (let a = 0; a < e.top; a++) {
      for (let b = a + 1; b < e.top; b++) {
        const ra = TYPES[e.type[a]!]!.radius;
        const rb = TYPES[e.type[b]!]!.radius;
        const d = Math.hypot(e.x[a]! - e.x[b]!, e.y[a]! - e.y[b]!);
        worst = Math.max(worst, (ra + rb - d) / Math.min(ra, rb));
      }
    }
    expect(worst).toBeLessThan(0.5);
  });
});
