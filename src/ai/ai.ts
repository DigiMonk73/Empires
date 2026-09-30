import type { AiLevel } from '../data/setup.ts';
import type { Command } from '../sim/commands/types.ts';
import { Rng, STREAM } from '../sim/math/rng.ts';
import type { KnownResource, OwnBuilding, OwnUnit, PlayerView } from '../sim/view/playerView.ts';
import { MilitaryBrain } from './military.ts';

/**
 * Computer player (D10): reads only its PlayerView (fog-filtered) and answers with ordinary Commands, like a human
 * at a keyboard. v1 plays the standard opening of econ:9 — villagers non-stop, houses on time, granary at the
 * berries, storage pit at the woodline, farms once berries run out — and advances Tool → Bronze.
 * Military arrives in M6.5.
 */
interface LevelParams {
  /** Ticks between decisions. */
  think: number;
  /** Villager targets by age (index = age). */
  villagers: [number, number, number, number, number];
}

export const AI_LEVEL_PARAMS: Record<AiLevel, LevelParams> = {
  easiest: { think: 40, villagers: [0, 12, 15, 18, 20] },
  easy: { think: 20, villagers: [0, 16, 20, 24, 28] },
  moderate: { think: 10, villagers: [0, 21, 26, 32, 36] },
  hard: { think: 6, villagers: [0, 23, 30, 38, 44] },
  hardest: { think: 4, villagers: [0, 25, 32, 42, 50] },
};

/** Target share of villagers per resource by age (food, wood, gold, stone). */
const SHARES: Record<number, [number, number, number, number]> = {
  1: [0.62, 0.38, 0, 0],
  2: [0.5, 0.35, 0.15, 0],
  3: [0.45, 0.3, 0.2, 0.05],
  4: [0.42, 0.28, 0.22, 0.08],
};

const FOOD_JOBS = new Set(['forage', 'farm', 'hunt', 'fish']);
const RES_OF_JOB: Record<string, number> = { forage: 0, farm: 0, hunt: 0, fish: 0, wood: 1, gold: 2, stone: 3 };

export interface Snapshot {
  v: PlayerView;
  me: ReturnType<PlayerView['me']>;
  units: OwnUnit[];
  villagers: OwnUnit[];
  buildings: OwnBuilding[];
  tc: OwnBuilding | null;
  known: KnownResource[];
  /** Resource index → job, for reading gatherers' targets. */
  jobOf: Map<number, string>;
  /** Villagers per resource slot (food, wood, gold, stone) and builders. */
  working: [number, number, number, number];
  /** Handles already given a command this think. */
  busy: Set<number>;
}

export class AiPlayer {
  readonly player: number;
  readonly level: AiLevel;
  private readonly p: LevelParams;
  private readonly rng: Rng;
  /** Building type → tick a foundation was ordered (so we don't order it twice while it appears). */
  private pending = new Map<string, number>();
  private explorer = -1;
  private exploreDone = false;
  /** Exploration loops walked so far (radius 11, 18, 26). */
  private loops = 0;
  private lastRebalance = 0;
  readonly military: MilitaryBrain;

  /** No army at all (economy benchmarks and the AI suite's timing runs). */
  readonly peaceful: boolean;

  constructor(player: number, level: AiLevel, seed: number, opts: { peaceful?: boolean } = {}) {
    this.player = player;
    this.level = level;
    this.p = AI_LEVEL_PARAMS[level];
    this.rng = new Rng(seed, STREAM.aiBase + player);
    this.military = new MilitaryBrain(this.rng, level);
    this.peaceful = !!opts.peaceful;
  }

  /** Called every tick; decides every `think` ticks (staggered by player). Returns commands for this tick. */
  think(v: PlayerView): Command[] {
    if ((v.tick + this.player * 3) % this.p.think !== 0) return [];
    const me = v.me();
    if (me.defeated) return [];
    const s = this.snapshot(v, me);
    const cmds: Command[] = [];
    this.explore(s, cmds);
    this.finishFoundations(s, cmds);
    this.trainVillagers(s, cmds);
    this.houses(s, cmds);
    this.economyBuildings(s, cmds);
    this.ageUp(s, cmds);
    this.farms(s, cmds);
    if (!this.peaceful) this.military.update(this, s, cmds);
    this.assignIdle(s, cmds);
    this.rebalance(s, cmds);
    return cmds;
  }

