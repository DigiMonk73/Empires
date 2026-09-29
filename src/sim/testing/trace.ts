import { Sim } from '../index.ts';
import type { SimConfig } from '../world.ts';
import { OrderFuzzer } from './fuzz.ts';

export interface TraceResult {
  /** State hash after every `every` ticks. */
  trace: number[];
  final: number;
  ticks: number;
}

/** Run a fuzzed scenario and record its hash trace — the unit of cross-engine determinism comparison. */
export function runTrace(cfg: SimConfig, ticks: number, fuzzSeed: number, fuzzEvery = 15, every = 100, onTick?: (sim: Sim) => void): TraceResult {
  const sim = Sim.create(cfg);
  const fz = new OrderFuzzer(fuzzSeed, fuzzEvery);
  const trace: number[] = [];
  for (let t = 0; t < ticks; t++) {
    sim.step(fz.commands(sim));
    if (onTick) onTick(sim);
    if (sim.tick % every === 0) trace.push(sim.hash());
  }
  return { trace, final: sim.hash(), ticks };
}
