import { expect, test, type Page } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

/** Step the sim in small chunks until `pred(units)` holds for villager `h` (or give up). */
async function stepUntil(page: Page, h: number, re: RegExp, max = 2400): Promise<string | null> {
  for (let t = 0; t < max; t += 10) {
    await page.evaluate(() => window.__empires!.step(10));
    await frames(page);
    const u = (await page.evaluate(() => window.__empires!.query.units(1))).find((x) => x.h === h);
    if (u?.sprite && re.test(u.sprite)) return u.sprite;
  }
  return null;
}

test('villagers play the right work and carry clips', async ({ page }, info) => {
  await openGame(page, 'scenario=start&fog=0');
  await page.evaluate(() => window.__empires!.pause(true));
  const vs = (await page.evaluate(() => window.__empires!.query.units(1))).filter((u) => u.type === 'villager').map((u) => u.h);
  const gazelle = (await page.evaluate(() => window.__empires!.query.units(0))).find((u) => u.type === 'gazelle')!.h;
  const gold = await page.evaluate(() => window.__empires!.query.resourceAt(27, 15));
  const berries = await page.evaluate(() => window.__empires!.query.resourceAt(12, 24));
  expect(gold).toBeGreaterThanOrEqual(0);
  expect(berries).toBeGreaterThanOrEqual(0);
  await page.evaluate(
    ([a, b, c, g, br, gz]) => {
      window.__empires!.issue(1, { t: 'gather', ids: [a!], res: g! });
      window.__empires!.issue(1, { t: 'gather', ids: [b!], res: br! });
      window.__empires!.issue(1, { t: 'act', ids: [c!], h: gz! });
    },
    [vs[0], vs[1], vs[2], gold, berries, gazelle],
  );
  expect(await stepUntil(page, vs[0]!, /^mine\//)).toMatch(/^mine\//);
  expect(await stepUntil(page, vs[1]!, /^forage\//)).toMatch(/^forage\//);
  expect(await stepUntil(page, vs[2]!, /^(throw|butcher)\//)).toMatch(/^(throw|butcher)\//);
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1.25);
    window.__empires!.camera.centerOn(22, 20);
  });
  await frames(page);
  await snap(page, info, 'work-overview');
  // The miner walks home with a sack of gold.
  expect(await stepUntil(page, vs[0]!, /^carryGold\//)).toMatch(/^carryGold\//);
  expect(pageErrors(page)).toEqual([]);
});
