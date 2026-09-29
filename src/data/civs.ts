import type { ArchSet, CivDef, Disabled, Effect, Selector } from './types.ts';

/**
 * Civilizations — bonuses from RoR 1.0 data with 1.0a patch values (econ:6.1), architecture sets from the dat's
 * icon sets, and tech-tree gaps from the availability matrix (econ:6.2).
 */

const attr = (sel: Selector, a: string, v: number, mode: 'add' | 'mul' | 'set' = 'add'): Effect => ({ op: 'attr', sel, attr: a, mode, v });
const player = (a: Extract<Effect, { op: 'player' }>['attr'], v: number, mode: 'add' | 'mul' | 'set' = 'add'): Effect => ({ op: 'player', attr: a, mode, v });

const VILLAGERS: Selector = { classes: ['villager'] };
const PRIESTS: Selector = { classes: ['priest'] };
const ELEPHANTS: Selector = { classes: ['elephant'], units: ['elephantArcher'] };
const HOPLITES: Selector = { classes: ['hoplite'] };
const ARCHERS: Selector = { classes: ['footArcher', 'mountedArcher'] };
const SHIPS: Selector = { tags: ['ship'] };
const WALLS_TOWERS: Selector = { buildingKinds: ['wall', 'tower'] };
const TOWERS: Selector = { buildingKinds: ['tower'] };

/** Civ column order of the matrix (alphabetical, as in econ:6.2). */
export const CIV_ORDER = [
  'assyrian', 'babylonian', 'carthaginian', 'choson', 'egyptian', 'greek', 'hittite', 'macedonian',
  'minoan', 'palmyran', 'persian', 'phoenician', 'roman', 'shang', 'sumerian', 'yamato',
] as const;
export type CivId = (typeof CIV_ORDER)[number];

type MatrixRow = readonly [kind: keyof Disabled, ids: string | readonly string[], row: string];

/**
 * Tech-tree availability (econ:6.2). One character per civ in CIV_ORDER: `Y` available, `-` missing. Only items
 * at least one civ lacks are listed; everything else is available to all.
 */
