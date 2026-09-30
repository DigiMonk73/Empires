import * as THREE from 'three';
import { box, build, cone, cyl, gable, lumpy, seeded, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import type { ModelDef } from './types.ts';

/**
 * Buildings. Each type is a parametric recipe; the footprint square spans [−s/2, s/2] on X and Z (world tiles)
 * and the building must stay inside it. Stone-age look first (huts, thatch, timber); later ages and the five
 * architecture sets (Egyptian, Greek, Babylonian, Asian, Roman) extend these recipes in M6/M9.
 */

/** A round hut: mud/plaster wall ring, thatch cone roof, a team band under the eaves, and a door toward the viewer. */
function hut(r: number, wallH: number, roofH: number, seed: number): NodeSpec[] {
  const rnd = seeded(seed);
  const doorA = Math.PI / 4 + (rnd() - 0.5) * 0.4; // toward the viewer (+x+z)
  const kids: NodeSpec[] = [
    { geom: cyl(r, r * 1.04, wallH, 18), mat: 'mudbrick', t: [0, wallH / 2, 0] },
    { geom: cyl(r * 1.06, r * 1.07, 0.07, 18), mat: 'team', t: [0, wallH * 0.42, 0] },
    { geom: cone(r * 1.28, roofH, 18), mat: 'thatch', t: [0, wallH + roofH / 2 - 0.02, 0] },
    { geom: cyl(0.03, 0.04, 0.14, 6), mat: 'wood', t: [0, wallH + roofH + 0.03, 0] },
  ];
  // Door: a dark recess and a timber lintel on the wall facing the viewer.
  const dx = Math.cos(doorA) * r;
  const dz = Math.sin(doorA) * r;
  kids.push(
    { geom: box(0.05, wallH * 0.62, 0.2), mat: 'dirt', t: [dx * 1.01, wallH * 0.31, dz * 1.01], r: [0, -doorA, 0] },
    { geom: box(0.06, 0.04, 0.26), mat: 'wood', t: [dx * 1.03, wallH * 0.64, dz * 1.03], r: [0, -doorA, 0] },
  );
  return kids;
}

function post(x: number, z: number, h: number): NodeSpec {
  return { geom: cyl(0.025, 0.03, h, 6), mat: 'wood', t: [x, h / 2, z] };
}

function banner(x: number, z: number, h: number): NodeSpec {
  return {
    t: [x, 0, z],
    children: [
      { geom: cyl(0.018, 0.022, h, 6), mat: 'wood', t: [0, h / 2, 0] },
      { geom: box(0.012, 0.2, 0.16), mat: 'team', t: [0.01, h - 0.13, 0.085] },
    ],
  };
}

function firePit(x: number, z: number): NodeSpec {
  const stones: NodeSpec[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    stones.push({ geom: lumpy(0.035, 0.3, 90 + i, 0), mat: 'rock', t: [Math.cos(a) * 0.1, 0.02, Math.sin(a) * 0.1] });
  }
  return { t: [x, 0, z], children: [...stones, { geom: sphere(0.05, 6), mat: 'bark', t: [0, 0.02, 0], s: [1, 0.4, 1] }] };
}

function house(): THREE.Object3D {
  return build({
    children: [
      ...hut(0.6, 0.4, 0.55, 3),
      { geom: cyl(0.07, 0.06, 0.1, 8), mat: 'mudbrick', t: [0.72, 0.05, -0.35] },
      { geom: cyl(0.05, 0.045, 0.08, 8), mat: 'mudbrick', t: [0.78, 0.04, -0.2] },
      post(-0.8, 0.8, 0.22),
      post(-0.55, 0.85, 0.2),
    ],
  });
}

function townCenter(): THREE.Object3D {
  const kids: NodeSpec[] = [
    // Great hut, set back from the front corner.
    { t: [-0.15, 0, -0.15], children: hut(0.92, 0.55, 0.85, 11) },
    // Storage hut at the back left.
    { t: [-0.95, 0, 0.75], children: hut(0.36, 0.3, 0.38, 12) },
    // Raised granary platform at the back right.
    {
      t: [0.8, 0, -0.95],
      children: [
        post(-0.18, -0.18, 0.28),
        post(0.18, -0.18, 0.28),
        post(-0.18, 0.18, 0.28),
        post(0.18, 0.18, 0.28),
        { geom: box(0.46, 0.05, 0.46), mat: 'planks', t: [0, 0.28, 0] },
        { geom: cone(0.36, 0.3, 4), mat: 'thatch', t: [0, 0.46, 0], r: [0, Math.PI / 4, 0] },
      ],
    },
    firePit(0.85, 0.85),
    banner(1.3, 0.35, 0.62),
    banner(0.35, 1.3, 0.62),
  ];
  // Palisade posts along the back edges.
  const r = seeded(77);
  for (let i = 0; i < 9; i++) {
    const t = -1.35 + i * 0.3;
    kids.push(post(t, -1.38, 0.2 + r() * 0.08), post(-1.38, t, 0.2 + r() * 0.08));
  }
  return build({ children: kids });
}

const WHEAT: MatSpec = { tex: 'thatch', color: 0xc9a444, rough: 1, repeat: 8 };
const EARS: MatSpec = { tex: 'thatch', color: 0xe8c860, rough: 1, repeat: 10 };
const STUBBLE: MatSpec = { tex: 'thatch', color: 0x7e663a, rough: 1, repeat: 8 };
const SOIL: MatSpec = { tex: 'plain', color: 0x7a5434, rough: 1 };
const SOIL_DARK: MatSpec = { tex: 'plain', color: 0x5e3e24, rough: 1 };
const GRAIN: MatSpec = { tex: 'cloth', color: 0xd8c898, rough: 0.95, repeat: 4 };

/** A pile of logs lying along X. */
function logPile(x: number, z: number, n: number, seed: number): NodeSpec {
  const r = seeded(seed);
  const kids: NodeSpec[] = [];
  let k = 0;
  for (let row = 0; k < n; row++) {
    for (let i = 0; i < 4 - row && k < n; i++, k++) {
      kids.push({ geom: cyl(0.045, 0.045, 0.5 + r() * 0.12, 7), mat: 'bark', t: [0, 0.045 + row * 0.08, (i - (3 - row) / 2) * 0.095], r: [0, 0, Math.PI / 2] });
    }
  }
  return { t: [x, 0, z], r: [0, r() * 0.4, 0], children: kids };
}

/** A heap of rocks (stone) or ore (gold). */
function heap(x: number, z: number, mat: 'rock' | 'goldOre', n: number, seed: number): NodeSpec {
  const r = seeded(seed);
  const kids: NodeSpec[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 0.12;
    kids.push({ geom: lumpy(0.05 + r() * 0.03, 0.35, seed * 10 + i, 0), mat, t: [Math.cos(a) * d, 0.04 + (i > n / 2 ? 0.05 : 0), Math.sin(a) * d] });
  }
  return { t: [x, 0, z], children: kids };
}

function sack(x: number, z: number, s = 1): NodeSpec {
  return { t: [x, 0, z], children: [{ geom: sphere(0.07 * s, 8), mat: GRAIN, t: [0, 0.06 * s, 0], s: [1, 1.15, 1] }, { geom: cyl(0.02 * s, 0.03 * s, 0.04 * s, 6), mat: GRAIN, t: [0, 0.14 * s, 0] }] };
}

/** A raised round grain bin: stilts, a mud drum, a thatch cap. */
function bin(x: number, z: number, r: number, h: number): NodeSpec {
  return {
    t: [x, 0, z],
    children: [
      post(-r * 0.6, -r * 0.6, 0.16),
      post(r * 0.6, -r * 0.6, 0.16),
      post(-r * 0.6, r * 0.6, 0.16),
      post(r * 0.6, r * 0.6, 0.16),
      { geom: cyl(r * 1.05, r * 1.05, 0.04, 14), mat: 'planks', t: [0, 0.17, 0] },
      { geom: cyl(r, r * 0.92, h, 14), mat: 'mudbrick', t: [0, 0.19 + h / 2, 0] },
      { geom: cyl(r * 1.02, r * 1.02, 0.05, 14), mat: 'team', t: [0, 0.19 + h * 0.7, 0] },
      { geom: cone(r * 1.3, r * 1.1, 14), mat: 'thatch', t: [0, 0.19 + h + r * 0.5, 0] },
    ],
  };
}

/** Granary (Stone age): raised grain bins on stilts, sacks and baskets, a low fence at the back. */
function granary(): THREE.Object3D {
  const kids: NodeSpec[] = [
    bin(-0.55, -0.45, 0.42, 0.5),
    bin(0.55, -0.6, 0.36, 0.42),
    bin(-0.6, 0.62, 0.34, 0.4),
    // A ladder up to the big bin.
    { t: [-0.05, 0, -0.1], r: [0, Math.PI / 4, 0], children: [
      { geom: box(0.03, 0.62, 0.03), mat: 'wood', t: [0, 0.3, -0.08], r: [0, 0, 0.35] },
      { geom: box(0.03, 0.62, 0.03), mat: 'wood', t: [0, 0.3, 0.08], r: [0, 0, 0.35] },
      ...[0.12, 0.26, 0.4, 0.54].map((y): NodeSpec => ({ geom: box(0.025, 0.025, 0.18), mat: 'wood', t: [0.1 - y * 0.34, y, 0] })),
    ] },
    sack(0.45, 0.35),
    sack(0.62, 0.45, 0.9),
    sack(0.5, 0.58, 0.85),
    { geom: cyl(0.1, 0.08, 0.1, 10), mat: 'thatch', t: [0.2, 0.05, 0.75] },
    { geom: sphere(0.08, 8), mat: 'berries', t: [0.2, 0.1, 0.75], s: [1, 0.4, 1] },
    banner(1.2, 1.2, 0.6),
  ];
  const r = seeded(41);
  for (let i = 0; i < 8; i++) kids.push(post(-1.35 + i * 0.36, -1.38, 0.16 + r() * 0.06), post(-1.38, -1.35 + i * 0.36, 0.16 + r() * 0.06));
  return build({ children: kids });
}

/** Storage Pit (Stone age): a dug pit under a thatched roof on posts, with wood, stone and gold stacked beside it. */
function storagePit(): THREE.Object3D {
  const roof: NodeSpec = {
    t: [-0.2, 0, -0.25],
    children: [
      post(-0.75, -0.45, 0.5),
      post(0.75, -0.45, 0.5),
      post(-0.75, 0.45, 0.5),
      post(0.75, 0.45, 0.5),
      post(0, -0.45, 0.5),
      post(0, 0.45, 0.5),
      { geom: box(1.65, 0.04, 0.05), mat: 'wood', t: [0, 0.5, -0.45] },
      { geom: box(1.65, 0.04, 0.05), mat: 'wood', t: [0, 0.5, 0.45] },
      { geom: gable(1.8, 1.25, 0.5), mat: 'thatch', t: [0, 0.5, 0] },
      { geom: box(1.84, 0.06, 0.06), mat: 'team', t: [0, 0.52, 0.62] },
      // The pit: a dark floor ringed by a raised mud lip.
      { geom: cyl(0.62, 0.62, 0.02, 20), mat: 'dirt', t: [0, 0.012, 0], s: [1.15, 1, 0.62] },
      { geom: cyl(0.7, 0.72, 0.06, 20, ), mat: 'mudbrick', t: [0, 0.03, 0], s: [1.15, 1, 0.62] },
      { geom: cyl(0.6, 0.6, 0.08, 20), mat: 'dirt', t: [0, 0.035, 0], s: [1.15, 1, 0.62] },
    ],
  };
  return build({
    children: [roof, logPile(0.75, -0.55, 7, 5), heap(0.8, 0.45, 'rock', 7, 6), heap(0.35, 0.95, 'goldOre', 5, 7), logPile(-0.95, 0.85, 4, 8)],
  });
}

/** Barracks (Stone age): a thatched longhouse with a spear rack, a practice post and team banners. */
function barracks(): THREE.Object3D {
  const L = 1.75;
  const D = 0.95;
  const longhouse: NodeSpec = {
    t: [-0.2, 0, -0.35],
    children: [
      { geom: box(L, 0.42, D), mat: 'mudbrick', t: [0, 0.21, 0] },
      { geom: box(L + 0.02, 0.06, D + 0.02), mat: 'team', t: [0, 0.36, 0] },
      { geom: gable(L + 0.25, D + 0.35, 0.62), mat: 'thatch', t: [0, 0.42, 0] },
      { geom: box(0.05, 0.3, 0.22), mat: 'dirt', t: [L / 2 + 0.005, 0.15, 0] },
      { geom: box(0.07, 0.04, 0.3), mat: 'wood', t: [L / 2 + 0.02, 0.32, 0] },
      { geom: box(0.22, 0.26, 0.05), mat: 'dirt', t: [0.3, 0.13, D / 2 + 0.005] },
      { geom: box(0.22, 0.26, 0.05), mat: 'dirt', t: [-0.4, 0.13, D / 2 + 0.005] },
    ],
  };
  const spears: NodeSpec[] = [];
  for (let i = 0; i < 5; i++) {
    spears.push({ geom: cyl(0.012, 0.012, 0.7, 5), mat: 'wood', t: [i * 0.08 - 0.16, 0.34, 0.02], r: [0.12, 0, 0] }, { geom: cone(0.02, 0.07, 5), mat: 'bronze', t: [i * 0.08 - 0.16, 0.72, 0.065], r: [0.12, 0, 0] });
  }
  return build({
    children: [
      longhouse,
      // Spear rack.
      { t: [0.95, 0, -0.2], r: [0, Math.PI / 4, 0], children: [post(-0.25, 0, 0.4), post(0.25, 0, 0.4), { geom: box(0.56, 0.035, 0.035), mat: 'wood', t: [0, 0.3, 0] }, ...spears] },
      // Practice post with a straw target.
      { t: [0.75, 0, 0.95], children: [post(0, 0, 0.55), { geom: cyl(0.09, 0.09, 0.22, 8), mat: 'thatch', t: [0, 0.4, 0] }, { geom: box(0.35, 0.03, 0.03), mat: 'wood', t: [0, 0.42, 0] }] },
      banner(1.25, 0.35, 0.7),
      banner(0.35, 1.25, 0.7),
      firePit(-0.9, 0.9),
    ],
  });
}

/** Dock (Stone age): a timber deck on piles over the water, a net-drying rack and a thatched boat shed. */
function dock(): THREE.Object3D {
  const deckY = 0.1;
  const kids: NodeSpec[] = [];
  // Piles.
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) kids.push({ geom: cyl(0.04, 0.045, deckY + 0.3, 6), mat: 'bark', t: [-1.2 + i * 0.8, (deckY - 0.3) / 2 + 0.15, -1.2 + j * 0.8] });
  // Planks across the deck.
  const r = seeded(19);
  for (let i = 0; i < 13; i++) kids.push({ geom: box(2.7, 0.04, 0.19), mat: 'planks', t: [0, deckY + 0.02 + (r() - 0.5) * 0.01, -1.26 + i * 0.21] });
  kids.push(
    // Boat shed at the back.
    { t: [-0.45, deckY, -0.6], children: [
      post(-0.5, -0.35, 0.38), post(0.5, -0.35, 0.38), post(-0.5, 0.35, 0.38), post(0.5, 0.35, 0.38),
      { geom: gable(1.2, 0.95, 0.4), mat: 'thatch', t: [0, 0.38, 0] },
      { geom: box(1.22, 0.05, 0.05), mat: 'team', t: [0, 0.4, 0.48] },
    ] },
    // Net-drying rack.
    { t: [0.65, deckY, -0.2], r: [0, Math.PI / 4, 0], children: [post(-0.3, 0, 0.36), post(0.3, 0, 0.36), { geom: box(0.62, 0.02, 0.02), mat: 'wood', t: [0, 0.36, 0] }, { geom: box(0.56, 0.24, 0.01), mat: { tex: 'cloth', color: 0x8a7a5a, rough: 1, repeat: 10 }, t: [0, 0.24, 0] }] },
    // Mooring posts and a coil of rope at the front edge.
    post(1.3, 1.3, deckY + 0.22),
    post(1.3, 0.3, deckY + 0.22),
    post(0.3, 1.3, deckY + 0.22),
    { geom: cyl(0.07, 0.07, 0.04, 10), mat: 'leather', t: [0.9, deckY + 0.06, 1.0] },
    { t: [0, deckY + 0.04, 0], children: [sack(-0.2, 0.8, 0.8), sack(0.8, -0.9, 0.8)] },
    banner(1.1, -1.2, 0.65),
  );
  return build({ children: kids });
}

