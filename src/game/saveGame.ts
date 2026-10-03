import type { AiState } from '../ai/ai.ts';
import { Sim, SIM_VERSION } from '../sim/index.ts';
import { AGE_NAMES } from '../sim/systems/production.ts';
import { GameSession } from './session.ts';
import { withFlags } from './urlFlags.ts';
import type { Timeline } from './timeline.ts';

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
  /** The post-game graphs' samples so far (M12.4; absent in older saves). */
  timeline?: Timeline;
}

export type SaveMeta = Omit<SavedGame, 'world' | 'ais'>;

/** The rolling autosave (M12.5): one slot, rewritten every 5 minutes of game time and when quitting. */
export const AUTOSAVE_ID = 'autosave';
export const AUTOSAVE_TICKS = 20 * 60 * 5;

export function saveSession(session: GameSession, o: { id: string; name: string; kind: string; savedAt: number; camera: SavedGame['camera']; timeline?: Timeline }): SavedGame {
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
    ...(o.timeline ? { timeline: o.timeline } : {}),
  };
}

/**
 * A multiplayer room can resume a save only when it has the same number of players. Gaia is `players[0]`,
 * so a two-player game has three entries. A save this room cannot resume is refused before anyone reloads.
 */
export function resumeFits(save: SavedGame, playerCount: number): boolean {
  try {
    return Sim.deserialize(save.world).world.players.length - 1 === playerCount;
  } catch {
    return false;
  }
}

/** Rebuild the session a save was made from (throws when the save is from another sim version). */
export function loadSession(save: SavedGame): GameSession {
  const session = new GameSession(Sim.deserialize(save.world), save.localPlayer);
  session.restoreAis(save.ais);
  session.speed = save.speed;
  return session;
}

/** The URL that boots a saved game (keeping the display flags a test or the user set); server saves: `server:<id>`. */
export function loadQuery(id: string, params: URLSearchParams, where: 'local' | 'server' = 'local'): string {
  return withFlags(`load=${encodeURIComponent(where === 'server' ? `server:${id}` : id)}`, params);
}
