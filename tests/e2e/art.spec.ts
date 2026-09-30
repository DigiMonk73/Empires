import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('baked art close-up: villagers walking among trees and resources', async ({ page }, info) => {
  await openGame(page, 'scenario=demo&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const vs = (await page.evaluate(() => window.__empires!.query.units(1))).filter((u) => u.type === 'villager').map((u) => u.h);
  await page.evaluate((ids) => window.__empires!.issue(1, { t: 'move', ids, x: 14.5, y: 25.5 }), vs);
  await page.evaluate(() => window.__empires!.step(33));
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1.5);
    window.__empires!.camera.centerOn(16.5, 22);
  });
  await frames(page);
  await snap(page, info, 'art-closeup');
  expect(pageErrors(page)).toEqual([]);
});
