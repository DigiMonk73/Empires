import { expect, test } from '@playwright/test';
import { frames, openGame, pageErrors, snap } from './helpers.ts';

/** Sounds are counted as they are started, so the hooks are testable without listening. */
const played = (page: import('@playwright/test').Page) => page.evaluate(() => window.__empires!.audioStats().played);

test('audio: a click starts the engine; selecting and ordering units answers with voices', async ({ page }) => {
  await openGame(page, 'scenario=raid&fog=0');
  await page.evaluate(() => {
    window.__empires!.pause(true);
    window.__empires!.camera.setZoom(1.4);
    window.__empires!.camera.centerOn(12, 14);
  });
  await frames(page);
  expect((await page.evaluate(() => window.__empires!.audioStats())).ready).toBe(false); // autoplay rule: no context yet
  const club = (await page.evaluate(() => window.__empires!.query.units(1))).find((u) => u.type === 'clubman')!;
  const p = (await page.evaluate((h) => window.__empires!.entityScreenPos(h), club.h))!;
  await page.mouse.click(p.x, p.y - 12);
  await page.waitForFunction(() => window.__empires!.audioStats().ready, null, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__empires!.query.selection())).toHaveLength(1); // one of the clubmen
  expect((await played(page))['voice:soldier']).toBe(1);
  // An order, after the chatter gap.
  await page.waitForTimeout(700);
  const g = await page.evaluate(() => window.__empires!.worldToScreen(12, 12));
  await page.mouse.click(g.x, g.y, { button: 'right' });
  expect((await played(page))['voice:soldier']).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test('audio: combat is heard — swings, bowstrings, hits, deaths and a collapse', async ({ page }) => {
  await openGame(page, 'scenario=raid&fog=0&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const own = await page.evaluate(() => window.__empires!.query.units(1));
  const vills = (await page.evaluate(() => window.__empires!.query.units(2))).map((u) => u.h);
  const house = await page.evaluate(() => window.__empires!.buildingAt(15, 15));
  await page.evaluate(
    ([c, b, v, h]) => {
      const api = window.__empires!;
      api.camera.setZoom(1);
      api.camera.centerOn(15, 16);
      api.issue(1, { t: 'act', ids: c!, h: h! });
      api.issue(1, { t: 'act', ids: b!, h: v![0]! });
    },
    [own.filter((u) => u.type === 'clubman').map((u) => u.h), own.filter((u) => u.type === 'bowman').map((u) => u.h), vills, house] as const,
  );
  await page.evaluate(() => window.__empires!.step(20 * 75));
  const s = await played(page);
  expect(s.club ?? 0).toBeGreaterThan(0); // clubs on the house
  expect(s.bow ?? 0).toBeGreaterThan(0);
  expect(s.thunk ?? 0).toBeGreaterThan(0);
  expect(s['voice:death'] ?? 0).toBeGreaterThan(0);
  expect(s.collapse ?? 0).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test('audio: villagers\' tools are heard on their strike frame', async ({ page }) => {
  await openGame(page, 'scenario=village&paused=1');
  await page.evaluate(() => window.__empires!.pause(true));
  const vills = (await page.evaluate(() => window.__empires!.query.units(1))).filter((u) => u.type === 'villager');
  // Put everyone on the nearest trees and let the game run in real time for the renderer to reach hit frames.
  await page.evaluate((v) => {
    const api = window.__empires!;
    const c = api.camera.get();
    let best = -1;
    let bd = 1e9;
    for (let ty = 0; ty < 48; ty++)
      for (let tx = 0; tx < 48; tx++) {
        const r = api.query.resourceAt(tx, ty);
        const d = Math.abs(tx - c.x) + Math.abs(ty - c.y);
        if (r >= 0 && d < bd && d > 3) {
          bd = d;
          best = r;
        }
      }
    api.issue(1, { t: 'gather', ids: v.map((u) => u.h), res: best });
    api.pause(false);
  }, vills);
  await page.waitForFunction(() => Object.keys(window.__empires!.audioStats().played).some((k) => ['chop', 'mine', 'hoe', 'hammer'].includes(k)), null, { timeout: 20_000 });
  expect(pageErrors(page)).toEqual([]);
});

test('audio: music starts with the engine and turns to battle when our units fight (M11.3)', async ({ page }) => {
  await openGame(page, 'scenario=raid&fog=0');
  await page.evaluate(() => window.__empires!.pause(true));
  await page.mouse.click(640, 300);
  await page.waitForFunction(() => window.__empires!.audioStats().ready, null, { timeout: 10_000 });
  await page.waitForFunction(() => window.__empires!.audioStats().music.slices > 0, null, { timeout: 10_000 });
  expect((await page.evaluate(() => window.__empires!.audioStats().music)).mood).not.toBe('battle');
  // Send the clubmen at the enemy camp and let them fight.
  await page.evaluate(() => {
    const e = window.__empires!;
    const club = e.query.units(1).filter((u) => u.type === 'clubman').map((u) => u.h);
    const foe = e.query.units(2)[0]!;
    e.issue(1, { t: 'act', ids: club, h: foe.h });
    e.step(20 * 20);
  });
  const m = await page.evaluate(() => window.__empires!.audioStats().music);
  expect(m.mood).toBe('battle');
  expect(m.playing).toBe('battle');
  expect(pageErrors(page)).toEqual([]);
});

test('audio: Options on the main menu set the volumes; they persist into the game menu (M11.4)', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./?edgeScroll=0'); // the main menu (no scenario, no debug flag)
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => !!window.__empires);
  await page.getByTestId('menu-options').click();
  await page.getByTestId('options').waitFor();
  await page.getByTestId('vol-music').fill('25');
  await page.getByTestId('vol-sfx').fill('70');
  await page.getByTestId('opt-mute').click();
  await snap(page, info, 'menu-options');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('empires.audio') ?? '{}'));
  expect(saved).toMatchObject({ music: 0.25, sfx: 0.7, muted: true });
  await page.getByTestId('options-back').click();
  // Into a game: the game menu shows the same settings.
  await page.goto('./?debug=1&edgeScroll=0&scenario=raid&paused=1');
  await page.waitForFunction(() => !!window.__empires);
  await page.getByTestId('menu-btn').click();
  await expect(page.getByTestId('vol-music')).toHaveValue('25');
  await expect(page.getByTestId('menu-sound')).toHaveText('Off');
  await page.getByTestId('menu-sound').click();
  await expect(page.getByTestId('vol-music')).toBeEnabled();
  expect((await page.evaluate(() => window.__empires!.audioStats())).muted).toBe(false);
  expect(errors).toEqual([]);
});
