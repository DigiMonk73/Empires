/**
 * Game-data schema. Values are in natural units: tiles, seconds, resource per second. `rules/compile.ts` (M1+)
 * converts them to per-tick tables. Every definition cites its research source in `src` (see
 * docs/research/*): `econ:<section>` → economy-ages-techs-civs.md, `mil:<section>` → military-combat-ui-ai-engine.md.
 * Values research could not confirm carry `verify: true` and are resolved by a DECISIONS entry.
 */

export type Res = 'food' | 'wood' | 'gold' | 'stone';
export const RESOURCES: readonly Res[] = ['food', 'wood', 'gold', 'stone'];
export type Cost = Partial<Record<Res, number>>;

/** 1 Stone, 2 Tool, 3 Bronze, 4 Iron. */
export type Age = 1 | 2 | 3 | 4;
export const AGE_NAMES = ['', 'Stone Age', 'Tool Age', 'Bronze Age', 'Iron Age'] as const;

export interface Sourced {
  /** Research citation, e.g. `econ:4` or `mil:1a`. */
  src: string;
  /** True when the value could not be confirmed from a reliable source. */
  verify?: boolean;
  /** The DECISIONS entry (e.g. 'D57') that settles an unconfirmed value (M14.7: required with `verify`). */
  decision?: string;
  note?: string;
}

/**
 * Genie-style armor classes. Damage = max(1, Σ over classes the target has armor in: max(0, atk − armor)).
 * Bonus damage works by giving targets negative armor in a class and the attacker 0 (or more) in it.
 */
export const ARMOR_CLASS = {
  fireGalley: 0, // Fire Galley −5; Ballista/Helepolis attack it
  archerWallTower: 1, // bowmen −2, mounted archers −2, walls/towers −7; Slinger attacks it
  pierce: 3,
  melee: 4,
  building: 6, // buildings −140, towers −50, Fire Galley −10; stone throwers, catapult ships, armored elephants
  priest: 7, // priests; chariots attack it
  cavalry: 8, // scout/cavalry/horse archers −8, chariots −4; Camel attacks it
  infantry: 9, // clubman + sword lines −5; cavalry line attacks it
  tower: 10, // walls −80, towers −40; elephants, villagers (−150, +150 with Siegecraft)
} as const;
export type ArmorClassName = keyof typeof ARMOR_CLASS;
export type ClassValues = Partial<Record<ArmorClassName, number>>;

/** Broad unit categories used by selectors, AI, and UI. */
export type UnitClass =
  | 'villager'
  | 'infantry'
  | 'slinger'
  | 'footArcher'
  | 'mountedArcher'
  | 'scout'
  | 'cavalry'
  | 'camel'
  | 'chariot'
  | 'elephant'
  | 'hoplite'
  | 'priest'
  | 'siege'
  | 'fishingShip'
  | 'tradeShip'
  | 'transport'
  | 'warship'
  | 'animal';

/** Villager work types; each has a gather/work rate and (for gathering) a carry capacity. */
export type Job = 'forage' | 'farm' | 'hunt' | 'fish' | 'wood' | 'gold' | 'stone' | 'build' | 'repair';

export interface ProjectileDef {
  /** Tiles per second. */
  speed: number;
  /** Hit chance 0..1 (1 unless stated). */
  accuracy?: number;
  /** Arcing (stones) vs flat (arrows). */
  arc?: boolean;
}

export interface UnitDef extends Sourced {
  id: string;
  name: string;
  cls: UnitClass;
  /** Extra selector tags, e.g. 'barracks', 'mounted', 'ship', 'warship', 'siegeShip'. */
  tags: readonly string[];
  /** Building that trains it (null = cannot be trained, e.g. animals). */
  trainedAt: string | null;
  age: Age;
  cost: Cost;
  /** Seconds at game speed 1.0. */
  trainTime: number;
  hp: number;
  /** Tiles per second. */
  speed: number;
  /** Line of sight in tiles. */
  los: number;
  atk: ClassValues;
  arm: ClassValues;
  /** Max attack range in tiles (0 = melee). */
  range: number;
  minRange?: number;
  /** Seconds between attacks. */
  reload: number;
  projectile?: ProjectileDef;
  /** Splash radius in tiles (siege) — damages everything inside, including own units. */
  blastRadius?: number;
  /** Trample: full damage to units adjacent to the target (elephants, scythe chariot). */
  trample?: number;
  /** Divides priest conversion chance (chariots 8, ships 2). */
  convResist?: number;
  /** Collision radius in tiles. */
  radius: number;
  /** Population slots used. */
  pop: number;
  /** Units a transport carries. */
  capacity?: number;
  /** Carry capacity for boats (fishing, trade). */
  carry?: number;
  /** Food/second for fishing boats. */
  gatherRate?: number;
  /** The unit this one replaces when its upgrade tech completes. */
  upgradeOf?: string;
  /** Techs that must be researched before this unit can be trained (tech ids). */
  requires?: readonly string[];
  /** Units that don't auto-attack enemies in sight (Scout). */
  noAutoAttack?: boolean;
  /** Expansion content (Rise of Rome). */
  ror?: boolean;
}

export interface VillagerWork {
  /** Resource (or work) units per second per job. */
  rate: Record<Job, number>;
  /** Carry capacity per gathering job. */
  carry: Partial<Record<Job, number>>;
}

