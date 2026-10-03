/**
 * Multiplayer (M16.3–M16.4, docs/MULTIPLAYER.md): two browsers host and join a game from the menu, both load the
 * same game, each player's orders reach the other's screen, and the lockstep hash checks agree.
 */
import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __mp?: {
      router: { desync: unknown };
      session: { localPlayer: number; sim: { world: { players: { civ: string; team: number }[] } }; router: { submit(p: number, c: unknown): void } };
    };
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
  await guest!.getByTestId('mp-refresh').click();
  await expect(guest!.getByTestId(`mp-pings-${code}`)).toHaveText(/\d+ ms/);
  await guest!.getByTestId('mp-code').fill(code);
  await guest!.getByTestId('mp-join').click();
  await expect(guest!.getByTestId('mp-guest-room')).toBeVisible();
  await expect(host!.getByTestId('setup-seat-name-1')).toHaveText('Bo');
  // Seats show each member's ping (M16.11). A localhost round trip may be 0 ms.
  await expect(host!.getByTestId('setup-ping-0')).toHaveText(/\d+ ms/);
  await expect(host!.getByTestId('setup-ping-1')).toHaveText(/\d+ ms/);
  await expect(guest!.getByTestId('mp-ping-0')).toHaveText(/\d+ ms/);
  await expect(guest!.getByTestId('mp-ping-1')).toHaveText(/\d+ ms/);
  await host!.getByTestId('setup-size').selectOption('tiny');
  await expect(guest!.getByTestId('mp-seat-2')).toContainText('Bo');
  // Bo picks a civilization and a team (M16.10). The host sees it, and changing the map does not put it back.
  await guest!.getByTestId('mp-civ-1').selectOption('roman');
  await guest!.getByTestId('mp-team-1').selectOption('3');
  await expect(guest!.getByTestId('civ-info')).toContainText('Roman');
  await expect(host!.getByTestId('setup-civ-1')).toHaveValue('roman');
  await expect(host!.getByTestId('setup-team-1')).toHaveValue('3');
  await host!.getByTestId('setup-pop').selectOption('75');
  await expect(guest!.getByTestId('mp-civ-1')).toHaveValue('roman');
  await expect(host!.getByTestId('setup-civ-1')).toHaveValue('roman');
  await expect(host!.getByTestId('setup-start')).toBeEnabled();
  await host!.getByTestId('setup-start').click();

  // Both load the game page and rejoin; the game runs on both.
  for (const p of [host!, guest!]) {
    await p.waitForURL(/[?&]mp=1/, { timeout: 30_000 });
    await p.waitForFunction(() => (window.__empires?.query.tick() ?? -1) > 20, null, { timeout: 60_000 });
  }
  expect(await host!.evaluate(() => window.__mp!.session.localPlayer)).toBe(1);
  expect(await guest!.evaluate(() => window.__mp!.session.localPlayer)).toBe(2);
  expect(await guest!.evaluate(() => {
    const p = window.__mp!.session.sim.world.players[2]!;
    return { civ: p.civ, team: p.team };
  })).toEqual({ civ: 'roman', team: 3 });

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

  // F3 pauses everyone (M16.4): the guest's game stops and says who paused it; F3 again resumes.
  await host!.keyboard.press('F3');
  await expect(guest!.getByTestId('mp-waiting')).toHaveText(/Paused by Ann/);
  const paused = await tick(guest!);
  await guest!.waitForTimeout(800);
  expect(await tick(guest!)).toBeLessThanOrEqual(paused + 6); // (the few ticks already in flight)
  await host!.keyboard.press('F3');
  await expect.poll(() => tick(guest!), { timeout: 10_000 }).toBeGreaterThan(paused + 20);

  // Chat: Enter opens the box; the line reaches the other player's messages.
  await guest!.keyboard.press('Enter');
  await expect(guest!.getByTestId('mp-chat')).toBeFocused();
  await guest!.keyboard.type('good luck');
  await guest!.keyboard.press('Enter');
  await expect(host!.getByTestId('messages')).toContainText('Bo: good luck');
  await expect(guest!.getByTestId('mp-chat')).toBeHidden();
  expect(errors).toEqual([]);
});

/** A seeded stream in [0, 1). The same seed repeats the same clicks. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One harmless action: a map click, a key, a chat line, or the menu opened and closed. Never Quit or Resign. */
async function poke(page: Page, rand: () => number): Promise<void> {
  const kind = rand();
  if (kind < 0.5) {
    const box = await page.locator('#game canvas').boundingBox();
    if (!box) return;
    await page.mouse.click(box.x + 80 + rand() * Math.max(20, box.width - 160), box.y + 80 + rand() * Math.max(20, box.height - 260));
  } else if (kind < 0.7) {
    await page.keyboard.press(rand() < 0.5 ? 'Escape' : '.');
  } else if (kind < 0.85) {
    await page.keyboard.press('Enter');
    if (await page.getByTestId('mp-chat').isVisible()) {
      await page.keyboard.type('ok');
      await page.keyboard.press('Enter');
    }
  } else {
    await page.keyboard.press('F10');
    const resume = page.getByTestId('menu-resume');
    if (await resume.isVisible()) await resume.click();
  }
}

