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
const ARMY: Record<Plan, number[]> = { rush: [0, 6, 14, 18, 22], boom: [0, 3, 8, 18, 22] };
/** Soldiers ready before a wave goes out. */
const WAVE: Record<Plan, number[]> = { rush: [0, 6, 8, 10, 12], boom: [0, 99, 99, 12, 14] };
const NON_MILITARY = new Set(['villager', 'fishingShip', 'tradeShip', 'transport', 'priest']);
/** Raiders villagers can gang up on three to one: slow enough to catch, weak enough to beat (not riders, not hoplites). */
const MILITIA_VS = new Set(['infantry', 'footArcher', 'slinger', 'siege']);
/** Line upgrades the AI researches, per building, in order (econ:5). */
const LINE_TECHS: [string, string[]][] = [
  ['barracks', ['battleAxe', 'shortSword', 'broadSword', 'longSword', 'legion']],
  ['archeryRange', ['improvedBow', 'compositeBow', 'heavyHorseArcher']],
  ['stable', ['heavyCavalry', 'scytheChariot', 'armoredElephant', 'cataphract']],
  ['academy', ['phalanx', 'centurion']],
  ['siegeWorkshop', ['catapult']],
];
/** Ages the AI advances to (AiPlayer.ageUp); saving food for one it never researches would starve the army. */
const NEXT_AGE: Record<number, string> = { 1: 'toolAge', 2: 'bronzeAge', 3: 'ironAge' };

/**
 * How the levels differ at war (besides thinking speed and economy): army size, the earliest first push (game
 * minutes), whether a rush is allowed, and the pause between pushes (ticks). Like the original, the easier
 * computers are passive early — a 9-minute clubman rush is not "easiest".
 */
