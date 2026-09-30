import { expect, test } from '@playwright/test';
import { openGame, pageErrors, snap } from './helpers.ts';

test('notifications: ages, attacks out of sight (message + minimap ping), Home and click jump there', async ({ page }, info) => {
  await openGame(page, 'scenario=raid&paused=1');
  await page.evaluate(() => {
    window.__empires!.grantTech(2, 'toolAge');
    window.__empires!.step(1);
  });
  await expect.poll(() => page.evaluate(() => window.__empires!.notifications().texts)).toContain('Player 2 has advanced to the Tool Age.');
  await expect(page.getByTestId('message').first()).toHaveText('Player 2 has advanced to the Tool Age.');

  // Look away (top corner of the map), then send an enemy villager at our bowmen.
  await page.evaluate(() => window.__empires!.camera.centerOn(28, 3));
  const bow = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.type === 'bowman')!;
  const vil = (await page.evaluate(() => window.__empires!.query.units(2))).find((u) => u.type === 'villager')!;
  await page.evaluate(([v, b]) => window.__empires!.issue(2, { t: 'act', ids: [v!], h: b! }), [vil.h, bow.h]);
  // Step until the warning comes (the ping flashes for 3 s of game time after it).
  const n = await page.evaluate(() => {
    for (let t = 0; t < 400; t += 5) {
      window.__empires!.step(5);
      const x = window.__empires!.notifications();
      if (x.texts.some((m) => m.includes('under attack'))) return x;
    }
    return window.__empires!.notifications();
  });
  expect(n.texts).toContain('Your soldiers are under attack!');
  expect(n.pings).toBeGreaterThan(0);
  await snap(page, info, 'notify-attack');

  const centre = async () =>
    page.evaluate(() => {
      const c = window.__empires!.camera.get();
      return window.__empires!.screenToWorld(c.screenX, c.screenY);
    });
  await page.keyboard.press('Home');
  const home = await centre();
  expect(Math.hypot(home.x - bow.x, home.y - bow.y)).toBeLessThan(4);

  // A click on the placed message jumps there too.
  await page.evaluate(() => window.__empires!.camera.centerOn(28, 3));
  await page.getByTestId('message').filter({ hasText: 'under attack' }).click();
  const clicked = await centre();
  expect(Math.hypot(clicked.x - bow.x, clicked.y - bow.y)).toBeLessThan(4);
  expect(pageErrors(page)).toEqual([]);
});
