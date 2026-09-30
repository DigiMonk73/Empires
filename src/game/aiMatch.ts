import type { AiLevel, MapSizeId } from '../data/setup.ts';
import { AiPlayer } from '../ai/ai.ts';
import { EKind } from '../sim/core/entities.ts';
import { Sim } from '../sim/index.ts';
import { generateMap, type GenMapType } from '../sim/mapgen/generate.ts';
import { TYPES } from '../sim/rules/registry.ts';
import { PlayerView } from '../sim/view/playerView.ts';
import { computeScores } from '../sim/rules/score.ts';

/**
 * Headless AI-vs-AI match (the AI suite, M6.6): a generated map with every player an AiPlayer, stepped for a fixed
 * number of game minutes. Deterministic; wall-clock timing is injected by the caller.
 */
export interface MatchOptions {
  seed: number;
  type?: GenMapType;
  size?: MapSizeId;
  levels: AiLevel[];
  minutes: number;
  /** AIs build no army (economy timing runs). */
  peaceful?: boolean;
  clock?: () => number;
}

export interface MatchSample {
  minute: number;
  players: { villagers: number; pop: number; age: number; res: number[]; buildings: number; idle: number; military: number }[];
}

export interface MatchResult {
  ticks: number;
  samples: MatchSample[];
  /** Tick each player reached each age (index = age; 0 = not reached). */
  ageTick: number[][];
  /** % of villager-seconds spent with no orders, per player. */
  idlePct: number[];
  winner: number[] | null;
  /** Final score per player (index = player − 1). */
  scores: number[];
  /** Units ever blocked > 5 s, and all units that ever existed (for the stuck %). */
  stuckUnits: number;
  unitsSeen: number;
  maxTickMs: number;
  hash: number;
  /** Each player's researched technologies at the end, in order (AI diagnostics, M13.2). */
  techs: string[][];
  /** Each computer's opening plan (rush / boom). */
  plans: string[];
  /** Enemy units each player converted (priests, M13.5). */
  conversions: number[];
}

const isVillager = (w: Sim['world'], s: number): boolean => TYPES[w.ents.type[s]!]!.unit?.cls === 'villager';

export function runMatch(o: MatchOptions): MatchResult {
  const civs = ['greek', 'egyptian', 'persian', 'babylonian', 'hittite', 'yamato', 'shang', 'roman'];
  const cfg = generateMap({ seed: o.seed, type: o.type ?? 'continental', size: o.size ?? 'tiny', players: o.levels.map((_, i) => ({ civ: civs[i % civs.length]! })) });
  const sim = Sim.create({ ...cfg, players: cfg.players.map((p, i) => ({ ...p, ai: o.levels[i] })) });
  const w = sim.world;
  const n = o.levels.length;
  const ais = o.levels.map((lv, i) => new AiPlayer(i + 1, lv, o.seed * 31 + i, { peaceful: o.peaceful }));
  const views = o.levels.map((_, i) => new PlayerView(w, i + 1));
  const samples: MatchSample[] = [];
  const idle = new Array<number>(n).fill(0);
  const vils = new Array<number>(n).fill(0);
  let maxTickMs = 0;
  const stuck = new Set<number>();
  const seen = new Set<number>();
  const total = o.minutes * 60 * 20;
  for (let t = 0; t < total; t++) {
    const cmds = ais.flatMap((ai, i) => ai.think(views[i]!).map((cmd) => ({ player: i + 1, cmd })));
    const t0 = o.clock?.() ?? 0;
    sim.step(cmds);
    sim.drainEvents(); // nobody listens headless; don't let them pile up
    maxTickMs = Math.max(maxTickMs, (o.clock?.() ?? 0) - t0);
    if (t % 20 === 0) {
      const e = w.ents;
      for (let s = 0; s < e.top; s++) {
        const p = e.owner[s]!;
        if (!e.alive[s] || e.kind[s] !== EKind.unit || p < 1 || p > n || !isVillager(w, s)) continue;
        vils[p - 1]!++;
        if (!w.orders[s]) idle[p - 1]!++;
      }
      for (let s = 0; s < e.top; s++) {
        if (!e.alive[s] || e.kind[s] !== EKind.unit || e.owner[s] === 0) continue;
        const h = e.handleOf(s);
        seen.add(h);
        if (e.stuck[s]! > 100) stuck.add(h);
      }
    }
    if (t % 1200 === 0) samples.push(sample(w, n, t / 1200));
    if (w.gameOver) break;
  }
  return {
    ticks: w.tick,
    samples,
    ageTick: o.levels.map((_, i) => [...w.players[i + 1]!.tally.ageTick]),
    idlePct: idle.map((k, i) => (100 * k) / Math.max(1, vils[i]!)),
    winner: w.gameOver?.winners ?? null,
    scores: o.levels.map((_, i) => computeScores(w).find((l) => l.player === i + 1)?.total ?? 0),
    stuckUnits: stuck.size,
    unitsSeen: seen.size,
    maxTickMs,
    hash: sim.hash(),
    techs: o.levels.map((_, i) => [...w.players[i + 1]!.techs]),
    plans: ais.map((ai) => ai.military.plan),
    conversions: o.levels.map((_, i) => w.players[i + 1]!.tally.conversions),
  };
}

function sample(w: Sim['world'], n: number, minute: number): MatchSample {
  const players = [];
  for (let p = 1; p <= n; p++) {
    const v = new PlayerView(w, p);
    const units = v.ownUnits();
    const vil = units.filter((u) => u.cls === 'villager');
    const me = v.me();
    players.push({ villagers: vil.length, pop: me.pop, age: me.age, res: me.res.map((x) => Math.floor(x)), buildings: v.ownBuildings().length, idle: vil.filter((u) => u.idle).length, military: units.length - vil.length });
  }
  return { minute, players };
}
