/**
 * Art gallery screenshots (M9): serves dist/, opens `?scenario=gallery` headless (Chromium) for each civ and
 * age, and writes artifacts/gallery/<civ>-a<age>-<view>.png. Build first (`npx vite build`).
 *   node tools/gallery.ts [civs=greek] [ages=1,2,3,4]
 * e.g. node tools/gallery.ts greek,egyptian 3
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const civs = (process.argv[2] ?? 'greek').split(',');
const ages = (process.argv[3] ?? '1,2,3,4').split(',').map(Number);
const OUT = 'artifacts/gallery';
const PORT = 4190;
const AGE_TECHS = ['toolAge', 'bronzeAge', 'ironAge'];
/** Camera centres (tiles): town row, second row, wonder + towers, animals, dock. */
const VIEWS: [string, number, number][] = [
  ['town-w', 9, 5],
  ['town-e', 25, 5],
  ['mil-w', 9, 11],
  ['mil-e', 24, 11],
  ['wonder', 11, 18],
  ['walls', 26, 17],
  ['animals', 9, 24],
  ['dock', 34, 5],
];

mkdirSync(OUT, { recursive: true });
const server = spawn('node', ['server/serve.mjs', '--dir', 'dist', '--port', String(PORT), '--host', '127.0.0.1'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(`http://127.0.0.1:${PORT}/healthz`).then((r) => r.ok).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  for (const civ of civs) {
    for (const age of ages) {
      await page.goto(`http://127.0.0.1:${PORT}/?scenario=gallery&civ=${civ}&fog=0&paused=1&edgeScroll=0`);
      await page.waitForFunction(() => !!window.__empires, null, { timeout: 60_000 });
      await page.evaluate(async (techs) => {
        const e = window.__empires!;
        await e.ready();
        for (const t of techs) e.grantTech(1, t);
        e.step(1);
        e.freezeRenderClock(0);
      }, AGE_TECHS.slice(0, age - 1));
      await page.addStyleTag({ content: '#hud { display: none !important; }' });
      for (const [name, x, y] of VIEWS) {
        await page.evaluate(async ([cx, cy]) => {
          window.__empires!.camera.centerOn(cx!, cy!);
          await window.__empires!.settle();
        }, [x, y]);
        await page.screenshot({ path: `${OUT}/${civ}-a${age}-${name}.png` });
      }
      console.log(`${civ} age ${age}: ${VIEWS.length} views`);
    }
  }
  await browser.close();
  if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  server.kill();
}
