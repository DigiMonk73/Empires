import { applyCommands } from './commands/apply.ts';
import type { PlayerCommand } from './commands/types.ts';
import { hashBreakdown } from './hash.ts';
import { followerPathSystem, movementSystem, pathRequestSystem, separationSystem } from './systems/movement.ts';
import { fogSystem } from './systems/fog.ts';
import { populationSystem } from './systems/population.ts';
import { gatherSystem } from './systems/gather.ts';
import { buildSystem } from './systems/build.ts';
import { repairSystem } from './systems/repair.ts';
import { transportSystem } from './systems/transport.ts';
import { tradeSystem } from './systems/trade.ts';
import { productionSystem } from './systems/production.ts';
import { victorySystem } from './systems/victory.ts';
import { relicSystem } from './systems/relics.ts';
import { farmSystem } from './systems/farm.ts';
import { attackSystem, decaySystem, projectileSystem, targetSystem, towerSystem } from './systems/combat.ts';
import { priestSystem } from './systems/priest.ts';
import { World, type SimConfig, type SimEvent } from './world.ts';
import { deserializeWorld, serializeWorld } from './save/serialize.ts';

export type { Command, PlayerCommand } from './commands/types.ts';
export type { SimConfig, SimEvent, MapSpec, ScenarioSpec, PlayerSetup } from './world.ts';
export { SIM_VERSION } from './version.ts';

/**
 * The simulation facade. `step()` advances exactly one 50 ms tick given that tick's commands; everything the
 * renderer, UI, audio and AI need is read through `world` (read-only by convention; views arrive in M2).
 */
export class Sim {
  readonly config: SimConfig;
  readonly world: World;

  private constructor(config: SimConfig, world: World) {
    this.config = config;
    this.world = world;
  }

  static create(config: SimConfig): Sim {
    return new Sim(config, new World(config));
  }

  /** Rebuild a simulation from `serialize()` output. */
  static deserialize(bytes: Uint8Array): Sim {
    const { world, config } = deserializeWorld(bytes);
    return new Sim(config, world);
  }

  /** Full state snapshot (uncompressed; the platform layer gzips for storage). */
  serialize(): Uint8Array {
    return serializeWorld(this.world, this.config);
  }

  get tick(): number {
    return this.world.tick;
  }

  /** Advance one tick. Tick system order: see docs/design/architecture-proposal.md §3. */
  step(cmds: readonly PlayerCommand[] = []): void {
    const w = this.world;
    applyCommands(w, cmds);
    productionSystem(w);
    gatherSystem(w);
    farmSystem(w);
    buildSystem(w);
    repairSystem(w);
    transportSystem(w);
    tradeSystem(w);
    attackSystem(w);
    priestSystem(w);
    towerSystem(w);
    projectileSystem(w);
    decaySystem(w);
    pathRequestSystem(w);
    w.pathing.process();
    followerPathSystem(w);
    movementSystem(w);
    separationSystem(w);
    fogSystem(w);
    targetSystem(w); // after separation (fresh unit grid) and fog (sight)
    populationSystem(w);
    relicSystem(w);
    victorySystem(w);
    w.tick++;
  }

  hash(): number {
    return hashBreakdown(this.world).all!;
  }

  hashBreakdown(): Record<string, number> {
    return hashBreakdown(this.world);
  }

  /** Take and clear the events produced since the last call (not part of the hashed state). */
  drainEvents(): SimEvent[] {
    const ev = this.world.events;
    this.world.events = [];
    return ev;
  }
}
