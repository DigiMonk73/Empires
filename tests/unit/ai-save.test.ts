import { describe, expect, it } from 'vitest';
import type { AiPlayer } from '../../src/ai/ai.ts';
import { DEFAULT_SETUP, skirmishConfig } from '../../src/game/skirmish.ts';
import { GameSession } from '../../src/game/session.ts';
import { loadSession, saveSession } from '../../src/game/saveGame.ts';

/**
 * A computer player restored from a save must be the same player, field for field (M15.1: the naval brain's
 * transport throttle wasn't saved, so 13 of 100 loaded water games trained a transport the original didn't).
 * Fields that are recomputed before they are read are named here; any other field must be in `save()`.
 */
const RECOMPUTED: Record<string, string> = {
  nodeLands: 'cache keyed on passVersion (cleared on first use, nodeLandsAt starts at -1)',
  nodeLandsAt: 'see nodeLands',
  fleetShort: 'naval: set at the top of every think',
  seaAt: 'naval: sea cache keyed on passVersion (starts at -1, rebuilt on first use)',
  seaKey: 'see seaAt',
  seaOf: 'see seaAt',
  island: 'military: copied from the naval brain at the top of every think (the naval one is saved)',
};

function fields(x: unknown, path = ''): unknown {
  if (x instanceof Map) return new Map([...x].map(([k, v]) => [k, fields(v, path)]));
  if (x instanceof Set || x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map((v) => fields(v, path));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    const at = `${path}.${k}`;
    // (`island` is recomputed on the military brain only; the naval brain's island verdict is saved.)
    if (k in RECOMPUTED && !(k === 'island' && !path.endsWith('.military'))) continue;
    out[k] = fields(v, at);
  }
  return out;
}

const aisOf = (s: GameSession): AiPlayer[] => (s as unknown as { ais: { ai: AiPlayer }[] }).ais.map((x) => x.ai);

describe('computer players in a saved game', () => {
  it('restore to the same state, field by field, through a water game', () => {
    const cfg = skirmishConfig({
      ...DEFAULT_SETUP,
      seed: 5,
      type: 'largeIslands',
      size: 'tiny',
      players: [
        { civ: 'phoenician', team: 1, controller: 'hard' },
        { civ: 'minoan', team: 2, controller: 'hardest' },
      ],
    });
    const a = new GameSession(cfg, 0);
    let transports = 0;
    for (const minute of [5, 9]) {
      while (a.sim.tick < minute * 1200) a.stepOnce();
      const b = loadSession(structuredClone(saveSession(a, { id: 't', name: 't', kind: '', savedAt: 0, camera: { x: 0, y: 0, zoom: 1 } })));
      const [ra, rb] = [aisOf(a), aisOf(b)];
      expect(rb.length).toBe(2);
      ra.forEach((ai, i) => expect(fields(rb[i], '')).toEqual(fields(ai, '')));
      transports = Math.max(transports, ...ra.map((ai) => ai.naval.save().transportAt ?? -9999));
    }
    // The game got as far as ordering a transport — the state that went missing.
    expect(transports).toBeGreaterThan(0);
  }, 30_000);
});
