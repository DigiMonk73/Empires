import { Act, EKind } from '../core/entities.ts';
import { Sim } from '../index.ts';
import { compilePlayerStats } from '../rules/playerStats.ts';
import { RESOURCE_KINDS, buildingTypeIndex } from '../rules/registry.ts';
import { JOBS } from '../systems/gather.ts';
import type { SimConfig } from '../world.ts';

/**
 * Scripted economy benchmark (M4 exit gate). Villagers work every resource at typical distances — each resource
 * with a drop site beside it — for `minutes` of game time. Per job it measures:
 * - work rate: amount gathered ÷ time spent working (must match the research rate, econ:1.2),
 * - effective rate: amount delivered ÷ total time (walking and dropping off included),
 * and the share of villager time spent idle. Deterministic: same numbers on every engine.
 */
export interface JobMetrics {
  villagers: number;
  gathered: number;
  delivered: number;
  workSeconds: number;
  /** Measured work rate (per second of work). */
  workRate: number;
  /** Research rate for the job (per second). */
  expected: number;
  /** Delivered per villager per second of game time. */
  effectiveRate: number;
  /** effectiveRate ÷ expected. */
  efficiency: number;
}

export interface EconBenchResult {
  minutes: number;
  jobs: Record<string, JobMetrics>;
  /** % of villager-ticks spent idle (no activity) while holding an order or waiting for one. */
  idlePct: number;
  /** Idle % per starting group (forage, wood, gold, stone, fish, farm, hunt). */
  idleByGroup: Record<string, number>;
  hash: number;
}

const GROUPS = ['forage', 'wood', 'gold', 'stone', 'fish', 'farm', 'hunt'] as const;
const groupOf = (k: number): string => GROUPS[Math.min(6, Math.floor(k / 4))]!;

const W = 48;

export function econBenchConfig(): SimConfig {
  const rows: string[] = [];
  for (let y = 0; y < W; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      let c = '.';
      if (x >= 8 && x <= 11 && y >= 8 && y <= 9) c = 'B'; // 8 berry bushes
      if (x >= 37 && x <= 44 && y >= 5 && y <= 12) c = 'F'; // forest block
      if (x >= 8 && x <= 10 && y >= 36 && y <= 38 && (x + y) % 3 !== 0) c = 'G'; // gold cluster
      if (x >= 36 && x <= 38 && y >= 36 && y <= 38 && (x + y) % 3 !== 1) c = 'S'; // stone cluster
      if (x >= 42 && y >= 19 && y <= 28) c = x === 42 && y >= 20 && y <= 27 ? 'f' : '~'; // pond, fish on its west shore
      row += c;
    }
    rows.push(row);
  }
  const v = (x: number, y: number) => ({ type: 'villager', owner: 1, x, y });
  return {
    seed: 17,
    map: { w: W, h: W, ascii: rows },
    players: [{ civ: 'greek' }],
    startingResources: 'high',
    scenario: {
      buildings: [
        { type: 'townCenter', owner: 1, tx: 22, ty: 16 },
        { type: 'granary', owner: 1, tx: 9, ty: 11 },
        { type: 'storagePit', owner: 1, tx: 33, ty: 8 },
        { type: 'storagePit', owner: 1, tx: 12, ty: 36 },
        { type: 'storagePit', owner: 1, tx: 32, ty: 36 },
        { type: 'storagePit', owner: 1, tx: 38, ty: 22 },
        { type: 'storagePit', owner: 1, tx: 20, ty: 26 },
        { type: 'market', owner: 1, tx: 22, ty: 42 },
        { type: 'granary', owner: 1, tx: 28, ty: 26 },
        { type: 'farm', owner: 1, tx: 31, ty: 26 },
        { type: 'farm', owner: 1, tx: 25, ty: 26 },
        { type: 'farm', owner: 1, tx: 28, ty: 29 },
        { type: 'farm', owner: 1, tx: 28, ty: 23 },
      ],
      units: [
        ...[0, 1, 2, 3].map((i) => v(8.5 + i, 10.5)), // foragers
        ...[0, 1, 2, 3].map((i) => v(36.5, 6.5 + i * 1.5)), // woodcutters
        ...[0, 1, 2, 3].map((i) => v(11.5, 35.5 + i * 0.8)), // gold
        ...[0, 1, 2, 3].map((i) => v(35.5, 35.5 + i * 0.8)), // stone
        ...[0, 1, 2, 3].map((i) => v(41.5, 20.5 + i * 2)), // fishers
        ...[0, 1, 2, 3].map((i) => v(26.5 + i * 1.5, 33.5)), // farmers
        v(19.5, 30.5),
        v(20.5, 30.5), // hunters
      ],
      resources: [],
    },
  };
}

/** Gazelles for the hunters, placed after the scenario so they don't disturb the rest. */
const GAZELLES: [number, number][] = [
  [17.5, 33.5],
  [19.5, 35.5],
  [22.5, 33.5],
  [16.5, 36.5],
];

