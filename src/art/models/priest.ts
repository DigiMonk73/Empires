import * as THREE from 'three';
import { box, build, cone, cyl, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { diePose, ease, humanoid, idlePose, walkPose, type Pose } from '../dsl/rig.ts';
import { banner, pediment } from './buildings.ts';
import { clip } from './soldiers.ts';
import type { ClipDef, ModelDef } from './types.ts';

/**
 * The priest and the temple (M7.5). The priest wears a long robe with a team-coloured stole and carries a staff
 * crowned with a bronze sun disc; he chants with both arms raised to convert, and holds his hands out over the
 * wounded to heal. The temple is a Bronze-age shrine: a stepped platform, a colonnade and a tiled pediment roof.
 */
const ROBE: MatSpec = { tex: 'cloth', color: 0xece4d0, rough: 1, repeat: 5 };
const MARBLE: MatSpec = { tex: 'plaster', color: 0xe8e2d4, rough: 0.7, repeat: 2 };

const robe: NodeSpec = { geom: cyl(0.1, 0.15, 0.42, 12), mat: ROBE, t: [0, -0.2, 0] };
const stole: NodeSpec[] = [
  { geom: box(0.03, 0.34, 0.05), mat: 'team', t: [0.1, 0.1, 0.05], r: [0, 0, 0.05] },
  { geom: box(0.03, 0.34, 0.05), mat: 'team', t: [0.1, 0.1, -0.05], r: [0, 0, 0.05] },
];
const staff: NodeSpec[] = [
  { r: [0, 0, 0.2], children: [
    { geom: cyl(0.01, 0.012, 0.75, 6), mat: 'wood', t: [0, -0.15, 0] },
    { geom: cyl(0.045, 0.045, 0.012, 14), mat: 'bronze', t: [0, 0.25, 0], r: [Math.PI / 2, 0, 0] },
    { geom: sphere(0.018, 8), mat: 'bronze', t: [0, 0.25, 0.006] },
  ] },
];
const hood: NodeSpec = { geom: sphere(0.08, 10), mat: ROBE, t: [-0.01, 0.07, 0], s: [1.05, 0.95, 1.05] };

/** Chanting: both arms raised to the sky, swaying (a loop while the conversion lasts). */
function chant(t: number): Pose {
  const sway = Math.sin(t * Math.PI * 2);
  return {
    armL: [-0.35, 0, 2.6 + 0.15 * sway],
    armR: [0.35, 0, 2.6 - 0.15 * sway],
    foreL: [0, 0, 0.3],
    foreR: [0, 0, 0.3],
    head: [0, 0, 0.25],
    lean: -0.08,
  };
}

/** Healing: hands held out and down over the patient, a slow rise and fall. */
function heal(t: number): Pose {
  const b = 0.1 * Math.sin(t * Math.PI * 2);
  return { armL: [-0.2, 0, 1.2 + b], armR: [0.2, 0, 1.2 + b], foreL: [0, 0, 0.4], foreR: [0, 0, 0.4], lean: 0.2, head: [0, 0, -0.2] };
}

const PRIEST_CLIPS: Record<string, ClipDef> = {
  idle: clip(6, 4, true, (t) => ({ ...idlePose(t), armR: [0.15, 0, 0.3], foreR: [0, 0, 1.0] })),
  walk: clip(10, 10, true, (t) => ({ ...walkPose(t), armR: [0.15, 0, 0.3], foreR: [0, 0, 1.0] })),
  convert: clip(10, 8, true, chant, undefined, { hit: 0 }), // `hit` cues the chant sound each loop
  heal: clip(8, 6, true, heal),
  die: clip(10, 10, false, diePose),
};

// ── Temple ────────────────────────────────────────────────────────────────────────────────────────────────
function temple(): THREE.Object3D {
  const cols: NodeSpec[] = [];
  const H = 0.9;
  for (let i = 0; i < 6; i++) {
    const x = -0.9 + i * 0.36;
    for (const z of [-0.7, 0.7]) cols.push({ geom: cyl(0.06, 0.07, H, 10), mat: MARBLE, t: [x, 0.3 + H / 2, z] });
  }
  for (let i = 1; i < 4; i++) for (const x of [-0.9, 0.9]) cols.push({ geom: cyl(0.06, 0.07, H, 10), mat: MARBLE, t: [x, 0.3 + H / 2, -0.7 + i * 0.35] });
  const roofY = 0.3 + H;
  return build({
    children: [
      // Stepped platform.
      { geom: box(2.6, 0.1, 2.3), mat: 'stone', t: [0, 0.05, 0] },
      { geom: box(2.4, 0.1, 2.1), mat: 'stone', t: [0, 0.15, 0] },
      { geom: box(2.2, 0.1, 1.9), mat: MARBLE, t: [0, 0.25, 0] },
      // Cella walls inside the colonnade, with a doorway toward the viewer.
      { geom: box(1.3, H, 0.9), mat: MARBLE, t: [0, 0.3 + H / 2, 0] },
      { geom: box(0.02, 0.5, 0.3), mat: { tex: 'plain', color: 0x3a2a1c, rough: 1 }, t: [0.66, 0.55, 0] },
      ...cols,
      // Entablature and a gable roof with pediments.
      { geom: box(2.0, 0.12, 1.62), mat: MARBLE, t: [0, roofY + 0.06, 0] },
      { geom: box(2.0, 0.05, 1.64), mat: 'team', t: [0, roofY + 0.14, 0] },
      { t: [0, roofY + 0.17, 0], children: [
        { geom: box(2.1, 0.04, 0.95), mat: 'rooftile', t: [0, 0.2, 0.4], r: [0.42, 0, 0] },
        { geom: box(2.1, 0.04, 0.95), mat: 'rooftile', t: [0, 0.2, -0.4], r: [-0.42, 0, 0] },
        ...[-1.03, 1.03].map((x): NodeSpec => ({ t: [x, 0, 0], children: [pediment(1.62, 0.36, 0.06, MARBLE)] })),
      ] },
      // An altar with a flame bowl in front.
      { geom: box(0.3, 0.25, 0.3), mat: 'stone', t: [1.1, 0.12, 0.7] },
      { geom: cyl(0.12, 0.08, 0.06, 10), mat: 'bronze', t: [1.1, 0.28, 0.7] },
      { geom: cone(0.07, 0.14, 8), mat: { tex: 'plain', color: 0xffb040, rough: 1, glow: true }, t: [1.1, 0.37, 0.7] },
      banner(-1.15, 1.0, 0.9),
      banner(1.15, -1.0, 0.9),
    ],
  });
}

export const PRIEST_MODELS: ModelDef[] = [
  { id: 'priest', kind: 'unit', facings: 8, clips: PRIEST_CLIPS, build: () => build(humanoid({ top: 'plaster', skirt: 'cloth', rightHand: staff, head: [hood], torso: [robe, ...stole], hair: null })) },
  { id: 'temple', kind: 'building', footprint: 3, facings: 1, build: temple },
];
