import type { AiLevel } from '../data/setup.ts';
import { TECH_BY_ID } from '../data/index.ts';
import type { Command } from '../sim/commands/types.ts';
import type { Rng } from '../sim/math/rng.ts';
import type { OwnUnit, SeenEntity } from '../sim/view/playerView.ts';
import { dist, type AiPlayer, type Snapshot } from './ai.ts';

/**
 * AI military v1 (M6.5). Two plans, picked once per game: a *rush* (Barracks early, clubmen → axemen and
 * slingers, first wave in the Stone/Tool Age) or a *boom* (economy first; bowmen, scouts and cavalry, first wave
 * in the Bronze Age) — the two families of econ:9 build orders. Waves attack-move at the nearest known enemy
 * building (or the likely enemy side of the map); troops at a base with nobody left to fight are sent at its
 * buildings. Any enemy army seen near home pulls the whole army back to defend.
 */
export type Plan = 'rush' | 'boom';

/** Soldiers wanted by age (index = age). */
const ARMY: Record<Plan, number[]> = { rush: [0, 6, 14, 18, 22], boom: [0, 0, 6, 18, 22] };
/** Soldiers ready before a wave goes out. */
const WAVE: Record<Plan, number[]> = { rush: [0, 6, 8, 10, 12], boom: [0, 99, 99, 12, 14] };
const NON_MILITARY = new Set(['villager', 'fishingShip', 'tradeShip', 'transport']);
const NEXT_AGE: Record<number, string> = { 1: 'toolAge', 2: 'bronzeAge', 3: 'ironAge' };

export interface MilitaryState {
  plan: Plan;
  lastPush: number;
  sweep: number;
  rallySet: number[];
}

export class MilitaryBrain {
  plan: Plan;
  private lastPush = -9999;
  /** Search pattern cursor (6×6 grid of waypoints) for hunting down the last enemies. */
  private sweep = 0;
  private rallySet = new Set<number>();
  private readonly patience: number;

  constructor(rng: Rng, level: AiLevel) {
    this.plan = rng.chance(0.5) ? 'rush' : 'boom';
    // Easier levels wait longer between pushes.
    this.patience = { easiest: 1800, easy: 1200, moderate: 600, hard: 400, hardest: 300 }[level];
  }

  save(): MilitaryState {
    return { plan: this.plan, lastPush: this.lastPush, sweep: this.sweep, rallySet: [...this.rallySet] };
  }

  restore(st: MilitaryState): void {
    this.plan = st.plan;
    this.lastPush = st.lastPush;
    this.sweep = st.sweep;
    this.rallySet = new Set(st.rallySet);
  }

  update(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const army = s.units.filter((u) => !NON_MILITARY.has(u.cls));
    this.buildings(ai, s, cmds);
    this.research(s, cmds);
    this.train(s, cmds, army);
    this.rally(s, cmds);
    if (!this.defend(s, cmds, army)) this.attack(s, cmds, army);
  }

  private buildings(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    if (!tc) return;
    // A rush wants its Barracks early.
    if (this.plan === 'rush' && s.villagers.length >= 9 && !ai.has(s, 'barracks').length && !ai.isPending(s, 'barracks')) {
      ai.build(s, cmds, 'barracks', tc.x, tc.y, 6, 12, 1);
      return;
    }
    // Tool Age: a Stable next to the range (scouts, then cavalry); a second Barracks for a rush.
    if (s.me.age >= 2 && ai.has(s, 'barracks', true).length && !ai.has(s, 'stable').length && !ai.isPending(s, 'stable') && ai.has(s, 'market').length) {
      ai.build(s, cmds, 'stable', tc.x, tc.y, 7, 13, 1);
      return;
    }
    if (this.plan === 'rush' && s.me.age >= 2 && ai.has(s, 'barracks').length === 1 && !ai.isPending(s, 'barracks') && s.villagers.length >= 18) {
      ai.build(s, cmds, 'barracks', tc.x, tc.y, 7, 13, 1);
    }
  }

  private research(s: Snapshot, cmds: Command[]): void {
    const barracks = s.buildings.find((b) => b.type === 'barracks' && b.done && b.queue === 0);
    if (barracks && s.me.age >= 2 && !s.me.techs.includes('battleAxe') && !s.v.researching('battleAxe') && !s.v.researchBlocker(barracks.h, 'battleAxe')) {
      cmds.push({ t: 'research', bld: barracks.h, tech: 'battleAxe' });
    }
  }

  private train(s: Snapshot, cmds: Command[], army: OwnUnit[]): void {
    const want = ARMY[this.plan][s.me.age] ?? 0;
    let have = army.length;
    for (const b of s.buildings) {
      if (!b.done || b.queue >= 2 || have >= want || s.me.pop >= s.me.popCap) continue;
      const unit = this.pick(s, b.type, have);
      if (!unit || s.v.trainBlocker(b.h, unit) || !s.v.canAfford(s.v.cost(unit))) continue;
      // Keep food for the next age / villagers while booming.
      if (this.plan === 'boom' && s.me.age < 3 && s.me.res[0]! < 150) continue;
      // Saving for the next age: soldiers only from what's left over (the age comes first, econ:9).
      const next = NEXT_AGE[s.me.age];
      if (next && !s.me.techs.includes(next) && !s.v.researching(next)) {
        const c = TECH_BY_ID.get(next)!.cost as Partial<Record<string, number>>;
        const u = s.v.cost(unit);
        if (s.me.res[0]! - u[0]! < (c.food ?? 0) && s.me.res[0]! >= (c.food ?? 0) * 0.4) continue;
      }
      cmds.push({ t: 'train', bld: b.h, unit });
      have++;
    }
  }

