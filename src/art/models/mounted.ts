import * as THREE from 'three';
import { box, build, cone, cyl, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { applyPose, ease, HIP_Y, humanoid, type HumanoidOpts, type Pose } from '../dsl/rig.ts';
import { applyQuadPose, quadBodyY, quadDie, quadruped, quadWalk, type QuadOpts, type QuadPose } from '../dsl/quad.ts';
import { ELEPHANT_OPTS, elephantSpec } from './animals.ts';
import { bow, bowStave, GRIP, nockedArrow, quiver } from './soldiers.ts';
import type { ClipDef, ModelDef } from './types.ts';

/**
 * Mounted units of the Stable and Archery Range (M7.4c). A general mount factory: a quadruped (horse, camel,
 * elephant) and a humanoid rider as sibling rigs, the rider riding the mount's back each frame (as the scout,
 * cavalry.ts). Chariots are a horse, a two-wheeled cart with rolling wheels, and a standing crewman. Attack
 * blows land on frame 4 of 10 (t = 0.44, D26).
 */
const HOOF: MatSpec = { tex: 'plain', color: 0x2a2420, rough: 0.8 };
const coat = (color: number): MatSpec => ({ tex: 'hair', color, rough: 0.9, repeat: 3 });
const MANE: MatSpec = { tex: 'hair', color: 0x2e2018, rough: 1, repeat: 4 };
const SCALE: MatSpec = { tex: 'metal', color: 0x7a7c80, rough: 0.5, metal: 0.7, repeat: 6 };
const TIMBER: MatSpec = { tex: 'planks', color: 0x8a6a44, rough: 0.9, repeat: 2 };
const WICKER: MatSpec = { tex: 'thatch', color: 0xb08a50, rough: 1, repeat: 4 };

function horseOpts(c: MatSpec): QuadOpts {
  return {
    mat: c,
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
      { geom: sphere(0.06, 9), mat: c, t: [0.08, -0.03, 0], s: [1.9, 0.9, 0.8], r: [0, 0, -0.5] },
      { geom: cone(0.02, 0.06, 5), mat: c, t: [-0.02, 0.05, 0.03], r: [0.2, 0, 0.2] },
      { geom: cone(0.02, 0.06, 5), mat: c, t: [-0.02, 0.05, -0.03], r: [-0.2, 0, 0.2] },
    ],
    tail: [{ geom: cyl(0.012, 0.03, 0.3, 6), mat: MANE, t: [-0.05, -0.14, 0], r: [0, 0, 2.79] }],
  };
}

const CAMEL_COAT = coat(0xc49a62);
const CAMEL: QuadOpts = {
  mat: CAMEL_COAT,
  bodyLen: 0.38,
  bodyR: 0.11,
  legLen: 0.5,
  legR: 0.024,
  hipW: 0.065,
  neckLen: 0.34,
  neckTilt: 0.75,
  neckR: 0.045,
  hoof: coat(0x8a6a44),
  head: [
    { geom: sphere(0.05, 9), mat: CAMEL_COAT, t: [0.06, 0.0, 0], s: [2, 0.95, 0.85], r: [0, 0, -0.35] },
    { geom: cone(0.015, 0.04, 5), mat: CAMEL_COAT, t: [-0.02, 0.05, 0.025] },
    { geom: cone(0.015, 0.04, 5), mat: CAMEL_COAT, t: [-0.02, 0.05, -0.025] },
  ],
  tail: [{ geom: cyl(0.008, 0.012, 0.18, 5), mat: CAMEL_COAT, t: [-0.02, -0.08, 0], r: [0, 0, 2.9] }],
};

interface Mount {
  opts: QuadOpts;
  /** The quadruped spec with its extras (saddle cloth, barding, howdah). */
  spec(): NodeSpec;
  /** Seat: height above the body bone and x offset along it. */
  seatX: number;
  seatUp: number;
  gait: 'trot' | 'amble';
  swing: number;
  scale?: number;
}

/** Push extras onto a quadruped spec's body bone. */
function withBody(spec: NodeSpec, extra: NodeSpec[], neckExtra: NodeSpec[] = []): NodeSpec {
  const body = spec.children![0]!;
  body.children!.push(...extra);
  if (neckExtra.length) body.children!.find((c) => c.bone === 'neck')!.children!.push(...neckExtra);
  return spec;
}