export const TECH_TREE_MATRIX: readonly MatrixRow[] = [
  //                                             AsBaCaChEgGrHiMaMiPaPePhRoShSuYa
  ['buildings', 'academy', /*                */ 'YYYYYYYYYY-YYYYY'],
  ['techs', 'phalanx', /*                    */ '--Y--YYYYY-YY-YY'],
  ['techs', 'centurion', /*                  */ '--Y--YYYY--YY-YY'],
  ['techs', 'broadSword', /*                 */ 'YYYY--YYYYYYYYY-'],
  ['techs', 'longSword', /*                  */ 'YYYY----Y-YYY-Y-'],
  ['techs', 'legion', /*                     */ 'YY-Y------YYY---'],
  ['units', 'slinger', /*                    */ '-YYYYY-YYYYYYYYY'],
  ['techs', 'improvedBow', /*                */ '-YYYY--YYYYYYY-Y'],
  ['techs', 'compositeBow', /*               */ '-Y--Y--YYYYY-Y-Y'],
  ['units', 'chariotArcher', /*              */ 'YY--Y-Y--Y-Y-YY-'],
  ['units', 'horseArcher', /*                */ 'YYYY--YY-YY--YYY'],
  ['techs', 'heavyHorseArcher', /*           */ '------YY-YY--YYY'],
  ['units', 'elephantArcher', /*             */ '--Y-Y-Y---YY----'],
  ['units', 'chariot', /*                    */ 'YY--Y-Y--Y-YYYY-'],
  ['techs', 'scytheChariot', /*              */ '-Y--Y-Y--Y-YYYY-'],
  ['units', 'cavalry', /*                    */ 'YYYY-YYYYYYYYY-Y'],
  ['techs', 'heavyCavalry', /*               */ 'Y-YY-Y-Y-YY--Y-Y'],
  ['techs', 'cataphract', /*                 */ 'Y--Y---Y--Y--Y-Y'],
  ['units', 'camel', /*                      */ 'YYY-Y-Y-YYYY-YY-'],
  ['units', 'warElephant', /*                */ '--Y-Y-YY-YYY--Y-'],
  ['techs', 'armoredElephant', /*            */ '-YY---YY-YYY---Y'],
  ['techs', 'catapult', /*                   */ 'YY---YY-YYY-YYY-'],
  ['techs', 'heavyCatapult', /*              */ 'YY---YY-YY--Y-Y-'],
  ['units', 'ballista', /*                   */ 'Y-YY-Y-YYY--YY--'],
  ['techs', 'helepolis', /*                  */ 'Y-YY-Y--Y---YY--'],
  ['techs', 'fishingShip', /*                */ 'YYYYYY-YYYYYYYYY'],
  ['techs', 'trireme', /*                    */ 'Y-YYYY-YYYYYY-YY'],
  ['techs', 'catapultTrireme', /*            */ '----YY-YY-YYY--Y'],
  ['techs', 'juggernaught', /*               */ '----YY--Y-YYY--Y'],
  ['techs', 'heavyTransport', /*             */ '--Y-YY-YY-YYY--Y'],
  ['units', 'fireGalley', /*                 */ 'YYY---Y--Y---YY-'],
  ['buildings', 'temple', /*                 */ 'YYYYYYY-YYYYYYYY'],
  ['techs', 'guardTower', /*                 */ 'YYYYYYYY-YYY-YY-'],
  ['techs', 'ballistaTower', /*              */ 'YYYYYYYY-Y-Y--Y-'],
  ['techs', 'fortification', /*              */ 'YY-YYYY--YYYYYY-'],
  ['techs', 'wheel', /*                      */ 'YYYYYYY-YY-YYYYY'],
  ['techs', 'artisanship', /*                */ 'YYYYYYYYYY-YYYYY'],
  ['techs', 'craftsmanship', /*              */ 'YYYYYYY-Y--YYY-Y'],
  ['techs', 'plow', /*                       */ 'YYYYYYYYY--YYYYY'],
  ['techs', 'irrigation', /*                 */ 'YYYYYYYYY-YY-YYY'],
  ['techs', 'coinage', /*                    */ 'YYYY-YYYY--YY--Y'],
  ['techs', 'siegecraft', /*                 */ 'YY-Y-YY-YY--Y-YY'],
  ['techs', 'metallurgy', /*                 */ 'Y--YY-YYY-Y-YY-Y'],
  ['techs', ['chainMailSoldiers', 'chainMailArchers', 'chainMailCavalry'], '----YYYYYYY-YYYY'],
  ['techs', 'bronzeShield', /*               */ '-YYY-YYYYYYYYYYY'],
  ['techs', 'ironShield', /*                 */ '--Y--YYYYYYYYY-Y'],
  ['techs', 'towerShield', /*                */ '--Y--YYYY-YYYY--'],
  ['techs', 'nobility', /*                   */ '-YY-YYY-YYYYYYYY'],
  ['techs', 'architecture', /*               */ '-YYYYYYYYYY-YYYY'],
  ['techs', 'logistics', /*                  */ 'YYYYYYYYY-YYYYYY'],
  ['techs', 'aristocracy', /*                */ '-YY-YYYYY--YY-YY'],
  ['techs', 'ballistics', /*                 */ 'YYYYYYYYYY-YY-YY'],
  ['techs', 'alchemy', /*                    */ '-YY-YYYYYYYY--YY'],
  ['techs', 'engineering', /*                */ '-YY-YYY-Y-YYY-YY'],
  ['techs', 'astrology', /*                  */ 'YY-YYYY--YYY-Y--'],
  ['techs', 'mysticism', /*                  */ 'YYYYYY----YYYYY-'],
  ['techs', 'polytheism', /*                 */ 'YYYYYY--Y-YYYYYY'],
  ['techs', 'afterlife', /*                  */ 'YYYYYY---YYY-Y-Y'],
  ['techs', 'monotheism', /*                 */ 'YY-YY-----YYYY--'],
  ['techs', 'fanaticism', /*                 */ 'YY-YYY---YYYYY--'],
  ['techs', 'jihad', /*                      */ 'YYYYY----YYYYY--'],
  ['techs', 'medicine', /*                   */ 'YYYYYY--Y-YYYYY-'],
  ['techs', 'martyrdom', /*                  */ 'YYYYY-----YYYYY-'],
];

function disabledFor(civ: CivId): Disabled {
  const col = CIV_ORDER.indexOf(civ);
  const out = { units: [] as string[], buildings: [] as string[], techs: [] as string[] };
  for (const [kind, ids, row] of TECH_TREE_MATRIX) {
    if (row[col] === '-') out[kind].push(...(typeof ids === 'string' ? [ids] : ids));
  }
  return out;
}

