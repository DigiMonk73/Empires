import type { SimConfig } from '../sim/index.ts';
import { battleConfig } from '../sim/testing/battle.ts';
import { GEN_MAP_TYPES, generateMap, type GenMapType } from '../sim/mapgen/generate.ts';
import { MAP_SIZES, type MapSizeId } from '../data/setup.ts';
import { setupFromQuery, skirmishConfig } from './skirmish.ts';
import { wallLine } from '../input/wallLine.ts';

/**
 * Hand-made scenarios for development and tests (`?scenario=<name>`). Random maps replace these for real games
 * in M6.
 */
function demo(): SimConfig {
  const W = 48;
  const rows: string[] = [];
  for (let y = 0; y < W; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      let c = '.';
      const d = (cx: number, cy: number): number => (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d(8, 36) <= 30 || d(38, 10) <= 22 || (x > 40 && y > 30 && (x + y) % 3 !== 0)) c = 'F';
      if (d(36, 36) <= 12) c = '~';
      if (d(36, 36) > 12 && d(36, 36) <= 20) c = ',';
      if ((x - 22) * (x - 22) + (y - 33) * (y - 33) <= 5) c = 's';
      if (x >= 16 && x <= 18 && y >= 8 && y <= 10) c = 'G';
      if (x >= 27 && x <= 28 && y >= 20 && y <= 22) c = 'S';
      if ((x === 11 || x === 12) && y >= 21 && y <= 23) c = 'B';
      if ((x * 13 + y * 7) % 41 === 0 && c === '.' && x > 2 && y > 2 && !(x > 12 && x < 30 && y > 12 && y < 30)) c = 'T';
      row += c;
    }
    rows.push(row);
  }
  const units: SimConfig['scenario'] = {
    buildings: [
      { type: 'townCenter', owner: 1, tx: 19, ty: 15 },
      { type: 'house', owner: 1, tx: 14, ty: 14 },
      { type: 'house', owner: 1, tx: 24, ty: 13 },
      { type: 'barracks', owner: 1, tx: 14, ty: 19 },
      { type: 'townCenter', owner: 2, tx: 30, ty: 28 },
      { type: 'house', owner: 2, tx: 34, ty: 26 },
    ],
    units: [
      ...Array.from({ length: 8 }, (_, i) => ({ type: 'villager', owner: 1, x: 18.5 + (i % 4) * 0.9, y: 19.5 + Math.floor(i / 4) * 0.9 })),
      ...['clubman', 'bowman', 'scout', 'hoplite', 'cavalry', 'priest'].map((type, i) => ({ type, owner: 1, x: 12.5 + i * 1.2, y: 26.5 })),
      ...Array.from({ length: 6 }, (_, i) => ({ type: i % 2 ? 'axeman' : 'villager', owner: 2, x: 29.5 + i, y: 32.5 })),
      { type: 'warElephant', owner: 2, x: 27.5, y: 26.5 },
      { type: 'gazelle', owner: 0, x: 6.5, y: 12.5 },
      { type: 'gazelle', owner: 0, x: 7.3, y: 13.1 },
    ],
  };
  return { victory: 'none', seed: 7, map: { w: W, h: W, ascii: rows }, players: [{ civ: 'greek' }, { civ: 'egyptian' }], scenario: units };
}

