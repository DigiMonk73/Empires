import { CIV_BY_ID, TECH_BY_ID } from '../../data/index.ts';
import type { AttrPath, ClassValues, Effect, Job, PlayerFlag, Selector } from '../../data/types.ts';
import { ARMOR_CLASS, RESOURCES } from '../../data/types.ts';
import { VILLAGER_WORK } from '../../data/units.ts';
import { EKind } from '../core/entities.ts';
import { secondsToTicks, TICKS_PER_SECOND } from '../time.ts';
import { TYPES, type EntityType } from './registry.ts';

/**
 * Per-player compiled stats: base data with the civilization's bonuses and researched techs applied, converted
 * to per-tick units. Recompiled whenever an effect source changes (game start, tech complete, age up). Reads are
 * cheap array lookups by type index.
 */
export interface TypeStats {
  hp: number;
  /** Tiles per tick. */
  speed: number;
  los: number;
  range: number;
  minRange: number;
  /** Ticks between attacks. */
  reloadTicks: number;
  /** Attack / armor values per armor class id (sparse: undefined = none). */
  atk: (number | undefined)[];
  arm: (number | undefined)[];
  /** food, wood, gold, stone. */
  cost: [number, number, number, number];
  trainTicks: number;
  buildTicks: number;
  pop: number;
  radius: number;
  convResist: number;
  blastRadius: number;
  capacity: number;
  /** Boats: carry capacity and food per tick. */
  carry: number;
  gatherPerTick: number;
  popProvided: number;
}

export interface PlayerStats {
  types: TypeStats[];
  /** Villager work per tick by job, and carry capacity by job. */
  work: Record<Job, number>;
  carry: Record<Job, number>;
  farmFood: number;
  faithRegen: number;
  healRate: number;
  conversionRate: number;
  tributeFee: number;
  goldYield: number;
  flags: Set<PlayerFlag>;
  /** Units/buildings enabled by effects beyond the base tree (e.g. walls via techs). */
  enabled: Set<string>;
  /** Base unit id → current upgraded unit id. */
  upgrades: Map<string, string>;
  age: number;
}

const CLASS_IDS = Object.entries(ARMOR_CLASS) as [keyof typeof ARMOR_CLASS, number][];

function classArray(v: ClassValues): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  for (const [name, id] of CLASS_IDS) if (v[name] !== undefined) out[id] = v[name];
  return out;
}

function baseStats(t: EntityType): TypeStats {
  const u = t.unit;
  const b = t.building;
  const a = t.animal;
  const cost = (u?.cost ?? b?.cost ?? {}) as Partial<Record<(typeof RESOURCES)[number], number>>;
  return {
    hp: t.hp,
    speed: t.speed,
    los: t.los,
    range: u?.range ?? b?.range ?? a?.range ?? 0,
    minRange: u?.minRange ?? 0,
    reloadTicks: secondsToTicks(u?.reload ?? b?.reload ?? a?.reload ?? 1.5),
    atk: classArray(u?.atk ?? b?.atk ?? a?.atk ?? {}),
    arm: classArray(u?.arm ?? b?.arm ?? { melee: 0, pierce: 0 }),
    cost: [cost.food ?? 0, cost.wood ?? 0, cost.gold ?? 0, cost.stone ?? 0],
    trainTicks: secondsToTicks(u?.trainTime ?? 0),
    buildTicks: secondsToTicks(b?.buildTime ?? 0),
    pop: t.kind === EKind.unit && !a ? (u?.pop ?? 1) : 0,
    radius: t.radius,
    convResist: u?.convResist ?? 1,
    blastRadius: u?.blastRadius ?? 0,
    capacity: u?.capacity ?? 0,
    carry: u?.carry ?? 0,
    gatherPerTick: (u?.gatherRate ?? 0) / TICKS_PER_SECOND,
    popProvided: b?.popProvided ?? 0,
  };
}

/** Does selector `sel` pick entity type `t`? */
export function matches(sel: Selector, t: EntityType): boolean {
  if (t.unit) {
    if (sel.units?.includes(t.unit.id)) return true;
    if (sel.classes?.includes(t.unit.cls)) return true;
    if (sel.tags?.some((g) => t.unit!.tags.includes(g))) return true;
  }
  if (t.building) {
    if (sel.buildings?.includes(t.building.id)) return true;
    if (sel.buildingKinds?.includes(t.building.kind)) return true;
  }
  return false;
}

function applyNum(cur: number, mode: 'add' | 'mul' | 'set', v: number): number {
  return mode === 'add' ? cur + v : mode === 'mul' ? cur * v : v;
}

