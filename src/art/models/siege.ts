import * as THREE from 'three';
import { box, build, cyl, lumpy, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { ease } from '../dsl/rig.ts';
import { banner, logPile, post } from './buildings.ts';
import type { ClipDef, ModelDef } from './types.ts';

/**
 * Siege (M7.3). The stone thrower line is a torsion engine on a wheeled frame: its arm, cocked back with a stone
 * in the cup, whips up against the stop bar on the release frame (the `hit` marker, 0.35 s — the sim's windup)
 * and is winched back down. The ballista line is a great crossbow on a cart whose string snaps forward. Wheels
 * roll while moving. Models face +X; ~1 tile long (radius 0.5).
 */
const TIMBER: MatSpec = { tex: 'planks', color: 0x8a6a44, rough: 0.9, repeat: 2 };
const DARK: MatSpec = { tex: 'planks', color: 0x5c4630, rough: 0.9, repeat: 2 };
const IRON: MatSpec = { tex: 'plain', color: 0x4a4a4e, rough: 0.5, metal: 0.6 };
const ROPE: MatSpec = { tex: 'cloth', color: 0xb89a6a, rough: 1, repeat: 6 };
const STONE: MatSpec = { tex: 'rock', color: 0x9a948a, rough: 1, repeat: 1 };

interface EngineLook {
  s: number;
  wood: MatSpec;
  /** Iron straps on beams and tyres on wheels (Heavy Catapult). */
  iron: boolean;
}

/** A spoked wheel as a bone (rolls about its axle, the local Z axis). */
function wheel(name: string, x: number, z: number, r: number, look: EngineLook): NodeSpec {
  const spokes: NodeSpec[] = [0, 1, 2, 3].map((i) => ({ geom: box(0.018, r * 1.9, 0.02), mat: look.wood, r: [0, 0, (i * Math.PI) / 4] }));
  return {
    bone: name,
    t: [x, r, z],
    children: [
      { geom: cyl(r, r, 0.035, 14), mat: look.iron ? IRON : look.wood, r: [Math.PI / 2, 0, 0] },
      { geom: cyl(r * 0.8, r * 0.8, 0.04, 14), mat: DARK, r: [Math.PI / 2, 0, 0] },
      { geom: cyl(0.03, 0.03, 0.07, 8), mat: IRON, r: [Math.PI / 2, 0, 0] },
      ...spokes,
    ],
  };
}

/** Wheeled base: two side beams, cross beams, four wheels; a team cloth on the flank. */
function cart(look: EngineLook, len = 0.9, width = 0.44): NodeSpec[] {
  const y = 0.2;
  const kids: NodeSpec[] = [];
  for (const z of [-width / 2, width / 2]) kids.push({ geom: box(len, 0.07, 0.06), mat: look.wood, t: [0, y, z] });
  for (const x of [-len / 2 + 0.08, 0, len / 2 - 0.08]) kids.push({ geom: box(0.06, 0.06, width + 0.06), mat: look.wood, t: [x, y + 0.02, 0] });
  if (look.iron) for (const x of [-len / 3, len / 3]) for (const z of [-width / 2, width / 2]) kids.push({ geom: box(0.03, 0.08, 0.07), mat: IRON, t: [x, y, z] });
  let k = 0;
  for (const x of [-len / 2 + 0.14, len / 2 - 0.14]) for (const z of [-width / 2 - 0.05, width / 2 + 0.05]) kids.push(wheel(`wheel${k++}`, x, z, 0.13, look));
  kids.push({ geom: box(0.3, 0.1, 0.005), mat: 'team', t: [-0.1, y - 0.03, width / 2 + 0.035] });
  kids.push({ geom: box(0.3, 0.1, 0.005), mat: 'team', t: [-0.1, y - 0.03, -width / 2 - 0.035] });
  return kids;
}

// ── Stone thrower line ────────────────────────────────────────────────────────────────────────────────────
/** Arm angle (about Z; 0 = +X, π/2 = straight up): cocked back and low, or thrown up against the stop bar. */
const COCKED = Math.PI - 0.32;
const THROWN = Math.PI / 2 - 0.18;

function thrower(look: EngineLook): () => THREE.Object3D {
  return () => {
    const armLen = 0.62;
    const cup: NodeSpec[] = [
      { geom: cyl(0.07, 0.05, 0.05, 10), mat: look.wood, t: [armLen, 0.02, 0] },
      { name: 'stone', geom: lumpy(0.05, 0.25, 7, 0), mat: STONE, t: [armLen, 0.07, 0] },
    ];
    const g = build({
      s: look.s,
      children: [
        ...cart(look),
        // An A-frame of uprights leaning together (reads as an engine, not a chair back, head-on) carrying the
        // padded stop bar the arm strikes.
        ...[-0.2, 0.2].map((z): NodeSpec => ({ geom: box(0.06, 0.4, 0.06), mat: look.wood, t: [0.1, 0.4, z * 0.8], r: [z > 0 ? -0.35 : 0.35, 0, 0.12] })),
        ...[-0.2, 0.2].map((z): NodeSpec => ({ geom: box(0.05, 0.3, 0.05), mat: look.wood, t: [0.22, 0.34, z], r: [0, 0, 0.55] })), // braces
        { geom: box(0.08, 0.08, 0.2), mat: look.wood, t: [0.08, 0.58, 0] },
        { geom: box(0.1, 0.1, 0.14), mat: ROPE, t: [0.03, 0.58, 0] },
        // Torsion skein between the side frames.
        { geom: cyl(0.07, 0.07, 0.4, 10), mat: ROPE, t: [-0.18, 0.28, 0], r: [Math.PI / 2, 0, 0] },
        ...(look.iron ? [{ geom: box(0.1, 0.1, 0.46), mat: IRON, t: [-0.18, 0.28, 0] } as NodeSpec] : []),
        // Winch at the back.
        { geom: cyl(0.04, 0.04, 0.46, 8), mat: look.wood, t: [-0.4, 0.3, 0], r: [Math.PI / 2, 0, 0] },
        { bone: 'arm', t: [-0.18, 0.28, 0], r: [0, 0, COCKED], children: [{ geom: box(armLen, 0.06, 0.07), mat: look.wood, t: [armLen / 2, 0, 0] }, ...cup] },
      ],
    });
    return g;
  };
}

function throwerClips(): Record<string, ClipDef> {
  const set = (root: THREE.Object3D, arm: number, roll: number, stone: boolean, tilt = 0, drop = 0) => {
    root.getObjectByName('arm')!.rotation.z = arm;
    const s = root.getObjectByName('stone');
    if (s) s.visible = stone;
    for (let i = 0; i < 4; i++) {
      const w = root.getObjectByName(`wheel${i}`);
      if (w) w.rotation.z = -roll;
    }
    root.rotation.x = tilt;
    root.position.y = -drop;
  };
  return {
    idle: { frames: 1, fps: 1, loop: true, pose: (r) => set(r, COCKED, 0, true) },
    walk: { frames: 8, fps: 8, loop: true, pose: (r, t) => set(r, COCKED, t * Math.PI * 2, true) },
    // 12 frames at 10 fps: still, the throw (release at 0.35 s), a pause at the bar, then winched back down.
    attack: {
      frames: 12,
      fps: 10,
      loop: false,
      markers: { hit: 0.29 },
      pose: (r, t) => {
        let a: number;
        if (t < 0.18) a = COCKED;
        else if (t < 0.3) a = COCKED + (THROWN - COCKED) * ease(t, 0.18, 0.3);
        else if (t < 0.55) a = THROWN;
        else a = THROWN + (COCKED - THROWN) * ease(t, 0.55, 1);
        set(r, a, 0, t < 0.29 || t > 0.9);
      },
    },
    die: { frames: 8, fps: 8, loop: false, pose: (r, t) => set(r, COCKED + 0.5 * ease(t, 0, 1), 0, false, 0.28 * ease(t, 0, 1), 0.04 * ease(t, 0, 1)) },
  };
}

// ── Ballista line ─────────────────────────────────────────────────────────────────────────────────────────
function crossbow(look: EngineLook, double: boolean): () => THREE.Object3D {
  return () => {
    const bow = (y: number, tag: string): NodeSpec => ({
      t: [0, y, 0],
      children: [
        { geom: box(0.78, 0.06, 0.1), mat: look.wood, t: [0.05, 0, 0] }, // stock
        { geom: box(0.08, 0.06, 0.62), mat: look.wood, t: [0.34, 0.02, 0] }, // bow arms
        ...[-0.29, 0.29].map((z): NodeSpec => ({ geom: box(0.12, 0.04, 0.04), mat: look.wood, t: [0.28, 0.02, z], r: [0, z > 0 ? 0.6 : -0.6, 0] })),
        { geom: box(0.1, 0.1, 0.12), mat: ROPE, t: [0.34, 0.02, 0] },
        // String and bolt: pulled back when cocked, forward when loosed.
        { bone: `string${tag}`, t: [0, 0.03, 0], children: [
          { geom: box(0.015, 0.015, 0.5), mat: ROPE, t: [0.24, 0, 0] },
          { name: `bolt${tag}`, geom: box(0.5, 0.02, 0.02), mat: IRON, t: [0.44, 0.02, 0] },
        ] },
      ],
    });
    return build({
      s: look.s,
      children: [
        ...cart(look, 0.8, 0.4),
        { geom: cyl(0.05, 0.07, 0.3, 8), mat: look.wood, t: [0, 0.36, 0] },
        { t: [0, 0.52, 0], r: [0, 0, 0.1], children: [bow(0, 'A'), ...(double ? [bow(0.14, 'B')] : [])] },
        ...(double ? [{ geom: box(0.06, 0.3, 0.5), mat: DARK, t: [0.46, 0.38, 0] } as NodeSpec] : []), // mantlet
      ],
    });
  };
}

function crossbowClips(double: boolean): Record<string, ClipDef> {
  const set = (root: THREE.Object3D, pull: number, roll: number, bolt: boolean, tilt = 0) => {
    for (const tag of double ? ['A', 'B'] : ['A']) {
      root.getObjectByName(`string${tag}`)!.position.x = -pull;
      const b = root.getObjectByName(`bolt${tag}`);
      if (b) b.visible = bolt;
    }
    for (let i = 0; i < 4; i++) {
      const w = root.getObjectByName(`wheel${i}`);
      if (w) w.rotation.z = -roll;
    }
    root.rotation.x = tilt;
  };
  return {
    idle: { frames: 1, fps: 1, loop: true, pose: (r) => set(r, 0.18, 0, true) },
    walk: { frames: 8, fps: 8, loop: true, pose: (r, t) => set(r, 0.18, t * Math.PI * 2, true) },
    attack: {
      frames: 10,
      fps: 10,
      loop: false,
      markers: { hit: 0.35 },
      pose: (r, t) => {
        const pull = t < 0.3 ? 0.18 : t < 0.36 ? 0.18 * (1 - (t - 0.3) / 0.06) : 0.18 * ease(t, 0.36, 1);
        set(r, pull, 0, t < 0.35 || t > 0.85);
      },
    },
    die: { frames: 8, fps: 8, loop: false, pose: (r, t) => set(r, 0, 0, false, 0.3 * ease(t, 0, 1)) },
  };
}

// ── Siege Workshop ────────────────────────────────────────────────────────────────────────────────────────
/** An open timber shed over a half-built engine, a treadwheel crane, beams and a log pile (Bronze Age). */
function siegeWorkshop(): THREE.Object3D {
  const look: EngineLook = { s: 1, wood: TIMBER, iron: false };
  const shedPosts: NodeSpec[] = [];
  for (const x of [-1.1, 0.1]) for (const z of [-1.1, 0.1]) shedPosts.push({ geom: box(0.08, 0.8, 0.08), mat: 'wood', t: [x, 0.4, z] });
  return build({
    children: [
      { geom: box(2.6, 0.04, 2.6), mat: { tex: 'plain', color: 0x9a7e56, rough: 1 }, t: [0, 0.02, 0] },
      ...shedPosts,
      { geom: box(1.45, 0.06, 1.45), mat: 'planks', t: [-0.5, 0.82, -0.5] },
      { geom: box(1.5, 0.05, 1.5), mat: 'rooftile', t: [-0.5, 0.88, -0.5], r: [0.12, 0, 0] },
      { geom: box(1.46, 0.08, 0.04), mat: 'team', t: [-0.5, 0.74, 0.12] },
      // A stone thrower frame under construction in the shed.
      { t: [-0.55, 0, -0.55], r: [0, 0.4, 0], children: cart(look, 0.8, 0.4).filter((n) => !n.bone) },
      // Treadwheel crane in the yard.
      { t: [0.75, 0, -0.7], children: [
        { geom: cyl(0.38, 0.38, 0.14, 16), mat: DARK, t: [0, 0.42, 0], r: [Math.PI / 2, 0, 0] },
        { geom: cyl(0.3, 0.3, 0.15, 16), mat: TIMBER, t: [0, 0.42, 0], r: [Math.PI / 2, 0, 0] },
        { geom: box(0.06, 1.2, 0.06), mat: 'wood', t: [0.1, 0.6, 0.12], r: [0, 0, -0.35] },
        { geom: box(0.5, 0.05, 0.05), mat: 'wood', t: [0.35, 1.12, 0.12], r: [0, 0, 0.2] },
        { geom: box(0.01, 0.4, 0.01), mat: ROPE, t: [0.58, 0.95, 0.12] },
      ] },
      logPile(0.75, 0.55, 7, 91),
      { geom: box(1.0, 0.07, 0.08), mat: 'wood', t: [-0.35, 0.05, 0.9], r: [0, 0.2, 0] },
      { geom: box(0.9, 0.07, 0.08), mat: 'wood', t: [-0.3, 0.12, 0.95], r: [0, 0.15, 0] },
      { geom: sphere(0.08, 8), mat: STONE, t: [0.3, 0.08, 1.05] },
      { geom: sphere(0.07, 8), mat: STONE, t: [0.45, 0.07, 0.95] },
      post(1.2, 1.2, 0.3),
      banner(1.15, -1.15, 0.95),
    ],
  });
}

const STONE_THROWER: EngineLook = { s: 1, wood: TIMBER, iron: false };
const CATAPULT: EngineLook = { s: 1.12, wood: DARK, iron: false };
const HEAVY: EngineLook = { s: 1.25, wood: DARK, iron: true };

export const SIEGE_MODELS: ModelDef[] = [
  { id: 'stoneThrower', kind: 'unit', facings: 8, build: thrower(STONE_THROWER), clips: throwerClips() },
  { id: 'catapult', kind: 'unit', facings: 8, build: thrower(CATAPULT), clips: throwerClips() },
  { id: 'heavyCatapult', kind: 'unit', facings: 8, build: thrower(HEAVY), clips: throwerClips() },
  { id: 'ballista', kind: 'unit', facings: 8, build: crossbow(STONE_THROWER, false), clips: crossbowClips(false) },
  { id: 'helepolis', kind: 'unit', facings: 8, build: crossbow(HEAVY, true), clips: crossbowClips(true) },
  { id: 'siegeWorkshop', kind: 'building', footprint: 3, facings: 1, build: siegeWorkshop },
];
