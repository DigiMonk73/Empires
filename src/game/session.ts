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
  private tickListeners: (() => void)[] = [];
  private cmdListeners: ((player: number, cmd: Command) => void)[] = [];

  /** Computer players (config `ai`), each with its own fog-filtered view. */
  private ais: { ai: AiPlayer; view: PlayerView }[] = [];

  /**
   * A new game from `config`, or a loaded one from a restored `Sim` (then call `restoreAis`). `ais` names the computer
   * seats this session runs (default: all but the local player's) — in lockstep each computer runs on one peer.
   */
  constructor(config: SimConfig | Sim, localPlayer = 1, router: CommandRouter = new LocalRouter(), opts: { ais?: readonly number[] } = {}) {
    this.sim = config instanceof Sim ? config : Sim.create(config);
    config = this.sim.config;
    // Commands pass through a tap (unit acknowledgements, later replays) on their way to the real router.
    this.router = {
      submit: (player, cmd) => {
        router.submit(player, cmd);
        for (const l of this.cmdListeners) l(player, cmd);
      },
      collect: (tick) => router.collect(tick),
      ready: (tick) => router.ready?.(tick) ?? true,
      stepped: (sim) => router.stepped?.(sim),
    };
    this.localPlayer = localPlayer;
    config.players.forEach((p, i) => {
      if (!p.ai || i + 1 === localPlayer || (opts.ais && !opts.ais.includes(i + 1))) return;
      this.ais.push({ ai: new AiPlayer(i + 1, p.ai, config.seed * 31 + i, { civ: p.civ }), view: new PlayerView(this.sim.world, i + 1) });
    });
  }

  /** Hand a player to a computer opponent (tests and demos: the local player "autoplays"). */
  addAi(player: number, level: AiLevel): void {
    if (this.ais.some(({ ai }) => ai.player === player)) return;
    this.ais.push({ ai: new AiPlayer(player, level, this.sim.config.seed * 31 + player - 1, { civ: this.sim.world.players[player]?.civ ?? '' }), view: new PlayerView(this.sim.world, player) });
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

  /** After every tick (the post-game timeline samples on it). */
  onTick(fn: () => void): void {
    this.tickListeners.push(fn);
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
      if (!this.canStep()) {
        // Waiting on a peer (lockstep): hold at most one tick's worth, then catch up when the packets land.
        this.waited++;
        this.acc = Math.min(this.acc, TICK_SECONDS);
        return 1;
      }
      this.stepOnce();
      this.acc -= TICK_SECONDS;
      n++;
    }
    if (n === MAX_CATCH_UP) this.acc = Math.min(this.acc, TICK_SECONDS);
    return this.acc / TICK_SECONDS;
  }

  /** Frames spent waiting on the router (a lockstep peer's commands not in yet). */
  waited = 0;

  /** Events go to no one (a multiplayer page replaying the game after a rejoin, M16.5b: no sounds or messages). */
  muted = false;

  /** Whether the next tick may be simulated (always, except a lockstep router still waiting on a peer). */
  canStep(): boolean {
    return this.router.ready!(this.sim.tick);
  }

  /** Advance exactly one tick (tests, stepping while paused). */
  stepOnce(): void {
    // AI decisions go through the router like any player's input (D10).
    for (const { ai, view } of this.ais) for (const cmd of ai.think(view)) this.router.submit(ai.player, cmd);
    this.sim.step(this.router.collect(this.sim.tick));
    this.router.stepped!(this.sim);
    const ev = this.sim.drainEvents();
    if (ev.length && !this.muted) for (const l of this.listeners) l(ev);
    for (const l of this.tickListeners) l();
  }
}
