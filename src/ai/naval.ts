import type { Command } from '../sim/commands/types.ts';
import type { AiPlayer, Snapshot } from './ai.ts';
import { dist } from './ai.ts';
import { TECH_BY_ID } from '../data/index.ts';

/**
 * AI at sea, economy (M8.8a). A Dock goes up once fish are known near home — at once on an island start, where
 * land food is short — and fishing boats work the nearest fish their sea reaches, two boats a school at most;
 * with no fish known they sail out to explore. Island starts keep a bigger fleet (the water template's land has
 * little hunting and the berries run out).
 */
export interface NavalState {
  island: boolean | null;
  sweep: number;
  /** Enemy warships have been seen (a coast then builds warships too — fishing boats alone are no threat). */
  contact?: boolean;
  lastRaid?: number;
}

/** Fishing boats wanted by age, on a coast and on an island. */
const FLEET = { coast: [0, 4, 6, 7, 8], island: [0, 7, 9, 10, 10] } as const;
/** Warships wanted by age (none before the Tool Age's Scout Ship), on a coast and on an island. */
const WARSHIPS = { coast: [0, 0, 2, 3, 4], island: [0, 0, 4, 6, 8] } as const;
/** A raid sails once this many warships are ready (by age). */
const RAID_AT = [0, 0, 2, 3, 4];
const RAID_PATIENCE = 600;
/** Dock upgrades, in order: better fishers, then the galley line. */
const DOCK_TECHS = ['fishingShip', 'warGalley', 'trireme'];
const SHIP_CLASSES = new Set(['warship', 'fishingShip', 'transport', 'tradeShip']);
/** A start whose land is under this share of the map is an island. */
const ISLAND_SHARE = 0.3;

export class NavalBrain {
  private island: boolean | null = null;
  private sweep = 0;
  private contact = false;
  private lastRaid = -9999;
  /** This think: fewer warships than wanted. */
  private fleetShort = false;

  save(): NavalState {
    return { island: this.island, sweep: this.sweep, contact: this.contact, lastRaid: this.lastRaid };
  }

  restore(st: NavalState | undefined): void {
    this.island = st?.island ?? null;
    this.sweep = st?.sweep ?? 0;
    this.contact = st?.contact ?? false;
    this.lastRaid = st?.lastRaid ?? -9999;
  }

  update(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    if (!tc) return;
    if (this.island === null) {
      const home = s.v.region(1, Math.floor(tc.x + tc.size / 2 + 0.5), Math.floor(tc.y));
      this.island = home > 0 && s.v.landSize(home) < s.v.mapW * s.v.mapH * ISLAND_SHARE;
    }
    // A Dock trains one unit type at a time (RoR): while the fleet is short, new fishing boats wait (once there are
    // half the fishers wanted) so warships get the Dock — replacing sunk boats otherwise kept it busy forever.
    if (!ai.peaceful && this.enemiesAtSea(s).some((o) => o.cls === 'warship')) this.contact = true;
    const warWant = !ai.peaceful && (this.island || this.contact) ? (WARSHIPS[this.island ? 'island' : 'coast'][s.me.age] ?? 4) : 0;
    this.fleetShort = s.units.filter((u) => u.cls === 'warship').length < warWant;
    this.dock(ai, s, cmds);
    this.fishers(ai, s, cmds);
    if (!ai.peaceful) {
      this.research(s, cmds);
      this.warships(ai, s, cmds);
    }
  }

  /** Enemy ships in sight and enemy Docks explored. */
  private enemiesAtSea(s: Snapshot) {
    return s.v.others().filter((o) => o.owner > 0 && s.v.teamOf(o.owner) !== s.me.team && (o.building ? o.type === 'dock' : SHIP_CLASSES.has(o.cls)));
  }

