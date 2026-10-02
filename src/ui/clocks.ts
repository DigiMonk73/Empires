import { lightColor } from './notify.ts';
import type { WinHow, World } from '../sim/world.ts';
import { hud } from './store.ts';

/**
 * Standard-victory countdowns at the upper right (M14.2; research §UI "Wonder, Ruins and Artifact countdowns
 * appear at upper-right in the owner's color"), counted in years: 2000 years run in 1000 s, so one year is 10 ticks.
 */
const WHAT = { wonder: 'Wonder', artifacts: 'All Artifacts', ruins: 'All Ruins' } as const;
export const TICKS_PER_YEAR = 10;

export function clockRows(w: World, me: number): { key: string; text: string; color: string }[] {
  const rows: { key: string; text: string; color: string }[] = [];
  // Stopped where the game ended (watching on, a Ruins clock counted down after a conquest, M15.10 P41).
  const now = w.gameOver ? w.gameOver.tick : w.tick;
  // Score and Time Limit games (M14.3): the target, or the game time left.
  if (w.victory === 'score') rows.push({ key: 'target', text: `Score to win · ${w.scoreTarget}`, color: NEUTRAL });
  if (w.victory === 'time') {
    const s = Math.max(0, Math.ceil((w.timeLimitTicks - now) / 20));
    rows.push({ key: 'time-left', text: `Time left · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, color: NEUTRAL });
  }
  return rows.concat(w.countdowns.map((c) => {
    const years = Math.max(0, Math.ceil((c.end - now) / TICKS_PER_YEAR));
    const who = c.player === me ? 'You' : `Player ${c.player}`;
    return { key: `${c.kind}-${c.player}-${c.h}`, text: `${who} · ${WHAT[c.kind]} · ${years}`, color: lightColor(c.player) };
  }));
}
const NEUTRAL = '#efe2c0';

/** Refresh the clocks signal, leaving it alone when nothing on screen would change. */
export function syncClocks(w: World, me: number): void {
  const rows = clockRows(w, me);
  const cur = hud.clocks.value;
  if (rows.length === cur.length && rows.every((r, i) => r.text === cur[i]!.text && r.key === cur[i]!.key)) return;
  hud.clocks.value = rows;
}

/**
 * Whether the game's end shows a banner for the local player: a win always does; a loss does unless their own fall
 * already showed one on an earlier tick (they chose Keep watching, and the same Defeat came back when the rest of
 * their team fell, M15.10 P39).
 */
export function showsEnd(won: boolean, fellAt: number | null, tick: number): boolean {
  return won || fellAt === null || fellAt === tick;
}

/** The line under Victory / Defeat. `by` holds the countdown that won (a Standard win). */
export function winLine(how: WinHow, won: boolean, by: number, me: number): string {
  if (how === 'conquest') return won ? 'Your enemies have been conquered.' : 'Your civilization has fallen.';
  if (how === 'score') return by === me ? 'You reached the target score first.' : `Player ${by} reached the target score first.`;
  if (how === 'time') return by === me ? 'Yours was the highest score when time ran out.' : `Player ${by} had the highest score when time ran out.`;
  if (how === 'wonder') return by === me ? 'Your Wonder has stood for 2000 years.' : `Player ${by}’s Wonder has stood for 2000 years.`;
  const set = how === 'artifacts' ? 'Artifacts' : 'Ruins';
  return by === me ? `You have held all the ${set} for 2000 years.` : `Player ${by} has held all the ${set} for 2000 years.`;
}
