import * as THREE from 'three';
import type { ArchSet } from '../../../data/types.ts';
import { box, build, cone, cyl, sphere, type MatName, type MatSpec, type NodeSpec, type Vec3 } from '../../dsl/model.ts';
import { banner, firePit, heap, logPile, post, sack } from '../buildings.ts';
import type { ModelDef } from '../types.ts';

/**
 * Architecture sets (M9.2, D43). Each set is a Kit — its materials and building blocks (halls, towers, columns,
 * fences, grain stores, the set's landmark, temple and Wonder) at each age — and every building is one recipe
 * written against the Kit, so a new set restyles all of them at once. A building gets one variant per age from
 * its own age to Iron. Models are `<building>_<set>`; the Greek-style originals keep the bare ids and are the
 * fallback for anything a set lacks.
 */

/** Absolute age: 0 Stone, 1 Tool, 2 Bronze, 3 Iron. */
export type Age = 0 | 1 | 2 | 3;
export type Mat = MatName | MatSpec;

export interface HallSpec {
  w: number; // along X
  d: number; // along Z
  h: number;
  a: Age;
  t?: Vec3;
  /** Doors on the visible faces (+X and/or +Z). */
  doors?: ('x' | 'z')[];
  /** Windows along +Z. */
  windows?: number;
  /** Team-coloured band (default on). */
  band?: boolean;
  /** A lower, plainer roof for annexes and sheds. */
  low?: boolean;
}

export interface Kit {
  set: ArchSet;
  hall(o: HallSpec): NodeSpec;
  /** A square tower `w` wide and `h` tall standing at t. */
  tower(w: number, h: number, a: Age, t: Vec3): NodeSpec;
  /** A portico: `n` columns along X from x0 to x1 at z, `h` tall, with their beam. */
  columns(x0: number, x1: number, z: number, h: number, n: number, a: Age): NodeSpec[];
  /** An open pavilion: columns round a w×d floor under the set's roof, `h` to the eaves. */
  shed(w: number, d: number, h: number, a: Age, t: Vec3): NodeSpec;
  /** A low enclosure (fence or wall) centred at (x, z). */
  fence(x: number, z: number, len: number, alongX: boolean, a: Age, h?: number): NodeSpec;
  /** A raised platform (Bronze on); null when the age builds on bare ground. Its top is `lift(a)`. */
  podium(w: number, d: number, a: Age, t?: Vec3): NodeSpec | null;
  lift(a: Age): number;
  /** The set's emblem: obelisk, lion pillar, stone lantern, column with an eagle … */
  landmark(t: Vec3, a: Age, s?: number): NodeSpec;
  /** A grain store (silo, crib) of radius r. */
  store(x: number, z: number, r: number, h: number, a: Age): NodeSpec;
  /** The temple (footprint 3). */
  shrine(a: Age): NodeSpec[];
  /** The Wonder (footprint 5). */
  wonder(): NodeSpec[];
  /** Market awnings. */
  awnings: readonly [Mat, Mat];
}

/** A box whose top is inset by `inset` on every side (battered walls); a negative inset flares it (cornices). */
export function frustum(w: number, h: number, d: number, inset: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position!;
  const kx = (w - 2 * inset) / w;
  const kz = (d - 2 * inset) / d;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * kx, p.getY(i), p.getZ(i) * kz);
  g.computeVertexNormals();
  return g;
}

/** Shift a node up by dy. */
export const up = (n: NodeSpec, dy: number): NodeSpec => ({ t: [0, dy, 0], children: [n] });

// ── Shared props ──────────────────────────────────────────────────────────────────────────────────────────
const TARGET: MatSpec = { tex: 'thatch', color: 0xc8a860, rough: 1, repeat: 3 };

/** A rack of spears and team-painted shields. */
export function weaponRack(t: Vec3, rot: number): NodeSpec {
  const kids: NodeSpec[] = [post(-0.25, 0, 0.4), post(0.25, 0, 0.4), { geom: box(0.56, 0.035, 0.035), mat: 'wood', t: [0, 0.3, 0] }];
  for (let i = 0; i < 4; i++) kids.push({ geom: cyl(0.012, 0.012, 0.66, 5), mat: 'wood', t: [i * 0.1 - 0.15, 0.33, 0.02], r: [0.12, 0, 0] }, { geom: cone(0.02, 0.07, 5), mat: 'bronze', t: [i * 0.1 - 0.15, 0.69, 0.06], r: [0.12, 0, 0] });
  kids.push({ geom: cyl(0.08, 0.08, 0.02, 12), mat: 'team', t: [-0.1, 0.16, 0.05], r: [Math.PI / 2 - 0.2, 0, 0] }, { geom: cyl(0.08, 0.08, 0.02, 12), mat: 'team', t: [0.12, 0.16, 0.05], r: [Math.PI / 2 - 0.2, 0, 0] });
  return { t, r: [0, rot, 0], children: kids };
}

