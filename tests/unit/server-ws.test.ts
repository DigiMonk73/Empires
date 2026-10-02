/**
 * The multiplayer relay (M16.1, docs/MULTIPLAYER.md): the real server, real WebSocket clients (Node's built-in).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';

const PORT = 4391;
const URL_WS = `ws://127.0.0.1:${PORT}/ws`;
let server: ChildProcess;

beforeAll(async () => {
  server = spawn('node', ['server/serve.mjs', '--dir', 'dist', '--port', String(PORT), '--host', '127.0.0.1', '--away-ms', '3000'], { stdio: 'ignore' });
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

interface Peer {
  ws: WebSocket;
  /** The next JSON message of type `t` (earlier ones of other types are skipped). */
  next(t: string): Promise<Record<string, unknown>>;
  nextBinary(): Promise<Uint8Array>;
  send(msg: object): void;
}

async function connect(): Promise<Peer> {
  const ws = new WebSocket(URL_WS);
  ws.binaryType = 'arraybuffer';
  const texts: Record<string, unknown>[] = [];
  const bins: Uint8Array[] = [];
  const waiters: (() => void)[] = [];
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') texts.push(JSON.parse(ev.data) as Record<string, unknown>);
    else bins.push(new Uint8Array(ev.data as ArrayBuffer));
    for (const w of waiters.splice(0)) w();
  };
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error('ws error'));
  });
  const wait = () => new Promise<void>((r) => waiters.push(r));
  return {
    ws,
    async next(t) {
      for (;;) {
        const i = texts.findIndex((m) => m.t === t);
        if (i >= 0) return texts.splice(0, i + 1).pop()!;
        await wait();
      }
    },
    async nextBinary() {
      while (!bins.length) await wait();
      return bins.shift()!;
    },
    send: (msg) => ws.send(JSON.stringify(msg)),
  };
}

