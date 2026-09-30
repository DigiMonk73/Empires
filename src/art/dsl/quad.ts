import type * as THREE from 'three';
import { capsule, cyl, sphere, type MatName, type MatSpec, type NodeSpec, type Vec3 } from './model.ts';

/**
 * Quadruped rig (animals). Faces +X, Y up, right side +Z. The body is a horizontal capsule; legs hang from its
 * underside in two segments (knee/hock bones); the neck rises from the front and carries the head; a tail hangs
 * off the back. Bones: body, neck, head, tail, legFL/legFR/legBL/legBR, shinFL/shinFR/shinBL/shinBR, plus any
 * extra bones the model adds (trunk, jaw).
 */
export interface QuadOpts {
  mat: MatName | MatSpec;
  /** Belly/underside material (a lighter patch), optional. */
  belly?: MatName | MatSpec;
  bodyLen: number;
  bodyR: number;
  legLen: number;
  legR: number;
  /** Half the distance between left and right legs. */
  hipW: number;
  neckLen: number;
  /** Neck tilt from vertical toward forward (radians). */
  neckTilt: number;
  neckR: number;
  head: NodeSpec[];
  tail: NodeSpec[];
  hoof?: MatName | MatSpec;
}

function leg(o: QuadOpts, name: 'FL' | 'FR' | 'BL' | 'BR'): NodeSpec {
  const front = name[0] === 'F';
  const side = name[1] === 'R' ? 1 : -1;
  const upper = o.legLen * 0.52;
  const lower = o.legLen * 0.48;
  return {
    bone: `leg${name}`,
    t: [(front ? 1 : -1) * o.bodyLen * 0.42, -o.bodyR * 0.35, side * o.hipW],
    children: [
      { geom: cyl(o.legR * (front ? 1.1 : 1.35), o.legR * 0.9, upper, 7), mat: o.mat, t: [0, -upper / 2, 0] },
      {
        bone: `shin${name}`,
        t: [0, -upper, 0],
        children: [
          { geom: cyl(o.legR * 0.85, o.legR * 0.7, lower, 6), mat: o.mat, t: [0, -lower / 2, 0] },
          { geom: cyl(o.legR * 0.8, o.legR * 0.95, o.legR * 1.1, 6), mat: o.hoof ?? 'hair', t: [0, -lower + o.legR * 0.45, 0] },
        ],
      },
    ],
  };
}

/** Height of the body bone above the ground in the neutral stance. */
export function quadBodyY(o: QuadOpts): number {
  return o.legLen + o.bodyR * 0.35;
}

export function quadruped(o: QuadOpts): NodeSpec {
  const neckEnd: Vec3 = [Math.sin(o.neckTilt) * o.neckLen, Math.cos(o.neckTilt) * o.neckLen, 0];
  return {
    name: 'figure',
    children: [
      {
        bone: 'body',
        t: [0, quadBodyY(o), 0],
        children: [
          { geom: capsule(o.bodyR, o.bodyLen, 10), mat: o.mat, r: [0, 0, Math.PI / 2], s: [1, 1, 0.92] },
          ...(o.belly ? [{ geom: sphere(o.bodyR * 0.9, 10), mat: o.belly, t: [0, -o.bodyR * 0.3, 0], s: [(o.bodyLen / o.bodyR) * 0.55, 0.55, 0.85] } as NodeSpec] : []),
          leg(o, 'FL'),
          leg(o, 'FR'),
          leg(o, 'BL'),
          leg(o, 'BR'),
          {
            bone: 'neck',
            t: [o.bodyLen * 0.48, o.bodyR * 0.25, 0],
            children: [
              { geom: cyl(o.neckR * 0.8, o.neckR, o.neckLen, 8), mat: o.mat, t: [neckEnd[0] / 2, neckEnd[1] / 2, 0], r: [0, 0, -o.neckTilt] },
              { bone: 'head', t: neckEnd, children: o.head },
            ],
          },
          { bone: 'tail', t: [-o.bodyLen * 0.5 - o.bodyR * 0.7, o.bodyR * 0.3, 0], children: o.tail },
        ],
      },
    ],
  };
}

