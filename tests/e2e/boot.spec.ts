import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openGame, pageErrors, snap } from './helpers.ts';

test('boots, renders WebGL2, and projects world coordinates', async ({ page }, info) => {
  await openGame(page);
  const stats = await page.evaluate(() => window.__empires!.renderStats());
  mkdirSync('artifacts/e2e', { recursive: true });
  writeFileSync(`artifacts/e2e/renderer-${info.project.name}.json`, JSON.stringify(stats, null, 2));
  console.log(`[${info.project.name}] renderer:`, stats.backend, '|', stats.glRenderer, '|', stats.glVendor);
  expect(stats.backend).toBe('webgl');

  // Center of the map should be at the center of the viewport.
  const p = await page.evaluate(() => window.__empires!.worldToScreen(16, 16));
  expect(Math.abs(p.x - 640)).toBeLessThan(1);
  expect(Math.abs(p.y - 400)).toBeLessThan(1);
  const w = await page.evaluate(() => window.__empires!.screenToWorld(640, 400));
  expect(w.x).toBeCloseTo(16, 5);
  expect(w.y).toBeCloseTo(16, 5);

  await snap(page, info, 'boot-grid');
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
