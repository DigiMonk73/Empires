import { box, build, cone, cyl, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { ease, humanoid, type Pose } from '../dsl/rig.ts';
import { belt, bow, bowStave, FEATHER, GRIP, leatherCap, nockedArrow, quiver, soldierClips, stance, STRING } from './soldiers.ts';
import type { ModelDef } from './types.ts';

/**
 * Bronze- and Iron-age infantry (M7.4b): the swordsman line (Short → Broad → Long Swordsman → Legion), the
 * Academy's hoplite line (Hoplite → Phalanx → Centurion) and the archer upgrades. Same rig and timing as the
 * early soldiers (blow on frame 4 of 10, D26); each step up the line adds metal, a bigger shield or a longer
 * blade so a player can tell the upgrades apart at a glance.
 */
const HORN: MatSpec = { tex: 'plain', color: 0x3a2a1c, rough: 0.6 };
const LINEN: MatSpec = { tex: 'cloth', color: 0xe6dcc0, rough: 1, repeat: 5 };
const CREST: MatSpec = { tex: 'hair', color: 0xa02a1e, rough: 1, repeat: 4 };

// ── Attack poses ──────────────────────────────────────────────────────────────────────────────────────────
/** Sword thrust: draw back, lunge and drive the point forward at t = 0.44, recover behind the shield. */
function thrust(t: number): Pose {
  const back = ease(t, 0, 0.3);
  const lunge = ease(t, 0.3, 0.44);
  const recover = ease(t, 0.6, 1);
  const k = lunge * (1 - recover);
  return {
    ...stance(0.05 + 0.3 * k),
    armR: [0.2 - 0.2 * k, 0, 0.35 - 0.3 * back * (1 - lunge) + 1.25 * k],
    foreR: [0, 0, 0.7 + 0.4 * back * (1 - lunge) - 0.55 * k],
    armL: [-0.15, 0, 0.45 + 0.1 * k],
    foreL: [0, 0, 1.1],
  };
}

/** Overhand spear: the spear rides above the shoulder and stabs down-forward at t = 0.44. */
function spear(t: number): Pose {
  const draw = ease(t, 0, 0.3);
  const stab = ease(t, 0.3, 0.44);
  const recover = ease(t, 0.6, 1);
  const k = stab * (1 - recover);
  return {
    ...stance(0.05 + 0.25 * k),
    armR: [0.3, 0, 2.4 - 0.2 * draw + 0.25 * k - 0.1 * recover],
    foreR: [0, 0, 0.3 + 0.5 * draw - 0.8 * k],
    armL: [-0.15, 0, 0.5],
    foreL: [0, 0, 1.15],
  };
}

/** Shield carried in front on the march and at rest. */
const SHIELD_HOLD: Pose = { armL: [-0.15, 0, 0.45], foreL: [0, 0, 1.1] };
/** Spear carried upright over the shoulder. */
const SPEAR_HOLD: Pose = { ...SHIELD_HOLD, armR: [0.25, 0, 0.3], foreR: [0, 0, 1.3] };

// ── Kit ───────────────────────────────────────────────────────────────────────────────────────────────────
function sword(len: number, metal: 'bronze' | 'iron', wide = 0.035): NodeSpec[] {
  return [
    { r: [0, 0, GRIP], children: [
      { geom: cyl(0.012, 0.012, 0.07, 6), mat: 'leather', t: [0, -0.02, 0] },
      { geom: box(0.08, 0.016, 0.03), mat: metal, t: [0, -0.06, 0] }, // guard
      { geom: box(wide, len, 0.008), mat: metal, t: [0, -0.07 - len / 2, 0] },
      { geom: cone(wide / 2, 0.04, 4), mat: metal, t: [0, -0.09 - len, 0], r: [Math.PI, 0, 0] },
    ] },
  ];
}

/** A spear held in the fist (the shaft runs along the hand's local −Y, point forward when the arm is raised). */
function dory(len: number, metal: 'bronze' | 'iron'): NodeSpec[] {
  return [
    { r: [0, 0, Math.PI / 2 + 0.2], children: [
      { geom: cyl(0.011, 0.011, len, 6), mat: 'wood', t: [0, -len * 0.25, 0] },
      { geom: cone(0.02, 0.09, 5), mat: metal, t: [0, -len * 0.75 - 0.04, 0], r: [Math.PI, 0, 0] },
      { geom: cone(0.012, 0.04, 5), mat: metal, t: [0, len * 0.25 + 0.02, 0] }, // butt spike
    ] },
  ];
}

/** Round shield on the left fist, facing forward; team field with a metal rim and boss. */
function roundShield(r: number, rim: 'bronze' | 'iron' | 'leather'): NodeSpec[] {
  return [
    { t: [0.02, -0.02, 0.04], r: [0, Math.PI / 2, 0], children: [
      { geom: cyl(r, r, 0.02, 18), mat: 'team', r: [Math.PI / 2, 0, 0] },
      { geom: cyl(r + 0.008, r + 0.008, 0.012, 18), mat: rim, r: [Math.PI / 2, 0, 0], t: [0, 0, -0.004] },
      { geom: sphere(r * 0.22, 8), mat: rim, t: [0, 0, 0.012], s: [1, 1, 0.5] },
    ] },
  ];
}

/** Tall curved legionary scutum. */
function scutum(): NodeSpec[] {
  // The shield hangs off a forearm held level in front; turn it back upright (the hold pose bends the arm ~1.5).
  return [
    { r: [0, 0, -1.5], children: [{ t: [0.02, -0.02, 0.05], r: [0, Math.PI / 2, 0], children: [
      { geom: box(0.16, 0.34, 0.02), mat: 'team' },
      ...[-1, 1].map((sx): NodeSpec => ({ geom: box(0.06, 0.34, 0.02), mat: 'team', t: [sx * 0.105, 0, -0.018], r: [0, sx * 0.55, 0] })),
      { geom: box(0.34, 0.02, 0.02), mat: 'iron', t: [0, 0.16, 0.035] },
      { geom: box(0.34, 0.02, 0.02), mat: 'iron', t: [0, -0.16, 0.035] },
      { geom: sphere(0.045, 8), mat: 'bronze', t: [0, 0, 0.04], s: [1, 1, 0.6] },
    ] }] },
  ];
}

const bronzeCap: NodeSpec = { geom: sphere(0.078, 10), mat: 'bronze', t: [-0.005, 0.085, 0], s: [1, 0.72, 1] };
const cheekGuards: NodeSpec[] = [-1, 1].map((z) => ({ geom: box(0.05, 0.07, 0.012), mat: 'bronze', t: [0.04, 0.03, z * 0.07] }));
const ironHelm: NodeSpec = { geom: sphere(0.08, 10), mat: 'iron', t: [-0.005, 0.085, 0], s: [1, 0.75, 1] };
const neckGuard: NodeSpec = { geom: box(0.06, 0.02, 0.14), mat: 'iron', t: [-0.075, 0.05, 0], r: [0, 0, -0.4] };
function crest(transverse: boolean, h = 0.06): NodeSpec {
  return { geom: box(transverse ? 0.03 : 0.16, h, transverse ? 0.16 : 0.03), mat: CREST, t: [-0.01, 0.17, 0] };
}
/** Corinthian helmet: bronze bowl down over the face with a tall crest. */
const corinthian: NodeSpec[] = [
  { geom: sphere(0.083, 10), mat: 'bronze', t: [0, 0.07, 0], s: [1, 0.95, 1] },
  { geom: box(0.02, 0.07, 0.03), mat: 'bronze', t: [0.078, 0.03, 0] }, // nose guard
];
const cuirass = (mat: 'bronze' | 'iron'): NodeSpec => ({ geom: cyl(0.105, 0.1, 0.2, 12), mat, t: [0, 0.16, 0] });
/** Lorica segmentata: iron bands around the chest. */
const segmentata: NodeSpec[] = [0.08, 0.13, 0.18, 0.23].map((y) => ({ geom: cyl(0.108, 0.104, 0.035, 12), mat: 'iron', t: [0, y, 0] }));
const linenCorselet: NodeSpec = { geom: cyl(0.103, 0.1, 0.17, 12), mat: LINEN, t: [0, 0.15, 0] };
const pteruges: NodeSpec[] = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
  const a = (i / 8) * Math.PI * 2;
  return { geom: box(0.03, 0.08, 0.012), mat: 'leather', t: [Math.cos(a) * 0.1, 0.0, Math.sin(a) * 0.1], r: [0, -a, 0] };
});
const cloak: NodeSpec = { geom: box(0.02, 0.3, 0.2), mat: CREST, t: [-0.11, 0.12, 0], r: [0, 0, 0.12] };

