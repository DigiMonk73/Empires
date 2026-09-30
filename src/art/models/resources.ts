import * as THREE from 'three';
import { box, build, cone, cyl, lumpy, seeded, sphere, type NodeSpec } from '../dsl/model.ts';
import type { ModelDef } from './types.ts';

/** A tree: short sturdy trunk with a couple of limbs and a wide, lumpy canopy; shape jittered per variant. */
function tree(variant: number, forest: boolean): THREE.Object3D {
  const r = seeded(variant * 977 + (forest ? 31 : 7));
  if (forest && r() < 0.45) {
    // Conifer.
    const h = 0.75 + r() * 0.3;
    return build({
      children: [
        { geom: cyl(0.04, 0.065, h * 0.5, 6), mat: 'bark', t: [0, h * 0.25, 0] },
        { geom: cone(0.3, h * 0.62, 9), mat: 'foliageDark', t: [0, h * 0.5, 0], r: [0, r() * 3, 0] },
        { geom: cone(0.23, h * 0.52, 9), mat: 'foliageDark', t: [0, h * 0.78, 0], r: [0, r() * 3, 0] },
        { geom: cone(0.15, h * 0.42, 9), mat: 'foliage', t: [0, h * 1.02, 0] },
      ],
    });
  }
  const trunkH = 0.32 + r() * 0.12;
  const lean = (r() - 0.5) * 0.12;
  const canopyY = trunkH + 0.14;
  const spread = forest ? 0.2 : 0.26;
  const kids: NodeSpec[] = [
    { geom: cyl(0.045, 0.075, trunkH + 0.1, 7), mat: 'bark', t: [0, (trunkH + 0.1) / 2, 0], r: [0, 0, lean] },
    { geom: cyl(0.02, 0.035, 0.22, 5), mat: 'bark', t: [0.06, trunkH - 0.02, 0.02], r: [0.3, 0, -0.9] },
    { geom: cyl(0.02, 0.035, 0.2, 5), mat: 'bark', t: [-0.05, trunkH, -0.03], r: [-0.4, 0, 0.8] },
  ];
  const n = 6 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.8;
    const d = i === 0 ? 0 : spread * (0.55 + r() * 0.5);
    const size = (i === 0 ? 0.24 : 0.14 + r() * 0.1) * (forest ? 0.95 : 1.05);
    const y = canopyY + (i === 0 ? 0.16 : r() * 0.2);
    kids.push({ geom: lumpy(size, 0.22, variant * 31 + i, 1), mat: r() < 0.45 ? 'foliage' : 'foliageDark', t: [Math.cos(a) * d, y, Math.sin(a) * d], s: [1, 0.82, 1] });
  }
  return build({ children: kids });
}

/**
 * A palm (M10.3; drawn for trees on sandy ground): a slim ringed trunk leaning and bending as it rises, a crown
 * of drooping fronds and a cluster of dates. The sim's trees are all one kind — the renderer picks the look.
 */