const civ = (id: CivId, name: string, arch: ArchSet, bonusText: string[], bonuses: Effect[], extra: Partial<CivDef> = {}): CivDef => ({
  id, name, arch, bonusText, bonuses, disabled: disabledFor(id), src: 'econ:6.1,econ:6.2', ...extra,
});

export const CIVS: readonly CivDef[] = [
  civ('assyrian', 'Assyrian', 'egyptian', ['Archers fire faster (reload 1.1)', 'Villagers move faster (+0.2)'], [
    attr(ARCHERS, 'reload', 1.1, 'set'), attr(VILLAGERS, 'speed', 0.2),
  ], { verify: true, note: 'whether the Elephant Archer shares the reload bonus is unverified' }),
  civ('babylonian', 'Babylonian', 'babylonian', ['Priests recharge faster (+0.75/s)', 'Stone miners work faster and carry more', 'Walls and towers ×2 HP'], [
    player('faithRegen', 0.75), attr(VILLAGERS, 'work.stone', 0.2), attr(VILLAGERS, 'carry.stone', 3), attr(WALLS_TOWERS, 'hp', 2, 'mul'),
  ]),
  civ('carthaginian', 'Carthaginian', 'roman', ['Academy units and elephants +25% HP', 'Transports move faster', 'Fire Galleys +6 attack'], [
    attr({ classes: ['hoplite', 'elephant'], units: ['elephantArcher'] }, 'hp', 1.25, 'mul'),
    attr({ units: ['lightTransport'] }, 'speed', 0.35), attr({ units: ['heavyTransport'] }, 'speed', 0.75),
    attr({ units: ['fireGalley'] }, 'atk.melee', 6),
  ], { ror: true }),
  civ('choson', 'Choson', 'asian', ['Priests cost 32% less', 'Towers +2 range and LOS', 'Long Swordsmen and Legions +80 HP'], [
    attr(PRIESTS, 'cost.gold', 0.68, 'mul'), attr(TOWERS, 'range', 2), attr(TOWERS, 'los', 2),
    attr({ units: ['longSwordsman', 'legion'] }, 'hp', 80),
  ]),
  civ('egyptian', 'Egyptian', 'egyptian', ['Priests +3 range and LOS', 'Gold miners work faster and carry more', 'Chariots +33% HP'], [
    attr(PRIESTS, 'range', 3), attr(PRIESTS, 'los', 3), attr(VILLAGERS, 'work.gold', 0.2), attr(VILLAGERS, 'carry.gold', 2),
    attr({ units: ['chariot', 'chariotArcher', 'scytheChariot'] }, 'hp', 1.33, 'mul'),
  ]),
  civ('greek', 'Greek', 'greek', ['Academy units move faster (+0.3)', 'Warships move faster (+0.3)'], [
    attr(HOPLITES, 'speed', 0.3), attr({ tags: ['warship'] }, 'speed', 0.3),
  ]),
  civ('hittite', 'Hittite', 'babylonian', ['Siege weapons ×2 HP', 'Archers +1 attack', 'Scout Ships and War Galleys +4 range and LOS'], [
    attr({ classes: ['siege'] }, 'hp', 2, 'mul'), attr(ARCHERS, 'atk.pierce', 1),
    attr({ units: ['scoutShip', 'warGalley'] }, 'range', 4), attr({ units: ['scoutShip', 'warGalley'] }, 'los', 4),
  ], { note: 'Mesopotamian (Babylonian) architecture in RoR; Return of Rome swapped it' }),
  civ('macedonian', 'Macedonian', 'roman', ['Academy units +2 pierce armor', 'Land units and non-war boats +2 LOS', 'Siege weapons cost 50% less', 'Units 4× harder to convert'], [
    attr(HOPLITES, 'arm.pierce', 2),
    attr({ classes: ['infantry', 'scout', 'cavalry', 'camel', 'elephant', 'hoplite', 'villager', 'fishingShip', 'tradeShip', 'transport'] }, 'los', 2),
    attr({ classes: ['siege'] }, 'cost.all', 0.5, 'mul'),
    attr({ classes: ['villager', 'infantry', 'slinger', 'footArcher', 'mountedArcher', 'scout', 'cavalry', 'camel', 'chariot', 'elephant', 'hoplite', 'priest', 'siege', 'fishingShip', 'tradeShip', 'transport', 'warship'] }, 'convResist', 4, 'mul'),
  ], { ror: true, note: 'conversion resistance is hard-coded in the original exe' }),
  civ('minoan', 'Minoan', 'greek', ['Ships cost 30% less', 'Composite Bowmen +2 range and LOS', 'Farms +60 food'], [
    attr(SHIPS, 'cost.all', 0.7, 'mul'), attr({ units: ['compositeBowman'] }, 'range', 2), attr({ units: ['compositeBowman'] }, 'los', 2),
    player('farmFood', 60),
  ]),
  civ('palmyran', 'Palmyran', 'roman', ['Villagers cost 75 food, +1 armor, gather faster (not farming)', 'Camels move 25% faster', 'No tribute fee'], [
    attr(VILLAGERS, 'cost.food', 75, 'set'), attr(VILLAGERS, 'arm.melee', 1), attr(VILLAGERS, 'arm.pierce', 1),
    ...(['forage', 'fish', 'hunt', 'wood', 'gold', 'stone'] as const).map((j) => attr(VILLAGERS, `work.${j}`, 0.2)),
    attr({ classes: ['camel'] }, 'speed', 1.25, 'mul'), player('tributeFee', 0, 'set'),
  ], { ror: true, verify: true, note: '"+1 base armor" split across melee and pierce is inferred' }),
  civ('persian', 'Persian', 'babylonian', ['Hunters work faster and carry more', 'Elephants move faster (+0.5)', 'Triremes fire faster (reload 1.3)'], [
    attr(VILLAGERS, 'work.hunt', 0.3), attr(VILLAGERS, 'carry.hunt', 3), attr(ELEPHANTS, 'speed', 0.5),
    attr({ units: ['trireme'] }, 'reload', 1.3, 'set'),
  ]),
  civ('phoenician', 'Phoenician', 'greek', ['Elephants cost 25% less', 'Catapult ships fire faster (reload 2.9)', 'Woodcutters +15% and +2 carry'], [
    attr(ELEPHANTS, 'cost.all', 0.75, 'mul'), attr({ tags: ['siegeShip'] }, 'reload', 2.9, 'set'),
    attr(VILLAGERS, 'work.wood', 1.15, 'mul'), attr(VILLAGERS, 'carry.wood', 2),
  ], { note: 'woodcutting uses the 1.0a patch values' }),
  civ('roman', 'Roman', 'roman', ['Buildings cost 15% less (not walls or Wonder)', 'Towers cost 50% less', 'Swordsmen attack faster (reload 1.0)'], [
    attr({ buildingKinds: ['normal', 'farm'] }, 'cost.all', 0.85, 'mul'), attr(TOWERS, 'cost.all', 0.5, 'mul'),
    attr({ tags: ['swordsman'] }, 'reload', 1.0, 'set'),
  ], { ror: true }),
  civ('shang', 'Shang', 'asian', ['Villagers cost 40 food', 'Walls ×2 HP', 'Start with 40 less food'], [
    attr(VILLAGERS, 'cost.food', 40, 'set'), attr({ buildingKinds: ['wall'] }, 'hp', 2, 'mul'), player('start.food', -40),
  ], { note: '1.0a patch values' }),
  civ('sumerian', 'Sumerian', 'egyptian', ['Villagers +15 HP', 'Stone throwers fire faster (reload 3.5)', 'Farms +250 food'], [
    attr(VILLAGERS, 'hp', 15), attr({ tags: ['catapultLine'] }, 'reload', 3.5, 'set'), player('farmFood', 250),
  ], { note: 'Egyptian architecture in the original; Return of Rome swapped it' }),
  civ('yamato', 'Yamato', 'asian', ['Mounted units cost 25% less', 'Ships +30% HP', 'Villagers move faster (+0.2)'], [
    attr({ classes: ['scout', 'cavalry'], units: ['horseArcher', 'heavyHorseArcher'] }, 'cost.all', 0.75, 'mul'),
    attr(SHIPS, 'hp', 1.3, 'mul'), attr(VILLAGERS, 'speed', 0.2),
  ], { verify: true, note: 'fishing boats ×1.33 (vs 1.3) not modelled separately' }),
];
