import { expect, test } from '@playwright/test';
import { frames, pageErrors, snap } from './helpers.ts';

test('main menu → skirmish setup → game → in-game menu → resign → defeat → results', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./?edgeScroll=0');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => !!window.__empires);
  await page.evaluate(() => window.__empires!.ready());
  await frames(page);
  await snap(page, info, 'menu-main');
  await page.getByTestId('menu-skirmish').click();
  await expect(page.getByTestId('skirmish-setup')).toBeVisible();
  await page.getByTestId('setup-type').selectOption('inland');
  await page.getByTestId('setup-size').selectOption('tiny');
  await page.getByTestId('setup-seed').fill('4242'); // a fixed seed keeps the screenshot stable
  await snap(page, info, 'menu-skirmish');
  await page.getByTestId('setup-start').click();
  await page.waitForURL(/scenario=skirmish/);
  await page.waitForFunction(() => !!window.__empires);
  await page.evaluate(() => window.__empires!.ready());
  const mine = await page.evaluate(() => window.__empires!.query.units(1));
  expect(mine.filter((u) => u.type === 'villager').length).toBe(3);
  expect(await page.evaluate(() => window.__empires!.query.units(2).length)).toBe(3);
  // In-game menu pauses; resign ends the game in defeat.
  await page.getByTestId('menu-btn').click();
  await expect(page.getByTestId('game-menu')).toBeVisible();
  const t0 = await page.evaluate(() => window.__empires!.query.tick());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__empires!.query.tick())).toBe(t0);
  await page.getByTestId('menu-resign').click();
  await page.evaluate(() => window.__empires!.step(25));
  await expect(page.locator('.gameover-title')).toHaveText('Defeat');
  await page.getByTestId('show-results').click();
  await expect(page.getByTestId('result-2')).toHaveClass(/winner/);
  expect(errors).toEqual([]);
  void pageErrors;
});

test('skirmish setup options: Time Limit, a Bronze Age start, a population of 100 and Full Tech Tree reach the game', async ({ page }) => {
  await page.goto('./?edgeScroll=0');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('menu-skirmish').click();
  await expect(page.getByTestId('setup-limit')).toHaveCount(0);
  await page.getByTestId('setup-victory').selectOption('time');
  await page.getByTestId('setup-limit').selectOption('30');
  await page.getByTestId('setup-age').selectOption('bronze');
  await page.getByTestId('setup-pop').selectOption('100');
  await page.getByTestId('setup-seed').fill('77');
  await expect(page.getByTestId('civ-info')).not.toContainText('Full Tech Tree');
  await page.getByTestId('setup-ftt').check();
  await expect(page.getByTestId('civ-info')).toContainText('No civilization bonuses (Full Tech Tree)');
  await page.getByTestId('setup-start').click();
  await page.waitForURL(/win=time/);
  expect(page.url()).toMatch(/ftt=1/);
  expect(page.url()).toMatch(/limit=30/);
  expect(page.url()).toMatch(/pop=100/);
  await page.waitForFunction(() => !!window.__empires);
  await page.evaluate(() => window.__empires!.ready());
  await page.evaluate(() => window.__empires!.step(10));
  await expect(page.getByTestId('clock-time-left')).toHaveText(/^Time left · (30:00|29:59)$/);
  await expect(page.getByTestId('age')).toHaveText('Bronze Age');
  expect(pageErrors(page)).toEqual([]);
});
