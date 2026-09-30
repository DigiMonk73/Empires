import type * as THREE from 'three';
import { box, build, cone, cyl, gable, lumpy, pyramid, seeded, sphere, type MatName, type MatSpec, type NodeSpec, type Vec3 } from '../dsl/model.ts';
import { archeryRange, banner, barracks, bin, firePit, granary, heap, house, logPile, post, sack, stable, storagePit, townCenter } from './buildings.ts';

/**
 * Buildings through the ages (one architecture set for M6; the other four in M9). Variant v0 is the look of the
 * building's own age; each later age rebuilds it: Stone huts → Tool mudbrick halls under thatch → Bronze stone
 * and plaster with red-tile roofs and columns. The renderer picks the variant from the owner's current age.
 */
const LIMEWASH: MatSpec = { tex: 'plaster', color: 0xe9dfc8, rough: 0.9, repeat: 1.2 };
const TILE: MatName = 'rooftile';

interface HallOpts {
  w: number; // along X
  d: number; // along Z
  h: number;
  wall: MatName | MatSpec;
  roof: 'gable' | 'hip' | 'flat';
  roofMat: MatName | MatSpec;
  roofH?: number;
  t?: Vec3;
  /** Doors on the visible faces (+X and/or +Z). */
  doors?: ('x' | 'z')[];
  /** Team-coloured band under the eaves. */
  band?: boolean;
  /** Dark window slits along +Z. */
  windows?: number;
}

/** A rectangular building with a door, windows, a team band and a gable / hipped / flat roof. */
function hall(o: HallOpts): NodeSpec {
  const rh = o.roofH ?? Math.min(o.w, o.d) * 0.45;
  const kids: NodeSpec[] = [{ geom: box(o.w, o.h, o.d), mat: o.wall, t: [0, o.h / 2, 0] }];
  if (o.band !== false) kids.push({ geom: box(o.w + 0.02, 0.06, o.d + 0.02), mat: 'team', t: [0, o.h - 0.08, 0] });
  if (o.roof === 'gable') kids.push({ geom: gable(o.w + 0.2, o.d + 0.25, rh), mat: o.roofMat, t: [0, o.h, 0] });
  else if (o.roof === 'hip') kids.push({ geom: pyramid(o.w + 0.2, o.d + 0.2, rh), mat: o.roofMat, t: [0, o.h, 0] });
  else kids.push({ geom: box(o.w + 0.08, 0.06, o.d + 0.08), mat: o.roofMat, t: [0, o.h + 0.03, 0] }, { geom: box(o.w + 0.1, 0.08, 0.06), mat: o.roofMat, t: [0, o.h + 0.07, o.d / 2] });
  for (const f of o.doors ?? ['x']) {
    if (f === 'x') kids.push({ geom: box(0.04, Math.min(0.34, o.h * 0.7), 0.22), mat: 'dirt', t: [o.w / 2 + 0.005, Math.min(0.17, o.h * 0.35), 0] });
    else kids.push({ geom: box(0.22, Math.min(0.34, o.h * 0.7), 0.04), mat: 'dirt', t: [0, Math.min(0.17, o.h * 0.35), o.d / 2 + 0.005] });
  }
  for (let i = 0; i < (o.windows ?? 0); i++) {
    const x = -o.w / 2 + ((i + 0.5) * o.w) / o.windows!;
    kids.push({ geom: box(0.08, 0.1, 0.03), mat: 'dirt', t: [x, o.h * 0.62, o.d / 2 + 0.005] });
  }
  return { t: o.t ?? [0, 0, 0], children: kids };
}

/** A row of plastered columns with a lintel along X at z. */
function colonnade(x0: number, x1: number, z: number, h: number, n: number): NodeSpec[] {
  const out: NodeSpec[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
    out.push({ geom: cyl(0.045, 0.05, h, 8), mat: LIMEWASH, t: [x, h / 2, z] }, { geom: box(0.12, 0.04, 0.12), mat: LIMEWASH, t: [x, h + 0.02, z] });
  }
  out.push({ geom: box(x1 - x0 + 0.16, 0.07, 0.14), mat: LIMEWASH, t: [(x0 + x1) / 2, h + 0.07, z] });
  return out;
}

