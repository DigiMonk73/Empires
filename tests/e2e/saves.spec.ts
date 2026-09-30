import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('save and load from the game menu: the same game, tick for tick; the main menu lists and deletes saves', async ({ page }, info) => {
  await openGame(page, 'scenario=skirmish&type=inland&size=tiny&seed=5&p=greek.1.human,persian.2.moderate&paused=1');
  // Three minutes in, with the computer's plans and memories under way.
  await page.evaluate(() => window.__empires!.step(20 * 60 * 3));
  const saved = await page.evaluate(() => ({ tick: window.__empires!.query.tick(), hash: window.__empires!.query.hash() }));
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-save').click();
  await expect(page.getByTestId('saves-save')).toBeVisible();
  await expect(page.getByTestId('save-name')).toHaveValue(/Inland · tiny — 03:00/);
  await page.getByTestId('save-name').fill('Before the storm');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-note')).toHaveText('Game saved.');
  await expect(page.getByTestId('save-row')).toHaveCount(1);
  await snap(page, info, 'saves-save');
  await page.getByTestId('saves-close').click();
  // The original plays on for a minute.
  await page.evaluate(() => window.__empires!.step(1200));
  const later = await page.evaluate(() => window.__empires!.query.hash());

  // Load it back (the page reloads into the saved game) and play the same minute.
  await page.getByTestId('menu-load').click();
  await page.getByTestId('save-row').filter({ hasText: 'Before the storm' }).click();
  await page.waitForURL(/load=/);
  await page.waitForFunction(() => !!window.__empires);
  await page.evaluate(() => window.__empires!.ready());
  expect(await page.evaluate(() => ({ tick: window.__empires!.query.tick(), hash: window.__empires!.query.hash() }))).toEqual(saved);
  await page.evaluate(() => window.__empires!.step(1200));
  expect(await page.evaluate(() => window.__empires!.query.hash())).toBe(later);
  await frames(page);

  // Quit to the main menu (which autosaves, M12.5): the save and the autosave are listed there; delete both.
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-quit').click();
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('menu-loadgame').click();
  await expect(page.getByTestId('save-row')).toHaveCount(2);
  const mine = page.getByTestId('save-row').filter({ hasText: 'Before the storm' });
  await expect(mine).toContainText('Stone Age');
  await expect(page.getByTestId('save-row').filter({ hasText: 'Autosave' })).toContainText('04:00');
  await mine.getByRole('button', { name: '✕' }).click();
  await expect(page.getByTestId('save-row')).toHaveCount(1);
  await page.getByTestId('save-row').getByRole('button', { name: '✕' }).click();
  await expect(page.getByTestId('save-row')).toHaveCount(0);
  await expect(page.getByText('No saved games yet.')).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
