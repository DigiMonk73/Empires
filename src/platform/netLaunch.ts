import type { SkirmishSetup } from '../game/skirmish.ts';

/** What the lobby hands the game page (M16.3): saved in `sessionStorage[MP_KEY]` before the page loads `?mp=1`. */
export interface MpLaunch {
  url: string;
  code: string;
  token: string;
  you: number;
  peers: number;
  game: NetGameInfo;
}
export interface NetGameInfo {
  setup: SkirmishSetup;
  /** Ticks of input delay. */
  delay: number;
  /** The player number each peer controls (peer index → player). */
  seats: number[];
}
export const MP_KEY = 'empires.mp';

/**
 * Input delay for a room (M16.6): a packet goes sender → server → receiver, about one round trip of the slowest
 * pair, so wait that many 50 ms ticks plus two of slack — 4 on a LAN (200 ms), at most 12 (600 ms, Tor).
 */
export function delayFor(rttsMs: readonly number[]): number {
  const worst = rttsMs.length ? Math.max(...rttsMs.map((r) => (Number.isFinite(r) && r > 0 ? r : 0))) : 0;
  return Math.min(12, Math.max(4, Math.ceil(worst / 50) + 2));
}
