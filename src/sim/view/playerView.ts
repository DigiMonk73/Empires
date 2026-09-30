import { Act, EKind } from '../core/entities.ts';
import { ResState } from '../core/resources.ts';
import { RESOURCE_KINDS, TYPES, buildingTypeIndex } from '../rules/registry.ts';
import { buildingAvailable, canAfford, placementValid } from '../systems/build.ts';
import { JOBS } from '../systems/gather.ts';
import { researchBlocker, trainBlocker } from '../systems/production.ts';
import type { World } from '../world.ts';

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
  /** Gather/farm target: resource node index or building handle; build target handle. */
  target: number;
  /** Job of what it is carrying / working ('wood', 'forage', …) or null. */
  job: string | null;
  carry: number;
  act: number;
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
  /** Farm food left (farms). */
  stock: number;
  /** Farmer handle working it (farms), or -1. */
  farmer: number;
}

export interface SeenEntity {
  h: number;
  owner: number;
  type: string;
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

  /** Team of another player (diplomacy is fixed at game start). */
  teamOf(player: number): number {
    return this.w.players[player]?.team ?? 0;
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
      const target = !o ? -1 : o.k === 'gather' ? o.res : o.k === 'build' || o.k === 'farm' || o.k === 'attack' ? o.h : -1;
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
        stock: e.stock[s]!,
        farmer: fo?.k === 'farm' && fo.h === e.handleOf(s) ? e.handleOf(farmer) : -1,
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
      out.push({ h: e.handleOf(s), owner: e.owner[s]!, type: TYPES[e.type[s]!]!.id, building, x: e.x[s]!, y: e.y[s]!, hp: e.hp[s]! });
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
