/**
 * Multiplayer soak (M16.8, docs/MULTIPLAYER.md): a real server, `peers` Node clients through its relay, each a human
 * seat giving fuzzed orders, plus computer seats run by the host — `minutes` of game time, then every state-hash
 * checkpoint compared across all peers.
 *   node tools/sim/net-soak.ts [minutes=30] [peers=2] [computers=2] [seed=7]
 */
import { spawn } from 'node:child_process';
import { LockstepRouter } from '../../src/game/lockstep.ts';
import { GameSession } from '../../src/game/session.ts';
import { DEFAULT_SETUP, skirmishConfig, type SkirmishSetup } from '../../src/game/skirmish.ts';
import { OrderFuzzer } from '../../src/sim/testing/fuzz.ts';
import { NetClient } from '../../src/platform/netClient.ts';

const [minutes = 30, nPeers = 2, nAi = 2, seed = 7] = process.argv.slice(2).map(Number);
const PORT = 4397;
const server = spawn('node', ['server/serve.mjs', '--dir', 'dist', '--port', String(PORT), '--host', '127.0.0.1'], { stdio: 'ignore' });
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break;
    } catch {
      if (i > 100) throw new Error('server did not start');
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  const civs = ['greek', 'persian', 'egyptian', 'yamato', 'hittite', 'shang', 'roman', 'minoan'];
  const setup: SkirmishSetup = {
    ...DEFAULT_SETUP,
    seed,
    type: 'continental',
    size: 'small',
    players: Array.from({ length: nPeers + nAi }, (_, i) => ({ civ: civs[i]!, team: i + 1, controller: i < nPeers ? ('human' as const) : ('hard' as const) })),
  };
  const clients = Array.from({ length: nPeers }, () => new NetClient());
  const url = `ws://127.0.0.1:${PORT}/ws`;
  for (const [i, c] of clients.entries()) await c.connect(url, `P${i + 1}`);
  const room = await clients[0]!.create();
  for (const c of clients.slice(1)) await c.join(room.code);
  const started = Promise.all(clients.map((c) => new Promise<{ you: number; peers: number }>((r) => (c.onStart = (s) => r(s)))));
  clients[0]!.start({ setup, delay: 4, seats: Array.from({ length: nPeers }, (_, i) => i + 1) });
  const infos = await started;
  const aiSeats = Array.from({ length: nAi }, (_, i) => nPeers + i + 1);
  const peers = clients.map((client, i) => {
    const { you, peers: n } = infos[i]!;
    const box: { r?: LockstepRouter } = {};
    const router = (box.r = new LockstepRouter({ peer: you, peers: n, delay: 4, transport: client.transport((p) => box.r!.receive(p)) }));
    const session = new GameSession(skirmishConfig(setup), you + 1, router, { ais: you === 0 ? aiSeats : [] });
    const hands = new OrderFuzzer(900 + you, 40);
    const trace = new Map<number, number>();
    session.onTick(() => {
      for (const pc of hands.commands(session.sim)) if (pc.player === you + 1) session.router.submit(pc.player, pc.cmd);
      if (session.sim.tick % 1200 === 0) trace.set(session.sim.tick, session.sim.hash());
    });
    return { router, session, trace };
  });
  const TICKS = minutes * 1200;
  const t0 = Date.now();
  let lastLog = 0;
  while (peers.some((p) => p.session.sim.tick < TICKS)) {
    let stepped = false;
    for (const p of peers) {
      for (let k = 0; k < 20 && p.session.sim.tick < TICKS && p.session.canStep(); k++) {
        p.session.stepOnce();
        stepped = true;
      }
    }
    await new Promise((r) => (stepped ? setImmediate(r) : setTimeout(r, 1)));
    const t = Math.min(...peers.map((p) => p.session.sim.tick));
    if (t - lastLog >= 6000) {
      lastLog = t;
      console.log(`  ${(t / 1200).toFixed(0)} min (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    if (peers.some((p) => p.router.desync)) break;
  }
  const desync = peers.map((p) => p.router.desync).find(Boolean);
  let mismatches = 0;
  for (const [tick, h] of peers[0]!.trace) for (const p of peers.slice(1)) if (p.trace.get(tick) !== h) mismatches++;
  const w = peers[0]!.session.sim.world;
  console.log(
    `net soak: ${nPeers} peers + ${nAi} computers, ${minutes} game min in ${((Date.now() - t0) / 1000).toFixed(0)} s — ` +
      `checkpoints ${peers[0]!.trace.size}, mismatches ${mismatches}, desync ${desync ? JSON.stringify(desync) : 'none'}, ` +
      `pops ${w.players.slice(1).map((p) => p.pop).join('/')}${w.gameOver ? `, over at ${(w.gameOver.tick / 1200).toFixed(1)} min` : ''}`,
  );
  for (const c of clients) c.close();
  process.exitCode = mismatches || desync ? 1 : 0;
} finally {
  server.kill();
}