/** A standard game start (econ:1.5, econ:8): Town Center, 3 villagers, berries, trees, gold and stone nearby. */
function start(): SimConfig {
  const W = 40;
  const rows: string[] = [];
  for (let y = 0; y < W; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      let c = '.';
      const d2 = (cx: number, cy: number): number => (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2(4, 30) <= 22 || d2(34, 8) <= 18 || (x < 3 && y < 18)) c = 'F';
      if ((x === 11 || x === 12) && y >= 23 && y <= 25) c = 'B';
      if (x >= 27 && x <= 28 && y >= 14 && y <= 16) c = 'G';
      if (x >= 12 && x <= 13 && y >= 8 && y <= 9) c = 'S';
      if ((x * 7 + y * 11) % 37 === 0 && c === '.' && d2(20, 20) > 60) c = 'T';
      // A pond to the south-east with fish along its shore.
      const pond = (x - 31) * (x - 31) + (y - 30) * (y - 30) * 1.6;
      if (pond <= 22) c = pond > 12 && (x + y) % 3 === 0 ? 'f' : '~';
      row += c;
    }
    rows.push(row);
  }
  return {
    victory: 'none',
    seed: 11,
    map: { w: W, h: W, ascii: rows },
    players: [{ civ: 'greek' }, { civ: 'egyptian' }],
    scenario: {
      buildings: [{ type: 'townCenter', owner: 1, tx: 18, ty: 18 }],
      units: [
        { type: 'villager', owner: 1, x: 21.8, y: 17.4 },
        { type: 'villager', owner: 1, x: 22.4, y: 18.3 },
        { type: 'villager', owner: 1, x: 22.1, y: 19.4 },
        // Gazelles grazing nearby, an elephant further out (econ:8).
        { type: 'gazelle', owner: 0, x: 26.5, y: 25.2 },
        { type: 'gazelle', owner: 0, x: 27.4, y: 24.6 },
        { type: 'gazelle', owner: 0, x: 26.9, y: 26.1 },
        { type: 'gazelle', owner: 0, x: 11.5, y: 14.4 },
        { type: 'elephant', owner: 0, x: 8.5, y: 20.5 },
      ],
    },
  };
}

/**
 * A Stone-age village for art review: every economy building, farms at four fill levels, foundations at several
 * stages, villagers at work, and a shore for the dock.
 */
function village(): SimConfig {
  const W = 36;
  const rows: string[] = [];
  for (let y = 0; y < W; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      let c = x >= 29 ? '~' : '.';
      if (x < 3 && y < 20) c = 'F';
      if (x >= 22 && x <= 23 && y >= 4 && y <= 5) c = 'T';
      row += c;
    }
    rows.push(row);
  }
  return {
    victory: 'none',
    seed: 5,
    map: { w: W, h: W, ascii: rows },
    players: [{ civ: 'greek' }, { civ: 'egyptian' }],
    startingResources: 'high',
    scenario: {
      buildings: [
        { type: 'townCenter', owner: 1, tx: 14, ty: 14 },
        { type: 'granary', owner: 1, tx: 9, ty: 17 },
        { type: 'storagePit', owner: 1, tx: 19, ty: 9 },
        { type: 'barracks', owner: 1, tx: 20, ty: 18 },
        { type: 'dock', owner: 1, tx: 28, ty: 14 },
        { type: 'house', owner: 1, tx: 11, ty: 11 },
        { type: 'house', owner: 1, tx: 14, ty: 10 },
        { type: 'farm', owner: 1, tx: 6, ty: 21, stock: 250 },
        { type: 'farm', owner: 1, tx: 9, ty: 21, stock: 170 },
        { type: 'farm', owner: 1, tx: 6, ty: 24, stock: 100 },
        { type: 'farm', owner: 1, tx: 9, ty: 24, stock: 30 },
        { type: 'house', owner: 1, tx: 17, ty: 22, progress: 0.35 },
        { type: 'granary', owner: 1, tx: 13, ty: 24, progress: 0.7 },
        { type: 'barracks', owner: 1, tx: 22, ty: 23, progress: 0.05 },
      ],
      units: [
        { type: 'villager', owner: 1, x: 7.5, y: 22.5 },
        { type: 'villager', owner: 1, x: 10.4, y: 22.2 },
        { type: 'villager', owner: 1, x: 18.2, y: 21.6 },
        { type: 'villager', owner: 1, x: 21.6, y: 6.2 },
        { type: 'villager', owner: 1, x: 12.6, y: 23.6 },
      ],
    },
  };
}

