import type { Effect, Selector, TechDef } from './types.ts';

/**
 * Technologies and age advances — Rise of Rome 1.0 data (econ:3, econ:5; military techs cross-checked with
 * mil:1d). Research times are game-seconds.
 */

// ── Selectors ──────────────────────────────────────────────────────────────────
const MELEE_UPGRADABLE: Selector = { classes: ['infantry', 'hoplite', 'scout', 'cavalry', 'camel', 'chariot'] }; // not elephants
const SOLDIERS: Selector = { classes: ['infantry', 'hoplite'] };
const ARCHERS: Selector = { classes: ['footArcher', 'mountedArcher'] };
const CAV_ARMOR: Selector = { classes: ['scout', 'cavalry', 'camel', 'chariot', 'elephant'] };
const SHIELDED: Selector = { classes: ['infantry', 'hoplite', 'slinger'] };
const WOOD_RANGE: Selector = { classes: ['footArcher', 'mountedArcher'], buildingKinds: ['tower'], tags: ['galleyLine'] };
const SIEGE_RANGE: Selector = { classes: ['siege'], tags: ['siegeShip'] };
const PRIESTS: Selector = { classes: ['priest'] };
const VILLAGERS: Selector = { classes: ['villager'] };
const SLINGERS: Selector = { classes: ['slinger'] };
const NOBLE: Selector = {
  classes: ['scout', 'cavalry', 'camel', 'chariot'],
  units: ['horseArcher', 'heavyHorseArcher', 'chariotArcher'],
};
const ALCHEMY: Selector = { classes: ['footArcher', 'mountedArcher', 'slinger', 'siege'], tags: ['warship'], buildingKinds: ['tower'] };

const attr = (sel: Selector, a: string, v: number, mode: 'add' | 'mul' | 'set' = 'add'): Effect => ({ op: 'attr', sel, attr: a, mode, v });
const upgradeUnit = (from: string, to: string): Effect => ({ op: 'upgrade', kind: 'unit', from, to });
const upgradeBuilding = (from: string, to: string): Effect => ({ op: 'upgrade', kind: 'building', from, to });
const enableUnit = (id: string): Effect => ({ op: 'enable', kind: 'unit', id });
const enableBuilding = (id: string): Effect => ({ op: 'enable', kind: 'building', id });

const armorTech = (
  id: string, name: string, sel: Selector, age: 2 | 3 | 4, food: number, gold: number, time: number, requires?: string,
): TechDef => ({
  id, name, at: 'storagePit', age, cost: gold ? { food, gold } : { food }, researchTime: time,
  ...(requires ? { requires: [requires] } : {}), effects: [attr(sel, 'arm.melee', 2)], desc: '+2 melee armor', src: 'econ:5',
});

const woodTech = (id: string, name: string, age: 2 | 3 | 4, food: number, wood: number, time: number, requires?: string): TechDef => ({
  id, name, at: 'market', age, cost: { food, wood }, researchTime: time, ...(requires ? { requires: [requires] } : {}),
  effects: [attr(VILLAGERS, 'work.wood', 0.2), attr(VILLAGERS, 'carry.wood', 2), attr(WOOD_RANGE, 'range', 1), attr(WOOD_RANGE, 'los', 1)],
  desc: 'Woodcutters +0.2 rate, +2 carry; archers, towers and galleys +1 range and LOS', src: 'econ:5',
  verify: true, decision: 'D57', note: 'whether mounted archers are included is inferred from "archers"',
});

const stoneTech = (id: string, name: string, age: 2 | 4, food: number, stone: number, time: number, requires?: string): TechDef => ({
  id, name, at: 'market', age, cost: { food, stone }, researchTime: time, ...(requires ? { requires: [requires] } : {}),
  effects: [
    attr(VILLAGERS, 'work.stone', 0.3), attr(VILLAGERS, 'carry.stone', 3),
    attr(SLINGERS, 'atk.pierce', 1), attr(SLINGERS, 'range', 1), attr(SLINGERS, 'los', 1),
    ...(id === 'siegecraft' ? [attr(VILLAGERS, 'atk.tower', 150), { op: 'flag', flag: 'villagersAttackWalls' } as Effect] : []),
  ],
  desc: id === 'siegecraft' ? 'Stone miners +0.3, +3 carry; Slingers +1 attack/range/LOS; villagers can damage walls and towers'
    : 'Stone miners +0.3 rate, +3 carry; Slingers +1 attack, range and LOS',
  src: 'econ:5',
});