/** A straw practice dummy on a post. */
export function dummy(x: number, z: number): NodeSpec {
  return { t: [x, 0, z], children: [post(0, 0, 0.55), { geom: cyl(0.06, 0.06, 0.24, 8), mat: TARGET, t: [0, 0.38, 0] }, { geom: box(0.3, 0.03, 0.03), mat: 'wood', t: [0, 0.44, 0] }] };
}

/** Round archery targets on trestles along the front edges. */
export function targets(): NodeSpec[] {
  return [
    [0.95, 0.35],
    [0.35, 0.95],
    [1.1, 1.1],
  ].map(([x, z]): NodeSpec => ({ t: [x!, 0, z!], r: [0, -Math.PI / 4, 0], children: [post(-0.1, 0, 0.3), post(0.1, 0, 0.3), { geom: cyl(0.15, 0.15, 0.08, 14), mat: TARGET, t: [0, 0.32, 0], r: [0, 0, Math.PI / 2] }, { geom: cyl(0.09, 0.09, 0.085, 14), mat: 'team', t: [0, 0.32, 0], r: [0, 0, Math.PI / 2] }] }));
}

/** A market stall: posts, a sloping awning, a counter with goods. */
export function stall(x: number, z: number, awning: Mat, goods: Mat, rot = 0): NodeSpec {
  return {
    t: [x, 0, z],
    r: [0, rot, 0],
    children: [post(-0.25, -0.18, 0.4), post(0.25, -0.18, 0.4), post(-0.25, 0.18, 0.4), post(0.25, 0.18, 0.4), { geom: box(0.62, 0.03, 0.48), mat: awning, t: [0, 0.42, 0], r: [0.12, 0, 0] }, { geom: box(0.5, 0.14, 0.3), mat: 'planks', t: [0, 0.07, 0] }, { geom: sphere(0.08, 7), mat: goods, t: [-0.1, 0.18, 0], s: [1.4, 0.6, 1] }, { geom: sphere(0.07, 7), mat: goods, t: [0.12, 0.18, 0.05], s: [1.2, 0.6, 1] }],
  };
}

const WATER: MatSpec = { tex: 'plain', color: 0x4a7a90, rough: 0.2 };
const STONE_BALL: MatSpec = { tex: 'rock', color: 0xa8a294, rough: 0.95, repeat: 2 };

// ── Recipes ───────────────────────────────────────────────────────────────────────────────────────────────
interface Recipe {
  /** The building's own age (the first variant). */
  own: Age;
  footprint: number;
  build(k: Kit, a: Age): NodeSpec[];
}

const g = (a: Age, k: Kit) => k.lift(a);

