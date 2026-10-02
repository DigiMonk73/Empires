import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('research by mouse: select the Town Center, advance to the Tool Age', async ({ page }, info) => {
  await openGame(page, 'scenario=village&fog=0&paused=1');
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

test('tech tree: from the top bar in game (live progress) and from skirmish setup (a civilization)', async ({ page }, info) => {
  await openGame(page, 'scenario=village&fog=0&paused=1');
  await page.evaluate(() => {
    window.__empires!.grantTech(1, 'toolAge');
    window.__empires!.grantTech(1, 'battleAxe');
  });
  await page.getByTestId('tech-tree-btn').click();
  await expect(page.getByTestId('tech-tree')).toBeVisible();
  await expect(page.getByTestId('tt-tech-battleAxe')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('tt-axeman')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('tt-centurion')).toHaveAttribute('data-state', 'later');
  await expect(page.getByTestId('tt-longSwordsman')).toHaveAttribute('data-state', 'missing'); // Greeks lack Long Sword
  await snap(page, info, 'tech-tree');
  await page.getByTestId('tech-tree-close').click();
  await expect(page.getByTestId('tech-tree')).toHaveCount(0);
  // From setup: the civilization's tree (Greeks lack chariots).
  await page.goto('./?edgeScroll=0&paused=1');
  await page.getByTestId('menu-skirmish').click();
  await page.getByTestId('setup-tech-tree').click();
  await expect(page.getByTestId('tt-chariot')).toHaveAttribute('data-state', 'missing');
  expect(pageErrors(page)).toEqual([]);
});

test('a research button\'s tooltip says what the technology does (M15.10 P45)', async ({ page }, info) => {
  await openGame(page, 'scenario=village&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const tc = await page.evaluate(() => window.__empires!.buildingAt(15, 15));
  await page.evaluate(() => window.__empires!.camera.centerOn(15.5, 15.5));
  await frames(page);
  const pos = await page.evaluate((h) => window.__empires!.entityScreenPos(h!), tc);
  await page.mouse.click(pos!.x, pos!.y - 20);
  await frames(page);
  await page.evaluate(() => window.__empires!.step(2));
  const btn = page.getByTestId('cmd-research:toolAge');
  await btn.hover();
  await expect(btn.locator('.tooltip .desc')).toBeVisible();
  // On screen, not clipped by the command panel (the top row's tooltips showed nothing, M15.10 P57).
  const onTop = await page.evaluate(() => {
    const t = document.querySelector('[data-testid="cmd-research:toolAge"] .tooltip')!;
    const b = t.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!hit && t.contains(hit);
  });
  expect(onTop).toBe(true);
  await snap(page, info, 'research-tooltip');
  expect(pageErrors(page)).toEqual([]);
});
