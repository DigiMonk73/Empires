import * as THREE from 'three';
import { box, build, cone, cyl, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { applyPose, ease, HIP_Y, humanoid, type Pose } from '../dsl/rig.ts';
import { applyQuadPose, quadBodyY, quadDie, quadruped, quadWalk, type QuadOpts, type QuadPose } from '../dsl/quad.ts';
import type { ClipDef, ModelDef } from './types.ts';

/**
 * Mounted units: a quadruped horse and a seated humanoid rider built as two sibling rigs (both use a bone named
 * `head`, so each is posed on its own subtree). Every frame the rider is moved with the horse's back — height,
 * pitch and roll — so it rides the gait, rears with the horse and falls with it.
 */
const BAY: MatSpec = { tex: 'hair', color: 0x7a4a2a, rough: 0.9, repeat: 3 };
const DARK: MatSpec = { tex: 'hair', color: 0x2e2018, rough: 1, repeat: 4 };
const HOOF: MatSpec = { tex: 'plain', color: 0x2a2420, rough: 0.8 };

const HORSE: QuadOpts = {
  mat: BAY,
  bodyLen: 0.4,
  bodyR: 0.12,
  legLen: 0.42,
  legR: 0.028,
  hipW: 0.07,
  neckLen: 0.26,
  neckTilt: 0.55,
  neckR: 0.06,
  hoof: HOOF,
  head: [
    { geom: sphere(0.06, 9), mat: BAY, t: [0.08, -0.03, 0], s: [1.9, 0.9, 0.8], r: [0, 0, -0.5] },
    { geom: cone(0.02, 0.06, 5), mat: BAY, t: [-0.02, 0.05, 0.03], r: [0.2, 0, 0.2] },
    { geom: cone(0.02, 0.06, 5), mat: BAY, t: [-0.02, 0.05, -0.03], r: [-0.2, 0, 0.2] },
  ],
  // Hangs down and back (axis (−0.35, −0.94)): thick at the dock, thin at the tip.
  tail: [{ geom: cyl(0.012, 0.03, 0.3, 6), mat: DARK, t: [-0.05, -0.14, 0], r: [0, 0, 2.79] }],
};
const HORSE_Y = quadBodyY(HORSE);
/** Height of the rider's seat above the ground, and how far back from the withers it sits. */
const SEAT_Y = HORSE_Y + HORSE.bodyR * 0.95;
const SEAT_X = -0.02;

function horseSpec(): NodeSpec {
  const spec = quadruped(HORSE);
  spec.name = 'horse';
  const body = spec.children![0]!;
  // Mane along the neck, a team-coloured saddle cloth.
  const neck = body.children!.find((c) => c.bone === 'neck')!;
  neck.children!.push({ geom: box(0.05, 0.26, 0.03), mat: DARK, t: [-0.02, 0.13, 0], r: [0, 0, -0.55] });
  body.children!.push(
    { geom: cyl(0.14, 0.14, 0.2, 12), mat: 'team', t: [SEAT_X, 0.02, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.9] },
    { geom: box(0.14, 0.03, 0.1), mat: 'leather', t: [SEAT_X, HORSE.bodyR * 0.95, 0] },
  );
  return spec;
}

interface RiderKit {
  rightHand?: NodeSpec[];
  leftHand?: NodeSpec[];
  head?: NodeSpec[];
  torso?: NodeSpec[];
}

function mounted(kit: RiderKit): () => THREE.Object3D {
  return () => {
    const root = new THREE.Group();
    root.add(build(horseSpec()));
    const rider = new THREE.Group();
    rider.name = 'rider';
    rider.add(build(humanoid({ top: 'team', skirt: 'cloth', ...kit })));
    root.add(rider);
    return root;
  };
}

/** Seated: thighs forward and apart around the barrel, shins hanging. */
const seated: Pose = { legL: [0.5, 0, 1.25], legR: [-0.5, 0, 1.25], shinL: [0, 0, -1.35], shinR: [0, 0, -1.35], armL: [-0.1, 0, 0.7], foreL: [0, 0, 0.6] };

function pose(root: THREE.Object3D, hp: QuadPose, rp: Pose): void {
  const horse = root.children[0]!; // mounted(): [horse, rider]
  const rider = root.children[1]!;
  applyQuadPose(horse, hp, HORSE_Y);
  applyPose(rider, { ...seated, ...rp });
  // Ride the horse's back: follow its height, pitch (about the withers) and roll.
  const bodyY = hp.bodyY ?? HORSE_Y;
  const pitch = hp.pitch ?? 0;
  const roll = hp.roll ?? 0;
  rider.position.set(SEAT_X - Math.sin(pitch) * 0.1, SEAT_Y + (bodyY - HORSE_Y) - HIP_Y + Math.sin(pitch) * SEAT_X, 0);
  rider.rotation.set(roll, 0, pitch);
}

function clip(frames: number, fps: number, loop: boolean, f: (t: number) => [QuadPose, Pose], markers?: Record<string, number>): ClipDef {
  return {
    frames,
    fps,
    loop,
    pose: (root: THREE.Object3D, t: number) => {
      const [hp, rp] = f(t);
      pose(root, hp, rp);
    },
    ...(markers ? { markers } : {}),
  };
}

/** Spear thrust from the saddle: draw back, drive forward at t = 0.44, recover; the horse half-rears. */
function thrust(t: number): [QuadPose, Pose] {
  const back = ease(t, 0, 0.3) * (1 - ease(t, 0.3, 0.44));
  const hit = ease(t, 0.3, 0.44) * (1 - ease(t, 0.55, 1));
  const rear = Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.12;
  const hp: QuadPose = { bodyY: HORSE_Y + 0.02 * rear * 8, pitch: rear, legFL: [0, 0, 0.6 * rear * 8], legFR: [0, 0, 0.4 * rear * 8], shinFL: [0, 0, -0.9 * rear * 8], shinFR: [0, 0, -0.7 * rear * 8] };
  const rp: Pose = { armR: [0.2, 0, 1.2 - 0.9 * back + 0.4 * hit], foreR: [0, 0, 0.9 - 0.6 * hit], lean: 0.1 + 0.25 * hit, spine: [0, -0.3 * back + 0.2 * hit, 0] };
  return [hp, rp];
}

function riderClips(): Record<string, ClipDef> {
  return {
    idle: clip(8, 5, true, (t) => [{ bodyY: HORSE_Y, neck: [0, 0, -0.1 - 0.08 * Math.sin(t * Math.PI * 2)], tail: [0.25 * Math.sin(t * Math.PI * 2), 0, 0] }, { armR: [0.15, 0, 0.9], foreR: [0, 0, 0.7] }]),
    walk: clip(10, 14, true, (t) => [quadWalk(t, 0.6, HORSE_Y), { armR: [0.15, 0, 0.9], foreR: [0, 0, 0.7], lean: 0.08 }]),
    attack: clip(10, 12, false, thrust, { hit: 4 / 9 }),
    die: clip(10, 10, false, (t) => {
      const hp = quadDie(t, HORSE_Y, HORSE.bodyR);
      const f = ease(t, 0.3, 0.9);
      return [hp, { armR: [0.8 * f, 0, 1.2 * f], armL: [-0.8 * f, 0, 1.2 * f], head: [0, 0, 0.3 * f] }];
    }),
  };
}

const shortSpear: NodeSpec[] = [
  { r: [0, 0, 1.2], children: [
    { geom: cyl(0.01, 0.01, 0.6, 5), mat: 'wood', t: [0, -0.12, 0] },
    { geom: cone(0.02, 0.07, 5), mat: 'bronze', t: [0, -0.45, 0], r: [Math.PI, 0, 0] },
  ] },
];

export const CAVALRY_MODELS: ModelDef[] = [
  {
    id: 'scout',
    kind: 'unit',
    facings: 8,
    build: mounted({ rightHand: shortSpear, head: [{ geom: sphere(0.074, 10), mat: 'leather', t: [-0.005, 0.085, 0], s: [1, 0.62, 1] }] }),
    clips: riderClips(),
  },
];
