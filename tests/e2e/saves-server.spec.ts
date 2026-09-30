import { expect, test } from '@playwright/test';
import { openGame, pageErrors, snap } from './helpers.ts';

test('server saves: save to the server, load it back from there, tick for tick', async ({ page, browserName }, info) => {
  await openGame(page, 'scenario=skirmish&type=inland&size=tiny&seed=7&p=greek.1.human,persian.2.moderate&paused=1');
  await page.evaluate(() => window.__empires!.step(20 * 60));
  const saved = await page.evaluate(() => ({ tick: window.__empires!.query.tick(), hash: window.__empires!.query.hash() }));
  const name = `On the box ${browserName}`;
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-save').click();
  await page.getByTestId('saves-server').click(); // offered because this server keeps saves (DATA_DIR)
  await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-note')).toHaveText('Game saved.');
  await expect(page.getByTestId('save-row').filter({ hasText: name })).toHaveCount(1);
  await snap(page, info, 'saves-server');
  // Not on this device.
  await page.getByTestId('saves-local').click();
  await expect(page.getByTestId('save-row').filter({ hasText: name })).toHaveCount(0);
  await page.getByTestId('saves-close').click();

  await page.getByTestId('menu-load').click();
  await page.getByTestId('saves-server').click();
  await page.getByTestId('save-row').filter({ hasText: name }).click();
  await page.waitForURL(/load=server%3A/);
  await page.waitForFunction(() => !!window.__empires);
  await page.evaluate(() => window.__empires!.ready());
  expect(await page.evaluate(() => ({ tick: window.__empires!.query.tick(), hash: window.__empires!.query.hash() }))).toEqual(saved);
  expect(pageErrors(page)).toEqual([]);
});

test('autosave: a skirmish keeps one rolling save every 5 minutes of game time', async ({ page }) => {
  await openGame(page, 'scenario=skirmish&type=inland&size=tiny&seed=9&p=greek.1.human,persian.2.moderate&paused=1');
  await page.evaluate(() => window.__empires!.step(20 * 60 * 5));
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-load').click();
  await page.getByTestId('saves-local').click();
  const auto = page.getByTestId('save-row').filter({ hasText: 'Autosave' });
  await expect(auto).toHaveCount(1);
  await expect(auto).toContainText('05:00');
  await page.getByTestId('saves-close').click();
  await page.getByTestId('menu-resume').click();
  await page.evaluate(() => window.__empires!.step(20 * 60 * 5));
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-load').click();
  await expect(auto).toHaveCount(1); // still one slot, now at 10:00
  await expect(auto).toContainText('10:00');
  expect(pageErrors(page)).toEqual([]);
});

test('load dialog: a slow device list never lands on the server tab (race seen on the StartOS VM)', async ({ page, browserName }) => {
  // Make this browser's IndexedDB slow to answer, as on the VM, so the device list arrives after the server's.
  await page.addInitScript(() => {
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      set(fn: (this: IDBTransaction, ev: Event) => void) {
        this.addEventListener('complete', (ev: Event) => setTimeout(() => fn.call(this, ev), 800));
      },
    });
  });
  await openGame(page, 'scenario=skirmish&type=inland&size=tiny&seed=11&p=greek.1.human,persian.2.moderate&paused=1');
  const name = `Race ${browserName}`;
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-save').click();
  await page.getByTestId('saves-server').click(); // remembered: the next dialog opens on the server tab
  await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-note')).toHaveText('Game saved.');
  await page.getByTestId('saves-close').click();
  await page.getByTestId('menu-load').click();
  await expect(page.getByTestId('saves-server')).toHaveClass(/\bon\b/);
  await expect(page.getByTestId('save-row').filter({ hasText: name })).toHaveCount(1);
  await page.waitForTimeout(1200); // past the slow device answer
  await expect(page.getByTestId('save-row').filter({ hasText: name })).toHaveCount(1);
  expect(pageErrors(page)).toEqual([]);
});
