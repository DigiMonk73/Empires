import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { decodeSave, decodeSaveMeta, encodeSave } from '../../src/game/saveCodec.ts';
import type { SavedGame } from '../../src/game/saveGame.ts';

const save = (id: string, world = new Uint8Array([1, 2, 3, 250])): SavedGame => ({
  id,
  name: `Game ${id}`,
  savedAt: 1700000000000 + id.length,
  simVersion: '0.8.0',
  tick: 1234,
  kind: 'Inland · tiny',
  age: 'Tool Age',
  localPlayer: 1,
  speed: 1,
  camera: { x: 1, y: 2, zoom: 1 },
  world,
  ais: [{ player: 2, state: { big: 'memory' } as never }],
});

describe('save file codec (M12.5)', () => {
  it('round-trips a save and reads its details without the world', () => {
    const s = save('g1');
    const bytes = encodeSave(s);
    expect(decodeSave(bytes)).toEqual(s);
    expect(decodeSaveMeta(bytes).name).toBe('Game g1');
    expect(() => decodeSave(new Uint8Array([1, 2, 3]))).toThrow('not an Empires save');
    expect(() => decodeSave(bytes.slice(0, 20))).toThrow('truncated');
  });
});

async function start(port: number, data: string | null): Promise<ChildProcess> {
  const args = ['server/serve.mjs', '--dir', 'dist', '--port', String(port), '--host', '127.0.0.1', ...(data ? ['--data', data] : [])];
  const p = spawn('node', args, { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.ok, () => false)) return p;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('server did not start');
}

describe('server saves API (M12.5)', () => {
  const DATA = `artifacts/test-data/server-saves-${process.pid}`;
  // (Clear of the multiplayer tests' fixed 4391–4392: a pid landing on them talked to their server, whose saves are
  // off — four 404s in one verify run, M16.9.)
  const PORT = 4400 + (process.pid % 400);
  const url = (p: string) => `http://127.0.0.1:${PORT}/api/saves${p}`;
  let server: ChildProcess;
  let off: ChildProcess;
  beforeAll(async () => {
    rmSync(DATA, { recursive: true, force: true });
    mkdirSync(DATA, { recursive: true });
    server = await start(PORT, DATA);
    off = await start(PORT + 1, null);
  });
  afterAll(() => {
    server?.kill();
    off?.kill();
    rmSync(DATA, { recursive: true, force: true });
  });

  it('stores, lists (details only), returns and deletes saves', async () => {
    expect(await (await fetch(url(''))).json()).toEqual([]);
    const a = encodeSave(save('alpha'));
    expect((await fetch(url('/alpha'), { method: 'PUT', body: a as BodyInit })).status).toBe(201);
    expect((await fetch(url('/alpha'), { method: 'PUT', body: a as BodyInit })).status).toBe(200); // overwrite
    await fetch(url('/b-2'), { method: 'PUT', body: encodeSave(save('b-2')) as BodyInit });
    const list = (await (await fetch(url(''))).json()) as Record<string, unknown>[];
    expect(list.map((x) => x.id)).toEqual(['alpha', 'b-2']);
    expect(list[0]).toMatchObject({ name: 'Game alpha', tick: 1234, kind: 'Inland · tiny' });
    expect(list[0]!.ais).toBeUndefined();
    const back = new Uint8Array(await (await fetch(url('/alpha'))).arrayBuffer());
    expect(decodeSave(back)).toEqual(save('alpha'));
    expect((await fetch(url('/alpha'), { method: 'DELETE' })).status).toBe(204);
    expect((await fetch(url('/alpha'))).status).toBe(404);
  });

  it('two saves to the same id at once both succeed (M15.10: the temp file was named by process only — a 500)', async () => {
    const a = encodeSave(save('same'));
    const codes = await Promise.all(Array.from({ length: 6 }, () => fetch(url('/same'), { method: 'PUT', body: a as BodyInit }).then((r) => r.status)));
    for (const c of codes) expect([200, 201]).toContain(c);
    expect((await fetch(url('/same'))).status).toBe(200);
  });

  it('refuses bad ids, mismatched ids, non-saves and oversized bodies', async () => {
    expect((await fetch(url('/..%2Fetc'), { method: 'PUT', body: encodeSave(save('x')) as BodyInit })).status).toBe(400);
    expect((await fetch(url('/one'), { method: 'PUT', body: encodeSave(save('two')) as BodyInit })).status).toBe(400);
    expect((await fetch(url('/junk'), { method: 'PUT', body: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]) as BodyInit })).status).toBe(400);
    const big = encodeSave(save('big', new Uint8Array(17 * 1024 * 1024)));
    expect((await fetch(url('/big'), { method: 'PUT', body: big as BodyInit })).status).toBe(413);
    expect((await fetch(url(''), { method: 'POST' })).status).toBe(405);
  });

  it('is off without a data directory', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT + 1}/api/saves`);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'server saves are off' });
  });

  it('keeps multiplayer desync reports in the data directory (M16.6)', async () => {
    const report = { room: 'ABCD', you: 1, desync: { tick: 300, peer: 0, mine: 1, theirs: 2 } };
    const r = await fetch(`http://127.0.0.1:${PORT}/api/desync`, { method: 'POST', body: JSON.stringify(report) });
    expect(r.status).toBe(200);
    const { name } = (await r.json()) as { name: string };
    const saved = JSON.parse(readFileSync(`${DATA}/desync/${name}`, 'utf8')) as typeof report;
    expect(saved).toMatchObject(report);
    expect((await fetch(`http://127.0.0.1:${PORT}/api/desync`, { method: 'POST', body: 'not json' })).status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${PORT + 1}/api/desync`, { method: 'POST', body: '{}' })).status).toBe(404);
  });
});
