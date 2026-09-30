import { EKind } from '../core/entities.ts';
import { quantize, type PlayerCommand } from '../commands/types.ts';
import { Rng } from '../math/rng.ts';
import type { Sim } from '../index.ts';
import type { SimConfig } from '../world.ts';

/**
 * Deterministic random-order driver for determinism and stress tests: every few ticks each player selects a
 * random group of its units and moves (sometimes shift-queues or stops) them to random points.
 */
export class OrderFuzzer {
  private readonly rng: Rng;
  private readonly every: number;

  constructor(seed: number, every = 15) {
    this.rng = new Rng(seed, 999);
    this.every = every;
  }

  commands(sim: Sim): PlayerCommand[] {
    if (sim.tick % this.every !== 0) return [];
    const w = sim.world;
    const e = w.ents;
    const out: PlayerCommand[] = [];
    for (let p = 1; p < w.players.length; p++) {
      const mine: number[] = [];
      for (let s = 0; s < e.top; s++) if (e.alive[s] && e.kind[s] === EKind.unit && e.owner[s] === p) mine.push(e.handleOf(s));
      if (!mine.length) continue;
      const r = this.rng;
      const n = 1 + r.int(Math.min(mine.length, 24));
      const start = r.int(mine.length);
      const ids: number[] = [];
      for (let k = 0; k < n; k++) ids.push(mine[(start + k * 7) % mine.length]!);
      const roll = r.float();
      const res = w.res;
      if (roll < 0.08) out.push({ player: p, cmd: { t: 'stop', ids } });
      else if (roll < 0.3 && res.count) {
        // Economy: send some units to gather a random node (non-villagers just walk there).
        out.push({ player: p, cmd: { t: 'gather', ids, res: r.int(res.count) } });
      } else if (roll < 0.36) {
        // Build a house at a random spot (rejections are part of the test too).
        out.push({ player: p, cmd: { t: 'build', ids: ids.slice(0, 3), type: r.chance(0.7) ? 'house' : 'granary', tx: r.int(w.map.w - 2), ty: r.int(w.map.h - 2) } });
      } else if (roll < 0.39) {
        // Hunt (or, for soldiers, attack) a random Gaia animal.
        const prey: number[] = [];
        for (let s = 0; s < e.top; s++) if (e.alive[s] && e.kind[s] === EKind.unit && e.owner[s] === 0) prey.push(e.handleOf(s));
        if (prey.length) out.push({ player: p, cmd: { t: 'act', ids, h: prey[r.int(prey.length)]! } });
      } else if (roll < 0.42) {
        for (let b = 0; b < e.top; b++) {
          if (e.alive[b] && e.kind[b] === EKind.building && e.owner[b] === p) out.push({ player: p, cmd: { t: 'train', bld: e.handleOf(b), unit: 'villager', n: 1 + r.int(3) } });
        }
      } else
        out.push({
          player: p,
          cmd: { t: 'move', ids, x: quantize(r.float() * (w.map.w - 1) + 0.5), y: quantize(r.float() * (w.map.h - 1) + 0.5), queue: roll > 0.85, ...(roll > 0.7 && roll < 0.78 ? { am: true } : {}) },
        });
    }
    return out;
  }
}

/** A forest-and-lake scenario with `unitsPerPlayer` mixed units for two players (stress/determinism). */
export function stressConfig(seed: number, size = 96, unitsPerPlayer = 250): SimConfig {
  const r = new Rng(seed, 7);
  const rows: string[] = [];
  const blobs: [number, number, number, string][] = [];
  for (let k = 0; k < Math.floor(size / 6); k++) blobs.push([r.int(size), r.int(size), 2 + r.int(6), r.chance(0.2) ? '~' : 'F']);
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) {
      let c = '.';
      for (const [cx, cy, rad, ch] of blobs) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) c = ch;
      if ((x < 14 && y < 14) || (x > size - 15 && y > size - 15)) c = '.';
      row += c;
    }
    rows.push(row);
  }
  const types = ['villager', 'villager', 'clubman', 'bowman', 'scout', 'hoplite', 'warElephant'];
  const units: { type: string; owner: number; x: number; y: number }[] = [];
  for (let p = 1; p <= 2; p++) {
    for (let i = 0; i < unitsPerPlayer; i++) {
      const bx = p === 1 ? 2 : size - 14;
      units.push({ type: types[i % types.length]!, owner: p, x: bx + 0.5 + (i % 16) * 0.75, y: bx + 0.5 + Math.floor(i / 16) * 0.75 });
    }
  }
  // Gaia herds in the open middle: gazelles flee, elephants fight back.
  for (let i = 0; i < 24; i++) {
    const x = Math.floor(size * 0.3) + r.int(Math.floor(size * 0.4));
    const y = Math.floor(size * 0.3) + r.int(Math.floor(size * 0.4));
    if (rows[y]![x] !== '.') continue;
    units.push({ type: i % 6 === 5 ? 'elephant' : 'gazelle', owner: 0, x: x + 0.5, y: y + 0.5 });
  }
  const buildings = [
    { type: 'townCenter', owner: 1, tx: 8, ty: 2 },
    { type: 'townCenter', owner: 2, tx: size - 11, ty: size - 5 },
  ];
  return { seed, map: { w: size, h: size, ascii: rows }, players: [{ civ: 'greek' }, { civ: 'persian' }], startingResources: 'high', scenario: { units, buildings } };
}
