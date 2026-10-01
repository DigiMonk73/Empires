import type { Command, PlayerCommand } from './types.ts';
import { POS_QUANTUM } from './types.ts';

/**
 * Compact binary encoding for replays and (later) lockstep networking. Unsigned varints; signed values are
 * zigzag-encoded; positions are fixed-point in 1/POS_QUANTUM tiles. Handles are non-negative integers < 2^52.
 */
const CMD_MOVE = 1;
const CMD_STOP = 2;
const CMD_GATHER = 3;
const CMD_BUILD = 4;
const CMD_CONSTRUCT = 5;
const CMD_TRAIN = 6;
const CMD_CANCEL_TRAIN = 7;
const CMD_RALLY = 8;
const CMD_ACT = 9;
const CMD_RESEARCH = 10;
const CMD_STANCE = 11;
const CMD_RESIGN = 12;
const CMD_DELETE = 13;
const CMD_REPAIR = 14;
const CMD_UNLOAD = 15;
const CMD_TRADE_GOOD = 16;
const CMD_DIPLOMACY = 17;
const CMD_ALLIED_VICTORY = 18;
const CMD_TRIBUTE = 19;

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
  str(s: string): void {
    this.uv(s.length);
    for (let i = 0; i < s.length; i++) this.uv(s.charCodeAt(i));
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
  str(): string {
    const n = this.uv();
    let s = '';
    for (let k = 0; k < n; k++) s += String.fromCharCode(this.uv());
    return s;
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
      w.uv((c.queue ? 1 : 0) | (c.am ? 2 : 0));
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
    case 'build':
      w.uv(CMD_BUILD);
      w.ids(c.ids);
      w.str(c.type);
      w.sv(c.tx);
      w.sv(c.ty);
      w.uv(c.queue ? 1 : 0);
      return;
    case 'construct':
    case 'repair':
      w.uv(c.t === 'construct' ? CMD_CONSTRUCT : CMD_REPAIR);
      w.ids(c.ids);
      w.uv(c.h);
      w.uv(c.queue ? 1 : 0);
      return;
    case 'act':
      w.uv(CMD_ACT);
      w.ids(c.ids);
      w.uv(c.h);
      w.uv(c.queue ? 1 : 0);
      return;
    case 'resign':
      w.uv(CMD_RESIGN);
      return;
    case 'delete':
      w.uv(CMD_DELETE);
      w.ids(c.ids);
      return;
    case 'tradeGood':
      w.uv(CMD_TRADE_GOOD);
      w.ids(c.ids);
      w.uv(c.good);
      return;
    case 'unload':
      w.uv(CMD_UNLOAD);
      w.ids(c.ids);
      w.pos(c.x);
      w.pos(c.y);
      return;
    case 'stance':
      w.uv(CMD_STANCE);
      w.ids(c.ids);
      w.uv(c.stand ? 1 : 0);
      return;
    case 'research':
      w.uv(CMD_RESEARCH);
      w.uv(c.bld);
      w.str(c.tech);
      return;
    case 'train':
      w.uv(CMD_TRAIN);
      w.uv(c.bld);
      w.str(c.unit);
      w.uv(c.n ?? 1);
      return;
    case 'cancelTrain':
      w.uv(CMD_CANCEL_TRAIN);
      w.uv(c.bld);
      w.sv(c.index ?? -1);
      return;
    case 'rally':
      w.uv(CMD_RALLY);
      w.ids(c.blds);
      w.pos(c.x);
      w.pos(c.y);
      w.sv(c.res ?? -1);
      return;
    // (Signed: an out-of-range value travels as given, for the simulation to reject the same way everywhere.)
    case 'diplomacy':
      w.uv(CMD_DIPLOMACY);
      w.sv(c.to);
      w.sv(c.stance);
      return;
    case 'alliedVictory':
      w.uv(CMD_ALLIED_VICTORY);
      w.uv(c.on ? 1 : 0);
      return;
    case 'tribute':
      w.uv(CMD_TRIBUTE);
      w.sv(c.to);
      w.sv(c.res);
      w.sv(c.amount);
      return;
    default:
      // M15.2: three M12 commands were missing here and encoded as nothing at all.
      throw new Error(`cannot encode command ${(c as { t: string }).t}`);
  }
}

function readCommand(r: Reader): Command {
  const t = r.uv();
  switch (t) {
    case CMD_MOVE: {
      const ids = r.ids();
      const x = r.pos();
      const y = r.pos();
      const flags = r.uv();
      return { t: 'move', ids, x, y, ...(flags & 1 ? { queue: true } : {}), ...(flags & 2 ? { am: true } : {}) };
    }
    case CMD_STOP:
      return { t: 'stop', ids: r.ids() };
    case CMD_GATHER: {
      const ids = r.ids();
      const res = r.uv();
      const queue = r.uv() === 1;
      return queue ? { t: 'gather', ids, res, queue } : { t: 'gather', ids, res };
    }
    case CMD_BUILD: {
      const ids = r.ids();
      const type = r.str();
      const tx = r.sv();
      const ty = r.sv();
      const queue = r.uv() === 1;
      return queue ? { t: 'build', ids, type, tx, ty, queue } : { t: 'build', ids, type, tx, ty };
    }
    case CMD_ACT: {
      const ids = r.ids();
      const h = r.uv();
      const queue = r.uv() === 1;
      return queue ? { t: 'act', ids, h, queue } : { t: 'act', ids, h };
    }
    case CMD_RESIGN:
      return { t: 'resign' };
    case CMD_DELETE:
      return { t: 'delete', ids: r.ids() };
    case CMD_TRADE_GOOD: {
      const ids = r.ids();
      return { t: 'tradeGood', ids, good: r.uv() };
    }
    case CMD_UNLOAD: {
      const ids = r.ids();
      const x = r.pos();
      return { t: 'unload', ids, x, y: r.pos() };
    }
    case CMD_STANCE: {
      const ids = r.ids();
      return { t: 'stance', ids, stand: r.uv() === 1 };
    }
    case CMD_RESEARCH: {
      const bld = r.uv();
      return { t: 'research', bld, tech: r.str() };
    }
    case CMD_TRAIN: {
      const bld = r.uv();
      const unit = r.str();
      const n = r.uv();
      return n === 1 ? { t: 'train', bld, unit } : { t: 'train', bld, unit, n };
    }
    case CMD_CANCEL_TRAIN: {
      const bld = r.uv();
      const index = r.sv();
      return index < 0 ? { t: 'cancelTrain', bld } : { t: 'cancelTrain', bld, index };
    }
    case CMD_RALLY: {
      const blds = r.ids();
      const x = r.pos();
      const y = r.pos();
      const res = r.sv();
      return res < 0 ? { t: 'rally', blds, x, y } : { t: 'rally', blds, x, y, res };
    }
    case CMD_CONSTRUCT: {
      const ids = r.ids();
      const h = r.uv();
      const queue = r.uv() === 1;
      return queue ? { t: 'construct', ids, h, queue } : { t: 'construct', ids, h };
    }
    case CMD_REPAIR: {
      const ids = r.ids();
      const h = r.uv();
      const queue = r.uv() === 1;
      return queue ? { t: 'repair', ids, h, queue } : { t: 'repair', ids, h };
    }
    case CMD_DIPLOMACY: {
      const to = r.sv();
      return { t: 'diplomacy', to, stance: r.sv() };
    }
    case CMD_ALLIED_VICTORY:
      return { t: 'alliedVictory', on: r.uv() === 1 };
    case CMD_TRIBUTE: {
      const to = r.sv();
      const res = r.sv();
      return { t: 'tribute', to, res, amount: r.sv() };
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
