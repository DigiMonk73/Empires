import type * as THREE from 'three';
import { box, build, cone, cyl, lumpy, sphere, type MatSpec, type NodeSpec, type Vec3 } from '../dsl/model.ts';
import { ease } from '../dsl/rig.ts';
import { applyQuadPose, quadBodyY, quadDie, quadruped, quadWalk, type QuadOpts, type QuadPose } from '../dsl/quad.ts';
import type { ClipDef, ModelDef } from './types.ts';

/**
 * Wild animals (Gaia): gazelle (flees), elephant (fights back), lion (hunts villagers), alligator (lurks on
 * shores). One quadruped rig with per-species proportions. The last `die` frame doubles as the carcass hunters
 * butcher.
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

// ── Alligator ───────────────────────────────────────────────────────────────────────────────────────────────
// Low and long: a flattened body on sprawling legs (upper legs splayed out, forearms down), a long flat snout
// with a hinged jaw and a pale tooth line, a ridged back and a heavy tapering tail. Dies belly-up.
const GATOR: MatSpec = { tex: 'scales', color: 0x6e7e48, rough: 0.7, repeat: 7 };
const GATOR_DARK: MatSpec = { tex: 'scales', color: 0x3e4a2a, rough: 0.7, repeat: 9 };
const GATOR_BELLY: MatSpec = { tex: 'leather', color: 0xcfc596, rough: 0.8, repeat: 4 };
const TEETH: MatSpec = { tex: 'plain', color: 0xf2ecd8, rough: 0.5 };
const EYE: MatSpec = { tex: 'plain', color: 0xd8b830, rough: 0.3 };

const GATOR_OPTS: QuadOpts = {
  mat: GATOR,
  belly: GATOR_BELLY,
  bodyLen: 0.3,
  bodyR: 0.06,
  legLen: 0.1,
  legR: 0.022,
  hipW: 0.065,
  neckLen: 0.05,
  neckTilt: 1.45,
  neckR: 0.05,
  hoof: GATOR_DARK,
  head: [
    { geom: sphere(0.05, 10), mat: GATOR, t: [0.01, 0.0, 0], s: [1.3, 0.62, 1.05] },
    // Upper snout: a flattened taper forward (+X), the tooth line along its lower edge, eyes and nostrils on top.
    { geom: cyl(0.022, 0.042, 0.17, 8), mat: GATOR, t: [0.11, -0.004, 0], r: [0, 0, -Math.PI / 2], s: [0.5, 1, 1] },
    { geom: box(0.15, 0.008, 0.062), mat: TEETH, t: [0.11, -0.018, 0] },
    { geom: sphere(0.015, 6), mat: EYE, t: [0.01, 0.028, 0.028] },
    { geom: sphere(0.015, 6), mat: EYE, t: [0.01, 0.028, -0.028] },
    { geom: sphere(0.009, 5), mat: GATOR_DARK, t: [0.19, 0.008, 0] },
    {
      bone: 'jaw',
      t: [0.0, -0.02, 0],
      children: [{ geom: cyl(0.018, 0.036, 0.17, 8), mat: GATOR_BELLY, t: [0.1, -0.004, 0], r: [0, 0, -Math.PI / 2], s: [0.38, 1, 0.95] }],
    },
  ],
  tail: [
    // Heavy at the root, tapering to a point behind (−X), flattened, with a dark crest of scutes.
    { geom: cone(0.052, 0.4, 9), mat: GATOR, t: [-0.17, -0.03, 0], r: [0, 0, Math.PI / 2], s: [0.7, 1, 1] },
    ...[0, 1, 2, 3, 4].map((i): NodeSpec => ({ geom: cone(0.012, 0.03, 4), mat: GATOR_DARK, t: [-0.04 - i * 0.07, 0.006 - i * 0.006, 0] })),
  ],
};

function gator(): THREE.Object3D {
  const spec = quadruped(GATOR_OPTS);
  const body = spec.children![0]!;
  const kids = body.children!;
  kids[0] = { ...kids[0]!, s: [0.7, 1, 1.25] }; // flatten the barrel, widen it
  if (GATOR_OPTS.belly) kids[1] = { ...kids[1]!, s: [3.0, 0.4, 1.15] };
  for (let i = 0; i < 6; i++) kids.push({ geom: cone(0.014, 0.034, 4), mat: GATOR_DARK, t: [0.15 - i * 0.06, 0.045, 0] });
  return build({ ...spec, s: 1.35 }); // a big bull: longer than a lion, about a villager's height in length
}

/** Splay the legs out sideways (the sprawl) with the forearms back down, on top of a walk/idle pose. */
function sprawl(p: QuadPose, splay: number): QuadPose {
  for (const k of ['FL', 'FR', 'BL', 'BR'] as const) {
    const side = k[1] === 'L' ? 1 : -1; // +X rotation swings a hanging leg toward −Z (the left side)
    const leg = (p[`leg${k}`] as Vec3 | undefined) ?? [0, 0, 0];
    const shin = (p[`shin${k}`] as Vec3 | undefined) ?? [0, 0, 0];
    p[`leg${k}`] = [side * splay, leg[1], leg[2]];
    p[`shin${k}`] = [-side * splay * 0.9, shin[1], shin[2]];
  }
  return p;
}