  private research(s: Snapshot, cmds: Command[]): void {
    const dock = s.buildings.find((b) => b.type === 'dock' && b.done && b.queue < 2);
    if (!dock) return;
    // The galley line only where there is a fleet to upgrade (an island, or a coast at war at sea).
    const techs = this.island || this.contact ? DOCK_TECHS : ['fishingShip'];
    const tech = techs.find((t) => !s.me.techs.includes(t) && !s.v.researching(t) && !s.v.researchBlocker(dock.h, t));
    if (!tech) return;
    const c = TECH_BY_ID.get(tech)!.cost as Partial<Record<string, number>>;
    if (s.me.res[0]! < (c.food ?? 0) + 200 || s.me.res[1]! < (c.wood ?? 0)) return; // food to spare; wood is tight at sea
    cmds.push({ t: 'research', bld: dock.h, tech });
  }

  /**
   * Warships: the island (or a coast that has met enemy ships) keeps a fleet by age. Idle warships answer enemy
   * ships near our Docks and boats, raid enemy boats and Docks once enough are ready, look for the enemy at sea
   * when none are known, and otherwise stand guard over our fishing grounds.
   */
  private warships(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const foes = this.enemiesAtSea(s);
    const docks = ai.has(s, 'dock', true);
    if (!docks.length || (!this.island && !this.contact)) return;
    const fleet = s.units.filter((u) => u.cls === 'warship');
    const want = WARSHIPS[this.island ? 'island' : 'coast'][s.me.age] ?? 4;
    const home = s.units.filter((u) => u.cls === 'fishingShip');
    const guardAt = home.length ? [home.reduce((a, u) => a + u.x, 0) / home.length, home.reduce((a, u) => a + u.y, 0) / home.length] : [docks[0]!.x, docks[0]!.y];
    // Enemy warships near our fishing grounds, and any enemy ship close to our boats or Docks.
    const near = foes.filter(
      (o) => !o.building && (o.cls === 'warship' ? dist(o.x, o.y, guardAt[0]!, guardAt[1]!) < 16 : [...home, ...docks].some((m) => dist(m.x, m.y, o.x, o.y) < 12)),
    );
    // Build: a queued ship each think while short (fishing boats train first; both share the Docks).
    const dock = docks.find((d) => d.queue < 2);
    if (dock && fleet.length < want && s.me.pop < s.me.popCap) {
      const unit = ['trireme', 'warGalley', 'scoutShip'].find((u) => !s.v.trainBlocker(dock.h, u));
      if (unit && s.v.canAfford(s.v.cost(unit)) && (near.length || s.me.res[1]! >= s.v.cost(unit)[1]! + 75)) cmds.push({ t: 'train', bld: dock.h, unit });
    }
    const idle = fleet.filter((u) => u.idle && !s.busy.has(u.h));
    if (!idle.length) return;
    for (const u of idle) s.busy.add(u.h);
    const ids = idle.map((u) => u.h);
    const nearest = (list: typeof foes) => list.reduce<(typeof foes)[number] | null>((b, o) => (!b || dist(o.x, o.y, guardAt[0]!, guardAt[1]!) < dist(b.x, b.y, guardAt[0]!, guardAt[1]!) ? o : b), null);
    if (near.length) {
      cmds.push({ t: 'act', ids, h: nearest(near)!.h });
      return;
    }
    const ready = fleet.length >= (RAID_AT[s.me.age] ?? 4) && idle.length >= Math.ceil(fleet.length / 2);
    if (ready && s.v.tick - this.lastRaid >= RAID_PATIENCE) {
      // Boats first (the enemy's food), then Docks.
      const prey = nearest(foes.filter((o) => !o.building)) ?? nearest(foes.filter((o) => o.building));
      if (prey) {
        this.lastRaid = s.v.tick;
        cmds.push({ t: 'act', ids, h: prey.h });
        return;
      }
      const sea = s.v.region(2, Math.floor(idle[0]!.x), Math.floor(idle[0]!.y));
      if (this.exploreTo(s, cmds, ids, sea)) {
        this.lastRaid = s.v.tick;
        return;
      }
    }
    const far = idle.filter((u) => dist(u.x, u.y, guardAt[0]!, guardAt[1]!) > 8).map((u) => u.h);
    if (far.length) cmds.push({ t: 'move', ids: far, x: Math.round(guardAt[0]! * 4) / 4, y: Math.round(guardAt[1]! * 4) / 4 });
  }

