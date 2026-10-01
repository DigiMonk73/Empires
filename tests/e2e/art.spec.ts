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

/**
 * Bounded baked art (M15.4, D64): a model no sprite shows can be released, and comes back — as baked art, not a
 * placeholder — the next time a unit of it appears.
 */
test('released baked art loads again when a unit of it reappears', async ({ page }) => {
  await openGame(page, 'scenario=village');
  const barracks = await page.evaluate(() => window.__empires!.buildingAt(21, 19));
  expect(barracks).not.toBeNull();
  const trainClubman = async (): Promise<number> => {
    await page.evaluate((b) => {
      window.__empires!.issue(1, { t: 'train', bld: b, unit: 'clubman' });
      window.__empires!.step(700); // training takes 26 s
    }, barracks!);
    await frames(page);
    const c = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.type === 'clubman');
    expect(c, 'a clubman was trained').toBeTruthy();
    return c!.h;
  };
  const first = await trainClubman();
  expect((await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.h === first)?.sprite).not.toBeNull();
  const before = await page.evaluate(() => window.__empires!.artStats());
  // Gone, corpse and all (20 s, then a fade: well past both); then nothing shows a clubman and its model can go.
  await page.evaluate((h) => {
    window.__empires!.issue(1, { t: 'delete', ids: [h] });
    window.__empires!.step(700);
  }, first);
  await frames(page);
  expect(await page.evaluate(() => window.__empires!.artTrim(0))).toBeGreaterThanOrEqual(1);
  const after = await page.evaluate(() => window.__empires!.artStats());
  expect(after.evicted).toBeGreaterThan(before.evicted);
  expect(after.loaded).toBeLessThan(before.loaded);
  // A new clubman: the model loads again and the unit is drawn with it.
  const second = await trainClubman();
  await frames(page);
  expect((await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.h === second)?.sprite).not.toBeNull();
  expect(pageErrors(page)).toEqual([]);
});