/** Apply one attribute change to a type's stats (natural units in the data are converted here). */
function applyAttr(s: TypeStats, attr: AttrPath, mode: 'add' | 'mul' | 'set', v: number): void {
  const [head, tail] = attr.split('.') as [string, string | undefined];
  switch (head) {
    case 'hp':
      s.hp = applyNum(s.hp, mode, v);
      return;
    case 'speed':
      s.speed = mode === 'mul' ? s.speed * v : applyNum(s.speed * TICKS_PER_SECOND, mode, v) / TICKS_PER_SECOND;
      return;
    case 'los':
      s.los = applyNum(s.los, mode, v);
      return;
    case 'range':
      s.range = applyNum(s.range, mode, v);
      return;
    case 'minRange':
      s.minRange = applyNum(s.minRange, mode, v);
      return;
    case 'reload':
      s.reloadTicks = mode === 'mul' ? Math.max(1, Math.round(s.reloadTicks * v)) : secondsToTicks(applyNum(s.reloadTicks / TICKS_PER_SECOND, mode, v));
      return;
    case 'trainTime':
      s.trainTicks = mode === 'mul' ? Math.round(s.trainTicks * v) : secondsToTicks(applyNum(s.trainTicks / TICKS_PER_SECOND, mode, v));
      return;
    case 'buildTime':
      s.buildTicks = mode === 'mul' ? Math.round(s.buildTicks * v) : secondsToTicks(applyNum(s.buildTicks / TICKS_PER_SECOND, mode, v));
      return;
    case 'pop':
      s.pop = applyNum(s.pop, mode, v);
      return;
    case 'convResist':
      s.convResist = applyNum(s.convResist, mode, v);
      return;
    case 'blastRadius':
      s.blastRadius = applyNum(s.blastRadius, mode, v);
      return;
    case 'capacity':
      s.capacity = applyNum(s.capacity, mode, v);
      return;
    case 'carry':
      s.carry = applyNum(s.carry, mode, v);
      return;
    case 'gatherRate':
      s.gatherPerTick = mode === 'mul' ? s.gatherPerTick * v : applyNum(s.gatherPerTick * TICKS_PER_SECOND, mode, v) / TICKS_PER_SECOND;
      return;
    case 'atk':
    case 'arm': {
      const id = ARMOR_CLASS[tail as keyof typeof ARMOR_CLASS];
      const arr = head === 'atk' ? s.atk : s.arm;
      arr[id] = applyNum(arr[id] ?? 0, mode, v);
      return;
    }
    case 'cost': {
      if (tail === 'all') for (let i = 0; i < 4; i++) s.cost[i] = applyNum(s.cost[i]!, mode, v);
      else {
        const i = RESOURCES.indexOf(tail as (typeof RESOURCES)[number]);
        s.cost[i] = applyNum(s.cost[i]!, mode, v);
      }
      return;
    }
    // work.* / carry.* are villager-level and handled by the caller.
  }
}

export function applyEffects(ps: PlayerStats, effects: readonly Effect[]): void {
  for (const e of effects) {
    switch (e.op) {
      case 'attr': {
        const [head, tail] = e.attr.split('.') as [string, string];
        if (head === 'work' || (head === 'carry' && tail)) {
          // Villager work rates (per second in data) and carry capacities.
          if (head === 'work') {
            const job = tail as Job;
            ps.work[job] = e.mode === 'mul' ? ps.work[job] * e.v : applyNum(ps.work[job] * TICKS_PER_SECOND, e.mode, e.v) / TICKS_PER_SECOND;
          } else {
            const job = tail as Job;
            ps.carry[job] = Math.max(1, applyNum(ps.carry[job], e.mode, e.v));
          }
          continue;
        }
        for (const t of TYPES) if (matches(e.sel, t)) applyAttr(ps.types[t.index]!, e.attr, e.mode, e.v);
        break;
      }
      case 'player':
        switch (e.attr) {
          case 'farmFood':
            ps.farmFood = applyNum(ps.farmFood, e.mode, e.v);
            break;
          case 'faithRegen':
            ps.faithRegen = applyNum(ps.faithRegen, e.mode, e.v);
            break;
          case 'healRate':
            ps.healRate = applyNum(ps.healRate, e.mode, e.v);
            break;
          case 'conversionRate':
            ps.conversionRate = applyNum(ps.conversionRate, e.mode, e.v);
            break;
          case 'tributeFee':
            ps.tributeFee = applyNum(ps.tributeFee, e.mode, e.v);
            break;
          case 'goldYield':
            ps.goldYield = applyNum(ps.goldYield, e.mode, e.v);
            break;
          default:
            break; // start.* is applied once at world creation; popCap etc. arrive later
        }
        break;
      case 'flag':
        ps.flags.add(e.flag);
        break;
      case 'enable':
        ps.enabled.add(`${e.kind}:${e.id}`);
        break;
      case 'upgrade': {
        // A line's base id → its current member (unit and building ids never collide).
        for (const [base, cur] of ps.upgrades) if (cur === e.from) ps.upgrades.set(base, e.to);
        if (![...ps.upgrades.values()].includes(e.to)) ps.upgrades.set(e.from, e.to);
        if (e.kind === 'building') ps.enabled.add(`building:${e.to}`);
        break;
      }
      case 'age':
        ps.age = Math.max(ps.age, e.age);
        break;
    }
  }
}

/** Compile a player's stats from civilization bonuses plus researched techs (in completion order). */
export function compilePlayerStats(civ: string, techs: readonly string[] = []): PlayerStats {
  const work = {} as Record<Job, number>;
  const carry = {} as Record<Job, number>;
  for (const [job, rate] of Object.entries(VILLAGER_WORK.rate) as [Job, number][]) {
    work[job] = rate / TICKS_PER_SECOND;
    carry[job] = VILLAGER_WORK.carry[job] ?? 0;
  }
  const ps: PlayerStats = {
    types: TYPES.map(baseStats),
    work,
    carry,
    farmFood: 250,
    faithRegen: 2,
    healRate: 3,
    conversionRate: 1,
    tributeFee: 0.25,
    goldYield: 1,
    flags: new Set(),
    enabled: new Set(),
    upgrades: new Map(),
    age: 1,
  };
  const c = CIV_BY_ID.get(civ);
  if (c) applyEffects(ps, c.bonuses);
  for (const id of techs) {
    const t = TECH_BY_ID.get(id);
    if (t) applyEffects(ps, t.effects);
  }
  // Costs are whole resources (e.g. Roman 30-wood house ×0.85 → 26).
  for (const s of ps.types) for (let i = 0; i < 4; i++) s.cost[i] = Math.round(s.cost[i]!);
  return ps;
}
