import type { BuildingDef, ClassValues } from './types.ts';

/**
 * Buildings — Rise of Rome 1.0 data (econ:4), towers from mil:1c. Footprint = 2 × collision half-size.
 * No building garrisons and the Town Center cannot attack in 1.0 (mil:1c, econ:4).
 */

/** Ordinary buildings: melee/pierce 0, class-6 −140 (siege bonus). */
const BUILDING_ARM: ClassValues = { melee: 0, pierce: 0, building: -140 };
const TOWER_ARM = (pierce: number): ClassValues => ({ melee: 0, pierce, building: -50, tower: -40, archerWallTower: -7 });
const WALL_ARM = (pierce: number): ClassValues => ({ melee: 0, pierce, building: -140, tower: -80, archerWallTower: -7 });
const TOWER_ARROW = { speed: 8 } as const;

type B = Omit<BuildingDef, 'arm' | 'kind' | 'startsEnabled'> & Partial<Pick<BuildingDef, 'arm' | 'kind' | 'startsEnabled'>>;
const b = (d: B): BuildingDef => ({ kind: 'normal', arm: BUILDING_ARM, startsEnabled: true, ...d });

export const BUILDINGS: readonly BuildingDef[] = [
  b({
    id: 'townCenter', name: 'Town Center', age: 1, cost: { wood: 200 }, buildTime: 60, hp: 600, los: 7, size: 3,
    popProvided: 4, dropoff: ['food', 'wood', 'gold', 'stone', 'meat', 'fish'], trains: ['villager'], src: 'econ:4',
    note: 'A second Town Center requires a Government Center; a lost single TC can always be rebuilt',
  }),
  b({ id: 'house', name: 'House', age: 1, cost: { wood: 30 }, buildTime: 20, hp: 75, los: 3, size: 2, popProvided: 4, src: 'econ:4' }),
  b({
    id: 'granary', name: 'Granary', age: 1, cost: { wood: 120 }, buildTime: 30, hp: 350, los: 5, size: 3,
    dropoff: ['food'], src: 'econ:4', note: 'Accepts forage (berries) and farm food only',
  }),
  b({
    id: 'storagePit', name: 'Storage Pit', age: 1, cost: { wood: 120 }, buildTime: 30, hp: 350, los: 4, size: 3,
    dropoff: ['wood', 'gold', 'stone', 'meat', 'fish'], src: 'econ:4,econ:1.2',
  }),
  b({
    id: 'dock', name: 'Dock', age: 1, cost: { wood: 100 }, buildTime: 50, hp: 350, los: 5, size: 3, shore: true,
    dropoff: ['fish'], trains: ['fishingBoat', 'tradeBoat', 'lightTransport', 'scoutShip', 'catapultTrireme', 'fireGalley'],
    workRateByAge: { 1: 1.5, 2: 1.5, 3: 2, 4: 2 }, src: 'econ:4,econ:1.3', note: 'Boats drop fish only at Docks',
  }),
  b({
    id: 'barracks', name: 'Barracks', age: 1, cost: { wood: 125 }, buildTime: 30, hp: 350, los: 5, size: 3,
    trains: ['clubman', 'slinger', 'shortSwordsman'], src: 'econ:4',
  }),
  b({
    id: 'market', name: 'Market', age: 2, cost: { wood: 150 }, buildTime: 40, hp: 350, los: 5, size: 3,
    requiresBuilding: ['granary'], src: 'econ:3,econ:4', note: 'Completing a Market enables Farms',
  }),
  b({
    id: 'archeryRange', name: 'Archery Range', age: 2, cost: { wood: 150 }, buildTime: 40, hp: 350, los: 4, size: 3,
    requiresBuilding: ['barracks'], trains: ['bowman', 'improvedBowman', 'chariotArcher', 'horseArcher', 'elephantArcher'],
    src: 'econ:3,econ:4',
  }),
  b({
    id: 'stable', name: 'Stable', age: 2, cost: { wood: 150 }, buildTime: 40, hp: 350, los: 4, size: 3,
    requiresBuilding: ['barracks'], trains: ['scout', 'chariot', 'cavalry', 'camel', 'warElephant'], src: 'econ:3,econ:4',
  }),
  b({
    id: 'farm', name: 'Farm', kind: 'farm', age: 2, cost: { wood: 75 }, buildTime: 30, hp: 50, los: 4, size: 3,
    requiresBuilding: ['market'], src: 'econ:1.4,econ:4', note: '250 food (+75 per farm tech); walkable; must be rebuilt when empty',
  }),
  b({
    id: 'governmentCenter', name: 'Government Center', age: 3, cost: { wood: 175 }, buildTime: 60, hp: 350, los: 6, size: 3,
    requiresBuilding: ['market'], src: 'econ:3,econ:4',
  }),
  b({
    id: 'temple', name: 'Temple', age: 3, cost: { wood: 200 }, buildTime: 60, hp: 350, los: 4, size: 3,
    requiresBuilding: ['market'], trains: ['priest'], src: 'econ:3,econ:4',
  }),
  b({
    id: 'siegeWorkshop', name: 'Siege Workshop', age: 3, cost: { wood: 200 }, buildTime: 60, hp: 350, los: 5, size: 3,
    requiresBuilding: ['archeryRange'], trains: ['stoneThrower', 'ballista'], src: 'econ:3,econ:4',
  }),
  b({
    id: 'academy', name: 'Academy', age: 3, cost: { wood: 200 }, buildTime: 60, hp: 350, los: 6, size: 3,
    requiresBuilding: ['stable'], trains: ['hoplite'], src: 'econ:3,econ:4',
  }),
  b({
    id: 'wonder', name: 'Wonder', kind: 'wonder', age: 4, cost: { wood: 1000, stone: 1000, gold: 1000 }, buildTime: 8000,
    hp: 500, los: 4, size: 5, src: 'econ:4', verify: true, decision: 'D57', note: 'HP 500 from the dat table — seems low; confirm',
  }),

  // ── Walls (per 1×1 segment) ──────────────────────────────────────────────────
  b({
    id: 'smallWall', name: 'Small Wall', kind: 'wall', age: 2, cost: { stone: 5 }, buildTime: 7, hp: 200, los: 3, size: 1,
    arm: WALL_ARM(3), startsEnabled: false, requires: ['smallWall'], src: 'econ:4', verify: true, decision: 'D57',
    note: 'class-6/10/1 wall armor values partly inferred',
  }),
  b({
    id: 'mediumWall', name: 'Medium Wall', kind: 'wall', age: 3, cost: { stone: 5 }, buildTime: 7, hp: 300, los: 3, size: 1,
    arm: WALL_ARM(4), startsEnabled: false, src: 'econ:4',
  }),
  b({
    id: 'fortification', name: 'Fortification', kind: 'wall', age: 4, cost: { stone: 5 }, buildTime: 7, hp: 400, los: 3,
    size: 1, arm: WALL_ARM(4), startsEnabled: false, src: 'econ:4',
  }),

  // ── Towers (2×2, 150 stone, 80 s) ────────────────────────────────────────────
  b({
    id: 'watchTower', name: 'Watch Tower', kind: 'tower', age: 2, cost: { stone: 150 }, buildTime: 80, hp: 100, los: 8, size: 2,
    arm: TOWER_ARM(3), atk: { pierce: 3 }, range: 5, reload: 1.5, projectile: TOWER_ARROW, startsEnabled: false,
    requires: ['watchTower'], src: 'mil:1c,econ:4',
  }),
  b({
    id: 'sentryTower', name: 'Sentry Tower', kind: 'tower', age: 3, cost: { stone: 150 }, buildTime: 80, hp: 150, los: 9,
    size: 2, arm: TOWER_ARM(4), atk: { pierce: 4 }, range: 6, reload: 1.5, projectile: TOWER_ARROW, startsEnabled: false,
    src: 'mil:1c,econ:4',
  }),
  b({
    id: 'guardTower', name: 'Guard Tower', kind: 'tower', age: 4, cost: { stone: 150 }, buildTime: 80, hp: 200, los: 10,
    size: 2, arm: TOWER_ARM(4), atk: { pierce: 6 }, range: 7, reload: 1.5, projectile: TOWER_ARROW, startsEnabled: false,
    src: 'mil:1c,econ:4',
  }),
  b({
    id: 'ballistaTower', name: 'Ballista Tower', kind: 'tower', age: 4, cost: { stone: 150 }, buildTime: 80, hp: 200, los: 10,
    size: 2, arm: TOWER_ARM(4), atk: { pierce: 20 }, range: 7, reload: 3, projectile: { speed: 4.5 }, startsEnabled: false,
    src: 'mil:1c,econ:4',
  }),

  // ── Map objects (M14.1): claimed by standing beside them, never built or destroyed (econ:7). Appended last so
  // every earlier type keeps its index (saved games store type indices).
  b({
    id: 'ruins', name: 'Ruins', kind: 'relic', age: 1, cost: {}, buildTime: 0, hp: 1, los: 2, size: 2, startsEnabled: false,
    src: 'econ:7',
  }),
  b({
    id: 'artifact', name: 'Artifact', kind: 'relic', age: 1, cost: {}, buildTime: 0, hp: 1, los: 2, size: 1, startsEnabled: false,
    src: 'econ:7',
  }),
];
