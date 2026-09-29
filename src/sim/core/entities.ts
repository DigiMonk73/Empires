import { GEN_LIMIT, handleGen, handleSlot, makeHandle, NO_ENTITY, SLOT_LIMIT } from './handles.ts';

/** What an entity slot holds. Resources (trees, mines, …) live in ResourceStore, not here. */
export const EKind = { none: 0, unit: 1, building: 2 } as const;

/** High-level activity, used by systems and to pick the render animation. */
export const Act = {
  idle: 0,
  move: 1,
  gather: 2,
  build: 3,
  attack: 4,
  dropoff: 5,
  dying: 6,
  convert: 7,
  heal: 8,
} as const;

/**
 * Structure-of-arrays storage for units and buildings. Hot fields live in typed arrays indexed by slot; the
 * store grows by doubling. Slots are recycled through a LIFO free list, and each reuse bumps the slot's
 * generation so stale handles fail `valid()`. Iteration is always in ascending slot order (deterministic).
 */
export class EntityStore {
  cap = 0;
  /** One past the highest slot ever used. */
  top = 0;
  count = 0;
  private free: number[] = [];

  alive = new Uint8Array(0);
  gen = new Uint16Array(0);
  kind = new Uint8Array(0);
  /** Index into the compiled type registry. */
  type = new Uint16Array(0);
  /** 0 = Gaia, 1..8 players. */
  owner = new Uint8Array(0);
  /** Position in tiles (center for units, footprint center for buildings). */
  x = new Float64Array(0);
  y = new Float64Array(0);
  /** Position at the start of the tick, for render interpolation. */
  px = new Float64Array(0);
  py = new Float64Array(0);
  /** Facing sector 0..15 (world space, see sim/math/trig). */
  facing = new Uint8Array(0);
  hp = new Float64Array(0);
  act = new Uint8Array(0);
  /** Tick the current activity/animation started. */
  actStart = new Int32Array(0);
  /** Handle of the current target entity, or NO_ENTITY. */
  target = new Float64Array(0);
  /** Generic countdown used by the current activity (reload, work, …) in ticks. */
  timer = new Int32Array(0);
  /** Buildings: construction progress 0..1 (1 = complete). */
  build = new Float64Array(0);
  /** Movement: consecutive blocked-progress ticks (stuck detection). */
  stuck = new Uint16Array(0);
  /** Movement: distance to the current waypoint at the end of the previous tick. */
  lastDist = new Float64Array(0);
  /** Villagers: what they carry — JOBS index + 1 (0 = nothing) — and how much. */
  carryJob = new Uint8Array(0);
  carryAmt = new Float64Array(0);
  /** Fog: tile and radius this entity's line of sight is currently stamped at (losR 0 = not stamped). */
  losTx = new Int16Array(0);
  losTy = new Int16Array(0);
  losR = new Uint8Array(0);

  constructor(initialCap = 256) {
    this.grow(initialCap);
  }

  private grow(newCap: number): void {
    const copy = <T extends { length: number; set(a: ArrayLike<number>): void }>(old: T, make: (n: number) => T): T => {
      const a = make(newCap);
      a.set(old as unknown as ArrayLike<number>);
      return a;
    };
    this.alive = copy(this.alive, (n) => new Uint8Array(n));
    this.gen = copy(this.gen, (n) => new Uint16Array(n));
    this.kind = copy(this.kind, (n) => new Uint8Array(n));
    this.type = copy(this.type, (n) => new Uint16Array(n));
    this.owner = copy(this.owner, (n) => new Uint8Array(n));
    this.x = copy(this.x, (n) => new Float64Array(n));
    this.y = copy(this.y, (n) => new Float64Array(n));
    this.px = copy(this.px, (n) => new Float64Array(n));
    this.py = copy(this.py, (n) => new Float64Array(n));
    this.facing = copy(this.facing, (n) => new Uint8Array(n));
    this.hp = copy(this.hp, (n) => new Float64Array(n));
    this.act = copy(this.act, (n) => new Uint8Array(n));
    this.actStart = copy(this.actStart, (n) => new Int32Array(n));
    this.target = copy(this.target, (n) => new Float64Array(n));
    this.timer = copy(this.timer, (n) => new Int32Array(n));
    this.build = copy(this.build, (n) => new Float64Array(n));
    this.stuck = copy(this.stuck, (n) => new Uint16Array(n));
    this.lastDist = copy(this.lastDist, (n) => new Float64Array(n));
    this.carryJob = copy(this.carryJob, (n) => new Uint8Array(n));
    this.carryAmt = copy(this.carryAmt, (n) => new Float64Array(n));
    this.losTx = copy(this.losTx, (n) => new Int16Array(n));
    this.losTy = copy(this.losTy, (n) => new Int16Array(n));
    this.losR = copy(this.losR, (n) => new Uint8Array(n));
    this.cap = newCap;
  }

