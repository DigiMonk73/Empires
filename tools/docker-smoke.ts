/**
 * Runs a built Empires image and checks /healthz, the index page, a relative asset, and serving under a path
 * prefix (StartOS and reverse proxies may mount the UI below /). Usage: node tools/docker-smoke.ts <image>
 */
import { execFileSync } from 'node:child_process';

const image = process.argv[2] ?? 'empires:verify-arm64';

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

async function waitFor(url: string, ms = 20_000): Promise<Response> {
  const t0 = Date.now();
  let last: unknown;
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      last = r.status;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timeout waiting for ${url}: ${String(last)}`);
}

async function check(port: number, prefix: string): Promise<void> {
  const base = `http://127.0.0.1:${port}${prefix}`;
  const health = await (await waitFor(`http://127.0.0.1:${port}${prefix}/healthz`)).json();
  if (!health.ok) throw new Error('healthz not ok');
  const html = await (await waitFor(`${base}/`)).text();
  if (!html.includes('<title>Empires</title>')) throw new Error('index.html missing title');
  const asset = /src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
  if (!asset) throw new Error('index.html has no relative ./assets script (vite base must be ./)');
  const js = await waitFor(`${base}/${asset}`);
  if (!js.headers.get('content-type')?.includes('javascript')) throw new Error(`bad content-type for ${asset}`);
}

const containers: string[] = [];
try {
  containers.push(docker('run', '-d', '--rm', '-p', '127.0.0.1:18080:80', image));
  await check(18080, '');
  containers.push(docker('run', '-d', '--rm', '-p', '127.0.0.1:18081:80', image, 'node', '/app/server/serve.mjs', '--prefix', '/x/y'));
  await check(18081, '/x/y');
  const size = docker('image', 'inspect', image, '--format', '{{.Size}}');
  console.log(`docker smoke ok: /healthz, index, relative assets, prefix path; image ${(Number(size) / 1e6).toFixed(1)} MB`);
} finally {
  for (const c of containers) {
    try {
      docker('stop', '-t', '1', c);
    } catch {}
  }
}
