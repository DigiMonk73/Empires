import type { AnimalDef, ResourceDef } from './types.ts';

/** Gatherable map objects (econ:1.1). Farms are buildings; their food is a player stat (farmFood). */
export const RESOURCE_OBJECTS: readonly ResourceDef[] = [
  { id: 'berryBush', name: 'Berry Bush', res: 'food', amount: 150, job: 'forage', size: 1, src: 'econ:1.1' },
  { id: 'shoreFish', name: 'Fish', res: 'food', amount: 250, job: 'fish', size: 1, villagers: true, src: 'econ:1.1', note: 'villagers and boats' },
  { id: 'deepFish', name: 'Deep Fish', res: 'food', amount: 250, job: 'fish', size: 2, boatsOnly: true, src: 'econ:1.1' },
  { id: 'whale', name: 'Whale', res: 'food', amount: 250, job: 'fish', size: 2, boatsOnly: true, src: 'econ:1.1' },
  { id: 'tree', name: 'Tree', res: 'wood', amount: 75, job: 'wood', size: 1, src: 'econ:1.1', note: 'scattered trees' },
  { id: 'forestTree', name: 'Forest', res: 'wood', amount: 40, job: 'wood', size: 1, src: 'econ:1.1', note: 'spawned on forest terrain' },
  { id: 'goldMine', name: 'Gold Mine', res: 'gold', amount: 400, job: 'gold', size: 1, src: 'econ:1.1', note: 'placed in clusters of 6–9' },
  { id: 'stoneMine', name: 'Stone Mine', res: 'stone', amount: 250, job: 'stone', size: 1, src: 'econ:1.1', note: 'placed in clusters of 7' },
];

/** Huntable/hostile animals (Gaia). Carcasses decay at `decay` food per second once killed (econ:1.1). */
export const ANIMALS: readonly AnimalDef[] = [
  { id: 'gazelle', name: 'Gazelle', food: 150, hp: 8, speed: 1.1, decay: 0.3, behavior: 'flee', src: 'econ:1.1', note: 'fandom: decay 0.25' },
  { id: 'elephant', name: 'Elephant', food: 300, hp: 45, speed: 1.0, decay: 0.2, behavior: 'fightBack', atk: { melee: 10 }, range: 0, reload: 1.5, src: 'econ:1.1', verify: true, decision: 'D57', note: 'reload unverified' },
  { id: 'lion', name: 'Lion', food: 100, hp: 20, speed: 1.1, decay: 1.0, behavior: 'aggressive', atk: { melee: 2 }, range: 0, reload: 1.0, src: 'econ:1.1' },
  { id: 'alligator', name: 'Alligator', food: 100, hp: 20, speed: 0.5, decay: 1.0, behavior: 'aggressive', atk: { pierce: 4 }, range: 2, reload: 1.5, habitat: 'shore', src: 'econ:1.1', verify: true, decision: 'D57', note: 'spit range/reload unverified' },
];
