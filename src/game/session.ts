import { Sim, type SimConfig, type SimEvent } from '../sim/index.ts';
import { TICK_SECONDS } from '../sim/time.ts';
import { LocalRouter, type CommandRouter } from './router.ts';

/** Max ticks simulated per frame when catching up (avoids a death spiral after a stall). */
const MAX_CATCH_UP = 5;

/**
 * One running game: owns the simulation, advances it at a fixed 20 Hz scaled by game speed, and reports the
 * interpolation factor for rendering between ticks.
 */
export class GameSession {
  readonly sim: Sim;
  readonly router: CommandRouter;
  /** The local human player's slot. */
  readonly localPlayer: number;
  speed = 1;
  paused = false;
  private acc = 0;
  private listeners: ((ev: readonly SimEvent[]) => void)[] = [];

  constructor(config: SimConfig, localPlayer = 1, router: CommandRouter = new LocalRouter()) {
    this.sim = Sim.create(config);
    this.router = router;
    this.localPlayer = localPlayer;
  }

  onEvents(fn: (ev: readonly SimEvent[]) => void): void {
    this.listeners.push(fn);
  }

  /** Advance by real elapsed seconds; returns alpha ∈ [0,1) for interpolating between the last two ticks. */
  update(dtSeconds: number): number {
    if (this.paused) return 1;
    this.acc += dtSeconds * this.speed;
    let n = 0;
    while (this.acc >= TICK_SECONDS && n < MAX_CATCH_UP) {
      this.stepOnce();
      this.acc -= TICK_SECONDS;
      n++;
    }
    if (n === MAX_CATCH_UP) this.acc = Math.min(this.acc, TICK_SECONDS);
    return this.acc / TICK_SECONDS;
  }

  /** Advance exactly one tick (tests, stepping while paused). */
  stepOnce(): void {
    this.sim.step(this.router.collect(this.sim.tick));
    const ev = this.sim.drainEvents();
    if (ev.length) for (const l of this.listeners) l(ev);
  }
}