const compositeBow: NodeSpec[] = [
  // Recurved, horn-backed: dark limbs that flip forward at the tips.
  { r: [0, 0, Math.PI / 2], children: [
    { geom: cyl(0.012, 0.01, 0.26, 6), mat: HORN, t: [0.035, 0.12, 0], r: [0, 0, 0.3] },
    { geom: cyl(0.012, 0.01, 0.26, 6), mat: HORN, t: [0.035, -0.12, 0], r: [0, 0, -0.3] },
    { geom: cyl(0.008, 0.006, 0.07, 5), mat: HORN, t: [0.1, 0.25, 0], r: [0, 0, -0.5] },
    { geom: cyl(0.008, 0.006, 0.07, 5), mat: HORN, t: [0.1, -0.25, 0], r: [0, 0, 0.5] },
    { geom: cyl(0.003, 0.003, 0.54, 4), mat: STRING, t: [-0.035, 0, 0] },
  ] },
];
const featherCap: NodeSpec[] = [leatherCap, { geom: cone(0.012, 0.09, 4), mat: FEATHER, t: [-0.06, 0.15, 0.02], r: [0.2, 0, 0.5] }];

const swordClips = soldierClips(thrust, undefined, SHIELD_HOLD);
const spearClips = soldierClips(spear, undefined, SPEAR_HOLD);
const bowClips = soldierClips(bow, { idle: [], attack: (t) => (t >= 0.12 && t < 0.44 ? ['arrow'] : []) }, { armL: [-0.1, 0, 0.3], foreL: [0, 0, 1.2] });

