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
