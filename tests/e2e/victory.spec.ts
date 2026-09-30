import { expect, test } from '@playwright/test';
import { frames, pageErrors, snap } from './helpers.ts';

/**
 * The whole loop a player goes through, by real clicks: main menu → skirmish setup → a game against the Easiest
 * computer → victory → results. The local player is handed to a Hardest computer (`autoplay`) so the test can
 * win; seed 101 is one of the AI ladder's regression seeds (Hardest conquers Easiest at ~35:20 there).
 */
test('main menu → skirmish vs Easiest → conquest victory → results', async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.goto('./?edgeScroll=0&paused=1');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('menu-skirmish').click();
  await page.getByTestId('setup-type').selectOption('inland');
  await page.getByTestId('setup-size').selectOption('tiny');
  await page.getByTestId('setup-seed').fill('101');
  await page.getByTestId('setup-player-2').locator('select').first().selectOption('easiest');
  await page.getByTestId('setup-start').click();
  await page.waitForURL(/scenario=skirmish.*seed=101/);
  await page.waitForFunction(() => !!window.__empires);
  await page.evaluate(() => window.__empires!.ready());
  expect(await page.evaluate(() => window.__empires!.query.tick())).toBe(0);
  await page.evaluate(() => window.__empires!.autoplay('hardest'));
  // Up to an hour of game time, a minute per step, until the game is over.
  for (let m = 0; m < 60 && !(await page.locator('.gameover-title').isVisible()); m++) {
    await page.evaluate(() => window.__empires!.step(1200));
    await frames(page);
  }
  await expect(page.locator('.gameover-title')).toHaveText('Victory');
  await snap(page, info, 'victory');
  await page.getByTestId('show-results').click();
  await expect(page.getByTestId('result-1')).toHaveClass(/winner/);
  await snap(page, info, 'victory-results');
  expect(pageErrors(page)).toEqual([]);
});