export const INFANTRY_MODELS: ModelDef[] = [
  {
    id: 'shortSwordsman', kind: 'unit', facings: 8, clips: swordClips,
    build: () => build(humanoid({ top: 'team', skirt: 'leather', bulk: 1.08, rightHand: sword(0.2, 'bronze'), leftHand: roundShield(0.1, 'leather'), head: [bronzeCap], torso: [belt, linenCorselet] })),
  },
  {
    id: 'broadSwordsman', kind: 'unit', facings: 8, clips: swordClips,
    build: () => build(humanoid({ top: 'team', skirt: 'leather', bulk: 1.1, rightHand: sword(0.24, 'bronze', 0.05), leftHand: roundShield(0.12, 'bronze'), head: [bronzeCap, ...cheekGuards], torso: [belt, cuirass('bronze'), ...pteruges] })),
  },
  {
    id: 'longSwordsman', kind: 'unit', facings: 8, clips: swordClips,
    build: () => build(humanoid({ top: 'team', skirt: 'leather', bulk: 1.12, rightHand: sword(0.34, 'iron', 0.04), leftHand: roundShield(0.13, 'iron'), head: [ironHelm, neckGuard, crest(false)], torso: [belt, cuirass('iron'), ...pteruges] })),
  },
  {
    id: 'legion', kind: 'unit', facings: 8, clips: swordClips,
    build: () => build(humanoid({ top: 'team', skirt: 'leather', bulk: 1.14, rightHand: sword(0.22, 'iron', 0.045), leftHand: scutum(), head: [ironHelm, neckGuard, ...cheekGuards, crest(false, 0.08)], torso: [belt, ...segmentata] })),
  },
  {
    id: 'hoplite', kind: 'unit', facings: 8, clips: spearClips,
    build: () => build(humanoid({ top: 'team', skirt: 'cloth', bulk: 1.1, rightHand: dory(0.9, 'bronze'), leftHand: roundShield(0.15, 'bronze'), head: [...corinthian, crest(false, 0.07)], torso: [belt, linenCorselet, ...pteruges] })),
  },
  {
    id: 'phalanx', kind: 'unit', facings: 8, clips: spearClips,
    build: () => build(humanoid({ top: 'team', skirt: 'cloth', bulk: 1.14, rightHand: dory(1.05, 'bronze'), leftHand: roundShield(0.17, 'bronze'), head: [...corinthian, crest(false, 0.09)], torso: [belt, cuirass('bronze'), ...pteruges] })),
  },
  {
    id: 'centurion', kind: 'unit', facings: 8, clips: spearClips,
    build: () => build(humanoid({ top: 'team', skirt: 'leather', bulk: 1.16, rightHand: dory(1.05, 'iron'), leftHand: roundShield(0.17, 'iron'), head: [ironHelm, ...cheekGuards, crest(true, 0.08)], torso: [belt, ...segmentata, cloak] })),
  },
  {
    id: 'improvedBowman', kind: 'unit', facings: 8, clips: bowClips,
    build: () => build(humanoid({ top: 'team', skirt: 'leather', leftHand: bowStave, rightHand: nockedArrow, head: featherCap, torso: [belt, quiver, linenCorselet] })),
  },
  {
    id: 'compositeBowman', kind: 'unit', facings: 8, clips: bowClips,
    build: () => build(humanoid({ top: 'team', skirt: 'leather', bulk: 1.05, leftHand: compositeBow, rightHand: nockedArrow, head: [bronzeCap], torso: [belt, quiver, cuirass('bronze')] })),
  },
];
