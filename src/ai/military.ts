import type { AiLevel } from '../data/setup.ts';
import { TECH_BY_ID, UNIT_BY_ID } from '../data/index.ts';
import type { Command } from '../sim/commands/types.ts';
import type { Rng } from '../sim/math/rng.ts';
import type { OwnUnit, SeenEntity } from '../sim/view/playerView.ts';
import { afford, dist, type AiPlayer, type Snapshot } from './ai.ts';
import { Tactics, worth, type Danger, type Sighting } from './tactics.ts';
import { styleOf } from './civStyle.ts';
import { ENEMY } from '../sim/rules/diplomacy.ts';

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
/** Warships are the naval AI's (ai/naval.ts): not part of the land army, and not a threat the army can answer. */
const AT_SEA = new Set(['warship']);
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
const WAR: Record<AiLevel, { scale: number; firstPush: number; rush: number; patience: number; siege: number; tactics: boolean; towers: number; priests: number }> = {
  easiest: { scale: 0.5, firstPush: 18, rush: 0, patience: 1800, siege: 0, tactics: false, towers: 0, priests: 0 },
  easy: { scale: 0.7, firstPush: 14, rush: 0, patience: 1200, siege: 1, tactics: false, towers: 0, priests: 0 },
  moderate: { scale: 1, firstPush: 0, rush: 0.5, patience: 600, siege: 2, tactics: false, towers: 0, priests: 1 },
  // The harder levels rush more often: with their tactics a rush won 77% of M13.2's traces, a boom 52%.
  hard: { scale: 1.15, firstPush: 0, rush: 0.75, patience: 400, siege: 3, tactics: true, towers: 1, priests: 2 },
  hardest: { scale: 1.3, firstPush: 0, rush: 0.75, patience: 300, siege: 4, tactics: true, towers: 2, priests: 3 },
};
// (M13.2: one early tower for Hard cost more than it saved — hard>moderate 41 → 35 of 64 — so `towers` stays 0
// until the defence task, M13.4, places them where raids actually land.)

export interface MilitaryState {
  plan: Plan;
  lastPush: number;
  sweep: number;
  rallySet: number[];
  /** Enemy soldiers remembered by the tactics of the harder levels (M13.2; absent in older saves). */
  seen?: Sighting[];
  /** Raid spots the harder levels keep villagers away from (M13.4). */
  dangers?: Danger[];
  /** When each of the 36 sweep cells was last in sight (M13.4). */
  cellSeen?: number[];
}

export class MilitaryBrain {
  plan: Plan;
  private lastPush = -9999;
  /** Search pattern cursor (6×6 grid of waypoints) for hunting down the last enemies. */
  private sweep = 0;
  private rallySet = new Set<number>();
  private cellSeen: number[] = new Array<number>(36).fill(0);
  private readonly war: (typeof WAR)[AiLevel];
  private readonly tactics = new Tactics();

  constructor(rng: Rng, level: AiLevel, civ = '') {
    this.war = WAR[level];
    // One draw at every level, so the AI's random stream doesn't depend on it: a rush with the level's odds (the
    // economy civilizations boom more, M13.6).
    this.plan = rng.int(100) < Math.round(this.war.rush * (styleOf(civ).rush ?? 1) * 100) ? 'rush' : 'boom';
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
    return { plan: this.plan, lastPush: this.lastPush, sweep: this.sweep, rallySet: [...this.rallySet], cellSeen: [...this.cellSeen], ...(this.war.tactics ? this.tactics.save() : {}) };
  }

  restore(st: MilitaryState): void {
    this.plan = st.plan;
    this.lastPush = st.lastPush;
    this.sweep = st.sweep;
    this.rallySet = new Set(st.rallySet);
    this.tactics.restore(st.seen, st.dangers);
    this.cellSeen = st.cellSeen ? [...st.cellSeen] : new Array<number>(36).fill(0);
  }

  /** On an island (the naval AI's verdict, refreshed each think). */
  private island = false;

