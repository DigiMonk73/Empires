import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('raid: clubmen kill villagers (corpses) and raze a house (rubble)', async ({ page }, info) => {
  await openGame(page, 'scenario=raid&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const club = (await page.evaluate(() => window.__empires!.query.units(1))).filter((u) => u.type === 'clubman').map((u) => u.h);
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

test('volley: bowmen shoot arrows that arc to their target', async ({ page }, info) => {
  await openGame(page, 'scenario=raid&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const bows = (await page.evaluate(() => window.__empires!.query.units(1))).filter((u) => u.type === 'bowman').map((u) => u.h);
  const vills = (await page.evaluate(() => window.__empires!.query.units(2))).map((u) => u.h);
  await page.evaluate(([b, v]) => window.__empires!.issue(1, { t: 'act', ids: b!, h: v![3]! }), [bows, vills] as const);
  // Walk into range, then catch a volley in the air.
  let inFlight = 0;
  for (let i = 0; i < 400 && inFlight < 2; i++) {
    await page.evaluate(() => window.__empires!.step(1));
    inFlight = await page.evaluate(() => window.__empires!.query.projectiles());
  }
  expect(inFlight).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => window.__empires!.step(3));
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(2);
    window.__empires!.camera.centerOn(16.5, 19.5);
  });
  await frames(page);
  await snap(page, info, 'volley');
  expect(pageErrors(page)).toEqual([]);
});

test('raid base: stable, range, tower and mounted scouts', async ({ page }, info) => {
  await openGame(page, 'scenario=raid&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1.3);
    window.__empires!.camera.centerOn(7.5, 8.5);
  });
  await frames(page);
  await snap(page, info, 'raid-base');
  expect(pageErrors(page)).toEqual([]);
});

test('attack-move by mouse: box-select clubmen, A, click beyond the enemy camp', async ({ page }) => {
  await openGame(page, 'scenario=raid&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1);
    window.__empires!.camera.centerOn(13, 14);
  });
  await frames(page);
  const club = (await page.evaluate(() => window.__empires!.query.units(1))).filter((u) => u.type === 'clubman');
  const pts = await Promise.all(club.map((u) => page.evaluate((h) => window.__empires!.entityScreenPos(h)!, u.h)));
  const x0 = Math.min(...pts.map((p) => p.x)) - 20;
  const x1 = Math.max(...pts.map((p) => p.x)) + 20;
  const y0 = Math.min(...pts.map((p) => p.y)) - 45;
  const y1 = Math.max(...pts.map((p) => p.y)) + 10;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 5 });
  await page.mouse.up();
  await page.evaluate(() => window.__empires!.step(2));
  expect((await page.evaluate(() => window.__empires!.query.selection())).length).toBe(club.length);
  await page.keyboard.press('a');
  const dest = await page.evaluate(() => window.__empires!.worldToScreen(22.5, 20.5));
  await page.mouse.click(dest.x, dest.y);
  const before = (await page.evaluate(() => window.__empires!.query.units(2))).length;
  await page.evaluate(() => window.__empires!.step(20 * 40));
  const after = (await page.evaluate(() => window.__empires!.query.units(2))).length;
  expect(after).toBeLessThan(before); // they fought their way through the villagers
  expect(pageErrors(page)).toEqual([]);
});

test('battle: two armies clash (20v20 mid-fight)', async ({ page }, info) => {
  await openGame(page, 'scenario=battle&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const a = (await page.evaluate(() => window.__empires!.query.units(1))).map((u) => u.h);
  const b = (await page.evaluate(() => window.__empires!.query.units(2))).map((u) => u.h);
  await page.evaluate(
    ([x, y]) => {
      window.__empires!.issue(1, { t: 'move', ids: x!, x: 40.5, y: 24.5, am: true });
      window.__empires!.issue(2, { t: 'move', ids: y!, x: 7.5, y: 24.5, am: true });
    },
    [a, b] as const,
  );
  await page.evaluate(() => window.__empires!.step(20 * 22));
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1.25);
    window.__empires!.camera.centerOn(24, 24);
  });
  await frames(page);
  await snap(page, info, 'battle');
  expect(pageErrors(page)).toEqual([]);
});
