import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { hit, ELEVATION_CHANCE } from '../../src/sim/systems/combat.ts';
import { placementValid } from '../../src/sim/systems/build.ts';
import { buildingTypeIndex } from '../../src/sim/rules/registry.ts';
import { generateMap, GEN_MAP_TYPES } from '../../src/sim/mapgen/generate.ts';

/** M10.1a: corner heights, flat building ground, the elevation combat rule (D44), hills on generated maps. */
const W = 24;
/** Heights string: a level-2 plateau on corners x, y in [2, 8], a one-level ring round it, the rest 0. */
function hillHeights(): string {
  let s = '';
  for (let y = 0; y <= W; y++) {
    for (let x = 0; x <= W; x++) {
      const inner = x >= 2 && x <= 8 && y >= 2 && y <= 8;
      const ring = x >= 1 && x <= 9 && y >= 1 && y <= 9;
      s += inner ? '2' : ring ? '1' : '0';
    }
  }
  return s;
}

function world(units: { type: string; owner: number; x: number; y: number }[] = []) {
  const sim = Sim.create({ seed: 5, map: { w: W, h: W, heights: hillHeights() }, players: [{ civ: 'greek' }, { civ: 'persian' }], scenario: { units } });
  return sim.world;
}

describe('elevation', () => {
  it('interpolates ground height between corners and rounds tile levels', () => {
    const w = world();
    expect(w.map.heightAt(5, 5)).toBe(2);
    expect(w.map.heightAt(15, 15)).toBe(0);
    expect(w.map.heightAt(1.5, 5)).toBeCloseTo(1.5); // between the ring (1) and the plateau (2)
    expect(w.map.heightAt(0.5, 5)).toBeCloseTo(0.5);
    expect(w.map.levelAt(5.5, 5.5)).toBe(2);
    expect(w.map.levelAt(1.5, 5.5)).toBe(2); // corners 1,2,1,2 → 1.5 rounds up
    expect(w.map.levelAt(12.5, 12.5)).toBe(0);
  });

  it('buildings need flat ground; walls follow the land', () => {
    const w = world();
    const house = buildingTypeIndex('house');
    expect(placementValid(w, house, 3, 3)).toBe(true); // on the plateau
    expect(placementValid(w, house, 12, 12)).toBe(true); // on the plain
    expect(placementValid(w, house, 0, 3)).toBe(false); // across the slope
    const ok: boolean[] = [];
    placementValid(w, house, 8, 8, ok);
    expect(ok.every((b) => !b)).toBe(true); // the ghost shows the whole footprint red
    expect(placementValid(w, buildingTypeIndex('smallWall'), 1, 5)).toBe(true);
  });

  it('a hit on a lower target triples 25% of the time; level ground and uphill never do', () => {
    const w = world([
      { type: 'bowman', owner: 1, x: 5.5, y: 5.5 }, // on the plateau (level 2)
      { type: 'clubman', owner: 2, x: 14.5, y: 14.5 }, // on the plain (level 0)
      { type: 'clubman', owner: 2, x: 16.5, y: 14.5 },
    ]);
    const e = w.ents;
    const slots = [0, 1, 2].map((i) => e.slotOf(w.ents.handleOf(i)));
    const [high, low, low2] = slots as [number, number, number];
    let triples = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      e.hp[low] = 1000;
      hit(w, high, low, 1);
      if (1000 - e.hp[low]! === 3) triples++;
    }
    expect(triples / N).toBeGreaterThan(ELEVATION_CHANCE - 0.04);
    expect(triples / N).toBeLessThan(ELEVATION_CHANCE + 0.04);
    for (let i = 0; i < 200; i++) {
      e.hp[high] = 1000;
      hit(w, low, high, 1); // uphill: never tripled
      expect(1000 - e.hp[high]!).toBe(1);
      e.hp[low2] = 1000;
      hit(w, low, low2, 1); // level ground: never tripled
      expect(1000 - e.hp[low2]!).toBe(1);
    }
  });

  it('generated maps: gentle slopes, level ground at the shore and round every start', () => {
    for (const type of GEN_MAP_TYPES) {
      for (const seed of [3, 11]) {
        const m = generateMap({ seed, type, size: 'tiny', hills: true, players: [{ civ: 'greek' }, { civ: 'egyptian' }, { civ: 'roman' }] });
        const N = m.map.w + 1;
        const hs = m.map.heights!;
        expect(hs.length, type).toBe(N * N);
        const h = (x: number, y: number) => hs.charCodeAt(y * N + x) - 48;
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) {
              if (x + dx < 0 || x + dx >= N || y + dy >= N) continue;
              expect(Math.abs(h(x, y) - h(x + dx, y + dy)), `${type} ${seed} slope at ${x},${y}`).toBeLessThanOrEqual(1);
            }
          }
        }
        const ascii = m.map.ascii!;
        for (let y = 0; y < m.map.w; y++) {
          for (let x = 0; x < m.map.w; x++) {
            if (!['~', 'w', ',', 'f', 'b'].includes(ascii[y]![x]!)) continue;
            expect(h(x, y) + h(x + 1, y) + h(x, y + 1) + h(x + 1, y + 1), `${type} shore ${x},${y}`).toBe(0);
          }
        }
        for (const [sx, sy] of m.starts) for (let dy = -3; dy <= 6; dy++) for (let dx = -3; dx <= 6; dx++) expect(h(sx + dx, sy + dy), `${type} base`).toBe(0);
      }
    }
    const land = generateMap({ seed: 7, type: 'inland', size: 'tiny', hills: true, players: [{ civ: 'greek' }, { civ: 'egyptian' }] });
    expect([...land.map.heights!].filter((c) => c !== '0').length).toBeGreaterThan(200);
  });
});
