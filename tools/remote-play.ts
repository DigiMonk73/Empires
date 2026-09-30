/**
 * Real play against a deployed Empires (e.g. the StartOS interface address), headless: main menu → skirmish vs
 * Easiest (seed 101, the local player autoplayed by Hardest) → save at 5:00 → load it back (same tick and hash)
 * → play on to victory → results. Proves the served build boots, plays, saves in that origin's IndexedDB,
 * and finishes a game. Usage: node tools/remote-play.ts <url> [chromium|webkit]
 */
import { chromium, webkit, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2]?.replace(/\/?$/, '/');
const engine = process.argv[3] === 'webkit' ? webkit : chromium;
if (!base) throw new Error('usage: node tools/remote-play.ts <url> [chromium|webkit]');
const OUT = 'artifacts/remote';
mkdirSync(OUT, { recursive: true });

type Api = {
  ready(): Promise<void>;
  autoplay(level: string): void;
  step(n: number): void;
  query: { tick(): number; hash(): number };
};
const api = <T>(page: Page, fn: (a: Api) => T | Promise<T>): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__empires)`) as Promise<T>;
const booted = async (page: Page) => {
  await page.waitForFunction(() => !!(window as unknown as { __empires?: unknown }).__empires, null, { timeout: 60_000 });
  await api(page, (a) => a.ready());
};

const log: string[] = [];
const step = (s: string) => {
  log.push(s);
  console.log(`✓ ${s}`);
};
const browser = await engine.launch({ headless: true, args: engine === chromium ? ['--use-angle=metal'] : [] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}?edgeScroll=0&paused=1`);
  await page.getByTestId('main-menu').waitFor({ timeout: 60_000 });
  step('main menu');
  await page.getByTestId('menu-skirmish').click();
  await page.getByTestId('setup-type').selectOption('inland');
  await page.getByTestId('setup-size').selectOption('tiny');
  await page.getByTestId('setup-seed').fill('101');
  await page.getByTestId('setup-player-2').locator('select').first().selectOption('easiest');
  await page.getByTestId('setup-start').click();
  await page.waitForURL(/scenario=skirmish/);
  await booted(page);
  await api(page, (a) => a.autoplay('hardest'));
  await api(page, (a) => a.step(6000));
  step('skirmish started, 5:00 played');
  const saved = await api(page, (a) => ({ tick: a.query.tick(), hash: a.query.hash() }));
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-save').click();
  await page.getByTestId('save-name').fill('StartOS check');
  await page.getByTestId('save-confirm').click();
  await page.getByText('Game saved.').waitFor();
  step('saved (IndexedDB on this origin)');
  await page.getByTestId('saves-close').click();
  await page.getByTestId('menu-load').click();
  await page.getByTestId('save-row').filter({ hasText: 'StartOS check' }).click();
  await page.waitForURL(/load=/);
  await booted(page);
  const loaded = await api(page, (a) => ({ tick: a.query.tick(), hash: a.query.hash() }));
  if (loaded.tick !== saved.tick || loaded.hash !== saved.hash) throw new Error(`loaded ${JSON.stringify(loaded)} ≠ saved ${JSON.stringify(saved)}`);
  step(`loaded: tick ${loaded.tick}, hash matches`);
  await api(page, (a) => a.autoplay('hardest'));
  for (let m = 0; m < 60 && !(await page.locator('.gameover-title').isVisible()); m++) await api(page, (a) => a.step(1200));
  const title = await page.locator('.gameover-title').textContent();
  await page.screenshot({ path: `${OUT}/remote-victory.png` });
  step(`game over: ${title}`);
  await page.getByTestId('show-results').click();
  await page.screenshot({ path: `${OUT}/remote-results.png` });
  step('results shown');
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ base, engine: engine.name(), ok: title === 'Victory', steps: log }));
  if (title !== 'Victory') process.exitCode = 1;
} finally {
  await browser.close();
}
