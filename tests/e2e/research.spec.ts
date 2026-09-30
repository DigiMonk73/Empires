import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('research by mouse: select the Town Center, advance to the Tool Age', async ({ page }, info) => {
  await openGame(page, 'scenario=village&fog=0');
  await page.evaluate(() => window.__empires!.pause(true));
  const tc = await page.evaluate(() => window.__empires!.buildingAt(15, 15));
  await page.evaluate(() => window.__empires!.camera.centerOn(15.5, 15.5));
  await frames(page);
  const pos = await page.evaluate((h) => window.__empires!.entityScreenPos(h!), tc);
  await page.mouse.click(pos!.x, pos!.y - 20);
  await frames(page);
  await page.evaluate(() => window.__empires!.step(2));
  await expect(page.getByTestId('cmd-research:toolAge')).toBeEnabled();
  await page.getByTestId('cmd-research:toolAge').click();
  await page.evaluate(() => window.__empires!.step(20 * 30));
  await expect(page.getByTestId('queue').locator('.queue-item')).toHaveCount(1);
  await snap(page, info, 'research-queued');
  await page.evaluate(() => window.__empires!.step(20 * 92));
  await expect(page.getByTestId('age')).toHaveText('Tool Age');
  expect(pageErrors(page)).toEqual([]);
});
