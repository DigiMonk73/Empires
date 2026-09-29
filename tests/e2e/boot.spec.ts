import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openGame, pageErrors, snap } from './helpers.ts';

test('boots, renders WebGL2, and projects world coordinates', async ({ page }, info) => {
  await openGame(page);
  const stats = await page.evaluate(() => window.__empires!.renderStats());
  mkdirSync('artifacts/e2e', { recursive: true });
  writeFileSync(`artifacts/e2e/renderer-${info.project.name}.json`, JSON.stringify(stats, null, 2));
  expect(stats.backend).toBe('webgl');
  // screen ↔ world round trip
  const p = await page.evaluate(() => window.__empires!.worldToScreen(20.25, 17.5));
  const w = await page.evaluate((q) => window.__empires!.screenToWorld(q.x, q.y), p);
  expect(w.x).toBeCloseTo(20.25, 5);
  expect(w.y).toBeCloseTo(17.5, 5);
  expect(pageErrors(page)).toEqual([]);
});

test('arrow keys scroll the camera', async ({ page }) => {
  await openGame(page);
  const before = await page.evaluate(() => window.__empires!.camera.get());
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  const after = await page.evaluate(() => window.__empires!.camera.get());
  expect(after.x).toBeGreaterThan(before.x + 50);
});
