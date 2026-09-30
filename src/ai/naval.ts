import type { Command } from '../sim/commands/types.ts';
import type { AiPlayer, Snapshot } from './ai.ts';
import { dist } from './ai.ts';
import { TECH_BY_ID } from '../data/index.ts';
import { ENEMY } from '../sim/rules/diplomacy.ts';

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
  /** Invasion (M8.8c): the enemy building the waves sail for, and when the current wave began boarding. */
  target?: [number, number] | null;
  boardedAt?: number;
}

/** Fishing boats wanted by age, on a coast and on an island. */
/**
 * An island's 50 people, planned: 22 villagers, 6 fishing boats, 3–4 warships, 2 transports and ~16 soldiers
 * (boats and warships built first used to fill it, leaving room for five).
 */
const FLEET = { coast: [0, 4, 6, 7, 8], island: [0, 6, 6, 6, 6] } as const;
/** Warships wanted by age (none before the Tool Age's Scout Ship), on a coast and on an island. */
const WARSHIPS = { coast: [0, 0, 2, 3, 4], island: [0, 0, 3, 4, 4] } as const;
/** …more when enemy warships are about. */
const WAR_CONTESTED = 6;
/** A raid sails once this many warships are ready (by age). */
const RAID_AT = [0, 0, 2, 3, 4];
const RAID_PATIENCE = 600;
/** Dock upgrades, in order: better fishers, then the galley line. */
const DOCK_TECHS = ['fishingShip', 'warGalley', 'trireme', 'heavyTransport'];
const SHIP_CLASSES = new Set(['warship', 'fishingShip', 'transport', 'tradeShip']);
/** Soldiers a transport carries (not villagers, priests or ships). */
const LAND_ARMY = (cls: string): boolean => !SHIP_CLASSES.has(cls) && cls !== 'villager' && cls !== 'priest';
/** A start whose land is under this share of the map is an island. */
const ISLAND_SHARE = 0.3;

export class NavalBrain {
  private island: boolean | null = null;
  private sweep = 0;
  private contact = false;
  private lastRaid = -9999;
  /** This think: fewer warships than wanted. */
  private fleetShort = false;
  private target: [number, number] | null = null;
  private boardedAt = 0;
  private shore: [number, number] | null = null;
  private hasTransport = false;
  private transportAt = -9999;
  private beachSkip = 0;

  save(): NavalState {
    return { island: this.island, sweep: this.sweep, contact: this.contact, lastRaid: this.lastRaid, target: this.target, boardedAt: this.boardedAt };
  }

  restore(st: NavalState | undefined): void {
    this.island = st?.island ?? null;
    this.sweep = st?.sweep ?? 0;
    this.contact = st?.contact ?? false;
    this.lastRaid = st?.lastRaid ?? -9999;
    this.target = st?.target ?? null;
    this.boardedAt = st?.boardedAt ?? 0;
    this.shore = null;
  }

  update(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    if (!tc) return;
    if (this.island === null) {
      // An island: our land is small, or other big land lies across the water (Narrows, team islands) — either
      // way the enemy may be reachable only by sea.
      const home = this.landOf(s, tc.x + tc.size / 2 + 0.5, tc.y); // (one tile beside the TC can be a tree)
      const land = s.v.landSize(home);
      this.island = home > 0 && (land.region < s.v.mapW * s.v.mapH * ISLAND_SHARE || land.region < land.all * 0.7);
    }
    // A Dock trains one unit type at a time (RoR): while the fleet is short, new fishing boats wait (once there are
    // half the fishers wanted) so warships get the Dock — replacing sunk boats otherwise kept it busy forever.
    if (!ai.peaceful && this.enemiesAtSea(s).some((o) => o.cls === 'warship')) this.contact = true;
    // (During an invasion three escorts, unless enemy warships are about.)
    const contested = this.enemiesAtSea(s).some((o) => o.cls === 'warship');
    const base = WARSHIPS[this.island ? 'island' : 'coast'][s.me.age] ?? 4;
    const warWant = !ai.peaceful && (this.island || this.contact) ? (contested && s.me.age >= 2 ? Math.max(base, WAR_CONTESTED) : base) : 0;
    this.fleetShort = s.units.filter((u) => u.cls === 'warship').length < warWant;
    this.dock(ai, s, cmds);
    this.fishers(ai, s, cmds);
    if (!ai.peaceful) {
      this.research(s, cmds);
      this.warships(ai, s, cmds);
      this.invade(ai, s, cmds);
    }
  }