export const RECIPES: Record<string, Recipe> = {
  townCenter: {
    own: 0,
    footprint: 3,
    build: (k, a) => {
      const y = g(a, k);
      return [
        k.podium(1.95 + 0.1 * a, 1.6 + 0.05 * a, a, [-0.3, 0, -0.35]),
        k.hall({ w: 1.55 + 0.1 * a, d: 1.25 + 0.05 * a, h: 0.55 + 0.07 * a, a, doors: ['x', 'z'], windows: 3, t: [-0.3, y, -0.35] }),
        k.hall({ w: 0.75, d: 0.7, h: 0.4 + 0.04 * a, a, t: [-0.95, 0, 0.9], band: false, low: true }),
        a >= 1 ? k.tower(0.6, 0.85 + 0.15 * a, a, [0.95, 0, -0.95]) : k.store(0.9, -0.95, 0.3, 0.4, a),
        k.fence(0.4, 1.38, 1.9, true, a),
        k.fence(1.38, 0.4, 1.9, false, a),
        a >= 2 ? k.landmark([0.85, 0, 0.85], a, 0.75) : firePit(0.8, 0.8),
        banner(1.3, 1.3, 0.72 + 0.08 * a),
        banner(-1.28, 1.32, 0.62 + 0.08 * a),
      ].filter((n): n is NodeSpec => !!n);
    },
  },
  house: {
    own: 0,
    footprint: 2,
    build: (k, a) => [
      k.hall({ w: 1.05 + 0.05 * a, d: 0.9 + 0.04 * a, h: 0.4 + 0.04 * a, a, doors: ['x'], windows: 2, t: [-0.14, 0, -0.14] }),
      a >= 1 ? k.fence(0.3, 0.74, 0.9, true, a, 0.14) : post(0.7, 0.7, 0.22),
      { geom: cyl(0.08, 0.06, 0.16, 10), mat: 'mudbrick', t: [0.6, 0.08, 0.5] },
      { geom: cyl(0.05, 0.045, 0.1, 8), mat: 'mudbrick', t: [0.72, 0.05, 0.36] },
    ],
  },
  granary: {
    own: 0,
    footprint: 3,
    build: (k, a) => [
      k.podium(2.5, 2.5, a),
      up(k.store(-0.55, -0.5, 0.4, 0.7 + 0.05 * a, a), g(a, k)),
      up(k.store(0.5, -0.65, 0.34, 0.6 + 0.05 * a, a), g(a, k)),
      up(k.store(-0.65, 0.55, 0.32, 0.55 + 0.05 * a, a), g(a, k)),
      k.fence(0.2, -1.32, 2.4, true, a),
      k.fence(-1.32, 0.2, 2.4, false, a),
      sack(0.45, 0.35),
      sack(0.62, 0.5, 0.9),
      sack(0.35, 0.62, 0.85),
      banner(1.2, 1.2, 0.7 + 0.08 * a),
    ].filter((n): n is NodeSpec => !!n),
  },
  storagePit: {
    own: 0,
    footprint: 3,
    build: (k, a) => [
      k.hall({ w: 1.6, d: 1.0, h: 0.42 + 0.05 * a, a, doors: ['x', 'z'], windows: a >= 2 ? 2 : 0, t: [-0.3, 0, -0.35] }),
      logPile(0.8, -0.55, 7 + a, 5),
      heap(0.8, 0.5, 'rock', 7 + a, 6),
      heap(0.35, 0.95, 'goldOre', 5 + a, 7),
      logPile(-0.95, 0.85, 4, 8),
    ],
  },
  barracks: {
    own: 0,
    footprint: 3,
    // An L of halls round a drill yard: the long hall at the back, a wing down the left side.
    build: (k, a) => [
      k.hall({ w: 1.95 + 0.05 * a, d: 0.9, h: 0.5 + 0.06 * a, a, doors: ['z'], windows: 3, t: [-0.2, 0, -0.9] }),
      k.hall({ w: 0.75, d: 1.2, h: 0.44 + 0.05 * a, a, doors: ['x'], windows: 0, t: [-0.95, 0, 0.45], band: false, low: true }),
      ...(a >= 2 ? k.columns(-0.45, 0.65, -0.35, 0.46, 4, a) : []),
      weaponRack([0.95, 0, 0.1], Math.PI / 2),
      dummy(0.2, 0.55),
      dummy(0.75, 0.9),
      k.fence(0.55, 1.38, 1.5, true, a, 0.14),
      banner(1.3, -0.45, 0.75 + 0.08 * a),
      banner(0.3, 1.3, 0.75 + 0.08 * a),
    ],
  },
  market: {
    own: 1,
    footprint: 3,
    // A trading square: a covered hall of goods in the middle, stalls round it, the merchant's house behind.
    build: (k, a) => [
      k.podium(2.6, 2.6, a),
      k.hall({ w: 1.0, d: 0.7, h: 0.48 + 0.05 * a, a, doors: ['x'], windows: 1, t: [-0.85, g(a, k), -0.85], low: true }),
      k.shed(1.1, 0.9, 0.5, a, [0.15, g(a, k), -0.1]),
      sack(0.0, -0.2),
      sack(0.25, 0.05, 0.9),
      { geom: cyl(0.08, 0.06, 0.16, 10), mat: 'mudbrick', t: [0.4, g(a, k) + 0.08, -0.3] },
      stall(1.05, -0.55, k.awnings[0], 'berries', Math.PI / 2),
      stall(1.05, 0.55, k.awnings[1], 'goldOre', Math.PI / 2),
      stall(0.15, 1.05, 'team', 'plaster'),
      stall(-0.9, 0.9, k.awnings[0], { tex: 'cloth', color: 0x8a6a4a, rough: 1 }),
      banner(1.3, 1.3, 0.8),
    ].filter((n): n is NodeSpec => !!n),
  },
  archeryRange: {
    own: 1,
    footprint: 3,
    // A long open shooting gallery along the back, the bowyer's house at its end, targets across the yard.
    build: (k, a) => [
      k.shed(1.9, 0.6, 0.5 + 0.04 * a, a, [0.15, 0, -0.95]),
      k.hall({ w: 0.7, d: 0.9, h: 0.5 + 0.05 * a, a, doors: ['x'], windows: 0, t: [-1.05, 0, -0.8], low: true }),
      { t: [0.45, 0, -0.9], children: [{ geom: box(0.5, 0.2, 0.08), mat: 'wood', t: [0, 0.1, 0] }] },
      ...targets(),
      post(-0.3, 0.3, 0.5),
      banner(-1.3, 1.25, 0.8),
    ],
  },
  stable: {
    own: 1,
    footprint: 3,
    // Stalls under a lean-to along the back, a fodder hall at the end, a paddock with a trough in front.
    build: (k, a) => [
      k.shed(1.8, 0.7, 0.46 + 0.04 * a, a, [0.2, 0, -0.95]),
      ...[-0.45, 0.15, 0.75].map((x): NodeSpec => ({ geom: box(0.04, 0.26, 0.6), mat: 'planks', t: [x, 0.13, -0.95] })),
      ...[-0.15, 0.45].map((x): NodeSpec => ({ geom: sphere(0.09, 8), mat: 'thatch', t: [x, 0.06, -1.0], s: [1.4, 0.7, 1.2] })),
      k.hall({ w: 0.7, d: 1.0, h: 0.5 + 0.05 * a, a, doors: ['x'], windows: 0, t: [-1.05, 0, -0.75], low: true }),
      { geom: box(0.5, 0.12, 0.16), mat: 'stone', t: [-0.5, 0.06, 0.35] },
      { geom: box(0.44, 0.02, 0.1), mat: WATER, t: [-0.5, 0.12, 0.35] },
      k.fence(0.05, 1.38, 2.6, true, a, 0.18),
      k.fence(1.38, 0.3, 2.1, false, a, 0.18),
      banner(1.3, 1.3, 0.8),
    ],
  },
  governmentCenter: {
    own: 2,
    footprint: 3,
    build: (k, a) => [
      k.podium(2.4, 2.0, a, [-0.1, 0, -0.15]),
      k.hall({ w: 1.6, d: 1.15, h: 0.8, a, doors: ['x'], windows: 0, t: [-0.2, g(a, k), -0.3] }),
      ...k.columns(-0.95, 0.55, 0.42, 0.7, 5, a).map((n) => up(n, g(a, k))),
      k.landmark([0.9, 0, 0.9], a, 0.8),
      banner(1.25, 0.6, 1.0),
      banner(0.6, 1.25, 1.0),
    ].filter((n): n is NodeSpec => !!n),
  },
  temple: { own: 2, footprint: 3, build: (k, a) => k.shrine(a) },
  siegeWorkshop: {
    own: 2,
    footprint: 3,
    // A tall open shed over an engine being built, a crane wheel in the yard, timber and shot.
    build: (k, a) => [
      k.shed(1.5, 1.4, 0.72, a, [-0.5, 0, -0.5]),
      { t: [-0.5, 0, -0.5], children: [
        { geom: box(0.7, 0.08, 0.4), mat: 'wood', t: [0, 0.14, 0] },
        { geom: cyl(0.09, 0.09, 0.05, 10), mat: 'wood', t: [0.25, 0.09, 0.22], r: [Math.PI / 2, 0, 0] },
        { geom: cyl(0.09, 0.09, 0.05, 10), mat: 'wood', t: [-0.25, 0.09, 0.22], r: [Math.PI / 2, 0, 0] },
        { geom: box(0.06, 0.5, 0.06), mat: 'wood', t: [0.05, 0.4, 0], r: [0, 0, -0.5] },
      ] },
      { t: [0.8, 0, -0.75], children: [
        { geom: cyl(0.34, 0.34, 0.12, 16), mat: 'wood', t: [0, 0.38, 0], r: [Math.PI / 2, 0, 0] },
        { geom: cyl(0.26, 0.26, 0.13, 16), mat: 'planks', t: [0, 0.38, 0], r: [Math.PI / 2, 0, 0] },
        { geom: box(0.06, 1.0, 0.06), mat: 'wood', t: [0.1, 0.5, 0.12], r: [0, 0, -0.3] },
      ] },
      { geom: box(1.0, 0.07, 0.08), mat: 'wood', t: [-0.35, 0.05, 0.9], r: [0, 0.2, 0] },
      logPile(0.8, 0.55, 7, 91),
      { geom: sphere(0.08, 8), mat: STONE_BALL, t: [0.3, 0.08, 1.05] },
      { geom: sphere(0.07, 8), mat: STONE_BALL, t: [0.45, 0.07, 0.95] },
      k.fence(1.38, 0.6, 1.5, false, a, 0.16),
      banner(1.15, -1.15, 0.95),
    ],
  },
  academy: {
    own: 2,
    footprint: 3,
    build: (k, a) => [
      k.podium(2.7, 2.7, a),
      k.hall({ w: 2.3, d: 0.7, h: 0.7, a, doors: ['z'], windows: 0, t: [-0.15, g(a, k), -1.0] }),
      ...k.columns(-1.1, 0.95, -0.42, 0.58, 6, a).map((n) => up(n, g(a, k))),
      k.hall({ w: 0.62, d: 1.5, h: 0.6, a, doors: ['x'], windows: 0, t: [-1.02, g(a, k), 0.25] }),
      k.landmark([0.55, g(a, k), 0.5], a, 0.9),
      weaponRack([1.1, 0, -0.15], Math.PI / 2 - 0.2),
      dummy(-0.1, 1.05),
      banner(1.3, 0.75, 0.9),
      banner(-1.3, 1.3, 0.8),
    ].filter((n): n is NodeSpec => !!n),
  },
  wonder: { own: 3, footprint: 5, build: (k) => k.wonder() },
  // Towers (M9.9): the set's tower block, taller and better founded at each step of the line.
  watchTower: {
    own: 1,
    footprint: 2,
    build: (k, a) => [k.tower(0.8, 1.05 + 0.05 * a, a, [-0.05, 0, -0.05]), banner(0.72, 0.72, 0.55)],
  },
  sentryTower: {
    own: 2,
    footprint: 2,
    build: (k, a) => [k.podium(1.5, 1.5, a), k.tower(0.95, 1.3, a, [-0.05, g(a, k), -0.05]), banner(0.74, 0.74, 0.62)].filter((n): n is NodeSpec => !!n),
  },
  guardTower: { own: 3, footprint: 2, build: (k, a) => guardTower(k, a, false) },
  ballistaTower: { own: 3, footprint: 2, build: (k, a) => guardTower(k, a, true) },
};

