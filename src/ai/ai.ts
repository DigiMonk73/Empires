import type { AiLevel } from '../data/setup.ts';
import type { Command } from '../sim/commands/types.ts';
import { Rng, STREAM, type RngState } from '../sim/math/rng.ts';
import type { KnownResource, OwnBuilding, OwnUnit, PlayerView } from '../sim/view/playerView.ts';
import { MilitaryBrain, type MilitaryState } from './military.ts';
import { NavalBrain, type NavalState } from './naval.ts';
import { RelicBrain, type RelicState } from './relics.ts';
import { upgrades } from './upgrades.ts';
import { AiDiplomacy, type DiplomacyState } from './diplomacy.ts';
import { TECH_BY_ID } from '../data/index.ts';

/**
 * Computer player (D10): reads only its PlayerView (fog-filtered) and answers with ordinary Commands, like a human
 * at a keyboard. v1 plays the standard opening of econ:9 — villagers non-stop, houses on time, granary at the
 * berries, storage pit at the woodline, farms once berries run out — and advances Tool → Bronze.
 * Military arrives in M6.5.
 */
interface LevelParams {
  /** Ticks between decisions. */
  think: number;
  /** Moves miners off a gold pile nobody is spending (M13.2: every level floated ~3000 gold by 30 min). */
  thrifty: boolean;
  /** Villager targets by age (index = age). */
  villagers: [number, number, number, number, number];
  /** Game minute by which the Tool Age is overdue (the Bronze Age: ten minutes later). */
  toolBy: number;
}

export const AI_LEVEL_PARAMS: Record<AiLevel, LevelParams> = {
  easiest: { think: 40, thrifty: false, villagers: [0, 10, 13, 16, 18], toolBy: 12 },
  easy: { think: 20, thrifty: false, villagers: [0, 16, 20, 24, 28], toolBy: 11 },
  moderate: { think: 10, thrifty: false, villagers: [0, 20, 26, 32, 36], toolBy: 10 }, // clicks Tool at ~20 villagers (econ:9)
  hard: { think: 6, thrifty: true, villagers: [0, 21, 30, 38, 44], toolBy: 9 },
  hardest: { think: 4, thrifty: true, villagers: [0, 21, 32, 42, 50], toolBy: 9 },
};

/** Target share of villagers per resource by age (food, wood, gold, stone). */
const SHARES: Record<number, [number, number, number, number]> = {
  1: [0.62, 0.38, 0, 0],
  2: [0.58, 0.32, 0.1, 0], // Bronze costs food: lean on it (econ:9 "1300 food by 12–14 min")
  // No stone: nothing the AI builds needs it yet (towers and walls come with AI v2, M13) — it only piled up.
  3: [0.47, 0.33, 0.2, 0],
  4: [0.45, 0.3, 0.25, 0],
};

/** The age advance researched from each age (index = current age). */
const NEXT_AGE_TECH: (string | null)[] = [null, 'toolAge', 'bronzeAge', 'ironAge', null];

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
  /** Gatherers per resource node, including orders given this think. */
  load: Map<number, number>;
  /** Wild animals seen (remembered while their spot is out of sight). */
  game: { h: number; type: string; x: number; y: number }[];
  /** Wood kept back from everything but a transport (an island running out of trees, KI-10). */
  woodReserve: number;
}

/** Can we pay `cost` and still keep the wood reserve? (The transport itself spends it: `s.v.canAfford`.) */
export function afford(s: Snapshot, cost: readonly number[]): boolean {
  return s.v.canAfford(cost) && ((cost[1] ?? 0) === 0 || s.me.res[1]! - cost[1]! >= s.woodReserve);
}

/** Everything an AiPlayer remembers, as plain JSON (saved games): restoring it resumes the same decisions. */
export interface AiState {
  rng: RngState;
  pending: [string, number][];
  explorer: number;
  exploreDone: boolean;
  loops: number;
  lastRebalance: number;
  game: { h: number; type: string; x: number; y: number }[];
  military: MilitaryState;
  /** Absent in saves made before the naval AI (M8.8). */
  naval?: NavalState;
  /** Standard-victory play (M14.6; absent in older saves). */
  relics?: RelicState;
  /** The computers' diplomacy toward a human (M13.8). */
  diplomacy?: DiplomacyState;
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
  private game = new Map<number, { h: number; type: string; x: number; y: number }>();
  readonly military: MilitaryBrain;
  readonly naval = new NavalBrain();
  readonly relics = new RelicBrain();
  readonly diplomacy = new AiDiplomacy();

