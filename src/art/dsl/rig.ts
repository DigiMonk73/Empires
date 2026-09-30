import type * as THREE from 'three';
import { box, capsule, cyl, sphere, type MatName, type NodeSpec, type Vec3 } from './model.ts';

/**
 * Humanoid rig. The model faces +X, Y is up, and its right side is +Z. Bones are groups placed at joints so
 * rotations pivot correctly; limbs hang along −Y. A person is ≈0.95 tall (≈37 logical px on screen).
 *
 *   root → hips → spine → head
 *                      → armL/armR → foreL/foreR → handL/handR (sockets for tools and shields)
 *              → legL/legR → shinL/shinR
 */
export interface HumanoidOpts {
  skin?: MatName;
  /** Upper-body garment (team-colored for most units). */
  top?: MatName;
  /** Kilt/skirt garment. */
  skirt?: MatName;
  hair?: MatName | null;
  /** Width multiplier (armored units are bulkier). */
  bulk?: number;
  /** Extra nodes attached to the right/left hand, head, or torso. */
  rightHand?: NodeSpec[];
  leftHand?: NodeSpec[];
  head?: NodeSpec[];
  torso?: NodeSpec[];
}

export const HIP_Y = 0.46;
const THIGH = 0.21;
const SHIN = 0.21;
const UPPER_ARM = 0.16;
const FOREARM = 0.15;

function limb(len: number, rTop: number, rBot: number, mat: MatName): NodeSpec {
  return { geom: cyl(rTop, rBot, len, 7), mat, t: [0, -len / 2, 0] };
}

export function humanoid(o: HumanoidOpts = {}): NodeSpec {
  const skin = o.skin ?? 'skin';
  const top = o.top ?? 'team';
  const skirt = o.skirt ?? 'cloth';
  const k = o.bulk ?? 1;
  const leg = (side: 1 | -1): NodeSpec => ({
    bone: side < 0 ? 'legL' : 'legR',
    t: [0, 0, 0.055 * side * k],
    children: [
      limb(THIGH, 0.042 * k, 0.034 * k, skin),
      {
        bone: side < 0 ? 'shinL' : 'shinR',
        t: [0, -THIGH, 0],
        children: [
          limb(SHIN, 0.032 * k, 0.026, skin),
          { geom: box(0.085, 0.03, 0.045), mat: 'leather', t: [0.02, -SHIN - 0.01, 0] },
        ],
      },
    ],
  });
  const arm = (side: 1 | -1): NodeSpec => ({
    bone: side < 0 ? 'armL' : 'armR',
    t: [0, 0.255, 0.115 * side * k],
    children: [
      limb(UPPER_ARM, 0.034 * k, 0.029 * k, top),
      {
        bone: side < 0 ? 'foreL' : 'foreR',
        t: [0, -UPPER_ARM, 0],
        children: [
          limb(FOREARM, 0.027, 0.023, skin),
          {
            socket: side < 0 ? 'handL' : 'handR',
            t: [0, -FOREARM - 0.02, 0],
            children: [{ geom: sphere(0.028, 7), mat: skin }, ...((side < 0 ? o.leftHand : o.rightHand) ?? [])],
          },
        ],
      },
    ],
  });
  return {
    name: 'figure',
    children: [
      {
        bone: 'hips',
        t: [0, HIP_Y, 0],
        children: [
          // Kilt around the hips.
          { geom: cyl(0.1 * k, 0.125 * k, 0.16, 10), mat: skirt, t: [0, -0.04, 0] },
          leg(-1),
          leg(1),
          {
            bone: 'spine',
            t: [0, 0.02, 0],
            children: [
              { geom: capsule(0.095 * k, 0.13, 8), mat: top, t: [0, 0.15, 0], s: [0.85, 1, 1.12] },
              { geom: cyl(0.03, 0.035, 0.05, 6), mat: skin, t: [0, 0.29, 0] },
              {
                bone: 'head',
                t: [0, 0.31, 0],
                children: [
                  { geom: sphere(0.068, 10), mat: skin, t: [0.005, 0.062, 0] },
                  ...(o.hair === null ? [] : [{ geom: sphere(0.071, 10), mat: o.hair ?? 'hair', t: [-0.012, 0.078, 0], s: [1, 0.78, 1] } as NodeSpec]),
                  ...(o.head ?? []),
                ],
              },
              arm(-1),
              arm(1),
              ...(o.torso ?? []),
            ],
          },
        ],
      },
    ],
  };
}

// ── Posing ─────────────────────────────────────────────────────────────────────────────────────────────────