/** A low wall segment (courtyards). */
const wall = (x: number, z: number, len: number, alongX: boolean, mat: MatName | MatSpec, h = 0.16): NodeSpec => ({
  geom: box(alongX ? len : 0.08, h, alongX ? 0.08 : len),
  mat,
  t: [x, h / 2, z],
});

// ── House ─────────────────────────────────────────────────────────────────────────────────────────────────
const houseTool = (): THREE.Object3D =>
  build({ children: [hall({ w: 1.15, d: 0.95, h: 0.45, wall: 'mudbrick', roof: 'gable', roofMat: 'thatch', doors: ['x'], windows: 2, t: [-0.1, 0, -0.1] }), post(0.75, 0.75, 0.2), { geom: cyl(0.07, 0.06, 0.1, 8), mat: 'mudbrick', t: [0.72, 0.05, -0.55] }] });
const houseBronze = (): THREE.Object3D =>
  build({
    children: [
      hall({ w: 1.2, d: 1.0, h: 0.5, wall: LIMEWASH, roof: 'hip', roofMat: TILE, roofH: 0.35, doors: ['x', 'z'], windows: 2, t: [-0.12, 0, -0.12] }),
      wall(0.3, 0.72, 0.9, true, LIMEWASH),
      wall(0.72, 0.3, 0.9, false, LIMEWASH),
      { geom: cyl(0.1, 0.08, 0.18, 10), mat: 'mudbrick', t: [0.55, 0.09, 0.55] }, // amphora
    ],
  });

// ── Town Center ───────────────────────────────────────────────────────────────────────────────────────────
function townCenterTool(): THREE.Object3D {
  return build({
    children: [
      hall({ w: 1.7, d: 1.3, h: 0.62, wall: 'mudbrick', roof: 'gable', roofMat: 'thatch', roofH: 0.6, doors: ['x', 'z'], windows: 3, t: [-0.2, 0, -0.25] }),
      hall({ w: 0.8, d: 0.7, h: 0.42, wall: 'mudbrick', roof: 'gable', roofMat: 'thatch', t: [-0.85, 0, 0.95], band: false }),
      hall({ w: 0.7, d: 0.8, h: 0.42, wall: 'mudbrick', roof: 'flat', roofMat: 'planks', t: [0.95, 0, -0.9], band: false }),
      wall(0.4, 1.38, 1.9, true, 'mudbrick', 0.22),
      wall(1.38, 0.4, 1.9, false, 'mudbrick', 0.22),
      firePit(0.75, 0.75),
      banner(1.3, 1.3, 0.75),
      banner(-1.25, 1.3, 0.6),
    ],
  });
}
function townCenterBronze(): THREE.Object3D {
  return build({
    children: [
      { geom: box(2.4, 0.08, 2.0), mat: 'stone', t: [-0.15, 0.04, -0.2] }, // podium
      hall({ w: 1.8, d: 1.4, h: 0.75, wall: LIMEWASH, roof: 'hip', roofMat: TILE, roofH: 0.55, doors: ['x', 'z'], windows: 4, t: [-0.3, 0.08, -0.35] }),
      ...colonnade(-1.1, 0.5, 0.55, 0.62, 5).map((c) => ({ ...c, t: [c.t![0], c.t![1] + 0.08, c.t![2]] as Vec3 })),
      { geom: box(1.85, 0.05, 0.5), mat: TILE, t: [-0.3, 0.8, 0.62], r: [0.25, 0, 0] },
      hall({ w: 0.6, d: 0.6, h: 1.05, wall: 'stone', roof: 'hip', roofMat: TILE, roofH: 0.35, t: [0.95, 0, -0.95], band: true }), // corner tower
      wall(0.9, 1.4, 1.1, true, 'stone', 0.26),
      banner(1.35, 1.35, 0.9),
      banner(-1.3, 1.35, 0.9),
    ],
  });
}