function horse(c: number, barding: 'none' | 'cloth' | 'scale'): Mount {
  const o = horseOpts(coat(c));
  return {
    opts: o,
    seatX: -0.02,
    seatUp: o.bodyR * 0.95,
    gait: 'trot',
    swing: 0.6,
    spec: () => {
      const extra: NodeSpec[] = [{ geom: box(0.14, 0.03, 0.1), mat: 'leather', t: [-0.02, o.bodyR * 0.95, 0] }];
      if (barding === 'none') extra.push({ geom: cyl(0.14, 0.14, 0.2, 12), mat: 'team', t: [-0.02, 0.02, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.9] });
      else {
        // A caparison hanging over the barrel (team cloth, or iron scale for the cataphract).
        extra.push({ geom: cyl(0.145, 0.16, 0.44, 12, ), mat: barding === 'scale' ? SCALE : 'team', t: [0, -0.02, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.95] });
        if (barding === 'scale') extra.push({ geom: box(0.3, 0.05, 0.3), mat: 'team', t: [-0.02, o.bodyR * 1.05, 0] });
      }
      const neck: NodeSpec[] = [{ geom: box(0.05, 0.26, 0.03), mat: MANE, t: [-0.02, 0.13, 0], r: [0, 0, -0.55] }];
      if (barding === 'scale') neck.push({ geom: cyl(0.07, 0.075, 0.26, 8), mat: SCALE, t: [0.07, 0.11, 0], r: [0, 0, -0.55] });
      return withBody(quadruped(o), extra, neck);
    },
  };
}

function camel(): Mount {
  return {
    opts: CAMEL,
    seatX: -0.02,
    seatUp: CAMEL.bodyR + 0.1,
    gait: 'amble',
    swing: 0.55,
    spec: () =>
      withBody(quadruped(CAMEL), [
        { geom: sphere(0.1, 10), mat: CAMEL_COAT, t: [-0.02, CAMEL.bodyR * 0.8, 0], s: [1.2, 1, 0.9] }, // hump
        { geom: box(0.18, 0.03, 0.16), mat: 'team', t: [-0.02, CAMEL.bodyR + 0.08, 0] },
      ]),
  };
}

function warElephant(armor: boolean, howdah: boolean): Mount {
  const o = ELEPHANT_OPTS;
  return {
    opts: o,
    seatX: howdah ? -0.02 : 0.2,
    seatUp: o.bodyR + (howdah ? 0.14 : 0.1),
    gait: 'amble',
    swing: 0.32,
    scale: 1.1,
    spec: () => {
      const extra: NodeSpec[] = [{ geom: box(0.5, 0.03, 0.56), mat: 'team', t: [0, o.bodyR + 0.03, 0] }]; // saddle blanket
      if (armor) extra.push({ geom: cyl(0.3, 0.31, 0.5, 12), mat: SCALE, t: [0, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 1.02] });
      if (howdah)
        extra.push(
          { geom: box(0.3, 0.14, 0.3), mat: WICKER, t: [-0.02, o.bodyR + 0.11, 0] },
          { geom: box(0.32, 0.03, 0.32), mat: 'team', t: [-0.02, o.bodyR + 0.19, 0] },
        );
      return withBody(elephantSpec(), extra, armor ? [{ geom: box(0.12, 0.2, 0.3), mat: SCALE, t: [0.12, 0.05, 0] }] : []);
    },
  };
}

/** Seated: thighs forward and apart, shins hanging. */
const SEATED: Pose = { legL: [0.5, 0, 1.25], legR: [-0.5, 0, 1.25], shinL: [0, 0, -1.35], shinR: [0, 0, -1.35], armL: [-0.1, 0, 0.7], foreL: [0, 0, 0.6] };
const SEATED_LEGS: Pose = { legL: SEATED.legL, legR: SEATED.legR, shinL: SEATED.shinL, shinR: SEATED.shinR, hipY: HIP_Y, lean: 0 };

type Frame = [QuadPose, Pose];

function riderModel(m: Mount, rider: HumanoidOpts): () => THREE.Object3D {
  return () => {
    const root = new THREE.Group();
    const mount = build(m.spec());
    mount.name = 'mount';
    root.add(mount);
    const r = new THREE.Group();
    r.name = 'rider';
    r.add(build(humanoid({ top: 'team', skirt: 'cloth', ...rider })));
    root.add(r);
    if (m.scale) root.scale.setScalar(m.scale);
    return root;
  };
}

