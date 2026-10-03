import { decodeCommands, encodeCommands } from '../sim/commands/codec.ts';
import type { Command, PlayerCommand, Sim } from '../sim/index.ts';
import type { CommandRouter } from './router.ts';

/**
 * Lockstep (D10, M15.2; multiplayer's router in M16). Every peer runs the whole simulation and only commands cross
 * the network. A command given at tick t is scheduled for t + `delay` and sent to every peer in that tick's packet —
 * an empty packet too, so the others know nothing more is coming. A tick is simulated only once every peer's packet
 * for it is in, and its commands apply in peer order, then each peer's own order — never in arrival order. Local
 * commands take the same encode → decode trip as remote ones, so every peer applies the same bytes. Every
 * `checkEvery` ticks a packet carries the sender's state hash: a desync is caught within a few ticks of happening.
 */
export interface LockstepPacket {
  from: number;
  /** The tick these commands apply at. */
  tick: number;
  cmds: Uint8Array;
  /** The sender's state hash after an earlier tick: [tick, hash]. */
  check?: [number, number];
}

export interface LockstepTransport {
  /** Deliver to every other peer — in any order, late, or twice. */
  send(p: LockstepPacket): void;
}

export interface Desync {
  tick: number;
  peer: number;
  mine: number;
  theirs: number;
}

export class LockstepRouter implements CommandRouter {
  readonly peer: number;
  readonly peers: number;
  readonly delay: number;
  readonly checkEvery: number;
  private readonly transport: LockstepTransport;
  private pending: PlayerCommand[] = [];
  /** Tick → each peer's commands for it (undefined: not in yet). */
  private inbox = new Map<number, (PlayerCommand[] | undefined)[]>();
  /** The last tick collected (packets for it or earlier are stale). */
  private done: number;
  /** A loaded game resumes here. The next `delay` ticks are a fresh opening: nothing was scheduled for them. */
  private readonly origin: number;
  /** Our recent hashes, and peers' hashes for ticks we haven't reached yet. */
  private mine = new Map<number, number>();
  private early: [number, number, number][] = [];
  private check: [number, number] | null = null;
  /** The first state-hash mismatch with any peer, or null. */
  desync: Desync | null = null;
  /** The last tick each peer has sent commands for (−1: none yet). */
  private lastFrom: number[];
  /** Peers that left: ticks after this one don't wait for them (M16.5). */
  private dropAfter = new Map<number, number>();
  /**
   * Replaying after a rejoin (M16.5b): the room's log brings this peer's own old packets too. While on, they're
   * taken like anyone's, and a tick whose own packet is already in is neither sealed again nor sent — the
   * commands given meanwhile (a computer re-deciding the past) are dropped. It ends at the first tick of our own
   * that the log doesn't have: from there we're live (`onLive`).
   */
  replaying = false;
  onLive: () => void = () => {};

  constructor(o: { peer: number; peers: number; delay: number; transport: LockstepTransport; checkEvery?: number; startTick?: number }) {
    if (o.delay < 1) throw new Error('lockstep needs a delay of at least one tick');
    this.peer = o.peer;
    this.peers = o.peers;
    this.delay = o.delay;
    this.checkEvery = o.checkEvery ?? 100;
    this.transport = o.transport;
    this.origin = Math.max(0, o.startTick ?? 0);
    this.done = this.origin - 1;
    this.lastFrom = new Array<number>(o.peers).fill(-1);
  }

  /**
   * A peer left (M16.5): wait for its packets up to the last tick it sent, and not after. The relay delivers
   * everything a peer sent before it tells the room the peer left, so every remaining peer drops it after the same
   * tick and they stay in step.
   */
  drop(peer: number): void {
    if (peer === this.peer || this.dropAfter.has(peer)) return;
    this.dropAfter.set(peer, this.lastFrom[peer]!);
  }

  /** The peers still in the game. */
  livePeers(): number[] {
    return Array.from({ length: this.peers }, (_, p) => p).filter((p) => !this.dropAfter.has(p));
  }

  submit(player: number, cmd: Command): void {
    this.pending.push({ player, cmd });
  }

  /** Every peer's packet for `tick` is in (the first `delay` ticks, and the first `delay` after a loaded game, have none). */
  ready(tick: number): boolean {
    if (tick < this.origin + this.delay) return true;
    const slot = this.inbox.get(tick);
    if (!slot) return false;
    for (let p = 0; p < this.peers; p++) {
      if (slot[p]) continue;
      const after = this.dropAfter.get(p);
      if (after === undefined || tick <= after) return false;
    }
    return true;
  }

  /** Seal and send what was given since the last tick (for tick + delay), then hand over `tick`'s commands. */
  collect(tick: number): PlayerCommand[] {
    if (!this.ready(tick)) throw new Error(`lockstep: tick ${tick} is still waiting for a peer`);
    const at = tick + this.delay;
    if (this.replaying && this.inbox.get(at)?.[this.peer]) {
      this.pending = []; // our packet for `at` went out before the drop: the log has it
    } else {
      if (this.replaying) {
        this.replaying = false;
        this.onLive();
      }
      const bytes = encodeCommands(this.pending);
      this.pending = [];
      this.store(at, this.peer, decodeCommands(bytes));
      this.transport.send({ from: this.peer, tick: at, cmds: bytes, ...(this.check ? { check: this.check } : {}) });
      this.check = null;
    }
    const slot = this.inbox.get(tick);
    this.inbox.delete(tick);
    this.done = tick;
    const out: PlayerCommand[] = [];
    if (slot) for (const cmds of slot) if (cmds) out.push(...cmds);
    return out;
  }

  /** A packet from another peer (duplicates and stale ones are dropped). */
  receive(p: LockstepPacket): void {
    if ((p.from === this.peer && !this.replaying) || p.from < 0 || p.from >= this.peers || p.tick <= this.done) return;
    const after = this.dropAfter.get(p.from);
    if (after !== undefined && p.tick > after) return; // (a peer that left sends nothing more; never apply it)
    if (this.inbox.get(p.tick)?.[p.from]) return;
    this.store(p.tick, p.from, decodeCommands(p.cmds));
    if (p.check) this.compare(p.from, p.check[0], p.check[1]);
  }

  /** After each simulated tick: note our hash every `checkEvery` ticks (sent with the next packet). */
  stepped(sim: Sim): void {
    if (sim.tick % this.checkEvery !== 0) return;
    const h = sim.hash();
    this.mine.set(sim.tick, h);
    this.check = [sim.tick, h];
    // Peers run at most `delay` ticks apart; a few checkpoints back is plenty for late packets.
    this.mine.delete(sim.tick - 8 * this.checkEvery);
    const early = this.early;
    this.early = [];
    for (const [peer, tick, hash] of early) this.compare(peer, tick, hash);
  }

  private compare(peer: number, tick: number, theirs: number): void {
    const mine = this.mine.get(tick);
    if (mine === undefined) {
      if (tick > this.done) this.early.push([peer, tick, theirs]);
      return;
    }
    if (mine !== theirs && !this.desync) this.desync = { tick, peer, mine, theirs };
  }

  private store(tick: number, peer: number, cmds: PlayerCommand[]): void {
    if (tick > this.lastFrom[peer]!) this.lastFrom[peer] = tick;
    let slot = this.inbox.get(tick);
    if (!slot) this.inbox.set(tick, (slot = new Array<PlayerCommand[] | undefined>(this.peers)));
    slot[peer] = cmds;
  }
}