// ── Barracks ──────────────────────────────────────────────────────────────────────────────────────────────
function spearRack(t: Vec3): NodeSpec {
  const spears: NodeSpec[] = [];
  for (let i = 0; i < 5; i++) spears.push({ geom: cyl(0.012, 0.012, 0.7, 5), mat: 'wood', t: [i * 0.08 - 0.16, 0.34, 0.02], r: [0.12, 0, 0] }, { geom: cone(0.02, 0.07, 5), mat: 'bronze', t: [i * 0.08 - 0.16, 0.72, 0.065], r: [0.12, 0, 0] });
  return { t, r: [0, Math.PI / 4, 0], children: [post(-0.25, 0, 0.4), post(0.25, 0, 0.4), { geom: box(0.56, 0.035, 0.035), mat: 'wood', t: [0, 0.3, 0] }, ...spears] };
}
const barracksTool = (): THREE.Object3D =>
  build({ children: [hall({ w: 1.9, d: 1.0, h: 0.5, wall: 'mudbrick', roof: 'gable', roofMat: 'thatch', roofH: 0.55, doors: ['x', 'z'], windows: 3, t: [-0.2, 0, -0.35] }), spearRack([0.95, 0, 0.55]), { t: [-0.6, 0, 0.95], children: [post(0, 0, 0.5), { geom: cyl(0.09, 0.09, 0.22, 8), mat: 'thatch', t: [0, 0.38, 0] }] }, banner(1.25, 0.2, 0.7), banner(0.2, 1.25, 0.7)] });
const barracksBronze = (): THREE.Object3D =>
  build({ children: [hall({ w: 2.0, d: 1.1, h: 0.62, wall: 'stone', roof: 'hip', roofMat: TILE, roofH: 0.45, doors: ['x', 'z'], windows: 4, t: [-0.2, 0, -0.35] }), ...colonnade(-1.0, 0.6, 0.35, 0.5, 5), spearRack([1.05, 0, 0.6]), { geom: box(0.5, 0.06, 0.5), mat: 'stone', t: [-0.7, 0.03, 0.95] }, banner(1.3, 0.2, 0.9), banner(0.2, 1.3, 0.9)] });

// ── Granary ───────────────────────────────────────────────────────────────────────────────────────────────
/** A tall grain silo: drum + conical (Tool) or domed (Bronze) top. */
function silo(x: number, z: number, r: number, h: number, mat: MatName | MatSpec, dome: boolean): NodeSpec {
  return {
    t: [x, 0, z],
    children: [
      { geom: cyl(r, r * 1.05, h, 14), mat, t: [0, h / 2, 0] },
      { geom: cyl(r * 1.03, r * 1.03, 0.05, 14), mat: 'team', t: [0, h * 0.8, 0] },
      dome ? { geom: sphere(r * 1.02, 12), mat, t: [0, h, 0], s: [1, 0.7, 1] } : { geom: cone(r * 1.25, r * 1.1, 14), mat: 'thatch', t: [0, h + r * 0.5, 0] },
      { geom: box(0.05, 0.14, 0.12), mat: 'dirt', t: [r * 0.98, 0.12, 0], r: [0, 0, 0] },
    ],
  };
}
const granaryTool = (): THREE.Object3D =>
  build({ children: [silo(-0.55, -0.5, 0.4, 0.75, 'mudbrick', false), silo(0.5, -0.65, 0.34, 0.65, 'mudbrick', false), silo(-0.65, 0.55, 0.32, 0.6, 'mudbrick', false), wall(0.2, -1.3, 2.4, true, 'mudbrick'), wall(-1.3, 0.2, 2.4, false, 'mudbrick'), sack(0.45, 0.35), sack(0.62, 0.5, 0.9), banner(1.2, 1.2, 0.65)] });
const granaryBronze = (): THREE.Object3D =>
  build({ children: [{ geom: box(2.5, 0.08, 2.5), mat: 'stone', t: [0, 0.04, 0] }, silo(-0.55, -0.5, 0.42, 0.85, LIMEWASH, true), silo(0.55, -0.6, 0.36, 0.75, LIMEWASH, true), silo(-0.6, 0.6, 0.34, 0.7, LIMEWASH, true), sack(0.5, 0.4), sack(0.65, 0.55, 0.9), sack(0.35, 0.62, 0.85), banner(1.2, 1.2, 0.85)] });