/**
 * A harbor (M8): a coast with a Dock, fishing boats, shore fish along the beach and deep fish out at sea — for the
 * water tasks' tests and screenshots. `battle=1` adds a War Galley and an enemy Scout Ship out at sea; `ferry=1` a
 * Light Transport at the shore and three clubmen to carry down the coast; `trade=1` a Trade Boat and a second
 * player's Dock down the coast to trade with.
 */
function harbor(p: URLSearchParams): SimConfig {
  const W = 32;
  const rows: string[] = [];
  for (let y = 0; y < W; y++) {
    let row = '';
    for (let x = 0; x < W; x++) row += x < 14 ? '.' : x === 14 && y % 5 === 2 && (y < 13 || y > 17) ? 'f' : x >= 24 ? 'w' : '~';
    rows.push(row);
  }
  return {
    victory: 'none',
    seed: 8,
    map: { w: W, h: W, ascii: rows },
    players: [{ civ: 'greek' }, { civ: 'egyptian' }],
    startingResources: 'high',
    scenario: {
      buildings: [
        { type: 'townCenter', owner: 1, tx: 5, ty: 14 },
        { type: 'dock', owner: 1, tx: 14, ty: 14 },
        ...(p.get('trade') === '1' ? [{ type: 'dock', owner: 2, tx: 14, ty: 27 }] : []),
      ],
      units: [
        { type: 'fishingBoat', owner: 1, x: 18.5, y: 12.5 },
        { type: 'villager', owner: 1, x: 12.5, y: 7.5 },
        ...(p.get('battle') === '1'
          ? [
              { type: 'warGalley', owner: 1, x: 19.5, y: 9.5 },
              { type: 'scoutShip', owner: 2, x: 27.5, y: 9.5 },
            ]
          : []),
        ...(p.get('trade') === '1' ? [{ type: 'tradeBoat', owner: 1, x: 18.5, y: 16.5 }] : []),
        ...(p.get('ferry') === '1'
          ? [
              { type: 'lightTransport', owner: 1, x: 14.6, y: 4.5 },
              { type: 'clubman', owner: 1, x: 11.5, y: 3.5 },
              { type: 'clubman', owner: 1, x: 11.5, y: 5.0 },
              { type: 'clubman', owner: 1, x: 12.5, y: 4.2 },
            ]
          : []),
      ],
      resources: [
        { kind: 'deepFish', tx: 20, ty: 8 },
        { kind: 'deepFish', tx: 21, ty: 19 },
        { kind: 'deepFish', tx: 18, ty: 25 },
      ],
    },
  };
}

/** A raid: clubmen fall on an enemy camp — for combat review (corpses, rubble, HP bars). */
function raid(): SimConfig {
  const W = 32;
  return {
    victory: 'none',
    seed: 9,
    map: { w: W, h: W },
    players: [{ civ: 'greek' }, { civ: 'egyptian' }],
    scenario: {
      buildings: [
        { type: 'barracks', owner: 1, tx: 2, ty: 3 },
        { type: 'archeryRange', owner: 1, tx: 2, ty: 8 },
        { type: 'stable', owner: 1, tx: 6, ty: 2 },
        { type: 'watchTower', owner: 1, tx: 6, ty: 13 },
        { type: 'townCenter', owner: 2, tx: 18, ty: 17 },
        { type: 'house', owner: 2, tx: 14, ty: 14 },
        { type: 'house', owner: 2, tx: 22, ty: 13 },
      ],
      units: [
        ...[0, 1, 2, 3, 4, 5].map((i) => ({ type: 'clubman', owner: 1, x: 9.5 + (i % 3) * 0.8, y: 10.5 + Math.floor(i / 3) * 0.8 })),
        ...[0, 1, 2].map((i) => ({ type: 'bowman', owner: 1, x: 13.5 + i * 0.8, y: 22.5 })),
        { type: 'scout', owner: 1, x: 9.5, y: 7.5 },
        { type: 'scout', owner: 1, x: 10.5, y: 7.9 },
        ...[0, 1, 2, 3].map((i) => ({ type: 'villager', owner: 2, x: 15.5 + i * 0.9, y: 17.5 })),
      ],
    },
  };
}

