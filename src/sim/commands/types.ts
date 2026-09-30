/**
 * Player commands — the only way anything outside the simulation changes it (humans, AI, replays, network).
 * Positions are in tiles, quantized to 1/256 tile by `quantize()` when issued so every peer applies identical
 * values. Entity references are handles.
 */
export type Command =
  /** `am`: attack-move (a modern convenience; the original has none — mil:2). */
  | { t: 'move'; ids: number[]; x: number; y: number; queue?: boolean; am?: boolean }
  | { t: 'stop'; ids: number[] }
  /** Villagers gather resource node `res` (trees, mines, bushes, fish, carcasses). */
  | { t: 'gather'; ids: number[]; res: number; queue?: boolean }
  /** Place a foundation of building `type` with its top-left at (tx, ty); the villagers in `ids` build it. */
  | { t: 'build'; ids: number[]; type: string; tx: number; ty: number; queue?: boolean }
  /** Villagers help build existing foundation `h`. */
  | { t: 'construct'; ids: number[]; h: number; queue?: boolean }
  /** Villagers repair own damaged building/ship/siege `h`. */
  | { t: 'repair'; ids: number[]; h: number; queue?: boolean }
  /** Transports `ids` sail to the water nearest (x, y) and land their cargo. */
  | { t: 'unload'; ids: number[]; x: number; y: number }
  /** Trade boats `ids` sell `good` (resource index: 0 food, 1 wood, 3 stone). */
  | { t: 'tradeGood'; ids: number[]; good: number }
  /** Context action on entity `h`: villagers farm own fields / hunt animals; soldiers attack. */
  | { t: 'act'; ids: number[]; h: number; queue?: boolean }
  /** The issuing player gives up (defeated at once; their units stay where they are, idle). */
  | { t: 'resign' }
  /** Destroy own units/buildings (the Delete key; a converting priest with Martyrdom converts its target). */
  | { t: 'delete'; ids: number[] }
  /** Stand Ground on/off for units `ids`. */
  | { t: 'stance'; ids: number[]; stand: boolean }
  /** Queue `n` of base unit `unit` at building `bld`. */
  | { t: 'train'; bld: number; unit: string; n?: number }
  /** Research technology `tech` at building `bld` (shares the building's queue). */
  | { t: 'research'; bld: number; tech: string }
  /** Cancel a queued unit or research (default: the last one) at building `bld`, refunding it. */
  | { t: 'cancelTrain'; bld: number; index?: number }
  /** Set the rally point of buildings `blds`: a point, or a resource node (`res`) to gather. */
  | { t: 'rally'; blds: number[]; x: number; y: number; res?: number }
  /** Diplomacy (M12.3): the issuing player's stance toward player `to` (0 Ally, 1 Neutral, 2 Enemy). */
  | { t: 'diplomacy'; to: number; stance: number }
  /** The Allied Victory checkbox. */
  | { t: 'alliedVictory'; on: boolean }
  /** Give player `to` `amount` of resource `res` (needs a Market; the fee is paid on top). */
  | { t: 'tribute'; to: number; res: number; amount: number };

export interface PlayerCommand {
  /** Issuing player slot (1..8); stamped by the router, never trusted from the payload. */
  player: number;
  cmd: Command;
}

export const POS_QUANTUM = 256;

export function quantize(v: number): number {
  return Math.round(v * POS_QUANTUM) / POS_QUANTUM;
}
