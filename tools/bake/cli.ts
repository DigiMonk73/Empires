/**
 * Bakes code-built models into sprite atlases (public/baked/<id>-<page>.webp + <id>.json + manifest.json) using
 * headless Chromium on the Mac GPU (ANGLE Metal). Incremental: a model is rebaked only when the art sources
 * or the baker version changed. Lossless PNG copies of the pages go to artifacts/bake/pages/ (review tools,
 * calibration) and contact sheets to artifacts/bake/contact-<id>.png. Files no model uses are removed.
 *   node tools/bake/cli.ts [--only a,b] [--force]
 */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
mkdirSync(join(ART, 'pages'), { recursive: true });
const PNG_DIR = join(ART, 'pages');
const manifestPath = join(OUT, 'manifest.json');
const manifest: { models: Record<string, { hash: string; pages: string[]; json: string }> } = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { models: {} };

const server = await createServer({ logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls!.local[0]!;
// Metal on a Mac. SwiftShader in Docker and on the Linux test runner, which have no Metal GPU.
const software = process.argv.includes('--software') || process.platform !== 'darwin';
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
    const pngOf = (p: string) => join(PNG_DIR, p.replace(/\.webp$/, '.png'));
    if (!force && prev?.hash === sourceHash && prev.pages.every((p) => existsSync(join(OUT, p)) && existsSync(pngOf(p)))) continue;
    const r = await page.evaluate((m) => window.__bake!.bake(m), id);
    r.pages.forEach((d: string, i: number) => writeFileSync(join(OUT, r.meta.pages[i]!), Buffer.from(d.split(',')[1]!, 'base64')));
    r.pngs.forEach((d: string, i: number) => writeFileSync(pngOf(r.meta.pages[i]!), Buffer.from(d.split(',')[1]!, 'base64')));
    writeFileSync(join(OUT, `${id}.json`), JSON.stringify(r.meta));
    writeFileSync(join(ART, `contact-${id}.png`), Buffer.from(r.contact.split(',')[1]!, 'base64'));
    manifest.models[id] = { hash: sourceHash, pages: r.meta.pages, json: `${id}.json` };
    baked++;
    console.log(`baked ${id}: ${Object.keys(r.meta.frames).length} frames, ${r.meta.pages.length} page(s), ${r.ms.toFixed(0)} ms (${r.renderer})`);
  }
  // Drop models that no longer exist and files no model uses (e.g. the PNG pages before KI-6).
  for (const id of Object.keys(manifest.models)) if (!ids.includes(id)) delete manifest.models[id];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  // Every model's metadata in one file, so the game boots with one request instead of one per model (M9.9).
  const metas: Record<string, unknown> = {};
  for (const [id, m] of Object.entries(manifest.models)) metas[id] = JSON.parse(readFileSync(join(OUT, m.json), 'utf8'));
  writeFileSync(join(OUT, 'metas.json'), JSON.stringify(metas));
  const keep = new Set(['manifest.json', 'metas.json', ...Object.values(manifest.models).flatMap((m) => [m.json, ...m.pages])]);
  let bytes = 0;
  for (const f of readdirSync(OUT)) {
    if (!keep.has(f)) rmSync(join(OUT, f));
    else bytes += statSync(join(OUT, f)).size;
  }
  // Decoded on the GPU (RGBA8): what the art costs in video memory if all of it were resident (KI-12).
  const gpu = Object.values(metas as Record<string, { pageSizes?: { w: number; h: number }[] }>).reduce((n, m) => n + (m.pageSizes ?? []).reduce((k, p) => k + p.w * p.h * 4, 0), 0);
  console.log(`bake: ${baked} model(s) baked, ${ids.length - baked} up to date, ${((Date.now() - t0) / 1000).toFixed(1)} s · public/baked ${(bytes / 1e6).toFixed(1)} MB (GPU ${(gpu / 2 ** 20).toFixed(0)} MB)`);
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