/**
 * Farm: a 3×3 tilled field with rows of wheat. Variant = stage by food left (v0 full … v3 nearly harvested):
 * later stages lose tufts row by row and the rest turns to stubble.
 */
function farm(stage: number): THREE.Object3D {
  const kids: NodeSpec[] = [{ geom: box(2.84, 0.03, 2.84), mat: SOIL, t: [0, 0.015, 0] }];
  const keep = [1, 0.7, 0.42, 0.16][stage]!;
  const rnd = seeded(5);
  const rows = 8;
  for (let i = 0; i < rows; i++) {
    const z = -1.22 + i * (2.44 / (rows - 1));
    kids.push({ geom: box(2.7, 0.03, 0.2), mat: SOIL_DARK, t: [0, 0.035, z] }); // the furrow ridge
    // Harvest runs row by row from the front (+z) with a ragged edge; each row is cut from its +x end.
    const rowKeep = Math.min(1, Math.max(0, keep * rows - (rows - 1 - i) + (rnd() - 0.5) * 0.4));
    const len = 2.6 * rowKeep;
    // Standing grain: overlapping irregular clumps with lighter ears on top.
    for (let x = -1.25; x < -1.3 + len; x += 0.11) {
      const h = 0.85 + rnd() * 0.35;
      const seed = i * 31 + Math.round((x + 2) * 100);
      kids.push({ geom: lumpy(0.085, 0.4, seed, 1), mat: rnd() < 0.3 ? EARS : WHEAT, t: [x + (rnd() - 0.5) * 0.03, 0.1 * h + 0.04, z + (rnd() - 0.5) * 0.04], s: [0.9, 1.25 * h, 0.95] });
    }
    if (len < 2.55) kids.push({ geom: box(2.6 - len, 0.02, 0.1), mat: STUBBLE, t: [-1.3 + len + (2.6 - len) / 2, 0.055, z] }); // stubble
  }
  // Low wattle fence along the back edges, posts at the corners.
  for (const [x, z] of [[-1.42, -1.42], [1.42, -1.42], [-1.42, 1.42], [1.42, 1.42]] as const) kids.push(post(x, z, 0.16));
  kids.push({ geom: box(2.84, 0.03, 0.03), mat: 'wood', t: [0, 0.12, -1.42] }, { geom: box(0.03, 0.03, 2.84), mat: 'wood', t: [-1.42, 0.12, 0] });
  return build({ children: kids });
}

