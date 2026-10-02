import { MAP_SIZES, POP_LIMITS, SCORE_TARGETS, STARTING_AGES, STARTING_RESOURCES, TIME_LIMITS, scoreTargetsFor, type MapSizeId, type StartingAge, type StartingResources } from '../data/setup.ts';
import { CIV_BY_ID } from '../data/index.ts';
import { GEN_MAP_TYPES, generateMap, type GenMapType } from '../sim/mapgen/generate.ts';
import type { AiLevel, SimConfig } from '../sim/world.ts';

/** Skirmish victory settings (econ:7). */
export type SkirmishVictory = 'standard' | 'conquest' | 'score' | 'time';
export const SKIRMISH_VICTORIES: readonly SkirmishVictory[] = ['standard', 'conquest', 'score', 'time'];

/**
 * Skirmish setup ↔ URL. The menu writes a setup into the query string and reloads; the game boots from it. A player
 * is "civ.team.controller", controllers being `human` or an AI level; up to 8, comma-separated.
 */
export interface SkirmishPlayer {
  civ: string;
  team: number;
  controller: 'human' | AiLevel;
}

export interface SkirmishSetup {
  type: GenMapType;
  size: MapSizeId;
  seed: number;
  players: SkirmishPlayer[];
  resources: StartingResources;
  reveal: boolean;
  speed: number;
  /** Standard (the original's default) places 5 Artifacts and 5 Ruins and runs the Wonder/relic countdowns. */
  victory: SkirmishVictory;
  /** Score victory: the total to reach. Time Limit: minutes of game time. */
  scoreTarget: number;
  timeLimit: number;
  startingAge: StartingAge;
  /** Population limit (25–200, econ:2). */
  popCap: number;
  /** Full Tech Tree (econ:6.4): everything for everyone but the Fire Galley, no civ bonuses. */
  fullTech: boolean;
}

export const AI_LEVELS: readonly AiLevel[] = ['easiest', 'easy', 'moderate', 'hard', 'hardest'];

export const DEFAULT_SETUP: SkirmishSetup = {
  type: 'continental',
  size: 'small',
  seed: 1,
  players: [
    { civ: 'greek', team: 1, controller: 'human' },
    { civ: 'egyptian', team: 2, controller: 'moderate' },
  ],
  resources: 'default',
  reveal: false,
  speed: 1,
  victory: 'standard',
  scoreTarget: 1000,
  timeLimit: 60,
  startingAge: 'default',
  popCap: 50,
  fullTech: false,
};

export function setupToQuery(s: SkirmishSetup): string {
  const q = new URLSearchParams({
    scenario: 'skirmish',
    type: s.type,
    size: s.size,
    seed: String(s.seed),
    p: s.players.map((p) => `${p.civ}.${p.team}.${p.controller}`).join(','),
    res: s.resources,
    speed: String(s.speed),
    win: s.victory,
    age: s.startingAge,
    pop: String(s.popCap),
  });
  if (s.victory === 'score') q.set('target', String(s.scoreTarget));
  if (s.victory === 'time') q.set('limit', String(s.timeLimit));
  if (s.reveal) q.set('reveal', '1');
  if (s.fullTech) q.set('ftt', '1');
  return q.toString();
}

export function setupFromQuery(q: URLSearchParams): SkirmishSetup {
  const players = (q.get('p') ?? '')
    .split(',')
    .filter(Boolean)
    .map((x): SkirmishPlayer => {
      const [civ, team, controller] = x.split('.');
      const c = controller === 'human' || AI_LEVELS.includes(controller as AiLevel) ? (controller as SkirmishPlayer['controller']) : 'moderate';
      return { civ: civ && CIV_BY_ID.has(civ) ? civ : 'greek', team: Number(team) || 1, controller: c };
    });
  return {
    type: (GEN_MAP_TYPES as readonly string[]).includes(q.get('type') ?? '') ? (q.get('type') as GenMapType) : 'continental',
    // (Unknown sizes and resource levels fall back as everything else does: they threw, M15.10 P18.)
    size: Object.hasOwn(MAP_SIZES, q.get('size') ?? '') ? (q.get('size') as MapSizeId) : DEFAULT_SETUP.size,
    seed: Number(q.get('seed') ?? 1) || 1,
    players: players.length >= 2 ? players.slice(0, 8) : DEFAULT_SETUP.players,
    resources: Object.hasOwn(STARTING_RESOURCES, q.get('res') ?? '') ? (q.get('res') as StartingResources) : 'default',
    reveal: q.get('reveal') === '1',
    speed: Number(q.get('speed') ?? 1) || 1,
    victory: SKIRMISH_VICTORIES.includes(q.get('win') as SkirmishVictory) ? (q.get('win') as SkirmishVictory) : DEFAULT_SETUP.victory,
    scoreTarget: pick(q.get('target'), SCORE_TARGETS, DEFAULT_SETUP.scoreTarget),
    timeLimit: pick(q.get('limit'), TIME_LIMITS, DEFAULT_SETUP.timeLimit),
    startingAge: STARTING_AGES.some((a) => a.id === q.get('age')) ? (q.get('age') as StartingAge) : DEFAULT_SETUP.startingAge,
    popCap: pick(q.get('pop'), POP_LIMITS, DEFAULT_SETUP.popCap),
    fullTech: q.get('ftt') === '1',
  };
}

/** The setup's Score target if its starting age offers it, else the lowest one it does (M15.10 P9). */
export function validTarget(s: Pick<SkirmishSetup, 'scoreTarget' | 'startingAge'>): number {
  const offered = scoreTargetsFor(s.startingAge);
  return offered.includes(s.scoreTarget) ? s.scoreTarget : offered[0]!;
}

/** A number from the query if it is one of the offered choices. */
function pick(v: string | null, choices: readonly number[], dflt: number): number {
  const n = Number(v);
  return choices.includes(n) ? n : dflt;
}

export function skirmishConfig(s: SkirmishSetup): SimConfig {
  const map = generateMap({
    seed: s.seed,
    type: s.type,
    size: s.size,
    players: s.players.map((p) => ({ civ: p.civ, team: p.team })),
    startingResources: s.resources,
    revealMap: s.reveal,
    relics: s.victory === 'standard',
    nomad: s.startingAge === 'nomad',
  });
  return {
    ...map,
    victory: s.victory,
    ...(s.victory === 'score' ? { scoreTarget: validTarget(s) } : {}),
    ...(s.victory === 'time' ? { timeLimit: s.timeLimit } : {}),
    ...(s.startingAge !== 'default' ? { startingAge: s.startingAge } : {}),
    popCap: s.popCap,
    ...(s.fullTech ? { fullTechTree: true } : {}),
    players: s.players.map((p) => ({ civ: p.civ, team: p.team, ...(p.controller !== 'human' ? { ai: p.controller } : {}) })),
  };
}
