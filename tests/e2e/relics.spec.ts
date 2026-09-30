import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

test('relics: a scout claims a free Artifact, an enemy takes our unguarded Ruins, with messages', async ({ page }, info) => {
  await openGame(page, 'scenario=relics&fog=0&paused=1');
  const at = async (x: number, y: number) => page.evaluate(([px, py]) => window.__empires!.buildingAt(px!, py!), [x, y]);
  const [free, ours, art, theirs] = [await at(6, 6), await at(12, 6), await at(18, 8), await at(12, 13)];
  const owners = () => page.evaluate((hs) => hs.map((h) => window.__empires!.ownerOf(h!)), [free, ours, art, theirs]);
  expect(await owners()).toEqual([0, 1, 0, 2]);
  await page.evaluate(() => window.__empires!.step(26));
  // The free Ruins stay free (nobody beside them); player 2's villager guards its Artifact.
  expect(await owners()).toEqual([0, 2, 1, 2]);
  const texts = (await page.evaluate(() => window.__empires!.notifications())).texts;
  expect(texts).toContain('You have claimed an Artifact.');
  expect(texts).toContain('Player 2 has taken your Ruins.');
  await page.evaluate(() => {
    window.__empires!.camera.setZoom(1.1);
    window.__empires!.camera.centerOn(12.5, 9.5);
  });
  await frames(page);
  await snap(page, info, 'relics');
  expect(pageErrors(page)).toEqual([]);
});