export function runEconBench(minutes = 8): EconBenchResult {
  const cfg = econBenchConfig();
  cfg.scenario = { ...cfg.scenario!, units: [...cfg.scenario!.units!, ...GAZELLES.map(([x, y]) => ({ type: 'gazelle', owner: 0, x, y }))] };
  const sim = Sim.create(cfg);
  const w = sim.world;
  const p = w.players[1]!;
  // Farms need the Tool Age (the market is placed by the scenario).
  p.techs.push('toolAge');
  p.stats = compilePlayerStats(p.civ, p.techs);
  const e = w.ents;
  const vills: number[] = [];
  const gaz: number[] = [];
  const farms: number[] = [];
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s]) continue;
    if (e.kind[s] === EKind.unit && e.owner[s] === 1) vills.push(s);
    else if (e.kind[s] === EKind.unit && e.owner[s] === 0) gaz.push(e.handleOf(s));
    else if (e.type[s] === buildingTypeIndex('farm')) {
      e.stock[s] = p.stats.farmFood; // sown with the Tool-Age stats
      farms.push(e.handleOf(s));
    }
  }
  // Each group takes the four nodes of its kind nearest its drop site.
  const nearest = (kind: string, x: number, y: number): number[] => {
    const out: [number, number][] = [];
    for (let i = 0; i < w.res.count; i++) {
      if (!RESOURCE_KINDS[w.res.kind[i]!]!.id.startsWith(kind)) continue;
      const dx = w.res.tx[i]! + 0.5 - x;
      const dy = w.res.ty[i]! + 0.5 - y;
      out.push([dx * dx + dy * dy, i]);
    }
    return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 4).map((o) => o[1]);
  };
  const targets = [
    ...nearest('berryBush', 10.5, 12.5),
    ...nearest('forestTree', 34.5, 9.5),
    ...nearest('goldMine', 13.5, 37.5),
    ...nearest('stoneMine', 33.5, 37.5),
    ...nearest('shoreFish', 39.5, 23.5),
  ];
  const cmds = targets.map((res, i) => ({ player: 1, cmd: { t: 'gather' as const, ids: [e.handleOf(vills[i]!)], res } }));
  farms.forEach((f, i) => cmds.push({ player: 1, cmd: { t: 'act', ids: [e.handleOf(vills[20 + i]!)], h: f } as never }));
  cmds.push({ player: 1, cmd: { t: 'act', ids: [e.handleOf(vills[24]!)], h: gaz[0]! } as never });
  cmds.push({ player: 1, cmd: { t: 'act', ids: [e.handleOf(vills[25]!)], h: gaz[1]! } as never });
  sim.step(cmds);

  const acc = new Map<string, { villagers: Set<number>; gathered: number; delivered: number; workTicks: number }>();
  const get = (job: string) => {
    let a = acc.get(job);
    if (!a) acc.set(job, (a = { villagers: new Set(), gathered: 0, delivered: 0, workTicks: 0 }));
    return a;
  };
  const prevJob = vills.map((s) => e.carryJob[s]!);
  const prevAmt = vills.map((s) => e.carryAmt[s]!);
  let idle = 0;
  let total = 0;
  const gIdle: Record<string, number> = {};
  const gTotal: Record<string, number> = {};
  const ticks = minutes * 60 * 20;
  for (let t = 0; t < ticks; t++) {
    const acts = vills.map((s) => e.act[s]!);
    sim.step();
    sim.drainEvents();
    for (let k = 0; k < vills.length; k++) {
      const s = vills[k]!;
      if (!e.alive[s]) continue;
      total++;
      const g = groupOf(k);
      gTotal[g] = (gTotal[g] ?? 0) + 1;
      if (e.act[s] === Act.idle && acts[k] === Act.idle) {
        idle++;
        gIdle[g] = (gIdle[g] ?? 0) + 1;
      }
      const job = JOBS[e.carryJob[s]! - 1];
      const amt = e.carryAmt[s]!;
      if (job && e.carryJob[s] === prevJob[k] && amt > prevAmt[k]!) {
        const a = get(job);
        a.villagers.add(s);
        a.gathered += amt - prevAmt[k]!;
        a.workTicks++;
      } else if (job && prevJob[k] === 0 && amt > 0) {
        const a = get(job);
        a.villagers.add(s);
        a.gathered += amt;
        a.workTicks++;
      }
      // A load that vanished with no job change was delivered.
      if (prevAmt[k]! > 0 && amt === 0 && prevJob[k]) get(JOBS[prevJob[k]! - 1]!).delivered += prevAmt[k]!;
      prevJob[k] = e.carryJob[s]!;
      prevAmt[k] = amt;
    }
  }
  const secs = ticks / 20;
  const jobs: Record<string, JobMetrics> = {};
  for (const [job, a] of acc) {
    const expected = p.stats.work[job as keyof typeof p.stats.work] * 20;
    const effectiveRate = a.delivered / (a.villagers.size * secs);
    jobs[job] = {
      villagers: a.villagers.size,
      gathered: a.gathered,
      delivered: a.delivered,
      workSeconds: a.workTicks / 20,
      workRate: a.gathered / (a.workTicks / 20),
      expected,
      effectiveRate,
      efficiency: effectiveRate / expected,
    };
  }
  const idleByGroup: Record<string, number> = {};
  for (const g of GROUPS) idleByGroup[g] = (100 * (gIdle[g] ?? 0)) / Math.max(1, gTotal[g] ?? 0);
  return { minutes, jobs, idlePct: (100 * idle) / Math.max(1, total), idleByGroup, hash: sim.hash() };
}