/** `relic`: the map's Ruins and Artifacts (M14.1) — owned by whoever stands by them, never built or attacked. */
export type BuildingKind = 'normal' | 'wall' | 'tower' | 'farm' | 'wonder' | 'relic';

export interface BuildingDef extends Sourced {
  id: string;
  name: string;
  kind: BuildingKind;
  age: Age;
  cost: Cost;
  /** Seconds for one builder at rate 1.0. */
  buildTime: number;
  hp: number;
  los: number;
  /** Footprint in tiles (square). */
  size: number;
  arm: ClassValues;
  /** Population capacity provided. */
  popProvided?: number;
  /** Resources accepted for drop-off. */
  dropoff?: readonly (Res | 'meat' | 'fish')[];
  /** Units trained here, in command-grid order. */
  trains?: readonly string[];
  /** Buildings the player must already have (building ids). */
  requiresBuilding?: readonly string[];
  /** Techs that must be researched first (tech ids); walls and towers are enabled by techs instead. */
  requires?: readonly string[];
  /** Available at game start without an enabling tech (false for walls, towers and upgrades). */
  startsEnabled?: boolean;
  /** Tower attack stats (towers only). */
  atk?: ClassValues;
  range?: number;
  reload?: number;
  projectile?: ProjectileDef;
  /** Training/research speed multiplier by age (Dock). */
  workRateByAge?: Readonly<Record<Age, number>>;
  /** Built on the shoreline (Dock). */
  shore?: boolean;
  ror?: boolean;
}

/** Selects the unit/building definitions an effect applies to. Any matching criterion selects. */
export interface Selector {
  units?: readonly string[];
  classes?: readonly UnitClass[];
  tags?: readonly string[];
  buildings?: readonly string[];
  buildingKinds?: readonly BuildingKind[];
}

/**
 * Attribute paths an effect may change:
 * hp, speed, los, range, minRange, reload, trainTime, blastRadius, convResist, pop, capacity, carry,
 * gatherRate (boats), atk.<class>, arm.<class>, cost.<res>, cost.all (mul only), buildTime,
 * work.<job> (villager rate), carry.<job> (villager carry).
 */
export type AttrPath = string;

/** Units, buildings and techs have separate id namespaces; references say which one they mean. */
export type DefKind = 'unit' | 'building';

export type Effect =
  | { op: 'attr'; sel: Selector; attr: AttrPath; mode: 'add' | 'mul' | 'set'; v: number }
  | { op: 'player'; attr: PlayerAttr; mode: 'add' | 'mul' | 'set'; v: number }
  | { op: 'upgrade'; kind: DefKind; from: string; to: string }
  | { op: 'enable'; kind: DefKind; id: string }
  | { op: 'age'; age: Age }
  | { op: 'flag'; flag: PlayerFlag };

export type PlayerAttr =
  | 'farmFood'
  | 'faithRegen'
  | 'healRate'
  | 'conversionRate'
  | 'tributeFee'
  | 'goldYield'
  | 'popCap'
  | `start.${Res}`
  | 'buildRate';

export type PlayerFlag =
  | 'ballistics' // projectiles lead moving targets
  | 'monotheism' // priests convert priests and buildings
  | 'martyrdom' // sacrifice a priest for an instant conversion
  | 'writing' // shared exploration with allies
  | 'villagersAttackWalls' // Siegecraft
  | 'flamingProjectiles'; // Alchemy visuals

export interface TechDef extends Sourced {
  id: string;
  name: string;
  /** Building where it is researched. */
  at: string;
  age: Age;
  cost: Cost;
  researchTime: number;
  requires?: readonly string[];
  /** Age advance: any `count` of these buildings must exist. */
  requiresAnyBuildings?: { count: number; of: readonly string[] };
  effects: readonly Effect[];
  /** Short effect text for tooltips. */
  desc: string;
  ror?: boolean;
}

export interface Disabled {
  units: readonly string[];
  buildings: readonly string[];
  techs: readonly string[];
}

export type ArchSet = 'egyptian' | 'greek' | 'babylonian' | 'asian' | 'roman';

export interface CivDef extends Sourced {
  id: string;
  name: string;
  arch: ArchSet;
  /** Bonuses as effects applied at game start. */
  bonuses: readonly Effect[];
  bonusText: readonly string[];
  /** What this civilization cannot get, from the tech-tree matrix (econ:6.2). */
  disabled: Disabled;
  ror?: boolean;
}

export interface ResourceDef extends Sourced {
  id: string;
  name: string;
  res: Res;
  amount: number;
  /** Gathering job used on it. */
  job: Job;
  /** Food decay per second once an animal is killed. */
  decay?: number;
  /** Footprint in tiles. */
  size: number;
  /** Only boats can gather it. */
  boatsOnly?: boolean;
  /** Villagers can gather it (shore fish). */
  villagers?: boolean;
}

export interface AnimalDef extends Sourced {
  id: string;
  name: string;
  food: number;
  hp: number;
  speed: number;
  decay: number;
  behavior: 'flee' | 'fightBack' | 'aggressive';
  atk?: ClassValues;
  range?: number;
  reload?: number;
  habitat?: 'land' | 'shore';
}
