import type { ClassValues, UnitDef, VillagerWork } from './types.ts';

/**
 * Units — Rise of Rome 1.0a values. Sources: docs/research/military-combat-ui-ai-engine.md §1 (mil:1a land,
 * mil:1b naval) cross-checked with docs/research/economy-ages-techs-civs.md (econ). Speeds are tiles/s, times
 * are game-seconds, ranges/LOS are tiles. Collision radii are not in the research (verify).
 */

/** Everything that can be hit by melee and missiles has base armor entries in both classes. */
const BASE_ARM: ClassValues = { melee: 0, pierce: 0 };
const INFANTRY_ARM: ClassValues = { ...BASE_ARM, infantry: -5 };
const ARCHER_ARM: ClassValues = { ...BASE_ARM, archerWallTower: -2 };
const CAVALRY_ARM: ClassValues = { ...BASE_ARM, cavalry: -8 };
const CHARIOT_ARM: ClassValues = { ...BASE_ARM, cavalry: -4 };

const ARROW = { speed: 8 } as const;
const STONE = { speed: 2.7, arc: true } as const;
const BOLT = { speed: 4.5 } as const;

type U = Omit<UnitDef, 'pop' | 'radius' | 'tags' | 'arm'> & Partial<Pick<UnitDef, 'pop' | 'radius' | 'tags' | 'arm'>>;
const u = (d: U): UnitDef => ({ pop: 1, radius: 0.2, tags: [], arm: BASE_ARM, ...d });

