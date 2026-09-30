import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('a battle to the end: game-over banner, then the results table', async ({ page }, info) => {
  await openGame(page, 'scenario=battle&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const a = (await page.evaluate(() => window.__empires!.query.units(1))).map((u) => u.h);
  const b = (await page.evaluate(() => window.__empires!.query.units(2))).map((u) => u.h);
  await page.evaluate(
    ([x, y]) => {
      window.__empires!.issue(1, { t: 'move', ids: x!, x: 40.5, y: 24.5, am: true });
      window.__empires!.issue(2, { t: 'move', ids: y!, x: 7.5, y: 24.5, am: true });
    },
    [a, b] as const,
  );
  // Survivors re-issue their attack-move every 10 s like the benchmark does.
  for (let t = 0; t < 12 && !(await page.getByTestId('gameover').isVisible()); t++) {
    await page.evaluate(() => window.__empires!.step(200));
    await page.evaluate(() => {
      for (const p of [1, 2]) {
        const ids = window.__empires!.query.units(p).map((u) => u.h);
        if (ids.length) window.__empires!.issue(p, { t: 'move', ids, x: p === 1 ? 40.5 : 7.5, y: 24.5, am: true });
      }
    });
    await frames(page);
  }
  await expect(page.getByTestId('gameover')).toBeVisible();
  await expect(page.locator('.gameover-title')).toHaveText(/Victory|Defeat/);
  await snap(page, info, 'gameover');
  await page.getByTestId('show-results').click();
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.locator('.results-panel tbody').first().locator('tr')).toHaveCount(2);
  await snap(page, info, 'results');
  await page.getByTestId('close-results').click();
  await expect(page.getByTestId('results')).toBeHidden();
  expect(pageErrors(page)).toEqual([]);
});