// ── Storage Pit ───────────────────────────────────────────────────────────────────────────────────────────
const storageTool = (): THREE.Object3D =>
  build({ children: [hall({ w: 1.6, d: 1.0, h: 0.4, wall: 'mudbrick', roof: 'gable', roofMat: 'thatch', roofH: 0.45, doors: ['x', 'z'], t: [-0.3, 0, -0.35] }), logPile(0.8, -0.55, 7, 5), heap(0.8, 0.5, 'rock', 7, 6), heap(0.35, 0.95, 'goldOre', 5, 7), logPile(-0.95, 0.85, 4, 8)] });
const storageBronze = (): THREE.Object3D =>
  build({ children: [hall({ w: 1.7, d: 1.1, h: 0.5, wall: 'stone', roof: 'hip', roofMat: TILE, roofH: 0.35, doors: ['x', 'z'], windows: 2, t: [-0.3, 0, -0.35] }), logPile(0.85, -0.5, 9, 5), heap(0.85, 0.5, 'rock', 9, 6), heap(0.35, 1.0, 'goldOre', 7, 7), { geom: box(0.4, 0.2, 0.3), mat: 'planks', t: [-0.9, 0.1, 0.9] }] });

// ── Archery Range, Stable (Tool buildings: v0 = Tool) ─────────────────────────────────────────────────────
function targets(): NodeSpec[] {
  return [
    [0.95, 0.35],
    [0.35, 0.95],
    [1.1, 1.1],
  ].map(([x, z]): NodeSpec => ({ t: [x!, 0, z!], r: [0, -Math.PI / 4, 0], children: [post(-0.1, 0, 0.3), post(0.1, 0, 0.3), { geom: cyl(0.15, 0.15, 0.08, 14), mat: 'thatch', t: [0, 0.32, 0], r: [0, 0, Math.PI / 2] }, { geom: cyl(0.09, 0.09, 0.085, 14), mat: 'team', t: [0, 0.32, 0], r: [0, 0, Math.PI / 2] }] }));
}
const rangeBronze = (): THREE.Object3D =>
  build({ children: [hall({ w: 1.8, d: 0.8, h: 0.55, wall: LIMEWASH, roof: 'hip', roofMat: TILE, roofH: 0.35, doors: ['x'], windows: 3, t: [-0.5, 0, -0.75] }), ...colonnade(-1.3, 0.3, -0.25, 0.48, 5), ...targets(), banner(-1.3, 1.25, 0.8)] });
const stableBronze = (): THREE.Object3D =>
  build({
    children: [
      hall({ w: 2.3, d: 1.0, h: 0.55, wall: 'stone', roof: 'hip', roofMat: TILE, roofH: 0.4, doors: ['x'], windows: 0, t: [-0.1, 0, -0.75] }),
      ...[-1.15, -0.58, 0, 0.58, 1.15].map((x): NodeSpec => ({ geom: box(0.3, 0.34, 0.04), mat: 'dirt', t: [x - 0.1 + 0.14, 0.17, -0.245] })),
      { geom: box(0.5, 0.12, 0.16), mat: 'stone', t: [-0.9, 0.06, 0.25] },
      { geom: box(0.44, 0.02, 0.1), mat: { tex: 'plain', color: 0x4a7a90, rough: 0.2 }, t: [-0.9, 0.12, 0.25] },
      wall(-0.1, 1.4, 2.6, true, 'stone', 0.22),
      wall(1.4, 0.67, 1.5, false, 'stone', 0.22),
      banner(1.3, 1.3, 0.8),
    ],
  });

