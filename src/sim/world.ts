import { RESOURCES } from '../data/types.ts';
import { STARTING_RESOURCES, type AiLevel, type StartingResources } from '../data/setup.ts';
import { terrainIndex } from '../data/terrain.ts';
import { Act, EKind, EntityStore } from './core/entities.ts';
import { ResourceStore } from './core/resources.ts';
import { Rng, STREAM } from './math/rng.ts';
import { Occ, TileMap } from './map/tilemap.ts';
import { RESOURCE_KINDS, TYPES, buildingTypeIndex, resourceKindIndex, unitTypeIndex } from './rules/registry.ts';
import { PathService } from './path/service.ts';
import { UnitGrid } from './core/spatial.ts';
import { PathGrid } from './path/grid.ts';
import { compilePlayerStats, type PlayerStats } from './rules/playerStats.ts';
import { CIV_BY_ID } from '../data/index.ts';
import { POPULATION } from '../data/setup.ts';
import { createFog, fogSystem, unstampLos, type FogState } from './systems/fog.ts';
import { populationSystem } from './systems/population.ts';
import type { Production, Rally } from './systems/production.ts';

export type { AiLevel };

export interface PlayerSetup {
  civ: string;
  team?: number;
  /** Computer player at this difficulty (the sim ignores it; the session starts an AI controller). */
  ai?: AiLevel;
}

export interface MapSpec {
  w: number;
  h: number;
  /** Fill terrain id (default grass). */
  terrain?: string;
  /**
   * Optional ASCII layout (h rows of w chars): `.` grass, `d` dirt, `s` desert, `b` beach, `,` shallows,
   * `~` water, `w` deep water, `T` tree on grass, `F` forest tree on forest floor, `G` gold, `S` stone,
   * `B` berry bush.
   */
  ascii?: readonly string[];
}

export interface ScenarioSpec {
  units?: readonly { type: string; owner: number; x: number; y: number }[];
  /** `progress` < 1 places a foundation that far along; `stock` sets a farm's food left (default: full). */
  buildings?: readonly { type: string; owner: number; tx: number; ty: number; progress?: number; stock?: number }[];
  resources?: readonly { kind: string; tx: number; ty: number }[];
}

export interface SimConfig {
  seed: number;
  map: MapSpec;
  /** Players 1..n (Gaia is player 0 and implicit). */
  players: readonly PlayerSetup[];
  scenario?: ScenarioSpec;
  /** Starting stockpile setting (econ:1.5); default 'default' = 200 food, 200 wood, 150 stone. */
  startingResources?: StartingResources;
  /** Victory condition (econ:7): 'conquest' (default) or 'none' (sandbox/review scenarios never end). */
  victory?: 'conquest' | 'none';
  /** "Reveal Map" option: the whole map starts explored (units in unwatched areas stay hidden). */
  revealMap?: boolean;
  /** Population limit (default 50; RoR allows 25–200). */
  popCap?: number;
}

export interface PlayerState {
  id: number;
  civ: string;
  team: number;
  /** Stockpile: food, wood, gold, stone (RESOURCES order). */
  res: Float64Array;
  /** Researched techs in completion order (the stats are compiled from civ + these). */
  techs: string[];
  /** Compiled per-player stats (derived from civ + techs; not hashed directly). */
  stats: PlayerStats;
  /** Current population and housing (derived each tick). */
  pop: number;
  popCap: number;
  /** Conquest (econ:7): set the tick a player has nothing left that counts. */
  defeated: number | null;
  /** Running tallies for the score and the post-game screen. */
  tally: Tally;
}

export interface Tally {
  kills: number;
  losses: number;
  razed: number;
  buildingsLost: number;
  /** Food, wood, gold, stone delivered. */
  gathered: number[];
  conversions: number;
  /** Tick each age was reached (index = age; 0 = not yet). */
  ageTick: number[];
}

export const newTally = (): Tally => ({ kills: 0, losses: 0, razed: 0, buildingsLost: 0, gathered: [0, 0, 0, 0], conversions: 0, ageTick: [0, 0, 0, 0, 0] });

/**
 * A queued unit order. More kinds arrive with gathering, building and combat. A group move names a `leader`
 * (handle): followers reuse the leader's path instead of searching their own.
 */
