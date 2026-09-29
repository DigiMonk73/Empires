#!/usr/bin/env node
// Empires static server: zero dependencies. Serves the built game and /healthz.
// Usage: node server/serve.mjs [--dir dist] [--port 80] [--host 0.0.0.0] [--prefix /some/path]
// Env: PORT, HOST, DIST_DIR, DATA_DIR (reserved for saves / multiplayer relay).
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(args.get('dir') ?? process.env.DIST_DIR ?? join(here, '..', 'dist'));
const port = Number(args.get('port') ?? process.env.PORT ?? 80);
const host = args.get('host') ?? process.env.HOST ?? '0.0.0.0';
const prefix = (args.get('prefix') ?? '').replace(/\/+$/, '');

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
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    const immutable = path.startsWith('/assets/') || path.startsWith('/baked/');
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': info.size,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch (err) {
    console.error('[serve] error', err);
    if (!res.headersSent) send(res, 500, 'internal error');
    else res.destroy();
  }
});

function send(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

server.listen(port, host, () => {
  console.log(`[serve] empires on http://${host}:${port}${prefix || ''}/ (root ${root})`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
