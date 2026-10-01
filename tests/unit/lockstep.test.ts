import { describe, expect, it } from 'vitest';
import { decodeCommands, encodeCommands } from '../../src/sim/commands/codec.ts';
import type { PlayerCommand } from '../../src/sim/index.ts';
import { OrderFuzzer } from '../../src/sim/testing/fuzz.ts';
import { LockstepRouter, type LockstepPacket } from '../../src/game/lockstep.ts';
import { LoopbackNetwork } from '../../src/game/loopback.ts';
import { GameSession } from '../../src/game/session.ts';
import { DEFAULT_SETUP, skirmishConfig } from '../../src/game/skirmish.ts';

const move = (player: number, x: number): PlayerCommand => ({ player, cmd: { t: 'move', ids: [x], x: x + 0.5, y: 2 } });
const packet = (from: number, tick: number, cmds: PlayerCommand[]): LockstepPacket => ({ from, tick, cmds: encodeCommands(cmds) });

describe('lockstep router', () => {
  it('applies a tick in peer order once every peer is in — whatever order the packets came in', () => {
    const sent: LockstepPacket[] = [];
    const r = new LockstepRouter({ peer: 1, peers: 3, delay: 2, transport: { send: (p) => sent.push(p) } });
    // The first `delay` ticks can carry nothing.
    expect(r.ready(0) && r.ready(1)).toBe(true);
    r.submit(2, move(2, 5).cmd);
    expect(r.collect(0)).toEqual([]);
    expect(r.collect(1)).toEqual([]);
    // Our tick-2 packet went out at tick 0; tick 2 waits for peers 0 and 2.
    expect(sent.map((p) => [p.tick, decodeCommands(p.cmds).length])).toEqual([[2, 1], [3, 0]]);
    expect(r.ready(2)).toBe(false);
    r.receive(packet(2, 2, [move(3, 9)]));
    expect(r.ready(2)).toBe(false);
    r.receive(packet(0, 2, [move(1, 7), move(1, 8)]));
    r.receive(packet(0, 2, [move(1, 99)])); // a duplicate: dropped
    expect(r.ready(2)).toBe(true);
    expect(r.collect(2)).toEqual([move(1, 7), move(1, 8), move(2, 5), move(3, 9)]);
    r.receive(packet(0, 2, [move(1, 99)])); // stale: dropped
    expect(r.ready(3)).toBe(false);
    expect(() => r.collect(3)).toThrow(/waiting/);
  });

  it('reports a desync from the hashes the peers exchange', () => {
    const net = new LoopbackNetwork(1, { latency: 20, jitter: 60 });
    const peers: LockstepRouter[] = [];
    for (const peer of [0, 1]) {
      const transport = net.join((p) => peers[peer]!.receive(p));
      peers.push(new LockstepRouter({ peer, peers: 2, delay: 3, transport, checkEvery: 20 }));
    }
    const cfg = skirmishConfig({ ...DEFAULT_SETUP, seed: 4, type: 'inland', size: 'tiny' });
    const [a, b] = peers.map((r, i) => new GameSession(cfg, i + 1, r, { ais: [] }));
    b!.onTick(() => {
      if (b!.sim.tick === 150) b!.sim.world.players[1]!.res[0]! += 1; // B's game goes its own way
    });
    for (let ms = 0; a!.sim.tick < 400 || b!.sim.tick < 400; ms += 5) {
      net.advance(5);
      if (a!.sim.tick < 400) a!.update(0.005);
      if (b!.sim.tick < 400) b!.update(0.005);
      expect(ms).toBeLessThan(60_000);
    }
    // Caught at the first checkpoint after it, by both sides.
    expect(peers.map((r) => r.desync?.tick)).toEqual([160, 160]);
  });
});

describe('lockstep loopback with jitter (M15.2, Done 2)', () => {
  it('two peers — a human and a computer each — stay hash-identical for 20k ticks over a jittery network', () => {
    const TICKS = 20_000;
    const DELAY = 4; // 200 ms of input delay; the network takes 30–330 ms, so peers wait on each other
    const net = new LoopbackNetwork(15, { latency: 30, jitter: 300, duplicate: 0.05 });
    const cfg = skirmishConfig({
      ...DEFAULT_SETUP,
      seed: 15,
      type: 'continental',
      size: 'tiny',
      players: [
        { civ: 'greek', team: 1, controller: 'human' },
        { civ: 'persian', team: 2, controller: 'human' },
        { civ: 'egyptian', team: 3, controller: 'hard' },
        { civ: 'yamato', team: 4, controller: 'moderate' },
      ],
    });
    let remote = 0;
    const peers = [0, 1].map((peer) => {
      const box: { r?: LockstepRouter } = {};
      const transport = net.join((p) => {
        remote += decodeCommands(p.cmds).length;
        box.r!.receive(p);
      });
      const router = (box.r = new LockstepRouter({ peer, peers: 2, delay: DELAY, transport }));
      // Peer 0 is player 1 and runs computer 3; peer 1 is player 2 and runs computer 4.
      const session = new GameSession(cfg, peer + 1, router, { ais: [peer + 3] });
      const hands = new OrderFuzzer(100 + peer, 40);
      const trace: number[] = [];
      session.onTick(() => {
        for (const pc of hands.commands(session.sim)) if (pc.player === peer + 1) session.router.submit(pc.player, pc.cmd);
        if (session.sim.tick % 100 === 0) trace.push(session.sim.hash());
      });
      return { router, session, trace };
    });
    // Peer 1's clock runs 1% fast, so it keeps running into peer 0's packets.
    const rate = [0.005, 0.00505];
    let ms = 0;
    while (peers.some((p) => p.session.sim.tick < TICKS)) {
      net.advance(5);
      ms += 5;
      peers.forEach((p, i) => p.session.sim.tick < TICKS && p.session.update(rate[i]!));
      if (ms > TICKS * 50 * 2) throw new Error(`stalled at ticks ${peers.map((p) => p.session.sim.tick)}`);
    }
    const [a, b] = peers;
    expect(a!.trace.length).toBe(TICKS / 100);
    const first = a!.trace.findIndex((h, i) => b!.trace[i] !== h);
    expect(first, 'first divergent checkpoint (×100 ticks)').toBe(-1);
    expect(a!.router.desync ?? b!.router.desync).toBeNull();
    // The network really did misbehave, the peers really did wait, and commands really crossed.
    expect(net.reordered).toBeGreaterThan(1000);
    expect(net.duplicated).toBeGreaterThan(100);
    expect(a!.session.waited + b!.session.waited).toBeGreaterThan(100);
    expect(remote).toBeGreaterThan(500);
  }, 120_000);
});
