import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openGame } from './helpers.ts';

/**
 * M2 perf gate: 1000 units moving on screen, frame CPU p95 ≤ 8 ms (Chromium on hardware GL only — perf numbers
 * from software GL or WebKit's timer precision aren't meaningful).
 */
test('1000 moving units: frame CPU p95 ≤ 8 ms', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'perf gate runs on Chromium only');
  await openGame(page, 'scenario=crowd&fog=0');
  const stats0 = await page.evaluate(() => window.__empires!.renderStats());
  test.skip(!/Metal|Apple|NVIDIA|AMD|Intel/i.test(stats0.glRenderer) || /SwiftShader/i.test(stats0.glRenderer), 'software GL');
  await page.evaluate(() => {
    const api = window.__empires!;
    api.camera.setZoom(0.5);
    api.camera.centerOn(42, 30);
    for (const p of [1, 2]) {
      const ids = api.query.units(p).map((u) => u.h);
      for (let k = 0; k < ids.length; k += 25) {
        api.issue(p, { t: 'move', ids: ids.slice(k, k + 25), x: 10 + ((k * 7) % 70), y: 10 + ((k * 13) % 60) });
      }
    }
    api.setSpeed(2);
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__empires!.resetPerf());
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => window.__empires!.renderStats());
  const moving = (await page.evaluate(() => window.__empires!.query.units())).filter((u) => u.hasOrder).length;
  mkdirSync('artifacts/perf', { recursive: true });
  writeFileSync('artifacts/perf/render-1000.json', JSON.stringify({ ...s, moving }, null, 2));
  console.log(`[perf] views ${s.views}, moving ${moving}, cpu p95 ${s.cpuP95.toFixed(2)} ms, fps ${s.fps.toFixed(0)}, terrain draws ${s.terrainDrawCalls}`);
  expect(s.views).toBeGreaterThanOrEqual(1000);
  expect(s.cpuP95).toBeLessThanOrEqual(8);
});

/**
 * M15.3 (Done 4): 8 players × 50 population on Gigantic (`?scenario=fullpop`) — frame CPU p95 ≤ 8 ms, ≤ 150 draw
 * calls a frame, textures ≤ 512 MB, warm load ≤ 8 s. Hardware GL Chromium only, like the gate above. The computers
 * play for 40 s of game time first, so their armies are out; then it is measured at normal speed over the player's
 * base, at the default zoom and zoomed all the way out.
 */
test('8 players × 50 pop on Gigantic: frame CPU p95 ≤ 8 ms, ≤ 150 draw calls, textures ≤ 512 MB, warm load ≤ 8 s', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'perf gate runs on Chromium only');
  test.setTimeout(180_000);
  const t0 = Date.now();
  await openGame(page, 'scenario=fullpop');
  const coldMs = Date.now() - t0;
  const stats0 = await page.evaluate(() => window.__empires!.renderStats());
  test.skip(!/Metal|Apple|NVIDIA|AMD|Intel/i.test(stats0.glRenderer) || /SwiftShader/i.test(stats0.glRenderer), 'software GL');
  // Warm load: the same page again, its files now in the browser's cache.
  const t1 = Date.now();
  await openGame(page, 'scenario=fullpop');
  const warmMs = Date.now() - t1;
  await page.evaluate(() => {
    window.__empires!.autoplay('hard');
    window.__empires!.setSpeed(2);
  });
  await page.waitForTimeout(20_000);
  const views: Record<string, { zoom: number; cpuP95: number; drawCallsMax: number; sprites: number; textureMB: number }> = {};
  for (const [name, zoom] of [['base', 1], ['wide', 0.5]] as const) {
    await page.evaluate((z) => {
      window.__empires!.setSpeed(1);
      window.__empires!.camera.setZoom(z);
    }, zoom);
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__empires!.resetPerf());
    await page.waitForTimeout(6000);
    const s = await page.evaluate(() => window.__empires!.renderStats());
    views[name] = { zoom, cpuP95: s.cpuP95, drawCallsMax: s.drawCallsMax, sprites: s.views, textureMB: s.textureBytes / 2 ** 20 };
  }
  const units = (await page.evaluate(() => window.__empires!.query.units())).filter((u) => u.owner > 0).length;
  mkdirSync('artifacts/perf', { recursive: true });
  writeFileSync('artifacts/perf/render-fullpop.json', JSON.stringify({ glRenderer: stats0.glRenderer, coldMs, warmMs, units, views }, null, 2));
  for (const [name, v] of Object.entries(views)) {
    console.log(`[perf fullpop ${name}] zoom ${v.zoom} · cpu p95 ${v.cpuP95.toFixed(2)} ms · draw calls ≤ ${v.drawCallsMax} · ${v.sprites} sprites · textures ${v.textureMB.toFixed(0)} MB`);
  }
  console.log(`[perf fullpop] load cold ${(coldMs / 1000).toFixed(1)} s, warm ${(warmMs / 1000).toFixed(1)} s · ${units} units`);
  expect(units).toBeGreaterThanOrEqual(240);
  expect(warmMs).toBeLessThanOrEqual(8000);
  for (const v of Object.values(views)) {
    expect(v.cpuP95).toBeLessThanOrEqual(8);
    expect(v.drawCallsMax).toBeLessThanOrEqual(150);
    expect(v.textureMB).toBeLessThanOrEqual(512);
  }
});
