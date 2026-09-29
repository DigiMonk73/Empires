import type { Command, PlayerCommand } from './types.ts';
import { POS_QUANTUM } from './types.ts';

/**
 * Compact binary encoding for replays and (later) lockstep networking. Unsigned varints; signed values are
 * zigzag-encoded; positions are fixed-point in 1/POS_QUANTUM tiles. Handles are non-negative integers < 2^52.
 */
const CMD_MOVE = 1;
const CMD_STOP = 2;
const CMD_GATHER = 3;

class Writer {
  bytes: number[] = [];
  uv(n: number): void {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`varint out of range: ${n}`);
    while (n >= 128) {
      this.bytes.push((n % 128) | 128);
      n = Math.floor(n / 128);
    }
    this.bytes.push(n);
  }
  sv(n: number): void {
    this.uv(n < 0 ? -2 * n - 1 : 2 * n);
  }
  pos(v: number): void {
    this.sv(Math.round(v * POS_QUANTUM));
  }
  ids(ids: readonly number[]): void {
    this.uv(ids.length);
    for (const id of ids) this.uv(id);
  }
}

class Reader {
  i = 0;
  private readonly b: Uint8Array;
  constructor(b: Uint8Array) {
    this.b = b;
  }
  uv(): number {
    let n = 0;
    let mul = 1;
    for (;;) {
      if (this.i >= this.b.length) throw new Error('truncated command');
      const byte = this.b[this.i++]!;
      n += (byte & 127) * mul;
      if (byte < 128) return n;
      mul *= 128;
    }
  }
  sv(): number {
    const z = this.uv();
    return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
  }
  pos(): number {
    return this.sv() / POS_QUANTUM;
  }
  ids(): number[] {
    const n = this.uv();
    const out: number[] = [];
    for (let k = 0; k < n; k++) out.push(this.uv());
    return out;
  }
  get done(): boolean {
    return this.i >= this.b.length;
  }
}

function writeCommand(w: Writer, c: Command): void {
  switch (c.t) {
    case 'move':
      w.uv(CMD_MOVE);
      w.ids(c.ids);
      w.pos(c.x);
      w.pos(c.y);
      w.uv(c.queue ? 1 : 0);
      return;
    case 'stop':
      w.uv(CMD_STOP);
      w.ids(c.ids);
      return;
    case 'gather':
      w.uv(CMD_GATHER);
      w.ids(c.ids);
      w.uv(c.res);
      w.uv(c.queue ? 1 : 0);
      return;
  }
}

function readCommand(r: Reader): Command {
  const t = r.uv();
  switch (t) {
    case CMD_MOVE: {
      const ids = r.ids();
      const x = r.pos();
      const y = r.pos();
      const queue = r.uv() === 1;
      return queue ? { t: 'move', ids, x, y, queue } : { t: 'move', ids, x, y };
    }
    case CMD_STOP:
      return { t: 'stop', ids: r.ids() };
    case CMD_GATHER: {
      const ids = r.ids();
      const res = r.uv();
      const queue = r.uv() === 1;
      return queue ? { t: 'gather', ids, res, queue } : { t: 'gather', ids, res };
    }
    default:
      throw new Error(`unknown command type ${t}`);
  }
}

/** Encode one tick's commands. */
export function encodeCommands(cmds: readonly PlayerCommand[]): Uint8Array {
  const w = new Writer();
  w.uv(cmds.length);
  for (const pc of cmds) {
    w.uv(pc.player);
    writeCommand(w, pc.cmd);
  }
  return Uint8Array.from(w.bytes);
}

export function decodeCommands(bytes: Uint8Array): PlayerCommand[] {
  const r = new Reader(bytes);
  const n = r.uv();
  const out: PlayerCommand[] = [];
  for (let k = 0; k < n; k++) {
    const player = r.uv();
    out.push({ player, cmd: readCommand(r) });
  }
  if (!r.done) throw new Error('trailing bytes after commands');
  return out;
}