/**
 * Walls and towers for review (M7.2): each wall level as a straight run along both tile axes, a dragged diagonal
 * (Bresenham steps), an L corner and a closed square; the four tower levels in a row.
 */
function fort(): SimConfig {
  const walls: { type: string; owner: number; tx: number; ty: number }[] = [];
  const add = (type: string, tiles: [number, number][]) => tiles.forEach(([tx, ty]) => walls.push({ type, owner: 1, tx, ty }));
  const levels = ['smallWall', 'mediumWall', 'fortification'];
  levels.forEach((lv, i) => {
    const ox = 3 + i * 9;
    add(lv, wallLine(ox, 3, ox + 6, 3)); // along x
    add(lv, wallLine(ox, 5, ox, 11)); // along y
    add(lv, wallLine(ox + 2, 6, ox + 7, 9)); // dragged at an angle
    add(lv, [...wallLine(ox + 2, 12, ox + 6, 12), ...wallLine(ox + 6, 13, ox + 6, 16), ...wallLine(ox + 2, 16, ox + 5, 16), ...wallLine(ox + 2, 13, ox + 2, 15)]); // closed square
  });
  return {
    victory: 'none',
    seed: 4,
    map: { w: 32, h: 32 },
    players: [{ civ: 'greek' }, { civ: 'egyptian' }],
    scenario: {
      buildings: [
        ...walls,
        { type: 'watchTower', owner: 1, tx: 4, ty: 22 },
        { type: 'sentryTower', owner: 1, tx: 9, ty: 22 },
        { type: 'guardTower', owner: 1, tx: 14, ty: 22 },
        { type: 'ballistaTower', owner: 1, tx: 19, ty: 22 },
      ],
      units: [{ type: 'villager', owner: 1, x: 10.5, y: 26.5 }],
    },
  };
}

/** Siege for review (M7.3): every engine facing an enemy camp across the field, and a Siege Workshop. */
function siege(): SimConfig {
  const engines = ['stoneThrower', 'catapult', 'heavyCatapult', 'ballista', 'helepolis'];
  return {
    victory: 'none',
    seed: 6,
    map: { w: 32, h: 32 },
    players: [{ civ: 'greek' }, { civ: 'egyptian' }],
    startingResources: 'deathmatch',
    scenario: {
      buildings: [
        { type: 'siegeWorkshop', owner: 1, tx: 3, ty: 3 },
        { type: 'townCenter', owner: 2, tx: 22, ty: 14 },
        { type: 'house', owner: 2, tx: 20, ty: 10 },
        { type: 'house', owner: 2, tx: 23, ty: 20 },
        { type: 'barracks', owner: 2, tx: 26, ty: 9 },
      ],
      units: [
        ...engines.map((type, i) => ({ type, owner: 1, x: 8.5 + (i % 3) * 1.6, y: 10.5 + i * 2.2 })),
        ...[0, 1, 2].map((i) => ({ type: 'clubman', owner: 2, x: 19.5 + i * 0.8, y: 16.5 })),
      ],
    },
  };
}

/** Every land unit in ranks for art review (M7.4): infantry, archers, mounted, siege — player 1 facing player 2. */
function army(): SimConfig {
  const rows = [
    ['clubman', 'axeman', 'shortSwordsman', 'broadSwordsman', 'longSwordsman', 'legion'],
    ['hoplite', 'phalanx', 'centurion', 'slinger', 'priest'],
    ['bowman', 'improvedBowman', 'compositeBowman', 'chariotArcher', 'horseArcher', 'heavyHorseArcher', 'elephantArcher'],
    ['scout', 'cavalry', 'heavyCavalry', 'cataphract', 'camel', 'chariot', 'scytheChariot', 'warElephant', 'armoredElephant'],
  ];
  const units = rows.flatMap((row, r) => row.map((type, i) => ({ type, owner: 1, x: 6.5 + i * 1.6, y: 6.5 + r * 2.4 })));
  units.push(...rows[0]!.map((type, i) => ({ type, owner: 2, x: 6.5 + i * 1.6, y: 18.5 })));
  return { victory: 'none', seed: 12, map: { w: 32, h: 32 }, players: [{ civ: 'greek' }, { civ: 'roman' }], scenario: { units } };
}