test('two browsers survive a seeded input monkey without errors or a desync (M16.12)', async ({ browser }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const [host, guest] = await Promise.all([browser.newContext(), browser.newContext()].map(async (c) => (await c).newPage()));
  for (const p of [host!, guest!]) {
    p.on('pageerror', (e) => errors.push(`page: ${e}`));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
  }
  await enterLobby(host!, 'Ann');
  await enterLobby(guest!, 'Bo');
  await host!.getByTestId('mp-host').click();
  const code = /room ([A-Z]{4})/.exec(await host!.getByTestId('skirmish-setup').locator('h2').innerText())![1]!;
  await guest!.getByTestId('mp-code').fill(code);
  await guest!.getByTestId('mp-join').click();
  await expect(host!.getByTestId('setup-seat-name-1')).toHaveText('Bo');
  await host!.getByTestId('setup-size').selectOption('tiny');
  await host!.getByTestId('setup-start').click();
  for (const p of [host!, guest!]) await p.waitForFunction(() => (window.__empires?.query.tick() ?? -1) > 20, null, { timeout: 60_000 });

  // Lens C, two clients: a smaller window, seeded clicks and keys, the menu, a pause, then back.
  for (const p of [host!, guest!]) await p.setViewportSize({ width: 1024, height: 640 });
  const rand = rng(1612);
  const before = await tick(host!);
  for (let i = 0; i < 16; i++) await poke(i % 2 === 0 ? host! : guest!, rand);
  await host!.keyboard.press('Escape');
  await host!.keyboard.press('F3');
  await expect(guest!.getByTestId('mp-waiting')).toContainText(/Paused by Ann/);
  await host!.keyboard.press('F3');
  await expect(guest!.getByTestId('mp-waiting')).toBeHidden({ timeout: 10_000 });
  for (let i = 0; i < 16; i++) await poke(i % 2 === 0 ? guest! : host!, rand);
  for (const p of [host!, guest!]) await p.setViewportSize({ width: 1280, height: 800 });

  await expect.poll(() => tick(host!), { timeout: 20_000 }).toBeGreaterThan(before + 30);
  await expect.poll(() => tick(guest!), { timeout: 20_000 }).toBeGreaterThan(before + 30);
  expect(await host!.evaluate(() => window.__mp!.router.desync)).toBeNull();
  expect(await guest!.evaluate(() => window.__mp!.router.desync)).toBeNull();
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
  // The test server holds a dropped player's seat 3 s (StartOS: 30 s) in case they come back; meanwhile the host waits.
  await expect(host!.getByTestId('mp-waiting')).toBeVisible({ timeout: 15_000 });
  const t0 = await tick(host!);
  await expect.poll(() => tick(host!), { timeout: 30_000 }).toBeGreaterThan(t0 + 100);
  await expect(host!.getByTestId('mp-waiting')).toBeHidden();
  // Player 2's villagers are working for the computer now.
  await expect
    .poll(() => host!.evaluate(() => window.__empires!.query.units(2).filter((u) => u.type === 'villager' && u.hasOrder).length), { timeout: 30_000 })
    .toBeGreaterThan(0);
});

test('a player who reloads mid-game catches up and both play on in step (M16.5b)', async ({ browser }) => {
  test.setTimeout(120_000);
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
  await host!.getByTestId('setup-start').click();
  for (const p of [host!, guest!]) await p.waitForFunction(() => (window.__empires?.query.tick() ?? -1) > 300, null, { timeout: 60_000 });
  // The in-game menu has no Restart, Save, Load or speed in multiplayer.
  await host!.keyboard.press('F10');
  await expect(host!.getByTestId('menu-resume')).toBeVisible();
  for (const id of ['menu-restart', 'menu-save', 'menu-load']) await expect(host!.getByTestId(id)).toHaveCount(0);
  await host!.getByTestId('menu-resume').click();
  // A connection blip (the socket closes, the page stays): the page reloads itself and rejoins.
  const blip = await tick(host!);
  await guest!.evaluate(() => (window as unknown as { __mp: { net: { close(): void } } }).__mp.net.close());
  await guest!.waitForFunction((t) => (window.__empires?.query.tick() ?? -1) > t, blip, { timeout: 60_000 });
  const before = await tick(host!);
  await guest!.reload();
  // The guest's page replays the game from the start and joins in again where it is.
  await guest!.waitForFunction(() => (window.__empires?.query.tick() ?? -1) > 0, null, { timeout: 60_000 });
  await expect.poll(() => tick(guest!), { timeout: 60_000 }).toBeGreaterThan(before);
  await expect.poll(() => tick(host!), { timeout: 30_000 }).toBeGreaterThan(before + 200);
  await expect.poll(() => tick(guest!), { timeout: 30_000 }).toBeGreaterThan(before + 200);
  expect(await host!.evaluate(() => window.__mp!.router.desync)).toBeNull();
  expect(await guest!.evaluate(() => window.__mp!.router.desync)).toBeNull();
  // Still the guest's own seat (no computer took it).
  expect(await guest!.evaluate(() => window.__mp!.session.localPlayer)).toBe(2);
  expect(errors).toEqual([]);
});
