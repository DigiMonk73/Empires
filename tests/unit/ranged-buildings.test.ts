import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { SCENARIOS } from '../../src/game/scenarios.ts';

describe('ranged attacks on buildings (M13.7)', () => {
  it('a warship coming at a Dock from the diagonal gets in range and damages it (it used to give up)', () => {
    const sim = Sim.create(SCENARIOS.harbor!(new URLSearchParams('battle=1')));
    const e = sim.world.ents;
    sim.step([{ player: 1, cmd: { t: 'delete', ids: [2, 4] } }]); // Player 1's boat and galley
    sim.step([{ player: 2, cmd: { t: 'act', ids: [5], h: 1 } }]); // the scout ship at Player 1's Dock
    for (let t = 0; t < 20 * 60; t++) sim.step([]);
    expect(e.hp[1]).toBeLessThan(340);
    expect(sim.world.orders[5]?.[0]?.k).toBe('attack');
  });

  it('an archer approaching a house diagonally shoots it', () => {
    const sim = Sim.create({
      seed: 1,
      map: { w: 32, h: 32 },
      victory: 'none',
      players: [{ civ: 'greek' }, { civ: 'egyptian' }],
      scenario: { buildings: [{ type: 'house', owner: 2, tx: 10, ty: 10 }], units: [{ type: 'bowman', owner: 1, x: 20.5, y: 20.5 }] },
    });
    const e = sim.world.ents;
    const house = 0;
    const archer = e.handleOf(1);
    const hp0 = e.hp[house]!;
    sim.step([{ player: 1, cmd: { t: 'act', ids: [archer], h: e.handleOf(house) } }]);
    for (let t = 0; t < 20 * 40; t++) sim.step([]);
    expect(e.hp[house]).toBeLessThan(hp0);
  });
});