  // ── Knowledge ─────────────────────────────────────────────────────────────────────────────────────────────
  private snapshot(v: PlayerView, me: ReturnType<PlayerView['me']>): Snapshot {
    const units = v.ownUnits();
    const villagers = units.filter((u) => u.cls === 'villager');
    const buildings = v.ownBuildings();
    const tc = buildings.find((b) => b.type === 'townCenter' && b.done) ?? null;
    const known = v.resources();
    const jobOf = new Map<number, string>();
    for (const r of known) jobOf.set(r.i, r.job);
    const working: [number, number, number, number] = [0, 0, 0, 0];
    for (const u of villagers) {
      const job = u.order === 'farm' ? 'farm' : u.order === 'gather' ? (jobOf.get(u.target) ?? u.job) : null;
      if (job && RES_OF_JOB[job] !== undefined) working[RES_OF_JOB[job]!]!++;
    }
    return { v, me, units, villagers, buildings, tc, known, jobOf, working, busy: new Set() };
  }

  has(s: Snapshot, type: string, doneOnly = false): OwnBuilding[] {
    return s.buildings.filter((b) => b.type === type && (!doneOnly || b.done));
  }

  // ── Opening scout: one villager walks a loop around the Town Center to find the berries, gold and stone. ──
  private explore(s: Snapshot, cmds: Command[]): void {
    if (!s.tc) return;
    // Once the first loop is done: if the age needs gold/stone we haven't found, walk a wider loop (18, then 26).
    if (this.exploreDone && this.loops < 3) {
      const share = SHARES[Math.min(4, s.me.age)]!;
      const missing = (share[2]! > 0 && !s.known.some((r) => r.job === 'gold')) || (share[3]! > 0 && !s.known.some((r) => r.job === 'stone'));
      if (!missing) return;
      this.exploreDone = false;
      this.explorer = -1;
    }
    if (this.exploreDone) return;
    if (this.explorer < 0) {
      const u = s.villagers[s.villagers.length - 1];
      if (!u) return;
      this.explorer = u.h;
      const r = [11, 18, 26][this.loops] ?? 26;
      this.loops++;
      const pts: [number, number][] = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];
      const start = this.rng.int(pts.length);
      pts.forEach((_, k) => {
        const [dx, dy] = pts[(start + k) % pts.length]!;
        const x = Math.min(s.v.mapW - 1.5, Math.max(1.5, s.tc!.x + dx * r));
        const y = Math.min(s.v.mapH - 1.5, Math.max(1.5, s.tc!.y + dy * r));
        cmds.push({ t: 'move', ids: [u.h], x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4, ...(k > 0 ? { queue: true } : {}) });
      });
      s.busy.add(u.h);
      return;
    }
    const u = s.villagers.find((x) => x.h === this.explorer);
    if (!u || u.idle) this.exploreDone = true;
    else s.busy.add(u.h);
  }

  /** Foundations nobody is building (builder killed or pulled away): send the nearest villager back. */
  private finishFoundations(s: Snapshot, cmds: Command[]): void {
    for (const b of s.buildings) {
      if (b.done || b.kind === 'farm' || s.villagers.some((u) => u.order === 'build' && u.target === b.h)) continue;
      const pool = s.villagers.filter((u) => !s.busy.has(u.h) && u.order !== 'build' && (this.exploreDone || u.h !== this.explorer));
      pool.sort((a, c) => dist(a.x, a.y, b.x, b.y) - dist(c.x, c.y, b.x, b.y) || a.h - c.h);
      const u = pool[0];
      if (!u) return;
      cmds.push({ t: 'construct', ids: [u.h], h: b.h });
      s.busy.add(u.h);
    }
  }

  // ── Villagers ────────────────────────────────────────────────────────────────────────────────────────────
  private trainVillagers(s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    if (!tc || tc.queue >= 2) return;
    const target = this.p.villagers[s.me.age] ?? 20;
    if (s.villagers.length + tc.queue >= target) return;
    if (s.me.pop + tc.queue >= s.me.popCap) return;
    if (!s.v.canAfford(s.v.cost('villager'))) return;
    if (s.v.trainBlocker(tc.h, 'villager')) return;
    cmds.push({ t: 'train', bld: tc.h, unit: 'villager' });
  }

  private houses(s: Snapshot, cmds: Command[]): void {
    const building = s.buildings.some((b) => b.type === 'house' && !b.done);
    if (building || s.me.popCap >= 50 || this.isPending(s, 'house')) return;
    const queued = s.tc?.queue ?? 0;
    if (s.me.popCap - s.me.pop - queued > 2) return;
    if (s.tc) this.build(s, cmds, 'house', s.tc.x, s.tc.y, 4, 9, 1);
  }

  /** Drop sites and the buildings the age advances need (econ:3, econ:9). */
  private economyBuildings(s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    if (!tc || s.villagers.length < 5) return;
    // Granary beside the berries (else beside the Town Center).
    if (!this.has(s, 'granary').length && !this.isPending(s, 'granary')) {
      const b = this.nearest(s.known.filter((r) => r.job === 'forage'), tc.x, tc.y);
      const at = b && dist(b.x, b.y, tc.x, tc.y) < 22 ? b : tc;
      if (this.build(s, cmds, 'granary', at.x, at.y, at === tc ? 5 : 2.5, at === tc ? 9 : 5, 1)) return;
    }
    // Storage pit at the nearest woodline.
    if (!this.has(s, 'storagePit').length && !this.isPending(s, 'storagePit') && s.working[1] >= 2) {
      const t = this.nearest(s.known.filter((r) => r.job === 'wood'), tc.x, tc.y);
      if (t && dist(t.x, t.y, tc.x, tc.y) > 5 && this.build(s, cmds, 'storagePit', t.x, t.y, 2.5, 5, 1)) return;
    }
    // More pits when mining far from any drop site.
    for (const job of ['gold', 'stone']) {
      if (s.working[RES_OF_JOB[job]!]! < 2 || this.isPending(s, 'storagePit')) continue;
      const mine = this.nearest(s.known.filter((r) => r.job === job), tc.x, tc.y);
      if (!mine) continue;
      const drops = s.buildings.filter((b) => b.type === 'storagePit' || b.type === 'townCenter');
      if (drops.every((d) => dist(d.x, d.y, mine.x, mine.y) > 8) && this.build(s, cmds, 'storagePit', mine.x, mine.y, 2.5, 5, 1)) return;
    }
    // Tool Age: a Market (farms) and the Barracks → Archery Range pair that also unlocks Bronze.
    if (s.me.age >= 1 && !this.has(s, 'barracks').length && this.has(s, 'granary', true).length && this.has(s, 'storagePit', true).length && s.villagers.length >= 14) {
      if (!this.isPending(s, 'barracks') && this.build(s, cmds, 'barracks', tc.x, tc.y, 6, 12, 1)) return;
    }
    if (s.me.age >= 2 && !this.has(s, 'market').length && !this.isPending(s, 'market')) {
      if (this.build(s, cmds, 'market', tc.x, tc.y, 6, 12, 2)) return;
    }
    if (s.me.age >= 2 && this.has(s, 'market').length && !this.has(s, 'archeryRange').length && !this.isPending(s, 'archeryRange')) {
      if (this.build(s, cmds, 'archeryRange', tc.x, tc.y, 7, 13, 1)) return;
    }
  }

  private ageUp(s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    if (!tc || tc.queue > 0) return;
    const tech = s.me.age === 1 ? 'toolAge' : s.me.age === 2 ? 'bronzeAge' : null;
    if (!tech || s.v.researching(tech)) return;
    // Boom to the villager target first — but under pressure (losses), go anyway once the clock says so.
    const late = s.v.tick > (s.me.age === 1 ? 10 : 20) * 60 * 20 && s.villagers.length >= 12;
    if (s.villagers.length < (this.p.villagers[s.me.age] ?? 0) - 1 && !late) return;
    if (s.v.researchBlocker(tc.h, tech)) return;
    cmds.push({ t: 'research', bld: tc.h, tech });
  }

  /** Farms (Tool Age + Market): replace the berries once they run low, around the granary / Town Center. */
  private farms(s: Snapshot, cmds: Command[]): void {
    if (s.me.age < 2 || !this.has(s, 'market', true).length || this.isPending(s, 'farm')) return;
    const berries = s.known.filter((r) => r.job === 'forage').reduce((a, r) => a + r.amount, 0);
    const want = Math.round((this.p.villagers[s.me.age] ?? 20) * (SHARES[s.me.age]![0]!));
    const farms = s.buildings.filter((b) => b.kind === 'farm');
    const freeFarms = farms.filter((f) => f.done && f.farmer < 0);
    if (freeFarms.length) {
      // Put an idle / surplus villager on it.
      const u = s.villagers.find((x) => x.idle && !s.busy.has(x.h));
      if (u) {
        cmds.push({ t: 'act', ids: [u.h], h: freeFarms[0]!.h });
        s.busy.add(u.h);
      }
      return;
    }
    if (berries > 400 || farms.length >= want - 1) return;
    const hub = this.has(s, 'granary', true)[0] ?? s.tc;
    if (hub) this.build(s, cmds, 'farm', hub.x, hub.y, 3, 8, 1);
  }

  // ── Gathering ────────────────────────────────────────────────────────────────────────────────────────────
  private assignIdle(s: Snapshot, cmds: Command[]): void {
    const idle = s.villagers.filter((u) => u.idle && !s.busy.has(u.h) && (this.exploreDone || u.h !== this.explorer));
    for (const u of idle) {
      // Most-needed resource first, then the others; if nothing we know of is left, go and look for more.
      const order = this.jobsByNeed(s);
      const slot = order.find((k) => this.sendTo(s, cmds, u, k));
      if (slot !== undefined) s.working[slot]!++;
      else if (this.exploreDone && this.loops < 3) {
        this.exploreDone = false;
        this.explorer = -1;
      }
    }
  }

  /** Resource slots ordered by how far each is below its target share (wood always included as a fallback). */
  private jobsByNeed(s: Snapshot): number[] {
    const share = SHARES[Math.min(4, s.me.age)]!;
    const total = s.working.reduce((a, b) => a + b, 0) + 1;
    const slots = [0, 1, 2, 3].filter((k) => share[k]! > 0 || k === 1);
    return slots.sort((a, b) => share[b]! - s.working[b]! / total - (share[a]! - s.working[a]! / total) || a - b);
  }

  /** The resource slot furthest below its target share. */
  private neededJob(s: Snapshot): number {
    const share = SHARES[Math.min(4, s.me.age)]!;
    const total = s.working.reduce((a, b) => a + b, 0) + 1;
    let best = 0;
    let bestGap = -Infinity;
    for (let k = 0; k < 4; k++) {
      if (!share[k]) continue;
      const gap = share[k]! - s.working[k]! / total;
      if (gap > bestGap) {
        bestGap = gap;
        best = k;
      }
    }
    return best;
  }

  /** Send villager `u` to gather resource slot `slot` (food: berries, then hunting, then a free farm). */
  private sendTo(s: Snapshot, cmds: Command[], u: OwnUnit, slot: number): boolean {
    const jobs = slot === 0 ? ['forage', 'hunt', 'fish'] : slot === 1 ? ['wood'] : slot === 2 ? ['gold'] : ['stone'];
    const tc = s.tc;
    const hx = tc?.x ?? u.x;
    const hy = tc?.y ?? u.y;
    const load = new Map<number, number>();
    for (const v of s.villagers) if (v.order === 'gather') load.set(v.target, (load.get(v.target) ?? 0) + 1);
    for (const job of jobs) {
      // Near home first, then further out (a new pit follows the gatherers there).
      let node: KnownResource | null = null;
      for (const reach of [30, 60, Infinity]) {
        const nodes = s.known.filter((r) => r.job === job && dist(r.x, r.y, hx, hy) < reach && (load.get(r.i) ?? 0) < (job === 'wood' ? 2 : 3));
        node = this.nearest(nodes, hx, hy);
        if (node) break;
      }
      if (node) {
        cmds.push({ t: 'gather', ids: [u.h], res: node.i });
        s.busy.add(u.h);
        return true;
      }
      if (job === 'forage' && FOOD_JOBS.has('hunt')) {
        // Hunt a gazelle in sight near home.
        const prey = s.v.others().filter((o) => o.owner === 0 && o.type === 'gazelle' && dist(o.x, o.y, hx, hy) < 22);
        const p = this.nearest(prey.map((o) => ({ ...o, i: o.h })), hx, hy);
        if (p) {
          cmds.push({ t: 'act', ids: [u.h], h: p.h });
          s.busy.add(u.h);
          return true;
        }
      }
    }
    return false;
  }

  /** Every 20 s move one villager from the most over-staffed resource to the most under-staffed one. */
  private rebalance(s: Snapshot, cmds: Command[]): void {
    if (s.v.tick - this.lastRebalance < 400) return;
    this.lastRebalance = s.v.tick;
    const share = SHARES[Math.min(4, s.me.age)]!;
    const total = s.working.reduce((a, b) => a + b, 0);
    if (total < 6) return;
    let over = -1;
    let overBy = 1.5;
    for (let k = 0; k < 4; k++) {
      const by = s.working[k]! - share[k]! * total;
      if (by > overBy) {
        overBy = by;
        over = k;
      }
    }
    if (over < 0) return;
    const need = this.neededJob(s);
    if (need === over) return;
    const u = s.villagers.find((x) => !s.busy.has(x.h) && x.order === 'gather' && RES_OF_JOB[s.jobOf.get(x.target) ?? x.job ?? ''] === over);
    if (u && this.sendTo(s, cmds, u, need)) {
      s.working[over]!--;
      s.working[need]!++;
    }
  }

  // ── Building ─────────────────────────────────────────────────────────────────────────────────────────────
  isPending(s: Snapshot, type: string): boolean {
    const t = this.pending.get(type);
    return t !== undefined && s.v.tick - t < 20 * 8;
  }

  /**
   * Place `type` with its centre `minD`–`maxD` tiles from (x, y), keeping a clear tile around it (no walling in),
   * and send `nBuilders` villagers (wood/idle first). Returns true if ordered.
   */
  build(s: Snapshot, cmds: Command[], type: string, x: number, y: number, minD: number, maxD: number, nBuilders: number): boolean {
    if (!s.v.canBuild(type) || !s.v.canAfford(s.v.cost(type))) return false;
    const size = type === 'house' || type === 'watchTower' ? 2 : 3;
    const spot = this.findSpot(s, type, size, x, y, minD, maxD);
    if (!spot) return false;
    const pool = s.villagers.filter((u) => !s.busy.has(u.h) && (this.exploreDone || u.h !== this.explorer) && u.order !== 'build');
    pool.sort((a, b) => rank(a) - rank(b) || dist(a.x, a.y, spot[0], spot[1]) - dist(b.x, b.y, spot[0], spot[1]) || a.h - b.h);
    const ids = pool.slice(0, nBuilders).map((u) => u.h);
    if (!ids.length) return false;
    for (const h of ids) s.busy.add(h);
    cmds.push({ t: 'build', ids, type, tx: spot[0], ty: spot[1] });
    this.pending.set(type, s.v.tick);
    return true;
  }

  private findSpot(s: Snapshot, type: string, size: number, x: number, y: number, minD: number, maxD: number): [number, number] | null {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const offset = this.rng.int(8);
    for (let r = Math.floor(minD); r <= Math.ceil(maxD); r++) {
      const ring: [number, number][] = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
      for (let k = 0; k < ring.length; k++) {
        const [dx, dy] = ring[(k + offset * Math.max(1, Math.floor(ring.length / 8))) % ring.length]!;
        const tx = cx + dx - Math.floor(size / 2);
        const ty = cy + dy - Math.floor(size / 2);
        const d = dist(tx + size / 2, ty + size / 2, x, y);
        if (d < minD || d > maxD) continue;
        if (!s.v.canPlace(type, tx, ty) || !this.margin(s, tx, ty, size, type === 'farm')) continue;
        return [tx, ty];
      }
    }
    return null;
  }

  /** A one-tile clear ring around the footprint (farms may touch other farms). */
  private margin(s: Snapshot, tx: number, ty: number, size: number, farm: boolean): boolean {
    if (farm) return true;
    for (let k = -1; k <= size; k++) {
      for (const [x, y] of [[tx + k, ty - 1], [tx + k, ty + size], [tx - 1, ty + k], [tx + size, ty + k]] as const) {
        if (!s.v.clear(x, y)) return false;
      }
    }
    return true;
  }

  private nearest<T extends { x: number; y: number; i: number }>(list: T[], x: number, y: number): T | null {
    let best: T | null = null;
    let bd = Infinity;
    for (const r of list) {
      const d = dist(r.x, r.y, x, y);
      if (d < bd || (d === bd && best && r.i < best.i)) {
        bd = d;
        best = r;
      }
    }
    return best;
  }
}

/** Builders: prefer idle villagers, then woodcutters, then anyone. */
function rank(u: OwnUnit): number {
  return u.idle ? 0 : u.job === 'wood' ? 1 : 2;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
