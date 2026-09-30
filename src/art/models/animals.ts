import type * as THREE from 'three';
import { build, cone, cyl, lumpy, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { ease } from '../dsl/rig.ts';
import { applyQuadPose, quadBodyY, quadDie, quadruped, quadWalk, type QuadOpts, type QuadPose } from '../dsl/quad.ts';
import type { ClipDef, ModelDef } from './types.ts';

/**
 * Wild animals (Gaia): gazelle (flees), elephant (fights back), lion (hunts villagers). One quadruped rig with
 * per-species proportions. The last `die` frame doubles as the carcass hunters butcher.
 */
const TAN: MatSpec = { tex: 'hair', color: 0xb8864e, rough: 0.9, repeat: 3 };
const CREAM: MatSpec = { tex: 'hair', color: 0xe8dcc4, rough: 0.9, repeat: 3 };
const HORN: MatSpec = { tex: 'plain', color: 0x2a2420, rough: 0.6 };
const ELEPHANT: MatSpec = { tex: 'leather', color: 0x8a8886, rough: 0.95, repeat: 2 };
const IVORY: MatSpec = { tex: 'plain', color: 0xf0e8d8, rough: 0.4 };
const LION: MatSpec = { tex: 'hair', color: 0xc89a58, rough: 0.9, repeat: 3 };
const MANE: MatSpec = { tex: 'hair', color: 0x7a4a24, rough: 1, repeat: 4 };

function clips(o: QuadOpts, opts: { swing: number; gait?: 'trot' | 'amble'; idle: (t: number, y: number) => QuadPose; attack: (t: number, y: number) => QuadPose }): Record<string, ClipDef> {
  const y = quadBodyY(o);
  const clip = (frames: number, fps: number, loop: boolean, pose: (t: number) => QuadPose, markers?: Record<string, number>): ClipDef => ({
    frames,
    fps,
    loop,
    pose: (root: THREE.Object3D, t: number) => applyQuadPose(root, pose(t), y),
    ...(markers ? { markers } : {}),
  });
  return {
    idle: clip(8, 5, true, (t) => opts.idle(t, y)),
    walk: clip(10, 12, true, (t) => quadWalk(t, opts.swing, y, opts.gait)),
    attack: clip(8, 10, false, (t) => opts.attack(t, y), { hit: 0.5 }),
    die: clip(10, 10, false, (t) => quadDie(t, y, o.bodyR)),
  };
}

// ── Gazelle ─────────────────────────────────────────────────────────────────────────────────────────────────
const GAZELLE: QuadOpts = {
  mat: TAN,
  belly: CREAM,
  bodyLen: 0.3,
  bodyR: 0.085,
  legLen: 0.3,
  legR: 0.016,
  hipW: 0.045,
  neckLen: 0.16,
  neckTilt: 0.45,
  neckR: 0.03,
  hoof: HORN,
  head: [
    { geom: sphere(0.045, 9), mat: TAN, t: [0.04, 0.01, 0], s: [1.5, 0.9, 0.85] },
    { geom: sphere(0.02, 6), mat: HORN, t: [0.1, -0.005, 0] },
    { geom: cone(0.012, 0.16, 5), mat: HORN, t: [-0.02, 0.09, 0.02], r: [0.1, 0, 0.45] },
    { geom: cone(0.012, 0.16, 5), mat: HORN, t: [-0.02, 0.09, -0.02], r: [-0.1, 0, 0.45] },
    { geom: cone(0.018, 0.06, 5), mat: TAN, t: [-0.01, 0.04, 0.035], r: [0.9, 0, 0.3] },
    { geom: cone(0.018, 0.06, 5), mat: TAN, t: [-0.01, 0.04, -0.035], r: [-0.9, 0, 0.3] },
    // A dark flank stripe reads as "gazelle" at this size.
  ],
  tail: [{ geom: cyl(0.01, 0.006, 0.07, 5), mat: HORN, t: [-0.01, -0.03, 0], r: [0, 0, 0.5] }],
};

function gazelle(): THREE.Object3D {
  const spec = quadruped(GAZELLE);
  (spec.children![0]!.children!).push({ geom: cyl(0.004, 0.004, 0.26, 4), mat: HORN, t: [0, -0.01, 0.075], r: [0, 0, Math.PI / 2] });
  (spec.children![0]!.children!).push({ geom: cyl(0.004, 0.004, 0.26, 4), mat: HORN, t: [0, -0.01, -0.075], r: [0, 0, Math.PI / 2] });
  return build(spec);
}

const GAZELLE_CLIPS = clips(GAZELLE, {
  swing: 0.55,
  // Grazing: the head dips to the grass and comes back up to look around.
  idle: (t, y) => {
    const down = t < 0.6 ? ease(t, 0.05, 0.3) : 1 - ease(t, 0.6, 0.85);
    return { bodyY: y, neck: [0, 0, -1.45 * down], head: [0, 0, -0.3 * down], tail: [0.3 * Math.sin(t * Math.PI * 4), 0, 0] };
  },
  // Gazelles don't attack; a startled hop.
  attack: (t, y) => ({ bodyY: y + 0.06 * Math.sin(t * Math.PI), pitch: 0.2 * Math.sin(t * Math.PI), legFL: [0, 0, 0.5], legFR: [0, 0, 0.5], legBL: [0, 0, -0.4], legBR: [0, 0, -0.4] }),
});

// ── Elephant ────────────────────────────────────────────────────────────────────────────────────────────────
const TRUNK: NodeSpec = {
  bone: 'trunk',
  t: [0.2, -0.05, 0],
  children: [
    { geom: cyl(0.055, 0.045, 0.16, 8), mat: ELEPHANT, t: [0, -0.08, 0] },
    {
      bone: 'trunk2',
      t: [0, -0.16, 0],
      children: [
        { geom: cyl(0.045, 0.035, 0.16, 8), mat: ELEPHANT, t: [0, -0.08, 0] },
        { bone: 'trunk3', t: [0, -0.16, 0], children: [{ geom: cyl(0.035, 0.028, 0.14, 8), mat: ELEPHANT, t: [0, -0.07, 0] }] },
      ],
    },
  ],
};
export const ELEPHANT_OPTS: QuadOpts = {
  mat: ELEPHANT,
  bodyLen: 0.48,
  bodyR: 0.27,
  legLen: 0.52,
  legR: 0.075,
  hipW: 0.16,
  neckLen: 0.1,
  neckTilt: 1.1,
  neckR: 0.18,
  hoof: { tex: 'plain', color: 0x5a5856, rough: 1 },
  head: [
    { geom: sphere(0.2, 12), mat: ELEPHANT, t: [0.1, 0.02, 0], s: [1, 1.05, 0.9] },
    // Big ears (flat discs) on either side, tusks curving forward and up, the trunk hanging from the face.
    { geom: cyl(0.2, 0.2, 0.02, 14), mat: ELEPHANT, t: [0.0, 0.02, 0.17], r: [Math.PI / 2, 0, 0], s: [0.85, 1, 1.15] },
    { geom: cyl(0.2, 0.2, 0.02, 14), mat: ELEPHANT, t: [0.0, 0.02, -0.17], r: [Math.PI / 2, 0, 0], s: [0.85, 1, 1.15] },
    { geom: cone(0.025, 0.24, 6), mat: IVORY, t: [0.3, -0.12, 0.08], r: [0.2, 0, -1.2] },
    { geom: cone(0.025, 0.24, 6), mat: IVORY, t: [0.3, -0.12, -0.08], r: [-0.2, 0, -1.2] },
    { geom: sphere(0.02, 6), mat: HORN, t: [0.22, 0.08, 0.12] },
    { geom: sphere(0.02, 6), mat: HORN, t: [0.22, 0.08, -0.12] },
    TRUNK,
  ],
  tail: [{ geom: cyl(0.015, 0.01, 0.28, 5), mat: ELEPHANT, t: [0, -0.14, 0], r: [0, 0, 0.25] }],
};

/** The elephant's quadruped spec (shared with the war elephants). */
export function elephantSpec(): NodeSpec {
  const spec = quadruped(ELEPHANT_OPTS);
  // Shoulder hump and a sloping rump break up the capsule silhouette.
  spec.children![0]!.children!.push(
    { geom: sphere(0.28, 12), mat: ELEPHANT, t: [0.16, 0.06, 0], s: [1, 1.05, 0.9] },
    { geom: sphere(0.24, 12), mat: ELEPHANT, t: [-0.2, -0.01, 0], s: [1, 1, 0.92] },
  );
  return spec;
}

function elephant(): THREE.Object3D {
  return build(elephantSpec());
}

const ELEPHANT_CLIPS = clips(ELEPHANT_OPTS, {
  swing: 0.32,
  gait: 'amble',
  // Standing: the trunk sways and the tail swishes.
  idle: (t, y) => {
    const s = Math.sin(t * Math.PI * 2);
    return { bodyY: y, trunk: [0.15 * s, 0, 0.1], trunk2: [0.2 * s, 0, 0.25], trunk3: [0.15 * s, 0, 0.3], tail: [0.35 * s, 0, 0], head: [0, 0, 0.03 * s] };
  },
  // Rears up, trunk raised, and stamps down on the target (hit at the stamp).
  attack: (t, y) => {
    const up = t < 0.4 ? ease(t, 0, 0.4) : 1 - ease(t, 0.4, 0.55);
    return {
      bodyY: y + 0.05 * up,
      pitch: 0.42 * up,
      legFL: [0, 0, 0.9 * up],
      legFR: [0, 0, 0.7 * up],
      shinFL: [0, 0, -1.1 * up],
      shinFR: [0, 0, -0.9 * up],
      legBL: [0, 0, -0.3 * up],
      legBR: [0, 0, -0.3 * up],
      trunk: [0, 0, 1.1 * up],
      trunk2: [0, 0, 0.9 * up],
      trunk3: [0, 0, 0.7 * up],
      head: [0, 0, 0.25 * up],
    };
  },
});

// ── Lion ────────────────────────────────────────────────────────────────────────────────────────────────────
const LION_OPTS: QuadOpts = {
  mat: LION,
  belly: { tex: 'hair', color: 0xd8b880, rough: 0.9, repeat: 3 },
  bodyLen: 0.34,
  bodyR: 0.1,
  legLen: 0.2,
  legR: 0.028,
  hipW: 0.05,
  neckLen: 0.08,
  neckTilt: 0.9,
  neckR: 0.07,
  hoof: LION,
  head: [
    { geom: lumpy(0.11, 0.25, 21, 1), mat: MANE, t: [0, 0.0, 0], s: [0.9, 1, 1] },
    { geom: sphere(0.065, 9), mat: LION, t: [0.07, -0.01, 0], s: [1.2, 1, 1] },
    { geom: sphere(0.025, 6), mat: HORN, t: [0.14, -0.01, 0] },
  ],
  tail: [
    // Hangs back and down (axis (−0.8, −0.6)); the dark tuft sits at its tip.
    { geom: cyl(0.012, 0.01, 0.26, 5), mat: LION, t: [-0.104, -0.078, 0], r: [0, 0, 2.21] },
    { geom: sphere(0.025, 6), mat: MANE, t: [-0.21, -0.16, 0] },
  ],
};

const LION_CLIPS = clips(LION_OPTS, {
  swing: 0.5,
  idle: (t, y) => ({ bodyY: y, tail: [0.4 * Math.sin(t * Math.PI * 2), 0, 0], head: [0.2 * Math.sin(t * Math.PI * 2), 0, 0] }),
  // Pounce: crouch, spring forward with the forepaws out, land (hit at the landing).
  attack: (t, y) => {
    const crouch = t < 0.3 ? ease(t, 0, 0.3) : 1 - ease(t, 0.3, 0.45);
    const leap = t < 0.3 ? 0 : t < 0.6 ? ease(t, 0.3, 0.45) : 1 - ease(t, 0.6, 1);
    return {
      bodyY: y - 0.06 * crouch + 0.08 * leap,
      pitch: 0.25 * leap - 0.05 * crouch,
      legFL: [0, 0, 1.0 * leap],
      legFR: [0, 0, 0.9 * leap],
      shinFL: [0, 0, -0.5 * crouch],
      shinFR: [0, 0, -0.5 * crouch],
      legBL: [0, 0, -0.7 * leap + 0.5 * crouch],
      legBR: [0, 0, -0.7 * leap + 0.5 * crouch],
      shinBL: [0, 0, 0.9 * crouch],
      shinBR: [0, 0, 0.9 * crouch],
    };
  },
});

export const ANIMAL_MODELS: ModelDef[] = [
  { id: 'gazelle', kind: 'unit', facings: 8, build: gazelle, clips: GAZELLE_CLIPS },
  { id: 'elephant', kind: 'unit', facings: 8, build: elephant, clips: ELEPHANT_CLIPS },
  { id: 'lion', kind: 'unit', facings: 8, build: () => build(quadruped(LION_OPTS)), clips: LION_CLIPS },
];
