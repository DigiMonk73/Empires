import * as THREE from 'three';
import { box, build, cone, cyl, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { banner, post } from './buildings.ts';
import type { ModelDef } from './types.ts';

/**
 * Walls and the tower line (M7.2). A wall segment is drawn as a post plus an arm toward each neighbouring
 * segment (the renderer composes them), so any dragged line joins up: an arm model has 8 variants, one per
 * direction (variant d points along world angle d·45°, 0 = +x), half a tile long straight and √½ diagonal.
 * Three looks by level: Small Wall (mudbrick on a stone footing), Medium Wall (dressed stone), Fortification
 * (tall stone with merlons).
 */
type Level = 'smallWall' | 'mediumWall' | 'fortification';

const FOOTING: MatSpec = { tex: 'rock', color: 0x8a8274, rough: 1, repeat: 2 };

interface WallLook {
  h: number;
  w: number;
  mat: NodeSpec['mat'];
  /** Post: width and height (a pier or small tower). */
  pw: number;
  ph: number;
  merlons: boolean;
}

const LOOK: Record<Level, WallLook> = {
  smallWall: { h: 0.42, w: 0.26, mat: 'mudbrick', pw: 0.32, ph: 0.5, merlons: false },
  mediumWall: { h: 0.62, w: 0.3, mat: 'stone', pw: 0.38, ph: 0.72, merlons: false },
  fortification: { h: 0.85, w: 0.36, mat: 'stone', pw: 0.5, ph: 1.12, merlons: true },
};

/** Merlons along a span of length `len` (x from 0), on top of height `h`. */
function merlons(len: number, h: number, w: number): NodeSpec[] {
  const out: NodeSpec[] = [];
  const n = Math.max(1, Math.round(len / 0.16));
  for (let i = 0; i < n; i++) out.push({ geom: box(0.08, 0.1, w + 0.02), mat: 'stone', t: [((i + 0.5) * len) / n, h + 0.05, 0] });
  return out;
}

function wallPost(level: Level): () => THREE.Object3D {
  const L = LOOK[level];
  return () =>
    build({
      children: [
        { geom: box(L.pw + 0.06, 0.08, L.pw + 0.06), mat: FOOTING, t: [0, 0.04, 0] },
        { geom: box(L.pw, L.ph, L.pw), mat: L.mat, t: [0, L.ph / 2, 0] },
        L.merlons
          ? { children: [-1, 1].flatMap((sx) => [-1, 1].map((sz): NodeSpec => ({ geom: box(0.1, 0.12, 0.1), mat: 'stone', t: [sx * (L.pw / 2 - 0.05), L.ph + 0.06, sz * (L.pw / 2 - 0.05)] }))) }
          : { geom: box(L.pw + 0.04, 0.05, L.pw + 0.04), mat: level === 'smallWall' ? 'wood' : 'stone', t: [0, L.ph + 0.025, 0] },
      ],
    });
}

function wallArm(level: Level): (d: number) => THREE.Object3D {
  const L = LOOK[level];
  return (d: number) => {
    const len = d % 2 ? Math.SQRT1_2 : 0.5;
    const kids: NodeSpec[] = [
      { geom: box(len, 0.06, L.w + 0.06), mat: FOOTING, t: [len / 2, 0.03, 0] },
      { geom: box(len, L.h, L.w), mat: L.mat, t: [len / 2, L.h / 2, 0] },
    ];
    if (L.merlons) kids.push(...merlons(len, L.h, L.w));
    else kids.push({ geom: box(len, 0.04, L.w + 0.03), mat: level === 'smallWall' ? 'wood' : 'stone', t: [len / 2, L.h + 0.02, 0] });
    // Rotate to direction d (the baker's convention: angle measured from +x toward +z, negated about Y).
    return build({ r: [0, -(d * Math.PI) / 4, 0], children: kids });
  };
}

/** A short run of three posts — the level's icon for the build menu and selection panel. */
function wallIcon(level: Level): () => THREE.Object3D {
  return () => {
    const g = new THREE.Group();
    for (const x of [-0.5, 0, 0.5]) {
      const p = wallPost(level)();
      p.position.set(x, 0, 0);
      g.add(p);
    }
    for (const x of [-0.5, 0]) {
      const a = wallArm(level)(0);
      a.position.set(x, 0, 0);
      g.add(a);
    }
    g.rotation.y = Math.PI / 4; // along the screen's horizontal
    return g;
  };
}

/** Sentry Tower (Bronze): the lookout on a stone base. */
function sentryTower(): THREE.Object3D {
  const B = 0.75;
  return build({
    children: [
      { geom: box(1.1, B, 1.1), mat: 'stone', t: [0, B / 2, 0] },
      { geom: box(1.18, 0.07, 1.18), mat: 'stone', t: [0, B + 0.035, 0] },
      ...[-0.45, 0.45].flatMap((x) => [-0.45, 0.45].map((z): NodeSpec => ({ ...post(x, z, 0.55), t: [x, B + 0.3, z] }))),
      { geom: box(1.0, 0.06, 1.0), mat: 'planks', t: [0, B + 0.58, 0] },
      { geom: cone(0.85, 0.48, 4), mat: 'rooftile', t: [0, B + 0.85, 0], r: [0, Math.PI / 4, 0] },
      { geom: box(1.12, 0.06, 0.05), mat: 'team', t: [0, B + 0.12, 0.56] },
      { geom: box(0.22, 0.4, 0.04), mat: 'wood', t: [0.2, 0.2, 0.56] }, // door
    ],
  });
}

/** Guard Tower (Iron): a crenellated stone tower. */
function guardTower(extra: NodeSpec[] = []): THREE.Object3D {
  const H = 1.45;
  return build({
    children: [
      { geom: box(1.14, 0.1, 1.14), mat: 'stone', t: [0, 0.05, 0] },
      { geom: box(0.98, H, 0.98), mat: 'stone', t: [0, H / 2, 0] },
      { geom: box(1.12, 0.08, 1.12), mat: 'stone', t: [0, H + 0.04, 0] },
      ...[-1, 1].flatMap((sx) => [-0.35, 0, 0.35].flatMap((u): NodeSpec[] => [
        { geom: box(0.14, 0.16, 0.12), mat: 'stone', t: [sx * 0.5, H + 0.16, u] },
        { geom: box(0.12, 0.16, 0.14), mat: 'stone', t: [u, H + 0.16, sx * 0.5] },
      ])),
      { geom: box(0.06, 0.2, 0.02), mat: 'wood', t: [0.2, 0.95, 0.5] }, // arrow slits
      { geom: box(0.02, 0.2, 0.06), mat: 'wood', t: [0.5, 0.95, -0.2] },
      { geom: box(0.26, 0.46, 0.04), mat: 'wood', t: [-0.2, 0.23, 0.5] },
      { geom: box(1.0, 0.06, 0.04), mat: 'team', t: [0, H - 0.1, 0.5] },
      banner(0.35, -0.35, 0.55 + H),
      ...extra,
    ],
  });
}

/** Ballista Tower (Iron + Ballistics): the guard tower with a bolt thrower on its roof. */
function ballistaTower(): THREE.Object3D {
  const H = 1.55;
  return guardTower([
    { t: [0, H + 0.05, 0], r: [0, 0.6, 0], children: [
      { geom: box(0.5, 0.06, 0.12), mat: 'wood', t: [0, 0.12, 0] }, // stock
      { geom: box(0.06, 0.04, 0.7), mat: 'wood', t: [0.18, 0.16, 0], r: [0, 0, 0.1] }, // bow arms
      { geom: cyl(0.03, 0.03, 0.2, 6), mat: 'wood', t: [0, 0.05, 0] },
      { geom: box(0.4, 0.02, 0.02), mat: 'bronze', t: [0.05, 0.17, 0] }, // bolt
    ] },
  ]);
}

export const WALL_MODELS: ModelDef[] = [
  ...(['smallWall', 'mediumWall', 'fortification'] as const).flatMap((lv): ModelDef[] => [
    { id: `${lv}Post`, kind: 'building', footprint: 1, facings: 1, build: wallPost(lv) },
    { id: `${lv}Arm`, kind: 'building', footprint: 1, facings: 1, variants: 8, build: wallArm(lv) },
    { id: `${lv}Icon`, kind: 'building', footprint: 2, facings: 1, build: wallIcon(lv) },
  ]),
  { id: 'sentryTower', kind: 'building', footprint: 2, facings: 1, build: sentryTower },
  { id: 'guardTower', kind: 'building', footprint: 2, facings: 1, build: () => guardTower() },
  { id: 'ballistaTower', kind: 'building', footprint: 2, facings: 1, build: ballistaTower },
];