export const UNITS: readonly UnitDef[] = [
  // ── Town Center ─────────────────────────────────────────────────────────────
  u({
    id: 'villager', name: 'Villager', cls: 'villager', tags: ['civilian'], trainedAt: 'townCenter', age: 1,
    cost: { food: 50 }, trainTime: 20, hp: 25, speed: 1.1, los: 4,
    // Villagers can't damage walls/towers until Siegecraft (class-10 attack −150; Siegecraft +150).
    atk: { melee: 3, tower: -150 }, range: 0, reload: 1.5, src: 'mil:1a,econ:1.2',
  }),

  // ── Barracks ────────────────────────────────────────────────────────────────
  u({
    id: 'clubman', name: 'Clubman', cls: 'infantry', tags: ['barracks'], trainedAt: 'barracks', age: 1,
    cost: { food: 50 }, trainTime: 26, hp: 40, speed: 1.2, los: 4, atk: { melee: 3 }, arm: INFANTRY_ARM,
    range: 0, reload: 1.5, src: 'mil:1a', note: 'Mac manual lists train time 27',
  }),
  u({
    id: 'axeman', name: 'Axeman', cls: 'infantry', tags: ['barracks'], trainedAt: 'barracks', age: 2,
    cost: { food: 50 }, trainTime: 26, hp: 50, speed: 1.2, los: 4, atk: { melee: 5 }, arm: INFANTRY_ARM,
    range: 0, reload: 1.5, upgradeOf: 'clubman', src: 'mil:1a',
  }),
  u({
    id: 'shortSwordsman', name: 'Short Swordsman', cls: 'infantry', tags: ['barracks', 'swordsman'], trainedAt: 'barracks',
    age: 3, cost: { food: 35, gold: 15 }, trainTime: 26, hp: 60, speed: 1.2, los: 4, atk: { melee: 7 },
    arm: { ...INFANTRY_ARM, melee: 1 }, range: 0, reload: 1.5, requires: ['shortSword'], src: 'mil:1a,econ:5',
  }),
  u({
    id: 'broadSwordsman', name: 'Broad Swordsman', cls: 'infantry', tags: ['barracks', 'swordsman'], trainedAt: 'barracks',
    age: 3, cost: { food: 35, gold: 15 }, trainTime: 26, hp: 70, speed: 1.2, los: 4, atk: { melee: 9 },
    arm: { ...INFANTRY_ARM, melee: 1 }, range: 0, reload: 1.5, upgradeOf: 'shortSwordsman', src: 'mil:1a',
  }),
  u({
    id: 'longSwordsman', name: 'Long Swordsman', cls: 'infantry', tags: ['barracks', 'swordsman'], trainedAt: 'barracks',
    age: 4, cost: { food: 35, gold: 15 }, trainTime: 26, hp: 80, speed: 1.2, los: 4, atk: { melee: 11 },
    arm: { ...INFANTRY_ARM, melee: 2 }, range: 0, reload: 1.5, upgradeOf: 'broadSwordsman', src: 'mil:1a',
  }),
  u({
    id: 'legion', name: 'Legion', cls: 'infantry', tags: ['barracks', 'swordsman'], trainedAt: 'barracks', age: 4,
    cost: { food: 35, gold: 15 }, trainTime: 26, hp: 160, speed: 1.2, los: 4, atk: { melee: 13 },
    arm: { ...INFANTRY_ARM, melee: 2 }, range: 0, reload: 1.5, upgradeOf: 'longSwordsman', src: 'mil:1a',
  }),
  u({
    id: 'slinger', name: 'Slinger', cls: 'slinger', tags: ['barracks', 'missile'], trainedAt: 'barracks', age: 2,
    cost: { food: 40, stone: 10 }, trainTime: 24, hp: 25, speed: 1.2, los: 5,
    atk: { pierce: 2, archerWallTower: 0 }, arm: { melee: 0, pierce: 2 }, range: 4, reload: 1.5,
    projectile: { speed: 7 }, ror: true, src: 'mil:1a', verify: true, note: 'projectile speed unverified',
  }),

  // ── Archery Range ───────────────────────────────────────────────────────────
  u({
    id: 'bowman', name: 'Bowman', cls: 'footArcher', tags: ['archery', 'missile'], trainedAt: 'archeryRange', age: 2,
    cost: { food: 40, wood: 20 }, trainTime: 30, hp: 35, speed: 1.2, los: 7, atk: { pierce: 3 }, arm: ARCHER_ARM,
    range: 5, reload: 1.4, projectile: ARROW, src: 'mil:1a',
  }),
  u({
    id: 'improvedBowman', name: 'Improved Bowman', cls: 'footArcher', tags: ['archery', 'missile'], trainedAt: 'archeryRange',
    age: 3, cost: { food: 40, gold: 20 }, trainTime: 30, hp: 40, speed: 1.2, los: 8, atk: { pierce: 4 }, arm: ARCHER_ARM,
    range: 6, reload: 1.4, projectile: ARROW, requires: ['improvedBow'], src: 'mil:1a,econ:5',
    note: 'A separate unit enabled by Improved Bow; existing Bowmen are not converted',
  }),
  u({
    id: 'compositeBowman', name: 'Composite Bowman', cls: 'footArcher', tags: ['archery', 'missile'], trainedAt: 'archeryRange',
    age: 3, cost: { food: 40, gold: 20 }, trainTime: 30, hp: 45, speed: 1.2, los: 9, atk: { pierce: 5 }, arm: ARCHER_ARM,
    range: 7, reload: 1.4, projectile: ARROW, upgradeOf: 'improvedBowman', src: 'mil:1a',
  }),
  u({
    id: 'chariotArcher', name: 'Chariot Archer', cls: 'mountedArcher', tags: ['archery', 'missile', 'chariot', 'mounted'],
    trainedAt: 'archeryRange', age: 3, cost: { food: 40, wood: 70 }, trainTime: 40, hp: 70, speed: 2.0, los: 9,
    atk: { pierce: 4, priest: 7 }, arm: { ...CHARIOT_ARM, archerWallTower: -2 }, range: 7, reload: 1.5,
    projectile: ARROW, convResist: 8, radius: 0.4, requires: ['wheel'], src: 'mil:1a,mil:3',
  }),
  u({
    id: 'horseArcher', name: 'Horse Archer', cls: 'mountedArcher', tags: ['archery', 'missile', 'mounted'],
    trainedAt: 'archeryRange', age: 4, cost: { food: 50, gold: 70 }, trainTime: 40, hp: 60, speed: 2.2, los: 9,
    atk: { pierce: 7 }, arm: { melee: 0, pierce: 2, cavalry: -8, archerWallTower: -2 }, range: 7, reload: 1.5,
    projectile: ARROW, radius: 0.35, src: 'mil:1a',
  }),
  u({
    id: 'heavyHorseArcher', name: 'Heavy Horse Archer', cls: 'mountedArcher', tags: ['archery', 'missile', 'mounted'],
    trainedAt: 'archeryRange', age: 4, cost: { food: 50, gold: 70 }, trainTime: 40, hp: 90, speed: 2.5, los: 9,
    atk: { pierce: 8 }, arm: { melee: 0, pierce: 2, cavalry: -8, archerWallTower: -2 }, range: 7, reload: 1.5,
    projectile: ARROW, radius: 0.35, upgradeOf: 'horseArcher', src: 'mil:1a',
  }),
  u({
    id: 'elephantArcher', name: 'Elephant Archer', cls: 'mountedArcher', tags: ['archery', 'missile', 'mounted', 'elephantBody'],
    trainedAt: 'archeryRange', age: 4, cost: { food: 180, gold: 60 }, trainTime: 50, hp: 600, speed: 0.9, los: 8,
    atk: { pierce: 5 }, arm: ARCHER_ARM, range: 7, reload: 1.5, projectile: ARROW, radius: 0.55, src: 'mil:1a',
    verify: true, note: 'attack 5 (manual) vs 6 (fandom); LOS 8 vs 9',
  }),

  // ── Stable ──────────────────────────────────────────────────────────────────
  u({
    id: 'scout', name: 'Scout', cls: 'scout', tags: ['stable', 'mounted'], trainedAt: 'stable', age: 2,
    cost: { food: 100 }, trainTime: 30, hp: 60, speed: 2.0, los: 8, atk: { melee: 3 }, arm: CAVALRY_ARM, range: 0,
    reload: 1.5, radius: 0.35, noAutoAttack: true, src: 'mil:1a,econ:3', note: '+2 LOS per Age advance',
  }),
  u({
    id: 'chariot', name: 'Chariot', cls: 'chariot', tags: ['stable', 'mounted'], trainedAt: 'stable', age: 3,
    cost: { food: 40, wood: 60 }, trainTime: 40, hp: 100, speed: 2.0, los: 4, atk: { melee: 7, priest: 7 },
    arm: CHARIOT_ARM, range: 0, reload: 1.5, convResist: 8, radius: 0.4, requires: ['wheel'], src: 'mil:1a,mil:3',
  }),
  u({
    id: 'scytheChariot', name: 'Scythe Chariot', cls: 'chariot', tags: ['stable', 'mounted'], trainedAt: 'stable', age: 4,
    cost: { food: 40, wood: 60 }, trainTime: 40, hp: 120, speed: 2.0, los: 4, atk: { melee: 9, priest: 7 },
    arm: { ...CHARIOT_ARM, melee: 2 }, range: 0, reload: 1.5, convResist: 8, trample: 1, radius: 0.4,
    upgradeOf: 'chariot', ror: true, src: 'mil:1a', verify: true, note: 'trample radius unverified',
  }),
  u({
    id: 'cavalry', name: 'Cavalry', cls: 'cavalry', tags: ['stable', 'mounted'], trainedAt: 'stable', age: 3,
    cost: { food: 70, gold: 80 }, trainTime: 40, hp: 150, speed: 2.0, los: 4, atk: { melee: 8, infantry: 0 },
    arm: CAVALRY_ARM, range: 0, reload: 1.5, radius: 0.35, src: 'mil:1a',
  }),
  u({
    id: 'heavyCavalry', name: 'Heavy Cavalry', cls: 'cavalry', tags: ['stable', 'mounted'], trainedAt: 'stable', age: 4,
    cost: { food: 70, gold: 80 }, trainTime: 40, hp: 150, speed: 2.0, los: 4, atk: { melee: 10, infantry: 0 },
    arm: { ...CAVALRY_ARM, melee: 1, pierce: 1 }, range: 0, reload: 1.5, radius: 0.35, upgradeOf: 'cavalry', src: 'mil:1a',
  }),
  u({
    id: 'cataphract', name: 'Cataphract', cls: 'cavalry', tags: ['stable', 'mounted'], trainedAt: 'stable', age: 4,
    cost: { food: 70, gold: 80 }, trainTime: 40, hp: 180, speed: 2.0, los: 4, atk: { melee: 12, infantry: 0 },
    arm: { ...CAVALRY_ARM, melee: 3, pierce: 1 }, range: 0, reload: 1.5, radius: 0.35, upgradeOf: 'heavyCavalry',
    src: 'mil:1a',
  }),
  u({
    id: 'camel', name: 'Camel Rider', cls: 'camel', tags: ['stable', 'mounted'], trainedAt: 'stable', age: 3,
    cost: { food: 70, gold: 60 }, trainTime: 30, hp: 125, speed: 2.0, los: 4, atk: { melee: 6, cavalry: 0 },
    range: 0, reload: 1.5, radius: 0.35, ror: true, src: 'mil:1a',
    note: '+8 vs cavalry/horse archers, +4 vs chariots via their negative cavalry armor',
  }),
  u({
    id: 'warElephant', name: 'War Elephant', cls: 'elephant', tags: ['stable', 'mounted', 'elephantBody'], trainedAt: 'stable',
    age: 4, cost: { food: 170, gold: 40 }, trainTime: 50, hp: 600, speed: 0.9, los: 5, atk: { melee: 15, tower: -55 },
    range: 0, reload: 1.5, trample: 1, radius: 0.55, src: 'mil:1a,mil:2', verify: true,
    note: 'class-10 −55 reproduces "+25 vs walls only" (walls −80, towers −40); trample radius unverified',
  }),
  u({
    id: 'armoredElephant', name: 'Armored Elephant', cls: 'elephant', tags: ['stable', 'mounted', 'elephantBody'],
    trainedAt: 'stable', age: 4, cost: { food: 170, gold: 40 }, trainTime: 50, hp: 600, speed: 0.9, los: 5,
    atk: { melee: 18, building: -100, tower: -40 }, arm: { melee: 2, pierce: 1 }, range: 0, reload: 1.5, trample: 1,
    radius: 0.55, upgradeOf: 'warElephant', ror: true, src: 'mil:1a,econ:4', verify: true,
    note: 'class-6 −100 → +40 vs buildings (econ:4); tower class value inferred',
  }),

  // ── Academy ─────────────────────────────────────────────────────────────────
  u({
    id: 'hoplite', name: 'Hoplite', cls: 'hoplite', tags: ['academy'], trainedAt: 'academy', age: 3,
    cost: { food: 60, gold: 40 }, trainTime: 36, hp: 120, speed: 0.9, los: 4, atk: { melee: 17 },
    arm: { melee: 5, pierce: 0 }, range: 0, reload: 1.5, src: 'mil:1a',
  }),
  u({
    id: 'phalanx', name: 'Phalanx', cls: 'hoplite', tags: ['academy'], trainedAt: 'academy', age: 4,
    cost: { food: 60, gold: 40 }, trainTime: 36, hp: 120, speed: 0.9, los: 4, atk: { melee: 20 },
    arm: { melee: 7, pierce: 0 }, range: 0, reload: 1.5, upgradeOf: 'hoplite', src: 'mil:1a',
  }),
  u({
    id: 'centurion', name: 'Centurion', cls: 'hoplite', tags: ['academy'], trainedAt: 'academy', age: 4,
    cost: { food: 60, gold: 40 }, trainTime: 36, hp: 160, speed: 0.9, los: 4, atk: { melee: 30 },
    arm: { melee: 8, pierce: 0 }, range: 0, reload: 1.5, upgradeOf: 'phalanx', src: 'mil:1a',
  }),

  // ── Temple ──────────────────────────────────────────────────────────────────
  u({
    id: 'priest', name: 'Priest', cls: 'priest', tags: ['temple', 'civilian'], trainedAt: 'temple', age: 3,
    cost: { gold: 125 }, trainTime: 50, hp: 25, speed: 0.8, los: 12, atk: {}, arm: { ...BASE_ARM, priest: 0 },
    range: 10, reload: 0, src: 'mil:1a,mil:3', verify: true, note: 'LOS 12 (fandom) vs 15 (Mac manual); range = conversion range',
  }),

  // ── Siege Workshop ──────────────────────────────────────────────────────────
  u({
    id: 'stoneThrower', name: 'Stone Thrower', cls: 'siege', tags: ['siegeWorkshop', 'catapultLine'], trainedAt: 'siegeWorkshop',
    age: 3, cost: { wood: 180, gold: 80 }, trainTime: 60, hp: 75, speed: 0.8, los: 13, atk: { melee: 50, building: 0 },
    range: 10, minRange: 2, reload: 5, projectile: STONE, blastRadius: 0.5, radius: 0.5, src: 'mil:1a,mil:2',
  }),
  u({
    id: 'catapult', name: 'Catapult', cls: 'siege', tags: ['siegeWorkshop', 'catapultLine'], trainedAt: 'siegeWorkshop',
    age: 4, cost: { wood: 180, gold: 80 }, trainTime: 60, hp: 75, speed: 0.8, los: 15, atk: { melee: 60, building: 0 },
    range: 12, minRange: 2, reload: 5, projectile: STONE, blastRadius: 1.5, radius: 0.5, upgradeOf: 'stoneThrower',
    src: 'mil:1a,mil:2',
  }),
  u({
    id: 'heavyCatapult', name: 'Heavy Catapult', cls: 'siege', tags: ['siegeWorkshop', 'catapultLine', 'fellsTrees'],
    trainedAt: 'siegeWorkshop', age: 4, cost: { wood: 180, gold: 80 }, trainTime: 60, hp: 150, speed: 0.8, los: 16,
    atk: { melee: 60, building: 0 }, range: 13, minRange: 2, reload: 5, projectile: STONE, blastRadius: 1.5, radius: 0.5,
    upgradeOf: 'catapult', src: 'mil:1a,mil:2',
  }),
  u({
    id: 'ballista', name: 'Ballista', cls: 'siege', tags: ['siegeWorkshop', 'ballistaLine', 'missile'], trainedAt: 'siegeWorkshop',
    age: 4, cost: { wood: 100, gold: 80 }, trainTime: 50, hp: 55, speed: 0.8, los: 11, atk: { pierce: 40, fireGalley: 0 },
    range: 9, minRange: 3, reload: 3, projectile: BOLT, radius: 0.4, src: 'mil:1a',
  }),
  u({
    id: 'helepolis', name: 'Helepolis', cls: 'siege', tags: ['siegeWorkshop', 'ballistaLine', 'missile'], trainedAt: 'siegeWorkshop',
    age: 4, cost: { wood: 100, gold: 80 }, trainTime: 50, hp: 55, speed: 0.8, los: 12, atk: { pierce: 40, fireGalley: 0 },
    range: 10, minRange: 3, reload: 1.5, projectile: BOLT, radius: 0.4, upgradeOf: 'ballista', src: 'mil:1a',
  }),

  // ── Dock (train times are base; the Dock works ×1.5 in Stone/Tool, ×2 in Bronze/Iron — econ:1.3) ────────
  u({
    id: 'fishingBoat', name: 'Fishing Boat', cls: 'fishingShip', tags: ['ship', 'civilian'], trainedAt: 'dock', age: 1,
    cost: { wood: 50 }, trainTime: 40, hp: 45, speed: 1.4, los: 6, atk: {}, range: 0, reload: 0, convResist: 2,
    carry: 15, gatherRate: 0.4, radius: 0.5, src: 'mil:1b,econ:1.3',
  }),
  u({
    id: 'fishingShip', name: 'Fishing Ship', cls: 'fishingShip', tags: ['ship', 'civilian'], trainedAt: 'dock', age: 3,
    cost: { wood: 50 }, trainTime: 40, hp: 75, speed: 2.0, los: 6, atk: {}, range: 0, reload: 0, convResist: 2,
    carry: 20, gatherRate: 0.4, radius: 0.5, upgradeOf: 'fishingBoat', src: 'mil:1b,econ:1.3',
  }),
  u({
    id: 'tradeBoat', name: 'Trade Boat', cls: 'tradeShip', tags: ['ship', 'civilian'], trainedAt: 'dock', age: 1,
    cost: { wood: 100 }, trainTime: 50, hp: 200, speed: 2.0, los: 4, atk: {}, range: 0, reload: 0, convResist: 2,
    carry: 20, radius: 0.6, src: 'mil:1b,econ:1.3',
  }),
  u({
    id: 'merchantShip', name: 'Merchant Ship', cls: 'tradeShip', tags: ['ship', 'civilian'], trainedAt: 'dock', age: 3,
    cost: { wood: 100 }, trainTime: 50, hp: 250, speed: 2.5, los: 4, atk: {}, range: 0, reload: 0, convResist: 2,
    carry: 20, radius: 0.6, upgradeOf: 'tradeBoat', src: 'mil:1b,econ:1.3',
  }),
  u({
    id: 'lightTransport', name: 'Light Transport', cls: 'transport', tags: ['ship'], trainedAt: 'dock', age: 2,
    cost: { wood: 150 }, trainTime: 75, hp: 150, speed: 1.4, los: 4, atk: {}, range: 0, reload: 0, convResist: 2,
    capacity: 5, radius: 0.6, src: 'mil:1b',
  }),
  u({
    id: 'heavyTransport', name: 'Heavy Transport', cls: 'transport', tags: ['ship'], trainedAt: 'dock', age: 4,
    cost: { wood: 150 }, trainTime: 75, hp: 200, speed: 1.75, los: 5, atk: {}, range: 0, reload: 0, convResist: 2,
    capacity: 10, radius: 0.6, upgradeOf: 'lightTransport', src: 'mil:1b',
  }),
  u({
    id: 'scoutShip', name: 'Scout Ship', cls: 'warship', tags: ['ship', 'warship', 'galleyLine', 'missile'], trainedAt: 'dock',
    age: 2, cost: { wood: 135 }, trainTime: 60, hp: 120, speed: 1.75, los: 7, atk: { pierce: 5 }, range: 5, reload: 1.5,
    projectile: ARROW, convResist: 2, radius: 0.6, src: 'mil:1b',
  }),
  u({
    id: 'warGalley', name: 'War Galley', cls: 'warship', tags: ['ship', 'warship', 'galleyLine', 'missile'], trainedAt: 'dock',
    age: 3, cost: { wood: 135 }, trainTime: 60, hp: 160, speed: 1.75, los: 9, atk: { pierce: 8 }, range: 6, reload: 1.7,
    projectile: ARROW, convResist: 2, radius: 0.6, upgradeOf: 'scoutShip', src: 'mil:1b',
  }),
  u({
    id: 'trireme', name: 'Trireme', cls: 'warship', tags: ['ship', 'warship', 'galleyLine', 'missile'], trainedAt: 'dock',
    age: 4, cost: { wood: 135 }, trainTime: 60, hp: 200, speed: 1.75, los: 10, atk: { pierce: 12 }, range: 7, reload: 1.8,
    projectile: ARROW, convResist: 2, radius: 0.6, upgradeOf: 'warGalley', src: 'mil:1b', note: 'manual lists reload 2',
  }),
  u({
    id: 'catapultTrireme', name: 'Catapult Trireme', cls: 'warship', tags: ['ship', 'warship', 'siegeShip'], trainedAt: 'dock',
    age: 4, cost: { wood: 135, gold: 75 }, trainTime: 90, hp: 120, speed: 1.35, los: 12, atk: { melee: 35, building: 0 },
    range: 9, reload: 5, projectile: STONE, blastRadius: 1, convResist: 2, radius: 0.7, requires: ['catapultTrireme'],
    src: 'mil:1b,econ:4', verify: true, note: '"ignores armor" / class-6 attack 35 (econ:4) not modelled exactly',
  }),
  u({
    id: 'juggernaught', name: 'Juggernaught', cls: 'warship', tags: ['ship', 'warship', 'siegeShip', 'fellsTrees'],
    trainedAt: 'dock', age: 4, cost: { wood: 135, gold: 75 }, trainTime: 90, hp: 200, speed: 1.35, los: 13,
    atk: { melee: 35, building: 0 }, range: 10, reload: 5, projectile: STONE, blastRadius: 1.5, convResist: 2, radius: 0.7,
    upgradeOf: 'catapultTrireme', src: 'mil:1b', verify: true,
  }),
  u({
    id: 'fireGalley', name: 'Fire Galley', cls: 'warship', tags: ['ship', 'warship'], trainedAt: 'dock', age: 4,
    cost: { wood: 115, gold: 40 }, trainTime: 45, hp: 200, speed: 2.0, los: 8, atk: { melee: 24 },
    arm: { ...BASE_ARM, fireGalley: -5, building: -10 }, range: 1, reload: 1, convResist: 2, radius: 0.6,
    requires: ['warGalley'], ror: true, src: 'mil:1b', note: 'Unavailable with Full Tech Tree',
  }),
];

