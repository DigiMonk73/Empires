/**
 * Headless screenshot of a deployed Empires instance (e.g. the StartOS interface address), proving the game
 * boots and renders there. Usage: node tools/remote-shot.ts <url> [out.png] [chromium|webkit]
 */
import { chromium, webkit } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.argv[2];
const out = process.argv[3] ?? 'artifacts/remote/remote.png';
const engine = process.argv[4] === 'webkit' ? webkit : chromium;
if (!url) throw new Error('usage: node tools/remote-shot.ts <url> [out.png] [chromium|webkit]');
mkdirSync(dirname(out), { recursive: true });
const browser = await engine.launch({ headless: true, args: engine === chromium ? ['--use-angle=metal'] : [] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const sep = url.includes('?') ? '&' : '?';
  await page.goto(`${url}${sep}debug=1&edgeScroll=0`);
  await page.waitForFunction(() => !!(window as unknown as { __empires?: unknown }).__empires, null, { timeout: 30_000 });
  const stats = await page.evaluate(async () => {
    const api = (window as unknown as { __empires: { ready(): Promise<void>; renderStats(): unknown } }).__empires;
    await api.ready();
    return api.renderStats();
  });
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ url, out, stats, errors }));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
