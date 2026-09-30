import { expect, test } from '@playwright/test';
import { runTrace } from '../../src/sim/testing/trace.ts';
import { stressConfig } from '../../src/sim/testing/fuzz.ts';
import { runBattle } from '../../src/sim/testing/battle.ts';
import type {} from '../../src/debug/simHarness.ts';

/**
 * Cross-engine determinism (DECISIONS D1): the same fuzzed 500-unit scenario must produce identical hash traces
 * in Node (V8), headless Chromium (V8) and headless WebKit (JavaScriptCore). EMPIRES_FULL=1 adds 10 more seeds × 24k ticks.
 */
const FULL = process.env.EMPIRES_FULL === '1';
const SCENARIOS = [
  { seed: 1, size: 96, units: 250, ticks: 20000, every: 15 },
  { seed: 2, size: 72, units: 120, ticks: 20000, every: 9 },
  ...(FULL ? Array.from({ length: 10 }, (_, i) => ({ seed: 100 + i, size: 64 + (i % 3) * 32, units: 100 + i * 20, ticks: 24000, every: 7 + i })) : []),
];

for (const sc of SCENARIOS) {
  test(`hash trace matches Node: seed ${sc.seed}, ${sc.units * 2} units × ${sc.ticks} ticks`, async ({ page }, info) => {
    test.setTimeout(FULL ? 600_000 : 120_000);
    const node = runTrace(stressConfig(sc.seed, sc.size, sc.units), sc.ticks, sc.seed + 1, sc.every);
    await page.goto('./sim-harness.html');
    await page.waitForFunction(() => !!window.__simHarness);
    const browser = await page.evaluate((s) => window.__simHarness!.run(s.seed, s.size, s.units, s.ticks, s.every), sc);
    console.log(`[${info.project.name}] ${sc.ticks} ticks in ${(browser.ms / 1000).toFixed(1)} s (${(browser.ms / sc.ticks).toFixed(3)} ms/tick)`);
    const firstBad = node.trace.findIndex((h, i) => browser.trace[i] !== h);
    expect(firstBad, `first divergent checkpoint (×100 ticks)`).toBe(-1);
    expect(browser.final).toBe(node.final);
  });
}

test('20v20 battle: identical hash trace and outcome in Node and the browser', async ({ page }) => {
  const node = runBattle(2, 20 * 300);
  await page.goto('./sim-harness.html');
  await page.waitForFunction(() => !!window.__simHarness);
  const browser = await page.evaluate(() => window.__simHarness!.battle(2));
  expect(browser.trace).toEqual(node.trace);
  expect(browser.final).toBe(node.final);
  expect(browser.survivors).toEqual(node.survivors);
});
