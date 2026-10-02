import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('fog hides the enemy until scouted; explored ground stays dimmed', async ({ page }, info) => {
  await openGame(page, 'scenario=demo&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const enemy = (await page.evaluate(() => window.__empires!.query.units(2)))[0]!;
  // Keep the enemy camp still (Stand Ground) so the scout isn't chased — this test is about fog, not fighting.
  const camp = (await page.evaluate(() => window.__empires!.query.units(2))).map((u) => u.h);
  await page.evaluate((ids) => window.__empires!.issue(2, { t: 'stance', ids, stand: true }), camp);
  // Clicking where an unseen enemy stands selects nothing.
  await page.evaluate((u) => window.__empires!.camera.centerOn(u.x, u.y), enemy);
  await page.evaluate(() => window.__empires!.step(1));
  await frames(page);
  const ep = (await page.evaluate((h) => window.__empires!.entityScreenPos(h), enemy.h))!;
  await page.mouse.click(ep.x, ep.y - 10);
  expect(await page.evaluate(() => window.__empires!.query.selection())).toEqual([]);

  // Send our scout next to the enemy base.
  const scout = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.type === 'scout')!;
  await page.evaluate((a) => window.__empires!.issue(1, { t: 'move', ids: [a.s], x: a.x - 3, y: a.y - 3 }), { s: scout.h, x: enemy.x, y: enemy.y });
  await page.evaluate(() => window.__empires!.step(500));
  await page.evaluate(() => window.__empires!.camera.centerOn(28, 27));
  await page.evaluate(() => window.__empires!.step(1));
  await frames(page);
  const ep2 = (await page.evaluate((h) => window.__empires!.entityScreenPos(h), enemy.h))!;
  await page.mouse.click(ep2.x, ep2.y - 10);
  expect(await page.evaluate(() => window.__empires!.query.selection())).toEqual([enemy.h]);
  await snap(page, info, 'fog-scouted');
  expect(pageErrors(page)).toEqual([]);
});

test('?fog=0 shows everything', async ({ page }) => {
  await openGame(page, 'scenario=demo&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const enemy = (await page.evaluate(() => window.__empires!.query.units(2)))[0]!;
  // Keep the enemy camp still (Stand Ground) so the scout isn't chased — this test is about fog, not fighting.
  const camp = (await page.evaluate(() => window.__empires!.query.units(2))).map((u) => u.h);
  await page.evaluate((ids) => window.__empires!.issue(2, { t: 'stance', ids, stand: true }), camp);
  await page.evaluate((u) => window.__empires!.camera.centerOn(u.x, u.y), enemy);
  await page.evaluate(() => window.__empires!.step(1));
  await frames(page);
  const ep = (await page.evaluate((h) => window.__empires!.entityScreenPos(h), enemy.h))!;
  await page.mouse.click(ep.x, ep.y - 10);
  expect(await page.evaluate(() => window.__empires!.query.selection())).toEqual([enemy.h]);
});