/**
 * A missile in flight. The aim point is fixed at release (mil:2: moving targets can dodge); damage comes from the
 * shooter's type and owner at impact, so it lands even if the shooter died meanwhile.
 */
export interface Projectile {
  /** Shooter type index and owner; `src` its handle (for retaliation). */
  type: number;
  owner: number;
  src: number;
  target: number;
  /** Launch point and aim point (tiles). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Launch tick and flight time (ticks). */
  t0: number;
  dur: number;
  /** A hunter's spear (villager attack vs animals). */
  hunt: boolean;
  /** Arcing stone (splash in M5.6) vs flat arrow. */
  arc: boolean;
}

export type Order =
  /** `am`: attack-move (modern QoL) — engage enemies met on the way, then carry on. */
  | { k: 'move'; x: number; y: number; leader?: number; am?: boolean }
  /**
   * Gather from resource node `res` (phase 0 = heading to the node, 1 = working, 2 = heading to drop site
   * `drop`). `retry` throttles searches when no node/drop site is available.
   */
  | { k: 'gather'; res: number; phase: 0 | 1 | 2; drop: number; retry: number }
  /** Build foundation `h` (phase 0 = walking, 1 = building). */
  | { k: 'build'; h: number; phase: 0 | 1; retry: number }
  /** Farm field `h` (phases as gather). */
  | { k: 'farm'; h: number; phase: 0 | 1 | 2; drop: number; retry: number }
  /** Attack unit `h` (`hunt`: a villager hunting an animal — butchers the carcass afterwards). */
  /** Attack unit/building `h`. `auto`: picked by the unit itself (auto-acquire, retaliation) — leashed, and dropped
   *  by Stand Ground units once the target leaves reach. */
  | { k: 'attack'; h: number; hunt: boolean; retarget: number; windup: number; auto: boolean; stall?: number }
  /** A priest converting `h` (chanting from range once its faith is full) or healing `h` (adjacent). */
  | { k: 'convert'; h: number; chant: number; auto: boolean; stall?: number }
  | { k: 'heal'; h: number; auto: boolean; stall?: number };

export type SimEvent =
  | { t: 'rejected'; player: number; reason: string }
  | { t: 'deposit'; player: number; res: number; amount: number }
  | { t: 'depleted'; res: number }
  | { t: 'built'; h: number; player: number }
  | { t: 'trained'; h: number; player: number }
  | { t: 'died'; h: number; owner: number; type: number; x: number; y: number; facing: number }
  | { t: 'destroyed'; h: number; owner: number; type: number; x: number; y: number; built: boolean }
  | { t: 'farmDepleted'; h: number; player: number }
  | { t: 'researched'; player: number; tech: string }
  | { t: 'defeated'; player: number }
  | { t: 'victory'; team: number; players: number[] }
  | { t: 'housed'; h: number; player: number }
  | { t: 'arrived'; h: number }
  | { t: 'stuck'; h: number }
  /** Entity `h` changed sides (a priest's conversion). */
  | { t: 'converted'; h: number; from: number; to: number; x: number; y: number; priest: number }
  /** A swing lands or a missile is released (render/audio only). */
  | { t: 'strike'; h: number; tgt: number; type: number; x: number; y: number; missile: boolean; building: boolean }
  /** A missile comes down (hit or not). */
  | { t: 'impact'; type: number; x: number; y: number; hit: boolean };

/** All simulation state. Systems mutate it; nothing else does (see sim/index.ts). */
export class World {
  tick = 0;
  readonly seed: number;
  readonly map: TileMap;
  readonly ents: EntityStore;
  readonly res: ResourceStore;
  readonly players: PlayerState[];
  readonly rng: { combat: Rng; conversion: Rng; animals: Rng; misc: Rng };
  /** Per-slot order queues (cold data); undefined = no orders. */
  orders: (Order[] | undefined)[] = [];
  /** Per-slot path waypoints as [x0, y0, x1, y1, …] (cold data). */
  paths: (number[] | undefined)[] = [];
  /** Resource-node indices of carcasses that are still rotting. */
  carcasses: number[] = [];
  /** Set when one team is left standing (conquest). The game may continue afterwards. */
  gameOver: { tick: number; team: number; winners: number[] } | null = null;
  /** Arrows, spears and stones in flight (cold data, launch order). */
  projectiles: Projectile[] = [];
  /** Per-building production queues and rally points (cold data). */
  prod: (Production | undefined)[] = [];
  rally: (Rally | undefined)[] = [];
  events: SimEvent[] = [];
  /** Game population limit (config). */
  readonly popLimit: number;
  readonly pathing: PathService;
  readonly grid: UnitGrid;
  readonly fog: FogState;
  /** Reusable per-tick buffers (not state). */
  scratch = { px: new Float64Array(256), py: new Float64Array(256) };
  private pathGrids = new Map<number, PathGrid>();
  /** Movement metrics (not hashed): unit-ticks spent moving / blocked. */
  moveStats = { movingTicks: 0, blockedTicks: 0, gaveUp: 0, repaths: 0, directPaths: 0, sharedPaths: 0 };

