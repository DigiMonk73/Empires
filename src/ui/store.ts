import { signal } from '@preact/signals';
import type { Action, CommandButton } from './commands.ts';
import type { ScoreLine } from '../sim/rules/score.ts';

/** HUD view-model, refreshed from the simulation ~10×/s (never every frame). */
export interface SelInfo {
  h: number;
  name: string;
  owner: number;
  hp: number;
  maxHp: number;
  atk: string;
  arm: string;
  range: number;
  isBuilding: boolean;
  /** Baked model id for the portrait/icon. */
  model: string;
  /** Construction progress (buildings), 1 = done. */
  building?: number;
}

/** One player's row on the post-game screen. */
export interface ResultRow extends ScoreLine {
  name: string;
  civ: string;
  color: string;
  gathered: number[];
  ages: string[];
  winner: boolean;
}

export const hud = {
  /** Game over from the local player's point of view (null while playing). */
  outcome: signal<{ kind: 'victory' | 'defeat'; at: string } | null>(null),
  /** In-game menu open (pauses the game). */
  menuOpen: signal(false),
  speed: signal(1),
  /** Post-game results (null = screen closed). */
  results: signal<ResultRow[] | null>(null),
  res: signal<[number, number, number, number]>([0, 0, 0, 0]),
  pop: signal(0),
  popCap: signal(0),
  age: signal('Stone Age'),
  clock: signal('00:00'),
  playerColor: signal('#3f5f9f'),
  selection: signal<SelInfo[]>([]),
  commands: signal<CommandButton[]>([]),
  /** Queue of the single selected own building. */
  queue: signal<{ type: string; label: string; glyph?: string; progress: number }[]>([]),
  /** Carry text for a single selected villager. */
  carry: signal(''),
  placing: signal<string | null>(null),
  idleVillagers: signal(0),
};

/** Wired by main: what HUD buttons do. */
export const hudActions: {
  perform(a: Action): void;
  cancelQueue(index: number): void;
  nextIdle(): void;
  showResults(): void;
  setMenu(open: boolean): void;
  setSpeed(v: number): void;
  resign(): void;
  restart(): void;
  quit(): void;
} = {
  showResults: () => {},
  setMenu: () => {},
  setSpeed: () => {},
  resign: () => {},
  restart: () => {},
  quit: () => {},
  perform: () => {},
  cancelQueue: () => {},
  nextIdle: () => {},
};