function rideClips(m: Mount, attack: (t: number, y: number) => Frame, hold: Pose): Record<string, ClipDef> {
  const Y = quadBodyY(m.opts);
  const apply = (root: THREE.Object3D, [hp, rp]: Frame) => {
    const mount = root.children[0]!;
    const rider = root.children[1]!;
    applyQuadPose(mount, hp, Y);
    applyPose(rider, { ...SEATED, ...rp });
    const bodyY = hp.bodyY ?? Y;
    const pitch = hp.pitch ?? 0;
    const roll = hp.roll ?? 0;
    // Ride the back: follow its height, pitch (about the body's centre) and roll.
    rider.position.set(m.seatX * Math.cos(pitch) - Math.sin(pitch) * m.seatUp, bodyY + m.seatUp * Math.cos(pitch) + Math.sin(pitch) * m.seatX - HIP_Y, 0);
    rider.rotation.set(roll, 0, pitch);
  };
  const clip = (frames: number, fps: number, loop: boolean, f: (t: number) => Frame, markers?: Record<string, number>): ClipDef => ({
    frames,
    fps,
    loop,
    pose: (root, t) => apply(root, f(t)),
    ...(markers ? { markers } : {}),
  });
  return {
    idle: clip(8, 5, true, (t) => [{ bodyY: Y, neck: [0, 0, -0.1 - 0.06 * Math.sin(t * Math.PI * 2)], tail: [0.25 * Math.sin(t * Math.PI * 2), 0, 0] }, hold]),
    walk: clip(10, m.gait === 'amble' ? 10 : 14, true, (t) => [quadWalk(t, m.swing, Y, m.gait), { ...hold, lean: 0.08 }]),
    attack: clip(10, 12, false, (t) => attack(t, Y), { hit: 4 / 9 }),
    die: clip(10, 10, false, (t) => {
      const f = ease(t, 0.3, 0.9);
      return [quadDie(t, Y, m.opts.bodyR), { armR: [0.8 * f, 0, 1.2 * f], armL: [-0.8 * f, 0, 1.2 * f], head: [0, 0, 0.3 * f] }];
    }),
  };
}

// ── Attacks ───────────────────────────────────────────────────────────────────────────────────────────────
/** Lance/spear thrust from the saddle; the horse half-rears. */
function lance(t: number, y: number): Frame {
  const back = ease(t, 0, 0.3) * (1 - ease(t, 0.3, 0.44));
  const hit = ease(t, 0.3, 0.44) * (1 - ease(t, 0.55, 1));
  const rear = Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.12;
  return [
    { bodyY: y + 0.16 * rear, pitch: rear, legFL: [0, 0, 4.8 * rear], legFR: [0, 0, 3.2 * rear], shinFL: [0, 0, -7 * rear], shinFR: [0, 0, -5.6 * rear] },
    { armR: [0.2, 0, 1.2 - 0.9 * back + 0.4 * hit], foreR: [0, 0, 0.9 - 0.6 * hit], lean: 0.1 + 0.25 * hit, spine: [0, -0.3 * back + 0.2 * hit, 0] },
  ];
}

/** Sword cut from the saddle: raise high, slash down at t = 0.44. */
function saber(t: number, y: number): Frame {
  const up = ease(t, 0, 0.3);
  const down = ease(t, 0.3, 0.44);
  const back = ease(t, 0.55, 1);
  return [
    { bodyY: y, neck: [0, 0, -0.15 * down] },
    { armR: [0.3, 0, 0.4 + 2.2 * up - 2.0 * down - 0.2 * back], foreR: [0, 0, 0.6 + 0.4 * up - 0.8 * down + 0.4 * back], lean: 0.05 + 0.2 * down * (1 - back) },
  ];
}

/** Shooting from the saddle: the bow pose with the legs kept seated. */
function saddleBow(t: number, y: number): Frame {
  return [{ bodyY: y }, { ...bow(t), ...SEATED_LEGS }];
}

/** Elephant: the beast rears and stamps (hit at the stamp), the mahout jabs his goad. */
function stamp(t: number, y: number): Frame {
  const up = t < 0.3 ? ease(t, 0, 0.3) : 1 - ease(t, 0.3, 0.44);
  return [
    { bodyY: y + 0.06 * up, pitch: -0.25 * up, legFL: [0, 0, 0.9 * up], legFR: [0, 0, 0.7 * up], shinFL: [0, 0, -1.1 * up], shinFR: [0, 0, -0.9 * up], trunk: [0, 0, -0.8 * up], trunk2: [0, 0, -0.6 * up] },
    { armR: [0.2, 0, 1.4 - 0.8 * (1 - up)], foreR: [0, 0, 0.6] },
  ];
}

