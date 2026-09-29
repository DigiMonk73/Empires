import { describe, expect, it } from 'vitest';
import { checkSource } from '../../tools/check-purity.ts';

describe('sim purity checker', () => {
  it('accepts deterministic code', () => {
    const src = `import { x } from '../data/units.ts';
      export function f(a: number, b: number) { const m = new Map<number, number>(); return Math.sqrt(a * a + b * b) + Math.floor(a / b) + x; }`;
    expect(checkSource('src/sim/core/a.ts', src)).toEqual([]);
  });

  it('rejects non-deterministic and impure constructs', () => {
    const src = `import { Sprite } from 'pixi.js';
      import { draw } from '../../render/iso.ts';
      export function g(o: Record<string, number>) {
        const r = Math.random() + Math.sin(1) + 2 ** 3;
        for (const k in o) {}
        return Date.now() + performance.now() + r;
      }`;
    const msgs = checkSource('src/sim/core/b.ts', src).map((v) => v.message);
    expect(msgs.some((m) => m.includes('pixi.js'))).toBe(true);
    expect(msgs.some((m) => m.includes('render/iso.ts'))).toBe(true);
    expect(msgs.some((m) => m.includes('Math.random'))).toBe(true);
    expect(msgs.some((m) => m.includes('Math.sin'))).toBe(true);
    expect(msgs.some((m) => m.includes('**'))).toBe(true);
    expect(msgs.some((m) => m.includes('for…in'))).toBe(true);
    expect(msgs.some((m) => m.includes('Date'))).toBe(true);
    expect(msgs.some((m) => m.includes('performance'))).toBe(true);
  });

  it('does not flag property names that shadow forbidden globals', () => {
    const src = `export const o = { Date: 1, console: 2 }; export function h(p: { performance: number }) { return p.performance; }`;
    expect(checkSource('src/sim/core/c.ts', src)).toEqual([]);
  });

  it('limits what the AI may import', () => {
    const ok = `import type { SimView } from '../sim/view/SimView.ts'; import { u } from '../data/units.ts';`;
    expect(checkSource('src/ai/x.ts', ok)).toEqual([]);
    const bad = `import { step } from '../sim/core/tick.ts';`;
    expect(checkSource('src/ai/x.ts', bad).length).toBe(1);
  });

  it('ignores files outside the pure roots', () => {
    expect(checkSource('src/render/x.ts', 'Math.random()')).toEqual([]);
  });
});