/** Priests for review (M7.5): a temple, priests beside wounded soldiers, and enemies across the field. */
function templeScene(): SimConfig {
  return {
    victory: 'none',
    seed: 13,
    map: { w: 32, h: 32 },
    players: [{ civ: 'egyptian' }, { civ: 'greek' }],
    startingResources: 'deathmatch',
    scenario: {
      buildings: [{ type: 'temple', owner: 1, tx: 5, ty: 5 }],
      units: [
        ...[0, 1, 2].map((i) => ({ type: 'priest', owner: 1, x: 10.5 + i * 1.2, y: 9.5 })),
        ...[0, 1].map((i) => ({ type: 'axeman', owner: 1, x: 10.5 + i * 1.2, y: 11.2 })),
        ...[0, 1, 2].map((i) => ({ type: 'clubman', owner: 2, x: 18.5 + i * 1.2, y: 12.5 })),
      ],
    },
  };
}

/** The Wonder for review (M7.7): one standing, one rising with its builders. */
/**
 * Diplomacy (M12.3): us (Greek, with a Market) and an ally (Persian, team 1) against an Egyptian neighbour whose
 * villagers and soldiers stand close to ours — for the Diplomacy dialog, Neutral behaviour and tribute.
 */
function diplomacyScene(): SimConfig {
  return {
    victory: 'none',
    seed: 23,
    map: { w: 40, h: 40 },
    players: [{ civ: 'greek', team: 1 }, { civ: 'egyptian', team: 2 }, { civ: 'persian', team: 1 }],
    scenario: {
      buildings: [
        { type: 'townCenter', owner: 1, tx: 6, ty: 6 },
        { type: 'market', owner: 1, tx: 11, ty: 5 },
        { type: 'townCenter', owner: 2, tx: 22, ty: 14 },
        { type: 'townCenter', owner: 3, tx: 30, ty: 30 },
      ],
      units: [
        ...[0, 1, 2].map((i) => ({ type: 'villager', owner: 1, x: 9.5 + i, y: 11.5 })),
        ...[0, 1].map((i) => ({ type: 'clubman', owner: 1, x: 16.5 + i * 0.8, y: 12.2 })),
        ...[0, 1].map((i) => ({ type: 'villager', owner: 2, x: 19.5 + i, y: 13.2 })),
        { type: 'clubman', owner: 2, x: 20.5, y: 18.5 },
        ...[0, 1].map((i) => ({ type: 'villager', owner: 3, x: 29.5 + i, y: 28.5 })),
      ],
    },
  };
}

function wonderScene(): SimConfig {
  return {
    victory: 'none',
    seed: 17,
    map: { w: 32, h: 32 },
    players: [{ civ: 'greek' }, { civ: 'persian' }],
    startingResources: 'deathmatch',
    scenario: {
      buildings: [
        { type: 'wonder', owner: 1, tx: 6, ty: 6 },
        { type: 'wonder', owner: 1, tx: 14, ty: 14, progress: 0.45 },
        { type: 'townCenter', owner: 1, tx: 5, ty: 15 },
      ],
      units: Array.from({ length: 6 }, (_, i) => ({ type: 'villager', owner: 1, x: 13.5 + (i % 3) * 1.3, y: 20.2 + Math.floor(i / 3) })),
    },
  };
}