  update(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    this.island = ai.naval.onIsland;
    this.noteSeen(s);
    const army = s.units.filter((u) => !NON_MILITARY.has(u.cls) && !AT_SEA.has(u.cls));
    const threats = this.threats(s);
    this.buildings(ai, s, cmds, threats.length > 0);
    this.research(s, cmds);
    this.train(s, cmds, army, threats.length, ai.overdue(s) ? ai.ageFood(s) : 0, ai.naval.landCap(s), ai.naval.popReserve(s));
    this.rally(s, cmds);
    if (this.war.tactics) {
      const enemies = this.enemies(s);
      this.tactics.observe(s, enemies);
      const home = s.tc ?? s.buildings[0];
      if (home && this.tactics.retreat(s, army, enemies, home.x, home.y, cmds)) this.lastPush = s.v.tick; // regroup first
      if (threats.length && !this.tactics.militia(s, army, threats, cmds)) this.tactics.flee(s, threats, cmds);
      this.tactics.focus(s, army, enemies, cmds);
    }
    this.priests(s, cmds, army);
    if (!this.defend(s, cmds, army, threats)) this.attack(s, cmds, army, ai.naval.invading);
  }

  /**
   * Priests (M13.5, mil:3): convert the most valuable enemy soldier within reach (elephants, siege, riders first —
   * what they are worth), else heal a wounded soldier near them, else keep up with the army, a little behind it.
   */
  private priests(s: Snapshot, cmds: Command[], army: OwnUnit[]): void {
    const priests = s.units.filter((u) => u.cls === 'priest' && !s.busy.has(u.h) && u.order !== 'convert' && u.order !== 'heal');
    if (!priests.length) return;
    const foes = this.enemies(s).filter((o) => !o.building && o.cls !== 'priest' && !AT_SEA.has(o.cls) && o.cls !== 'fishingShip' && o.cls !== 'tradeShip' && o.cls !== 'transport');
    const cx = army.length ? army.reduce((a, u) => a + u.x, 0) / army.length : s.tc?.x ?? 0;
    const cy = army.length ? army.reduce((a, u) => a + u.y, 0) / army.length : s.tc?.y ?? 0;
    for (const p of priests) {
      let best: SeenEntity | null = null;
      let bw = 0;
      for (const o of foes) {
        if (dist(o.x, o.y, p.x, p.y) > 9) continue;
        const w = worth(o.type, o.hp);
        if (w > bw || (w === bw && best && o.h < best.h)) {
          best = o;
          bw = w;
        }
      }
      if (best && bw >= 60) {
        cmds.push({ t: 'act', ids: [p.h], h: best.h });
        s.busy.add(p.h);
        continue;
      }
      const hurt = army.find((u) => dist(u.x, u.y, p.x, p.y) < 8 && u.hp < 0.7 * (UNIT_BY_ID.get(u.type)?.hp ?? u.hp));
      if (hurt) {
        cmds.push({ t: 'act', ids: [p.h], h: hurt.h });
        s.busy.add(p.h);
        continue;
      }
      if (army.length && dist(p.x, p.y, cx, cy) > 6) {
        cmds.push({ t: 'move', ids: [p.h], x: Math.round(cx * 4) / 4, y: Math.round(cy * 4) / 4 });
        s.busy.add(p.h);
      }
    }
  }

  /**
   * Enemy fighters in our base (within 14 tiles of our buildings) or on our villagers at a far woodline — on the
   * same land: an army across a strait can't reach us, and counting it made both sides of the Narrows fill their
   * population with soldiers before a transport could be built.
   */
  private threats(s: Snapshot): SeenEntity[] {
    return this.enemies(s).filter((o) => {
      if (o.building || NON_MILITARY.has(o.cls) || AT_SEA.has(o.cls)) return false;
      const near = s.buildings.some((b) => dist(b.x, b.y, o.x, o.y) < 14) || s.villagers.some((u) => dist(u.x, u.y, o.x, o.y) < 7);
      if (!near) return false;
      const land = landAt(s, o.x, o.y);
      return !land || s.buildings.some((b) => dist(b.x, b.y, o.x, o.y) < 14 && landAt(s, b.x, b.y) === land) || s.villagers.some((u) => dist(u.x, u.y, o.x, o.y) < 7 && landAt(s, u.x, u.y) === land);
    });
  }

