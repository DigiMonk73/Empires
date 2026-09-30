import type * as THREE from 'three';
import { box, build, cone, cyl, lumpy, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { applyPose, diePose, ease, HIP_Y, humanoid, idlePose, showProps, walkPose, type Pose } from '../dsl/rig.ts';
import type { ClipDef, ModelDef } from './types.ts';

/**
 * Stone- and Tool-age infantry: clubman, axeman, slinger, bowman. Each is the humanoid rig dressed from a small
 * kit (tunic, belt, headgear, weapon). Attack clips are 10 frames at 12 fps with the blow / release on frame 4
 * (t = 0.33 s), matching the sim's 7-tick windup (D26); the last frame is a ready stance, held until the next
 * swing starts.
 */
const STONE_HEAD: MatSpec = { tex: 'rock', color: 0x8a8580, rough: 0.9, repeat: 2 };
const STRING: MatSpec = { tex: 'plain', color: 0xe8e0c8, rough: 1 };
const FEATHER: MatSpec = { tex: 'plain', color: 0xf0ece0, rough: 1 };

const ATTACK = { frames: 10, fps: 12, hit: 4 / 9 } as const;

function clip(frames: number, fps: number, loop: boolean, pose: (t: number) => Pose, props?: (t: number) => readonly string[], markers?: Record<string, number>): ClipDef {
  return {
    frames,
    fps,
    loop,
    pose: (root: THREE.Object3D, t: number) => {
      applyPose(root, pose(t));
      if (props) showProps(root, props(t));
    },
    ...(markers ? { markers } : {}),
  };
}

/** Standard kit around a weapon-specific attack; `props` chooses what is in hand per clip and time. */
function soldierClips(attack: (t: number) => Pose, props?: { idle: readonly string[]; attack?: (t: number) => readonly string[] }, hold: Pose = {}): Record<string, ClipDef> {
  const always = props ? () => props.idle : undefined;
  return {
    idle: clip(6, 4, true, (t) => ({ ...idlePose(t), ...ready, ...hold }), always),
    walk: clip(10, 12, true, (t) => ({ ...walkPose(t), ...hold }), always),
    attack: clip(ATTACK.frames, ATTACK.fps, false, attack, props?.attack ?? always, { hit: ATTACK.hit }),
    die: clip(10, 10, false, diePose, always),
  };
}

/** Weapon held ready in front: right forearm raised a little. */
const ready: Pose = { armR: [0.15, 0, 0.35], foreR: [0, 0, 0.7] };

const stance = (lean: number): Pose => ({ legL: [0, 0, 0.3], legR: [0, 0, -0.25], shinL: [0, 0, -0.12], shinR: [0, 0, -0.05], hipY: HIP_Y - 0.015, lean });

/** One-handed overhead blow (club, axe): wind up behind the head, smash down at t = 0.44, recover to ready. */
function overhead(t: number): Pose {
  const up = ease(t, 0, 0.3);
  const down = ease(t, 0.3, 0.44);
  const back = ease(t, 0.55, 1);
  const a = 0.35 + (2.9 - 0.35) * up - (2.9 - 0.5) * down + (0.35 - 0.5) * back;
  const fore = 0.7 + 0.5 * up - 1.1 * down + 0.6 * back;
  return {
    ...stance(0.05 + 0.3 * down * (1 - back)),
    armR: [0.2, 0, a],
    foreR: [0, 0, fore],
    armL: [-0.25, 0, 0.5 - 0.3 * down],
    foreL: [0, 0, 0.6],
  };
}

/** Sling: whirl it over the head twice, whip the arm forward to release at t = 0.44, recover. */
function sling(t: number): Pose {
  const whirl = t < 0.36 ? Math.sin((t / 0.36) * Math.PI * 4) : 0;
  const raise = ease(t, 0, 0.12) * (1 - ease(t, 0.36, 0.44));
  const throwK = ease(t, 0.36, 0.44) * (1 - ease(t, 0.6, 1));
  return {
    ...stance(0.08 + 0.2 * throwK),
    armR: [0.3 + 0.4 * whirl * raise, 0, 0.35 + 2.4 * raise + 1.3 * throwK],
    foreR: [0, 0, 0.7 - 0.6 * raise + 0.3 * whirl * raise - 0.5 * throwK],
    armL: [-0.2, 0, 0.6 * raise + 0.3],
    foreL: [0, 0, 0.5],
  };
}

/** Bow: raise the bow arm, draw to the cheek, loose at t = 0.44 (hand flicks back), lower. */
function bow(t: number): Pose {
  const raise = ease(t, 0, 0.18) * (1 - ease(t, 0.6, 1));
  const draw = ease(t, 0.12, 0.4) * (1 - ease(t, 0.44, 0.5));
  const flick = ease(t, 0.44, 0.5) * (1 - ease(t, 0.6, 1));
  return {
    ...stance(0.02),
    spine: [0, -0.35 * raise, 0], // side-on to the target while shooting
    armL: [-0.1, 0.25 * raise, 0.4 + 1.15 * raise],
    foreL: [0, 0, 0.35 - 0.3 * raise],
    armR: [0.35 * raise, -0.4 * raise, 0.35 + 1.1 * raise - 0.2 * flick],
    foreR: [0, 0, 0.7 + 1.5 * draw + 0.3 * flick],
    head: [0, 0.3 * raise, 0],
  };
}

// ── Kit pieces ──────────────────────────────────────────────────────────────────────────────────────────────
const belt: NodeSpec = { geom: cyl(0.1, 0.1, 0.035, 10), mat: 'leather', t: [0, 0.035, 0] };
/**
 * One-handed weapons sit 0.9 rad off the forearm line: pointing at the target at the moment of impact, cocked
 * behind the head at the top of the wind-up, and raised in the ready stance. Blades lead on local −X (D-art).
 */
const GRIP = 0.9;
const club: NodeSpec[] = [
  { r: [0, 0, GRIP], children: [
    { geom: cyl(0.03, 0.014, 0.3, 7), mat: 'wood', t: [0.005, -0.13, 0] },
    { geom: lumpy(0.034, 0.25, 7, 0), mat: 'bark', t: [0.005, -0.27, 0] },
  ] },
];
const stoneAxe: NodeSpec[] = [
  { r: [0, 0, GRIP], children: [
    { geom: cyl(0.014, 0.016, 0.32, 6), mat: 'wood', t: [0, -0.12, 0] },
    { geom: box(0.11, 0.07, 0.03), mat: STONE_HEAD, t: [-0.05, -0.25, 0] },
    { geom: box(0.03, 0.05, 0.035), mat: 'leather', t: [0, -0.25, 0] },
  ] },
];
const slingCord: NodeSpec[] = [
  { name: 'prop:sling', children: [
    { geom: cyl(0.004, 0.004, 0.22, 4), mat: 'leather', t: [0, -0.11, 0] },
    { geom: sphere(0.022, 6), mat: 'leather', t: [0, -0.23, 0] },
  ] },
];
const bowStave: NodeSpec[] = [
  // A short self bow across the left fist: its long axis on the hand's local X, so it stands upright while the
  // arm is raised to shoot; limbs bend toward the archer, string on the near side.
  { r: [0, 0, Math.PI / 2], children: [
    { geom: cyl(0.012, 0.009, 0.3, 6), mat: 'wood', t: [0.03, 0.14, 0], r: [0, 0, 0.22] },
    { geom: cyl(0.012, 0.009, 0.3, 6), mat: 'wood', t: [0.03, -0.14, 0], r: [0, 0, -0.22] },
    { geom: cyl(0.003, 0.003, 0.56, 4), mat: STRING, t: [-0.035, 0, 0] },
  ] },
];
const nockedArrow: NodeSpec[] = [
  { name: 'prop:arrow', children: [
    { geom: cyl(0.005, 0.005, 0.36, 4), mat: 'wood', t: [0, -0.02, 0.0], r: [Math.PI / 2, 0, 0] },
    { geom: cone(0.011, 0.04, 4), mat: STONE_HEAD, t: [0, -0.02, -0.19], r: [-Math.PI / 2, 0, 0] },
  ] },
];
const quiver: NodeSpec = {
  t: [-0.1, 0.18, 0.04],
  r: [0.35, 0, -0.3],
  children: [
    { geom: cyl(0.035, 0.03, 0.22, 8), mat: 'leather' },
    ...[-0.012, 0.012].map((z): NodeSpec => ({ geom: cone(0.012, 0.03, 4), mat: FEATHER, t: [0, 0.13, z] })),
  ],
};
const stonePouch: NodeSpec = { geom: sphere(0.045, 7), mat: 'leather', t: [0.03, -0.02, 0.1], s: [1, 1.2, 0.8] };
const leatherCap: NodeSpec = { geom: sphere(0.074, 10), mat: 'leather', t: [-0.005, 0.085, 0], s: [1, 0.62, 1] };
const headband: NodeSpec = { geom: cyl(0.072, 0.072, 0.02, 12), mat: 'team', t: [0, 0.075, 0] };
const shoulderPelt: NodeSpec = { geom: sphere(0.1, 9), mat: { tex: 'hair', color: 0x6a4a2a, rough: 1, repeat: 3 }, t: [0.0, 0.25, 0.05], s: [1, 0.45, 1.25] };

export const SOLDIER_MODELS: ModelDef[] = [
  {
    id: 'clubman',
    kind: 'unit',
    facings: 8,
    build: () => build(humanoid({ top: 'team', skirt: 'leather', bulk: 1.05, rightHand: club, torso: [belt, shoulderPelt] })),
    clips: soldierClips(overhead),
  },
  {
    id: 'axeman',
    kind: 'unit',
    facings: 8,
    build: () => build(humanoid({ top: 'team', skirt: 'leather', bulk: 1.08, rightHand: stoneAxe, head: [leatherCap], torso: [belt, shoulderPelt] })),
    clips: soldierClips(overhead),
  },
  {
    id: 'slinger',
    kind: 'unit',
    facings: 8,
    build: () => build(humanoid({ top: 'team', skirt: 'cloth', rightHand: slingCord, head: [headband], torso: [belt, stonePouch] })),
    clips: soldierClips(sling, { idle: ['sling'] }),
  },
  {
    id: 'bowman',
    kind: 'unit',
    facings: 8,
    build: () => build(humanoid({ top: 'team', skirt: 'cloth', leftHand: bowStave, rightHand: nockedArrow, head: [leatherCap], torso: [belt, quiver] })),
    // The nocked arrow shows while drawing and vanishes on the loose (the sim's arrow takes over).
    // Bow hand carried forward so the bow stands upright at rest and on the march.
    clips: soldierClips(bow, { idle: [], attack: (t) => (t >= 0.12 && t < 0.44 ? ['arrow'] : []) }, { armL: [-0.1, 0, 0.3], foreL: [0, 0, 1.2] }),
  },
];
