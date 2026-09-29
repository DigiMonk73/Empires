import { SIN_TABLE, TRIG_STEPS } from './trigTable.ts';

/**
 * Deterministic trigonometry for the simulation (DECISIONS D1): angles are integers in [0, TRIG_STEPS) and values
 * come from a committed decimal table. Directions are measured in world (tile) space: 0 = +x, counter-clockwise
 * toward +y.
 */
export { TRIG_STEPS };

const MASK = TRIG_STEPS - 1;
const QUARTER = TRIG_STEPS >> 2;

export function sinStep(step: number): number {
  return SIN_TABLE[step & MASK]!;
}

export function cosStep(step: number): number {
  return SIN_TABLE[(step + QUARTER) & MASK]!;
}

/**
 * Direction of (dx, dy) as one of 16 sectors (0 = +x, 4 = +y, 8 = −x, 12 = −y), using only comparisons and
 * multiplication. Sector k covers angles within ±11.25° of k·22.5°. Returns -1 for a zero vector.
 */
export function dir16(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return -1;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  // Octant-local sector 0..4 for the angle in [0°, 90°] measured from the x axis.
  let s: number;
  if (ay <= ax * TAN_11_25) s = 0;
  else if (ay <= ax * TAN_33_75) s = 1;
  else if (ay <= ax * TAN_56_25) s = 2;
  else if (ay <= ax * TAN_78_75) s = 3;
  else s = 4;
  // Map to the full circle by quadrant.
  if (dx >= 0 && dy >= 0) return s;
  if (dx < 0 && dy >= 0) return (8 - s) & 15;
  if (dx < 0 && dy < 0) return (8 + s) & 15;
  return (16 - s) & 15;
}

/** 8-sector direction (0 = +x, 2 = +y, 4 = −x, 6 = −y). */
export function dir8(dx: number, dy: number): number {
  const d = dir16(dx, dy);
  return d < 0 ? -1 : ((d + 1) >> 1) & 7;
}

// tan(11.25°), tan(33.75°), tan(56.25°), tan(78.75°) as decimal literals.
const TAN_11_25 = 0.198912367379658;
const TAN_33_75 = 0.668178637919299;
const TAN_56_25 = 1.496605762665489;
const TAN_78_75 = 5.027339492125848;

/** Unit vectors for the 16 sectors, from the table. */
export const DIR16_X: readonly number[] = Array.from({ length: 16 }, (_, k) => cosStep((k * TRIG_STEPS) / 16));
export const DIR16_Y: readonly number[] = Array.from({ length: 16 }, (_, k) => sinStep((k * TRIG_STEPS) / 16));
