import { EKind } from '../core/entities.ts';
import { Sim } from '../index.ts';
import type { SimConfig } from '../world.ts';

/**
 * Scripted battle (M5 exit gate): two mirrored 20-unit armies — clubmen, bowmen, slingers, scouts — attack-move
 * at each other across an open field with a few trees. Measures sim cost per tick, stuck units, how long the
 * fight takes, and casualties; the hash trace is compared across engines by the determinism e2e.
 */
export const BATTLE_ARMY = ['clubman', 'clubman', 'clubman', 'clubman', 'clubman', 'clubman', 'clubman', 'clubman', 'bowman', 'bowman', 'bowman', 'bowman', 'bowman', 'bowman', 'slinger', 'slinger', 'slinger', 'scout', 'scout', 'scout'] as const;

export function battleConfig(seed = 1, perSide = BATTLE_ARMY.length): SimConfig {
  const W = 48;
  const rows: string[] = [];
  for (let y = 0; y < W; y++) {
    let row = '';
    for (let x = 0; x < W; x++) row += (x * 13 + y * 7 + seed) % 61 === 0 && x > 14 && x < 34 ? 'T' : '.';
    rows.push(row);
  }
  const units: { type: string; owner: number; x: number; y: number }[] = [];
  for (let p = 1; p <= 2; p++) {
    for (let i = 0; i < perSide; i++) {
      const type = BATTLE_ARMY[i % BATTLE_ARMY.length]!;
      // Melee in front, missiles behind, scouts on the wing; mirrored across the map centre.
      const rank = type === 'clubman' ? 0 : type === 'scout' ? 0 : 1.2;
      const file = i % 10;
      const dx = 8 + (p === 1 ? -rank : rank);
      const x = p === 1 ? dx + 0.5 : W - dx - 0.5;
      const y = 14 + file * 1.9 + (type === 'scout' ? 4 : 0) + 0.5;
      units.push({ type, owner: p, x, y: Math.min(W - 1.5, y) });
    }
  }
  return { seed, map: { w: W, h: W, ascii: rows }, players: [{ civ: 'greek' }, { civ: 'persian' }], scenario: { units } };
}

export interface BattleResult {
  ticks: number;
  survivors: [number, number];
  winner: number;
  tickMs: { p50: number; p99: number; max: number };
  /** Units that were blocked for more than 5 s at some point. */
  stuckUnits: number;
  trace: number[];
  final: number;
}

/** Run the battle; `clock` supplies wall time (performance.now) — injected so this module stays pure. */
export function runBattle(seed = 1, maxTicks = 20 * 300, clock: () => number = () => 0): BattleResult {
  const sim = Sim.create(battleConfig(seed));
  const w = sim.world;
  const e = w.ents;
  const armies: number[][] = [[], []];
  for (let s = 0; s < e.top; s++) if (e.alive[s] && e.kind[s] === EKind.unit) armies[e.owner[s]! - 1]!.push(e.handleOf(s));
  sim.step([
    { player: 1, cmd: { t: 'move', ids: armies[0]!, x: 40.5, y: 24.5, am: true } },
    { player: 2, cmd: { t: 'move', ids: armies[1]!, x: 7.5, y: 24.5, am: true } },
  ]);
  const times: number[] = [];
  const stuck = new Set<number>();
  const trace: number[] = [];
  const alive = (p: number) => armies[p - 1]!.filter((h) => e.slotOf(h) >= 0).length;
  let t = 1;
  for (; t < maxTicks; t++) {
    // Re-issue attack-moves every 10 s so survivors keep hunting (a real player would too).
    const cmds =
      t % 200 === 0
        ? [
            { player: 1, cmd: { t: 'move' as const, ids: armies[0]!.filter((h) => e.slotOf(h) >= 0), x: 40.5, y: 24.5, am: true } },
            { player: 2, cmd: { t: 'move' as const, ids: armies[1]!.filter((h) => e.slotOf(h) >= 0), x: 7.5, y: 24.5, am: true } },
          ].filter((c) => c.cmd.ids.length)
        : [];
    const t0 = clock();
    sim.step(cmds);
    times.push(clock() - t0);
    sim.drainEvents();
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.kind[s] === EKind.unit && e.stuck[s]! > 100) stuck.add(s);
    if (t % 100 === 0) trace.push(sim.hash());
    if (!alive(1) || !alive(2)) break;
  }
  const a = alive(1);
  const b = alive(2);
  const sorted = times.sort((x, y) => x - y);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  return {
    ticks: t,
    survivors: [a, b],
    winner: a && !b ? 1 : b && !a ? 2 : 0,
    tickMs: { p50: q(0.5), p99: q(0.99), max: sorted[sorted.length - 1] ?? 0 },
    stuckUnits: stuck.size,
    trace,
    final: sim.hash(),
  };
}
