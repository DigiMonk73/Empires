import type * as THREE from 'three';
import { box, build, cone, cyl, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { banner, pediment } from './buildings.ts';
import type { ModelDef } from './types.ts';

/**
 * The Wonder (M7.7), in the Greek-style set: a three-tier marble platform, a great temple ringed by columns under
 * a gilded roof, and a colossal bronze figure raising a torch before it. 5×5 tiles — the largest thing on the
 * map, so it must read as a monument even at zoom 0.5.
 */
const MARBLE: MatSpec = { tex: 'plaster', color: 0xeee8da, rough: 0.6, repeat: 2 };
const GOLD: MatSpec = { tex: 'metal', color: 0xc9a24a, rough: 0.55, metal: 0.45, repeat: 2 };
const GILT: MatSpec = { tex: 'plain', color: 0xd4ae58, rough: 0.6, metal: 0.25 };
const FLAME: MatSpec = { tex: 'plain', color: 0xffb040, rough: 1 };

function colonnade(w: number, d: number, h: number, step: number, y: number): NodeSpec[] {
  const out: NodeSpec[] = [];
  const nx = Math.round(w / step);
  const nz = Math.round(d / step);
  for (let i = 0; i <= nx; i++) {
    for (const z of [-d / 2, d / 2]) out.push({ geom: cyl(0.08, 0.095, h, 10), mat: MARBLE, t: [-w / 2 + i * step, y + h / 2, z] });
  }
  for (let j = 1; j < nz; j++) {
    for (const x of [-w / 2, w / 2]) out.push({ geom: cyl(0.08, 0.095, h, 10), mat: MARBLE, t: [x, y + h / 2, -d / 2 + j * step] });
  }
  return out;
}

function wonder(): THREE.Object3D {
  const base = 0.54; // top of the platform
  const H = 1.25; // column height
  const roof = base + H;
  return build({
    children: [
      // Three-tier platform.
      { geom: box(4.9, 0.18, 4.9), mat: 'stone', t: [0, 0.09, 0] },
      { geom: box(4.4, 0.18, 4.4), mat: 'stone', t: [0, 0.27, 0] },
      { geom: box(3.9, 0.18, 3.9), mat: MARBLE, t: [0, 0.45, 0] },
      // A broad stair toward the viewer (the +x/+z corner faces the camera).
      ...[0, 1, 2].map((i): NodeSpec => ({ geom: box(0.25, 0.18, 1.4), mat: MARBLE, t: [2.3 - i * 0.25, 0.09 + i * 0.18, 0.6] })),
      // Cella and peristyle.
      { geom: box(2.3, H, 2.0), mat: MARBLE, t: [-0.2, base + H / 2, -0.2] },
      { geom: box(0.02, 0.8, 0.5), mat: { tex: 'plain', color: 0x3a2a1c, rough: 1 }, t: [0.96, base + 0.4, -0.2] },
      ...colonnade(3.1, 2.9, H, 0.39, base),
      // Entablature with a team frieze, and a gilded gable roof with pediments.
      { geom: box(3.4, 0.16, 3.2), mat: MARBLE, t: [0, roof + 0.08, 0] },
      { geom: box(3.42, 0.07, 3.22), mat: 'team', t: [0, roof + 0.19, 0] },
      { t: [0, roof + 0.23, 0], children: [
        { geom: box(3.5, 0.05, 1.8), mat: 'rooftile', t: [0, 0.33, 0.8], r: [0.38, 0, 0] },
        { geom: box(3.5, 0.05, 1.8), mat: 'rooftile', t: [0, 0.33, -0.8], r: [-0.38, 0, 0] },
        { geom: box(3.52, 0.06, 0.08), mat: GOLD, t: [0, 0.66, 0] }, // gilded ridge
        ...[-1.72, 1.72].map((x): NodeSpec => ({ geom: sphere(0.09, 10), mat: GOLD, t: [x, 0.72, 0] })), // acroteria
        ...[-1.72, 1.72].map((x): NodeSpec => ({ t: [x, 0, 0], children: [pediment(3.2, 0.62, 0.08, MARBLE)] })),
        { geom: sphere(0.12, 10), mat: GOLD, t: [0, 0.7, 0] },
      ] },
      // Colossus on a plinth before the stair: a robed figure raising a torch.
      { t: [1.9, 0, 1.75], children: [
        { geom: box(0.5, 0.36, 0.5), mat: MARBLE, t: [0, 0.18, 0] },
        { geom: cyl(0.16, 0.25, 0.9, 12), mat: GILT, t: [0, 0.81, 0] }, // robe
        { geom: cyl(0.14, 0.16, 0.36, 12), mat: GILT, t: [0, 1.44, 0] }, // chest
        { geom: sphere(0.11, 12), mat: GILT, t: [0, 1.72, 0] }, // head
        { geom: cyl(0.14, 0.14, 0.05, 12), mat: GILT, t: [0, 1.82, 0] }, // crown
        { geom: cyl(0.045, 0.05, 0.5, 8), mat: GILT, t: [0.05, 1.8, 0.14], r: [0.25, 0, -0.15] }, // raised arm
        { geom: cyl(0.06, 0.04, 0.12, 8), mat: GILT, t: [0.1, 2.1, 0.21] },
        { geom: cone(0.06, 0.16, 8), mat: FLAME, t: [0.1, 2.24, 0.21] },
      ] },
      // Flame bowls at the platform corners, banners on the far corners.
      ...[[-2.2, 2.2], [2.2, -2.2]].flatMap(([x, z]): NodeSpec[] => [
        { geom: cyl(0.08, 0.1, 0.4, 8), mat: 'stone', t: [x!, 0.2, z!] },
        { geom: cyl(0.14, 0.08, 0.08, 10), mat: 'bronze', t: [x!, 0.44, z!] },
        { geom: cone(0.08, 0.16, 8), mat: FLAME, t: [x!, 0.55, z!] },
      ]),
      banner(-2.3, -2.3, 1.2),
      banner(-2.3, 0.2, 1.1),
      banner(0.2, -2.3, 1.1),
    ],
  });
}

export const WONDER_MODELS: ModelDef[] = [{ id: 'wonder', kind: 'building', footprint: 5, facings: 1, build: wonder }];