/**
 * Ruins and Artifacts (M14.1): unclaimed and owned ones, a scout beside the free Artifact and an enemy clubman
 * beside our unguarded Ruins — a second of play hands both over.
 */
function relicsScene(): SimConfig {
  return {
    victory: 'none',
    seed: 29,
    map: { w: 32, h: 32 },
    players: [{ civ: 'greek' }, { civ: 'persian' }],
    scenario: {
      buildings: [
        { type: 'ruins', owner: 0, tx: 6, ty: 6 },
        { type: 'ruins', owner: 1, tx: 12, ty: 6 },
        { type: 'artifact', owner: 0, tx: 18, ty: 8 },
        { type: 'artifact', owner: 2, tx: 12, ty: 13 },
        { type: 'townCenter', owner: 1, tx: 4, ty: 14 },
      ],
      units: [
        { type: 'scout', owner: 1, x: 19.5, y: 10 },
        { type: 'clubman', owner: 2, x: 14.9, y: 7.5 },
        { type: 'villager', owner: 2, x: 12.5, y: 14.9 },
      ],
    },
  };
}

/**
 * Standard victory (M14.2): our finished Wonder and player 2's hold on both Artifacts run their clocks at the upper
 * right; the Ruins are still free.
 */
function countdownScene(): SimConfig {
  return {
    victory: 'standard',
    seed: 31,
    map: { w: 40, h: 40 },
    players: [{ civ: 'greek' }, { civ: 'persian' }],
    scenario: {
      buildings: [
        { type: 'wonder', owner: 1, tx: 8, ty: 8 },
        { type: 'townCenter', owner: 1, tx: 3, ty: 16 },
        { type: 'townCenter', owner: 2, tx: 32, ty: 30 },
        { type: 'artifact', owner: 2, tx: 18, ty: 10 },
        { type: 'artifact', owner: 2, tx: 22, ty: 16 },
        { type: 'ruins', owner: 0, tx: 16, ty: 20 },
      ],
      units: [{ type: 'scout', owner: 2, x: 23.5, y: 18 }],
    },
  };
}

/**
 * Art gallery (M9): every building of one civilization (`civ`, default greek) and the wild animals, laid out for
 * review. The owner's age decides the building variants (grant ages with `__empires.grantTech`).
 */
function gallery(p: URLSearchParams): SimConfig {
  const W = 40;
  const H = 34;
  const rows: string[] = [];
  for (let y = 0; y < H; y++) rows.push('.'.repeat(36) + '~~~~');
  const row = (ty: number, types: string[], step = 5) => types.map((type, i) => ({ type, owner: 1, tx: 2 + i * step, ty }));
  return {
    victory: 'none',
    seed: 21,
    map: { w: W, h: H, ascii: rows },
    players: [{ civ: p.get('civ') ?? 'greek' }, { civ: 'egyptian' }],
    startingResources: 'deathmatch',
    scenario: {
      buildings: [
        ...row(2, ['townCenter', 'house', 'granary', 'storagePit', 'barracks', 'market', 'archeryRange']),
        { type: 'dock', owner: 1, tx: 36, ty: 3 },
        ...row(8, ['stable', 'farm', 'governmentCenter', 'temple', 'siegeWorkshop', 'academy']),
        { type: 'wonder', owner: 1, tx: 2, ty: 14 },
        ...row(15, ['watchTower', 'sentryTower', 'guardTower', 'ballistaTower'], 4).map((b) => ({ ...b, tx: b.tx + 7 })),
        ...[0, 1, 2, 3, 4, 5].map((i) => ({ type: i < 3 ? 'smallWall' : 'mediumWall', owner: 1, tx: 26 + i, ty: 16 })),
      ],
      units: ['gazelle', 'elephant', 'lion', 'alligator'].map((type, i) => ({ type, owner: 0, x: 4.5 + i * 3, y: 23.5 })),
    },
  };
}