function palm(variant: number): THREE.Object3D {
  const r = seeded(variant * 613 + 5);
  const h = 0.95 + r() * 0.35;
  const segs = 6;
  const bend = 0.18 + r() * 0.16;
  const kids: NodeSpec[] = [];
  let x = 0;
  let y = 0;
  for (let k = 0; k < segs; k++) {
    const t = (k + 0.5) / segs;
    const tilt = bend * 2 * t; // the lean grows toward the top
    const len = h / segs;
    const dx = Math.sin(tilt) * len;
    const dy = Math.cos(tilt) * len;
    kids.push({ geom: cyl(0.032 - k * 0.002, 0.04 - k * 0.002, len * 1.05, 7), mat: PALM_BARK, t: [x + dx / 2, y + dy / 2, 0], r: [0, 0, -tilt] });
    kids.push({ geom: cyl(0.044 - k * 0.002, 0.044 - k * 0.002, 0.018, 7), mat: 'bark', t: [x + dx, y + dy, 0], r: [0, 0, -tilt] });
    x += dx;
    y += dy;
  }
  const fronds = 8 + Math.floor(r() * 3);
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + r() * 0.4;
    const droop = 0.35 + r() * 0.35;
    kids.push({ t: [x, y, 0], r: [0, a, 0], children: [
      { geom: box(0.4, 0.012, 0.1), mat: i % 2 ? 'foliage' : 'foliageDark', t: [0.19, -0.06, 0], r: [0, 0, -droop] },
      { geom: box(0.18, 0.01, 0.06), mat: 'foliage', t: [0.4, -0.2, 0], r: [0, 0, -droop - 0.5] },
    ] });
  }
  for (let i = 0; i < 3; i++) kids.push({ geom: sphere(0.028, 6), mat: DATES, t: [x + Math.cos(i * 2.1) * 0.04, y - 0.05, Math.sin(i * 2.1) * 0.04] });
  return build({ t: [0, 0, 0], r: [0, r() * Math.PI * 2, 0], children: kids });
}
const PALM_BARK = { tex: 'bark', color: 0x8a6e4a, rough: 1, repeat: 3 } as const;
const DATES = { tex: 'plain', color: 0x7a4a1c, rough: 0.8 } as const;

/** A pine (M10.3; drawn for trees on the heights): a tall trunk under tiers of dark needles. */
function pine(variant: number): THREE.Object3D {
  const r = seeded(variant * 389 + 17);
  const h = 1.0 + r() * 0.35;
  const tiers = 4;
  const kids: NodeSpec[] = [{ geom: cyl(0.035, 0.06, h * 0.55, 6), mat: 'bark', t: [0, h * 0.275, 0] }];
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const rad = 0.3 * (1 - t * 0.7);
    kids.push({ geom: cone(rad, h * 0.34, 9), mat: i === tiers - 1 ? 'foliage' : 'foliageDark', t: [0, h * (0.36 + t * 0.52), 0], r: [0, r() * 3, 0] });
  }
  return build({ children: kids });
}

function mine(variant: number, ore: 'goldOre' | 'rock'): THREE.Object3D {
  const r = seeded(variant * 131 + (ore === 'rock' ? 3 : 5));
  const kids: NodeSpec[] = [];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const d = i === 0 ? 0 : 0.14 + r() * 0.12;
    const s = i === 0 ? 0.24 : 0.12 + r() * 0.1;
    kids.push({ geom: lumpy(s, 0.28, variant * 13 + i, 0), mat: ore, t: [Math.cos(a) * d, s * 0.5, Math.sin(a) * d], r: [r() * 3, r() * 3, r() * 3], s: [1, 0.7, 1] });
  }
  return build({ children: kids });
}

function berryBush(variant: number): THREE.Object3D {
  const r = seeded(variant * 17 + 11);
  const kids: NodeSpec[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    kids.push({ geom: sphere(0.16 + r() * 0.06, 9), mat: 'foliage', t: [Math.cos(a) * 0.1, 0.15 + r() * 0.06, Math.sin(a) * 0.1], s: [1, 0.8, 1] });
  }
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2;
    const y = 0.1 + r() * 0.2;
    const d = 0.18 + r() * 0.08;
    kids.push({ geom: sphere(0.028, 6), mat: 'berries', t: [Math.cos(a) * d, y, Math.sin(a) * d], castShadow: false });
  }
  return build({ children: kids });
}

/**
 * Fish out at sea (M8.6c): a 2×2 school — dark backs and fins just under the surface inside a ripple ring — and a
 * whale's long back breaking the water with a spout. Flat on the water line, no shadow of note.
 */
function ripple(r: number, w: number, color: number): NodeSpec {
  const g = new THREE.RingGeometry(r - w, r, 32);
  g.rotateX(-Math.PI / 2);
  return { geom: g, mat: { tex: 'plain', color, rough: 1 }, t: [0, 0.004, 0], castShadow: false };
}