const GATOR_WALK_Y = 0.09;
const GATOR_REST_Y = 0.07;
const gatorClip = (frames: number, fps: number, loop: boolean, pose: (t: number) => QuadPose, markers?: Record<string, number>): ClipDef => ({
  frames,
  fps,
  loop,
  pose: (root: THREE.Object3D, t: number) => applyQuadPose(root, pose(t), GATOR_WALK_Y),
  ...(markers ? { markers } : {}),
});

const GATOR_CLIPS: Record<string, ClipDef> = {
  // Basking: belly low, the tail sweeping slowly, the jaw easing open and shut.
  idle: gatorClip(8, 4, true, (t) => {
    const a = t * Math.PI * 2;
    return sprawl({ bodyY: GATOR_REST_Y, tail: [0, 0.25 * Math.sin(a), 0], jaw: [0, 0, -0.25 * Math.max(0, Math.sin(a))], neck: [0, 0.05 * Math.sin(a), 0] }, 1.25);
  }),
  // A waddling high walk: diagonal legs, the body rolling and the tail swinging against the stride.
  walk: gatorClip(10, 10, true, (t) => {
    const a = t * Math.PI * 2;
    const p = quadWalk(t, 0.55, GATOR_WALK_Y);
    p.bodyY = GATOR_WALK_Y + 0.005 * Math.cos(2 * a);
    p.roll = 0.06 * Math.sin(a);
    p.tail = [0, -0.35 * Math.sin(a), 0];
    p.neck = [0, 0.12 * Math.sin(a), 0];
    return sprawl(p, 1.1);
  }),
  // Snap: rear the head back with the jaws wide, lunge and clamp shut (hit), shake.
  attack: gatorClip(8, 10, false, (t) => {
    const open = t < 0.4 ? ease(t, 0, 0.4) : 1 - ease(t, 0.4, 0.5);
    const lunge = t < 0.35 ? 0 : t < 0.6 ? ease(t, 0.35, 0.5) : 1 - ease(t, 0.6, 1);
    return sprawl({ bodyY: GATOR_WALK_Y + 0.01 * lunge, pitch: 0.12 * open - 0.05 * lunge, neck: [0, 0.1 * Math.sin(t * 12) * lunge, 0.25 * open - 0.15 * lunge], jaw: [0, 0, -0.75 * open], tail: [0, 0.3 * lunge, 0] }, 1.1);
  }, { hit: 0.5 }),
  // Thrash and roll belly-up (the last frame is the carcass).
  die: gatorClip(10, 10, false, (t) => {
    const f = t < 0.25 ? 0 : Math.min(1, (t - 0.25) / 0.65);
    const roll = f * f * (3 - 2 * f);
    const thrash = t < 0.3 ? Math.sin(t * 30) * (1 - t / 0.3) : 0;
    return sprawl({ bodyY: GATOR_WALK_Y - (GATOR_WALK_Y - 0.045) * Math.min(1, t / 0.25 + roll), roll: -3.0 * roll, tail: [0, 0.5 * thrash, -0.2 * roll], neck: [0, 0.3 * thrash, -0.3 * roll], jaw: [0, 0, -0.35 * roll], legFL: [0, 0, 0.4 * roll], legBL: [0, 0, -0.4 * roll] }, 1.1 + 0.4 * roll);
  }),
};

export const ANIMAL_MODELS: ModelDef[] = [
  { id: 'gazelle', kind: 'unit', facings: 8, build: gazelle, clips: GAZELLE_CLIPS },
  { id: 'elephant', kind: 'unit', facings: 8, build: elephant, clips: ELEPHANT_CLIPS },
  { id: 'lion', kind: 'unit', facings: 8, build: () => build(quadruped(LION_OPTS)), clips: LION_CLIPS },
  { id: 'alligator', kind: 'unit', facings: 8, build: gator, clips: GATOR_CLIPS },
];
