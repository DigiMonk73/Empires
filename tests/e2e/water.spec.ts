import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('fishing: train a boat at the Dock, right-click deep fish, food comes back to the Dock', async ({ page }, info) => {
  await openGame(page, 'scenario=harbor&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.camera.centerOn(18, 17)); // Dock, boats and the school above the HUD
  await frames(page);
  const dock = await page.evaluate(() => window.__empires!.worldToScreen(15.5, 15.5));
  await page.mouse.click(dock.x, dock.y - 10);
  await page.getByTestId('cmd-train:fishingBoat').click();
  await page.evaluate(() => window.__empires!.step(20 * 30)); // 40 s at the Dock's ×1.5
  await frames(page); // the new boat's sprite exists before we click it
  const boats = await page.evaluate(() => window.__empires!.query.units(1).filter((u) => u.type === 'fishingBoat'));
  expect(boats.length).toBe(2);
  const fresh = boats.reduce((a, b) => (b.h > a.h ? b : a));
  const at = await page.evaluate(([x, y]) => window.__empires!.worldToScreen(x, y), [fresh.x, fresh.y] as const);
  await page.mouse.click(at.x, at.y - 6);
  await frames(page);
  const fish = await page.evaluate(() => window.__empires!.worldToScreen(22, 20)); // the middle of the 2×2 school
  await page.mouse.click(fish.x, fish.y, { button: 'right' });
  await page.evaluate(() => window.__empires!.step(2));
  const sent = await page.evaluate((h) => window.__empires!.query.units(1).find((u) => u.h === h), fresh.h);
  expect(sent?.hasOrder).toBe(true);
  const food0 = (await page.evaluate(() => window.__empires!.query.player(1))).res[0]!;
  await page.evaluate(() => window.__empires!.step(20 * 70));
  const food = (await page.evaluate(() => window.__empires!.query.player(1))).res[0]!;
  expect(food - food0).toBeGreaterThan(14.99); // at least one load of 15
  await frames(page);
  await snap(page, info, 'harbor-fishing');
  expect(pageErrors(page)).toEqual([]);
});

test('the Dock trains by hotkey (G: Scout Ship), twice as fast in the Bronze Age', async ({ page }) => {
  await openGame(page, 'scenario=harbor&fog=0&paused=1');
  await page.evaluate(() => {
    window.__empires!.grantTech(1, 'toolAge');
    window.__empires!.grantTech(1, 'bronzeAge');
  });
  await page.evaluate(() => window.__empires!.camera.centerOn(18, 15));
  await frames(page);
  const dock = await page.evaluate(() => window.__empires!.worldToScreen(15.5, 15.5));
  await page.mouse.click(dock.x, dock.y - 10);
  await expect(page.getByTestId('cmd-train:scoutShip')).toBeVisible();
  await page.keyboard.press('g');
  await page.evaluate(() => window.__empires!.step(20 * 31)); // 60 s × 1/2
  const ships = await page.evaluate(() => window.__empires!.query.units(1).filter((u) => u.type === 'scoutShip'));
  expect(ships.length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test('sea battle: select a War Galley, right-click an enemy Scout Ship, it sinks', async ({ page }, info) => {
  await openGame(page, 'scenario=harbor&battle=1&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.camera.centerOn(23, 11));
  await frames(page);
  const units = await page.evaluate(() => window.__empires!.query.units());
  const galley = units.find((u) => u.type === 'warGalley')!;
  const enemy = units.find((u) => u.type === 'scoutShip' && u.owner === 2)!;
  const g = await page.evaluate((h) => window.__empires!.entityScreenPos(h), galley.h);
  await page.mouse.click(g!.x, g!.y - 6);
  const s = await page.evaluate((h) => window.__empires!.entityScreenPos(h), enemy.h);
  await page.mouse.click(s!.x, s!.y - 6, { button: 'right' });
  await page.evaluate(() => window.__empires!.step(20 * 6));
  await frames(page);
  await snap(page, info, 'harbor-battle');
  await page.evaluate(() => window.__empires!.step(20 * 40));
  const left = await page.evaluate(() => window.__empires!.query.units(2).filter((u) => u.type === 'scoutShip'));
  expect(left.length).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