/** Guard Tower: a tall tower on a platform behind a low wall; the Ballista Tower adds a bolt thrower on a balcony. */
function guardTower(k: Kit, a: Age, ballista: boolean): NodeSpec[] {
  const y = k.lift(a);
  const out: NodeSpec[] = [k.podium(1.7, 1.7, a), k.tower(1.05, 1.55, a, [-0.1, y, -0.1]), k.fence(0.25, 0.8, 1.2, true, a, 0.12), k.fence(0.8, 0.25, 1.2, false, a, 0.12), banner(-0.78, 0.78, 0.7)].filter((n): n is NodeSpec => !!n);
  if (ballista) {
    out.push({ t: [0.6, y + 1.0, -0.1], children: [
      { geom: box(0.34, 0.05, 0.56), mat: 'planks', t: [0, 0, 0] },
      { geom: box(0.04, 0.3, 0.04), mat: 'wood', t: [0.12, -0.16, 0.22], r: [0, 0, 0.5] },
      { geom: box(0.04, 0.3, 0.04), mat: 'wood', t: [0.12, -0.16, -0.22], r: [0, 0, 0.5] },
      { t: [0.02, 0.05, 0], r: [0, 0.5, 0], children: [
        { geom: box(0.42, 0.05, 0.1), mat: 'wood', t: [0, 0.1, 0] },
        { geom: box(0.05, 0.04, 0.6), mat: 'wood', t: [0.15, 0.14, 0], r: [0, 0, 0.1] },
        { geom: cyl(0.03, 0.03, 0.14, 6), mat: 'wood', t: [0, 0.04, 0] },
        { geom: box(0.34, 0.02, 0.02), mat: 'bronze', t: [0.05, 0.15, 0] },
      ] },
    ] });
  }
  return out;
}

/** The models of one architecture set: every recipe, one variant per age from the building's own age. */
export function setModels(k: Kit): ModelDef[] {
  return Object.entries(RECIPES).map(([id, r]) => ({
    id: `${id}_${k.set}`,
    kind: 'building' as const,
    footprint: r.footprint,
    facings: 1,
    variants: 4 - r.own,
    build: (v: number) => build({ children: r.build(k, Math.min(3, r.own + v) as Age) }),
  }));
}