  /** No army at all (economy benchmarks and the AI suite's timing runs). */
  readonly peaceful: boolean;

  constructor(player: number, level: AiLevel, seed: number, opts: { peaceful?: boolean; civ?: string } = {}) {
    this.player = player;
    this.level = level;
    this.p = AI_LEVEL_PARAMS[level];
    this.rng = new Rng(seed, STREAM.aiBase + player);
    this.military = new MilitaryBrain(this.rng, level, opts.civ ?? '');
    this.peaceful = !!opts.peaceful;
  }

  save(): AiState {
    return {
      rng: this.rng.getState(),
      pending: [...this.pending],
      explorer: this.explorer,
      exploreDone: this.exploreDone,
      loops: this.loops,
      lastRebalance: this.lastRebalance,
      game: [...this.game.values()].map((g) => ({ ...g })),
      military: this.military.save(),
      naval: this.naval.save(),
      relics: this.relics.save(),
      diplomacy: this.diplomacy.save(),
    };
  }

  restore(st: AiState): void {
    this.rng.setState(st.rng);
    this.pending = new Map(st.pending);
    this.explorer = st.explorer;
    this.exploreDone = st.exploreDone;
    this.loops = st.loops;
    this.lastRebalance = st.lastRebalance;
    this.game = new Map(st.game.map((g) => [g.h, { ...g }]));
    this.military.restore(st.military);
    this.naval.restore(st.naval);
    this.relics.restore(st.relics);
    this.diplomacy.restore(st.diplomacy);
  }

  /** Called every tick; decides every `think` ticks (staggered by player). Returns commands for this tick. */
  think(v: PlayerView): Command[] {
    if ((v.tick + this.player * 3) % this.p.think !== 0) return [];
    const me = v.me();
    if (me.defeated) return [];
    const s = this.snapshot(v, me);
    const cmds: Command[] = [];
    s.woodReserve = this.naval.woodReserve(s);
    this.diplomacy.update(s, this.player, cmds);
    this.explore(s, cmds);
    this.predators(s, cmds);
    this.finishFoundations(s, cmds);
    this.trainVillagers(s, cmds);
    this.houses(s, cmds);
    this.economyBuildings(s, cmds);
    this.ageUp(s, cmds);
    upgrades(s, this.level, this.ageSaving(s), cmds);
    this.farms(s, cmds);
    this.naval.update(this, s, cmds);
    if (!this.peaceful) this.military.update(this, s, cmds);
    this.relics.update(this, s, cmds);
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
    // Only what our villagers can actually walk to from home.
    const home = buildings.find((b) => b.type === 'townCenter');
    const known = v.resources().filter((r) => !home || v.reachable(home.x + home.size / 2 + 0.5, home.y, r.x - 0.5, r.y - 0.5, r.x + 0.5, r.y + 0.5));
    const jobOf = new Map<number, string>();
    for (const r of known) jobOf.set(r.i, r.job);
    const working: [number, number, number, number] = [0, 0, 0, 0];
    for (const u of villagers) {
      const job = u.order === 'farm' ? 'farm' : u.order === 'gather' ? (jobOf.get(u.target) ?? u.job) : null;
      if (job && RES_OF_JOB[job] !== undefined) working[RES_OF_JOB[job]!]!++;
    }
    const load = new Map<number, number>();
    for (const u of villagers) if (u.order === 'gather') load.set(u.target, (load.get(u.target) ?? 0) + 1);
    // Game memory: refresh what we see; forget animals whose spot is in view but who are gone (killed, fled).
    const visible = new Set<number>();
    for (const o of v.others()) {
      if (o.owner !== 0 || o.building) continue;
      visible.add(o.h);
      this.game.set(o.h, { h: o.h, type: o.type, x: o.x, y: o.y });
    }
    for (const [h, g] of this.game) if (!visible.has(h) && v.visible(Math.floor(g.x), Math.floor(g.y))) this.game.delete(h);
    return { v, me, units, villagers, buildings, tc, known, jobOf, working, busy: new Set(), load, game: [...this.game.values()], woodReserve: 0 };
  }