/** Construction site under a foundation: a trampled dirt pad, corner stakes with rope, a few logs. */
function site(size: number): () => THREE.Object3D {
  return () => {
    const h = size / 2 - 0.08;
    const kids: NodeSpec[] = [{ geom: box(size - 0.1, 0.02, size - 0.1), mat: { tex: 'plain', color: 0x9a7a52, rough: 1 }, t: [0, 0.01, 0] }];
    for (let i = 0; i < size * 3; i++) kids.push({ geom: lumpy(0.03, 0.3, 60 + i, 0), mat: 'rock', t: [((i * 0.37) % 1 - 0.5) * (size - 0.4), 0.02, ((i * 0.61) % 1 - 0.5) * (size - 0.4)] });
    for (const [x, z] of [[-h, -h], [h, -h], [-h, h], [h, h]] as const) kids.push({ geom: cyl(0.02, 0.025, 0.2, 5), mat: 'wood', t: [x, 0.1, z] });
    for (const [x, z, rot] of [[0, -h, 0], [0, h, 0], [-h, 0, Math.PI / 2], [h, 0, Math.PI / 2]] as const) {
      kids.push({ geom: box(size - 0.16, 0.008, 0.008), mat: { tex: 'plain', color: 0xd8c8a0, rough: 1 }, t: [x, 0.16, z], r: [0, rot, 0] });
    }
    kids.push(logPile(h - 0.35, -h + 0.3, 3, 40 + size));
    return build({ children: kids });
  };
}

export const BUILDING_MODELS: ModelDef[] = [
  { id: 'house', kind: 'building', footprint: 2, facings: 1, build: house },
  { id: 'townCenter', kind: 'building', footprint: 3, facings: 1, build: townCenter },
  { id: 'granary', kind: 'building', footprint: 3, facings: 1, build: granary },
  { id: 'storagePit', kind: 'building', footprint: 3, facings: 1, build: storagePit },
  { id: 'barracks', kind: 'building', footprint: 3, facings: 1, build: barracks },
  { id: 'dock', kind: 'building', footprint: 3, facings: 1, build: dock },
  { id: 'farm', kind: 'building', footprint: 3, facings: 1, variants: 4, build: farm },
  { id: 'site2', kind: 'building', footprint: 2, facings: 1, build: site(2) },
  { id: 'site3', kind: 'building', footprint: 3, facings: 1, build: site(3) },
];
