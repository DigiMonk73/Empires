/**
 * Player commands — the only way anything outside the simulation changes it (humans, AI, replays, network).
 * Positions are in tiles, quantized to 1/256 tile by `quantize()` when issued so every peer applies identical
 * values. Entity references are handles.
 */
export type Command =
  | { t: 'move'; ids: number[]; x: number; y: number; queue?: boolean }
  | { t: 'stop'; ids: number[] }
  /** Villagers gather resource node `res` (trees, mines, bushes, fish, carcasses). */
  | { t: 'gather'; ids: number[]; res: number; queue?: boolean }
  /** Place a foundation of building `type` with its top-left at (tx, ty); the villagers in `ids` build it. */
  | { t: 'build'; ids: number[]; type: string; tx: number; ty: number; queue?: boolean }
  /** Villagers help build existing foundation `h`. */
  | { t: 'construct'; ids: number[]; h: number; queue?: boolean };

export interface PlayerCommand {
  /** Issuing player slot (1..8); stamped by the router, never trusted from the payload. */
  player: number;
  cmd: Command;
}

export const POS_QUANTUM = 256;

export function quantize(v: number): number {
  return Math.round(v * POS_QUANTUM) / POS_QUANTUM;
}
