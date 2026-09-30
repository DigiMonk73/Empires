import { Act, EKind } from '../core/entities.ts';
import { ResState } from '../core/resources.ts';
import { RESOURCE_KINDS, TYPES, buildingTypeIndex } from '../rules/registry.ts';
import { buildingAvailable, canAfford, placementValid } from '../systems/build.ts';
import { JOBS } from '../systems/gather.ts';
import { researchBlocker, trainBlocker } from '../systems/production.ts';
import type { Countdown, VictoryMode, World } from '../world.ts';
import type { StartingAge } from '../../data/setup.ts';
import { stanceOf } from '../rules/diplomacy.ts';

/**
 * What one player may know (D10): everything about their own units and buildings, enemy units they can see,
 * enemy buildings they have explored, and resources on explored tiles. The AI reads the world only through this.
 */
export interface OwnUnit {
  h: number;
  type: string;
  cls: string;
  x: number;
  y: number;
  hp: number;
  /** No orders at all. */
  idle: boolean;
  /** Head order kind ('gather', 'build', 'farm', 'attack', 'move'…) or null. */
  order: string | null;
  /** Gather/farm target: resource node index or building handle; build, board or repair target handle. */
  target: number;
  /** Job of what it is carrying / working ('wood', 'forage', …) or null. */
  job: string | null;
  carry: number;
  act: number;
  /** Transports: units aboard. */
  aboard: number;
}

export interface OwnBuilding {
  h: number;
  type: string;
  kind: string;
  x: number;
  y: number;
  size: number;
  done: boolean;
  /** Items queued (units + research). */
  queue: number;
  /** The unit at the head of the queue waits for housing (the population is full). */
  housed: boolean;
  /** Farm food left (farms). */
  stock: number;
  /** Farmer handle working it (farms), or -1. */
  farmer: number;
  /** Hit points now (M14.6b: the AI notices a building under fire it can't see the attacker of). */
  hp: number;
}

export interface SeenEntity {
  h: number;
  owner: number;
  type: string;
  /** Unit class ('villager', 'infantry', …); '' for buildings, 'relic' for Ruins and Artifacts (M14.1). */
  cls: string;
  building: boolean;
  x: number;
  y: number;
  hp: number;
}

export interface KnownResource {
  i: number;
  kind: string;
  job: string;
  x: number;
  y: number;
  amount: number;
}

export class PlayerView {
  readonly w: World;
  readonly player: number;

  constructor(w: World, player: number) {
    this.w = w;
    this.player = player;
  }

  get tick(): number {
    return this.w.tick;
  }

  get mapW(): number {
    return this.w.map.w;
  }

  get mapH(): number {
    return this.w.map.h;
  }

  me() {
    const p = this.w.players[this.player]!;
    return { res: [...p.res], pop: p.pop, popCap: p.popCap, age: p.stats.age, techs: p.techs, team: p.team, defeated: p.defeated !== null, civ: p.civ };
  }

  /** The game's victory condition (econ:7): Standard games have relics and the Wonder/relic countdowns. */
  victory(): VictoryMode {
    return this.w.victory;
  }

  /** Bumped whenever passability changes — region labels (`region()`) are renumbered then (M14.6b). */
  passVersion(): number {
    return this.w.map.passVersion;
  }

  /** The game's population limit (setup option). */
  popLimit(): number {
    return this.w.popLimit;
  }

  /** The game's starting age (a setup option everyone sees in the lobby, M14.3). */
  startingAge(): StartingAge {
    return this.w.startingAge;
  }

  /** Standard-victory countdowns running (public: every player sees them at the upper right, M14.2). */
  countdowns(): Countdown[] {
    return this.w.countdowns.map((c) => ({ ...c }));
  }

  /** Setup team of another player (the lobby grouping; who fights whom is `stanceTo`, M12.3). */
  teamOf(player: number): number {
    return this.w.players[player]?.team ?? 0;
  }

  // ── Diplomacy (M13.8) ──
  /** Every player id but Gaia, ourselves included. */
  playerIds(): number[] {
    return this.w.players.filter((p) => p.id > 0).map((p) => p.id);
  }

  /** Is `player` a computer (by the game's setup)? */
  isComputer(player: number): boolean {
    return !!this.w.players[player]?.ai;
  }

  isDefeated(player: number): boolean {
    const d = this.w.players[player]?.defeated;
    return d !== null && d !== undefined;
  }

  /** Our stance toward `player` (0 Ally, 1 Neutral, 2 Enemy), and theirs toward us. */
  stanceTo(player: number): number {
    return stanceOf(this.w, this.player, player);
  }