// ── Rider kit ─────────────────────────────────────────────────────────────────────────────────────────────
const helm = (mat: 'bronze' | 'iron'): NodeSpec => ({ geom: sphere(0.078, 10), mat, t: [-0.005, 0.085, 0], s: [1, 0.72, 1] });
const plume: NodeSpec = { geom: box(0.14, 0.05, 0.025), mat: { tex: 'hair', color: 0xa02a1e, rough: 1, repeat: 4 }, t: [-0.01, 0.16, 0] };
const turban: NodeSpec = { geom: sphere(0.08, 10), mat: { tex: 'cloth', color: 0xe8e0cc, rough: 1, repeat: 4 }, t: [-0.005, 0.08, 0], s: [1.05, 0.7, 1.05] };
const cuirass = (mat: 'bronze' | 'iron' | MatSpec): NodeSpec => ({ geom: cyl(0.105, 0.1, 0.2, 12), mat, t: [0, 0.16, 0] });
const smallShield: NodeSpec[] = [
  { t: [0.02, -0.02, 0.04], r: [0, Math.PI / 2, 0], children: [{ geom: cyl(0.09, 0.09, 0.018, 16), mat: 'team', r: [Math.PI / 2, 0, 0] }, { geom: sphere(0.02, 6), mat: 'bronze', t: [0, 0, 0.012] }] },
];
function spear(len: number, metal: 'bronze' | 'iron'): NodeSpec[] {
  return [
    { r: [0, 0, 1.2], children: [
      { geom: cyl(0.01, 0.01, len, 5), mat: 'wood', t: [0, -len * 0.2, 0] },
      { geom: cone(0.02, 0.08, 5), mat: metal, t: [0, -len * 0.7 - 0.04, 0], r: [Math.PI, 0, 0] },
    ] },
  ];
}
const sword: NodeSpec[] = [
  { r: [0, 0, GRIP], children: [
    { geom: box(0.07, 0.016, 0.03), mat: 'iron', t: [0, -0.05, 0] },
    { geom: box(0.035, 0.3, 0.008), mat: 'iron', t: [0, -0.21, 0] },
  ] },
];
const goad: NodeSpec[] = [{ r: [0, 0, 1.2], children: [{ geom: cyl(0.008, 0.008, 0.3, 5), mat: 'wood', t: [0, -0.1, 0] }, { geom: cone(0.012, 0.04, 5), mat: 'iron', t: [0, -0.26, 0], r: [Math.PI, 0, 0] }] }];

// ── Chariots ──────────────────────────────────────────────────────────────────────────────────────────────
/** Two-wheeled cart behind a horse; the crewman stands on its floor. Scythes on the hubs for the Scythe Chariot. */
function chariotModel(crew: HumanoidOpts, scythes: boolean): () => THREE.Object3D {
  return () => {
    const root = new THREE.Group();
    const o = horseOpts(coat(0x6a4028));
    const h = build(withBody(quadruped(o), [{ geom: cyl(0.13, 0.13, 0.18, 12), mat: 'team', t: [0, 0.02, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.9] }], [{ geom: box(0.05, 0.26, 0.03), mat: MANE, t: [-0.02, 0.13, 0], r: [0, 0, -0.55] }]));
    h.name = 'mount';
    h.position.x = 0.22;
    root.add(h);
    const r = new THREE.Group();
    r.name = 'rider';
    r.add(build(humanoid({ top: 'team', skirt: 'cloth', ...crew })));
    root.add(r);
    const wheel = (z: number, name: string): NodeSpec => ({
      bone: name,
      t: [-0.3, 0.2, z],
      children: [
        { geom: cyl(0.2, 0.2, 0.03, 16), mat: TIMBER, r: [Math.PI / 2, 0, 0] },
        { geom: cyl(0.16, 0.16, 0.035, 16), mat: { tex: 'plain', color: 0x3a2a1c, rough: 1 }, r: [Math.PI / 2, 0, 0] },
        ...[0, 1, 2, 3].map((i): NodeSpec => ({ geom: box(0.016, 0.36, 0.02), mat: TIMBER, r: [0, 0, (i * Math.PI) / 4] })),
        { geom: cyl(0.035, 0.035, 0.08, 8), mat: 'bronze', r: [Math.PI / 2, 0, 0] },
        ...(scythes ? [{ geom: box(0.03, 0.02, 0.28), mat: 'iron', t: [0, 0, Math.sign(z) * 0.16] } as NodeSpec] : []),
      ],
    });
    root.add(
      build({
        name: 'cart',
        children: [
          { geom: box(0.32, 0.03, 0.4), mat: TIMBER, t: [-0.32, 0.3, 0] },
          { geom: box(0.03, 0.22, 0.4), mat: TIMBER, t: [-0.17, 0.42, 0] }, // front screen
          ...[-0.2, 0.2].map((z): NodeSpec => ({ geom: box(0.3, 0.1, 0.02), mat: 'team', t: [-0.32, 0.37, z] })),
          { geom: cyl(0.015, 0.015, 0.5, 5), mat: TIMBER, t: [-0.02, 0.32, 0], r: [0, 0, Math.PI / 2 - 0.1] }, // pole
          { geom: cyl(0.02, 0.02, 0.5, 6), mat: TIMBER, t: [-0.3, 0.2, 0], r: [Math.PI / 2, 0, 0] }, // axle
          wheel(0.24, 'wheel0'),
          wheel(-0.24, 'wheel1'),
        ],
      }),
    );
    return root;
  };
}