// ── Market (Tool) and Government Center (Bronze) ──────────────────────────────────────────────────────────
function stall(x: number, z: number, awning: MatName | MatSpec, goods: MatName | MatSpec, rot = 0): NodeSpec {
  return {
    t: [x, 0, z],
    r: [0, rot, 0],
    children: [post(-0.25, -0.18, 0.4), post(0.25, -0.18, 0.4), post(-0.25, 0.18, 0.4), post(0.25, 0.18, 0.4), { geom: box(0.62, 0.03, 0.48), mat: awning, t: [0, 0.42, 0], r: [0.12, 0, 0] }, { geom: box(0.5, 0.14, 0.3), mat: 'planks', t: [0, 0.07, 0] }, { geom: sphere(0.08, 7), mat: goods, t: [-0.1, 0.18, 0], s: [1.4, 0.6, 1] }, { geom: sphere(0.07, 7), mat: goods, t: [0.12, 0.18, 0.05], s: [1.2, 0.6, 1] }],
  };
}
const AWNING_A: MatSpec = { tex: 'cloth', color: 0xc05a3a, rough: 1, repeat: 6 };
const AWNING_B: MatSpec = { tex: 'cloth', color: 0xd8b85a, rough: 1, repeat: 6 };
const marketTool = (): THREE.Object3D =>
  build({ children: [hall({ w: 1.2, d: 0.8, h: 0.45, wall: 'mudbrick', roof: 'gable', roofMat: 'thatch', doors: ['x'], windows: 2, t: [-0.6, 0, -0.75] }), stall(0.75, -0.6, AWNING_A, 'berries'), stall(0.8, 0.45, AWNING_B, 'goldOre', 0.3), stall(-0.35, 0.75, 'team', { tex: 'cloth', color: 0x8a6a4a, rough: 1 }, -0.2), sack(0.2, 0.1), sack(0.35, 0.2, 0.8), { geom: cyl(0.1, 0.08, 0.2, 10), mat: 'mudbrick', t: [0.1, 0.1, 0.4] }, banner(1.3, 1.3, 0.7)] });
const marketBronze = (): THREE.Object3D =>
  build({ children: [{ geom: box(2.6, 0.06, 2.6), mat: 'stone', t: [0, 0.03, 0] }, hall({ w: 1.5, d: 0.8, h: 0.55, wall: LIMEWASH, roof: 'hip', roofMat: TILE, roofH: 0.35, doors: ['x'], windows: 3, t: [-0.45, 0, -0.8] }), ...colonnade(-1.15, 0.25, -0.28, 0.5, 5), stall(0.8, 0.2, AWNING_A, 'berries'), stall(0.2, 0.85, AWNING_B, 'goldOre'), stall(-0.75, 0.8, 'team', 'plaster', 0.2), banner(1.3, 1.3, 0.85)] });
const governmentCenter = (): THREE.Object3D =>
  build({
    children: [
      { geom: box(2.4, 0.12, 2.0), mat: 'stone', t: [-0.1, 0.06, -0.15] },
      { geom: box(2.0, 0.06, 1.7), mat: 'stone', t: [-0.1, 0.15, -0.15] },
      hall({ w: 1.6, d: 1.15, h: 0.8, wall: LIMEWASH, roof: 'gable', roofMat: TILE, roofH: 0.45, doors: ['x'], windows: 0, t: [-0.2, 0.18, -0.3] }),
      ...colonnade(-0.95, 0.55, 0.42, 0.72, 6).map((c) => ({ ...c, t: [c.t![0], c.t![1] + 0.18, c.t![2]] as Vec3 })),
      banner(1.25, 0.9, 1.0),
      banner(0.9, 1.25, 1.0),
    ],
  });

/** Variant builders by age step from the building's own age (0 = its age, 1 = next …). */
export const AGED: Record<string, (() => THREE.Object3D)[]> = {
  house: [house, houseTool, houseBronze],
  townCenter: [townCenter, townCenterTool, townCenterBronze],
  barracks: [barracks, barracksTool, barracksBronze],
  granary: [granary, granaryTool, granaryBronze],
  storagePit: [storagePit, storageTool, storageBronze],
  archeryRange: [archeryRange, rangeBronze],
  stable: [stable, stableBronze],
  market: [marketTool, marketBronze],
  governmentCenter: [governmentCenter],
};

void bin;
void lumpy;
void seeded;
