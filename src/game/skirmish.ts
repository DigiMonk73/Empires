import type { MapSizeId, StartingResources } from '../data/setup.ts';
import { generateMap, type LandMapType } from '../sim/mapgen/generate.ts';
import type { AiLevel, SimConfig } from '../sim/world.ts';

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
  type: LandMapType;
  size: MapSizeId;
  seed: number;
  players: SkirmishPlayer[];
  resources: StartingResources;
  reveal: boolean;
  speed: number;
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
  });
  if (s.reveal) q.set('reveal', '1');
  return q.toString();
}

export function setupFromQuery(q: URLSearchParams): SkirmishSetup {
  const players = (q.get('p') ?? '')
    .split(',')
    .filter(Boolean)
    .map((x): SkirmishPlayer => {
      const [civ, team, controller] = x.split('.');
      const c = controller === 'human' || AI_LEVELS.includes(controller as AiLevel) ? (controller as SkirmishPlayer['controller']) : 'moderate';
      return { civ: civ || 'greek', team: Number(team) || 1, controller: c };
    });
  return {
    type: q.get('type') === 'inland' ? 'inland' : 'continental',
    size: (q.get('size') as MapSizeId) ?? DEFAULT_SETUP.size,
    seed: Number(q.get('seed') ?? 1) || 1,
    players: players.length >= 2 ? players.slice(0, 8) : DEFAULT_SETUP.players,
    resources: (q.get('res') as StartingResources) ?? 'default',
    reveal: q.get('reveal') === '1',
    speed: Number(q.get('speed') ?? 1) || 1,
  };
}

export function skirmishConfig(s: SkirmishSetup): SimConfig {
  const map = generateMap({
    seed: s.seed,
    type: s.type,
    size: s.size,
    players: s.players.map((p) => ({ civ: p.civ, team: p.team })),
    startingResources: s.resources,
    revealMap: s.reveal,
  });
  return { ...map, players: s.players.map((p) => ({ civ: p.civ, team: p.team, ...(p.controller !== 'human' ? { ai: p.controller } : {}) })) };
}