function chariotClips(attack: (t: number) => Pose, hold: Pose): Record<string, ClipDef> {
  const o = horseOpts(coat(0x6a4028));
  const Y = quadBodyY(o);
  const floor = 0.315;
  const apply = (root: THREE.Object3D, hp: QuadPose, rp: Pose, roll: number) => {
    applyQuadPose(root.getObjectByName('mount')!, hp, Y);
    const rider = root.getObjectByName('rider')!;
    applyPose(rider, { legL: [0, 0, 0.12], legR: [0, 0, -0.1], ...rp });
    rider.position.set(-0.33, floor - 0.01, 0);
    for (const w of ['wheel0', 'wheel1']) root.getObjectByName(w)!.rotation.z = -roll;
  };
  const clip = (frames: number, fps: number, loop: boolean, f: (t: number) => [QuadPose, Pose, number], markers?: Record<string, number>): ClipDef => ({
    frames,
    fps,
    loop,
    pose: (root, t) => {
      const [hp, rp, roll] = f(t);
      apply(root, hp, rp, roll);
    },
    ...(markers ? { markers } : {}),
  });
  return {
    idle: clip(8, 5, true, (t) => [{ bodyY: Y, neck: [0, 0, -0.08 * Math.sin(t * Math.PI * 2)] }, hold, 0]),
    walk: clip(10, 14, true, (t) => [quadWalk(t, 0.6, Y), { ...hold, lean: 0.05 }, t * Math.PI * 2]),
    attack: clip(10, 12, false, (t) => [{ bodyY: Y }, attack(t), 0], { hit: 4 / 9 }),
    die: clip(10, 10, false, (t) => [quadDie(t, Y, o.bodyR), { armR: [0.8 * ease(t, 0.3, 0.9), 0, 1.2], lean: -0.6 * ease(t, 0.2, 0.8) }, 0]),
  };
}

/** Standing spear thrust from the cart. */
function cartThrust(t: number): Pose {
  const back = ease(t, 0, 0.3) * (1 - ease(t, 0.3, 0.44));
  const hit = ease(t, 0.3, 0.44) * (1 - ease(t, 0.55, 1));
  return { armR: [0.2, 0, 1.0 - 0.8 * back + 0.5 * hit], foreR: [0, 0, 0.9 - 0.6 * hit], lean: 0.1 + 0.2 * hit, armL: [-0.1, 0, 0.6], foreL: [0, 0, 0.9] };
}
function cartBow(t: number): Pose {
  const p = bow(t);
  return { ...p, legL: [0, 0, 0.12], legR: [0, 0, -0.1], shinL: [0, 0, 0], shinR: [0, 0, 0], lean: 0 };
}

const SPEAR_HOLD: Pose = { armR: [0.15, 0, 0.9], foreR: [0, 0, 0.7] };
const BOW_HOLD: Pose = { armL: [-0.1, 0, 0.3], foreL: [0, 0, 1.2] };
const bowProps = (t: number) => (t >= 0.12 && t < 0.44 ? ['arrow'] : []);
/** Archers: the nocked arrow shows while drawing (the sim's arrow takes over on the loose). */
function withArrow(clips: Record<string, ClipDef>): Record<string, ClipDef> {
  const a = clips.attack!;
  const hide = (root: THREE.Object3D, show: boolean) => root.traverse((o) => o.name === 'prop:arrow' && (o.visible = show));
  return {
    ...clips,
    idle: { ...clips.idle!, pose: (r, t) => (clips.idle!.pose(r, t), hide(r, false)) },
    walk: { ...clips.walk!, pose: (r, t) => (clips.walk!.pose(r, t), hide(r, false)) },
    attack: { ...a, pose: (r, t) => (a.pose(r, t), hide(r, bowProps(t).length > 0)) },
    die: { ...clips.die!, pose: (r, t) => (clips.die!.pose(r, t), hide(r, false)) },
  };
}

