import * as THREE from 'three';
import { box, build, cone, cyl, lumpy, seeded, sphere, type NodeSpec } from '../dsl/model.ts';
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

export const BUILDING_MODELS: ModelDef[] = [
  { id: 'house', kind: 'building', footprint: 2, facings: 1, build: house },
  { id: 'townCenter', kind: 'building', footprint: 3, facings: 1, build: townCenter },
];
