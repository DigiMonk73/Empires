import { RESOURCES } from '../data/types.ts';
import { terrainIndex } from '../data/terrain.ts';
import { Act, EKind, EntityStore } from './core/entities.ts';
import { ResourceStore } from './core/resources.ts';
import { Rng, STREAM } from './math/rng.ts';
import { Occ, TileMap } from './map/tilemap.ts';
import { RESOURCE_KINDS, TYPES, buildingTypeIndex, resourceKindIndex, unitTypeIndex } from './rules/registry.ts';
import { PathService } from './path/service.ts';
import { UnitGrid } from './core/spatial.ts';
import { PathGrid } from './path/grid.ts';

export interface PlayerSetup {
  civ: string;
  team?: number;
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
  buildings?: readonly { type: string; owner: number; tx: number; ty: number }[];
  resources?: readonly { kind: string; tx: number; ty: number }[];
}

export interface SimConfig {
  seed: number;
  map: MapSpec;
  /** Players 1..n (Gaia is player 0 and implicit). */
  players: readonly PlayerSetup[];
  scenario?: ScenarioSpec;
}

export interface PlayerState {
  id: number;
  civ: string;
  team: number;
  /** Stockpile: food, wood, gold, stone (RESOURCES order). */
  res: Float64Array;
}

/**
 * A queued unit order. More kinds arrive with gathering, building and combat. A group move names a `leader`
 * (handle): followers reuse the leader's path instead of searching their own.
 */
export type Order = { k: 'move'; x: number; y: number; leader?: number };

export type SimEvent =
  | { t: 'rejected'; player: number; reason: string }
  | { t: 'arrived'; h: number }
  | { t: 'stuck'; h: number };

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
  events: SimEvent[] = [];
  readonly pathing: PathService;
  readonly grid: UnitGrid;
  /** Reusable per-tick buffers (not state). */
  scratch = { px: new Float64Array(256), py: new Float64Array(256) };
  private pathGrids = new Map<number, PathGrid>();
  /** Movement metrics (not hashed): unit-ticks spent moving / blocked. */
  moveStats = { movingTicks: 0, blockedTicks: 0, gaveUp: 0, repaths: 0, directPaths: 0, sharedPaths: 0 };

  constructor(cfg: SimConfig) {
    this.seed = cfg.seed | 0;
    const fill = terrainIndex(cfg.map.terrain ?? 'grass');
    this.map = new TileMap(cfg.map.w, cfg.map.h, fill);
    this.ents = new EntityStore();
    this.res = new ResourceStore(cfg.map.w, cfg.map.h);
    this.players = [{ id: 0, civ: 'gaia', team: 0, res: new Float64Array(RESOURCES.length) }];
    cfg.players.forEach((p, i) => this.players.push({ id: i + 1, civ: p.civ, team: p.team ?? i + 1, res: new Float64Array(RESOURCES.length) }));
    this.rng = {
      combat: new Rng(this.seed, STREAM.combat),
      conversion: new Rng(this.seed, STREAM.conversion),
      animals: new Rng(this.seed, STREAM.animals),
      misc: new Rng(this.seed, STREAM.misc),
    };
    this.pathing = new PathService(this);
    this.grid = new UnitGrid(cfg.map.w, cfg.map.h);
    if (cfg.map.ascii) this.applyAscii(cfg.map.ascii);
    const sc = cfg.scenario;
    for (const r of sc?.resources ?? []) this.addResource(resourceKindIndex(r.kind), r.tx, r.ty);
    for (const b of sc?.buildings ?? []) this.placeBuilding(buildingTypeIndex(b.type), b.owner, b.tx, b.ty);
    for (const u of sc?.units ?? []) this.spawnUnit(unitTypeIndex(u.type), u.owner, u.x, u.y);
    this.grid.rebuild(this.ents);
  }

  private applyAscii(rows: readonly string[]): void {
    const T: Record<string, [string, string?]> = {
      '.': ['grass'], d: ['dirt'], s: ['desert'], b: ['beach'], ',': ['shallows'], '~': ['water'], w: ['deepWater'],
      T: ['grass', 'tree'], F: ['forest', 'forestTree'], G: ['grass', 'goldMine'], S: ['grass', 'stoneMine'], B: ['grass', 'berryBush'],
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
        // Fish sit in water: they don't change passability for ships in 1.0 (boats gather from adjacent water).
        if (def.job !== 'fish') this.map.setOcc(tx + dx, ty + dy, Occ.resource, true);
      }
    }
    return i;
  }

  spawnUnit(type: number, owner: number, x: number, y: number): number {
    const t = TYPES[type]!;
    const h = this.ents.create(EKind.unit, type, owner, x, y);
    this.ents.hp[this.ents.slotOf(h)] = t.hp;
    return h;
  }

  /** Place a completed building with its top-left corner at tile (tx, ty). */
  placeBuilding(type: number, owner: number, tx: number, ty: number): number {
    const t = TYPES[type]!;
    const s = t.size;
    const h = this.ents.create(EKind.building, type, owner, tx + s / 2, ty + s / 2);
    const slot = this.ents.slotOf(h);
    this.ents.hp[slot] = t.hp;
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
    this.pathing.cancel(slot);
    this.ents.act[slot] = Act.idle;
    this.ents.destroy(h);
  }
}
