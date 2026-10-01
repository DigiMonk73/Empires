import { Rng } from '../sim/math/rng.ts';
import type { LockstepPacket, LockstepTransport } from './lockstep.ts';

/**
 * A pretend network for lockstep tests (M15.2): every packet takes `latency` ms plus up to `jitter` ms (seeded), so
 * packets overtake each other, and a share arrive twice. Time is virtual — `advance()` delivers whatever is due.
 */
export class LoopbackNetwork {
  now = 0;
  /** Packets delivered out of send order, and packets sent twice (so a test can show both happened). */
  reordered = 0;
  duplicated = 0;
  private readonly rng: Rng;
  private readonly peers: ((p: LockstepPacket) => void)[] = [];
  private queue: { at: number; seq: number; to: number; p: LockstepPacket }[] = [];
  private seq = 0;
  private lastSeq: number[] = [];

  private readonly o: { latency: number; jitter: number; duplicate?: number };

  constructor(seed: number, o: { latency: number; jitter: number; duplicate?: number }) {
    this.rng = new Rng(seed, 77);
    this.o = o;
  }

  /** Join a peer; returns its transport. Peer ids are the join order. */
  join(deliver: (p: LockstepPacket) => void): LockstepTransport {
    const me = this.peers.length;
    this.peers.push(deliver);
    this.lastSeq.push(-1);
    return {
      send: (p) => {
        for (let to = 0; to < this.peers.length; to++) {
          if (to === me) continue;
          const copies = this.rng.float() < (this.o.duplicate ?? 0) ? 2 : 1;
          if (copies > 1) this.duplicated++;
          for (let k = 0; k < copies; k++) this.queue.push({ at: this.now + this.o.latency + this.rng.int(this.o.jitter + 1), seq: this.seq++, to, p: { ...p, cmds: p.cmds.slice() } });
        }
      },
    };
  }

  /** Move the clock on by `ms`, delivering every packet due by then (earliest first). */
  advance(ms: number): void {
    this.now += ms;
    const due = this.queue.filter((q) => q.at <= this.now).sort((a, b) => a.at - b.at || a.seq - b.seq);
    if (!due.length) return;
    this.queue = this.queue.filter((q) => q.at > this.now);
    for (const q of due) {
      if (q.seq < this.lastSeq[q.to]!) this.reordered++;
      this.lastSeq[q.to] = Math.max(this.lastSeq[q.to]!, q.seq);
      this.peers[q.to]!(q.p);
    }
  }
}
