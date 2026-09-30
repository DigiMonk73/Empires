import type * as THREE from 'three';
import { box, build, cone, cyl, extrude, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { applyPose, diePose, ease, HIP_Y, humanoid, idlePose, showProps, walkPose, type Pose } from '../dsl/rig.ts';
import type { ClipDef } from './types.ts';

/**
 * The villager: one rig carrying every tool and load as hidden props, and the work clips of the original's
 * specialists (lumberjack, miner, farmer, builder, forager, hunter, fisher) plus a carry-walk per resource.
 * Tools hang from the right hand along the forearm (−Y); a swing moves the hand toward local −X, so blades face −X.
 */
const MEAT: MatSpec = { tex: 'plain', color: 0x9a3a2a, rough: 0.6 };
const FAT: MatSpec = { tex: 'plain', color: 0xe8d8c0, rough: 0.7 };
const FISH: MatSpec = { tex: 'plain', color: 0x9aa8b4, rough: 0.35, metal: 0.3 };
const WHEAT: MatSpec = { tex: 'plain', color: 0xd8b85a, rough: 1 };

const prop = (name: string, children: NodeSpec[], t?: readonly [number, number, number], r?: readonly [number, number, number]): NodeSpec => ({
  name: `prop:${name}`,
  children,
  ...(t ? { t } : {}),
  ...(r ? { r } : {}),
});

const handle = (len: number, from = 0.03): NodeSpec => ({ geom: cyl(0.015, 0.016, len, 6), mat: 'wood', t: [0, from - len / 2, 0] });

const RIGHT_HAND: NodeSpec[] = [
  // Tool heads are drawn ~1.5× life size so they read at game scale (the original exaggerated them too).
  prop('hammer', [handle(0.22), { geom: box(0.1, 0.05, 0.05), mat: 'iron', t: [0, -0.18, 0] }]),
  prop('axe', [handle(0.4), { geom: extrude([[0, -0.04], [-0.1, -0.065], [-0.11, 0.065], [0, 0.04]], 0.02), mat: 'iron', t: [-0.005, -0.33, 0] }]),
  prop('pick', [handle(0.38), { geom: extrude([[-0.15, -0.02], [0, 0.02], [0.15, -0.02], [0, -0.005]], 0.028), mat: 'iron', t: [0, -0.33, 0] }]),
  prop('hoe', [handle(0.42), { geom: box(0.11, 0.016, 0.08), mat: 'bronze', t: [-0.055, -0.36, 0], r: [0, 0, 0.5] }]),
  prop('knife', [{ geom: box(0.012, 0.09, 0.022), mat: 'iron', t: [0, -0.05, 0] }]),
  prop('fishSpear', [
    { geom: cyl(0.011, 0.011, 0.72, 5), mat: 'wood', t: [0, -0.2, 0] },
    { geom: cone(0.018, 0.07, 5), mat: 'bronze', t: [0, -0.59, 0], r: [Math.PI, 0, 0] },
  ]),
  // The hunting spear: `spearAim` is re-aimed every frame so it keeps pointing ahead while the arm winds up.
  prop('spear', [
    { name: 'spearAim', children: [
      { geom: cyl(0.011, 0.011, 0.86, 5), mat: 'wood', t: [0, 0.12, 0] },
      { geom: cone(0.02, 0.08, 5), mat: 'bronze', t: [0, 0.59, 0] },
    ] },
  ]),
  prop('fish', [
    { geom: sphere(0.04, 8), mat: FISH, t: [0.01, -0.09, 0.01], s: [0.55, 2.1, 0.8] },
    { geom: sphere(0.035, 8), mat: FISH, t: [-0.02, -0.08, -0.02], s: [0.55, 1.9, 0.8] },
  ]),
];

const LEFT_HAND: NodeSpec[] = [
  prop('basket', [
    { geom: cyl(0.075, 0.06, 0.08, 10), mat: 'thatch', t: [0, -0.07, 0] },
    { geom: sphere(0.05, 8), mat: 'berries', t: [0, -0.035, 0], s: [1.2, 0.5, 1.2] },
  ]),
];

/** Loads carried on the body (spine space: shoulders at y ≈ 0.255, right side +Z). */
const TORSO: NodeSpec[] = [
  prop('logs', [0, 1, 2].map((i) => ({ geom: cyl(0.032, 0.032, 0.46, 7), mat: 'bark', t: [-0.02, 0.35 + (i === 2 ? 0.05 : 0), 0.09 + (i === 1 ? 0.06 : 0) + (i === 2 ? 0.03 : 0)], r: [0, 0, Math.PI / 2] }))),
  prop('meat', [
    { geom: sphere(0.075, 9), mat: MEAT, t: [-0.03, 0.34, 0.11], s: [1.6, 0.9, 1] },
    { geom: sphere(0.05, 7), mat: FAT, t: [0.06, 0.35, 0.11], s: [1, 0.8, 0.9] },
    { geom: cyl(0.012, 0.012, 0.1, 5), mat: FAT, t: [0.15, 0.36, 0.11], r: [0, 0, Math.PI / 2] },
  ]),
  prop('goldSack', [
    { geom: sphere(0.09, 9), mat: 'clothDark', t: [-0.04, 0.35, 0.1], s: [1.1, 0.85, 1] },
    { geom: sphere(0.045, 7), mat: 'goldOre', t: [-0.06, 0.43, 0.09] },
    { geom: sphere(0.04, 7), mat: 'goldOre', t: [0.0, 0.42, 0.13] },
    { geom: sphere(0.035, 6), mat: 'goldOre', t: [-0.02, 0.45, 0.06] },
  ]),
  prop('stone', [{ geom: box(0.15, 0.11, 0.17), mat: 'rock', t: [0.17, 0.1, 0], r: [0.1, 0.3, 0.08] }]),
];

const HEAD: NodeSpec[] = [
  prop('headBasket', [
    { geom: cyl(0.1, 0.08, 0.08, 12), mat: 'thatch', t: [0, 0.17, 0] },
    { geom: sphere(0.085, 9), mat: WHEAT, t: [0, 0.21, 0], s: [1, 0.45, 1] },
    { geom: sphere(0.03, 6), mat: 'berries', t: [0.03, 0.235, 0.02] },
  ]),
];

export function buildVillager(): THREE.Object3D {
  return build(humanoid({ top: 'team', skirt: 'cloth', rightHand: RIGHT_HAND, leftHand: LEFT_HAND, torso: TORSO, head: HEAD }));
}

function clip(frames: number, fps: number, loop: boolean, pose: (t: number) => Pose, props: readonly string[] | ((t: number) => readonly string[]), markers?: Record<string, number>): ClipDef {
  return {
    frames,
    fps,
    loop,
    pose: (root: THREE.Object3D, t: number) => {
      applyPose(root, pose(t));
      showProps(root, typeof props === 'function' ? props(t) : props);
    },
    ...(markers ? { markers } : {}),
  };
}

/** A two-handed overhead swing: raise over [strikeEnd, 1), strike fast over [0, strikeEnd). Returns the arm angle. */
function swing(t: number, top: number, bottom: number, strikeEnd = 0.35): number {
  if (t < strikeEnd) {
    const k = t / strikeEnd;
    return top + (bottom - top) * k * k; // accelerating down-stroke
  }
  return bottom + (top - bottom) * ease(t, strikeEnd + 0.1, 1);
}

const stance = (lean: number, crouch = 0): Pose => ({
  legL: [0, 0, 0.28 + crouch],
  legR: [0, 0, -0.22],
  shinL: [0, 0, -0.1 - crouch * 1.5],
  shinR: [0, 0, -0.05],
  hipY: HIP_Y - 0.01 - crouch * 0.12,
  lean,
});

/**
 * Both hands on one handle. The inward turn is a yaw (Y) so it converges the hands at any arm elevation; an X roll
 * would flip outward once the arm passes the horizontal (Euler XYZ applies Z first).
 */
function twoHanded(a: number, fore: number, lean: number, crouch = 0): Pose {
  return { ...stance(lean, crouch), armL: [0, -0.4, a - 0.08], armR: [0, 0.36, a], foreL: [0, 0, fore], foreR: [0, 0, fore] };
}

const chopPose = (t: number): Pose => {
  const a = swing(t, 2.75, 0.95);
  return twoHanded(a, 0.2, 0.08 + 0.22 * (1 - (a - 0.95) / 1.8), 0.05);
};
const minePose = (t: number): Pose => {
  const a = swing(t, 2.8, 0.7);
  return twoHanded(a, 0.15, 0.12 + 0.3 * (1 - (a - 0.7) / 2.1), 0.1);
};
const farmPose = (t: number): Pose => {
  const a = swing(t, 2.0, 0.7, 0.3);
  return twoHanded(a, 0.35, 0.3 + 0.1 * (1 - (a - 0.7) / 1.3), 0.08);
};
const buildPose = (t: number): Pose => {
  const a = swing(t, 2.3, 1.0, 0.3);
  return { ...stance(0.28, 0.12), armR: [0.15, 0, a], foreR: [0, 0, 0.5], armL: [-0.15, 0, 0.95], foreL: [0, 0, 0.6] };
};
const foragePose = (t: number): Pose => {
  // Reach down into the bush, pick, and bring the hand back to the basket at the hip.
  const r = t < 0.5 ? ease(t, 0, 0.35) : 1 - ease(t, 0.55, 0.95);
  return { ...stance(0.22 + 0.12 * r, 0.05), armR: [0.1, 0.25 * (1 - r), 0.35 + 0.75 * r], foreR: [0, 0, 1.25 - 0.95 * r], armL: [-0.1, 0, 0.3], foreL: [0, 0, 0.9], head: [0, 0, -0.15] };
};
const butcherPose = (t: number): Pose => {
  const s = Math.sin(t * Math.PI * 2);
  return {
    legL: [0, 0, 1.45],
    shinL: [0, 0, -1.55],
    legR: [0, 0, -0.35],
    shinR: [0, 0, -1.3],
    hipY: 0.27,
    lean: 0.45,
    armR: [0.2, 0, 0.9 + 0.2 * s],
    foreR: [0, 0, 0.6 - 0.3 * s],
    armL: [-0.2, 0, 0.8],
    foreL: [0, 0, 0.5],
    head: [0, 0, -0.2],
  };
};
const fishPose = (t: number): Pose => {
  // Poised, then a quick jab down into the water and a slow recovery.
  const jab = t < 0.25 ? ease(t, 0, 0.25) : 1 - ease(t, 0.35, 0.95);
  const a = 1.45 - 0.7 * jab;
  return { ...stance(0.18 + 0.2 * jab, 0.06), armR: [0, 0.3, a], foreR: [0, 0, 0.15], armL: [0, -0.35, a - 0.2], foreL: [0, 0, 0.45] };
};
/** Spear throw (hunting): lift over the top to cock (θ 1.0 → 3.8 ≡ behind the head), whip forward, follow through. */
const throwPose = (t: number): Pose => {
  const a = t < 0.35 ? 1.0 + 2.8 * ease(t, 0, 0.35) : t < 0.5 ? 3.8 - 2.2 * ease(t, 0.35, 0.5) : 1.6 - 0.5 * ease(t, 0.5, 0.8) + 0.4 * ease(t, 0.8, 1);
  const cock = ease(t, 0.1, 0.35) * (1 - ease(t, 0.35, 0.5));
  return {
    ...stance(0.05 - 0.12 * cock + 0.25 * ease(t, 0.35, 0.5) * (1 - ease(t, 0.7, 1)), 0.04),
    armR: [0.15, 0, a],
    foreR: [0, 0, 0.6 * cock + 0.15],
    armL: [-0.2, 0, 1.2 * cock + 0.3],
    foreL: [0, 0, 0.4],
  };
};

/** Keep the spear pointing ahead and a little up (world angle), whatever the arm is doing. */
const SPEAR_AIM = -1.22; // rotates the spear's +Y axis to forward, 20° above the horizon
function aimed(c: ClipDef, pose: (t: number) => Pose): ClipDef {
  return {
    ...c,
    pose: (root: THREE.Object3D, t: number) => {
      c.pose(root, t);
      const p = pose(t);
      const aim = root.getObjectByName('spearAim');
      if (aim) aim.rotation.z = SPEAR_AIM + (p.lean ?? 0) - (p.armR?.[2] ?? 0) - (p.foreR?.[2] ?? 0);
    },
  };
}

/** Carry-walks: the walk cycle with the arms holding the load. */
const shoulderLoad = (t: number): Pose => ({ ...walkPose(t, 0.45, 0.4), armR: [0.25, 0, 1.3], foreR: [0, 0, 1.65] });
const stoneLoad = (t: number): Pose => ({ ...walkPose(t, 0.4), armL: [-0.35, 0, 0.55], armR: [0.35, 0, 0.55], foreL: [0, 0, 1.05], foreR: [0, 0, 1.05], lean: -0.04 });
const headLoad = (t: number): Pose => ({ ...walkPose(t, 0.45, 0.4), armR: [0.3, 0, 2.95], foreR: [0, 0, 0.45] });

export const VILLAGER_CLIPS: Record<string, ClipDef> = {
  idle: clip(6, 4, true, idlePose, ['hammer']),
  walk: clip(10, 12, true, (t) => walkPose(t), ['hammer']),
  die: clip(10, 10, false, diePose, ['hammer']),
  chop: clip(10, 10, true, chopPose, ['axe'], { hit: 0.35 }),
  mine: clip(10, 10, true, minePose, ['pick'], { hit: 0.35 }),
  farm: clip(10, 9, true, farmPose, ['hoe'], { hit: 0.3 }),
  build: clip(8, 10, true, buildPose, ['hammer'], { hit: 0.3 }),
  forage: clip(8, 8, true, foragePose, ['basket']),
  butcher: clip(8, 8, true, butcherPose, ['knife']),
  fish: clip(10, 9, true, fishPose, ['fishSpear'], { hit: 0.25 }),
  throw: aimed(clip(10, 12, false, throwPose, (t) => (t < 0.45 || t >= 0.85 ? ['spear'] : []), { hit: 0.45 }), throwPose),
  carryWood: clip(10, 12, true, shoulderLoad, ['logs']),
  carryMeat: clip(10, 12, true, shoulderLoad, ['meat']),
  carryGold: clip(10, 12, true, shoulderLoad, ['goldSack']),
  carryStone: clip(10, 12, true, stoneLoad, ['stone']),
  carryFood: clip(10, 12, true, headLoad, ['headBasket']),
  carryFish: clip(10, 12, true, (t) => walkPose(t, 0.5, 0.25), ['fish']),
};