  /** Victory condition from the config (econ:7). */
  readonly victory: 'conquest' | 'none';

  constructor(cfg: SimConfig) {
    this.seed = cfg.seed | 0;
    this.victory = cfg.victory ?? 'conquest';
    const fill = terrainIndex(cfg.map.terrain ?? 'grass');
    this.map = new TileMap(cfg.map.w, cfg.map.h, fill);
    this.ents = new EntityStore();
    this.res = new ResourceStore(cfg.map.w, cfg.map.h);
    this.popLimit = cfg.popCap ?? POPULATION.default;
    const gaia: PlayerState = { id: 0, civ: 'gaia', team: 0, res: new Float64Array(RESOURCES.length), techs: [], stats: compilePlayerStats('gaia'), pop: 0, popCap: 0, defeated: null, tally: newTally() };
    this.players = [gaia];
    const start = STARTING_RESOURCES[cfg.startingResources ?? 'default'];
    cfg.players.forEach((p, i) => {
      const res = Float64Array.from(RESOURCES.map((r) => start[r]));
      // Civ starting-stockpile modifiers (e.g. Shang −40 food).
      for (const e of CIV_BY_ID.get(p.civ)?.bonuses ?? []) {
        if (e.op === 'player' && e.attr.startsWith('start.')) {
          const k = RESOURCES.indexOf(e.attr.slice(6) as (typeof RESOURCES)[number]);
          res[k] = e.mode === 'add' ? res[k]! + e.v : e.mode === 'mul' ? res[k]! * e.v : e.v;
        }
      }
      this.players.push({ id: i + 1, civ: p.civ, team: p.team ?? i + 1, res, techs: [], stats: compilePlayerStats(p.civ), pop: 0, popCap: 0, defeated: null, tally: newTally() });
    });
    this.rng = {
      combat: new Rng(this.seed, STREAM.combat),
      conversion: new Rng(this.seed, STREAM.conversion),
      animals: new Rng(this.seed, STREAM.animals),
      misc: new Rng(this.seed, STREAM.misc),
    };
    this.pathing = new PathService(this);
    this.grid = new UnitGrid(cfg.map.w, cfg.map.h);
    this.fog = createFog(this.players.length, cfg.map.w, cfg.map.h, !!cfg.revealMap);
    if (cfg.map.ascii) this.applyAscii(cfg.map.ascii);
    const sc = cfg.scenario;
    for (const r of sc?.resources ?? []) this.addResource(resourceKindIndex(r.kind), r.tx, r.ty);
    for (const b of sc?.buildings ?? []) {
      const ti = buildingTypeIndex(b.type);
      const done = b.progress === undefined || b.progress >= 1;
      const slot = this.ents.slotOf(this.placeBuilding(ti, b.owner, b.tx, b.ty, done));
      if (!done) {
        this.ents.build[slot] = b.progress!;
        this.ents.hp[slot] = Math.max(1, this.stats(b.owner, ti).hp * b.progress!);
      } else if (TYPES[ti]!.building?.kind === 'farm') this.ents.stock[slot] = b.stock ?? this.players[b.owner]!.stats.farmFood;
    }
    for (const u of sc?.units ?? []) this.spawnUnit(unitTypeIndex(u.type), u.owner, u.x, u.y);
    this.grid.rebuild(this.ents);
    fogSystem(this);
    populationSystem(this);
  }