/** Villager work rates (per second) and carry capacities, by job (econ:1.2). */
export const VILLAGER_WORK: VillagerWork = {
  rate: { forage: 0.45, farm: 0.45, hunt: 0.45, fish: 0.6, wood: 0.55, gold: 0.45, stone: 0.45, build: 1.0, repair: 0.4 },
  carry: { forage: 10, farm: 10, hunt: 10, fish: 10, wood: 10, gold: 10, stone: 10 },
};

/** Hunters throw spears: attack 4 at range ~4 with 80% accuracy (mil:1a, mil:2). */
export const HUNTER_ATTACK = { atk: { pierce: 4 } as ClassValues, range: 4, accuracy: 0.8, src: 'mil:1a', verify: true };

/** Priest conversion and healing (mil:3, econ:5). */
export const PRIEST_RULES = {
  src: 'mil:3,econ:5',
  convertChance: 0.3, // per chant; divided by the target's convResist
  chantSeconds: 1.5, // verify: DE-era figure
  faithMax: 100,
  faithRegenPerSecond: 2, // full recharge 50 s; Fanaticism → 3.5/s
  healPerSecond: 3,
  verify: true,
} as const;

/** Combat constants (mil:2). */
export const COMBAT_RULES = {
  src: 'mil:2',
  minDamage: 1,
  /** Buildings take 1/5 of summed damage (min 0.1) — confirmed for DE, unverified for 1.0c. */
  buildingDamageFactor: 0.2,
  buildingMinDamage: 0.1,
  /** 1.0a: when attacked, own/allied units within this many tiles respond. */
  retaliationRadius: 2,
  /** Missed projectiles that hit another unit deal this fraction (engine-level; unverified for AoE1). */
  strayHitFactor: 0.5,
  verify: true,
} as const;
