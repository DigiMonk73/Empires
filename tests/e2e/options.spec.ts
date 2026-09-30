import { expect, test, type Page } from '@playwright/test';
import { pageErrors, snap } from './helpers.ts';

async function openAfterMenu(page: Page, query: string): Promise<void> {
  await page.goto(`./?debug=1&edgeScroll=0&${query}`);
  await page.waitForFunction(() => !!window.__empires, null, { timeout: 30_000 });
  await page.evaluate(() => window.__empires!.ready());
}

async function clickUnit(page: Page, h: number, shift = false): Promise<void> {
  const p = (await page.evaluate((x) => window.__empires!.entityScreenPos(x), h))!;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y - 10);
  if (shift) await page.keyboard.up('Shift');
}

test('Classic preset + Grid hotkeys: set on the main menu, felt in the game, undone in the game menu', async ({ page }, info) => {
  await page.goto('./?edgeScroll=0');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('menu-options').click();
  await page.getByTestId('opt-classic').click();
  await page.getByTestId('opt-keys-grid').click();
  await page.getByTestId('opt-speed-1.5').click();
  await expect(page.getByTestId('opt-zoom')).toHaveText('Off');
  await snap(page, info, 'options-classic');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('empires.settings') ?? '{}'));
  expect(saved).toMatchObject({ hotkeys: 'grid', defaultSpeed: 1.5, qol: { rally: false, zoom: false, popCounter: false } });

  await openAfterMenu(page, 'scenario=demo&paused=1');
  // No population counter, no idle-villager button, no wheel zoom.
  await expect(page.getByTestId('res-food')).toBeVisible();
  await expect(page.getByTestId('pop')).toHaveCount(0);
  await expect(page.getByTestId('idle-villagers')).toHaveCount(0);
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, -600);
  expect((await page.evaluate(() => window.__empires!.camera.get())).zoom).toBe(1);

  // Grid letters: a villager's first button (Build) is Q.
  const units = await page.evaluate(() => window.__empires!.query.units(1));
  // Villagers well inside the view (not under the HUD bars).
  const vils = [];
  for (const u of units.filter((x) => x.type === 'villager')) {
    const p = (await page.evaluate((h) => window.__empires!.entityScreenPos(h), u.h))!;
    if (p.x > 60 && p.x < canvas.width - 60 && p.y > 90 && p.y < canvas.height - 220) vils.push(u);
  }
  await clickUnit(page, vils[0]!.h);
  await expect(page.getByTestId('cmd-buildMenu').locator('.hotkey')).toHaveText('Q');
  await page.keyboard.press('q');
  await expect(page.getByTestId('cmd-back')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cmd-buildMenu')).toBeVisible();

  // One unit in the status box at a time; Tab cycles.
  await clickUnit(page, vils[1]!.h, true);
  await expect(page.getByTestId('sel-focus')).toContainText('1 / 2');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('sel-focus')).toContainText('2 / 2');
  await expect(page.getByTestId('sel-multi')).toHaveCount(0);

  // Soldiers: no Attack Move button.
  const soldier = units.find((u) => u.type !== 'villager')!;
  await clickUnit(page, soldier.h);
  await expect(page.getByTestId('cmd-stop')).toBeVisible();
  await expect(page.getByTestId('cmd-attackMove')).toHaveCount(0);

  // A Town Center gets no rally point from a right-click.
  const tc = (await page.evaluate(() => window.__empires!.buildingAt(20, 16)))!;
  expect(tc).not.toBeNull();
  await page.keyboard.press('h');
  expect(await page.evaluate(() => window.__empires!.query.selection())).toEqual([tc]);
  const spot = await page.evaluate(() => window.__empires!.worldToScreen(24, 24));
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await page.evaluate(() => window.__empires!.step(2)); // paused: commands apply on the next ticks
  expect(await page.evaluate((h) => window.__empires!.query.rally(h), tc)).toBeNull();

  // F1: the keys, in the grid layout.
  await page.keyboard.press('F1');
  await expect(page.getByTestId('keys-grid')).toBeVisible();
  await snap(page, info, 'keys-grid');
  await page.getByTestId('keys-close').click();

  // The game menu's Options: Modern brings everything back at once.
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-game-options').click();
  await page.getByTestId('opt-modern').click();
  await page.getByTestId('opt-keys-classic').click();
  await page.getByTestId('game-options-back').click();
  await page.getByTestId('menu-resume').click();
  await expect(page.getByTestId('pop')).toBeVisible();
  await expect(page.getByTestId('idle-villagers')).toBeVisible();
  expect(await page.evaluate(() => window.__empires!.query.selection())).toEqual([tc]);
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await page.evaluate(() => window.__empires!.step(2));
  expect(await page.evaluate((h) => window.__empires!.query.rally(h), tc)).not.toBeNull();
  expect(pageErrors(page)).toEqual([]);
});