describe('multiplayer relay (M16.1)', () => {
  it('rooms: create, list, join, set up, start — then binary packets reach every other member', async () => {
    const a = await connect();
    const b = await connect();
    const c = await connect();
    a.send({ t: 'hello', name: 'Ann' });
    expect((await a.next('welcome')).id).toBeTypeOf('number');
    a.send({ t: 'create', name: 'Ann' });
    const room = await a.next('room');
    expect(room).toMatchObject({ you: 0, host: 0 });
    const code = room.code as string;
    expect(code).toMatch(/^[A-Z]{4}$/);

    b.send({ t: 'list' });
    const list = (await b.next('rooms')).rooms as { code: string; host: string; members: number; started: boolean }[];
    expect(list.find((r) => r.code === code)).toMatchObject({ host: 'Ann', members: 1, started: false });

    b.send({ t: 'join', code: code.toLowerCase(), name: 'Bo' });
    expect(await b.next('room')).toMatchObject({ code, you: 1 });
    expect(((await a.next('members')).members as { name: string }[]).map((m) => m.name)).toEqual(['Ann', 'Bo']);
    // Each member's measured round trip goes round the room (the host sets the delay from it, M16.6).
    b.send({ t: 'rtt', ms: 140 });
    expect(((await a.next('members')).members as { rtt: number }[]).map((m) => m.rtt)).toEqual([0, 140]);
    c.send({ t: 'join', code, name: 'Cy' });
    expect(await c.next('room')).toMatchObject({ you: 2 });

    // Only the host sets up and starts.
    b.send({ t: 'start', game: {} });
    expect((await b.next('error')).error).toMatch(/host/);
    a.send({ t: 'setup', setup: { type: 'continental', seed: 7 } });
    expect((await c.next('setup')).setup).toEqual({ type: 'continental', seed: 7 });
    a.send({ t: 'start', game: { seed: 7, delay: 4 } });
    for (const [p, you] of [[a, 0], [b, 1], [c, 2]] as const) expect(await p.next('start')).toMatchObject({ you, peers: 3, game: { seed: 7, delay: 4 } });

    // A started room takes no one new.
    const d = await connect();
    d.send({ t: 'join', code, name: 'Di' });
    expect((await d.next('error')).error).toMatch(/started/);

    // Binary frames — small and large (> 64 KiB: the 64-bit length form) — go to everyone but the sender.
    const small = new Uint8Array([1, 0, 2, 9, 9]);
    const big = new Uint8Array(70_000).map((_, i) => i & 255);
    b.ws.send(small);
    expect([...(await a.nextBinary())]).toEqual([...small]);
    expect([...(await c.nextBinary())]).toEqual([...small]);
    a.ws.send(big);
    expect((await b.nextBinary()).length).toBe(70_000);
    const got = await c.nextBinary();
    expect(got[69_999]).toBe(69_999 & 255);

    // Chat reaches everyone, with the sender's peer index.
    c.send({ t: 'chat', text: 'gl hf' });
    expect(await a.next('chat')).toMatchObject({ from: 2, name: 'Cy', text: 'gl hf' });

    // A member leaving a started game: the others hear which peer; indices stay as they were.
    b.ws.close();
    expect(await a.next('left')).toMatchObject({ peer: 1 });
    expect(await c.next('left')).toMatchObject({ peer: 1 });
    c.ws.send(small);
    expect([...(await a.nextBinary())]).toEqual([...small]);
    for (const p of [a, c, d]) p.ws.close();
  });

  it('a guest picks their own civilization and team, and a later host setup keeps it (M16.10)', async () => {
    const h = await connect();
    const g = await connect();
    const extra = await connect();
    h.send({ t: 'create', name: 'Ann' });
    const code = (await h.next('room')).code as string;
    g.send({ t: 'join', code, name: 'Bo' });
    await g.next('room');
    const players = [
      { civ: 'greek', team: 1, controller: 'human' },
      { civ: 'persian', team: 2, controller: 'human' },
      { civ: 'egyptian', team: 3, controller: 'moderate' },
    ];
    h.send({ t: 'setup', setup: { type: 'continental', players } });
    expect((await g.next('setup')).setup).toMatchObject({ type: 'continental' });

    g.send({ t: 'setup', setup: { type: 'coastal' } });
    expect((await g.next('error')).error).toMatch(/host/);
    g.send({ t: 'seat', civ: 'roman', team: 4 });
    const picked = (await h.next('setup')).setup as { players: { civ: string; team: number }[] };
    expect(picked.players.map((p) => [p.civ, p.team])).toEqual([
      ['greek', 1],
      ['roman', 4],
      ['egyptian', 3],
    ]);
    expect((await g.next('setup')).setup).toMatchObject({ players: [{ civ: 'greek' }, { civ: 'roman', team: 4 }, { civ: 'egyptian' }] });

    // The host changing the map, and even rewriting Bo's row, does not take Bo's choice away.
    h.send({
      t: 'setup',
      setup: {
        type: 'coastal',
        players: [
          { civ: 'greek', team: 1, controller: 'human' },
          { civ: 'greek', team: 1, controller: 'human' },
          { civ: 'egyptian', team: 3, controller: 'moderate' },
        ],
      },
    });
    const kept = (await g.next('setup')).setup as { type: string; players: { civ: string; team: number; controller: string }[] };
    expect(kept.type).toBe('coastal');
    expect(kept.players[1]).toMatchObject({ civ: 'roman', team: 4, controller: 'human' });

    g.send({ t: 'seat', civ: 'atlantean', team: 9 });
    expect((await g.next('error')).error).toMatch(/civilization/);

    extra.send({ t: 'join', code, name: 'Cy' });
    await extra.next('room');
    extra.send({ t: 'seat', civ: 'minoan', team: 2 });
    expect((await extra.next('error')).error).toMatch(/no seat/);
    for (const p of [h, g, extra]) p.ws.close();
  });

  it('before the start: a guest leaving renumbers the room; the host leaving closes it', async () => {
    const h = await connect();
    const g1 = await connect();
    const g2 = await connect();
    h.send({ t: 'create', name: 'Host' });
    const code = (await h.next('room')).code as string;
    g1.send({ t: 'join', code, name: 'G1' });
    await g1.next('room');
    g2.send({ t: 'join', code, name: 'G2' });
    expect(await g2.next('room')).toMatchObject({ you: 2 });
    g1.send({ t: 'leave' });
    expect(await g2.next('room')).toMatchObject({ you: 1 });
    h.ws.close();
    expect((await g2.next('closed')).why).toMatch(/host/);
    g2.send({ t: 'join', code, name: 'G2' });
    expect((await g2.next('error')).error).toMatch(/no such room/);
    for (const p of [g1, g2]) p.ws.close();
  });

  it('a member who drops from a started game rejoins its seat with its token, and gets the packets it missed', async () => {
    const a = await connect();
    const b = await connect();
    a.send({ t: 'create', name: 'A' });
    const code = (await a.next('room')).code as string;
    b.send({ t: 'join', code, name: 'B' });
    const token = (await b.next('room')).token as string;
    expect(token).toMatch(/^[0-9a-f]{24}$/);
    a.send({ t: 'start', game: { seed: 3 } });
    await b.next('start');
    b.ws.close(); // a page load
    await new Promise((r) => setTimeout(r, 50));
    a.ws.send(new Uint8Array([7, 7, 7])); // sent while B is away
    const b2 = await connect();
    b2.send({ t: 'rejoin', code, peer: 1, token: 'f'.repeat(24) });
    expect((await b2.next('error')).error).toMatch(/rejoin/);
    b2.send({ t: 'rejoin', code, peer: 1, token });
    expect(await b2.next('rejoined')).toMatchObject({ you: 1, peers: 2, game: { seed: 3 } });
    expect([...(await b2.nextBinary())]).toEqual([7, 7, 7]);
    b2.ws.send(new Uint8Array([1]));
    expect([...(await a.nextBinary())]).toEqual([1]);
    // Once it has played, a drop is held too — and the rejoin brings the whole log, its own packets included, so
    // its page can replay the game from the start (M16.5b).
    b2.ws.close();
    await new Promise((r) => setTimeout(r, 50));
    a.ws.send(new Uint8Array([8]));
    const b3 = await connect();
    b3.send({ t: 'rejoin', code, peer: 1, token });
    expect(await b3.next('rejoined')).toMatchObject({ you: 1, replay: true });
    const log = [[...(await b3.nextBinary())], [...(await b3.nextBinary())], [...(await b3.nextBinary())]];
    expect(log).toEqual([[7, 7, 7], [1], [8]]);
    // Quitting says so: the others hear at once, no hold.
    const t0 = Date.now();
    b3.send({ t: 'leave' });
    expect(await a.next('left')).toMatchObject({ peer: 1 });
    expect(Date.now() - t0, 'no hold for a member that quit').toBeLessThan(1500);
    a.ws.close();
  });

  it('answers ping with pong, and refuses a plain HTTP request to /ws', async () => {
    const p = await connect();
    p.send({ t: 'ping', at: 123 });
    expect(await p.next('pong')).toMatchObject({ at: 123 });
    p.ws.close();
    const r = await fetch(`http://127.0.0.1:${PORT}/ws`);
    expect(r.status).not.toBe(101);
  });
});
