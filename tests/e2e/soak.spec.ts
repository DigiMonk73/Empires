import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openGame } from './helpers.ts';

/**
 * Two-hour soak in the browser (M15.4, D64): six computers (and a seventh for the local seat) on a Large map for 2
 * hours of game time in Chromium. The game is stepped 15 s at a time — every tick's events reach the renderer, sound
 * and effects as in play — with frames drawn in between; at minutes 10, 30, 60, 90 and 120 it runs at normal speed
 * for 4 s to time frames, and the heap is read after a full collection, with the textures and baked art held. Only
 * with EMPIRES_SOAK=1 (verify:full).
 */
const SOAK = process.env.EMPIRES_SOAK === '1';
// EMPIRES_SOAK_QUERY plays another game (M15.5 checked a four-navy islands game with it).
const QUERY =
  process.env.EMPIRES_SOAK_QUERY ??
  'scenario=skirmish&type=continental&size=large&seed=5&win=conquest&p=' +
    ['greek.1.hard', 'egyptian.2.hard', 'persian.3.moderate', 'babylonian.4.hard', 'yamato.5.moderate', 'hittite.6.hardest', 'shang.7.easy'].join(',');
const CHECKS = [10, 30, 60, 90, 120];

interface Check {
  minute: number;
  heapMB: number;
  cpuP95: number;
  sprites: number;
  textureMB: number;
  artMB: number;
  shownMB: number;
  models: number;
  evicted: number;
  units: number;
}

if (SOAK) {
  test('2 hours of 7 computers on Large: heap and frame times flat after minute 30', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'heap readings need Chromium (CDP)');
    test.setTimeout(30 * 60_000);
    await openGame(page, QUERY);
    await page.evaluate(() => window.__empires!.autoplay('hard'));
    const cdp = await page.context().newCDPSession(page);
    const heapMB = async (): Promise<number> => {
      await cdp.send('HeapProfiler.collectGarbage');
      return (await cdp.send('Runtime.getHeapUsage')).usedSize / 2 ** 20;
    };
    const checks: Check[] = [];
    const t0 = Date.now();
    for (let quarter = 1; quarter <= 120 * 4; quarter++) {
      await page.evaluate(() => {
        window.__empires!.pause(true);
        window.__empires!.step(300);
      });
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      const minute = quarter / 4;
      if (!CHECKS.includes(minute)) continue;
      await page.evaluate(() => {
        window.__empires!.pause(false);
        window.__empires!.setSpeed(1);
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__empires!.resetPerf());
      await page.waitForTimeout(4000);
      const s = await page.evaluate(() => window.__empires!.renderStats());
      const units = (await page.evaluate(() => window.__empires!.query.units())).filter((u) => u.owner > 0).length;
      const art = await page.evaluate(() => window.__empires!.artStats());
      checks.push({ minute, heapMB: await heapMB(), cpuP95: s.cpuP95, sprites: s.views, textureMB: s.textureBytes / 2 ** 20, artMB: art.bytes / 2 ** 20, shownMB: art.inUseBytes / 2 ** 20, models: art.loaded, evicted: art.evicted, units });
      console.log(`[soak] min ${minute}: heap ${checks.at(-1)!.heapMB.toFixed(1)} MB · cpu p95 ${s.cpuP95.toFixed(2)} ms · ${s.views} sprites · textures ${(s.textureBytes / 2 ** 20).toFixed(0)} MB (art ${(art.bytes / 2 ** 20).toFixed(0)} MB, ${(art.inUseBytes / 2 ** 20).toFixed(0)} shown, ${art.loaded} models, ${art.evicted} released) · ${units} units · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    mkdirSync('artifacts/soak', { recursive: true });
    writeFileSync('artifacts/soak/browser.json', JSON.stringify(checks, null, 2));
    const at30 = checks.find((c) => c.minute === 30)!;
    const later = checks.filter((c) => c.minute > 30);
    expect(await page.evaluate(() => window.__empires!.query.tick())).toBeGreaterThanOrEqual(120 * 1200);
    for (const c of later) {
      // The same bounds as the headless soak (D64): the heap may wander with the game but not climb.
      expect(c.heapMB, `heap at minute ${c.minute}`).toBeLessThanOrEqual(at30.heapMB * 1.3 + 10);
      expect(c.cpuP95, `frame CPU p95 at minute ${c.minute}`).toBeLessThanOrEqual(Math.max(8, at30.cpuP95 * 1.5));
      // Baked art is bounded (D64): beyond the budget only what live sprites show is kept, and what they show stays
      // within the perf gate's 512 MB of textures (M15.4b).
      expect(c.artMB, `art kept at minute ${c.minute}`).toBeLessThanOrEqual(c.shownMB + 320);
      expect(c.shownMB, `art shown at minute ${c.minute}`).toBeLessThanOrEqual(512);
    }
    expect(checks.at(-1)!.evicted).toBeGreaterThan(0);
    expect(checks.at(-1)!.heapMB).toBeLessThanOrEqual(at30.heapMB * 1.15 + 5);
  });
}
