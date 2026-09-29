import { decodeCommands, encodeCommands } from '../commands/codec.ts';
import type { PlayerCommand } from '../commands/types.ts';
import { Sim } from '../index.ts';
import { SIM_VERSION } from '../version.ts';
import type { SimConfig } from '../world.ts';
import { utf8Decode, utf8Encode } from './binary.ts';

/**
 * Replays: the starting config plus every tick's commands, with state-hash checkpoints so playback can prove it
 * reproduced the original game. AI decisions are not recorded — their commands are.
 */
export interface Replay {
  simVersion: string;
  config: SimConfig;
  /** Ticks that had commands, with their encoded command blocks. */
  ticks: { tick: number; cmds: Uint8Array }[];
  /** [tick, hash] after that tick was simulated. */
  checkpoints: [number, number][];
  /** Final tick count. */
  length: number;
}

export const CHECKPOINT_EVERY = 100;

export class ReplayRecorder {
  readonly replay: Replay;

  constructor(config: SimConfig) {
    this.replay = { simVersion: SIM_VERSION, config, ticks: [], checkpoints: [], length: 0 };
  }

  /** Call once per tick with the commands passed to `sim.step()`, after stepping. */
  record(sim: Sim, cmds: readonly PlayerCommand[]): void {
    const tick = sim.tick - 1;
    if (cmds.length) this.replay.ticks.push({ tick, cmds: encodeCommands(cmds) });
    if (sim.tick % CHECKPOINT_EVERY === 0) this.replay.checkpoints.push([sim.tick, sim.hash()]);
    this.replay.length = sim.tick;
  }
}

/** Re-simulate a replay; returns the final sim and the first checkpoint mismatch (if any). */
export function playReplay(r: Replay, untilTick = r.length): { sim: Sim; mismatch: { tick: number; expected: number; got: number } | null } {
  if (r.simVersion !== SIM_VERSION) throw new Error(`replay is from sim ${r.simVersion}, this is ${SIM_VERSION}`);
  const sim = Sim.create(r.config);
  let ti = 0;
  let ci = 0;
  let mismatch: { tick: number; expected: number; got: number } | null = null;
  while (sim.tick < untilTick) {
    const t = sim.tick;
    const block = r.ticks[ti]?.tick === t ? r.ticks[ti++]!.cmds : null;
    sim.step(block ? decodeCommands(block) : []);
    const cp = r.checkpoints[ci];
    if (cp && cp[0] === sim.tick) {
      ci++;
      const got = sim.hash();
      if (got !== cp[1] && !mismatch) mismatch = { tick: sim.tick, expected: cp[1], got };
    }
  }
  return { sim, mismatch };
}

/** Binary replay file: JSON header, then varint-framed command blocks. */
export function encodeReplay(r: Replay): Uint8Array {
  const header = utf8Encode(JSON.stringify({ simVersion: r.simVersion, config: r.config, checkpoints: r.checkpoints, length: r.length }));
  const out: number[] = [];
  const uv = (n: number): void => {
    while (n >= 128) {
      out.push((n % 128) | 128);
      n = Math.floor(n / 128);
    }
    out.push(n);
  };
  uv(header.length);
  for (const b of header) out.push(b);
  uv(r.ticks.length);
  let prev = 0;
  for (const t of r.ticks) {
    uv(t.tick - prev);
    prev = t.tick;
    uv(t.cmds.length);
    for (const b of t.cmds) out.push(b);
  }
  return Uint8Array.from(out);
}

export function decodeReplay(bytes: Uint8Array): Replay {
  let i = 0;
  const uv = (): number => {
    let n = 0;
    let mul = 1;
    for (;;) {
      const b = bytes[i++]!;
      n += (b & 127) * mul;
      if (b < 128) return n;
      mul *= 128;
    }
  };
  const hl = uv();
  const h = JSON.parse(utf8Decode(bytes.subarray(i, i + hl))) as Omit<Replay, 'ticks'>;
  i += hl;
  const n = uv();
  const ticks: Replay['ticks'] = [];
  let tick = 0;
  for (let k = 0; k < n; k++) {
    tick += uv();
    const len = uv();
    ticks.push({ tick, cmds: bytes.slice(i, i + len) });
    i += len;
  }
  return { ...h, ticks };
}
