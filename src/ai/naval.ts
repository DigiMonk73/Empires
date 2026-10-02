import type { Command } from '../sim/commands/types.ts';
import type { AiPlayer, Snapshot } from './ai.ts';
import { afford, dist } from './ai.ts';
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
  /** When each 4×4 search cell was last in sight (-1: never) — the landed army's hunt (M14.6b). */
  seenAt?: number[];
  /** The transport throttle, the last think's transport count, the landing-beach rotation and the boarding shore
   * (M15.1: without them a loaded game trained a transport the original didn't; absent in older saves). */
  transportAt?: number;
  hasTransport?: boolean;
  beachSkip?: number;
  shore?: [number, number] | null;
}

/** The landed army's search grid: cells of 4×4 tiles. */
const CELL = 4;

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
  private seenAt: number[] = [];

  save(): NavalState {
    return {
      island: this.island,
      sweep: this.sweep,
      contact: this.contact,
      lastRaid: this.lastRaid,
      target: this.target,
      boardedAt: this.boardedAt,
      seenAt: [...this.seenAt],
      transportAt: this.transportAt,
      hasTransport: this.hasTransport,
      beachSkip: this.beachSkip,
      shore: this.shore ? [this.shore[0], this.shore[1]] : null,
    };
  }

  restore(st: NavalState | undefined): void {
    this.island = st?.island ?? null;
    this.sweep = st?.sweep ?? 0;
    this.contact = st?.contact ?? false;
    this.lastRaid = st?.lastRaid ?? -9999;
    this.target = st?.target ?? null;
    this.boardedAt = st?.boardedAt ?? 0;
    this.seenAt = st?.seenAt ? [...st.seenAt] : [];
    this.transportAt = st?.transportAt ?? -9999;
    this.hasTransport = st?.hasTransport ?? false;
    this.beachSkip = st?.beachSkip ?? 0;
    this.shore = st?.shore ?? null;
  }

  update(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    if (!tc) {
      if (!s.buildings.length) this.lastStand(s, cmds);
      return;
    }
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
    if (this.island) this.noteSeen(s);
    this.dock(ai, s, cmds);
    this.fishers(ai, s, cmds);
    if (!ai.peaceful) {
      this.research(s, cmds);
      this.warships(ai, s, cmds);
      this.invade(ai, s, cmds);
    }
  }

  /**
   * A beaten side's last warships (no buildings left) sail at the nearest enemy they can reach — the winner's
   * archers and towers finish them there. Adrift, they kept three won water games open to the 2-hour mark: the
   * winner had no navy (or no villagers, or no wood) to hunt them (M14.6b).
   */
  private lastStand(s: Snapshot, cmds: Command[]): void {
    const ships = s.units.filter((u) => u.cls === 'warship' && u.idle && !s.busy.has(u.h));
    if (!ships.length) return;
    const [x0, y0] = [ships[0]!.x, ships[0]!.y];
    const sea = s.v.region(2, Math.floor(x0), Math.floor(y0));
    const foes = s.v
      .others()
      .filter((o) => o.owner > 0 && o.cls !== 'relic' && s.v.stanceTo(o.owner) === ENEMY)
      .filter((o) => s.v.seaReachable(sea, o.x - 5, o.y - 5, o.x + 5, o.y + 5)) // (in a warship's reach from the water)
      .sort((a, b) => dist(a.x, a.y, x0, y0) - dist(b.x, b.y, x0, y0) || a.h - b.h);
    const ids = ships.map((u) => u.h);
    for (const h of ids) s.busy.add(h);
    if (foes.length) {
      cmds.push({ t: 'act', ids, h: foes[0]!.h });
      return;
    }
    // Nothing in reach from the water: off the enemy shore nearest its buildings, to fight whatever comes down to it.
    const known = s.v.others().filter((o) => o.building && o.owner > 0 && o.cls !== 'relic' && s.v.stanceTo(o.owner) === ENEMY);
    const at = known.length ? this.anyBeach(s, known[0]!.x, known[0]!.y, this.landOf(s, known[0]!.x, known[0]!.y), sea) : null;
    const [x, y] = at ?? [s.v.mapW / 2, s.v.mapH / 2];
    if (dist(x, y, x0, y0) > 3) cmds.push({ t: 'move', ids, x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4, am: true });
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
  /**
   * Landed troops: fight what is on their land, else hunt it. Returns the land of the biggest idle group left with
   * nothing to do there while enemy buildings are known on other land — stranded; the transports fetch them
   * from there (M14.6b: a won war stood still an hour, the army on the enemy's main island, its last buildings
   * on two islets, the transports waiting at home for soldiers who could not come).
   */
  private ashore(s: Snapshot, cmds: Command[], home: number): { land: number; n: number; x: number; y: number } | null {
    const abroad = s.units.filter((u) => LAND_ARMY(u.cls) && u.idle && !s.busy.has(u.h));
    if (!abroad.length) return null;
    const byLand = new Map<number, typeof abroad>();
    for (const u of abroad) {
      const l = this.landOf(s, u.x, u.y);
      if (l && l !== home) byLand.set(l, [...(byLand.get(l) ?? []), u]);
    }
    if (!byLand.size) return null;
    const foes = s.v.others().filter((o) => o.owner > 0 && o.cls !== 'relic' && s.v.stanceTo(o.owner) === ENEMY);
    let stranded: { land: number; n: number; x: number; y: number } | null = null;
    for (const [land, group] of byLand) {
      const ids = group.map((u) => u.h);
      const [gx, gy] = [group[0]!.x, group[0]!.y];
      const here = foes.filter((o) => this.landOf(s, o.x, o.y) === land).sort((a, b) => dist(a.x, a.y, gx, gy) - dist(b.x, b.y, gx, gy) || a.h - b.h);
      if (here.length) {
        for (const u of group) s.busy.add(u.h);
        cmds.push({ t: 'act', ids, h: here[0]!.h });
        continue;
      }
      // Nothing here, but enemy buildings known elsewhere: wait by the shore to be fetched (left idle for boarding).
      if (foes.some((o) => o.building && this.landOf(s, o.x, o.y) !== land)) {
        if (!stranded || group.length > stranded.n) stranded = { land, n: group.length, x: gx, y: gy };
        continue;
      }
      for (const u of group) s.busy.add(u.h);
      // Search (M14.6b): squads of three to different cells of this land, never-seen cells first, then the ones seen
      // longest ago. (The whole group walking to the nearest cell out of sight turned back and forth on the spot
      // while a beaten enemy's last buildings stood in unexplored ground: 3 of 8 undecided water games.)
      const taken: [number, number][] = [];
      for (let k = 0; k < group.length; k += 3) {
        const squad = group.slice(k, k + 3);
        const [sx, sy] = [squad[0]!.x, squad[0]!.y];
        let best: [number, number] | null = null;
        let bs = Infinity;
        let bd = Infinity;
        const cols = Math.ceil(s.v.mapW / CELL);
        for (let cy = 0; cy * CELL < s.v.mapH; cy++) {
          for (let cx = 0; cx < cols; cx++) {
            const x = Math.min(s.v.mapW - 1, cx * CELL + 2);
            const y = Math.min(s.v.mapH - 1, cy * CELL + 2);
            if (s.v.region(1, x, y) !== land || s.v.visible(x, y) || taken.some(([tx, ty]) => dist(tx, ty, x, y) < 8)) continue;
            const seen = this.seenAt[cy * cols + cx] ?? -1;
            const d = dist(x, y, sx, sy);
            if (seen < bs || (seen === bs && d < bd)) {
              bs = seen;
              bd = d;
              best = [x + 0.5, y + 0.5];
            }
          }
        }
        if (!best) continue;
        taken.push(best);
        cmds.push({ t: 'move', ids: squad.map((u) => u.h), x: best[0], y: best[1], am: true });
      }
    }
    return stranded;
  }

  /** Note which search cells are in sight now (the landed army's hunt goes to the ones seen longest ago). */
  private noteSeen(s: Snapshot): void {
    const cols = Math.ceil(s.v.mapW / CELL);
    for (let cy = 0; cy * CELL < s.v.mapH; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        while (this.seenAt.length <= i) this.seenAt.push(-1);
        if (s.v.visible(Math.min(s.v.mapW - 1, cx * CELL + 2), Math.min(s.v.mapH - 1, cy * CELL + 2))) this.seenAt[i] = s.v.tick;
      }
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
  /**
   * The water our ships should sail on: with an invasion target, the biggest body of water touching both our land
   * and the target's; else the biggest body of water (the open sea, not a cove or a lake).
   */
  private sea(s: Snapshot): number {
    // Whole-map scans, so remembered until region labels change (M15.3: 9% of a full-population frame's CPU on a
    // map with no sea at all) — keyed on passVersion, like everything the AI keeps about regions.
    const key = this.target ? `${this.target[0]},${this.target[1]}` : '';
    if (this.seaAt === s.v.passVersion() && this.seaKey === key) return this.seaOf;
    this.seaOf = this.findSea(s);
    this.seaAt = s.v.passVersion();
    this.seaKey = key;
    return this.seaOf;
  }

  private seaAt = -1;
  private seaKey = '';
  private seaOf = 0;

  private findSea(s: Snapshot): number {
    if (!this.target) return this.mainSea(s);
    const home = this.homeLand(s);
    const there = this.landOf(s, this.target[0], this.target[1]);
    if (!home || !there) return this.mainSea(s);
    const n = new Map<number, number>();
    const mine = new Set<number>();
    const theirs = new Set<number>();
    for (let y = 0; y < s.v.mapH; y++) {
      for (let x = 0; x < s.v.mapW; x++) {
        const r = s.v.region(2, x, y);
        if (!r) continue;
        n.set(r, (n.get(r) ?? 0) + 1);
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const l = s.v.region(1, x + ax, y + ay);
          if (l === home) mine.add(r);
          else if (l === there) theirs.add(r);
        }
      }
    }
    let best = 0;
    let bn = 0;
    for (const [r, c] of n) if (mine.has(r) && theirs.has(r) && (c > bn || (c === bn && r < best))) [best, bn] = [r, c];
    return best || this.mainSea(s);
  }

  /** A water tile of sea `sea` within 3 tiles of a building (its centre), as a tile centre. */
  private waterBeside(s: Snapshot, b: { x: number; y: number }, sea: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = Math.floor(b.x) + dx;
        const y = Math.floor(b.y) + dy;
        if (s.v.region(2, x, y) !== sea) continue;
        const d = dist(x + 0.5, y + 0.5, b.x, b.y);
        if (d < bd) {
          bd = d;
          best = [x + 0.5, y + 0.5];
        }
      }
    }
    return best;
  }

  /** The biggest body of water (region label) — the open sea, not a cove or a lake. */
  private mainSea(s: Snapshot): number {
    const n = new Map<number, number>();
    for (let y = 0; y < s.v.mapH; y++) {
      for (let x = 0; x < s.v.mapW; x++) {
        const r = s.v.region(2, x, y);
        if (r) n.set(r, (n.get(r) ?? 0) + 1);
      }
    }
    let best = 0;
    let bn = 0;
    for (const [r, c] of n) if (c > bn || (c === bn && r < best)) [best, bn] = [r, c];
    return best;
  }

  /** The water tile of sea `sea` touching land `land` nearest (x, y), searched over the whole map. */
  private anyBeach(s: Snapshot, x0: number, y0: number, land: number, sea: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let y = 0; y < s.v.mapH; y++) {
      for (let x = 0; x < s.v.mapW; x++) {
        if (s.v.region(2, x, y) !== sea) continue;
        if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => s.v.region(1, x + ax!, y + ay!) === land)) continue;
        const d = dist(x, y, x0, y0);
        if (d < bd) {
          bd = d;
          best = [x + 0.5, y + 0.5];
        }
      }
    }
    return best;
  }

  /** A water tile of sea `sea` touching land `land`, nearest (x, y) (not cached: a stranded group's shore). */
  private shoreOf(s: Snapshot, land: number, sea: number, x0: number, y0: number): [number, number] | null {
    const cx = Math.floor(x0);
    const cy = Math.floor(y0);
    for (let r = 1; r <= 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (!s.v.region(2, x, y) || (sea && s.v.region(2, x, y) !== sea)) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => s.v.region(1, x + ax!, y + ay!) === land)) return [x, y];
        }
      }
    }
    return null;
  }

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
      if (l === 0 || l === home) return false;
      // A Dock our soldiers can walk up to is on our side, whatever speck of shore it touches (M14.6: a won
      // continental war stood 10 minutes, the army waiting for transports to reach a last Dock it could walk to).
      if (o.type === 'dock' && s.v.reachable(tc.x + tc.size / 2 + 0.5, tc.y, o.x - 1.5, o.y - 1.5, o.x + 1.5, o.y + 1.5)) return false;
      return true;
    };
    // (Docks stand at the water's edge, where the nearest land can be a stray speck: judge by other buildings.)
    const judged = foes.some((o) => o.type !== 'dock') ? foes.filter((o) => o.type !== 'dock') : foes;
    if (!home || s.me.age < 2 || (foes.length && !judged.every(across))) {
      this.target = null; // too early, or the land war reaches them
      return;
    }
    if (foes.length) {
      foes.sort((a, b) => dist(a.x, a.y, tc.x, tc.y) - dist(b.x, b.y, tc.x, tc.y) || a.h - b.h);
      // (A building whose land can't be told — a Storage Pit deep in a forest — gives no beach to land on: three
      // full transports waited an hour for one, M14.6b. Sail for the nearest one on known land.)
      const t = foes.find((o) => this.landOf(s, o.x, o.y) !== 0) ?? foes[0]!;
      this.target = [t.x, t.y];
    } else {
      // No enemy building left: on an island keep sailing for the last one (the survivors are over there) —
      // unless they are here on our land, or this is a land map (the land war hunts them).
      // (Soldiers only: an enemy fishing boat off our coast is not the enemy on our land — M13.7, it cancelled the
      // hunt for a last Market on the enemy's island.)
      const onOurLand = s.v.others().some((o) => !o.building && LAND_ARMY(o.cls) && o.owner > 0 && o.cls !== 'relic' && s.v.stanceTo(o.owner) === ENEMY && this.landOf(s, o.x, o.y) === home);
      if (!this.island || onOurLand) this.target = null;
      if (!this.target) return;
    }
    const stranded = this.ashore(s, cmds, home);
    // One transport (5) in the Tool Age, two from the Bronze Age: a wave lands together, not in fives.
    // Only transports on the water that reaches the target count (one launched into the ocean behind our own coast
    // can never get there — M14.6b, a Narrows army of 26 waited an hour for it).
    const main = this.sea(s);
    const transports = s.units.filter((u) => u.cls === 'transport' && s.v.region(2, Math.floor(u.x), Math.floor(u.y)) === main);
    this.hasTransport = transports.length > 0;
    const wantTransports = s.me.age >= 3 ? 2 : 1;
    // (One order per 90 s: units still in a Dock's queue aren't counted, and three got built where one was wanted.)
    if (transports.length < wantTransports && s.v.tick - this.transportAt > 90 * 20) {
      const onSea = (d: { x: number; y: number }) => s.v.seaReachable(main, d.x - 1.5, d.y - 1.5, d.x + 1.5, d.y + 1.5);
      const docks = ai.has(s, 'dock', true).filter((d) => d.queue < 2);
      const dock = docks.find(onSea) ?? docks[0];
      const unit = dock && ['heavyTransport', 'lightTransport'].find((u) => !s.v.trainBlocker(dock.h, u));
      if (dock && unit && s.v.canAfford(s.v.cost(unit)) && s.me.pop < s.me.popCap) {
        // A Dock on two waters launches toward its rally point: point it at the one that reaches the target.
        const water = this.waterBeside(s, dock, main);
        if (water) cmds.push({ t: 'rally', blds: [dock.h], x: water[0], y: water[1] });
        cmds.push({ t: 'train', bld: dock.h, unit });
        this.transportAt = s.v.tick;
      } else if (dock && unit && s.v.canAfford(s.v.cost(unit)) && s.me.pop >= s.me.popCap) {
        // A full population with the army waiting at the shore and no transport (M13.7: a Narrows game stood
        // still from minute 50 to the end, 9,900 wood in the bank): make room — a fishing boat goes.
        // (Any boat: they are usually all busy by now — given this think's fishing orders — and that kept this from
        // ever firing: seed 312 stood at 56/50 without a transport from minute 45, KI-10.)
        // No boat, or more over than boats: idle villagers, then soldiers at home — enough to get under the limit
        // (M16.9: priests' conversions held dev seeds 402, 426, 430 and 446 at 54–90 of 50, wood in the bank and no
        // boat to delete, to the 2-hour mark).
        const home = this.homeLand(s);
        const free = (u: (typeof s.units)[number]) => !s.busy.has(u.h);
        const victims = [
          ...s.units.filter((u) => u.cls === 'fishingShip' && free(u)),
          ...s.villagers.filter((u) => u.idle && free(u)),
          ...s.units.filter((u) => u.cls === 'fishingShip' && !free(u)),
          ...s.units.filter((u) => LAND_ARMY(u.cls) && u.idle && free(u) && this.landOf(s, u.x, u.y) === home),
        ].slice(0, s.me.pop - s.me.popCap + 1);
        if (victims.length) {
          cmds.push({ t: 'delete', ids: victims.map((u) => u.h) });
          for (const u of victims) s.busy.add(u.h);
          this.transportAt = s.v.tick - 80 * 20; // train the transport on one of the next thinks
        }
      }
    }
    // Board at home — or where a stranded group waits, when fewer stand ready at home (M14.6b).
    const atHome = s.units.filter((u) => LAND_ARMY(u.cls) && u.idle && !s.busy.has(u.h) && this.landOf(s, u.x, u.y) === home).length;
    const base = stranded && stranded.n >= 2 && atHome < stranded.n ? stranded.land : home;
    const sea0 = transports.length ? s.v.region(2, Math.floor(transports[0]!.x), Math.floor(transports[0]!.y)) : 0;
    const away = base !== home && stranded ? this.shoreOf(s, base, sea0, stranded.x, stranded.y) : null;
    const shore = away ?? (transports.length ? this.shorePoint(s, home, sea0) : null);
    if (!transports.length || !shore) return;
    const boardLand = away ? base : home;
    // Each transport its own boarding spot on the shore (they can't share the tile that touches land).
    const spots = this.shoreSpots(s, boardLand, shore, transports.length);
    const spotOf = (t: (typeof transports)[number]) => spots[transports.indexOf(t) % spots.length]!;
    const capOf = (t: (typeof transports)[number]) => (t.type === 'heavyTransport' ? 10 : 5);
    const army = s.units.filter((u) => LAND_ARMY(u.cls) && this.landOf(s, u.x, u.y) === boardLand);
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
      // (No beach within 30 tiles of an inland target: the beach of that land nearest it, however far — sailing for
      // the building's own tile left three full transports at our shore for an hour, M14.6b.)
      const beach = this.beachNear(s, this.target[0], this.target[1], land, sea, this.beachSkip) ?? this.anyBeach(s, this.target[0], this.target[1], land, sea) ?? [this.target[0], this.target[1]];
      cmds.push({ t: 'unload', ids: loaded.map((t) => t.h), x: Math.round(beach[0] * 4) / 4, y: Math.round(beach[1] * 4) / 4 });
      this.boardedAt = 0;
      return;
    }
    // Back to our shore; there, board idle soldiers once half a wave is ready.
    let room = 0;
    // At its spot — or idle within 4 tiles of it, as close as it could get — and beside the land the soldiers walk
    // on: one stopped three tiles short, no shore beside it, had them told to board, give up and be told again for an
    // hour (M16.9, dev water seed 417).
    const ashoreBy = (t: (typeof transports)[number]) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (s.v.region(1, Math.floor(t.x) + dx, Math.floor(t.y) + dy) === boardLand) return true;
      return false;
    };
    const atSpot = (t: (typeof transports)[number]) => {
      const d = dist(t.x, t.y, spotOf(t)[0] + 0.5, spotOf(t)[1] + 0.5);
      return (d <= 2.5 || (t.idle && d <= 4)) && ashoreBy(t);
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
      if (unit && afford(s, s.v.cost(unit)) && (near.length || s.me.res[1]! >= s.v.cost(unit)[1]! + 75)) cmds.push({ t: 'train', bld: dock.h, unit });
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

  /**
   * Wood to keep for a transport (KI-10): on an island with an invasion to make and no transport afloat, once the
   * trees we can reach at home hold under 1500 — or the last of them go to farms, houses and boats, the fleet sinks,
   * and both sides sit out the game across the water with thousands of gold (tiny-island seeds 305, 311).
   */
  woodReserve(s: Snapshot): number {
    if (!this.island || !this.target || s.units.some((u) => u.cls === 'transport')) return 0;
    let wood = 0;
    for (const r of s.known) if (r.job === 'wood') wood += r.amount;
    if (wood >= 1500) return 0;
    const dock = s.buildings.some((b) => b.type === 'dock' && b.done) ? 0 : s.v.cost('dock')[1]!;
    return s.v.cost('lightTransport')[1]! + dock;
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
    // Islands add a second Dock from the Tool Age (fishing boats and warships each want one) — and one more when
    // none of them is on the water that reaches the enemy (M14.6b: a Narrows army of 26 stood an hour at home, its
    // transport on the ocean behind its own coast while the strait ran on the other side).
    const docks = ai.has(s, 'dock').length;
    const sea = this.sea(s);
    const reaching = !this.target || ai.has(s, 'dock').some((d) => s.v.seaReachable(sea, d.x - 1.5, d.y - 1.5, d.x + 1.5, d.y + 1.5));
    if (docks >= (this.island && s.me.age >= 2 ? 2 : 1) + (reaching ? 0 : 1)) return;
    if (s.villagers.length < (this.island ? 5 : 8)) return;
    if (!this.island && !s.v.fish().some((f) => dist(f.x, f.y, tc.x, tc.y) < 18)) return;
    // An island: on our nearest shore, however far (a Narrows start can be 25+ tiles from the strait). A coast:
    // near the Town Center as before.
    // (On the open sea, not a cove: transports built in a pocket of water could never sail — M14.6b, seed 402.)
    const shore = this.island ? (reaching ? this.shorePoint(s, this.homeLand(s), sea) : this.shoreOf(s, this.homeLand(s), sea, tc.x, tc.y)) : null;
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
      if (unit && afford(s, s.v.cost(unit))) cmds.push({ t: 'train', bld: dock.h, unit });
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