/**
 * Hills for review (M10.1b): a stepped hill (a level-3 plateau, one level per ring) with a House on top, bowmen
 * on the crest over clubmen on the plain, trees on the slope, a Town Center below.
 */
function hillsScene(): SimConfig {
  const W = 32;
  let heights = '';
  for (let y = 0; y <= W; y++) {
    for (let x = 0; x <= W; x++) {
      const d = Math.max(Math.abs(x - 11), Math.abs(y - 11)); // square rings round the plateau (corners 8–14)
      heights += String(Math.max(0, Math.min(3, 6 - d)));
    }
  }
  const rows: string[] = [];
  for (let y = 0; y < W; y++) {
    let row = '';
    for (let x = 0; x < W; x++) row += (x === 7 && y >= 9 && y <= 13) || (y === 7 && x >= 10 && x <= 13) ? 'T' : '.';
    rows.push(row);
  }
  return {
    victory: 'none',
    seed: 23,
    map: { w: W, h: W, ascii: rows, heights },
    players: [{ civ: 'greek' }, { civ: 'persian' }],
    startingResources: 'deathmatch',
    scenario: {
      buildings: [
        { type: 'house', owner: 1, tx: 10, ty: 10 },
        { type: 'townCenter', owner: 1, tx: 20, ty: 20 },
      ],
      units: [
        ...[0, 1, 2].map((i) => ({ type: 'bowman', owner: 1, x: 12.5 + i * 0.9, y: 13.2 })),
        ...[0, 1, 2].map((i) => ({ type: 'clubman', owner: 2, x: 12.5 + i * 1.1, y: 18.5 })),
        { type: 'villager', owner: 1, x: 16.5, y: 11.5 },
      ],
    },
  };
}

/** Many units on an open map, for render performance. */
function crowd(n: number): SimConfig {
  const W = 96;
  const units = Array.from({ length: n }, (_, i) => ({
    type: ['villager', 'clubman', 'bowman', 'scout', 'hoplite'][i % 5]!,
    owner: 1 + (i % 2),
    x: 10.5 + (i % 40) * 1.6,
    y: 10.5 + Math.floor(i / 40) * 1.6,
  }));
  // Allies, so the crowd stays a render benchmark rather than a battle.
  return { seed: 3, victory: 'none', map: { w: W, h: W }, players: [{ civ: 'greek', team: 1 }, { civ: 'persian', team: 1 }], scenario: { units } };
}

/** A generated random map: ?scenario=map&type=<GEN_MAP_TYPES>&size=tiny…gigantic&seed=N&players=N. */
function randomMap(p: URLSearchParams): SimConfig {
  const type = ((GEN_MAP_TYPES as readonly string[]).includes(p.get('type') ?? '') ? p.get('type') : 'continental') as GenMapType;
  const size = (p.get('size') ?? 'small') as MapSizeId;
  const n = Math.max(2, Math.min(8, Number(p.get('players') ?? 2)));
  const civs = ['greek', 'egyptian', 'persian', 'babylonian', 'yamato', 'hittite', 'roman', 'shang'];
  return generateMap({
    seed: Number(p.get('seed') ?? 1),
    type,
    size: size in MAP_SIZES ? size : 'small',
    players: Array.from({ length: n }, (_, i) => ({ civ: civs[i % civs.length]! })),
    hills: p.get('hills') === '1',
    relics: p.get('relics') === '1',
    alligators: p.get('gators') === '1',
  });
}

export const SCENARIOS: Record<string, (p: URLSearchParams) => SimConfig> = {
  map: randomMap,
  skirmish: (p) => skirmishConfig(setupFromQuery(p)),
  demo,
  start,
  village,
  harbor,
  raid,
  fort,
  siege,
  army,
  temple: templeScene,
  wonder: wonderScene,
  diplomacy: diplomacyScene,
  relics: relicsScene,
  countdowns: countdownScene,
  gallery,
  hills: hillsScene,
  battle: () => battleConfig(1),
  crowd: () => crowd(1000),
};
