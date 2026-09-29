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
