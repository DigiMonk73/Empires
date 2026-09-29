import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import type {} from '../../src/debug/api.ts'; // brings the window.__empires global type

export const SCREEN_DIR = 'artifacts/screens/current';

/** Open the game with test-friendly flags and wait for the debug API to report ready. */
export async function openGame(page: Page, query = ''): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`./?debug=1&edgeScroll=0${query ? '&' + query : ''}`);
  await page.waitForFunction(() => !!window.__empires, null, { timeout: 30_000 });
  await page.evaluate(() => window.__empires!.ready());
  (page as unknown as { __errors: string[] }).__errors = errors;
}

export function pageErrors(page: Page): string[] {
  return (page as unknown as { __errors?: string[] }).__errors ?? [];
}

/** Save a named screenshot under artifacts/screens/current/<project>/<name>.png for review and diffing. */
export async function snap(page: Page, info: TestInfo, name: string): Promise<string> {
  const file = join(SCREEN_DIR, info.project.name, `${name}.png`);
  mkdirSync(dirname(file), { recursive: true });
  await page.evaluate(() => window.__empires!.freezeRenderClock(0));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: file });
  return file;
}

/** Wait for two rendered frames (views, fog and picking update in the frame loop). */
export async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
