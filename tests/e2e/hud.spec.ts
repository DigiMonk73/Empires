import { expect, test } from '@playwright/test';
import { openGame, pageErrors, snap } from './helpers.ts';

test('HUD shows stockpile, population, clock, and the selection', async ({ page }, info) => {
  await openGame(page, 'scenario=demo&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  await expect(page.getByTestId('res-food')).toHaveText('200');
  await expect(page.getByTestId('res-wood')).toHaveText('200');
  await expect(page.getByTestId('res-gold')).toHaveText('0');
  await expect(page.getByTestId('res-stone')).toHaveText('150');
  await expect(page.getByTestId('pop')).toHaveText('14/12'); // 8 villagers + 6 soldiers; TC + 2 houses
  await expect(page.getByTestId('age')).toHaveText('Stone Age');
  await page.evaluate(() => window.__empires!.step(20 * 65));
  await expect(page.getByTestId('clock')).toHaveText('01:05');

  // Select one villager by clicking it → single-unit panel.
  const v = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.type === 'villager')!;
  const p = (await page.evaluate((h) => window.__empires!.entityScreenPos(h), v.h))!;
  await page.mouse.click(p.x, p.y - 10);
  await expect(page.getByTestId('sel-single')).toContainText('Villager');
  await expect(page.getByTestId('sel-single')).toContainText('25 / 25');
  await snap(page, info, 'hud-single');

  // The HUD panel swallows clicks: clicking on it must not clear the selection.
  const panel = await page.getByTestId('cmd-grid').boundingBox();
  await page.mouse.click(panel!.x + panel!.width / 2, panel!.y + panel!.height / 2);
  expect((await page.evaluate(() => window.__empires!.query.selection())).length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
