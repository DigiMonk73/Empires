/**
 * Thirty game minutes of two browsers plus two computers (M16.8 / M16.12). Both clients run every tick in
 * lockstep. Multiplayer locks `session.speed` (one client speeding up would only wait on the other), so this
 * turns on the rejoin catch-up on both pages: each frame steps as fast as the peer's packets allow, and the
 * game's own speeds stay 1, 1.5 and 2. Not part of `npm run verify` — set EMPIRES_MP_SOAK=1.
 */
import { expect, test, type Page } from '@playwright/test';

interface MpPage {
  __mp?: { router: { desync: unknown }; catchingUp: boolean };
}

const SOAK = process.env.EMPIRES_MP_SOAK === '1';
/** 30 minutes at 20 ticks a second. */
const TICKS = 30 * 60 * 20;

async function enterLobby(page: Page, name: string): Promise<void> {
  await page.goto('./?edgeScroll=0');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('menu-multiplayer').click();
  await page.getByTestId('mp-name').fill(name);
  await page.getByTestId('mp-connect').click();
  await expect(page.getByTestId('mp-host')).toBeVisible();
}

const tick = (p: Page) => p.evaluate(() => window.__empires?.query.tick() ?? -1);

if (SOAK) {
  test('two browsers and two computers play 30 game minutes with no desync (M16.12)', async ({ browser }, info) => {
    test.skip(info.project.name !== 'chromium', 'one pair of browsers is the soak');
    test.setTimeout(15 * 60_000);
    const errors: string[] = [];
    const [host, guest] = await Promise.all([browser.newContext(), browser.newContext()].map(async (c) => (await c).newPage()));
    for (const p of [host!, guest!]) p.on('pageerror', (e) => errors.push(String(e)));
    await enterLobby(host!, 'Ann');
    await enterLobby(guest!, 'Bo');
    await host!.getByTestId('mp-host').click();
    const code = /room ([A-Z]{4})/.exec(await host!.getByTestId('skirmish-setup').locator('h2').innerText())![1]!;
    await guest!.getByTestId('mp-code').fill(code);
    await guest!.getByTestId('mp-join').click();
    await expect(host!.getByTestId('setup-seat-name-1')).toHaveText('Bo');
    await host!.getByTestId('setup-size').selectOption('tiny');
    await host!.getByRole('button', { name: 'Add player' }).click();
    await host!.getByRole('button', { name: 'Add player' }).click();
    await host!.getByTestId('setup-start').click();
    for (const p of [host!, guest!]) await p.waitForFunction(() => (window.__empires?.query.tick() ?? -1) > 20, null, { timeout: 60_000 });
    // Both pages, or the faster one only waits. The locked speed setter would ignore an assignment.
    for (const p of [host!, guest!]) await p.evaluate(() => ((window as unknown as MpPage).__mp!.catchingUp = true));

    const wall = Date.now();
    await expect.poll(async () => {
      const n = await tick(host!);
      console.log(`[mp-soak] ${n} / ${TICKS} ticks, ${((Date.now() - wall) / 1000).toFixed(0)} s`);
      return n;
    }, { timeout: 12 * 60_000, intervals: [10_000] }).toBeGreaterThan(TICKS);
    await expect.poll(() => tick(guest!), { timeout: 60_000 }).toBeGreaterThan(TICKS);
    expect(await host!.evaluate(() => (window as unknown as MpPage).__mp!.router.desync)).toBeNull();
    expect(await guest!.evaluate(() => (window as unknown as MpPage).__mp!.router.desync)).toBeNull();
    expect(errors).toEqual([]);
  });
}
