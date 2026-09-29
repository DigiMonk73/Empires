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

/** Scale a built model uniformly (tuning sizes against units without touching shape code). */
function scaled(o: THREE.Object3D, k: number): THREE.Object3D {
  o.scale.setScalar(k);
  return o;
}

export const RESOURCE_MODELS: ModelDef[] = [
  { id: 'tree', kind: 'resource', footprint: 1, variants: 6, facings: 1, build: (v) => scaled(tree(v, false), 1.45) },
  { id: 'forestTree', kind: 'resource', footprint: 1, variants: 8, facings: 1, build: (v) => scaled(tree(v, true), 1.45) },
  { id: 'goldMine', kind: 'resource', footprint: 1, variants: 4, facings: 1, build: (v) => scaled(mine(v, 'goldOre'), 1.3) },
  { id: 'stoneMine', kind: 'resource', footprint: 1, variants: 4, facings: 1, build: (v) => scaled(mine(v, 'rock'), 1.3) },
  { id: 'berryBush', kind: 'resource', footprint: 1, variants: 3, facings: 1, build: (v) => scaled(berryBush(v), 1.2) },
];

/** Calibration targets: a flat 1×1 tile and a 3×3 box footprint (see tests/e2e/bake-calibration). */
export const TEST_MODELS: ModelDef[] = [
  { id: 'calTile', kind: 'test', footprint: 1, facings: 1, build: () => build({ geom: box(1, 0.002, 1), mat: 'plaster', t: [0, 0.001, 0], castShadow: false }) },
  { id: 'calBox', kind: 'test', footprint: 3, facings: 1, build: () => build({ geom: box(3, 0.6, 3), mat: 'stone', t: [0, 0.3, 0], castShadow: false }) },
];