  /** Allocate a slot and return its handle. */
  create(kind: number, type: number, owner: number, x: number, y: number): number {
    let slot: number;
    if (this.free.length) slot = this.free.pop()!;
    else {
      if (this.top === this.cap) {
        if (this.cap * 2 > SLOT_LIMIT) throw new Error('entity store full');
        this.grow(this.cap * 2);
      }
      slot = this.top++;
    }
    this.alive[slot] = 1;
    this.kind[slot] = kind;
    this.type[slot] = type;
    this.owner[slot] = owner;
    this.x[slot] = this.px[slot] = x;
    this.y[slot] = this.py[slot] = y;
    this.facing[slot] = 0;
    this.hp[slot] = 0;
    this.act[slot] = Act.idle;
    this.actStart[slot] = 0;
    this.target[slot] = NO_ENTITY;
    this.timer[slot] = 0;
    this.build[slot] = 1;
    this.stuck[slot] = 0;
    this.lastDist[slot] = 0;
    this.losR[slot] = 0;
    this.carryJob[slot] = 0;
    this.carryAmt[slot] = 0;
    this.count++;
    return makeHandle(slot, this.gen[slot]!);
  }

  /** Free a slot. Its generation is bumped so outstanding handles become stale. */
  destroy(h: number): void {
    const slot = this.slotOf(h);
    if (slot < 0) return;
    this.alive[slot] = 0;
    this.kind[slot] = EKind.none;
    this.gen[slot] = (this.gen[slot]! + 1) % GEN_LIMIT;
    this.free.push(slot);
    this.count--;
  }

  /** Slot for a live handle, or -1 if the handle is stale or invalid. */
  slotOf(h: number): number {
    if (h < 0) return -1;
    const slot = handleSlot(h);
    if (slot >= this.top || !this.alive[slot] || this.gen[slot] !== handleGen(h)) return -1;
    return slot;
  }

  valid(h: number): boolean {
    return this.slotOf(h) >= 0;
  }

  handleOf(slot: number): number {
    return makeHandle(slot, this.gen[slot]!);
  }

  /** Names of the per-slot typed arrays, in canonical order (save/load, hashing). */
  static readonly FIELDS = [
    'alive', 'gen', 'kind', 'type', 'owner', 'x', 'y', 'px', 'py', 'facing', 'hp', 'act', 'actStart', 'target',
    'timer', 'build', 'stuck', 'lastDist', 'losTx', 'losTy', 'losR', 'carryJob', 'carryAmt',
  ] as const;

  /** Replace all state from a snapshot's parts. */
  restore(cap: number, top: number, count: number, free: readonly number[], read: (field: string, into: { set(a: ArrayLike<number>): void }) => void): void {
    this.cap = 0;
    this.top = 0;
    for (const f of EntityStore.FIELDS) (this as unknown as Record<string, ArrayLike<number>>)[f] = new (this[f].constructor as new (n: number) => Uint8Array)(0);
    this.grow(Math.max(cap, 1));
    this.top = top;
    this.count = count;
    this.free = [...free];
    for (const f of EntityStore.FIELDS) read(f, this[f]);
  }

  /** Free-list contents, for save/load (order matters for determinism). */
  freeList(): readonly number[] {
    return this.free;
  }

  setFreeList(list: readonly number[]): void {
    this.free = [...list];
  }
}
