import type { AiState } from '../ai/ai.ts';
import { Sim, SIM_VERSION } from '../sim/index.ts';
import { AGE_NAMES } from '../sim/systems/production.ts';
import { GameSession } from './session.ts';

/**
 * A saved game: the simulation's own save bytes (everything that shapes future ticks), the computer players'
 * memories, and the few UI facts worth restoring. Loading one and playing on is tick-for-tick the same game.
 */
export interface SavedGame {
  id: string;
  name: string;
  /** Wall-clock time of the save (list order and display only). */
  savedAt: number;
  simVersion: string;
  tick: number;
  /** What kind of game, for the list ("Inland · tiny", "raid"). */
  kind: string;
  /** The local player's age when saved ("Tool Age"). */
  age: string;
  localPlayer: number;
  speed: number;
  camera: { x: number; y: number; zoom: number };
  world: Uint8Array;
  ais: { player: number; state: AiState }[];
}

export type SaveMeta = Omit<SavedGame, 'world' | 'ais'>;

export function saveSession(session: GameSession, o: { id: string; name: string; kind: string; savedAt: number; camera: SavedGame['camera'] }): SavedGame {
  const w = session.sim.world;
  return {
    id: o.id,
    name: o.name,
    savedAt: o.savedAt,
    simVersion: SIM_VERSION,
    tick: w.tick,
    kind: o.kind,
    age: AGE_NAMES[w.players[session.localPlayer]?.stats.age ?? 1] ?? '',
    localPlayer: session.localPlayer,
    speed: session.speed,
    camera: o.camera,
    world: session.sim.serialize(),
    ais: session.aiStates(),
  };
}

/** Rebuild the session a save was made from (throws when the save is from another sim version). */
export function loadSession(save: SavedGame): GameSession {
  const session = new GameSession(Sim.deserialize(save.world), save.localPlayer);
  session.restoreAis(save.ais);
  session.speed = save.speed;
  return session;
}

/** The URL that boots a saved game (keeping the display flags a test or the user set). */
export function loadQuery(id: string, params: URLSearchParams): string {
  const q = new URLSearchParams({ load: id });
  for (const k of ['edgeScroll', 'art', 'fog', 'paused']) if (params.has(k)) q.set(k, params.get(k)!);
  return `?${q}`;
}
