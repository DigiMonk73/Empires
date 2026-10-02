/**
 * Multiplayer (M16.3–M16.4, docs/MULTIPLAYER.md): two browsers host and join a game from the menu, both load the
 * same game, each player's orders reach the other's screen, and the lockstep hash checks agree.
 */
import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __mp?: { router: { desync: unknown }; session: { localPlayer: number; router: { submit(p: number, c: unknown): void } } };
  }
}

async function enterLobby(page: Page, name: string): Promise<void> {
  await page.goto('./?edgeScroll=0');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('menu-multiplayer').click();
  await page.getByTestId('mp-name').fill(name);
  await page.getByTestId('mp-connect').click();
  await expect(page.getByTestId('mp-host')).toBeVisible();
}

const tick = (p: Page) => p.evaluate(() => window.__empires?.query.tick() ?? -1);
const unitAt = (p: Page, owner: number) =>
  p.evaluate((o) => {
    const v = window.__empires!.query.units(o).find((u) => u.type === 'villager')!;
    return { h: v.h, x: v.x, y: v.y };
  }, owner);

test('two players host and join from the menu, then play one game in step (M16.3)', async ({ browser }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const [host, guest] = await Promise.all([browser.newContext(), browser.newContext()].map(async (c) => (await c).newPage()));
  for (const p of [host!, guest!]) p.on('pageerror', (e) => errors.push(String(e)));
  await enterLobby(host!, 'Ann');
  await enterLobby(guest!, 'Bo');

  await host!.getByTestId('mp-host').click();
  const title = await host!.getByTestId('skirmish-setup').locator('h2').innerText();
  const code = /room ([A-Z]{4})/.exec(title)![1]!;
  await expect(host!.getByTestId('setup-start')).toBeDisabled(); // a Human seat is still open
  await guest!.getByTestId('mp-code').fill(code);
  await guest!.getByTestId('mp-join').click();
  await expect(guest!.getByTestId('mp-guest-room')).toBeVisible();
  await expect(host!.getByTestId('setup-seat-name-1')).toHaveText('Bo');
  await host!.getByTestId('setup-size').selectOption('tiny');
  await expect(guest!.getByTestId('mp-seat-2')).toContainText('Bo');
  await expect(host!.getByTestId('setup-start')).toBeEnabled();
  await host!.getByTestId('setup-start').click();

  // Both load the game page and rejoin; the game runs on both.
  for (const p of [host!, guest!]) {
    await p.waitForURL(/[?&]mp=1/, { timeout: 30_000 });
    await p.waitForFunction(() => (window.__empires?.query.tick() ?? -1) > 20, null, { timeout: 60_000 });
  }
  expect(await host!.evaluate(() => window.__mp!.session.localPlayer)).toBe(1);
  expect(await guest!.evaluate(() => window.__mp!.session.localPlayer)).toBe(2);

  // Each player orders a villager; the other sees it walk.
  const a0 = await unitAt(guest!, 1);
  const b0 = await unitAt(host!, 2);
  await host!.evaluate(({ h, x, y }) => window.__mp!.session.router.submit(1, { t: 'move', ids: [h], x: x + 4, y }), a0);
  await guest!.evaluate(({ h, x, y }) => window.__mp!.session.router.submit(2, { t: 'move', ids: [h], x, y: y + 4 }), b0);
  await expect.poll(async () => (await unitAt(guest!, 1)).x - a0.x, { timeout: 20_000 }).toBeGreaterThan(2);
  await expect.poll(async () => (await unitAt(host!, 2)).y - b0.y, { timeout: 20_000 }).toBeGreaterThan(2);

  // Past two hash checkpoints (every 100 ticks), neither side saw a desync.
  for (const p of [host!, guest!]) await expect.poll(() => tick(p), { timeout: 40_000 }).toBeGreaterThan(260);
  expect(await host!.evaluate(() => window.__mp!.router.desync)).toBeNull();
  expect(await guest!.evaluate(() => window.__mp!.router.desync)).toBeNull();
  await expect(host!.getByTestId('mp-waiting')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a player who closes the game: the other waits briefly, then a computer takes the seat and play goes on (M16.5)', async ({ browser }) => {
  test.setTimeout(120_000);
  const [host, guest] = await Promise.all([browser.newContext(), browser.newContext()].map(async (c) => (await c).newPage()));
  await enterLobby(host!, 'Ann');
  await enterLobby(guest!, 'Bo');
  await host!.getByTestId('mp-host').click();
  const code = /room ([A-Z]{4})/.exec(await host!.getByTestId('skirmish-setup').locator('h2').innerText())![1]!;
  await guest!.getByTestId('mp-code').fill(code);
  await guest!.getByTestId('mp-join').click();
  await expect(host!.getByTestId('setup-seat-name-1')).toHaveText('Bo');
  await host!.getByTestId('setup-size').selectOption('tiny');
  await host!.getByTestId('setup-start').click();
  for (const p of [host!, guest!]) await p.waitForFunction(() => (window.__empires?.query.tick() ?? -1) > 40, null, { timeout: 60_000 });
  await guest!.close();
  // The test server holds a seat 3 s (StartOS: 30 s) for a page that reloads; meanwhile the host waits.
  await expect(host!.getByTestId('mp-waiting')).toBeVisible({ timeout: 15_000 });
  const t0 = await tick(host!);
  await expect.poll(() => tick(host!), { timeout: 30_000 }).toBeGreaterThan(t0 + 100);
  await expect(host!.getByTestId('mp-waiting')).toBeHidden();
  // Player 2's villagers are working for the computer now.
  await expect
    .poll(() => host!.evaluate(() => window.__empires!.query.units(2).filter((u) => u.type === 'villager' && u.hasOrder).length), { timeout: 30_000 })
    .toBeGreaterThan(0);
});
