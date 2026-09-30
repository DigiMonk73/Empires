import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('raid: clubmen kill villagers (corpses) and raze a house (rubble)', async ({ page }, info) => {
  await openGame(page, 'scenario=raid&fog=0');
  await page.evaluate(() => window.__empires!.pause(true));
  const club = (await page.evaluate(() => window.__empires!.query.units(1))).map((u) => u.h);
  const vills = (await page.evaluate(() => window.__empires!.query.units(2))).map((u) => u.h);
  const house = await page.evaluate(() => window.__empires!.buildingAt(15, 15));
  expect(house).not.toBeNull();
  // Three clubmen per villager pair, the rest on the house.
  await page.evaluate(
    ([c, v, h]) => {
      const api = window.__empires!;
      api.issue(1, { t: 'act', ids: [c![0]!, c![1]!], h: v![0]! });
      api.issue(1, { t: 'act', ids: [c![2]!], h: v![1]! });
      api.issue(1, { t: 'act', ids: [c![3]!, c![4]!, c![5]!], h: h! });
    },
    [club, vills, house] as const,
  );
  await page.evaluate(() => window.__empires!.step(20 * 25));
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1.6);
    window.__empires!.camera.centerOn(16, 16.5);
  });
  await frames(page);
  await snap(page, info, 'raid-corpses');
  await page.evaluate(() => window.__empires!.step(20 * 50));
  const alive = (await page.evaluate(() => window.__empires!.query.units(2))).map((u) => u.h);
  expect(alive).not.toContain(vills[0]);
  expect(alive).not.toContain(vills[1]);
  expect(await page.evaluate(() => window.__empires!.buildingAt(15, 15))).toBeNull();
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1.4);
    window.__empires!.camera.centerOn(16, 16);
  });
  await frames(page);
  await snap(page, info, 'raid');
  expect(pageErrors(page)).toEqual([]);
});