  stanceFrom(player: number): number {
    return stanceOf(this.w, player, this.player);
  }

  /** Hits our units and buildings have taken from `player`'s, and the tribute `player` has sent us. */
  hitsBy(player: number): number {
    return this.w.players[this.player]!.tally.hitsBy[player] ?? 0;
  }

  tributeFrom(player: number): number {
    return this.w.players[this.player]!.tally.tributeFrom[player] ?? 0;
  }

  /** Is (tx, ty) explored by this player? */
  explored(tx: number, ty: number): boolean {
    return !!this.w.fog.explored[this.player]![ty * this.w.map.w + tx];
  }

  visible(tx: number, ty: number): boolean {
    return !!this.w.fog.vis[this.player]![ty * this.w.map.w + tx];
  }

  ownUnits(): OwnUnit[] {
    const e = this.w.ents;
    const out: OwnUnit[] = [];
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.kind[s] !== EKind.unit || e.owner[s] !== this.player) continue;
      const t = TYPES[e.type[s]!]!;
      const o = this.w.orders[s]?.[0];
      const target = !o ? -1 : o.k === 'gather' ? o.res : o.k === 'build' || o.k === 'farm' || o.k === 'attack' || o.k === 'board' || o.k === 'repair' ? o.h : -1;
      out.push({
        h: e.handleOf(s),
        type: t.id,
        cls: t.unit?.cls ?? '',
        x: e.x[s]!,
        y: e.y[s]!,
        hp: e.hp[s]!,
        idle: !this.w.orders[s] && e.act[s] === Act.idle,
        order: o?.k ?? null,
        target,
        job: JOBS[(e.carryJob[s] ?? 0) - 1] ?? null,
        carry: e.carryAmt[s]!,
        act: e.act[s]!,
        aboard: this.w.cargo[s]?.length ?? 0,
      });
    }
    return out;
  }

  ownBuildings(): OwnBuilding[] {
    const e = this.w.ents;
    const out: OwnBuilding[] = [];
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.kind[s] !== EKind.building || e.owner[s] !== this.player) continue;
      const t = TYPES[e.type[s]!]!;
      const farmer = e.slotOf(e.target[s]!);
      const fo = farmer >= 0 ? this.w.orders[farmer]?.[0] : undefined;
      out.push({
        h: e.handleOf(s),
        type: t.id,
        kind: t.building!.kind,
        x: e.x[s]!,
        y: e.y[s]!,
        size: t.size,
        done: e.build[s]! >= 1,
        queue: this.w.prod[s]?.items.length ?? 0,
        housed: this.w.prod[s]?.housed ?? false,
        stock: e.stock[s]!,
        farmer: fo?.k === 'farm' && fo.h === e.handleOf(s) ? e.handleOf(farmer) : -1,
        hp: e.hp[s]!,
      });
    }
    return out;
  }

  /** Other players' units in sight and buildings explored (Gaia animals included, owner 0). */
  others(): SeenEntity[] {
    const e = this.w.ents;
    const out: SeenEntity[] = [];
    const W = this.w.map.w;
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.owner[s] === this.player) continue;
      const i = Math.floor(e.y[s]!) * W + Math.floor(e.x[s]!);
      const building = e.kind[s] === EKind.building;
      if (building ? !this.w.fog.explored[this.player]![i] : !this.w.fog.vis[this.player]![i]) continue;
      const t = TYPES[e.type[s]!]!;
      out.push({ h: e.handleOf(s), owner: e.owner[s]!, type: t.id, cls: t.unit?.cls ?? (t.building?.kind === 'relic' ? 'relic' : ''), building, x: e.x[s]!, y: e.y[s]!, hp: e.hp[s]! });
    }
    return out;
  }

  /** Standing resource nodes on explored tiles (optionally one job). */
  resources(job?: string): KnownResource[] {
    const r = this.w.res;
    const out: KnownResource[] = [];
    for (let i = 0; i < r.count; i++) {
      if (r.state[i] !== ResState.standing || r.amount[i]! <= 0) continue;
      const def = RESOURCE_KINDS[r.kind[i]!]!;
      if (def.boatsOnly || (job && def.job !== job)) continue;
      if (!this.explored(r.tx[i]!, r.ty[i]!)) continue;
      out.push({ i, kind: def.id, job: def.job, x: r.tx[i]! + def.size / 2, y: r.ty[i]! + def.size / 2, amount: r.amount[i]! });
    }
    return out;
  }

  /** Fish on explored tiles — shore fish and the boats-only deep fish and whales (the naval AI, M8.8). */
  fish(): KnownResource[] {
    const r = this.w.res;
    const out: KnownResource[] = [];
    for (let i = 0; i < r.count; i++) {
      if (r.state[i] !== ResState.standing || r.amount[i]! <= 0) continue;
      const def = RESOURCE_KINDS[r.kind[i]!]!;
      if (def.job !== 'fish' || !this.explored(r.tx[i]!, r.ty[i]!)) continue;
      out.push({ i, kind: def.id, job: def.job, x: r.tx[i]! + def.size / 2, y: r.ty[i]! + def.size / 2, amount: r.amount[i]! });
    }
    return out;
  }

  /** Region label of tile (tx, ty) for land (1) or water (2) movement; 0 = impassable for that class. */
  region(moveClass: number, tx: number, ty: number): number {
    if (!this.w.map.inBounds(tx, ty)) return 0;
    return this.w.pathing.regions.labels(moveClass)[this.w.map.idx(tx, ty)] ?? 0;
  }

  /** Can a boat in water region `sea` sail up beside the footprint [x0, x1) × [y0, y1)? */
  seaReachable(sea: number, x0: number, y0: number, x1: number, y1: number): boolean {
    if (!sea) return false;
    for (let y = Math.floor(y0) - 1; y <= Math.ceil(y1); y++) for (let x = Math.floor(x0) - 1; x <= Math.ceil(x1); x++) if (this.region(2, x, y) === sea) return true;
    return false;
  }

  /** Tiles in land region `label`, and in all land (a full scan: callers ask once and remember). */
  landSize(label: number): { region: number; all: number } {
    let region = 0;
    let all = 0;
    for (const l of this.w.pathing.regions.labels(1)) {
      if (!l) continue;
      all++;
      if (l === label) region++;
    }
    return { region, all };
  }

  /**
   * Can a land unit standing at (fx, fy) reach the node / footprint covering [x0, x1) × [y0, y1)? (Some tile
   * around it is in the same land region — anyone can see a carcass lying across water is out of reach.)
   */
  reachable(fx: number, fy: number, x0: number, y0: number, x1: number, y1: number): boolean {
    const labels = this.w.pathing.regions.labels(1);
    const W = this.w.map.w;
    const H = this.w.map.h;
    const from = labels[Math.floor(fy) * W + Math.floor(fx)] ?? 0;
    if (!from) return true; // standing somewhere odd: don't filter
    for (let y = Math.floor(y0) - 1; y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0) - 1; x <= Math.ceil(x1); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (labels[y * W + x] === from) return true;
      }
    }
    return false;
  }

  /** Cost [food, wood, gold, stone] of a unit or building type for this player. */
  cost(typeId: string): readonly number[] {
    const ti = TYPES.findIndex((t) => t.id === typeId);
    return this.w.stats(this.player, ti).cost;
  }

  canAfford(cost: readonly number[]): boolean {
    return canAfford(this.w, this.player, cost);
  }

  canBuild(typeId: string): boolean {
    return buildingAvailable(this.w, this.player, buildingTypeIndex(typeId)).ok;
  }

  private hillyCache: boolean | null = null;
  /** Does the map have hills (M10.2)? Their slopes can leave no flat footprint where a building is wanted. */
  get hilly(): boolean {
    if (this.hillyCache === null) this.hillyCache = this.w.map.height.some((h) => h !== 0);
    return this.hillyCache;
  }

  canPlace(typeId: string, tx: number, ty: number): boolean {
    return placementValid(this.w, buildingTypeIndex(typeId), tx, ty);
  }

  /** Is the tile clear ground (walkable, no building/resource)? For keeping gaps around new buildings. */
  clear(tx: number, ty: number): boolean {
    const m = this.w.map;
    if (!m.inBounds(tx, ty)) return false;
    const i = m.idx(tx, ty);
    return !m.bldAt[i] && !m.resAt[i] && m.passable(tx, ty, 1);
  }

  trainBlocker(bld: number, unit: string): string | null {
    const b = this.w.ents.slotOf(bld);
    return b < 0 ? 'gone' : trainBlocker(this.w, this.player, b, unit);
  }

  researchBlocker(bld: number, tech: string): string | null {
    const b = this.w.ents.slotOf(bld);
    return b < 0 ? 'gone' : researchBlocker(this.w, this.player, b, tech);
  }

  /** Is anything of ours currently researching or queued with `tech`? */
  researching(tech: string): boolean {
    const e = this.w.ents;
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === this.player && this.w.prod[s]?.items.includes(tech)) return true;
    return false;
  }
}
