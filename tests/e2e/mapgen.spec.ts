import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

for (const [type, size, seed] of [['continental', 'small', 3], ['inland', 'medium', 5]] as const) {
  test(`random map: ${type} ${size} (seed ${seed})`, async ({ page }, info) => {
    await openGame(page, `scenario=map&type=${type}&size=${size}&seed=${seed}&fog=0`);
    await page.evaluate(() => window.__empires!.pause(true));
    const units = await page.evaluate(() => window.__empires!.query.units(1));
    expect(units.filter((u) => u.type === 'villager').length).toBe(3);
    await page.evaluate(() => window.__empires!.camera.setZoom(0.6));
    await frames(page);
    await snap(page, info, `map-${type}`);
    expect(pageErrors(page)).toEqual([]);
  });
}
