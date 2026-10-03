import { expect, test } from '@playwright/test';
import { openGame, pageErrors, snap } from './helpers.ts';

test('main menu Help (how to play, keys) and Credits', async ({ page }, info) => {
  await page.goto('./?edgeScroll=0');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('menu-help').click();
  await expect(page.getByTestId('help')).toContainText('The goal');
  await expect(page.getByTestId('help')).toContainText('Storage Pit');
  await snap(page, info, 'help');
  await page.getByTestId('help-keys').click();
  await expect(page.getByTestId('keys-classic')).toContainText('House');
  await page.getByTestId('help-back').click();
  await page.getByTestId('menu-credits').click();
  await expect(page.getByTestId('credits')).toContainText('SIL Open Font License');
  await snap(page, info, 'credits');
  await page.getByTestId('credits-back').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  // The bundled fonts load (not a system fallback).
  expect(await page.evaluate(() => document.fonts.check('16px Cinzel') && document.fonts.check('16px Alegreya'))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test('in game: score list (F4 and the S button), F11 time line, F3 pause', async ({ page }, info) => {
  await openGame(page, 'scenario=diplomacy');
  await page.keyboard.press('F4');
  await expect(page.getByTestId('score-1')).toContainText('You');
  await expect(page.getByTestId('score-3')).toContainText('Player 3');
  await page.keyboard.press('F11');
  await expect(page.getByTestId('time-line')).toContainText('1.0×');
  await expect(page.getByTestId('time-line')).toContainText('Pop 5/');
  await page.keyboard.press('+');
  await expect(page.getByTestId('time-line')).toContainText('1.5×');
  await page.keyboard.press('-');
  await expect(page.getByTestId('time-line')).toContainText('1.0×');
  await page.keyboard.press('F3');
  await expect(page.getByTestId('paused')).toBeVisible();
  const t = await page.evaluate(() => window.__empires!.query.tick());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__empires!.query.tick())).toBe(t); // really paused
  await page.keyboard.press('F3');
  await expect(page.getByTestId('paused')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__empires!.query.tick())).toBeGreaterThan(t);
  await page.getByTestId('score-btn').click();
  await expect(page.getByTestId('score-1')).toHaveCount(0);
  await page.getByTestId('score-btn').click();
  await page.keyboard.press('F3');
  await snap(page, info, 'scores-paused'); // (freezes the render clock: last)
  expect(pageErrors(page)).toEqual([]);
});