  /** Which unit a building trains now: a mix that answers archers with slingers. */
  private pick(s: Snapshot, building: string, n: number): string | null {
    switch (building) {
      case 'barracks':
        return s.me.age >= 2 && n % 3 === 2 ? 'slinger' : 'clubman';
      case 'archeryRange':
        return 'bowman';
      case 'stable':
        return s.me.age >= 3 && s.v.canAfford(s.v.cost('cavalry')) ? 'cavalry' : 'scout';
      default:
        return null;
    }
  }

  /** New military buildings send their troops to a gathering point in front of the Town Center. */
  private rally(s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    if (!tc) return;
    const [gx, gy] = this.enemyGuess(s);
    const len = dist(gx, gy, tc.x, tc.y) || 1;
    const rx = Math.round((tc.x + ((gx - tc.x) / len) * 6) * 4) / 4;
    const ry = Math.round((tc.y + ((gy - tc.y) / len) * 6) * 4) / 4;
    const blds = s.buildings.filter((b) => b.done && !this.rallySet.has(b.h) && ['barracks', 'archeryRange', 'stable'].includes(b.type));
    if (!blds.length) return;
    for (const b of blds) this.rallySet.add(b.h);
    cmds.push({ t: 'rally', blds: blds.map((b) => b.h), x: rx, y: ry });
  }

  private enemies(s: Snapshot): SeenEntity[] {
    const team = s.me.team;
    return s.v.others().filter((o) => o.owner > 0 && s.v.teamOf(o.owner) !== team);
  }

  /** Where the enemy probably is: its known buildings, else across the map centre from us. */
  private enemyGuess(s: Snapshot): [number, number] {
    const tc = s.tc;
    const known = this.enemies(s).filter((o) => o.building);
    if (known.length && tc) {
      known.sort((a, b) => dist(a.x, a.y, tc.x, tc.y) - dist(b.x, b.y, tc.x, tc.y) || a.h - b.h);
      return [known[0]!.x, known[0]!.y];
    }
    const cx = s.v.mapW / 2;
    const cy = s.v.mapH / 2;
    // Nothing known: first across the map from us; once that's explored, sweep the unexplored parts.
    const across: [number, number] = tc ? [2 * cx - tc.x, 2 * cy - tc.y] : [cx, cy];
    if (!s.v.explored(Math.floor(across[0]), Math.floor(across[1]))) return across;
    const step = Math.max(8, Math.floor(s.v.mapW / 6));
    for (let k = 0; k < 64; k++) {
      const i = (this.sweep + k) % 36;
      const x = Math.min(s.v.mapW - 2, step / 2 + (i % 6) * step);
      const y = Math.min(s.v.mapH - 2, step / 2 + Math.floor(i / 6) * step);
      if (!s.v.explored(Math.floor(x), Math.floor(y))) {
        this.sweep = i;
        return [x, y];
      }
    }
    this.sweep = (this.sweep + 7) % 36; // all explored: keep patrolling
    return [step / 2 + (this.sweep % 6) * step, step / 2 + Math.floor(this.sweep / 6) * step];
  }

  /** An enemy army near our buildings: everyone turns out to meet it. */
  private defend(s: Snapshot, cmds: Command[], army: OwnUnit[]): boolean {
    const threats = this.enemies(s).filter((o) => !o.building && s.buildings.some((b) => dist(b.x, b.y, o.x, o.y) < 14));
    if (!threats.length || !army.length) return false;
    const t = threats[0]!;
    const free = army.filter((u) => u.order !== 'attack');
    if (free.length) cmds.push({ t: 'move', ids: free.map((u) => u.h), x: Math.round(t.x * 4) / 4, y: Math.round(t.y * 4) / 4, am: true });
    return true;
  }

  private attack(s: Snapshot, cmds: Command[], army: OwnUnit[]): void {
    if (s.v.tick - this.lastPush < this.patience) return;
    const idle = army.filter((u) => u.idle);
    const waveAt = WAVE[this.plan][s.me.age] ?? 99;
    const out = army.length - idle.length;
    // Start a wave when enough are ready; afterwards keep feeding reinforcements and pushing idle troops.
    if (idle.length < (out > 0 ? 2 : waveAt)) return;
    this.lastPush = s.v.tick;
    let [gx, gy] = this.enemyGuess(s);
    // Enemy units in sight but no buildings known (the last stragglers): chase them.
    const seen = this.enemies(s);
    if (!seen.some((o) => o.building) && seen.length) [gx, gy] = [seen[0]!.x, seen[0]!.y];
    // Troops standing in an enemy base with no one to fight: go for its buildings.
    const buildings = this.enemies(s).filter((o) => o.building);
    const ids: number[] = [];
    for (const u of idle) {
      const b = buildings.find((o) => dist(o.x, o.y, u.x, u.y) < 9);
      if (b) cmds.push({ t: 'act', ids: [u.h], h: b.h });
      else ids.push(u.h);
    }
    if (ids.length) cmds.push({ t: 'move', ids, x: Math.round(gx * 4) / 4, y: Math.round(gy * 4) / 4, am: true });
  }
}
