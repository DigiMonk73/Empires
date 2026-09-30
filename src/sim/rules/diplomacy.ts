import type { World } from '../world.ts';

/**
 * Diplomacy (M12.3, research §5 "Per player: Ally / Neutral / Enemy, plus an Allied Victory checkbox"). Each
 * player holds a stance toward every other player — one-sided, as in the original: what I call you decides what
 * my units do to yours. Setup teams give the starting stances (same team → Ally, else Enemy).
 *   Ally    — never attacked, helped when attacked (1.0a retaliation), shares sight after Writing.
 *   Neutral — attacked when ordered; units on their own attack its soldiers but not its villagers or boats
 *             (research §4 "at Neutral, units attack military units and buildings but not villagers").
 *   Enemy   — everything.
 */
export const ALLY = 0;
export const NEUTRAL = 1;
export const ENEMY = 2;
export const STANCE_NAMES = ['ally', 'neutral', 'enemy'] as const;
export type StanceName = (typeof STANCE_NAMES)[number];

/** Player `a`'s stance toward player `b` (oneself: Ally; Gaia, both ways: Enemy). */
export function stanceOf(w: World, a: number, b: number): number {
  if (a === b) return ALLY;
  if (a === 0 || b === 0) return ENEMY;
  return w.players[a]?.stance[b] ?? ENEMY;
}

/** Does `a` treat `b` as an ally (oneself included)? */
export function allied(w: World, a: number, b: number): boolean {
  return stanceOf(w, a, b) === ALLY;
}

/** Both call each other Ally. */
export function mutualAllies(w: World, a: number, b: number): boolean {
  return allied(w, a, b) && allied(w, b, a);
}

/** Starting stances from setup teams: index = the other player's id. */
export function stancesFromTeams(me: number, teams: readonly number[]): number[] {
  return teams.map((t, q) => (q === me ? ALLY : q === 0 || me === 0 ? ENEMY : t === teams[me] ? ALLY : ENEMY));
}
