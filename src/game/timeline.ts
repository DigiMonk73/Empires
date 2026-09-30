import { computeScores } from '../sim/rules/score.ts';
import type { World } from '../sim/world.ts';

/**
 * The post-game timeline (M12.4): every player's score, population, soldiers, villagers and resources gathered,
 * sampled every 30 s of game time (and when the results open), plus the tick each age was reached. Recorded on the
 * UI side from the sim's tallies — the simulation is untouched — and kept in saved games so a loaded game's graphs
 * start at the beginning.
 */
export const SAMPLE_TICKS = 600;
export const METRICS = ['score', 'pop', 'military', 'villagers', 'gathered'] as const;
export type Metric = (typeof METRICS)[number];
export const METRIC_LABELS: Record<Metric, string> = { score: 'Score', pop: 'Population', military: 'Military', villagers: 'Villagers', gathered: 'Gathered' };

export interface Timeline {
  /** Player ids, in column order. */
  players: number[];
  /** Tick of each sample. */
  ticks: number[];
  /** [metric][sample][player column]. */
  series: Record<Metric, number[][]>;
  /** Per player column: the tick Tool, Bronze and Iron were reached (0 = never). */
  ages: number[][];
}

export class TimelineRecorder {
  readonly data: Timeline;
  private readonly world: World;

  constructor(world: World, saved?: Timeline | null) {
    this.world = world;
    const players = world.players.filter((p) => p.id > 0).map((p) => p.id);
    const ok = saved && saved.players.join() === players.join() && METRICS.every((m) => Array.isArray(saved.series?.[m]));
    this.data = ok ? structuredClone(saved) : { players, ticks: [], series: { score: [], pop: [], military: [], villagers: [], gathered: [] }, ages: [] };
    // Drop samples from "after" the loaded tick (a save made, then played on, then loaded again).
    while (this.data.ticks.length && this.data.ticks[this.data.ticks.length - 1]! > world.tick) {
      this.data.ticks.pop();
      for (const m of METRICS) this.data.series[m].pop();
    }
    this.sample();
  }

  /** Call after every tick. */
  onTick(): void {
    if (this.world.tick % SAMPLE_TICKS === 0) this.sample();
  }

  /** Take a sample now (unless one exists for this tick) and refresh the age ticks; returns the data. */
  finish(): Timeline {
    this.sample();
    return structuredClone(this.data);
  }

  private sample(): void {
    const w = this.world;
    if (this.data.ticks[this.data.ticks.length - 1] === w.tick) return; // one sample per tick (an autosave may ask first)
    const scores = computeScores(w);
    const byId = new Map(scores.map((s) => [s.player, s]));
    const col = (f: (id: number) => number): number[] => this.data.players.map(f);
    this.data.ticks.push(w.tick);
    this.data.series.score.push(col((id) => byId.get(id)?.total ?? 0));
    this.data.series.pop.push(col((id) => w.players[id]!.pop));
    this.data.series.military.push(col((id) => byId.get(id)?.military_units ?? 0));
    this.data.series.villagers.push(col((id) => byId.get(id)?.villagers ?? 0));
    this.data.series.gathered.push(col((id) => Math.floor(w.players[id]!.tally.gathered.reduce((a, b) => a + b, 0))));
    this.data.ages = this.data.players.map((id) => [2, 3, 4].map((a) => w.players[id]!.tally.ageTick[a] ?? 0));
  }
}

/** A round step giving about `n` divisions of 0…max (graph axes). */
export function niceStep(max: number, n = 4): number {
  if (max <= 0) return 1;
  const raw = max / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}
