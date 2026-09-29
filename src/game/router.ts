import type { Command, PlayerCommand } from '../sim/index.ts';

/**
 * The lockstep seam (DECISIONS D10): every command — human input, AI, replay — goes through a router. The local
 * router applies commands on the next tick; a network router (later) adds input delay and peer exchange.
 */
export interface CommandRouter {
  submit(player: number, cmd: Command): void;
  /** Commands to apply at `tick`, in submission order. */
  collect(tick: number): PlayerCommand[];
}

export class LocalRouter implements CommandRouter {
  private pending: PlayerCommand[] = [];

  submit(player: number, cmd: Command): void {
    this.pending.push({ player, cmd });
  }

  collect(): PlayerCommand[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }
}
