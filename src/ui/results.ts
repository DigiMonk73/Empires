import { CIV_BY_ID } from '../data/index.ts';
import { computeScores } from '../sim/rules/score.ts';
import type { World } from '../sim/world.ts';
import { playerColor } from '../render/worldRenderer.ts';
import type { ResultRow } from './store.ts';

const clock = (tick: number): string => {
  const s = Math.floor(tick / 20);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** The post-game table: score by category plus the tallies behind it. */
export function buildResults(w: World): ResultRow[] {
  return computeScores(w).map((sc) => {
    const p = w.players[sc.player]!;
    return {
      ...sc,
      name: `Player ${sc.player}`,
      civ: CIV_BY_ID.get(p.civ)?.name ?? p.civ,
      color: `#${playerColor(sc.player).toString(16).padStart(6, '0')}`,
      gathered: p.tally.gathered.map((v) => Math.floor(v)),
      ages: [2, 3, 4].map((a) => (p.tally.ageTick[a] ? clock(p.tally.ageTick[a]!) : '—')),
      winner: !!w.gameOver?.winners.includes(sc.player),
    };
  });
}

export { clock as formatClock };