  has(s: Snapshot, type: string, doneOnly = false): OwnBuilding[] {
    return s.buildings.filter((b) => b.type === type && (!doneOnly || b.done));
  }

  // ── Opening scout: one villager walks a loop around the Town Center to find the berries, gold and stone. ──
  private explore(s: Snapshot, cmds: Command[]): void {
    if (!s.tc) return;
    // Once the first loop is done: if the age needs gold/stone we haven't found, walk a wider loop (18, then 26).
    if (this.exploreDone && this.loops < 4) {
      const share = SHARES[Math.min(4, s.me.age)]!;
      // Food we can reach without farms — berries, shore fish, game — running low (farms need the Tool Age + Market).
      const farming = s.me.age >= 2 && this.has(s, 'market', true).length > 0;
      const missing =
        (!farming && this.wildFood(s) < 1200) ||
        (share[2]! > 0 && !s.known.some((r) => r.job === 'gold')) ||
        (share[3]! > 0 && !s.known.some((r) => r.job === 'stone'));
      if (!missing) return;
      this.exploreDone = false;
      this.explorer = -1;
    }
    if (this.exploreDone) return;
    if (this.explorer < 0) {
      const u = s.villagers[s.villagers.length - 1];
      if (!u) return;
      this.explorer = u.h;
      // Wider each time, scaled to the map (a tiny map is 72 tiles across).
      const k = Math.max(1, s.v.mapW / 96);
      const r = [13, 20 * k, 28 * k, 36 * k][this.loops] ?? 36 * k;
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

  /** Food known without farms: berries, shore fish, carcasses, and remembered herds. */
  private wildFood(s: Snapshot): number {
    let n = 0;
    for (const r of s.known) if (FOOD_JOBS.has(r.job)) n += r.amount;
    for (const g of s.game) n += g.type === 'elephant' ? 300 : g.type === 'gazelle' ? 150 : 0;
    return n;
  }

  /**
   * Lions and alligators pick off villagers one at a time (working villagers don't fight back): gang up on any near
   * our villagers or buildings with the four nearest villagers — it's 100 food afterwards.
   */
  private predators(s: Snapshot, cmds: Command[]): void {
    for (const lion of s.game) {
      if (lion.type !== 'lion' && lion.type !== 'alligator') continue;
      const near = s.villagers.some((u) => dist(u.x, u.y, lion.x, lion.y) < 12) || s.buildings.some((b) => dist(b.x, b.y, lion.x, lion.y) < 12);
      if (!near) continue;
      const on = s.villagers.filter((u) => u.order === 'attack' && u.target === lion.h).length;
      if (on >= 4) continue;
      // (Not those already at it: re-sending them every think restarted their swing, and a lone alligator held
      // four villagers for minutes — M14.6b.)
      const group = s.villagers
        .filter((u) => !s.busy.has(u.h) && u.order !== 'build' && !(u.order === 'attack' && u.target === lion.h) && dist(u.x, u.y, lion.x, lion.y) < 16)
        .sort((a, b) => dist(a.x, a.y, lion.x, lion.y) - dist(b.x, b.y, lion.x, lion.y) || a.h - b.h)
        .slice(0, 4 - on)
        .map((u) => u.h);
      if (!group.length) continue;
      cmds.push({ t: 'act', ids: group, h: lion.h });
      for (const h of group) s.busy.add(h);
    }
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
    // An island's population goes to boats and warships too: villagers stop at 26 there (26 + 10 fishers + a
    // guard of 4 + a fleet of 8 fits the 50), 22 while an invasion needs the room for its army.
    // A later starting age: at most 60% of the population limit in villagers — an Iron start filled 50 with 36–44
    // villagers by 20 min and had no room left for an army (M14.6).
    const lateCap = s.v.startingAge() !== 'default' ? Math.floor(s.v.popLimit() * 0.6) : Infinity;
    const target = Math.min(this.p.villagers[s.me.age] ?? 20, this.naval.villagerCap(), lateCap);
    if (s.villagers.length + tc.queue >= target) return;
    if (s.me.pop + tc.queue + this.naval.popReserve(s) >= s.me.popCap) return; // (room for missing transports)
    if (!s.v.canAfford(s.v.cost('villager'))) return;
    if (s.v.trainBlocker(tc.h, 'villager')) return;
    if (this.overdue(s) && s.me.res[0]! < this.ageFood(s) + 50) return; // the age first
    cmds.push({ t: 'train', bld: tc.h, unit: 'villager' });
  }

  /**
   * The next age is overdue (Stone Age: `toolBy`, 10:00 for Moderate; Tool Age: ten minutes later): from here
   * food goes to the age before new villagers or soldiers — replacing losses one by one can stall a game forever.
   */
  overdue(s: Snapshot): boolean {
    const tech = NEXT_AGE_TECH[s.me.age];
    if (!tech || s.v.researching(tech)) return false;
    const by = this.p.toolBy + [0, 0, 10, 22][s.me.age]!; // Tool, then Bronze 10 min later, Iron 22
    return s.v.tick > by * 60 * 20 && s.villagers.length >= 12;
  }

  /** Food kept back for the next age while it isn't bought yet (0 once it is researching or there is none). */
  ageSaving(s: Snapshot): number {
    const tech = NEXT_AGE_TECH[s.me.age];
    return tech && !s.v.researching(tech) ? this.ageFood(s) : 0;
  }

  /** Food the next age costs (0 when there is none to take). */
  ageFood(s: Snapshot): number {
    const tech = NEXT_AGE_TECH[s.me.age];
    return tech ? (TECH_BY_ID.get(tech)!.cost as Partial<Record<string, number>>).food ?? 0 : 0;
  }

  private houses(s: Snapshot, cmds: Command[]): void {
    const building = s.buildings.some((b) => b.type === 'house' && !b.done);
    if (building || s.me.popCap >= s.v.popLimit() || this.isPending(s, 'house')) return; // (the game's limit, M14.3)
    const queued = s.tc?.queue ?? 0;
    if (s.me.popCap - s.me.pop - queued > 2) return;
    // Near the Town Center; on a cramped island start, anywhere within 16.
    if (s.tc && !this.build(s, cmds, 'house', s.tc.x, s.tc.y, 4, 9, 1)) this.build(s, cmds, 'house', s.tc.x, s.tc.y, 3, 16, 1);
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
    // A granary beside far food being worked (berries, shore fish, a herd's carcasses): one more in the Stone
    // Age (wood is needed for the Tool Age's Market and farms), a third later.
    if (this.has(s, 'granary', true).length && this.has(s, 'granary').length < (s.me.age >= 2 ? 3 : 2) && !this.isPending(s, 'granary')) {
      const drops = this.foodDrops(s);
      const far = new Map<number, number>();
      for (const u of s.villagers) {
        if (u.order !== 'gather' || !FOOD_JOBS.has(s.jobOf.get(u.target) ?? u.job ?? '') || s.jobOf.get(u.target) === 'farm') continue;
        const r = s.known.find((k) => k.i === u.target);
        if (r && drops.every((d) => dist(d.x, d.y, r.x, r.y) > 12)) far.set(r.i, (far.get(r.i) ?? 0) + 1);
      }
      // The far spot with the most gatherers (three or more), lowest node index on ties.
      const [top] = [...far].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      const at = top && s.known.find((k) => k.i === top[0]);
      if (at && this.build(s, cmds, 'granary', at.x, at.y, 2.5, 6, 1)) return;
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
    // Bronze Age: the Iron Age needs two of Temple / Government Center / Siege Workshop / Academy (econ:3).
    if (s.me.age >= 3 && !this.has(s, 'governmentCenter').length && !this.isPending(s, 'governmentCenter')) {
      if (this.build(s, cmds, 'governmentCenter', tc.x, tc.y, 6, 12, 2)) return;
    }
    const second = this.has(s, 'stable', true).length ? 'academy' : 'temple';
    if (s.me.age >= 3 && this.has(s, 'governmentCenter', true).length && !this.has(s, second).length && !this.isPending(s, second)) {
      if (this.build(s, cmds, second, tc.x, tc.y, 7, 13, 1)) return;
    }
  }

  private ageUp(s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    const tech = NEXT_AGE_TECH[s.me.age];
    if (!tc || !tech || s.v.researching(tech)) return;
    // A villager queued before the army filled the population waits for a house forever — and the age shares that
    // queue (M13.4: a Hardest AI sat in the Tool Age for 30 minutes on 14,000 resources). Take it out (refunded).
    // (At the game's population limit — 50 was hard-coded, and a 25 limit brought the deadlock back.)
    if (tc.queue > 0 && tc.housed && s.me.popCap >= s.v.popLimit() && !s.v.researchBlocker(tc.h, tech)) {
      cmds.push({ t: 'cancelTrain', bld: tc.h });
      return;
    }
    if (tc.queue > 0) return;
    // Boom to the villager target first — but under pressure (losses), go anyway once the clock says so.
    // (A full population can't reach the villager target: go.)
    if (s.villagers.length < (this.p.villagers[s.me.age] ?? 0) - 1 && !this.overdue(s) && s.me.pop < s.me.popCap - 1) return;
    if (s.v.researchBlocker(tc.h, tech)) return;
    cmds.push({ t: 'research', bld: tc.h, tech });
  }

  /** Farms (Tool Age + Market): replace the berries once they run low, around the granary / Town Center. */
  private farms(s: Snapshot, cmds: Command[]): void {
    if (s.me.age < 2 || !this.has(s, 'market', true).length || this.isPending(s, 'farm')) return;
    // Only berries near home put farming off: far bushes are slow trips and where raiders catch foragers.
    const home = s.tc ?? s.buildings[0];
    const berries = s.known.filter((r) => r.job === 'forage' && home && dist(r.x, r.y, home.x, home.y) < 16).reduce((a, r) => a + r.amount, 0);
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
    // Food piling up: no more fields for now. Saving for a building the next age needs (the Bronze Age wants a
    // second Tool Age building): don't spend its wood on fields.
    if (s.me.res[0]! > this.ageFood(s) + 600) return;
    if (s.me.age === 2 && !this.has(s, 'archeryRange').length && !this.has(s, 'stable').length && s.me.res[1]! < 150 + 75) return;
    if (this.military.wantsWorkshop(this, s) && s.me.res[1]! < 200 + 75) return; // the Siege Workshop's wood
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
      else if (this.exploreDone && this.loops < 4) {
        this.exploreDone = false;
        this.explorer = -1;
      }
    }
  }

  /**
   * Target share of villagers per resource. While the Tool Age researches, wood leads: the Market (and then
   * farms at 75 wood each) must be ready when the berries run out, or food and wood both collapse.
   */
  private shares(s: Snapshot): readonly number[] {
    if (s.me.age === 1 && s.v.researching('toolAge')) return [0.3, 0.7, 0, 0];
    // A later starting age (M14.3): three villagers in the Iron Age gather as a young town does — by how far the
    // town has grown, not the age it was handed (an Iron start floated 2,000 gold by 19 min, food and wood dry).
    const late = s.v.startingAge() !== 'default';
    const n = s.villagers.length;
    const stage = late ? Math.min(s.me.age, n < 12 ? 1 : n < 18 ? 2 : n < 22 ? 3 : 4) : s.me.age;
    const sh = [...SHARES[Math.min(4, stage)]!];
    // Floating a pile nobody is spending while another resource runs dry (2,000 food and no wood for the
    // Archery Range the Bronze Age needs): move a quarter of the villagers from the pile to the shortfall.
    const [food, wood] = s.me.res as [number, number];
    if (food > this.ageFood(s) + 600 && wood < 300 && sh[0]! > 0.3) {
      sh[0] = sh[0]! - 0.25;
      sh[1] = sh[1]! + 0.25;
    } else if (wood > 900 && food < 300 && sh[1]! > 0.2) {
      sh[1] = sh[1]! - 0.2;
      sh[0] = sh[0]! + 0.2;
    }
    // Wood floating while gold is short (Bronze-age soldiers want gold): a share of the woodcutters mine.
    if (s.me.age >= 3 && s.me.res[2]! < 150 && s.me.res[1]! > 800 && sh[1]! > 0.2) {
      sh[1] = sh[1]! - 0.15;
      sh[2] = sh[2]! + 0.15;
    }
    // Gold piling up past what the next age needs (Iron: 800) while food or wood is short: most miners go to
    // food and wood — the gold only buys soldiers and upgrades, and those wait for food (M13.2 traces).
    const next = NEXT_AGE_TECH[s.me.age];
    const ageGold = next && !s.v.researching(next) ? ((TECH_BY_ID.get(next)!.cost as Partial<Record<string, number>>).gold ?? 0) : 0;
    if ((this.p.thrifty || late) && s.me.res[2]! > ageGold + 500 && (food < 400 || wood < 300) && sh[2]! > 0.05) {
      const move = sh[2]! - 0.05;
      sh[2] = 0.05;
      if (food < 400) sh[0] = sh[0]! + (wood < 300 ? move * 0.6 : move);
      if (wood < 300) sh[1] = sh[1]! + (food < 400 ? move * 0.4 : move);
    }
    // An island lives off its fishing boats and builds its fleet from wood: villagers lean to wood, gold only for
    // upgrades (M8.8b — food and gold piled up while the Docks waited for wood).
    if (this.naval.onIsland) {
      const f = Math.min(0.15, sh[0]! - 0.25);
      const g = s.me.res[2]! > 600 ? Math.max(0, sh[2]! - 0.02) : 0; // (almost) no gold once there's a bank
      sh[0] = sh[0]! - Math.max(0, f);
      sh[2] = sh[2]! - g;
      sh[1] = sh[1]! + Math.max(0, f) + g;
    }
    return sh;
  }

  /** Resource slots ordered by how far each is below its target share (wood always included as a fallback). */
  private jobsByNeed(s: Snapshot): number[] {
    const share = this.shares(s);
    const total = s.working.reduce((a, b) => a + b, 0) + 1;
    const slots = [0, 1, 2, 3].filter((k) => share[k]! > 0 || k === 1);
    return slots.sort((a, b) => share[b]! - s.working[b]! / total - (share[a]! - s.working[a]! / total) || a - b);
  }

  /** The resource slot furthest below its target share. */
  private neededJob(s: Snapshot): number {
    const share = this.shares(s);
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
    // Only what this villager can walk to (M13.7): nodes across the water were chosen when nearer the Town Center.
    // A villager on other land (a wood expedition) works round where it stands.
    const land = this.landAt(s, u.x, u.y);
    const away = !!tc && !!land && land !== this.landAt(s, tc.x + tc.size / 2 + 0.5, tc.y);
    const hx = away || !tc ? u.x : tc.x;
    const hy = away || !tc ? u.y : tc.y;
    const load = s.load;
    const walkable = (r: KnownResource): boolean => !land || r.job === 'fish' || r.job === 'hunt' || this.nodeLand(s, r) === land;
    for (const job of jobs) {
      // Near home first, then further out (a new pit follows the gatherers there).
      let node: KnownResource | null = null;
      for (const reach of [30, 60, Infinity]) {
        const nodes = s.known.filter((r) => r.job === job && dist(r.x, r.y, hx, hy) < reach && (load.get(r.i) ?? 0) < (job === 'wood' ? 2 : 3) && !this.military.danger(s, r.x, r.y) && walkable(r));
        node = this.nearest(nodes, hx, hy);
        if (node) break;
      }
      if (node) {
        cmds.push({ t: 'gather', ids: [u.h], res: node.i });
        s.busy.add(u.h);
        load.set(node.i, (load.get(node.i) ?? 0) + 1);
        return true;
      }
      if (job === 'forage' && FOOD_JOBS.has('hunt')) {
        // Hunt a gazelle in sight near home.
        const others = s.game;
        // Up to 3 hunters per gazelle (it runs; the others close in).
        const hunters = (h: number) => s.villagers.filter((v) => v.order === 'attack' && v.target === h).length;
        // Near home first; herds further out once nothing nearer is left (a granary follows the hunters there).
        const drops = this.foodDrops(s);
        const reach = (o: { x: number; y: number }) => Math.min(...drops.map((d) => dist(d.x, d.y, o.x, o.y)));
        const prey = others.filter((o) => o.type === 'gazelle' && hunters(o.h) < 3);
        const p = this.nearest(prey.filter((o) => reach(o) < 26).map((o) => ({ ...o, i: o.h })), hx, hy) ?? this.nearest(prey.filter((o) => reach(o) < 48).map((o) => ({ ...o, i: o.h })), hx, hy);
        if (p) {
          cmds.push({ t: 'act', ids: [u.h], h: p.h });
          s.busy.add(u.h);
          return true;
        }
        // No easy food left and no farms yet: take an elephant (300 food) with a group of five — it fights back.
        if (s.me.age < 2 || !this.has(s, 'market', true).length) {
          const elephants = others.filter((o) => o.type === 'elephant' && reach(o) < 48);
          const el = this.nearest(elephants.map((o) => ({ ...o, i: o.h })), hx, hy);
          if (el) {
            const already = s.villagers.filter((v) => v.order === 'attack' && v.target === el.h).length;
            const group = s.villagers
              .filter((v) => (v.idle || v.job === 'wood') && !s.busy.has(v.h) && v.h !== u.h && (this.exploreDone || v.h !== this.explorer))
              .sort((a, b) => dist(a.x, a.y, el.x, el.y) - dist(b.x, b.y, el.x, el.y) || a.h - b.h)
              .slice(0, Math.max(0, 4 - already))
              .map((v) => v.h);
            const ids = [u.h, ...group];
            cmds.push({ t: 'act', ids, h: el.h });
            for (const h of ids) s.busy.add(h);
            return true;
          }
        }
      }
    }
    return false;
  }

  /** Every 20 s move one villager from the most over-staffed resource to the most under-staffed one. */
  private rebalance(s: Snapshot, cmds: Command[]): void {
    if (s.v.tick - this.lastRebalance < 400) return;
    this.lastRebalance = s.v.tick;
    const share = this.shares(s);
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

  /** Where food can be dropped off: Town Centers and finished granaries. */
  private foodDrops(s: Snapshot): { x: number; y: number }[] {
    const d = s.buildings.filter((b) => (b.type === 'granary' && b.done) || b.type === 'townCenter');
    return d.length ? d : s.tc ? [s.tc] : [];
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
    if (!s.v.canBuild(type) || !afford(s, s.v.cost(type))) return false;
    const size = type === 'house' || type === 'watchTower' ? 2 : type === 'wonder' ? 5 : 3;
    // On a cramped island start the usual spot may not exist: anywhere within 18 of the Town Center will do
    // (an island once sat in the Stone Age for two hours, its Tool-age buildings unplaceable).
    // On hilly maps a ring may hold no flat footprint: look a little further out before giving up (M10.2; flat
    // maps keep the old search exactly).
    const spot =
      this.findSpot(s, type, size, x, y, minD, maxD) ??
      (s.v.hilly ? this.findSpot(s, type, size, x, y, maxD + 1, maxD + 5) : null) ??
      (this.naval.onIsland && s.tc ? this.findSpot(s, type, size, s.tc.x, s.tc.y, 3, 18) : null);
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
        if (!s.v.canPlace(type, tx, ty) || !this.margin(s, tx, ty, size, type === 'farm' || type === 'dock')) continue;
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

  /** The land region at or next to (x, y), 0 if none within 3 tiles. */
  landAt(s: Snapshot, x: number, y: number): number {
    for (let r = 0; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const l = s.v.region(1, Math.floor(x) + dx, Math.floor(y) + dy);
          if (l) return l;
        }
      }
    }
    return 0;
  }

  /** Which land a resource node stands on (cached: trees and mines don't move; a forest's inner trees look outward). */
  private readonly nodeLands = new Map<number, number>();
  nodeLand(s: Snapshot, r: KnownResource): number {
    let l = this.nodeLands.get(r.i);
    if (l === undefined) {
      l = this.landAt(s, r.x, r.y);
      // Deep inside a forest: follow the trees outward until open ground (up to 8 tiles).
      for (let k = 4; !l && k <= 8; k++) {
        for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]] as const) l ||= s.v.region(1, Math.floor(r.x) + dx, Math.floor(r.y) + dy);
      }
      this.nodeLands.set(r.i, l);
    }
    return l;
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
