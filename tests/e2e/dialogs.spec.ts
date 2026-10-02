/**
 * Dialogs and keys (M15.10 P33–P37, from the input monkey of lens C): keys stay out of the game behind a dialog,
 * Escape closes the dialog on top, F1/F10 replace a dialog instead of opening beneath it, and Backspace never
 * leaves the page.
 */
import { expect, test, type Page } from '@playwright/test';
import { frames, openGame, pageErrors } from './helpers.ts';

const GAME = 'scenario=skirmish&p=greek.1.human,egyptian.2.moderate&size=tiny&seed=3';

const villagers = (page: Page) => page.evaluate(() => window.__empires!.query.units(1).filter((u) => u.type === 'villager').length);
const selected = (page: Page) => page.evaluate(() => window.__empires!.query.selection().length);
const tick = (page: Page) => page.evaluate(() => window.__empires!.query.tick());

async function selectVillager(page: Page): Promise<void> {
  const h = await page.evaluate(() => {
    const E = window.__empires!;
    const v = E.query.units(1).find((u) => u.type === 'villager')!;
    E.camera.centerOn(v.x, v.y);
    return v.h;
  });
  await frames(page);
  const at = await page.evaluate((x) => window.__empires!.entityScreenPos(x)!, h);
  await page.mouse.click(at.x, at.y - 8);
  await expect.poll(() => selected(page)).toBe(1);
}

test('Backspace with none of your units selected stays in the game (P33)', async ({ page }) => {
  await page.goto('./?edgeScroll=0'); // a page to go back to
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => window.__empires?.settle?.()); // (leaving mid-fetch logs a cancelled request in WebKit)
  await openGame(page, GAME);
  const url = page.url();
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(400);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => !!window.__empires)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test('keys stay out of the game behind the Menu (P34)', async ({ page }) => {
  await openGame(page, GAME);
  await selectVillager(page);
  const n = await villagers(page);
  await page.keyboard.press('F10');
  await expect(page.getByTestId('game-menu')).toBeVisible();
  await page.keyboard.press('Delete');
  await page.keyboard.press('b');
  await page.keyboard.press('e');
  await page.getByTestId('menu-resume').click();
  await page.waitForTimeout(300);
  expect(await villagers(page)).toBe(n);
  await expect(page.getByTestId('cmd-back')).toHaveCount(0);
});

test('F1 and F10 replace the Tech Tree or Diplomacy instead of opening beneath them (P35)', async ({ page }) => {
  await openGame(page, GAME);
  await page.getByTestId('tech-tree-btn').click();
  await expect(page.getByTestId('tech-tree')).toBeVisible();
  await page.keyboard.press('F1');
  await expect(page.getByTestId('keys')).toBeVisible();
  await expect(page.getByTestId('tech-tree')).toHaveCount(0);
  await page.getByTestId('keys-close').click();
  await page.getByTestId('diplomacy-btn').click();
  await expect(page.getByTestId('diplomacy')).toBeVisible();
  await page.keyboard.press('F10');
  await expect(page.getByTestId('game-menu')).toBeVisible();
  await expect(page.getByTestId('diplomacy')).toHaveCount(0);
});

test('Escape closes the dialog on top and leaves the selection alone (P36)', async ({ page }) => {
  await openGame(page, GAME);
  await selectVillager(page);
  await page.getByTestId('diplomacy-btn').click();
  await expect(page.getByTestId('diplomacy')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('diplomacy')).toHaveCount(0);
  expect(await selected(page)).toBe(1);
  await page.getByTestId('tech-tree-btn').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tech-tree')).toHaveCount(0);
  await page.keyboard.press('F1');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('keys')).toHaveCount(0);
  await page.keyboard.press('F10');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('game-menu')).toHaveCount(0);
  expect(await selected(page)).toBe(1);
  // The game runs again once the dialogs are gone.
  const t0 = await tick(page);
  await expect.poll(() => tick(page)).toBeGreaterThan(t0);
});

test('F3 twice with the Keys list open keeps the game paused (P37)', async ({ page }) => {
  await openGame(page, GAME);
  await page.keyboard.press('F1');
  await expect(page.getByTestId('keys')).toBeVisible();
  await page.keyboard.press('F3');
  await page.keyboard.press('F3');
  const t0 = await tick(page);
  await page.waitForTimeout(600);
  expect(await tick(page)).toBe(t0);
});
