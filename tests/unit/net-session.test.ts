/**
 * Two game sessions over the real relay (M16.2, docs/MULTIPLAYER.md): `NetClient` + `LockstepRouter` + the server's
 * `/ws`, a host and a guest each giving orders and each running one computer, stay hash-identical.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { LockstepRouter } from '../../src/game/lockstep.ts';
import { decodePacket, encodePacket } from '../../src/game/netPacket.ts';
import { GameSession } from '../../src/game/session.ts';
import { DEFAULT_SETUP, skirmishConfig, type SkirmishSetup } from '../../src/game/skirmish.ts';
import { encodeCommands } from '../../src/sim/commands/codec.ts';
import { OrderFuzzer } from '../../src/sim/testing/fuzz.ts';
import { NetClient } from '../../src/platform/netClient.ts';

const PORT = 4392;
let server: ChildProcess;

beforeAll(async () => {
  server = spawn('node', ['server/serve.mjs', '--dir', 'dist', '--port', String(PORT), '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('server did not start');
});
afterAll(() => {
  server.kill();
});

describe('lockstep packets on the wire (M16.2)', () => {
  it('round-trip, with and without a state check (hashes are unsigned 32-bit)', () => {
    const cmds = encodeCommands([{ player: 2, cmd: { t: 'move', ids: [5], x: 3.5, y: 4 } }]);
    for (const p of [{ from: 1, tick: 70000, cmds }, { from: 7, tick: 3, cmds: new Uint8Array(0), check: [200, 0xfedcba98] as [number, number] }]) {
      expect(decodePacket(encodePacket(p))).toEqual(p);
    }
    expect(() => decodePacket(new Uint8Array([9, 9]))).toThrow();
  });

  it('builds the relay URL from the page address, StartOS prefix included', () => {
    expect(NetClient.urlFor({ protocol: 'http:', host: 'box.local:8080', pathname: '/' })).toBe('ws://box.local:8080/ws');
    expect(NetClient.urlFor({ protocol: 'https:', host: 'x.onion', pathname: '/empires/index.html' })).toBe('wss://x.onion/empires/ws');
  });
});

describe('two sessions through the relay (M16.2)', () => {
  it('a host and a guest, each with orders and a computer, stay in step to the hash', async () => {
    const url = `ws://127.0.0.1:${PORT}/ws`;
    const host = new NetClient();
    const guest = new NetClient();
    await host.connect(url, 'Host');
    await guest.connect(url, 'Guest');
    const room = await host.create();
    await guest.join(room.code);
    const setup: SkirmishSetup = {
      ...DEFAULT_SETUP,
      seed: 21,
      type: 'continental',
      size: 'tiny',
      players: [
        { civ: 'greek', team: 1, controller: 'human' },
        { civ: 'persian', team: 2, controller: 'human' },
        { civ: 'egyptian', team: 3, controller: 'hard' },
        { civ: 'yamato', team: 4, controller: 'moderate' },
      ],
    };
    type Start = { you: number; peers: number; game: { setup: SkirmishSetup; delay: number } };
    const starts = Promise.all(
      [host, guest].map(
        (c) =>
          new Promise<Start>((r) => {
            c.onStart = (s) => r(s as Start);
          }),
      ),
    );
    host.start({ setup, delay: 4 });
    const infos = await starts;
    const TICKS = 2000;
    const peers = [host, guest].map((client, i) => {
      const { you, peers: n, game } = infos[i]!;
      const box: { r?: LockstepRouter } = {};
      const router = (box.r = new LockstepRouter({ peer: you, peers: n, delay: game.delay, transport: client.transport((p) => box.r!.receive(p)), checkEvery: 50 }));
      // Peer k is player k + 1 and runs computer k + 3 (the host could run both; this checks either way works).
      const session = new GameSession(skirmishConfig(game.setup), you + 1, router, { ais: [you + 3] });
      const hands = new OrderFuzzer(300 + you, 30);
      const trace: number[] = [];
      session.onTick(() => {
        for (const pc of hands.commands(session.sim)) if (pc.player === you + 1) session.router.submit(pc.player, pc.cmd);
        if (session.sim.tick % 100 === 0) trace.push(session.sim.hash());
      });
      return { router, session, trace };
    });
    const t0 = Date.now();
    while (peers.some((p) => p.session.sim.tick < TICKS)) {
      let stepped = false;
      for (const p of peers) {
        while (p.session.sim.tick < TICKS && p.session.canStep()) {
          p.session.stepOnce();
          stepped = true;
          if (p.session.sim.tick % 25 === 0) break; // let the other peer and the socket catch up
        }
      }
      if (!stepped) await new Promise((r) => setTimeout(r, 1));
      else await new Promise((r) => setImmediate(r));
      if (Date.now() - t0 > 60_000) throw new Error(`stalled at ticks ${peers.map((p) => p.session.sim.tick)}`);
    }
    const [a, b] = peers;
    expect(a!.trace.length).toBe(TICKS / 100);
    expect(a!.trace.findIndex((h, i) => b!.trace[i] !== h), 'first divergent checkpoint (×100 ticks)').toBe(-1);
    expect(a!.router.desync ?? b!.router.desync).toBeNull();
    host.close();
    guest.close();
  }, 90_000);
});