  /** Sailing armies across (the land military holds its own waves meanwhile). */
  get invading(): boolean {
    return this.target !== null;
  }

  /**
   * Our land: where most of our villagers stand (the tiles round the Town Center can be a pocket walled in by
   * buildings on a crowded island — then no soldier was "at home" and none ever boarded).
   */
  private homeLand(s: Snapshot): number {
    const count = new Map<number, number>();
    for (const u of s.villagers) {
      const l = s.v.region(1, Math.floor(u.x), Math.floor(u.y));
      if (l) count.set(l, (count.get(l) ?? 0) + 1);
    }
    let best = 0;
    let bn = 0;
    for (const [l, n] of count) if (n > bn || (n === bn && l < best)) [best, bn] = [l, n];
    return best || this.landOf(s, s.tc!.x, s.tc!.y);
  }

  /** The land region at or next to (x, y) (a building's own tiles are impassable). */
  private landOf(s: Snapshot, x: number, y: number): number {
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

  /**
   * Soldiers ashore on enemy land: the land military only looks 12 tiles round for buildings, and its waves are
   * held during an invasion — so idle ones here go for the nearest enemy building or unit on that land, or
   * search the parts of it we haven't seen (the last buildings and villagers can be anywhere on the island).
   */
  private ashore(s: Snapshot, cmds: Command[], home: number): void {
    const abroad = s.units.filter((u) => LAND_ARMY(u.cls) && u.idle && !s.busy.has(u.h));
    if (!abroad.length) return;
    const byLand = new Map<number, typeof abroad>();
    for (const u of abroad) {
      const l = this.landOf(s, u.x, u.y);
      if (l && l !== home) byLand.set(l, [...(byLand.get(l) ?? []), u]);
    }
    if (!byLand.size) return;
    const foes = s.v.others().filter((o) => o.owner > 0 && o.cls !== 'relic' && s.v.stanceTo(o.owner) === ENEMY);
    for (const [land, group] of byLand) {
      for (const u of group) s.busy.add(u.h);
      const ids = group.map((u) => u.h);
      const [gx, gy] = [group[0]!.x, group[0]!.y];
      const here = foes.filter((o) => this.landOf(s, o.x, o.y) === land).sort((a, b) => dist(a.x, a.y, gx, gy) - dist(b.x, b.y, gx, gy) || a.h - b.h);
      if (here.length) {
        cmds.push({ t: 'act', ids, h: here[0]!.h });
        continue;
      }
      // Search: the nearest tile of this land we can't see now, on a coarse grid.
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (let y = 2; y < s.v.mapH; y += 4) {
        for (let x = 2; x < s.v.mapW; x += 4) {
          if (s.v.region(1, x, y) !== land || s.v.visible(x, y)) continue;
          const d = dist(x, y, gx, gy);
          if (d < bd) {
            bd = d;
            best = [x + 0.5, y + 0.5];
          }
        }
      }
      if (best) cmds.push({ t: 'move', ids, x: best[0], y: best[1], am: true });
    }
  }

  /** The water tile of sea `sea` touching land region `land` nearest (x, y) (a landing beach), as a tile centre. */
  private beachNear(s: Snapshot, x: number, y: number, land: number, sea: number, skip = 0): [number, number] | null {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let skipped = 0;
    for (let r = 1; r <= 30; r++) {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = cx + dx;
          const ty = cy + dy;
          if (s.v.region(2, tx, ty) !== sea) continue;
          if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => s.v.region(1, tx + ax!, ty + ay!) === land)) continue;
          const d = dx * dx + dy * dy;
          if (d < bd) {
            bd = d;
            best = [tx + 0.5, ty + 0.5];
          }
        }
      }
      if (best && skipped++ >= skip) return best; // (after a failed landing, a beach further round)
    }
    return null;
  }

  /** Up to `n` boarding spots: water tiles touching our land, nearest the first, at least 3 tiles apart. */
  private shoreSpots(s: Snapshot, home: number, first: [number, number], n: number): [number, number][] {
    const out: [number, number][] = [first];
    for (let r = 1; r <= 12 && out.length < n; r++) {
      for (let dy = -r; dy <= r && out.length < n; dy++) {
        for (let dx = -r; dx <= r && out.length < n; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = first[0] + dx;
          const y = first[1] + dy;
          if (s.v.region(2, x, y) !== s.v.region(2, first[0], first[1]) || out.some(([ox, oy]) => Math.max(Math.abs(ox - x), Math.abs(oy - y)) < 3)) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => s.v.region(1, x + ax!, y + ay!) === home)) out.push([x, y]);
        }
      }
    }
    return out;
  }

  /** The water tile nearest the Town Center that touches our land: where waves board. */
  private shorePoint(s: Snapshot, home: number, sea = 0): [number, number] | null {
    const tc = s.tc!;
    if (this.shore && s.v.region(2, this.shore[0], this.shore[1]) && (!sea || s.v.region(2, this.shore[0], this.shore[1]) === sea)) return this.shore;
    const cx = Math.floor(tc.x);
    const cy = Math.floor(tc.y);
    for (let r = 1; r <= 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (!s.v.region(2, x, y) || (sea && s.v.region(2, x, y) !== sea)) continue; // (a pocket behind the Dock won't do)
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => s.v.region(1, x + ax!, y + ay!) === home)) return (this.shore = [x, y]);
        }
      }
    }
    return null;
  }

  /**
   * Invasion (M8.8c): once every enemy building we know stands on other land, a transport ferries the army over in
   * waves — it waits at our shore until a boatload of idle soldiers has boarded (or a minute has passed), lands
   * them beside the nearest enemy building, and comes back. Ashore, the land military takes them on.
   */
  private invade(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const tc = s.tc!;
    const home = this.homeLand(s);
    const foes = s.v.others().filter((o) => o.building && o.owner > 0 && o.cls !== 'relic' && s.v.stanceTo(o.owner) === ENEMY);
    // Invade only when every enemy building we know is on other land (one we can't place — hemmed in — counts as
    // reachable: a wrong "across the sea" verdict would stop the land war).
    const across = (o: (typeof foes)[number]) => {
      const l = this.landOf(s, o.x, o.y);
      return l !== 0 && l !== home;
    };
    // (Docks stand at the water's edge, where the nearest land can be a stray speck: judge by other buildings.)
    const judged = foes.some((o) => o.type !== 'dock') ? foes.filter((o) => o.type !== 'dock') : foes;
    if (!home || s.me.age < 2 || (foes.length && !judged.every(across))) {
      this.target = null; // too early, or the land war reaches them
      return;
    }
    if (foes.length) {
      foes.sort((a, b) => dist(a.x, a.y, tc.x, tc.y) - dist(b.x, b.y, tc.x, tc.y) || a.h - b.h);
      this.target = [foes[0]!.x, foes[0]!.y];
    } else {
      // No enemy building left: on an island keep sailing for the last one (the survivors are over there) —
      // unless they are here on our land, or this is a land map (the land war hunts them).
      // (Soldiers only: an enemy fishing boat off our coast is not the enemy on our land — M13.7, it cancelled the
      // hunt for a last Market on the enemy's island.)
      const onOurLand = s.v.others().some((o) => !o.building && LAND_ARMY(o.cls) && o.owner > 0 && o.cls !== 'relic' && s.v.stanceTo(o.owner) === ENEMY && this.landOf(s, o.x, o.y) === home);
      if (!this.island || onOurLand) this.target = null;
      if (!this.target) return;
    }
    this.ashore(s, cmds, home);
    // One transport (5) in the Tool Age, two from the Bronze Age: a wave lands together, not in fives.
    const transports = s.units.filter((u) => u.cls === 'transport');
    this.hasTransport = transports.length > 0;
    const wantTransports = s.me.age >= 3 ? 2 : 1;
    // (One order per 90 s: units still in a Dock's queue aren't counted, and three got built where one was wanted.)
    if (transports.length < wantTransports && s.v.tick - this.transportAt > 90 * 20) {
      const dock = ai.has(s, 'dock', true).find((d) => d.queue < 2);
      const unit = dock && ['heavyTransport', 'lightTransport'].find((u) => !s.v.trainBlocker(dock.h, u));
      if (dock && unit && s.v.canAfford(s.v.cost(unit)) && s.me.pop < s.me.popCap) {
        cmds.push({ t: 'train', bld: dock.h, unit });
        this.transportAt = s.v.tick;
      } else if (dock && unit && s.v.canAfford(s.v.cost(unit)) && s.me.pop >= s.me.popCap) {
        // A full population with the army waiting at the shore and no transport (M13.7: a Narrows game stood
        // still from minute 50 to the end, 9,900 wood in the bank): make room — a fishing boat goes.
        const boat = s.units.find((u) => u.cls === 'fishingShip' && !s.busy.has(u.h));
        if (boat) {
          cmds.push({ t: 'delete', ids: [boat.h] });
          s.busy.add(boat.h);
          this.transportAt = s.v.tick - 80 * 20; // train the transport on one of the next thinks
        }
      }
    }
    const shore = transports.length ? this.shorePoint(s, home, s.v.region(2, Math.floor(transports[0]!.x), Math.floor(transports[0]!.y))) : null;
    if (!transports.length || !shore) return;
    // Each transport its own boarding spot on our shore (they can't share the tile that touches land).
    const spots = this.shoreSpots(s, home, shore, transports.length);
    const spotOf = (t: (typeof transports)[number]) => spots[transports.indexOf(t) % spots.length]!;
    const capOf = (t: (typeof transports)[number]) => (t.type === 'heavyTransport' ? 10 : 5);
    const army = s.units.filter((u) => LAND_ARMY(u.cls) && this.landOf(s, u.x, u.y) === home);
    const boardingFor = (h: number) => army.filter((u) => u.order === 'board' && u.target === h).length;
    const afloat = transports.filter((t) => t.order !== 'unload');
    for (const t of transports) s.busy.add(t.h);
    // Sail together: every waiting transport full, or boarding done and the wave a minute old.
    const loaded = afloat.filter((t) => t.aboard > 0);
    const allFull = afloat.length > 0 && afloat.every((t) => t.aboard >= capOf(t));
    const age = s.v.tick - this.boardedAt;
    const stalled = loaded.length > 0 && ((afloat.every((t) => !boardingFor(t.h)) && age > 60 * 20) || age > 90 * 20);
    if (allFull || stalled) {
      // Sail for the water that touches the enemy's land nearest its building (not merely the nearest water to
      // it, which can lie too far off any beach to set troops down).
      const sea = s.v.region(2, Math.floor(loaded[0]!.x), Math.floor(loaded[0]!.y));
      const land = this.landOf(s, this.target[0], this.target[1]);
      // A transport back with its cargo aboard didn't find ground there: try the next beach along.
      if (loaded.some((t) => t.idle && dist(t.x, t.y, this.target![0], this.target![1]) < 12)) this.beachSkip = (this.beachSkip + 1) % 6;
      const beach = this.beachNear(s, this.target[0], this.target[1], land, sea, this.beachSkip) ?? [this.target[0], this.target[1]];
      cmds.push({ t: 'unload', ids: loaded.map((t) => t.h), x: Math.round(beach[0] * 4) / 4, y: Math.round(beach[1] * 4) / 4 });
      this.boardedAt = 0;
      return;
    }
    // Back to our shore; there, board idle soldiers once half a wave is ready.
    let room = 0;
    // At its spot — or idle within 4 tiles of it, as close as it could get.
    const atSpot = (t: (typeof transports)[number]) => {
      const d = dist(t.x, t.y, spotOf(t)[0] + 0.5, spotOf(t)[1] + 0.5);
      return d <= 2.5 || (t.idle && d <= 4);
    };
    for (const t of afloat) {
      const [sx, sy] = spotOf(t);
      if (!atSpot(t)) {
        if (t.idle) cmds.push({ t: 'move', ids: [t.h], x: sx + 0.5, y: sy + 0.5 });
      } else room += capOf(t) - t.aboard - boardingFor(t.h);
    }
    const ready = army.filter((u) => u.idle && !s.busy.has(u.h));
    const started = afloat.some((t) => t.aboard > 0 || boardingFor(t.h) > 0);
    if (!room || (!started && ready.length < Math.min(4, Math.ceil(afloat.reduce((a, t) => a + capOf(t), 0) / 2)))) return;
    for (const t of afloat) {
      if (!atSpot(t)) continue;
      const take = ready.filter((u) => !s.busy.has(u.h)).slice(0, Math.max(0, capOf(t) - t.aboard - boardingFor(t.h)));
      if (!take.length) continue;
      for (const u of take) s.busy.add(u.h);
      cmds.push({ t: 'act', ids: take.map((u) => u.h), h: t.h });
      if (!this.boardedAt) this.boardedAt = s.v.tick;
    }
  }

  /** Enemy ships in sight and enemy Docks explored. */
  private enemiesAtSea(s: Snapshot) {
    return s.v.others().filter((o) => o.owner > 0 && o.cls !== 'relic' && s.v.stanceTo(o.owner) === ENEMY && (o.building ? o.type === 'dock' : SHIP_CLASSES.has(o.cls)));
  }

  private research(s: Snapshot, cmds: Command[]): void {
    const dock = s.buildings.find((b) => b.type === 'dock' && b.done && b.queue < 2);
    if (!dock) return;
    // The galley line only where there is a fleet to upgrade (an island, or a coast at war at sea).
    const techs = this.island || this.contact || this.target ? DOCK_TECHS : ['fishingShip'];
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
    const base = WARSHIPS[this.island ? 'island' : 'coast'][s.me.age] ?? 4;
    const want = foes.some((o) => o.cls === 'warship') && s.me.age >= 2 ? Math.max(base, WAR_CONTESTED) : base;
    const home = s.units.filter((u) => u.cls === 'fishingShip');
    const guardAt = home.length ? [home.reduce((a, u) => a + u.x, 0) / home.length, home.reduce((a, u) => a + u.y, 0) / home.length] : [docks[0]!.x, docks[0]!.y];
    // Enemy warships near our fishing grounds, and any enemy ship close to our boats or Docks.
    const near = foes.filter(
      (o) => !o.building && (o.cls === 'warship' ? dist(o.x, o.y, guardAt[0]!, guardAt[1]!) < 16 : [...home, ...docks].some((m) => dist(m.x, m.y, o.x, o.y) < 12)),
    );
    // Build: a queued ship each think while short (fishing boats train first; both share the Docks).
    const dock = docks.find((d) => d.queue < 2);
    if (dock && fleet.length < want && s.me.pop + this.popReserve(s) < s.me.popCap) {
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
      if (this.exploreTo(s, cmds, ids, sea) || this.exploreTo(s, cmds, ids, sea, true)) {
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
  /** Villagers worth keeping: 22 on an island (boats, warships, transports and the army need the room). */
  villagerCap(): number {
    return this.island ? 22 : Infinity;
  }

  /** Population to keep free: room for the transports an invasion still lacks. */
  popReserve(s: Snapshot): number {
    if (!this.target) return 0;
    const have = s.units.filter((u) => u.cls === 'transport').length;
    return Math.max(0, (s.me.age >= 3 ? 2 : 1) - have);
  }

  landCap(_s: Snapshot): number {
    // While no transport is afloat the army waits at 4 more, so the wood goes to a new transport.
    return this.island && (!this.target || !this.hasTransport) ? 4 : Infinity;
  }

  private dock(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const tc = s.tc!;
    if (ai.isPending(s, 'dock')) return;
    // Islands add a second Dock from the Tool Age (fishing boats and warships each want one).
    const docks = ai.has(s, 'dock').length;
    if (docks >= (this.island && s.me.age >= 2 ? 2 : 1)) return;
    if (s.villagers.length < (this.island ? 5 : 8)) return;
    if (!this.island && !s.v.fish().some((f) => dist(f.x, f.y, tc.x, tc.y) < 18)) return;
    // An island: on our nearest shore, however far (a Narrows start can be 25+ tiles from the strait). A coast:
    // near the Town Center as before.
    const shore = this.island ? this.shorePoint(s, this.homeLand(s)) : null;
    if (shore) ai.build(s, cmds, 'dock', shore[0] + 0.5, shore[1] + 0.5, 0, docks ? 12 : 6, 1);
    else if (!docks) ai.build(s, cmds, 'dock', tc.x, tc.y, 3, 22, 1);
  }

  private fishers(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const dock = ai.has(s, 'dock', true)[0];
    if (!dock) return;
    const boats = s.units.filter((u) => u.cls === 'fishingShip');
    // While an invasion is on, the population goes to the army: 6 fishers are enough.
    const want = Math.min(FLEET[this.island ? 'island' : 'coast'][s.me.age] ?? 8, this.target && this.hasTransport ? 6 : Infinity);
    if (this.fleetShort && boats.length >= want / 2) return this.assignBoats(s, cmds, boats, dock);
    if (boats.length + dock.queue < want && dock.queue < 2 && s.me.pop + dock.queue + this.popReserve(s) < s.me.popCap) {
      const unit = ['fishingShip', 'fishingBoat'].find((u) => !s.v.trainBlocker(dock.h, u));
      if (unit && s.v.canAfford(s.v.cost(unit))) cmds.push({ t: 'train', bld: dock.h, unit });
    }
    this.assignBoats(s, cmds, boats, dock);
  }

  /** Idle boats: the nearest fish (to the Dock) their sea reaches, at most two boats a school. */
  private assignBoats(s: Snapshot, cmds: Command[], boats: Snapshot['units'], dock: { x: number; y: number }): void {
    // An island that hasn't found the enemy sends one boat to look (the fleet may be a long way off).
    const enemyKnown = s.v.others().some((o) => o.building && o.owner > 0 && o.cls !== 'relic' && s.v.stanceTo(o.owner) === ENEMY);
    if (this.island && !enemyKnown && boats.length >= 3) {
      const scout = boats.reduce((a, b) => (b.h < a.h ? b : a));
      if (!s.busy.has(scout.h) && (scout.idle || scout.order === 'gather')) {
        s.busy.add(scout.h);
        const sea = s.v.region(2, Math.floor(scout.x), Math.floor(scout.y));
        if (!this.exploreTo(s, cmds, [scout.h], sea)) this.exploreTo(s, cmds, [scout.h], sea, true);
      }
    }
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

  /**
   * Send ships to the next unexplored stretch of their sea (an 8 × 8 sweep of the map); false if none is left —
   * unless `patrol`, when any water out of sight will do (the last enemy ships keep moving: keep looking).
   */
  private exploreTo(s: Snapshot, cmds: Command[], ids: number[], sea: number, patrol = false): boolean {
    const W = s.v.mapW;
    const H = s.v.mapH;
    for (let k = 0; k < 64; k++) {
      const i = (this.sweep + k) % 64;
      const x = Math.floor(((i % 8) + 0.5) * (W / 8));
      const y = Math.floor((Math.floor(i / 8) + 0.5) * (H / 8));
      if ((patrol ? s.v.visible(x, y) : s.v.explored(x, y)) || s.v.region(2, x, y) !== sea) continue;
      this.sweep = (i + 1) % 64;
      cmds.push({ t: 'move', ids, x: x + 0.5, y: y + 0.5 });
      return true;
    }
    return false;
  }
}
