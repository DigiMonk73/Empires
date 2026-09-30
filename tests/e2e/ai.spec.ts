import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('a Moderate computer player builds up its base (8 game minutes)', async ({ page }, info) => {
  test.setTimeout(90_000);
  await openGame(page, 'scenario=skirmish&type=continental&size=tiny&seed=4&p=greek.1.human,egyptian.2.moderate&fog=0');
  await page.evaluate(() => window.__empires!.pause(true));
  for (let m = 0; m < 8; m++) await page.evaluate(() => window.__empires!.step(1200));
  const units = await page.evaluate(() => window.__empires!.query.units(2));
  expect(units.filter((u) => u.type === 'villager').length).toBeGreaterThanOrEqual(15);
  const tc = units.length ? await page.evaluate(() => {
    // Centre on the computer's villagers.
    const us = window.__empires!.query.units(2);
    const x = us.reduce((a, u) => a + u.x, 0) / us.length;
    const y = us.reduce((a, u) => a + u.y, 0) / us.length;
    window.__empires!.camera.centerOn(x, y);
    window.__empires!.camera.setZoom(0.8);
    return [x, y];
  }) : null;
  expect(tc).not.toBeNull();
  await frames(page);
  await snap(page, info, 'ai-base');
  expect(pageErrors(page)).toEqual([]);
});
