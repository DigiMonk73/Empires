import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('village: economy buildings, farm stages, foundations rising', async ({ page }, info) => {
  await openGame(page, 'scenario=village&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const vs = (await page.evaluate(() => window.__empires!.query.units(1))).filter((u) => u.type === 'villager').map((u) => u.h);
  const tree = await page.evaluate(() => window.__empires!.query.resourceAt(22, 5));
  // Farmers on the two front farms, builders on the house and granary foundations, a woodcutter.
  const at = async (x: number, y: number) => page.evaluate(([px, py]) => window.__empires!.buildingAt(px!, py!), [x, y]);
  const [farmA, farmB, house, granary] = [await at(7, 22), await at(10, 22), await at(17, 22), await at(13, 24)];
  expect([farmA, farmB, house, granary].every((h) => h !== null)).toBe(true);
  await page.evaluate(
    ([v, fa, fb, ho, gr, t]) => {
      const api = window.__empires!;
      api.issue(1, { t: 'act', ids: [v![0]!], h: fa! });
      api.issue(1, { t: 'act', ids: [v![1]!], h: fb! });
      api.issue(1, { t: 'construct', ids: [v![2]!], h: ho! });
      api.issue(1, { t: 'gather', ids: [v![3]!], res: t! });
      api.issue(1, { t: 'construct', ids: [v![4]!], h: gr! });
    },
    [vs, farmA, farmB, house, granary, tree] as const,
  );
  await page.evaluate(() => window.__empires!.step(100));
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1);
    window.__empires!.camera.centerOn(16, 18);
  });
  await frames(page);
  await snap(page, info, 'village');
  // Farming works through the renderer too: the farmer shows the farm clip.
  const farmer = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.h === vs[0]);
  expect(farmer?.sprite ?? '').toMatch(/^(farm|carryFood|walk)\//);
  expect(pageErrors(page)).toEqual([]);
});

test('village through the ages: Tool mudbrick, Bronze stone and tile', async ({ page }, info) => {
  await openGame(page, 'scenario=village&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1);
    window.__empires!.camera.centerOn(16, 18);
  });
  await page.evaluate(() => window.__empires!.grantTech(1, 'toolAge'));
  await page.evaluate(() => window.__empires!.step(2));
  await frames(page);
  await snap(page, info, 'village-tool');
  await page.evaluate(() => window.__empires!.grantTech(1, 'bronzeAge'));
  await page.evaluate(() => window.__empires!.step(2));
  await frames(page);
  await snap(page, info, 'village-bronze');
  await expect(page.getByTestId('age')).toHaveText('Bronze Age');
  expect(pageErrors(page)).toEqual([]);
});

test('fort: walls join into lines, corners and a closed square at every level; the tower line', async ({ page }, info) => {
  await openGame(page, 'scenario=fort&fog=0&paused=1');
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1);
    window.__empires!.camera.centerOn(15, 13);
  });
  await frames(page);
  await snap(page, info, 'fort');
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(2);
    window.__empires!.camera.centerOn(7, 9);
  });
  await frames(page);
  await snap(page, info, 'fort-closeup');
  expect(pageErrors(page)).toEqual([]);
});

test('walls by mouse: Build → W, drag a line, villagers raise it segment by segment', async ({ page }, info) => {
  await openGame(page, 'scenario=fort&fog=0&paused=1');
  await page.evaluate(() => {
    const api = window.__empires!;
    api.grantTech(1, 'toolAge');
    api.grantTech(1, 'smallWall');
    api.camera.setZoom(1);
    api.camera.centerOn(10, 27);
  });
  await frames(page);
  const v = (await page.evaluate(() => window.__empires!.query.units(1)))[0]!;
  const at = (x: number, y: number) => page.evaluate(([a, b]) => window.__empires!.worldToScreen(a!, b!), [x, y] as const);
  const vp = (await page.evaluate((h) => window.__empires!.entityScreenPos(h), v.h))!;
  await page.mouse.click(vp.x, vp.y - 12);
  expect(await page.evaluate(() => window.__empires!.query.selection())).toEqual([v.h]);
  await page.keyboard.press('b');
  await page.keyboard.press('w');
  // Drag from tile (6, 29) to tile (14, 29): nine segments.
  const a = await at(6.5, 29.5);
  const b = await at(14.5, 29.5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await frames(page);
  await snap(page, info, 'wall-drag');
  await page.mouse.up();
  await page.evaluate(() => window.__empires!.step(1)); // orders apply on the next tick
  const sites = await page.evaluate(() => Array.from({ length: 9 }, (_, i) => window.__empires!.buildingAt(6 + i, 29)));
  expect(sites.every((h) => h !== null)).toBe(true);
  await page.evaluate(() => window.__empires!.step(20 * 110));
  await frames(page);
  await snap(page, info, 'wall-built');
  // Built: the villager moved on to the last segment and is done.
  const built = await page.evaluate(() => window.__empires!.query.units(1)[0]!.hasOrder);
  expect(built).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test('wonder: a standing Wonder and one rising from its site', async ({ page }, info) => {
  await openGame(page, 'scenario=wonder&fog=0&paused=1');
  await page.evaluate(() => {
    for (const t of ['toolAge', 'bronzeAge', 'ironAge']) window.__empires!.grantTech(1, t);
    window.__empires!.camera.setZoom(0.9);
    window.__empires!.camera.centerOn(12.5, 12.5);
  });
  await frames(page);
  await snap(page, info, 'wonder');
  expect(pageErrors(page)).toEqual([]);
});

test('repair: right-click a damaged house with a villager, and R then click for a second one', async ({ page }, info) => {
  await openGame(page, 'scenario=village&fog=0&paused=1');
  const houses = await page.evaluate(() => [window.__empires!.buildingAt(11, 11)!, window.__empires!.buildingAt(14, 10)!]);
  await page.evaluate((hs) => hs.forEach((h) => window.__empires!.setHp(h, 20)), houses);
  await page.evaluate(() => window.__empires!.camera.centerOn(14, 13));
  await frames(page);
  // The villager near the woodline at (21.6, 6.2): select it, right-click the first house.
  const v = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => Math.abs(u.x - 21.6) < 1 && Math.abs(u.y - 6.2) < 1)!;
  const vp = await page.evaluate((h) => window.__empires!.entityScreenPos(h), v.h);
  await page.mouse.click(vp!.x, vp!.y - 8);
  await expect(page.getByTestId('cmd-repair')).toBeVisible();
  const h1 = await page.evaluate(() => window.__empires!.worldToScreen(12, 12));
  await page.mouse.click(h1.x, h1.y - 10, { button: 'right' });
  await page.evaluate(() => window.__empires!.step(20 * 60)); // ~10 s walk + 55/75 × 20 s / 0.4 ≈ 37 s
  await frames(page);
  const hp1 = await page.evaluate((h) => window.__empires!.hpOf(h), houses[0]);
  expect(hp1).toBe(75);
  // Then R and a left-click on the second house.
  await page.keyboard.press('r');
  const h2 = await page.evaluate(() => window.__empires!.worldToScreen(15, 11));
  await page.mouse.click(h2.x, h2.y - 10);
  await page.evaluate(() => window.__empires!.step(20 * 8));
  await frames(page);
  await snap(page, info, 'repair');
  await page.evaluate(() => window.__empires!.step(20 * 40));
  expect(await page.evaluate((h) => window.__empires!.hpOf(h), houses[1])).toBe(75);
  expect(pageErrors(page)).toEqual([]);
});
