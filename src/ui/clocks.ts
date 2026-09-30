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
  return w.countdowns.map((c) => {
    const years = Math.max(0, Math.ceil((c.end - w.tick) / TICKS_PER_YEAR));
    const who = c.player === me ? 'You' : `Player ${c.player}`;
    return { key: `${c.kind}-${c.player}-${c.h}`, text: `${who} · ${WHAT[c.kind]} · ${years}`, color: lightColor(c.player) };
  });
}

/** Refresh the clocks signal, leaving it alone when nothing on screen would change. */
export function syncClocks(w: World, me: number): void {
  const rows = clockRows(w, me);
  const cur = hud.clocks.value;
  if (rows.length === cur.length && rows.every((r, i) => r.text === cur[i]!.text && r.key === cur[i]!.key)) return;
  hud.clocks.value = rows;
}

/** The line under Victory / Defeat. `by` holds the countdown that won (a Standard win). */
export function winLine(how: WinHow, won: boolean, by: number, me: number): string {
  if (how === 'conquest') return won ? 'Your enemies have been conquered.' : 'Your civilization has fallen.';
  if (how === 'wonder') return by === me ? 'Your Wonder has stood for 2000 years.' : `Player ${by}’s Wonder has stood for 2000 years.`;
  const set = how === 'artifacts' ? 'Artifacts' : 'Ruins';
  return by === me ? `You have held all the ${set} for 2000 years.` : `Player ${by} has held all the ${set} for 2000 years.`;
}
