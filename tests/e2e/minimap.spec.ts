import { expect, test } from '@playwright/test';
import { openGame, pageErrors, snap } from './helpers.ts';

test('minimap: click moves the camera, right-click moves the selection', async ({ page }, info) => {
  await openGame(page, 'scenario=demo');
  await page.evaluate(() => window.__empires!.pause(true));
  await page.waitForTimeout(300); // let the minimap draw
  await snap(page, info, 'minimap-start');

  const target = await page.evaluate(() => window.__empires!.minimapPoint(38, 36));
  await page.mouse.click(target.x, target.y);
  // The camera now centers on ≈(38, 36): the screen center maps back near it.
  const vp = page.viewportSize()!;
  const c = await page.evaluate((v) => window.__empires!.screenToWorld(v.width / 2, v.height / 2), vp);
  expect(Math.hypot(c.x - 38, c.y - 36)).toBeLessThan(1.5);

  // Select a villager via the API-free path: box-select after jumping back home.
  const home = await page.evaluate(() => window.__empires!.minimapPoint(20, 19));
  await page.mouse.click(home.x, home.y);
  const vs = (await page.evaluate(() => window.__empires!.query.units(1))).filter((u) => u.type === 'villager');
  const p = (await page.evaluate((h) => window.__empires!.entityScreenPos(h), vs[0]!.h))!;
  await page.mouse.click(p.x, p.y - 10);
  const dest = await page.evaluate(() => window.__empires!.minimapPoint(10, 10));
  await page.mouse.click(dest.x, dest.y, { button: 'right' });
  await page.evaluate(() => window.__empires!.step(400));
  const moved = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.h === vs[0]!.h)!;
  expect(Math.hypot(moved.x - 10, moved.y - 10)).toBeLessThan(1.5);
  await page.waitForTimeout(300);
  await snap(page, info, 'minimap-after');
  expect(pageErrors(page)).toEqual([]);
});
