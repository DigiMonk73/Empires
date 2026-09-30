import type { SimConfig } from '../sim/index.ts';

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
  return { seed: 7, map: { w: W, h: W, ascii: rows }, players: [{ civ: 'greek' }, { civ: 'egyptian' }], scenario: units };
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

/** A raid: clubmen fall on an enemy camp — for combat review (corpses, rubble, HP bars). */
function raid(): SimConfig {
  const W = 32;
  return {
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
  return { seed: 3, map: { w: W, h: W }, players: [{ civ: 'greek', team: 1 }, { civ: 'persian', team: 1 }], scenario: { units } };
}

export const SCENARIOS: Record<string, () => SimConfig> = {
  demo,
  start,
  village,
  raid,
  crowd: () => crowd(1000),
};
