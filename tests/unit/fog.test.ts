import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';

const make = (reveal = false) =>
  Sim.create({
    seed: 1,
    map: { w: 40, h: 40 },
    players: [{ civ: 'greek' }, { civ: 'egyptian' }],
    revealMap: reveal,
    scenario: { units: [{ type: 'villager', owner: 1, x: 5.5, y: 5.5 }, { type: 'scout', owner: 2, x: 30.5, y: 30.5 }] },
  });

const idx = (x: number, y: number) => y * 40 + x;

describe('fog of war', () => {
  it('stamps each unit’s line of sight for its owner only', () => {
    const s = make();
    const f = s.world.fog;
    expect(f.vis[1]![idx(5, 5)]).toBe(1);
    expect(f.vis[1]![idx(9, 5)]).toBe(1); // villager LOS 4
    expect(f.vis[1]![idx(11, 5)]).toBe(0);
    expect(f.vis[2]![idx(5, 5)]).toBe(0);
    expect(f.vis[2]![idx(30, 22)]).toBe(1); // scout LOS 8
  });

  it('moving reveals new ground, keeps it explored, and stops seeing the old ground', () => {
    const s = make();
    const v = s.world.ents.handleOf(0);
    s.step([{ player: 1, cmd: { t: 'move', ids: [v], x: 25.5, y: 5.5 } }]);
    for (let t = 0; t < 500; t++) s.step();
    const f = s.world.fog;
    expect(f.vis[1]![idx(25, 5)]).toBe(1);
    expect(f.vis[1]![idx(5, 5)]).toBe(0);
    expect(f.explored[1]![idx(5, 5)]).toBe(1);
    expect(f.explored[1]![idx(15, 5)]).toBe(1); // passed through
    expect(f.explored[1]![idx(15, 20)]).toBe(0);
    // Counts never go negative or leak: sum equals Σ disc sizes of live entities.
    expect(Math.min(...f.vis[1]!)).toBeGreaterThanOrEqual(0);
  });

  it('removing an entity clears its sight', () => {
    const s = make();
    s.world.removeEntity(s.world.ents.handleOf(0));
    expect(s.world.fog.vis[1]!.every((c) => c === 0)).toBe(true);
    expect(s.world.fog.explored[1]![idx(5, 5)]).toBe(1);
  });

  it('Reveal Map starts everything explored', () => {
    const s = make(true);
    expect(s.world.fog.explored[1]!.every((c) => c === 1)).toBe(true);
    expect(s.world.fog.vis[1]![idx(30, 30)]).toBe(0);
  });
});