  private buildings(ai: AiPlayer, s: Snapshot, cmds: Command[], attacked: boolean): void {
    const tc = s.tc;
    if (!tc) return;
    // Bronze Age: a Siege Workshop first — stone throwers raze what swords only scratch (buildings take ×0.2).
    if (this.wantsWorkshop(ai, s)) {
      if (!ai.isPending(s, 'siegeWorkshop')) ai.build(s, cmds, 'siegeWorkshop', tc.x, tc.y, 7, 13, 1);
      return;
    }
    // Towers (M13.4, the harder levels, from the Bronze Age): the stone in hand (the start's 150 — nobody mines
    // for them) buys a Watch Tower where the villagers work furthest out, once the Granary has researched it.
    if (this.war.towers && s.me.age >= 3 && this.towers(ai, s, cmds)) return;
    // A Temple for the levels that field priests (Bronze Age, after the Government Center the Iron Age needs).
    if (this.war.priests >= 2 && s.me.age >= 3 && ai.has(s, 'governmentCenter', true).length && !ai.has(s, 'temple').length && !ai.isPending(s, 'temple')) {
      if (ai.build(s, cmds, 'temple', tc.x, tc.y, 6, 12, 1)) return;
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
    const main = styleOf(s.me.civ).main;
    if ((this.plan === 'rush' || main === 'infantry') && s.me.age >= 2 && ai.has(s, 'barracks').length === 1 && !ai.isPending(s, 'barracks') && s.villagers.length >= 18) {
      ai.build(s, cmds, 'barracks', tc.x, tc.y, 7, 13, 1);
      return;
    }
    // The civilization's arm (M13.6): a second Archery Range or Stable once the economy carries it, or the Academy
    // as soon as the Bronze Age opens it.
    if (main === 'archers' && s.me.age >= 2 && ai.has(s, 'archeryRange', true).length === 1 && !ai.isPending(s, 'archeryRange') && s.villagers.length >= 20) {
      if (ai.build(s, cmds, 'archeryRange', tc.x, tc.y, 7, 13, 1)) return;
    }
    if (main === 'riders' && s.me.age >= 3 && ai.has(s, 'stable', true).length === 1 && !ai.isPending(s, 'stable') && s.villagers.length >= 22) {
      if (ai.build(s, cmds, 'stable', tc.x, tc.y, 7, 13, 1)) return;
    }
    if (main === 'hoplites' && s.me.age >= 3 && !ai.has(s, 'academy').length && !ai.isPending(s, 'academy') && s.v.canBuild('academy')) {
      if (ai.build(s, cmds, 'academy', tc.x, tc.y, 7, 13, 1)) return;
    }

  }

  /** Towers wanted: research them at the Granary, then place them towards the enemy. True if it acted. */
  private towers(ai: AiPlayer, s: Snapshot, cmds: Command[]): boolean {
    const tc = s.tc;
    if (!tc) return false;
    const have = s.buildings.filter((b) => b.kind === 'tower').length;
    if (have >= this.war.towers || ai.isPending(s, 'watchTower')) return false;
    if (!s.me.techs.includes('watchTower')) {
      const granary = s.buildings.find((b) => b.type === 'granary' && b.done && b.queue === 0);
      if (granary && !s.v.researching('watchTower') && !s.v.researchBlocker(granary.h, 'watchTower') && s.me.res[0]! >= 50 + 50) {
        cmds.push({ t: 'research', bld: granary.h, tech: 'watchTower' });
      }
      return false;
    }
    if (s.me.res[3]! < 150) return false;
    // Where raids land: the villagers working furthest out (woodline, mines); else towards the enemy.
    const out = s.villagers.filter((u) => (u.order === 'gather' || u.carry > 0) && dist(u.x, u.y, tc.x, tc.y) > 8);
    if (out.length >= 3) {
      out.sort((a, b) => dist(b.x, b.y, tc.x, tc.y) - dist(a.x, a.y, tc.x, tc.y) || a.h - b.h);
      const far = out.slice(0, 4);
      const x = far.reduce((a, u) => a + u.x, 0) / far.length;
      const y = far.reduce((a, u) => a + u.y, 0) / far.length;
      if (!s.buildings.some((b) => b.kind === 'tower' && dist(b.x, b.y, x, y) < 7)) return ai.build(s, cmds, 'watchTower', x, y, 2, 5, 2);
    }
    const [gx, gy] = this.enemyGuess(s);
    const len = dist(gx, gy, tc.x, tc.y) || 1;
    const x = tc.x + ((gx - tc.x) / len) * (4 + 3 * have);
    const y = tc.y + ((gy - tc.y) / len) * (4 + 3 * have);
    return ai.build(s, cmds, 'watchTower', x, y, 0, 4, 2);
  }

  /** A resource spot raiders were seen at lately (the harder levels don't send villagers back into them). */
  danger(s: Snapshot, x: number, y: number): boolean {
    return this.war.tactics && this.tactics.danger(s.v.tick, x, y);
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

  private train(s: Snapshot, cmds: Command[], army: OwnUnit[], threats: number, overdueFood: number, landCap: number, popReserve: number): void {
    // Attacked: match the raiders and then some, whatever the plan (the economy is worth nothing dead). On an
    // island the land army stays a home guard until transports can carry it (the naval AI says how many).
    const want = Math.max(Math.min(this.wanted(s.me.age), landCap), threats ? threats + 3 : 0);
    // An island out of wood can't raise the buildings the next age needs: saving food for it starved the army of a
    // Tiny-island game for an hour (M14.6b). Then soldiers take the food.
    const next0 = NEXT_AGE[s.me.age];
    const ageStuck = this.island && !!next0 && !!s.tc && s.me.res[1]! < 100 && /^requires \d of/.test(s.v.researchBlocker(s.tc.h, next0) ?? '');
    if (ageStuck) overdueFood = 0;
    let have = army.length;
    let siege = army.filter((u) => u.cls === 'siege').length;
    let priests = s.units.filter((u) => u.cls === 'priest').length;
    for (const b of s.buildings) {
      const workshop = b.type === 'siegeWorkshop';
      if (!b.done || b.queue >= 2 || s.me.pop + popReserve >= s.me.popCap) continue;
      // Priests (M13.5): a few per level, from gold — the pile every computer floated — minus what the Iron Age needs.
      if (b.type === 'temple') {
        if (priests >= this.war.priests + (this.war.priests ? (styleOf(s.me.civ).priests ?? 0) : 0) || s.v.trainBlocker(b.h, 'priest')) continue;
        const ironGold = s.me.age === 3 && !s.me.techs.includes('ironAge') && !s.v.researching('ironAge') ? 800 : 0;
        if (s.me.res[2]! - 125 < ironGold) continue;
        cmds.push({ t: 'train', bld: b.h, unit: 'priest' });
        priests++;
        continue;
      }
      // Siege is counted on its own: a few engines per level, on top of the army.
      if (workshop ? siege >= this.war.siege + (this.war.siege ? (styleOf(s.me.civ).siege ?? 0) : 0) : have >= want) continue;
      const unit = this.pick(s, b.type, b.h, workshop ? siege : have);
      if (!unit || s.v.trainBlocker(b.h, unit) || !afford(s, s.v.cost(unit))) continue;
      // Keep food for the next age / villagers while booming.
      if (!threats && this.plan === 'boom' && s.me.age < 3 && s.me.res[0]! < 150) continue;
      // The next age is overdue: soldiers only from food beyond its price (unless we're under attack).
      if (!threats && overdueFood && s.me.res[0]! - s.v.cost(unit)[0]! < overdueFood) continue;
      // Saving for the next age: soldiers only from what's left over (the age comes first, econ:9).
      const next = NEXT_AGE[s.me.age];
      if (!threats && !ageStuck && next && !s.me.techs.includes(next) && !s.v.researching(next)) {
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
        case 'archeryRange': {
          // The civ's favourite archers (M13.6), with foot archers mixed in; else mounted and foot alternate.
          const fav = styleOf(s.me.civ).range;
          if (fav) return n % 3 === 2 ? ['improvedBowman', 'bowman'] : [...fav];
          return n % 2 ? ['horseArcher', 'chariotArcher', 'improvedBowman', 'bowman'] : ['improvedBowman', 'bowman'];
        }
        case 'stable':
          // The civ's favourite riders (M13.6), else its strongest line (the tree decides: econ:6.2).
          return s.me.age >= 3 ? [...(styleOf(s.me.civ).stable ?? ['cavalry', 'chariot', 'warElephant', 'camel']), 'scout'] : ['scout'];
        case 'academy':
          return ['hoplite'];
        case 'siegeWorkshop':
          return s.me.age >= 4 && n % 2 ? ['ballista', 'stoneThrower'] : ['stoneThrower'];
        default:
          return [];
      }
    })();
    // On an island whose wood or stone has run out, the first of the line we can pay for (slingers need stone,
    // bowmen wood: a Tiny-island game sat an hour with 22 idle villagers, 2000 food and 3600 gold — M14.6b).
    // (Land maps keep waiting for the preferred unit: their ladder is tuned on it.)
    if (this.island) {
      const paid = options.find((u) => !s.v.trainBlocker(bh, u) && afford(s, s.v.cost(u)));
      if (paid) return paid;
    }
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
    // Stances, not teams (M13.8): a computer never goes for a player it is neutral toward.
    return s.v.others().filter((o) => o.owner > 0 && o.cls !== 'relic' && s.v.stanceTo(o.owner) === ENEMY);
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
    const cell = (i: number): [number, number] => [Math.min(s.v.mapW - 2, step / 2 + (i % 6) * step), Math.min(s.v.mapH - 2, step / 2 + Math.floor(i / 6) * step)];
    for (let k = 0; k < 64; k++) {
      const i = (this.sweep + k) % 36;
      const [x, y] = cell(i);
      if (!s.v.explored(Math.floor(x), Math.floor(y))) {
        this.sweep = i;
        return [x, y];
      }
    }
    // All explored: the part of the map seen longest ago — a building put up after we last looked is hiding
    // there (M13.4: a lone Granary in an explored corner kept a won war open past the hour).
    let best = this.sweep;
    for (let k = 0; k < 36; k++) {
      const i = (this.sweep + k) % 36;
      if ((this.cellSeen[i] ?? 0) < (this.cellSeen[best] ?? 0)) best = i;
    }
    this.sweep = best;
    return cell(best);
  }

  /** When each sweep cell was last in sight (the hunt goes to the stalest). */
  private noteSeen(s: Snapshot): void {
    const step = Math.max(8, Math.floor(s.v.mapW / 6));
    for (let i = 0; i < 36; i++) {
      const x = Math.min(s.v.mapW - 2, step / 2 + (i % 6) * step);
      const y = Math.min(s.v.mapH - 2, step / 2 + Math.floor(i / 6) * step);
      if (s.v.visible(Math.floor(x), Math.floor(y))) this.cellSeen[i] = s.v.tick;
    }
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
    const free = army.filter((u) => u.order !== 'attack' && !s.busy.has(u.h));
    if (free.length) cmds.push({ t: 'move', ids: free.map((u) => u.h), x: Math.round(t.x * 4) / 4, y: Math.round(t.y * 4) / 4, am: true });
    return true;
  }

  private attack(s: Snapshot, cmds: Command[], army: OwnUnit[], invading = false): void {
    if (s.v.tick < this.war.firstPush * 1200) return;
    // Troops already standing in an enemy base with no one to fight: straight on to the next building (no
    // waiting for the next push), spread so that no more than four swing at one.
    const buildings = this.enemies(s).filter((o) => o.building);
    const on = new Map<number, number>();
    for (const u of army) if (u.order === 'attack') on.set(u.target, (on.get(u.target) ?? 0) + 1);
    // Spread over a base (four to a building); the last few buildings of a beaten enemy (none of its soldiers in
    // sight, past 20 min) get everyone — swords do a fifth of their damage to buildings, and four at a lone
    // Barracks let a won war run past 45 min (M13.4).
    const fighters = this.enemies(s).some((o) => !o.building && !NON_MILITARY.has(o.cls) && !AT_SEA.has(o.cls));
    const perBuilding = buildings.length <= 3 && !fighters && s.v.tick > 20 * 60 * 20 ? 99 : 4;
    const idle: OwnUnit[] = [];
    for (const u of army) {
      if (!u.idle || s.busy.has(u.h)) continue; // (the naval AI may have them boarding)
      let best: SeenEntity | null = null;
      let bd = 12;
      for (const o of buildings) {
        const d = dist(o.x, o.y, u.x, u.y);
        if ((on.get(o.h) ?? 0) >= perBuilding || d > bd || (d === bd && best && o.h > best.h)) continue;
        best = o;
        bd = d;
      }
      if (best) {
        cmds.push({ t: 'act', ids: [u.h], h: best.h });
        on.set(best.h, (on.get(best.h) ?? 0) + 1);
      } else idle.push(u);
    }
    // Across the water the naval AI ferries the waves; landed troops still take the nearest buildings (above).
    if (invading || s.v.tick - this.lastPush < this.war.patience) return;
    const waveAt = Math.min(WAVE[this.plan][s.me.age] ?? 99, Math.max(1, this.wanted(s.me.age)));
    const out = army.length - army.filter((u) => u.idle).length;
    // A wave leaves when enough are ready. Reinforcements join only a wave that is still strong — pairs
    // trickling into an enemy base die one by one; otherwise they wait at the rally point for the next wave.
    // With no enemy building known the war is a hunt for the last of them: whoever is idle keeps sweeping.
    const hunting = !buildings.length && s.v.tick > 20 * 60 * 20;
    if (!idle.length || (!hunting && idle.length < (out >= Math.ceil(waveAt / 2) ? 2 : waveAt))) return;
    // The harder levels wait until the army is clearly the stronger one (or the population is full).
    if (this.war.tactics && !hunting && !this.tactics.readyToPush(army, s.me.pop >= s.me.popCap - 1)) return;
    this.lastPush = s.v.tick;
    // Enemy units in sight but no buildings known (the last stragglers): chase them.
    const seen = this.enemies(s);
    if (!buildings.length && seen.length) {
      cmds.push({ t: 'move', ids: idle.map((u) => u.h), x: Math.round(seen[0]!.x * 4) / 4, y: Math.round(seen[0]!.y * 4) / 4, am: true });
      return;
    }
    // Hunting the last of them with nothing in sight: split up — groups of three sweep different parts of the map
    // (one army walking the sweep point by point let a lone villager hide for ten minutes).
    if (hunting && idle.length > 3) {
      for (let k = 0; k * 3 < idle.length; k++) {
        const [gx, gy] = this.enemyGuess(s);
        this.sweep = (this.sweep + 5) % 36; // the next group starts further round the grid
        cmds.push({ t: 'move', ids: idle.slice(k * 3, k * 3 + 3).map((u) => u.h), x: Math.round(gx * 4) / 4, y: Math.round(gy * 4) / 4, am: true });
      }
      return;
    }
    const [gx, gy] = this.enemyGuess(s);
    cmds.push({ t: 'move', ids: idle.map((u) => u.h), x: Math.round(gx * 4) / 4, y: Math.round(gy * 4) / 4, am: true });
  }
}

/** The land region at or next to (x, y) (a building's own tiles are impassable); 0 if none within 3 tiles. */
function landAt(s: Snapshot, x: number, y: number): number {
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
