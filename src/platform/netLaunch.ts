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
