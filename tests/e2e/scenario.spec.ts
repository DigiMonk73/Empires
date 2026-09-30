import { expect, test } from '@playwright/test';
import { openGame, pageErrors, snap } from './helpers.ts';

test('demo scenario renders the sim and units move on command', async ({ page }, info) => {
  await openGame(page, 'scenario=demo&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  await snap(page, info, 'demo-start');
  const units = await page.evaluate(() => window.__empires!.query.units(1));
  expect(units.length).toBeGreaterThan(10);
  const villagers = units.filter((u) => u.type === 'villager').map((u) => u.h);
  await page.evaluate((ids) => window.__empires!.issue(1, { t: 'move', ids, x: 26.5, y: 22.5 }), villagers);
  await page.evaluate(() => window.__empires!.step(120));
  const after = await page.evaluate(() => window.__empires!.query.units(1));
  const moved = after.filter((u) => villagers.includes(u.h));
  for (const v of moved) expect(Math.hypot(v.x - 26.5, v.y - 22.5)).toBeLessThan(4);
  await snap(page, info, 'demo-moved');
  await page.evaluate(() => {
    window.__empires!.camera.centerOn(26, 34);
    window.__empires!.camera.setZoom(0.6);
  });
  await snap(page, info, 'demo-lake-forest');
  const stats = await page.evaluate(() => window.__empires!.renderStats());
  expect(stats.terrainDrawCalls).toBeLessThanOrEqual(30);
  expect(pageErrors(page)).toEqual([]);
});
