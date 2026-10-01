import { CIVS } from '../data/civs.ts';
import { POP_LIMITS, type MapSizeId, type StartingAge, type StartingResources } from '../data/setup.ts';
import { GEN_MAP_TYPES } from '../sim/mapgen/generate.ts';
import type { PlayerCommand } from '../sim/index.ts';
import { decodeReplay, encodeReplay, playReplay, ReplayRecorder } from '../sim/save/replay.ts';
import { decodeSave, encodeSave } from './saveCodec.ts';
import { loadSession, saveSession } from './saveGame.ts';
import { GameSession } from './session.ts';
import { AI_LEVELS, DEFAULT_SETUP, skirmishConfig, type SkirmishSetup, type SkirmishVictory } from './skirmish.ts';

/**
 * Determinism at scale (M15.1, Done 2): one 4-AI skirmish per seed, played through the game's own session and
 * hashed every `every` ticks. Node, Chromium and WebKit must produce the same trace; a save made mid-game and
 * loaded again, and a replay of the commands, must reproduce it.
 */
export const SCALE_TICKS = 24_000;
export const SCALE_EVERY = 100;
export const SCALE_SAVE_AT = 12_000;

const SIZES: readonly MapSizeId[] = ['small', 'medium', 'large'];
const AGES: readonly StartingAge[] = ['default', 'default', 'default', 'nomad', 'default', 'tool', 'default', 'bronze', 'default', 'iron'];
const RESOURCES: readonly StartingResources[] = ['default', 'default', 'low', 'default', 'high'];
const VICTORIES: readonly SkirmishVictory[] = ['standard', 'conquest', 'standard', 'score', 'time'];

/** A seed's setup: every map type and size, all 16 civs and 5 levels, free-for-alls and 2v2s, the setup options. */
export function scaleSetup(seed: number): SkirmishSetup {
  const teams = seed % 4 === 0 ? [1, 2, 1, 2] : [1, 2, 3, 4];
  return {
    ...DEFAULT_SETUP,
    seed,
    type: GEN_MAP_TYPES[seed % GEN_MAP_TYPES.length]!,
    size: SIZES[(seed + Math.floor(seed / GEN_MAP_TYPES.length)) % SIZES.length]!,
    players: teams.map((team, k) => ({ civ: CIVS[(seed * 5 + k * 3) % CIVS.length]!.id, team, controller: AI_LEVELS[(seed + k * 2) % AI_LEVELS.length]! })),
    resources: RESOURCES[seed % RESOURCES.length]!,
    victory: VICTORIES[Math.floor(seed / 3) % VICTORIES.length]!,
    scoreTarget: 1000,
    timeLimit: 15,
    startingAge: AGES[seed % AGES.length]!,
    popCap: POP_LIMITS[seed % 3]!,
    fullTech: seed % 13 === 0,
  };
}

export interface ScaleRun {
  seed: number;
  /** State hash after every `every` ticks. */
  trace: number[];
  final: number;
  ticks: number;
  /** Encoded saved game (`encodeSave`) at `saveAt`, when asked. */
  save?: Uint8Array;
  /** Encoded replay of every tick's commands, when asked. */
  replay?: Uint8Array;
}

/** Play one seed straight through. The local player is 0 (a spectator), so all four seats are computer players. */
export function runScale(seed: number, o: { ticks?: number; every?: number; saveAt?: number; record?: boolean } = {}): ScaleRun {
  const ticks = o.ticks ?? SCALE_TICKS;
  const every = o.every ?? SCALE_EVERY;
  const session = new GameSession(skirmishConfig(scaleSetup(seed)), 0);
  const rec = o.record ? new ReplayRecorder(session.sim.config) : null;
  let cmds: PlayerCommand[] = [];
  if (rec) session.onCommand((player, cmd) => cmds.push({ player, cmd }));
  const trace: number[] = [];
  let save: Uint8Array | undefined;
  while (session.sim.tick < ticks) {
    session.stepOnce();
    if (rec) {
      rec.record(session.sim, cmds);
      cmds = [];
    }
    if (session.sim.tick % every === 0) trace.push(session.sim.hash());
    if (session.sim.tick === o.saveAt) save = encodeSave(saveSession(session, { id: `scale-${seed}`, name: `scale ${seed}`, kind: 'determinism', savedAt: 0, camera: { x: 0, y: 0, zoom: 1 } }));
  }
  return { seed, trace, final: session.sim.hash(), ticks, ...(save ? { save } : {}), ...(rec ? { replay: encodeReplay(rec.replay) } : {}) };
}

/** Load an encoded save and play on to `ticks`; the trace holds the checkpoints after the save's tick. */
export function continueScale(saveBytes: Uint8Array, ticks = SCALE_TICKS, every = SCALE_EVERY): { from: number; trace: number[]; final: number } {
  const session = loadSession(decodeSave(saveBytes));
  const from = session.sim.tick;
  const trace: number[] = [];
  while (session.sim.tick < ticks) {
    session.stepOnce();
    if (session.sim.tick % every === 0) trace.push(session.sim.hash());
  }
  return { from, trace, final: session.sim.hash() };
}

/** Re-simulate an encoded replay: the first checkpoint that differs (or null) and the final hash. */
export function replayScale(bytes: Uint8Array): { mismatch: { tick: number; expected: number; got: number } | null; final: number; ticks: number } {
  const { sim, mismatch } = playReplay(decodeReplay(bytes));
  return { mismatch, final: sim.hash(), ticks: sim.tick };
}

/** Everything a straight run must agree with: the save → load tail and the replay. Empty when all agree. */
export function checkScale(seed: number, ticks = SCALE_TICKS, saveAt = SCALE_SAVE_AT, every = SCALE_EVERY): { run: ScaleRun; problems: string[] } {
  const run = runScale(seed, { ticks, every, saveAt, record: true });
  const problems: string[] = [];
  if (!run.save) problems.push(`no save at tick ${saveAt}`);
  else {
    const c = continueScale(run.save, ticks, every);
    const tail = run.trace.slice(c.from / every);
    const bad = tail.findIndex((h, i) => c.trace[i] !== h);
    if (bad >= 0 || c.trace.length !== tail.length) problems.push(`save at ${c.from} → load → continue diverges at tick ${c.from + (bad + 1) * every}`);
    else if (c.final !== run.final) problems.push('save → load → continue: final hash differs');
  }
  const r = replayScale(run.replay!);
  if (r.mismatch) problems.push(`replay diverges at tick ${r.mismatch.tick}`);
  else if (r.final !== run.final || r.ticks !== ticks) problems.push('replay: final hash differs');
  return { run, problems };
}