function deepFish(variant: number): THREE.Object3D {
  const r = seeded(variant * 29 + 5);
  const kids: NodeSpec[] = [ripple(0.95, 0.035, 0xc6e0ea), ripple(0.62, 0.025, 0xb2d2de)];
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.15 + r() * 0.55;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const yaw = r() * Math.PI * 2;
    kids.push({ t: [x, 0.01, z], r: [0, yaw, 0], children: [
      { geom: sphere(0.07, 8), mat: { tex: 'plain', color: 0x1f3a4a, rough: 0.6 }, s: [1.9, 0.35, 0.7], castShadow: false },
      { geom: cone(0.045, 0.08, 4), mat: { tex: 'plain', color: 0x1a3140, rough: 0.6 }, t: [-0.15, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.3], castShadow: false },
    ] });
  }
  return build({ children: kids });
}

function whale(): THREE.Object3D {
  const back = { tex: 'plain' as const, color: 0x2c3440, rough: 0.5 };
  return build({
    children: [
      ripple(1.0, 0.04, 0xc6e0ea),
      { geom: sphere(0.3, 14), mat: back, t: [0, 0.02, 0], s: [2.6, 0.45, 0.9] },
      { geom: cone(0.08, 0.14, 6), mat: back, t: [-0.1, 0.13, 0] }, // dorsal hump
      { geom: box(0.12, 0.02, 0.5), mat: back, t: [-0.88, 0.05, 0], r: [0, 0, 0.3] }, // flukes
      ...[[0.45, 0.35, 0], [0.42, 0.46, 0.05], [0.48, 0.44, -0.06], [0.44, 0.55, 0]].map(([x, y, z]): NodeSpec => ({ geom: sphere(0.045, 6), mat: { tex: 'plain', color: 0xeef8ff, rough: 1 }, t: [x!, y!, z!], castShadow: false })),
    ],
  });
}

/** Scale a built model uniformly (tuning sizes against units without touching shape code). */
function scaled(o: THREE.Object3D, k: number): THREE.Object3D {
  o.scale.setScalar(k);
  return o;
}

export const RESOURCE_MODELS: ModelDef[] = [
  { id: 'tree', kind: 'resource', footprint: 1, variants: 6, facings: 1, build: (v) => scaled(tree(v, false), 1.45) },
  { id: 'forestTree', kind: 'resource', footprint: 1, variants: 8, facings: 1, build: (v) => scaled(tree(v, true), 1.45) },
  { id: 'palm', kind: 'resource', footprint: 1, variants: 6, facings: 1, build: (v) => scaled(palm(v), 1.4) },
  { id: 'pine', kind: 'resource', footprint: 1, variants: 6, facings: 1, build: (v) => scaled(pine(v), 1.4) },
  { id: 'goldMine', kind: 'resource', footprint: 1, variants: 4, facings: 1, build: (v) => scaled(mine(v, 'goldOre'), 1.3) },
  { id: 'stoneMine', kind: 'resource', footprint: 1, variants: 4, facings: 1, build: (v) => scaled(mine(v, 'rock'), 1.3) },
  { id: 'berryBush', kind: 'resource', footprint: 1, variants: 3, facings: 1, build: (v) => scaled(berryBush(v), 1.2) },
  { id: 'deepFish', kind: 'resource', footprint: 2, variants: 3, facings: 1, build: (v) => deepFish(v) },
  { id: 'whale', kind: 'resource', footprint: 2, variants: 1, facings: 1, build: () => whale() },
];

/** Calibration targets: a flat 1×1 tile and a 3×3 box footprint (see tests/e2e/bake-calibration). */
export const TEST_MODELS: ModelDef[] = [
  { id: 'calTile', kind: 'test', footprint: 1, facings: 1, build: () => build({ geom: box(1, 0.002, 1), mat: 'plaster', t: [0, 0.001, 0], castShadow: false }) },
  { id: 'calBox', kind: 'test', footprint: 3, facings: 1, build: () => build({ geom: box(3, 0.6, 3), mat: 'stone', t: [0, 0.3, 0], castShadow: false }) },
];
