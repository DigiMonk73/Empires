import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type {} from '../../src/debug/simHarness.ts';

/**
 * Determinism at scale (M15.1, Done 2), the browser half: every seed's 4-AI game played in this engine must give the
 * hash trace Node gave — `node tools/sim/determinism.ts` writes those first. Only with EMPIRES_SCALE=1 (verify:full's
 * `determinism` step): 100 games × 24k ticks per engine is no every-commit test.
 */
const SCALE = process.env.EMPIRES_SCALE === '1';
const NODE_TRACES = 'artifacts/determinism/node.json';
const CHUNK = 5;

interface NodeTraces {
  ticks: number;
  every: number;
  seeds: Record<string, { trace: number[]; final: number }>;
}

if (SCALE) {
  if (!existsSync(NODE_TRACES)) throw new Error(`${NODE_TRACES} is missing — run node tools/sim/determinism.ts first`);
  const node = JSON.parse(readFileSync(NODE_TRACES, 'utf8')) as NodeTraces;
  const seeds = Object.keys(node.seeds)
    .map(Number)
    .sort((a, b) => a - b);
  for (let i = 0; i < seeds.length; i += CHUNK) {
    const chunk = seeds.slice(i, i + CHUNK);
    test(`4-AI games match Node: seeds ${chunk[0]}–${chunk[chunk.length - 1]} × ${node.ticks} ticks`, async ({ page }, info) => {
      test.setTimeout(900_000);
      await page.goto('./sim-harness.html');
      await page.waitForFunction(() => !!window.__simHarness);
      const bad: string[] = [];
      for (const seed of chunk) {
        const r = await page.evaluate((a) => window.__simHarness!.scale(a.seed, a.ticks, a.every), { seed, ticks: node.ticks, every: node.every });
        const want = node.seeds[seed]!;
        const first = want.trace.findIndex((h, k) => r.trace[k] !== h);
        if (first >= 0) bad.push(`seed ${seed}: first divergent checkpoint at tick ${(first + 1) * node.every}`);
        else if (r.trace.length !== want.trace.length || r.final !== want.final) bad.push(`seed ${seed}: final hash differs`);
        console.log(`[${info.project.name}] seed ${seed}: ${node.ticks} ticks in ${(r.ms / 1000).toFixed(1)} s`);
      }
      expect(bad).toEqual([]);
    });
  }
}
