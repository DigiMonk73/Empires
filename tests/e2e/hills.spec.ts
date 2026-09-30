import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

/** M10.1b: the ground is drawn at its height — clicks on a hill select what stands there and send units there. */
test('hills: select a bowman on the crest, move him across the plateau, attack down the slope', async ({ page }, info) => {
  await openGame(page, 'scenario=hills&fog=0&paused=1');
  await page.evaluate(() => {
    window.__empires!.pause(true);
    window.__empires!.camera.centerOn(13, 14);
  });
  await frames(page);
  await snap(page, info, 'hills');
  const bow = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.type === 'bowman')!;
  const club = (await page.evaluate(() => window.__empires!.query.units(2)))[0]!;
  // Click the bowman where he is drawn (lifted by the hill), not where flat ground would put him.
  const at = (await page.evaluate((h) => window.__empires!.entityScreenPos(h), bow.h))!;
  const flat = await page.evaluate(([x, y]) => window.__empires!.worldToScreen(x!, y!, 0), [bow.x, bow.y]);
  expect(flat.y - at.y).toBeGreaterThan(20); // he stands well above his flat position
  await page.mouse.click(at.x, at.y - 12);
  await frames(page);
  expect(await page.evaluate(() => window.__empires!.query.selection())).toEqual([bow.h]);
  // Right-click a point on the plateau: the ground under the cursor is the hilltop, and he walks there.
  const target = await page.evaluate(() => window.__empires!.worldToScreen(10.5, 12.5));
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await page.evaluate(() => window.__empires!.step(20 * 6));
  const moved = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.h === bow.h)!;
  expect(Math.hypot(moved.x - 10.5, moved.y - 12.5)).toBeLessThan(1.2);
  // Right-click the clubman on the plain below: an attack order.
  const cp = (await page.evaluate((h) => window.__empires!.entityScreenPos(h), club.h))!;
  await page.mouse.click(cp.x, cp.y - 12, { button: 'right' });
  await page.evaluate(() => window.__empires!.step(2));
  const after = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.h === bow.h)!;
  expect(after.hasOrder).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
