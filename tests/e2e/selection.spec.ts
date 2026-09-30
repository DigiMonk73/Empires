import { expect, test, type Page } from '@playwright/test';
import { openGame, pageErrors, snap } from './helpers.ts';

async function villagers(page: Page): Promise<number[]> {
  const us = await page.evaluate(() => window.__empires!.query.units(1));
  return us.filter((u) => u.type === 'villager').map((u) => u.h);
}

async function screenOf(page: Page, h: number): Promise<{ x: number; y: number }> {
  const p = await page.evaluate((id) => window.__empires!.entityScreenPos(id), h);
  if (!p) throw new Error('entity gone');
  return p;
}

test('click, box, double-click, groups, and right-click move — all by real input', async ({ page }, info) => {
  await openGame(page, 'scenario=demo&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const vs = await villagers(page);
  expect(vs.length).toBe(8);

  // Click one villager (aim a little above the feet, at the body).
  const p0 = await screenOf(page, vs[0]!);
  await page.mouse.click(p0.x, p0.y - 10);
  expect(await page.evaluate(() => window.__empires!.query.selection())).toEqual([vs[0]]);

  // Click empty ground clears.
  await page.mouse.click(p0.x + 300, p0.y - 250);
  expect(await page.evaluate(() => window.__empires!.query.selection())).toEqual([]);

  // Box-select all villagers.
  const pts = await Promise.all(vs.map((h) => screenOf(page, h)));
  const x0 = Math.min(...pts.map((p) => p.x)) - 20;
  const y0 = Math.min(...pts.map((p) => p.y)) - 30;
  const x1 = Math.max(...pts.map((p) => p.x)) + 20;
  const y1 = Math.max(...pts.map((p) => p.y)) + 10;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
  await page.mouse.move(x1, y1, { steps: 4 });
  await page.mouse.up();
  expect((await page.evaluate(() => window.__empires!.query.selection())).sort()).toEqual([...vs].sort());
  await snap(page, info, 'selection-box');

  // Save as group 1, clear, recall.
  await page.keyboard.press('Control+Digit1');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__empires!.query.selection())).toEqual([]);
  await page.keyboard.press('Digit1');
  expect((await page.evaluate(() => window.__empires!.query.selection())).length).toBe(8);

  // Double-click one villager selects all villagers on screen.
  await page.keyboard.press('Escape');
  await page.mouse.dblclick(p0.x, p0.y - 10);
  expect((await page.evaluate(() => window.__empires!.query.selection())).length).toBe(8);

  // Right-click on open ground moves the group there.
  const target = await page.evaluate(() => window.__empires!.worldToScreen(26.5, 12.5));
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await page.evaluate(() => window.__empires!.step(200));
  const after = await page.evaluate(() => window.__empires!.query.units(1));
  for (const u of after.filter((a) => vs.includes(a.h))) expect(Math.hypot(u.x - 26.5, u.y - 12.5)).toBeLessThan(3.5);
  await snap(page, info, 'selection-moved');
  expect(pageErrors(page)).toEqual([]);
});
