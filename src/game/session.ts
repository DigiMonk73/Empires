import { Sim, type Command, type SimConfig, type SimEvent } from '../sim/index.ts';
import { TICK_SECONDS } from '../sim/time.ts';
import { LocalRouter, type CommandRouter } from './router.ts';
import { AiPlayer, type AiState } from '../ai/ai.ts';
import type { AiLevel } from '../data/setup.ts';
import { PlayerView } from '../sim/view/playerView.ts';

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
  private cmdListeners: ((player: number, cmd: Command) => void)[] = [];

  /** Computer players (config `ai`), each with its own fog-filtered view. */
  private ais: { ai: AiPlayer; view: PlayerView }[] = [];

  /** A new game from `config`, or a loaded one from a restored `Sim` (then call `restoreAis`). */
  constructor(config: SimConfig | Sim, localPlayer = 1, router: CommandRouter = new LocalRouter()) {
    this.sim = config instanceof Sim ? config : Sim.create(config);
    config = this.sim.config;
    // Commands pass through a tap (unit acknowledgements, later replays) on their way to the real router.
    this.router = {
      submit: (player, cmd) => {
        router.submit(player, cmd);
        for (const l of this.cmdListeners) l(player, cmd);
      },
      collect: (tick) => router.collect(tick),
    };
    this.localPlayer = localPlayer;
    config.players.forEach((p, i) => {
      if (p.ai && i + 1 !== localPlayer) this.ais.push({ ai: new AiPlayer(i + 1, p.ai, config.seed * 31 + i), view: new PlayerView(this.sim.world, i + 1) });
    });
  }

  /** Hand a player to a computer opponent (tests and demos: the local player "autoplays"). */
  addAi(player: number, level: AiLevel): void {
    if (this.ais.some(({ ai }) => ai.player === player)) return;
    this.ais.push({ ai: new AiPlayer(player, level, this.sim.config.seed * 31 + player - 1), view: new PlayerView(this.sim.world, player) });
    this.ais.sort((a, b) => a.ai.player - b.ai.player);
  }

  /** The computer players' memories, for a saved game. */
  aiStates(): { player: number; state: AiState }[] {
    return this.ais.map(({ ai }) => ({ player: ai.player, state: ai.save() }));
  }

  restoreAis(states: readonly { player: number; state: AiState }[]): void {
    for (const { player, state } of states) this.ais.find(({ ai }) => ai.player === player)?.ai.restore(state);
  }

  onEvents(fn: (ev: readonly SimEvent[]) => void): void {
    this.listeners.push(fn);
  }

  /** Every command submitted (any player), as it is submitted. */
  onCommand(fn: (player: number, cmd: Command) => void): void {
    this.cmdListeners.push(fn);
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
    // AI decisions go through the router like any player's input (D10).
    for (const { ai, view } of this.ais) for (const cmd of ai.think(view)) this.router.submit(ai.player, cmd);
    this.sim.step(this.router.collect(this.sim.tick));
    const ev = this.sim.drainEvents();
    if (ev.length) for (const l of this.listeners) l(ev);
  }
}