  private applyAscii(rows: readonly string[]): void {
    const T: Record<string, [string, string?]> = {
      '.': ['grass'], d: ['dirt'], s: ['desert'], b: ['beach'], ',': ['shallows'], '~': ['water'], w: ['deepWater'],
      T: ['grass', 'tree'], F: ['forest', 'forestTree'], G: ['grass', 'goldMine'], S: ['grass', 'stoneMine'], B: ['grass', 'berryBush'],
      f: ['water', 'shoreFish'],
    };
    for (let ty = 0; ty < Math.min(rows.length, this.map.h); ty++) {
      const row = rows[ty]!;
      for (let tx = 0; tx < Math.min(row.length, this.map.w); tx++) {
        const spec = T[row[tx]!];
        if (!spec) throw new Error(`unknown map char '${row[tx]}' at ${tx},${ty}`);
        this.map.setTerrain(tx, ty, terrainIndex(spec[0]));
        if (spec[1]) this.addResource(resourceKindIndex(spec[1]), tx, ty);
      }
    }
  }

  addResource(kind: number, tx: number, ty: number): number {
    const def = RESOURCE_KINDS[kind]!;
    const i = this.res.add(kind, tx, ty, def.amount);
    for (let dy = 0; dy < def.size; dy++) {
      for (let dx = 0; dx < def.size; dx++) {
        if (!this.map.inBounds(tx + dx, ty + dy)) continue;
        this.map.resAt[this.map.idx(tx + dx, ty + dy)] = i + 1;
        // Fish sit in water (boats gather from adjacent water) and carcasses lie on open ground: neither blocks.
        if (def.job !== 'fish' && def.job !== 'hunt') this.map.setOcc(tx + dx, ty + dy, Occ.resource, true);
      }
    }
    return i;
  }

  /** Compiled stats of `type` for its owner. */
  stats(owner: number, type: number) {
    return this.players[owner]!.stats.types[type]!;
  }

  spawnUnit(type: number, owner: number, x: number, y: number): number {
    const h = this.ents.create(EKind.unit, type, owner, x, y);
    this.ents.hp[this.ents.slotOf(h)] = this.stats(owner, type).hp;
    return h;
  }

  /** Place a building with its top-left corner at tile (tx, ty) — complete, or as a 1-HP foundation. */
  placeBuilding(type: number, owner: number, tx: number, ty: number, complete = true): number {
    const t = TYPES[type]!;
    const s = t.size;
    const h = this.ents.create(EKind.building, type, owner, tx + s / 2, ty + s / 2);
    const slot = this.ents.slotOf(h);
    this.ents.hp[slot] = complete ? this.stats(owner, type).hp : 1;
    this.ents.build[slot] = complete ? 1 : 0;
    const occ = t.building?.kind === 'farm' ? Occ.farm : Occ.building;
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) {
        if (!this.map.inBounds(tx + dx, ty + dy)) continue;
        this.map.bldAt[this.map.idx(tx + dx, ty + dy)] = h + 1;
        this.map.setOcc(tx + dx, ty + dy, occ, true);
      }
    }
    return h;
  }

  pathGrid(moveClass: number): PathGrid {
    let g = this.pathGrids.get(moveClass);
    if (!g) this.pathGrids.set(moveClass, (g = new PathGrid(this.map, moveClass)));
    return g;
  }

  /** Remove an entity and its cold data. */
  removeEntity(h: number): void {
    const slot = this.ents.slotOf(h);
    if (slot < 0) return;
    this.orders[slot] = undefined;
    this.paths[slot] = undefined;
    this.prod[slot] = undefined;
    this.rally[slot] = undefined;
    this.pathing.cancel(slot);
    unstampLos(this, slot);
    if (this.ents.kind[slot] === EKind.building) {
      const t = TYPES[this.ents.type[slot]!]!;
      const tx = Math.round(this.ents.x[slot]! - t.size / 2);
      const ty = Math.round(this.ents.y[slot]! - t.size / 2);
      const occ = t.building?.kind === 'farm' ? Occ.farm : Occ.building;
      for (let dy = 0; dy < t.size; dy++) {
        for (let dx = 0; dx < t.size; dx++) {
          if (!this.map.inBounds(tx + dx, ty + dy)) continue;
          this.map.bldAt[this.map.idx(tx + dx, ty + dy)] = 0;
          this.map.setOcc(tx + dx, ty + dy, occ, false);
        }
      }
    }
    this.ents.act[slot] = Act.idle;
    this.ents.destroy(h);
  }
}