const farmTech = (id: string, name: string, age: 2 | 3 | 4, food: number, wood: number, time: number, requires?: string): TechDef => ({
  id, name, at: 'market', age, cost: { food, wood }, researchTime: time, ...(requires ? { requires: [requires] } : {}),
  effects: [{ op: 'player', attr: 'farmFood', mode: 'add', v: 75 }], desc: 'Farms +75 food', src: 'econ:5',
});

export const TECHS: readonly TechDef[] = [
  // ── Age advances (Town Center) ─────────────────────────────────────────────────
  {
    id: 'toolAge', name: 'Tool Age', at: 'townCenter', age: 1, cost: { food: 500 }, researchTime: 120,
    requiresAnyBuildings: { count: 2, of: ['granary', 'storagePit', 'dock', 'barracks'] },
    effects: [{ op: 'age', age: 2 }, attr({ classes: ['scout'] }, 'los', 2)], desc: 'Advance to the Tool Age', src: 'econ:3',
  },
  {
    id: 'bronzeAge', name: 'Bronze Age', at: 'townCenter', age: 2, cost: { food: 800 }, researchTime: 140,
    requiresAnyBuildings: { count: 2, of: ['market', 'archeryRange', 'stable'] },
    effects: [{ op: 'age', age: 3 }, attr({ classes: ['scout'] }, 'los', 2)], desc: 'Advance to the Bronze Age', src: 'econ:3',
  },
  {
    id: 'ironAge', name: 'Iron Age', at: 'townCenter', age: 3, cost: { food: 1000, gold: 800 }, researchTime: 160,
    requiresAnyBuildings: { count: 2, of: ['temple', 'governmentCenter', 'siegeWorkshop', 'academy'] },
    effects: [{ op: 'age', age: 4 }, attr({ classes: ['scout'] }, 'los', 2)], desc: 'Advance to the Iron Age', src: 'econ:3',
  },

  // ── Granary: walls and towers ──────────────────────────────────────────────────
  { id: 'smallWall', name: 'Small Wall', at: 'granary', age: 2, cost: { food: 50 }, researchTime: 10, effects: [enableBuilding('smallWall')], desc: 'Enables walls', src: 'econ:5' },
  { id: 'watchTower', name: 'Watch Tower', at: 'granary', age: 2, cost: { food: 50 }, researchTime: 10, effects: [enableBuilding('watchTower')], desc: 'Enables towers', src: 'econ:5' },
  { id: 'mediumWall', name: 'Medium Wall', at: 'granary', age: 3, cost: { food: 180, stone: 100 }, researchTime: 60, requires: ['smallWall'], effects: [upgradeBuilding('smallWall', 'mediumWall')], desc: 'Upgrades walls', src: 'econ:5' },
  { id: 'sentryTower', name: 'Sentry Tower', at: 'granary', age: 3, cost: { food: 120, stone: 50 }, researchTime: 30, requires: ['watchTower'], effects: [upgradeBuilding('watchTower', 'sentryTower')], desc: 'Upgrades towers', src: 'econ:5' },
  { id: 'fortification', name: 'Fortification', at: 'granary', age: 4, cost: { food: 300, stone: 175 }, researchTime: 75, requires: ['mediumWall'], effects: [upgradeBuilding('mediumWall', 'fortification')], desc: 'Upgrades walls', src: 'econ:5' },
  { id: 'guardTower', name: 'Guard Tower', at: 'granary', age: 4, cost: { food: 300, stone: 100 }, researchTime: 75, requires: ['sentryTower'], effects: [upgradeBuilding('sentryTower', 'guardTower')], desc: 'Upgrades towers', src: 'econ:5' },
  { id: 'ballistaTower', name: 'Ballista Tower', at: 'granary', age: 4, cost: { food: 1800, stone: 750 }, researchTime: 150, requires: ['guardTower', 'ballistics'], effects: [upgradeBuilding('guardTower', 'ballistaTower')], desc: 'Upgrades towers', src: 'econ:5' },

  // ── Storage Pit: attack and armor ──────────────────────────────────────────────
  { id: 'toolworking', name: 'Toolworking', at: 'storagePit', age: 2, cost: { food: 100 }, researchTime: 40, effects: [attr(MELEE_UPGRADABLE, 'atk.melee', 2)], desc: '+2 melee attack (not elephants)', src: 'econ:5' },
  { id: 'metalworking', name: 'Metalworking', at: 'storagePit', age: 3, cost: { food: 200, gold: 120 }, researchTime: 75, requires: ['toolworking'], effects: [attr(MELEE_UPGRADABLE, 'atk.melee', 2)], desc: '+2 melee attack (not elephants)', src: 'econ:5' },
  { id: 'metallurgy', name: 'Metallurgy', at: 'storagePit', age: 4, cost: { food: 300, gold: 180 }, researchTime: 100, requires: ['metalworking'], effects: [attr(MELEE_UPGRADABLE, 'atk.melee', 3)], desc: '+3 melee attack (not elephants)', src: 'econ:5' },
  armorTech('leatherArmorSoldiers', 'Leather Armor – Soldiers', SOLDIERS, 2, 75, 0, 30),
  armorTech('leatherArmorArchers', 'Leather Armor – Archers', ARCHERS, 2, 100, 0, 30),
  armorTech('leatherArmorCavalry', 'Leather Armor – Cavalry', CAV_ARMOR, 2, 125, 0, 30),
  armorTech('scaleArmorSoldiers', 'Scale Armor – Soldiers', SOLDIERS, 3, 100, 50, 60, 'leatherArmorSoldiers'),
  armorTech('scaleArmorArchers', 'Scale Armor – Archers', ARCHERS, 3, 125, 50, 60, 'leatherArmorArchers'),
  armorTech('scaleArmorCavalry', 'Scale Armor – Cavalry', CAV_ARMOR, 3, 150, 50, 60, 'leatherArmorCavalry'),
  armorTech('chainMailSoldiers', 'Chain Mail – Soldiers', SOLDIERS, 4, 125, 100, 75, 'scaleArmorSoldiers'),
  armorTech('chainMailArchers', 'Chain Mail – Archers', ARCHERS, 4, 150, 100, 75, 'scaleArmorArchers'),
  armorTech('chainMailCavalry', 'Chain Mail – Cavalry', CAV_ARMOR, 4, 175, 100, 75, 'scaleArmorCavalry'),
  { id: 'bronzeShield', name: 'Bronze Shield', at: 'storagePit', age: 3, cost: { food: 150, gold: 180 }, researchTime: 50, effects: [attr(SHIELDED, 'arm.pierce', 1)], desc: '+1 pierce armor for infantry, hoplites and slingers', src: 'econ:5' },
  { id: 'ironShield', name: 'Iron Shield', at: 'storagePit', age: 4, cost: { food: 200, gold: 320 }, researchTime: 75, requires: ['bronzeShield'], effects: [attr(SHIELDED, 'arm.pierce', 1)], desc: '+1 pierce armor for infantry, hoplites and slingers', src: 'econ:5' },
  { id: 'towerShield', name: 'Tower Shield', at: 'storagePit', age: 4, cost: { food: 250, gold: 400 }, researchTime: 100, requires: ['ironShield'], effects: [attr(SHIELDED, 'arm.pierce', 1)], desc: '+1 pierce armor for infantry, hoplites and slingers', ror: true, src: 'econ:5' },

  // ── Market: economy ────────────────────────────────────────────────────────────
  woodTech('woodworking', 'Woodworking', 2, 120, 75, 60),
  woodTech('artisanship', 'Artisanship', 3, 170, 150, 80, 'woodworking'),
  woodTech('craftsmanship', 'Craftsmanship', 4, 240, 200, 100, 'artisanship'),
  { id: 'goldMining', name: 'Gold Mining', at: 'market', age: 2, cost: { food: 120, wood: 100 }, researchTime: 50, effects: [attr(VILLAGERS, 'work.gold', 0.3), attr(VILLAGERS, 'carry.gold', 3)], desc: 'Gold miners +0.3 rate, +3 carry', src: 'econ:5' },
  {
    id: 'coinage', name: 'Coinage', at: 'market', age: 4, cost: { food: 200, gold: 100 }, researchTime: 60, requires: ['goldMining'],
    effects: [{ op: 'player', attr: 'goldYield', mode: 'mul', v: 1.25 }, { op: 'player', attr: 'tributeFee', mode: 'set', v: 0 }],
    desc: 'Gold mined ×1.25; no tribute fee', src: 'econ:5',
  },
  stoneTech('stoneMining', 'Stone Mining', 2, 100, 50, 30),
  stoneTech('siegecraft', 'Siegecraft', 4, 190, 100, 60, 'stoneMining'),
  farmTech('domestication', 'Domestication', 2, 200, 50, 40),
  farmTech('plow', 'Plow', 3, 250, 75, 75, 'domestication'),
  farmTech('irrigation', 'Irrigation', 4, 300, 100, 100, 'plow'),
  {
    id: 'wheel', name: 'Wheel', at: 'market', age: 3, cost: { food: 175, wood: 75 }, researchTime: 75,
    effects: [attr(VILLAGERS, 'speed', 0.7)], desc: 'Villagers move faster; enables chariots', src: 'econ:5',
    verify: true, decision: 'D57', note: 'dat +0.7 vs fandom "TRoR" +0.33',
  },

  // ── Temple ─────────────────────────────────────────────────────────────────────
  { id: 'astrology', name: 'Astrology', at: 'temple', age: 3, cost: { gold: 150 }, researchTime: 50, effects: [{ op: 'player', attr: 'conversionRate', mode: 'mul', v: 1.3 }, { op: 'player', attr: 'healRate', mode: 'mul', v: 1.3 }], desc: 'Conversion and healing +30%', src: 'econ:5' },
  { id: 'mysticism', name: 'Mysticism', at: 'temple', age: 3, cost: { gold: 120 }, researchTime: 50, effects: [attr(PRIESTS, 'hp', 2, 'mul')], desc: 'Priest hit points doubled', src: 'econ:5' },
  { id: 'polytheism', name: 'Polytheism', at: 'temple', age: 3, cost: { gold: 120 }, researchTime: 50, effects: [attr(PRIESTS, 'speed', 1.4, 'mul')], desc: 'Priests move 40% faster', src: 'econ:5' },
  { id: 'afterlife', name: 'Afterlife', at: 'temple', age: 4, cost: { gold: 275 }, researchTime: 75, effects: [attr(PRIESTS, 'range', 3), attr(PRIESTS, 'los', 3)], desc: 'Priest range and LOS +3', src: 'econ:5' },
  { id: 'monotheism', name: 'Monotheism', at: 'temple', age: 4, cost: { gold: 350 }, researchTime: 75, effects: [{ op: 'flag', flag: 'monotheism' }], desc: 'Priests can convert priests and buildings (not Town Centers or Wonders)', src: 'econ:5,mil:3' },
  { id: 'fanaticism', name: 'Fanaticism', at: 'temple', age: 4, cost: { gold: 150 }, researchTime: 60, effects: [{ op: 'player', attr: 'faithRegen', mode: 'add', v: 1.5 }], desc: 'Priests recharge faster (2 → 3.5 per second)', src: 'econ:5' },
  {
    id: 'jihad', name: 'Jihad', at: 'temple', age: 4, cost: { gold: 120 }, researchTime: 60,
    effects: [
      attr(VILLAGERS, 'atk.melee', 7), attr(VILLAGERS, 'hp', 40), attr(VILLAGERS, 'speed', 0.3),
      ...(['forage', 'farm', 'hunt', 'fish', 'wood', 'gold', 'stone'] as const).map((j) => attr(VILLAGERS, `carry.${j}`, -8)),
    ],
    desc: 'Villagers +7 attack, +40 HP, faster; carry −8', src: 'econ:5', verify: true, decision: 'D57', note: 'dat +0.3 speed / −8 carry vs fandom +0.11 / −7',
  },
  { id: 'medicine', name: 'Medicine', at: 'temple', age: 4, cost: { gold: 150 }, researchTime: 50, effects: [{ op: 'player', attr: 'healRate', mode: 'mul', v: 3 }], desc: 'Priests heal three times as fast', ror: true, src: 'econ:5' },
  { id: 'martyrdom', name: 'Martyrdom', at: 'temple', age: 4, cost: { gold: 600 }, researchTime: 100, effects: [{ op: 'flag', flag: 'martyrdom' }], desc: 'Sacrifice a priest (Delete) to convert instantly', ror: true, src: 'econ:5,mil:3' },

  // ── Government Center ──────────────────────────────────────────────────────────
  { id: 'nobility', name: 'Nobility', at: 'governmentCenter', age: 3, cost: { food: 175, gold: 120 }, researchTime: 70, effects: [attr(NOBLE, 'hp', 1.15, 'mul')], desc: '+15% HP for cavalry, chariots and horse archers', src: 'econ:5', verify: true, decision: 'D57', note: 'scout/camel inclusion inferred' },
  { id: 'writing', name: 'Writing', at: 'governmentCenter', age: 3, cost: { food: 200, gold: 75 }, researchTime: 60, effects: [{ op: 'flag', flag: 'writing' }], desc: 'Share exploration with allies', src: 'econ:5' },
  {
    id: 'architecture', name: 'Architecture', at: 'governmentCenter', age: 3, cost: { food: 150, wood: 175 }, researchTime: 50,
    effects: [attr(VILLAGERS, 'work.build', 1.5, 'mul'), attr({ buildingKinds: ['normal', 'wall', 'tower', 'farm', 'wonder'] }, 'hp', 1.2, 'mul')],
    desc: 'Builders work 50% faster; buildings and walls +20% HP', src: 'econ:5',
  },
  { id: 'logistics', name: 'Logistics', at: 'governmentCenter', age: 3, cost: { food: 180, gold: 100 }, researchTime: 60, effects: [attr({ classes: ['infantry', 'slinger'] }, 'pop', 0.5, 'set')], desc: 'Barracks units count as half population', ror: true, src: 'econ:5' },
  { id: 'aristocracy', name: 'Aristocracy', at: 'governmentCenter', age: 4, cost: { food: 175, gold: 150 }, researchTime: 60, effects: [attr({ classes: ['hoplite'] }, 'speed', 0.25)], desc: 'Hoplite line +0.25 speed', src: 'econ:5' },
  { id: 'ballistics', name: 'Ballistics', at: 'governmentCenter', age: 4, cost: { food: 200, gold: 50 }, researchTime: 60, effects: [{ op: 'flag', flag: 'ballistics' }], desc: 'Missiles lead moving targets', src: 'econ:5' },
  {
    id: 'alchemy', name: 'Alchemy', at: 'governmentCenter', age: 4, cost: { food: 250, gold: 200 }, researchTime: 100,
    effects: [
      attr({ classes: ['footArcher', 'mountedArcher', 'slinger'], tags: ['galleyLine'], buildingKinds: ['tower'] }, 'atk.pierce', 1),
      attr({ tags: ['catapultLine', 'siegeShip'] }, 'atk.melee', 1),
      attr({ tags: ['ballistaLine'] }, 'atk.pierce', 2),
      attr({ units: ['fireGalley'] }, 'atk.melee', 6),
      { op: 'flag', flag: 'flamingProjectiles' },
    ],
    desc: 'Missile units, towers and siege +1 attack (Ballista line +2, Fire Galley +6)', src: 'econ:5,mil:1c', verify: true, decision: 'D57',
    note: 'mil:1c says Alchemy did not raise tower attack in the original; econ:5 says it did',
  },
  { id: 'engineering', name: 'Engineering', at: 'governmentCenter', age: 4, cost: { food: 200, wood: 100 }, researchTime: 70, effects: [attr(SIEGE_RANGE, 'range', 2), attr(SIEGE_RANGE, 'los', 2)], desc: 'Siege weapons and siege ships +2 range and LOS', src: 'econ:5' },

  // ── Unit upgrades ──────────────────────────────────────────────────────────────
  { id: 'battleAxe', name: 'Battle Axe', at: 'barracks', age: 2, cost: { food: 100 }, researchTime: 40, effects: [upgradeUnit('clubman', 'axeman')], desc: 'Clubmen become Axemen', src: 'econ:5' },
  { id: 'shortSword', name: 'Short Sword', at: 'barracks', age: 3, cost: { food: 120, gold: 50 }, researchTime: 50, requires: ['battleAxe'], effects: [enableUnit('shortSwordsman')], desc: 'Enables Short Swordsmen', src: 'econ:5' },
  { id: 'broadSword', name: 'Broad Sword', at: 'barracks', age: 3, cost: { food: 140, gold: 50 }, researchTime: 80, requires: ['shortSword'], effects: [upgradeUnit('shortSwordsman', 'broadSwordsman')], desc: 'Upgrades Short Swordsmen', src: 'econ:5' },
  { id: 'longSword', name: 'Long Sword', at: 'barracks', age: 4, cost: { food: 160, gold: 50 }, researchTime: 90, requires: ['broadSword'], effects: [upgradeUnit('broadSwordsman', 'longSwordsman')], desc: 'Upgrades Broad Swordsmen', src: 'econ:5' },
  { id: 'legion', name: 'Legion', at: 'barracks', age: 4, cost: { food: 1400, gold: 600 }, researchTime: 150, requires: ['longSword', 'fanaticism'], effects: [upgradeUnit('longSwordsman', 'legion')], desc: 'Upgrades Long Swordsmen', src: 'econ:5' },
  { id: 'improvedBow', name: 'Improved Bow', at: 'archeryRange', age: 3, cost: { food: 140, wood: 80 }, researchTime: 60, effects: [enableUnit('improvedBowman')], desc: 'Enables Improved Bowmen', src: 'econ:5' },
  { id: 'compositeBow', name: 'Composite Bow', at: 'archeryRange', age: 3, cost: { food: 180, wood: 100 }, researchTime: 100, requires: ['improvedBow'], effects: [upgradeUnit('improvedBowman', 'compositeBowman')], desc: 'Upgrades Improved Bowmen', src: 'econ:5' },
  { id: 'heavyHorseArcher', name: 'Heavy Horse Archer', at: 'archeryRange', age: 4, cost: { food: 1750, gold: 800 }, researchTime: 150, requires: ['chainMailArchers'], effects: [upgradeUnit('horseArcher', 'heavyHorseArcher')], desc: 'Upgrades Horse Archers', src: 'econ:5' },
  { id: 'heavyCavalry', name: 'Heavy Cavalry', at: 'stable', age: 4, cost: { food: 350, gold: 125 }, researchTime: 90, effects: [upgradeUnit('cavalry', 'heavyCavalry')], desc: 'Upgrades Cavalry', src: 'econ:5' },
  { id: 'cataphract', name: 'Cataphract', at: 'stable', age: 4, cost: { food: 2000, gold: 850 }, researchTime: 150, requires: ['heavyCavalry', 'metallurgy'], effects: [upgradeUnit('heavyCavalry', 'cataphract')], desc: 'Upgrades Heavy Cavalry', src: 'econ:5' },
  { id: 'armoredElephant', name: 'Armored Elephant', at: 'stable', age: 4, cost: { food: 1000, gold: 1200 }, researchTime: 150, requires: ['ironShield'], effects: [upgradeUnit('warElephant', 'armoredElephant')], desc: 'Upgrades War Elephants', ror: true, src: 'econ:5' },
  { id: 'scytheChariot', name: 'Scythe Chariot', at: 'stable', age: 4, cost: { wood: 1200, gold: 800 }, researchTime: 150, requires: ['nobility'], effects: [upgradeUnit('chariot', 'scytheChariot')], desc: 'Upgrades Chariots', ror: true, src: 'econ:5' },
  { id: 'catapult', name: 'Catapult', at: 'siegeWorkshop', age: 4, cost: { food: 300, wood: 250 }, researchTime: 100, effects: [upgradeUnit('stoneThrower', 'catapult')], desc: 'Upgrades Stone Throwers', src: 'econ:5' },
  { id: 'heavyCatapult', name: 'Heavy Catapult', at: 'siegeWorkshop', age: 4, cost: { food: 1800, wood: 900 }, researchTime: 150, requires: ['catapult', 'siegecraft'], effects: [upgradeUnit('catapult', 'heavyCatapult')], desc: 'Upgrades Catapults', src: 'econ:5' },
  { id: 'helepolis', name: 'Helepolis', at: 'siegeWorkshop', age: 4, cost: { food: 1500, wood: 1000 }, researchTime: 150, requires: ['craftsmanship'], effects: [upgradeUnit('ballista', 'helepolis')], desc: 'Upgrades Ballistas', src: 'econ:5' },
  { id: 'phalanx', name: 'Phalanx', at: 'academy', age: 4, cost: { food: 300, gold: 100 }, researchTime: 90, effects: [upgradeUnit('hoplite', 'phalanx')], desc: 'Upgrades Hoplites', src: 'econ:5' },
  { id: 'centurion', name: 'Centurion', at: 'academy', age: 4, cost: { food: 1800, gold: 700 }, researchTime: 150, requires: ['phalanx', 'aristocracy'], effects: [upgradeUnit('phalanx', 'centurion')], desc: 'Upgrades Phalanxes', src: 'econ:5' },
  { id: 'fishingShip', name: 'Fishing Ship', at: 'dock', age: 3, cost: { food: 50, wood: 100 }, researchTime: 30, effects: [upgradeUnit('fishingBoat', 'fishingShip')], desc: 'Upgrades Fishing Boats', src: 'econ:5' },
  { id: 'warGalley', name: 'War Galley', at: 'dock', age: 3, cost: { food: 150, wood: 75 }, researchTime: 75, effects: [upgradeUnit('scoutShip', 'warGalley'), enableUnit('fireGalley')], desc: 'Upgrades Scout Ships (and enables the Fire Galley in the Iron Age)', src: 'econ:5,mil:1b' },
  { id: 'merchantShip', name: 'Merchant Ship', at: 'dock', age: 3, cost: { food: 200, wood: 75 }, researchTime: 60, effects: [upgradeUnit('tradeBoat', 'merchantShip')], desc: 'Upgrades Trade Boats', src: 'econ:5' },
  { id: 'trireme', name: 'Trireme', at: 'dock', age: 4, cost: { food: 250, wood: 100 }, researchTime: 100, requires: ['warGalley'], effects: [upgradeUnit('warGalley', 'trireme')], desc: 'Upgrades War Galleys', src: 'econ:5' },
  { id: 'heavyTransport', name: 'Heavy Transport', at: 'dock', age: 4, cost: { food: 150, wood: 125 }, researchTime: 75, effects: [upgradeUnit('lightTransport', 'heavyTransport')], desc: 'Upgrades Light Transports', src: 'econ:5' },
  { id: 'catapultTrireme', name: 'Catapult Trireme', at: 'dock', age: 4, cost: { food: 300, wood: 100 }, researchTime: 100, requires: ['trireme'], effects: [enableUnit('catapultTrireme')], desc: 'Enables Catapult Triremes', src: 'econ:5' },
  { id: 'juggernaught', name: 'Juggernaught', at: 'dock', age: 4, cost: { food: 2000, wood: 900 }, researchTime: 180, requires: ['catapultTrireme', 'engineering'], effects: [upgradeUnit('catapultTrireme', 'juggernaught')], desc: 'Upgrades Catapult Triremes', src: 'econ:5' },
];
