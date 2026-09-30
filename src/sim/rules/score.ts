import { EKind } from '../core/entities.ts';
import { TYPES } from './registry.ts';
import type { World } from '../world.ts';

/**
 * Score (econ:7, from the manual's tech-tree foldout). Five categories; "most X" bonuses go to every player tied
 * for the lead (if the lead is above zero). Artifacts/ruins, tribute and Wonders arrive in later milestones.
 */
export interface ScoreLine {
  player: number;
  military: number;
  economy: number;
  religion: number;
  technology: number;
  other: number;
  total: number;
  /** Raw figures for the post-game screen. */
  kills: number;
  losses: number;
  razed: number;
  villagers: number;
  military_units: number;
  exploredPct: number;
  techs: number;
}

export function computeScores(w: World): ScoreLine[] {
  const e = w.ents;
  const n = w.players.length;
  const villagers = new Array<number>(n).fill(0);
  const military = new Array<number>(n).fill(0);
  const temples = new Array<number>(n).fill(0);
  const wonders = new Array<number>(n).fill(0);
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s]) continue;
    const p = e.owner[s]!;
    const t = TYPES[e.type[s]!]!;
    if (e.kind[s] === EKind.unit) {
      const cls = t.unit?.cls;
      if (cls === 'villager') villagers[p]!++;
      else if (cls && cls !== 'fishingShip' && cls !== 'tradeShip' && cls !== 'transport') military[p]!++;
    } else if (e.build[s]! >= 1) {
      if (t.building!.id === 'temple') temples[p]!++;
      if (t.building!.kind === 'wonder') wonders[p]!++;
    }
  }
  const area = w.map.w * w.map.h;
  const explored = w.players.map((_, p) => {
    const ex = w.fog.explored[p];
    if (!ex) return 0;
    let c = 0;
    for (let i = 0; i < ex.length; i++) if (ex[i]) c++;
    return (100 * c) / area;
  });
  const players = w.players.filter((p) => p.id > 0);
  const lead = (vals: number[]): number => Math.max(0, ...players.map((p) => vals[p.id]!));
  const most = (vals: number[], p: number, bonus: number): number => {
    const top = lead(vals);
    return top > 0 && vals[p] === top ? bonus : 0;
  };
  const techCount = w.players.map((p) => p.techs.length);
  const conv = w.players.map((p) => p.tally.conversions);
  const firstTo = (age: number): number => {
    let best = -1;
    let at = Infinity;
    for (const p of players) {
      const t = p.tally.ageTick[age]!;
      if (t > 0 && t < at) {
        at = t;
        best = p.id;
      }
    }
    return best;
  };
  const bronze = firstTo(3);
  const iron = firstTo(4);
  return players.map((pl) => {
    const p = pl.id;
    const t = pl.tally;
    const mil = 0.5 * t.kills + t.razed + Math.max(0, t.kills - t.losses) + most(military, p, 25);
    const eco = t.gathered[2]! / 100 + t.tribute / 60 + villagers[p]! + most(villagers, p, 25) + Math.floor(explored[p]! / 3) + most(explored, p, 25);
    const rel = 2 * t.conversions + most(conv, p, 25) + 3 * temples[p]!;
    const tech = 2 * techCount[p]! + most(techCount, p, 50) + (bronze === p ? 25 : 0) + (iron === p ? 25 : 0);
    const other = (pl.defeated !== null ? -100 : 0) + 100 * wonders[p]!;
    const f = (x: number) => Math.floor(x);
    return {
      player: p,
      military: f(mil),
      economy: f(eco),
      religion: f(rel),
      technology: f(tech),
      other: f(other),
      total: f(mil) + f(eco) + f(rel) + f(tech) + f(other),
      kills: t.kills,
      losses: t.losses,
      razed: t.razed,
      villagers: villagers[p]!,
      military_units: military[p]!,
      exploredPct: Math.round(explored[p]!),
      techs: techCount[p]!,
    };
  });
}
