import { expect, test, type Page } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

async function villagers(page: Page) {
  return (await page.evaluate(() => window.__empires!.query.units(1))).filter((u) => u.type === 'villager');
}

async function boxSelectAll(page: Page, hs: number[]) {
  const pts = await Promise.all(hs.map((h) => page.evaluate((id) => window.__empires!.entityScreenPos(id), h)));
  const xs = pts.map((p) => p!.x);
  const ys = pts.map((p) => p!.y);
  await page.mouse.move(Math.min(...xs) - 25, Math.min(...ys) - 40);
  await page.mouse.down();
  await page.mouse.move(Math.max(...xs) + 25, Math.max(...ys) + 12, { steps: 6 });
  await page.mouse.up();
}

test('economy by mouse: build a house with B→E, gather berries by right-click, train 5 villagers', async ({ page }, info) => {
  await openGame(page, 'scenario=start&fog=0');
  await page.evaluate(() => window.__empires!.pause(true));
  let vs = await villagers(page);
  expect(vs.length).toBe(3);
  await expect(page.getByTestId('pop')).toHaveText('3/4');

  // Select all three, open the build menu (B) and pick House (E).
  await boxSelectAll(page, vs.map((v) => v.h));
  expect((await page.evaluate(() => window.__empires!.query.selection())).length).toBe(3);
  await page.keyboard.press('b');
  await expect(page.getByTestId('cmd-build:house')).toBeVisible();
  await page.keyboard.press('e');
  const spot = await page.evaluate(() => window.__empires!.worldToScreen(25, 22));
  await page.mouse.move(spot.x, spot.y, { steps: 3 });
  await frames(page);
  await snap(page, info, 'economy-placing-house');
  await page.mouse.click(spot.x, spot.y);
  await page.evaluate(() => window.__empires!.step(20));
  const wood = (await page.evaluate(() => window.__empires!.query.player(1))).res[1];
  expect(wood).toBe(170);
  // Three builders: (3+2)/3 → 12 s plus the walk.
  await page.evaluate(() => window.__empires!.step(20 * 20));
  await frames(page);
  await expect(page.getByTestId('pop')).toHaveText('3/8');

  // Build a Granary beside the berries (B → G), then right-click the bushes → forage.
  await page.keyboard.press('b');
  await page.keyboard.press('g');
  const gspot = await page.evaluate(() => window.__empires!.worldToScreen(15, 24.5));
  await page.mouse.move(gspot.x, gspot.y, { steps: 3 });
  await page.mouse.click(gspot.x, gspot.y);
  await page.evaluate(() => window.__empires!.step(20 * 35));
  const bush = await page.evaluate(() => window.__empires!.worldToScreen(11.5, 24.5));
  await page.mouse.click(bush.x, bush.y - 12, { button: 'right' });
  await page.evaluate(() => window.__empires!.step(20 * 70));
  const food = (await page.evaluate(() => window.__empires!.query.player(1))).res[0];
  expect(food).toBeGreaterThan(250);

  // Select the Town Center and queue 5 villagers with its hotkey (C).
  const tc = await page.evaluate(() => window.__empires!.worldToScreen(19.5, 19.5));
  await page.mouse.click(tc.x, tc.y - 20);
  await expect(page.getByTestId('cmd-train:villager')).toBeVisible();
  for (let i = 0; i < 5; i++) await page.keyboard.press('c');
  await page.evaluate(() => window.__empires!.step(2)); // commands apply on the next tick
  await frames(page);
  await page.waitForTimeout(150); // HUD syncs at 10 Hz
  await expect(page.getByTestId('queue').locator('.queue-item')).toHaveCount(5);
  await snap(page, info, 'economy-tc-queue');
  await page.evaluate(() => window.__empires!.step(20 * 20 * 5 + 40));
  vs = await villagers(page);
  expect(vs.length).toBe(8);
  await frames(page);
  await snap(page, info, 'economy-after');
  expect(pageErrors(page)).toEqual([]);
});
