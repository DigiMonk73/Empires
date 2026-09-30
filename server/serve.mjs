#!/usr/bin/env node
// Empires static server: zero dependencies. Serves the built game and /healthz.
// Usage: node server/serve.mjs [--dir dist] [--port 80] [--host 0.0.0.0] [--prefix /some/path] [--data /data]
// Env: PORT, HOST, DIST_DIR, DATA_DIR (saved games live in DATA_DIR/saves; unset = no server saves).
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { mkdir, open, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(args.get('dir') ?? process.env.DIST_DIR ?? join(here, '..', 'dist'));
const port = Number(args.get('port') ?? process.env.PORT ?? 80);
const host = args.get('host') ?? process.env.HOST ?? '0.0.0.0';
const prefix = (args.get('prefix') ?? '').replace(/\/+$/, '');
const dataDir = args.get('data') ?? process.env.DATA_DIR ?? '';
const savesDir = dataDir ? join(resolve(dataDir), 'saves') : '';

/** Text types worth compressing on the fly (the baked metadata is ~2 MB of JSON). */
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (prefix) {
      if (path === prefix) {
        res.writeHead(301, { Location: prefix + '/' }).end();
        return;
      }
      if (!path.startsWith(prefix + '/')) return send(res, 404, 'not found');
      path = path.slice(prefix.length);
    }
    if (path === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, service: 'empires' }));
      return;
    }
    if (path === '/api/saves' || path.startsWith('/api/saves/')) return await savesApi(req, res, path);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) return send(res, 403, 'forbidden');
    let info;
    try {
      info = await stat(file);
    } catch {
      return send(res, 404, 'not found');
    }
    if (info.isDirectory()) {
      res.writeHead(301, { Location: (prefix + path).replace(/\/?$/, '/') }).end();
      return;
    }
    const ext = extname(file).toLowerCase();
    const type = MIME[ext] ?? 'application/octet-stream';
    // Only Vite's content-hashed bundles are immutable. Everything else — the baked atlases keep their names
    // from one version to the next — is revalidated (Last-Modified → 304), so an update never mixes old sprite
    // pages with new metadata.
    const immutable = path.startsWith('/assets/');
    const modified = Math.floor(info.mtimeMs / 1000) * 1000;
    const lastModified = new Date(modified).toUTCString();
    const since = Date.parse(req.headers['if-modified-since'] ?? '');
    if (!immutable && since >= modified) {
      res.writeHead(304, { 'Cache-Control': 'no-cache', 'Last-Modified': lastModified }).end();
      return;
    }
    const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    res.writeHead(200, {
      'Content-Type': type,
      ...(gzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : { 'Content-Length': info.size }),
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Last-Modified': lastModified,
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(file);
    if (gzip) stream.pipe(createGzip({ level: 6 })).pipe(res);
    else stream.pipe(res);
  } catch (err) {
    console.error('[serve] error', err);
    if (!res.headersSent) send(res, 500, 'internal error');
    else res.destroy();
  }
});

// ── Saved games on the server (M12.5) ─────────────────────────────────────────────────────────────────────
// One file per save: "EMPS", version 1, u32 header length, header JSON, world bytes (src/game/saveCodec.ts).
// Listing reads headers only. Ids are checked, sizes and counts capped, writes are atomic (temp + rename).
const SAVE_ID = /^[a-z0-9_-]{1,64}$/i;
const MAX_SAVE_BYTES = 16 * 1024 * 1024;
const MAX_SAVES = 100;
const META_KEYS = ['id', 'name', 'savedAt', 'simVersion', 'tick', 'kind', 'age', 'localPlayer', 'speed', 'camera'];

function saveHeader(buf) {
  if (buf.length < 9 || buf.toString('latin1', 0, 4) !== 'EMPS' || buf[4] !== 1) throw new Error('not an Empires save');
  const n = buf.readUInt32LE(5);
  if (9 + n > buf.length) throw new Error('save is truncated');
  return JSON.parse(buf.toString('utf8', 9, 9 + n));
}

async function readHeader(file) {
  const fh = await open(file, 'r');
  try {
    const first = Buffer.alloc(9);
    await fh.read(first, 0, 9, 0);
    const n = first.readUInt32LE(5);
    if (n > MAX_SAVE_BYTES) throw new Error('bad header');
    const all = Buffer.alloc(9 + n);
    await fh.read(all, 0, 9 + n, 0);
    return saveHeader(all);
  } finally {
    await fh.close();
  }
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('save is too large'), { code: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function savesApi(req, res, path) {
  if (!savesDir) return json(res, 404, { error: 'server saves are off' });
  await mkdir(savesDir, { recursive: true });
  const id = path === '/api/saves' ? null : path.slice('/api/saves/'.length);
  if (id === null) {
    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
    const out = [];
    for (const f of await readdir(savesDir)) {
      if (!f.endsWith('.save')) continue;
      try {
        const h = await readHeader(join(savesDir, f));
        out.push(Object.fromEntries(META_KEYS.filter((k) => k in h).map((k) => [k, h[k]])));
      } catch {
        /* an unreadable file is skipped, not fatal */
      }
    }
    out.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
    return json(res, 200, out);
  }
  if (!SAVE_ID.test(id)) return json(res, 400, { error: 'bad save id' });
  const file = join(savesDir, `${id}.save`);
  if (req.method === 'GET') {
    let info;
    try {
      info = await stat(file);
    } catch {
      return json(res, 404, { error: 'no such save' });
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
    return;
  }
  if (req.method === 'PUT') {
    if (Number(req.headers['content-length'] ?? 0) > MAX_SAVE_BYTES) return json(res, 413, { error: 'save is too large' });
    let body;
    try {
      body = await readBody(req, MAX_SAVE_BYTES);
    } catch (e) {
      return json(res, e.code ?? 400, { error: e.message });
    }
    let head;
    try {
      head = saveHeader(body);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
    if (head.id !== id) return json(res, 400, { error: 'save id does not match' });
    const exists = await stat(file).then(() => true, () => false);
    if (!exists && (await readdir(savesDir)).filter((f) => f.endsWith('.save')).length >= MAX_SAVES) {
      return json(res, 507, { error: `the server keeps at most ${MAX_SAVES} saves — delete some first` });
    }
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, file);
    return json(res, exists ? 200 : 201, { ok: true, id });
  }
  if (req.method === 'DELETE') {
    try {
      await unlink(file);
    } catch {
      return json(res, 404, { error: 'no such save' });
    }
    res.writeHead(204).end();
    return;
  }
  return json(res, 405, { error: 'method not allowed' });
}

function send(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

server.listen(port, host, () => {
  console.log(`[serve] empires on http://${host}:${port}${prefix || ''}/ (root ${root}${savesDir ? `, saves in ${savesDir}` : ''})`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
