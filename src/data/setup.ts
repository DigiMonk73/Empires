import type { Cost } from './types.ts';

/** Game-setup constants: starting conditions, population, maps, speeds, victory, colors (econ:1.5, econ:2, econ:7, mil:5, mil:6). */

export type StartingResources = 'default' | 'low' | 'medium' | 'high' | 'deathmatch';
export const STARTING_RESOURCES: Readonly<Record<StartingResources, Required<Cost>>> = {
  default: { food: 200, wood: 200, gold: 0, stone: 150 },
  low: { food: 200, wood: 200, gold: 0, stone: 100 },
  medium: { food: 500, wood: 500, gold: 0, stone: 250 },
  high: { food: 1000, wood: 1000, gold: 0, stone: 750 },
  deathmatch: { food: 20000, wood: 20000, gold: 10000, stone: 5000 },
};
export const STARTING_SRC = { src: 'econ:1.5', verify: true, decision: 'D57', note: 'menu-order → switch-index mapping inferred' } as const;

/**
 * The Hardest computer's head start (D48): the original's only resource cheat (mil:7 "extra resources on Hardest",
 * commonly +2000 of each; econ:7 "extra food, e.g. +2000"). The amount is unverified; we take the smaller reading.
 */
export const HARDEST_BONUS: Readonly<Required<Cost>> = { food: 2000, wood: 0, gold: 0, stone: 0 };
export const HARDEST_BONUS_SRC = { src: 'mil:7,econ:7', verify: true, decision: 'D48' } as const;

export const START_UNITS = { townCenters: 1, villagers: 3, villagerRing: [2, 4] as const, src: 'econ:1.5,econ:8' } as const;

export const POPULATION = { default: 50, min: 25, max: 200, house: 4, townCenter: 4, src: 'econ:2' } as const;

export type MapSizeId = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gigantic';
export const MAP_SIZES: Readonly<Record<MapSizeId, number>> = { tiny: 72, small: 96, medium: 120, large: 144, huge: 200, gigantic: 250 };
export const MAP_SIZES_SRC = { src: 'econ:7,mil:8', verify: true, decision: 'D57', note: 'size names inferred from exe switch order' } as const;

export type MapTypeId =
  | 'smallIslands' | 'largeIslands' | 'coastal' | 'inland' | 'highland'
  | 'continental' | 'hillCountry' | 'mediterranean' | 'narrows';
export const MAP_TYPES: readonly { id: MapTypeId; name: string; ror?: boolean; water: 'none' | 'some' | 'lots' }[] = [
  { id: 'smallIslands', name: 'Small Islands', water: 'lots' },
  { id: 'largeIslands', name: 'Large Islands', water: 'lots' },
  { id: 'coastal', name: 'Coastal', water: 'some' },
  { id: 'inland', name: 'Inland', water: 'some' },
  { id: 'highland', name: 'Highland', water: 'some' },
  { id: 'continental', name: 'Continental', water: 'some', ror: true },
  { id: 'hillCountry', name: 'Hill Country', water: 'some', ror: true },
  { id: 'mediterranean', name: 'Mediterranean', water: 'lots', ror: true },
  { id: 'narrows', name: 'Narrows', water: 'lots', ror: true },
];

export const GAME_SPEEDS = [1.0, 1.5, 2.0] as const;

/** Wonder / relic / ruin countdown: 2000 game-years ≈ 1000 s at speed 1.0 (mil:5, econ:7). */
export const VICTORY = { countdownYears: 2000, secondsPerYear: 0.5, artifacts: 5, ruins: 5, src: 'econ:7,mil:5', verify: true, decision: 'D52' } as const;

/**
 * Starting ages (econ:7 "Default/Stone, Tool, Bronze, Iron, plus Nomad"; Post-Iron from the Death Match preset,
 * FAN): a later age starts with the age advances researched; Post-Iron with every technology the civilization
 * has. Nomad (no Town Center) is not offered yet — D53.
 */
export type StartingAge = 'default' | 'tool' | 'bronze' | 'iron' | 'postIron';
export const STARTING_AGES: readonly { id: StartingAge; name: string; techs: readonly string[] }[] = [
  { id: 'default', name: 'Default', techs: [] },
  { id: 'tool', name: 'Tool Age', techs: ['toolAge'] },
  { id: 'bronze', name: 'Bronze Age', techs: ['toolAge', 'bronzeAge'] },
  { id: 'iron', name: 'Iron Age', techs: ['toolAge', 'bronzeAge', 'ironAge'] },
  { id: 'postIron', name: 'Post-Iron Age', techs: ['toolAge', 'bronzeAge', 'ironAge'] },
];
export const STARTING_AGES_SRC = { src: 'econ:7', note: 'Post-Iron = Iron Age with every tech researched (FAN)', verify: true, decision: 'D53' } as const;

/** Score and Time Limit victories (econ:7): the lobby's choices are ours (D53) — the research gives none. */
export const SCORE_TARGETS: readonly number[] = [250, 500, 750, 1000, 1500];
export const TIME_LIMITS: readonly number[] = [15, 30, 45, 60, 90, 120]; // minutes of game time
export const POP_LIMITS: readonly number[] = [25, 50, 75, 100, 125, 150, 175, 200];

/** Player colors 1–8 (mil:6). Gaia uses teal. */
export const PLAYER_COLORS: readonly { name: string; hex: number }[] = [
  { name: 'Blue', hex: 0x3f5f9f },
  { name: 'Red', hex: 0xcf0a00 },
  { name: 'Yellow', hex: 0xc3a31b },
  { name: 'Brown', hex: 0x8b5b37 },
  { name: 'Orange', hex: 0xf06c07 },
  { name: 'Green', hex: 0x637b2f },
  { name: 'Grey', hex: 0x8f8f8f },
  { name: 'Teal', hex: 0x00ab93 },
];
export const PLAYER_COLORS_SRC = { src: 'mil:6' } as const;

/** Tribute (econ:1.5): needs a Market; 25% fee until Coinage. mil:5 says 30% — econ's dat value wins. */
export const TRIBUTE = { fee: 0.25, requiresBuilding: 'market', src: 'econ:1.5', verify: true, decision: 'D47' } as const;

/** Score formula (econ:7). */
export const SCORE = {
  src: 'econ:7',
  military: { perKill: 0.5, perRazed: 1, mostMilitary: 25 },
  economy: { goldPer: 100, tributePer: 60, perVillagerOrBoat: 1, mostVillagers: 25, perExplore3Pct: 1, mostExplored: 25 },
  religion: { perConversion: 2, mostConversions: 25, perTemple: 3, perRelicOrRuin: 10, allRelicsRuins: 50 },
  technology: { perTech: 2, mostTechs: 50, firstBronze: 25, firstIron: 25 },
  other: { eliminated: -100, perWonder: 100 },
} as const;

/** Computer player difficulty levels (mil:8 names are unverified: Easiest … Hardest). */
export type AiLevel = 'easiest' | 'easy' | 'moderate' | 'hard' | 'hardest';