const HORSE_BAY = horse(0x7a4a2a, 'none');
const HORSE_GREY = horse(0x9a948c, 'cloth');
const HORSE_BLACK = horse(0x2e2620, 'scale');

export const MOUNTED_MODELS: ModelDef[] = [
  { id: 'cavalry', kind: 'unit', facings: 8, build: riderModel(HORSE_BAY, { rightHand: sword, leftHand: smallShield, head: [helm('bronze')], torso: [cuirass('bronze')] }), clips: rideClips(HORSE_BAY, saber, SPEAR_HOLD) },
  { id: 'heavyCavalry', kind: 'unit', facings: 8, build: riderModel(HORSE_GREY, { rightHand: sword, leftHand: smallShield, head: [helm('iron'), plume], torso: [cuirass('iron')], bulk: 1.08 }), clips: rideClips(HORSE_GREY, saber, SPEAR_HOLD) },
  { id: 'cataphract', kind: 'unit', facings: 8, build: riderModel(HORSE_BLACK, { rightHand: spear(0.8, 'iron'), leftHand: smallShield, head: [helm('iron'), plume], torso: [cuirass(SCALE)], bulk: 1.12 }), clips: rideClips(HORSE_BLACK, lance, SPEAR_HOLD) },
  { id: 'camel', kind: 'unit', facings: 8, build: riderModel(camel(), { rightHand: sword, head: [turban], torso: [] }), clips: rideClips(camel(), saber, SPEAR_HOLD) },
  { id: 'horseArcher', kind: 'unit', facings: 8, build: riderModel(HORSE_BAY, { leftHand: bowStave, rightHand: nockedArrow, head: [{ geom: sphere(0.074, 10), mat: 'leather', t: [-0.005, 0.085, 0], s: [1, 0.62, 1] }], torso: [quiver] }), clips: withArrow(rideClips(HORSE_BAY, saddleBow, BOW_HOLD)) },
  { id: 'heavyHorseArcher', kind: 'unit', facings: 8, build: riderModel(HORSE_GREY, { leftHand: bowStave, rightHand: nockedArrow, head: [helm('iron')], torso: [quiver, cuirass('iron')] }), clips: withArrow(rideClips(HORSE_GREY, saddleBow, BOW_HOLD)) },
  { id: 'warElephant', kind: 'unit', facings: 8, build: riderModel(warElephant(false, false), { rightHand: goad, head: [turban] }), clips: rideClips(warElephant(false, false), stamp, SPEAR_HOLD) },
  { id: 'armoredElephant', kind: 'unit', facings: 8, build: riderModel(warElephant(true, false), { rightHand: goad, head: [helm('iron')] }), clips: rideClips(warElephant(true, false), stamp, SPEAR_HOLD) },
  { id: 'elephantArcher', kind: 'unit', facings: 8, build: riderModel(warElephant(false, true), { leftHand: bowStave, rightHand: nockedArrow, head: [turban], torso: [quiver] }), clips: withArrow(rideClips(warElephant(false, true), saddleBow, BOW_HOLD)) },
  { id: 'chariot', kind: 'unit', facings: 8, build: chariotModel({ rightHand: spear(0.7, 'bronze'), leftHand: smallShield, head: [helm('bronze')] }, false), clips: chariotClips(cartThrust, SPEAR_HOLD) },
  { id: 'scytheChariot', kind: 'unit', facings: 8, build: chariotModel({ rightHand: spear(0.7, 'iron'), leftHand: smallShield, head: [helm('iron'), plume] }, true), clips: chariotClips(cartThrust, SPEAR_HOLD) },
  { id: 'chariotArcher', kind: 'unit', facings: 8, build: chariotModel({ leftHand: bowStave, rightHand: nockedArrow, head: [helm('bronze')], torso: [quiver] }, false), clips: withArrow(chariotClips(cartBow, BOW_HOLD)) },
];