const BONES = ['hips', 'spine', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR'] as const;
export type Bone = (typeof BONES)[number];
export type Pose = Partial<Record<Bone, Vec3>> & { hipY?: number; lean?: number; topple?: number; drop?: number };

const boneCache = new WeakMap<THREE.Object3D, Map<string, THREE.Object3D>>();

function bones(root: THREE.Object3D): Map<string, THREE.Object3D> {
  let m = boneCache.get(root);
  if (!m) {
    m = new Map();
    root.traverse((o) => {
      if (o.userData.bone) m!.set(o.userData.bone as string, o);
    });
    boneCache.set(root, m);
  }
  return m;
}

/**
 * Apply a pose: bone Euler rotations (radians; +Z swings a limb forward), hip height, a forward lean of the
 * spine, and `topple` — rotating the whole figure backwards about the feet (dying) — with `drop` sinking it.
 */
export function applyPose(root: THREE.Object3D, p: Pose): void {
  const b = bones(root);
  for (const name of BONES) {
    const o = b.get(name);
    if (o) o.rotation.set(...(p[name] ?? ([0, 0, 0] as const)));
  }
  const hips = b.get('hips');
  if (hips) hips.position.y = p.hipY ?? HIP_Y;
  const spine = b.get('spine');
  if (spine && p.lean) spine.rotation.z -= p.lean;
  const fig = root.getObjectByName('figure');
  if (fig) {
    fig.rotation.set(0, 0, p.topple ?? 0);
    fig.position.set(0, -(p.drop ?? 0), 0);
  }
}

// ── Clips ──────────────────────────────────────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;

/** Walk cycle: legs and arms swing in opposition; knees bend on the back swing; the body bobs twice a cycle. */
export function walkPose(t: number, stride = 0.5, armSwing = 0.45): Pose {
  const a = t * TAU;
  const s = Math.sin(a);
  const kneeL = Math.max(0, -Math.cos(a)) * 0.75;
  const kneeR = Math.max(0, Math.cos(a)) * 0.75;
  return {
    legL: [0, 0, stride * s],
    legR: [0, 0, -stride * s],
    shinL: [0, 0, -kneeL],
    shinR: [0, 0, -kneeR],
    armL: [0.05, 0, -armSwing * s],
    armR: [-0.05, 0, armSwing * s],
    foreL: [0, 0, 0.35],
    foreR: [0, 0, 0.35],
    hipY: HIP_Y - 0.012 + 0.012 * Math.cos(2 * a),
    lean: 0.06,
  };
}

/** Idle: slow breathing and a tiny weight shift. */
export function idlePose(t: number): Pose {
  const a = t * TAU;
  return {
    armL: [0.08, 0, 0.04 * Math.sin(a)],
    armR: [-0.08, 0, -0.04 * Math.sin(a)],
    foreL: [0, 0, 0.15],
    foreR: [0, 0, 0.15],
    spine: [0.02 * Math.sin(a), 0, 0],
    hipY: HIP_Y + 0.004 * Math.sin(a),
  };
}

/** Death: knees buckle, then the body topples backwards and settles on the ground (last frame = corpse). */
export function diePose(t: number): Pose {
  const e = t < 0.3 ? t / 0.3 : 1;
  const f = t < 0.3 ? 0 : Math.min(1, (t - 0.3) / 0.6);
  const fall = f * f * (3 - 2 * f);
  return {
    shinL: [0, 0, -0.9 * e],
    shinR: [0, 0, -0.7 * e],
    legL: [0, 0, 0.5 * e],
    legR: [0, 0, 0.3 * e],
    armL: [0.9 * fall, 0, 1.3 * fall],
    armR: [-0.7 * fall, 0, 1.6 * fall],
    head: [0, 0, 0.4 * fall],
    hipY: HIP_Y - 0.12 * e,
    topple: 1.42 * fall, // backwards (+Z rotation tips the head toward −X)
    drop: -0.02 - 0.08 * fall,
  };
}

// ── Props ──────────────────────────────────────────────────────────────────────────────────────────────────

const propCache = new WeakMap<THREE.Object3D, THREE.Object3D[]>();

/**
 * Show exactly the named props (nodes named `prop:<name>`) and hide the rest. Lets one rig carry every tool and
 * load, with each clip choosing what is in hand. Hidden meshes cast no shadow either.
 */
export function showProps(root: THREE.Object3D, names: readonly string[]): void {
  let list = propCache.get(root);
  if (!list) {
    list = [];
    root.traverse((o) => {
      if (o.name.startsWith('prop:')) list!.push(o);
    });
    propCache.set(root, list);
  }
  for (const o of list) o.visible = names.includes(o.name.slice(5));
}

/** Smoothstep-eased 0→1 over [a, b]. */
export function ease(t: number, a: number, b: number): number {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