  /** On an island (for the rest of the naval AI: warships, transports). */
  get onIsland(): boolean {
    return !!this.island;
  }

  /**
   * Land soldiers worth training: on an island only a home guard (4) — they can't reach anyone and would take the
   * population and wood the fleet needs — until transports can carry an army (M8.8c).
   */
  landCap(_s: Snapshot): number {
    return this.island ? 4 : Infinity;
  }

  private dock(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const tc = s.tc!;
    if (ai.isPending(s, 'dock')) return;
    // Islands add a second Dock from the Tool Age (fishing boats and warships each want one).
    const docks = ai.has(s, 'dock').length;
    if (docks >= (this.island && s.me.age >= 2 ? 2 : 1)) return;
    if (docks) {
      ai.build(s, cmds, 'dock', tc.x, tc.y, 3, 26, 1);
      return;
    }
    if (s.villagers.length < (this.island ? 5 : 8)) return;
    if (!this.island && !s.v.fish().some((f) => dist(f.x, f.y, tc.x, tc.y) < 18)) return;
    ai.build(s, cmds, 'dock', tc.x, tc.y, 3, 22, 1);
  }

  private fishers(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const dock = ai.has(s, 'dock', true)[0];
    if (!dock) return;
    const boats = s.units.filter((u) => u.cls === 'fishingShip');
    const want = FLEET[this.island ? 'island' : 'coast'][s.me.age] ?? 8;
    if (this.fleetShort && boats.length >= want / 2) return this.assignBoats(s, cmds, boats, dock);
    if (boats.length + dock.queue < want && dock.queue < 2 && s.me.pop + dock.queue < s.me.popCap) {
      const unit = ['fishingShip', 'fishingBoat'].find((u) => !s.v.trainBlocker(dock.h, u));
      if (unit && s.v.canAfford(s.v.cost(unit))) cmds.push({ t: 'train', bld: dock.h, unit });
    }
    this.assignBoats(s, cmds, boats, dock);
  }

  /** Idle boats: the nearest fish (to the Dock) their sea reaches, at most two boats a school. */
  private assignBoats(s: Snapshot, cmds: Command[], boats: Snapshot['units'], dock: { x: number; y: number }): void {
    const fish = s.v.fish();
    const load = new Map<number, number>();
    for (const b of boats) if (b.order === 'gather') load.set(b.target, (load.get(b.target) ?? 0) + 1);
    for (const b of boats) {
      if (!b.idle || s.busy.has(b.h)) continue;
      const sea = s.v.region(2, Math.floor(b.x), Math.floor(b.y));
      let best: (typeof fish)[number] | null = null;
      let bd = Infinity;
      for (const f of fish) {
        if ((load.get(f.i) ?? 0) >= 2) continue;
        const d = dist(f.x, f.y, dock.x, dock.y);
        if (d > bd || (d === bd && best && f.i > best.i)) continue;
        if (!s.v.seaReachable(sea, f.x - 1, f.y - 1, f.x + 1, f.y + 1)) continue;
        best = f;
        bd = d;
      }
      s.busy.add(b.h);
      if (best) {
        cmds.push({ t: 'gather', ids: [b.h], res: best.i });
        load.set(best.i, (load.get(best.i) ?? 0) + 1);
      } else this.exploreTo(s, cmds, [b.h], sea);
    }
  }

  /** Send ships to the next unexplored stretch of their sea (an 8 × 8 sweep of the map); false if none is left. */
  private exploreTo(s: Snapshot, cmds: Command[], ids: number[], sea: number): boolean {
    const W = s.v.mapW;
    const H = s.v.mapH;
    for (let k = 0; k < 64; k++) {
      const i = (this.sweep + k) % 64;
      const x = Math.floor(((i % 8) + 0.5) * (W / 8));
      const y = Math.floor((Math.floor(i / 8) + 0.5) * (H / 8));
      if (s.v.explored(x, y) || s.v.region(2, x, y) !== sea) continue;
      this.sweep = (i + 1) % 64;
      cmds.push({ t: 'move', ids, x: x + 0.5, y: y + 0.5 });
      return true;
    }
    return false;
  }
}
