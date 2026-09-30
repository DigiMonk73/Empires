import { expect, test } from '@playwright/test';
import { openGame, pageErrors, snap } from './helpers.ts';

test('diplomacy: stances per player, Neutral spares villagers, tribute through the Market with its fee', async ({ page }, info) => {
  await openGame(page, 'scenario=diplomacy&paused=1');
  await page.getByTestId('diplomacy-btn').click();
  await expect(page.getByTestId('diplomacy')).toBeVisible();
  // Starting stances from the teams: Player 2 an enemy, Player 3 an ally — both ways.
  await expect(page.getByTestId('diplo-2-enemy')).toHaveClass(/\bon\b/);
  await expect(page.getByTestId('diplo-3-ally')).toHaveClass(/\bon\b/);
  await expect(page.getByTestId('diplo-theirs-2')).toHaveText('Enemy');

  // Neutral toward Player 2: our clubmen let its villagers work.
  await page.getByTestId('diplo-2-neutral').click();
  await page.evaluate(() => window.__empires!.step(2));
  await expect(page.getByTestId('diplo-2-neutral')).toHaveClass(/\bon\b/);
  await expect(page.getByTestId('message').last()).toHaveText('You are now neutral toward Player 2.');

  // Tribute 100 food to the ally: 125 leaves (the 25% fee), 100 arrives.
  await page.getByTestId('tribute-to').selectOption('3');
  await page.getByTestId('tribute-amount').fill('100');
  await expect(page.getByTestId('tribute-note')).toHaveText('Costs 125 food (a 25% fee until Coinage).');
  const before = await page.evaluate(() => [window.__empires!.query.player(1).res[0], window.__empires!.query.player(3).res[0]]);
  await page.getByTestId('tribute-send').click();
  await page.evaluate(() => window.__empires!.step(2));
  const after = await page.evaluate(() => [window.__empires!.query.player(1).res[0], window.__empires!.query.player(3).res[0]]);
  expect(after).toEqual([before[0]! - 125, before[1]! + 100]);
  await expect(page.getByTestId('messages')).toContainText('You sent 100 food to Player 3 (fee 25).');
  await snap(page, info, 'diplomacy');
  await page.getByTestId('diplomacy-close').click();

  // With the game running, the clubmen don't go for Player 2's villagers.
  await page.evaluate(() => window.__empires!.step(20 * 8));
  const vils2 = (await page.evaluate(() => window.__empires!.query.units(2))).filter((u) => u.type === 'villager');
  expect(vils2).toHaveLength(2);
  expect(vils2.every((v) => v.hp === 25)).toBe(true);

  // At war again, the same clubmen go for them.
  await page.evaluate(() => {
    window.__empires!.issue(1, { t: 'diplomacy', to: 2, stance: 2 });
    window.__empires!.step(20 * 8);
  });
  const hurt = (await page.evaluate(() => window.__empires!.query.units(2))).filter((u) => u.type === 'villager');
  expect(hurt.length < 2 || hurt.some((v) => v.hp < 25)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
