import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('achievements mid-game: the timeline graphs every player, metric by metric, with age marks', async ({ page }, info) => {
  test.setTimeout(120_000);
  await openGame(page, 'scenario=skirmish&type=inland&size=tiny&seed=5&p=greek.1.human,egyptian.2.moderate&res=default&speed=1&paused=1');
  await page.evaluate(() => window.__empires!.autoplay('moderate'));
  for (let m = 0; m < 14; m++) {
    await page.evaluate(() => window.__empires!.step(1200));
    await frames(page);
  }
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-achievements').click();
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('game-menu')).toBeHidden(); // the achievements replace the menu (M15.6)
  await page.getByTestId('results-timeline').click();
  const graph = page.getByTestId('graph');
  await expect(graph).toHaveAttribute('data-metric', 'score');
  // 14 minutes: a sample every 30 s from 0:00 → 29 points per player.
  for (const p of [1, 2]) await expect(page.getByTestId(`graph-line-${p}`).locator('polyline.line')).toHaveAttribute('data-points', '29');
  await expect(page.locator('.age-mark')).not.toHaveCount(0); // both computers reach the Tool Age by 14:00
  await snap(page, info, 'results-timeline');
  await page.getByTestId('metric-pop').click();
  await expect(graph).toHaveAttribute('data-metric', 'pop');
  await page.getByTestId('results-summary').click();
  await expect(page.getByTestId('result-1')).toBeVisible();
  await page.getByTestId('close-results').click();
  await expect(page.getByTestId('game-menu')).toBeVisible(); // back to the menu, still paused
  expect(pageErrors(page)).toEqual([]);
});
