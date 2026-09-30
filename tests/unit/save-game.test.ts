import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, skirmishConfig } from '../../src/game/skirmish.ts';
import { GameSession } from '../../src/game/session.ts';
import { loadSession, saveSession } from '../../src/game/saveGame.ts';

/** Two computer players on a tiny map; local player 0 (a spectator) so both AIs run. */
function game(seed: number): GameSession {
  const cfg = skirmishConfig({
    ...DEFAULT_SETUP,
    seed,
    type: 'inland',
    size: 'tiny',
    players: [
      { civ: 'greek', team: 1, controller: 'moderate' },
      { civ: 'persian', team: 2, controller: 'hard' },
    ],
  });
  return new GameSession(cfg, 0);
}

const run = (s: GameSession, ticks: number) => {
  for (let i = 0; i < ticks; i++) s.stepOnce();
};

describe('saved games', () => {
  it('a loaded game plays on exactly like the original — sim and computer players', () => {
    const a = game(11);
    run(a, 20 * 60 * 6); // 6 minutes in: explored map, remembered game, a military plan
    const save = saveSession(a, { id: 't', name: 'test', kind: 'inland tiny', savedAt: 0, camera: { x: 0, y: 0, zoom: 1 } });
    expect(save.tick).toBe(7200);
    expect(save.ais.map((x) => x.player)).toEqual([1, 2]);
    // Through structured clone, as IndexedDB stores it.
    const b = loadSession(structuredClone(save));
    expect(b.sim.hash()).toBe(a.sim.hash());
    run(a, 20 * 60 * 4);
    run(b, 20 * 60 * 4);
    expect(b.sim.tick).toBe(a.sim.tick);
    expect(b.sim.hash()).toBe(a.sim.hash());
  });

  it('a save without the AI memories diverges (the memories matter)', () => {
    const a = game(11);
    run(a, 20 * 60 * 6);
    const save = saveSession(a, { id: 't', name: 'test', kind: '', savedAt: 0, camera: { x: 0, y: 0, zoom: 1 } });
    const b = loadSession({ ...save, ais: [] });
    run(a, 20 * 60 * 4);
    run(b, 20 * 60 * 4);
    expect(b.sim.hash()).not.toBe(a.sim.hash());
  });
});
