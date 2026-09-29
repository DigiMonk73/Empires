/** The simulation runs at a fixed 20 ticks per second of game time (DECISIONS D2). */
export const TICKS_PER_SECOND = 20;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;

/** Game seconds → whole ticks (rounded, at least 1 for positive durations). */
export function secondsToTicks(s: number): number {
  if (s <= 0) return 0;
  const t = Math.round(s * TICKS_PER_SECOND);
  return t < 1 ? 1 : t;
}

/** A per-second rate → per-tick amount. */
export function perTick(ratePerSecond: number): number {
  return ratePerSecond / TICKS_PER_SECOND;
}