// ── Posing ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface QuadPose {
  /** Bone rotations by bone name (and the three body scalars below). */
  [bone: string]: Vec3 | number | undefined;
  bodyY?: number;
  pitch?: number;
  roll?: number;
}

const cache = new WeakMap<THREE.Object3D, Map<string, THREE.Object3D>>();

function boneMap(root: THREE.Object3D): Map<string, THREE.Object3D> {
  let m = cache.get(root);
  if (!m) {
    m = new Map();
    root.traverse((o) => {
      if (o.userData.bone) m!.set(o.userData.bone as string, o);
    });
    cache.set(root, m);
  }
  return m;
}

/**
 * Apply a pose: bone Euler rotations (unlisted bones reset to zero), body height `bodyY` (absolute), body
 * `pitch` (+ lifts the front) and `roll` (+ tips onto the right side).
 */
export function applyQuadPose(root: THREE.Object3D, p: QuadPose, neutralY: number): void {
  const b = boneMap(root);
  for (const [name, o] of b) {
    const r = p[name];
    if (typeof r === 'object') o.rotation.set(r[0], r[1], r[2]);
    else o.rotation.set(0, 0, 0);
  }
  const body = b.get('body');
  if (body) {
    body.position.y = p.bodyY ?? neutralY;
    body.rotation.set(p.roll ?? 0, 0, p.pitch ?? 0);
  }
}

const TAU = Math.PI * 2;

/** Walk/trot: diagonal pairs swing together; knees fold backward in front and forward behind on the lift. */
export function quadWalk(t: number, swing: number, neutralY: number, gait: 'trot' | 'amble' = 'trot'): QuadPose {
  const a = t * TAU;
  // Trot: FL with BR. Amble (elephant): each hind leg leads its same-side fore leg by a quarter cycle.
  const ph = gait === 'trot' ? { FL: 0, BR: 0, FR: Math.PI, BL: Math.PI } : { FL: 0, BL: Math.PI / 2, FR: Math.PI, BR: (3 * Math.PI) / 2 };
  const pose: QuadPose = { bodyY: neutralY + 0.012 * Math.cos(2 * a) };
  for (const k of ['FL', 'FR', 'BL', 'BR'] as const) {
    const s = Math.sin(a + ph[k]);
    const lift = Math.max(0, Math.cos(a + ph[k]));
    const front = k[0] === 'F';
    pose[`leg${k}`] = [0, 0, swing * s];
    pose[`shin${k}`] = [0, 0, (front ? -1 : 1) * lift * 0.9];
  }
  pose.neck = [0, 0, 0.05 * Math.sin(2 * a)];
  pose.tail = [0.2 * Math.sin(a), 0, 0];
  return pose;
}

/** Death: legs buckle, the body drops and rolls onto its side (last frame = the carcass lying there). */
export function quadDie(t: number, neutralY: number, bodyR: number): QuadPose {
  const e = Math.min(1, t / 0.35);
  const f = t < 0.3 ? 0 : Math.min(1, (t - 0.3) / 0.6);
  const fall = f * f * (3 - 2 * f);
  const bend = 0.9 * e;
  return {
    legFL: [0, 0, 0.3 * e + 0.5 * fall],
    legFR: [0, 0, 0.2 * e + 0.6 * fall],
    legBL: [0, 0, -0.3 * e - 0.4 * fall],
    legBR: [0, 0, -0.2 * e - 0.5 * fall],
    shinFL: [0, 0, -bend],
    shinFR: [0, 0, -bend * 0.8],
    shinBL: [0, 0, bend],
    shinBR: [0, 0, bend * 0.8],
    neck: [0.5 * fall, 0, -0.6 * fall],
    head: [0, 0, -0.3 * fall],
    tail: [0, 0, -0.4 * fall],
    bodyY: neutralY - (neutralY - bodyR * 0.95) * (0.45 * e + 0.55 * fall),
    roll: -1.45 * fall, // onto its left side, legs toward the viewer's right-front
  };
}