const WAR: Record<AiLevel, { scale: number; firstPush: number; rush: boolean; patience: number; siege: number }> = {
  easiest: { scale: 0.5, firstPush: 18, rush: false, patience: 1800, siege: 0 },
  easy: { scale: 0.7, firstPush: 14, rush: false, patience: 1200, siege: 1 },
  moderate: { scale: 1, firstPush: 0, rush: true, patience: 600, siege: 2 },
  hard: { scale: 1.15, firstPush: 0, rush: true, patience: 400, siege: 3 },
  hardest: { scale: 1.3, firstPush: 0, rush: true, patience: 300, siege: 4 },
};

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
  private readonly war: (typeof WAR)[AiLevel];

  constructor(rng: Rng, level: AiLevel) {
    this.war = WAR[level];
    const rush = rng.chance(0.5); // drawn at every level so the AI's random stream doesn't depend on it
    this.plan = rush && this.war.rush ? 'rush' : 'boom';
  }

  /** Bronze Age, an Archery Range standing, and no Siege Workshop yet (levels that field siege). */
  wantsWorkshop(ai: AiPlayer, s: Snapshot): boolean {
    return this.war.siege > 0 && s.me.age >= 3 && ai.has(s, 'archeryRange', true).length > 0 && !ai.has(s, 'siegeWorkshop').length;
  }

  /** Soldiers wanted in the current age. */
  private wanted(age: number): number {
    return Math.round((ARMY[this.plan][age] ?? 0) * this.war.scale);
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
    const threats = this.threats(s);
    this.buildings(ai, s, cmds, threats.length > 0);
    this.research(s, cmds);
    this.train(s, cmds, army, threats.length, ai.overdue(s) ? ai.ageFood(s) : 0);
    this.rally(s, cmds);
    if (!this.defend(s, cmds, army, threats)) this.attack(s, cmds, army);
  }

  /** Enemy fighters in our base (within 14 tiles of our buildings) or on our villagers at a far woodline. */
  private threats(s: Snapshot): SeenEntity[] {
    return this.enemies(s).filter(
      (o) => !o.building && !NON_MILITARY.has(o.cls) && (s.buildings.some((b) => dist(b.x, b.y, o.x, o.y) < 14) || s.villagers.some((u) => dist(u.x, u.y, o.x, o.y) < 7)),
    );
  }

  private buildings(ai: AiPlayer, s: Snapshot, cmds: Command[], attacked: boolean): void {
    const tc = s.tc;
    if (!tc) return;
    // Bronze Age: a Siege Workshop first — stone throwers raze what swords only scratch (buildings take ×0.2).
    if (this.wantsWorkshop(ai, s)) {
      if (!ai.isPending(s, 'siegeWorkshop')) ai.build(s, cmds, 'siegeWorkshop', tc.x, tc.y, 7, 13, 1);
      return;
    }
    // A rush wants its Barracks early; anyone attacked without one needs it now.
    if ((this.plan === 'rush' || attacked) && s.villagers.length >= (attacked ? 5 : 9) && !ai.has(s, 'barracks').length && !ai.isPending(s, 'barracks')) {
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
      return;
    }

  }

  /**
   * Line upgrades in order, slotted into a military building's queue between soldiers (research shares the
   * production queue, and these buildings are rarely idle), when the bank covers them with food to spare. The
   * expensive RoR capstones (Legion, Cataphract, Centurion) wait for a rich bank.
   */
  private research(s: Snapshot, cmds: Command[]): void {
    for (const [bld, techs] of LINE_TECHS) {
      const b = s.buildings.find((x) => x.type === bld && x.done && x.queue < 4);
      if (!b) continue;
      const tech = techs.find((t) => !s.me.techs.includes(t) && !s.v.researching(t) && !s.v.researchBlocker(b.h, t));
      if (!tech) continue;
      const c = TECH_BY_ID.get(tech)!.cost as Partial<Record<string, number>>;
      const spare = (c.food ?? 0) > 1000 ? 1500 : 150;
      if (s.me.res[0]! - (c.food ?? 0) < spare || s.me.res[2]! < (c.gold ?? 0)) continue;
      cmds.push({ t: 'research', bld: b.h, tech });
    }
  }

  private train(s: Snapshot, cmds: Command[], army: OwnUnit[], threats: number, overdueFood: number): void {
    // Attacked: match the raiders and then some, whatever the plan (the economy is worth nothing dead).
    const want = Math.max(this.wanted(s.me.age), threats ? threats + 3 : 0);
    let have = army.length;
    let siege = army.filter((u) => u.cls === 'siege').length;
    for (const b of s.buildings) {
      const workshop = b.type === 'siegeWorkshop';
      if (!b.done || b.queue >= 2 || s.me.pop >= s.me.popCap) continue;
      // Siege is counted on its own: a few engines per level, on top of the army.
      if (workshop ? siege >= this.war.siege : have >= want) continue;
      const unit = this.pick(s, b.type, b.h, workshop ? siege : have);
      if (!unit || s.v.trainBlocker(b.h, unit) || !s.v.canAfford(s.v.cost(unit))) continue;
      // Keep food for the next age / villagers while booming.
      if (!threats && this.plan === 'boom' && s.me.age < 3 && s.me.res[0]! < 150) continue;
      // The next age is overdue: soldiers only from food beyond its price (unless we're under attack).
      if (!threats && overdueFood && s.me.res[0]! - s.v.cost(unit)[0]! < overdueFood) continue;
      // Saving for the next age: soldiers only from what's left over (the age comes first, econ:9).
      const next = NEXT_AGE[s.me.age];
      if (!threats && next && !s.me.techs.includes(next) && !s.v.researching(next)) {
        const c = TECH_BY_ID.get(next)!.cost as Partial<Record<string, number>>;
        const u = s.v.cost(unit);
        if (s.me.res[0]! - u[0]! < (c.food ?? 0) && s.me.res[0]! >= (c.food ?? 0) * 0.4) continue;
      }
      cmds.push({ t: 'train', bld: b.h, unit });
      if (workshop) siege++;
      else have++;
    }
  }

  /** Which unit a building trains now: a mix that answers archers with slingers. */
  /** Which unit a building trains now: the best of each line it can (a mix that answers archers with slingers). */
  private pick(s: Snapshot, building: string, bh: number, n: number): string | null {
    const options: string[] = (() => {
      switch (building) {
        case 'barracks':
          return s.me.age >= 2 && n % 3 === 2 ? ['slinger', 'clubman'] : ['shortSwordsman', 'clubman'];
        case 'archeryRange':
          // Mounted archers alternate with foot archers where the civ has them.
          return n % 2 ? ['horseArcher', 'chariotArcher', 'improvedBowman', 'bowman'] : ['improvedBowman', 'bowman'];
        case 'stable':
          // The civ's strongest line first (the tree decides: econ:6.2), then whatever it has.
          return s.me.age >= 3 ? ['cavalry', 'chariot', 'warElephant', 'camel', 'scout'] : ['scout'];
        case 'academy':
          return ['hoplite'];
        case 'siegeWorkshop':
          return s.me.age >= 4 && n % 2 ? ['ballista', 'stoneThrower'] : ['stoneThrower'];
        default:
          return [];
      }
    })();
    return options.find((u) => !s.v.trainBlocker(bh, u)) ?? null;
  }

  /** New military buildings send their troops to a gathering point in front of the Town Center. */
  private rally(s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    if (!tc) return;
    const [gx, gy] = this.enemyGuess(s);
    const len = dist(gx, gy, tc.x, tc.y) || 1;
    const rx = Math.round((tc.x + ((gx - tc.x) / len) * 6) * 4) / 4;
    const ry = Math.round((tc.y + ((gy - tc.y) / len) * 6) * 4) / 4;
    const blds = s.buildings.filter((b) => b.done && !this.rallySet.has(b.h) && ['barracks', 'archeryRange', 'stable', 'academy', 'siegeWorkshop'].includes(b.type));
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

  /**
   * An enemy army near our buildings: every soldier turns out to meet it, and while we're outnumbered the
   * villagers working near a lone raider on foot gang up on it (three to one beats a clubman; the original AI did
   * the same). Against a group they keep working — sent at an army they only fed it (M7 exit: Hard lost 30
   * villagers that way to an Easy army).
   */
  private defend(s: Snapshot, cmds: Command[], army: OwnUnit[], threats: SeenEntity[]): boolean {
    if (!threats.length) return false;
    if (army.length < threats.length) {
      for (const t of threats) {
        // Only on a lone raider on foot: villagers sent at an army (or chasing riders) just feed it.
        if (!MILITIA_VS.has(t.cls) || threats.some((o) => o !== t && dist(o.x, o.y, t.x, t.y) < 5)) continue;
        const near = s.villagers
          .filter((u) => !s.busy.has(u.h) && u.order !== 'attack' && u.hp > 8 && dist(u.x, u.y, t.x, t.y) < 6)
          .sort((a, b) => dist(a.x, a.y, t.x, t.y) - dist(b.x, b.y, t.x, t.y) || a.h - b.h)
          .slice(0, 3);
        if (!near.length) continue;
        for (const u of near) s.busy.add(u.h);
        cmds.push({ t: 'act', ids: near.map((u) => u.h), h: t.h });
      }
    }
    if (!army.length) return false;
    const t = threats[0]!;
    const free = army.filter((u) => u.order !== 'attack');
    if (free.length) cmds.push({ t: 'move', ids: free.map((u) => u.h), x: Math.round(t.x * 4) / 4, y: Math.round(t.y * 4) / 4, am: true });
    return true;
  }

  private attack(s: Snapshot, cmds: Command[], army: OwnUnit[]): void {
    if (s.v.tick < this.war.firstPush * 1200) return;
    // Troops already standing in an enemy base with no one to fight: straight on to the next building (no
    // waiting for the next push), spread so that no more than four swing at one.
    const buildings = this.enemies(s).filter((o) => o.building);
    const on = new Map<number, number>();
    for (const u of army) if (u.order === 'attack') on.set(u.target, (on.get(u.target) ?? 0) + 1);
    const idle: OwnUnit[] = [];
    for (const u of army) {
      if (!u.idle) continue;
      let best: SeenEntity | null = null;
      let bd = 12;
      for (const o of buildings) {
        const d = dist(o.x, o.y, u.x, u.y);
        if ((on.get(o.h) ?? 0) >= 4 || d > bd || (d === bd && best && o.h > best.h)) continue;
        best = o;
        bd = d;
      }
      if (best) {
        cmds.push({ t: 'act', ids: [u.h], h: best.h });
        on.set(best.h, (on.get(best.h) ?? 0) + 1);
      } else idle.push(u);
    }
    if (s.v.tick - this.lastPush < this.war.patience) return;
    const waveAt = Math.min(WAVE[this.plan][s.me.age] ?? 99, Math.max(1, this.wanted(s.me.age)));
    const out = army.length - army.filter((u) => u.idle).length;
    // A wave leaves when enough are ready. Reinforcements join only a wave that is still strong — pairs
    // trickling into an enemy base die one by one; otherwise they wait at the rally point for the next wave.
    // With no enemy building known the war is a hunt for the last of them: whoever is idle keeps sweeping.
    const hunting = !buildings.length && s.v.tick > 20 * 60 * 20;
    if (!idle.length || (!hunting && idle.length < (out >= Math.ceil(waveAt / 2) ? 2 : waveAt))) return;
    this.lastPush = s.v.tick;
    let [gx, gy] = this.enemyGuess(s);
    // Enemy units in sight but no buildings known (the last stragglers): chase them.
    const seen = this.enemies(s);
    if (!buildings.length && seen.length) [gx, gy] = [seen[0]!.x, seen[0]!.y];
    cmds.push({ t: 'move', ids: idle.map((u) => u.h), x: Math.round(gx * 4) / 4, y: Math.round(gy * 4) / 4, am: true });
  }
}
