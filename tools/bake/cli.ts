/**
 * Bakes code-built models into sprite atlases (public/baked/<id>-<page>.png + <id>.json + manifest.json) using
 * headless Chromium on the Mac GPU (ANGLE Metal). Incremental: a model is rebaked only when the art sources
 * or the baker version changed. Contact sheets for review go to artifacts/bake/contact-<id>.png.
 *   node tools/bake/cli.ts [--only a,b] [--force]
 */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import type {} from '../../src/art/bake/entry.ts';

const OUT = 'public/baked';
const ART = 'artifacts/bake';
const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1]!.split(',')) : null;
const force = process.argv.includes('--force');

function hashDir(dir: string, h = createHash('sha256')): ReturnType<typeof createHash> {
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) hashDir(p, h);
    else h.update(p).update(readFileSync(p));
  }
  return h;
}

const sourceHash = hashDir('src/art').digest('hex').slice(0, 16);
mkdirSync(OUT, { recursive: true });
mkdirSync(ART, { recursive: true });
const manifestPath = join(OUT, 'manifest.json');
const manifest: { models: Record<string, { hash: string; pages: string[]; json: string }> } = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { models: {} };

const server = await createServer({ logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls!.local[0]!;
const software = process.argv.includes('--software');
const browser = await chromium.launch({
  headless: true,
  args: software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failed = false;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[bake page]', e));
  await page.goto(`${url}bake.html`);
  await page.waitForFunction(() => !!window.__bake, null, { timeout: 60_000 });
  const ids: string[] = await page.evaluate(() => window.__bake!.list());
  const t0 = Date.now();
  let baked = 0;
  for (const id of ids) {
    if (only && !only.has(id)) continue;
    const prev = manifest.models[id];
    if (!force && prev?.hash === sourceHash && prev.pages.every((p) => existsSync(join(OUT, p)))) continue;
    const r = await page.evaluate((m) => window.__bake!.bake(m), id);
    r.pages.forEach((d: string, i: number) => writeFileSync(join(OUT, r.meta.pages[i]!), Buffer.from(d.split(',')[1]!, 'base64')));
    writeFileSync(join(OUT, `${id}.json`), JSON.stringify(r.meta));
    writeFileSync(join(ART, `contact-${id}.png`), Buffer.from(r.contact.split(',')[1]!, 'base64'));
    manifest.models[id] = { hash: sourceHash, pages: r.meta.pages, json: `${id}.json` };
    baked++;
    console.log(`baked ${id}: ${Object.keys(r.meta.frames).length} frames, ${r.meta.pages.length} page(s), ${r.ms.toFixed(0)} ms (${r.renderer})`);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`bake: ${baked} model(s) baked, ${ids.length - baked} up to date, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
