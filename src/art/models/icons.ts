import * as THREE from 'three';
import { box, build, cone, cyl, sphere, type MatSpec, type NodeSpec, type Vec3 } from '../dsl/model.ts';
import type { ModelDef } from './types.ts';

/**
 * Tech icons (M9.7): small still lifes baked like everything else (same light, same materials), without a ground
 * shadow, framed for a HUD button. Units and buildings a tech brings or upgrades use their own sprites
 * (ui/techIcons.ts); these cover the rest — tools, armour, shields, the market's trades, faith and government.
 * Each model's variants are the techs of one line, in the order ui/techIcons.ts lists them.
 */
const BRONZE: MatSpec = { tex: 'metal', color: 0xc08a3e, rough: 0.4, metal: 0.55, repeat: 2 };
const IRON: MatSpec = { tex: 'metal', color: 0x9aa0a8, rough: 0.4, metal: 0.55, repeat: 2 };
const STEEL: MatSpec = { tex: 'metal', color: 0xc8ccd4, rough: 0.3, metal: 0.6, repeat: 2 };
const GOLD: MatSpec = { tex: 'metal', color: 0xe8c050, rough: 0.35, metal: 0.6, repeat: 2 };
const STONE: MatSpec = { tex: 'rock', color: 0xb0aca2, rough: 0.9, repeat: 1.5 };
const FLINT: MatSpec = { tex: 'rock', color: 0x6a6660, rough: 0.7, repeat: 2 };
const WOOD: MatSpec = { tex: 'planks', color: 0x8a6440, rough: 0.8, repeat: 2 };
const DARKWOOD: MatSpec = { tex: 'planks', color: 0x5a4028, rough: 0.8, repeat: 2 };
const LEATHER: MatSpec = { tex: 'leather', color: 0x8a5a32, rough: 0.8, repeat: 3 };
const SCALE: MatSpec = { tex: 'scales', color: 0xc09048, rough: 0.45, metal: 0.4, repeat: 5 };
const MAIL: MatSpec = { tex: 'cloth', color: 0xa8acb4, rough: 0.4, metal: 0.5, repeat: 10 };
const CLOTH: MatSpec = { tex: 'cloth', color: 0xd8c8a0, rough: 0.9, repeat: 4 };
const PARCHMENT: MatSpec = { tex: 'plaster', color: 0xe8dcb8, rough: 0.9, repeat: 1 };
const CLAY: MatSpec = { tex: 'plaster', color: 0xb8764a, rough: 0.9, repeat: 1 };
const MARBLE: MatSpec = { tex: 'plaster', color: 0xf0ece2, rough: 0.6, repeat: 1.5 };
const WHEAT: MatSpec = { tex: 'thatch', color: 0xd8b048, rough: 1, repeat: 6 };
const LEAF: MatSpec = { tex: 'foliage', color: 0x4e8a34, rough: 1, repeat: 2 };
const WATER: MatSpec = { tex: 'plain', color: 0x4a8ab0, rough: 0.15 };
const FLAME: MatSpec = { tex: 'plain', color: 0xff9828, rough: 1, glow: true };
const FLAME_CORE: MatSpec = { tex: 'plain', color: 0xffe488, rough: 1, glow: true };
const GLASS: MatSpec = { tex: 'plain', color: 0x70b8c8, rough: 0.1, metal: 0.2 };
const INK: MatSpec = { tex: 'plain', color: 0x3a2a1c, rough: 1 };
const RED: MatSpec = { tex: 'plain', color: 0xb83a2a, rough: 0.7 };
const EMBER: MatSpec = { tex: 'plain', color: 0xff6a20, rough: 1, glow: true };

/** Turn a flat piece (face +Z) toward the camera: tilt it back by `tilt`, then yaw to the viewer (+X+Z). */
const facing = (children: NodeSpec[], t: Vec3 = [0, 0, 0], tilt = 0.45): NodeSpec => ({ t, r: [0, Math.PI / 4, 0], children: [{ r: [-tilt, 0, 0], children }] });
/** A disc of radius r lying in the XY plane (face +Z). */
const disc = (r: number, th: number, mat: MatSpec, t: Vec3 = [0, 0, 0]): NodeSpec => ({ geom: cyl(r, r, th, 20), mat, t, r: [Math.PI / 2, 0, 0] });

const icon = (variants: (v: number) => NodeSpec[]) => (v: number): THREE.Object3D => build({ children: variants(v) });

// ── Storage pit: tools, armour, shields ───────────────────────────────────────────────────────────────────
/** Toolworking (a flint hammer and chisel), Metalworking (a bronze hammer on an anvil), Metallurgy (iron, a glowing bar). */
function forge(v: number): NodeSpec[] {
  const head = v === 0 ? FLINT : v === 1 ? BRONZE : STEEL;
  const out: NodeSpec[] = [];
  if (v === 0) out.push({ geom: box(0.5, 0.18, 0.36), mat: STONE, t: [0, 0.09, 0] });
  else out.push({ geom: box(0.22, 0.14, 0.26), mat: IRON, t: [0, 0.07, 0] }, { geom: box(0.5, 0.1, 0.22), mat: IRON, t: [0, 0.19, 0] }, { geom: cone(0.06, 0.16, 6), mat: IRON, t: [0.32, 0.19, 0], r: [0, 0, -Math.PI / 2] });
  const top = v === 0 ? 0.18 : 0.24;
  if (v === 2) out.push({ geom: box(0.26, 0.05, 0.08), mat: EMBER, t: [-0.05, top + 0.025, 0.02] });
  if (v === 0) out.push({ geom: cone(0.03, 0.2, 5), mat: FLINT, t: [0.14, top + 0.05, 0.08], r: [0, 0, 1.2] });
  // The hammer, leaning on the block, head up.
  out.push({ t: [0.05, top, -0.02], r: [0.2, 0, 0.55], children: [{ geom: cyl(0.022, 0.026, 0.5, 6), mat: WOOD, t: [0, 0.25, 0] }, { geom: v === 0 ? sphere(0.08, 7) : box(0.1, 0.1, 0.22), mat: head, t: [0, 0.5, 0], ...(v === 0 ? { s: [1, 0.8, 1.3] as Vec3 } : {}) }] });
  return out;
}

/** A cuirass: torso shell, shoulder guards and a skirt of strips. */
function cuirass(mat: MatSpec, t: Vec3): NodeSpec {
  return {
    t,
    children: [
      { geom: cyl(0.16, 0.13, 0.32, 12), mat, t: [0, 0.34, 0], s: [1, 1, 0.7] },
      { geom: sphere(0.08, 8), mat, t: [0, 0.5, 0.13], s: [1, 0.5, 0.8] },
      { geom: sphere(0.08, 8), mat, t: [0, 0.5, -0.13], s: [1, 0.5, 0.8] },
      ...[-0.09, -0.03, 0.03, 0.09].map((z): NodeSpec => ({ geom: box(0.05, 0.12, 0.05), mat: mat === MAIL ? LEATHER : mat, t: [0.02, 0.13, z * 1.2] })),
      { geom: box(0.02, 0.1, 0.12), mat: INK, t: [0.1, 0.46, 0] }, // neck opening
    ],
  };
}

/** Armour for soldiers, archers or cavalry (v = type × 3 + class): the cuirass and the class's badge beside it. */
function armor(v: number): NodeSpec[] {
  const mat = [LEATHER, SCALE, MAIL][Math.floor(v / 3)]!;
  const cls = v % 3;
  // An armour stand: the cuirass on a post with a crested helmet above it (reads as "armour" at 26 px), and the
  // class it protects as a large badge in front — a sword (infantry), a bow (archers), a horseshoe (cavalry).
  const out: NodeSpec[] = [
    { geom: box(0.3, 0.05, 0.3), mat: DARKWOOD, t: [-0.08, 0.025, -0.08] },
    { geom: cyl(0.025, 0.025, 0.72, 6), mat: DARKWOOD, t: [-0.08, 0.36, -0.08] },
    { ...cuirass(mat, [-0.08, 0.06, -0.08]), s: 1.3 },
    { t: [-0.08, 0.78, -0.08], children: [
      { geom: sphere(0.1, 12), mat: mat === LEATHER ? LEATHER : mat === SCALE ? BRONZE : IRON, s: [1, 1.1, 1] },
      { geom: box(0.22, 0.05, 0.04), mat: RED, t: [0, 0.1, 0], r: [0, 0, 0] },
      { geom: box(0.03, 0.08, 0.1), mat: mat === LEATHER ? LEATHER : mat === SCALE ? BRONZE : IRON, t: [0.07, -0.06, 0] },
    ] },
  ];
  if (cls === 0) out.push(facing([{ r: [0, 0, 0.6], children: [{ geom: box(0.06, 0.52, 0.02), mat: STEEL, t: [0, 0.26, 0] }, { geom: box(0.2, 0.04, 0.04), mat: GOLD, t: [0, 0, 0] }, { geom: cyl(0.02, 0.02, 0.12, 5), mat: LEATHER, t: [0, -0.07, 0] }] }], [0.24, 0.18, 0.22], 0.2));
  else if (cls === 1) out.push(facing([{ geom: new THREE.TorusGeometry(0.26, 0.02, 4, 16, Math.PI * 0.9), mat: WOOD, r: [0, 0, Math.PI / 2 + 0.15] }, { geom: box(0.008, 0.5, 0.008), mat: CLOTH, t: [0.03, 0.0, 0] }], [0.26, 0.3, 0.22], 0.25));
  else out.push(facing([{ geom: new THREE.TorusGeometry(0.15, 0.035, 6, 14, Math.PI * 1.35), mat: STEEL, r: [0, 0, -Math.PI * 0.175 + Math.PI / 2] }], [0.26, 0.2, 0.24], 0.3));
  return out;
}

/** Bronze Shield (round, bronze), Iron Shield (round, iron with a boss), Tower Shield (tall, curved, painted). */
function shield(v: number): NodeSpec[] {
  if (v === 2) {
    return [facing([
      { geom: new THREE.CylinderGeometry(0.4, 0.4, 0.62, 12, 1, false, -0.5, 1.0), mat: RED, t: [0, 0.36, -0.36], r: [0, 0, 0] },
      { geom: box(0.06, 0.62, 0.02), mat: GOLD, t: [0, 0.36, 0.045] },
      { geom: sphere(0.06, 8), mat: GOLD, t: [0, 0.36, 0.05], s: [1, 1, 0.5] },
    ], [0, 0, 0], 0.15)];
  }
  const face = v === 0 ? BRONZE : IRON;
  return [facing([
    disc(0.3, 0.04, face, [0, 0.32, 0]),
    { geom: new THREE.TorusGeometry(0.3, 0.02, 5, 24), mat: v === 0 ? GOLD : STEEL, t: [0, 0.32, 0.02] },
    { geom: sphere(0.08, 10), mat: v === 0 ? GOLD : STEEL, t: [0, 0.32, 0.03], s: [1, 1, 0.6] },
    ...(v === 1 ? [0, 1, 2, 3, 4, 5].map((i): NodeSpec => ({ geom: sphere(0.018, 5), mat: STEEL, t: [Math.cos((i * Math.PI) / 3) * 0.2, 0.32 + Math.sin((i * Math.PI) / 3) * 0.2, 0.03] })) : []),
  ], [0, 0, 0], 0.3)];
}

// ── Market ───────────────────────────────────────────────────────────────────────────────────────────────
/** Woodworking (an axe in a log), Artisanship (axe and saw), Craftsmanship (a gilded double axe). */
function axe(v: number): NodeSpec[] {
  // A log lying along X, its cut end toward the viewer, the axe struck into its top.
  const out: NodeSpec[] = [{ geom: cyl(0.14, 0.15, 0.4, 12), mat: 'bark', t: [-0.05, 0.14, 0], r: [0, 0, Math.PI / 2] }, { geom: cyl(0.14, 0.14, 0.01, 20), mat: WOOD, t: [0.155, 0.14, 0], r: [0, 0, Math.PI / 2] }];
  const blade = v === 2 ? GOLD : v === 1 ? STEEL : IRON;
  out.push({ t: [0.0, 0.26, 0.02], r: [0.1, 0, -0.35], children: [{ geom: cyl(0.02, 0.024, 0.46, 6), mat: WOOD, t: [0, 0.2, 0] }, { geom: box(0.14, 0.12, 0.02), mat: blade, t: [0.07, 0.4, 0] }, ...(v === 2 ? [{ geom: box(0.14, 0.12, 0.02), mat: blade, t: [-0.07, 0.4, 0] } as NodeSpec] : [])] });
  if (v === 1) out.push(facing([{ geom: box(0.4, 0.09, 0.01), mat: STEEL, t: [0, 0.05, 0] }, { geom: box(0.1, 0.08, 0.03), mat: WOOD, t: [0.23, 0.07, 0] }], [0.2, 0.02, 0.22], 1.2));
  return out;
}

/** Gold Mining (a pick on gold nuggets), Coinage (a stack of coins and one on edge). */
function gold(v: number): NodeSpec[] {
  if (v === 1) {
    const out: NodeSpec[] = [];
    for (let i = 0; i < 6; i++) out.push({ geom: cyl(0.13, 0.13, 0.035, 18), mat: GOLD, t: [-0.08 + (i % 2) * 0.01, 0.02 + i * 0.037, 0] });
    for (let i = 0; i < 3; i++) out.push({ geom: cyl(0.13, 0.13, 0.035, 18), mat: GOLD, t: [0.18, 0.02 + i * 0.037, -0.16] });
    out.push(facing([disc(0.14, 0.035, GOLD), { geom: box(0.06, 0.1, 0.01), mat: BRONZE, t: [0, 0, 0.02] }], [0.2, 0.15, 0.18], 0.2));
    return out;
  }
  const out: NodeSpec[] = [];
  for (let i = 0; i < 5; i++) out.push({ geom: sphere(0.08 - i * 0.008, 6), mat: GOLD, t: [Math.cos(i * 1.3) * 0.15, 0.05, Math.sin(i * 1.3) * 0.15], s: [1.2, 0.8, 1] });
  out.push(pick([0.02, 0.1, 0.0], IRON));
  return out;
}

function pick(t: Vec3, head: MatSpec): NodeSpec {
  return { t, r: [0.2, 0, 0.5], children: [{ geom: cyl(0.02, 0.024, 0.5, 6), mat: WOOD, t: [0, 0.25, 0] }, { t: [0, 0.5, 0], r: [0, 0, 0.2], children: [{ geom: cone(0.03, 0.22, 5), mat: head, t: [0.1, 0, 0], r: [0, 0, -Math.PI / 2] }, { geom: cone(0.03, 0.22, 5), mat: head, t: [-0.1, 0, 0], r: [0, 0, Math.PI / 2] }] }] };
}

/** Stone Mining (a pick on dressed blocks), Siegecraft (a carved stone shot on a block). */
function stone(v: number): NodeSpec[] {
  if (v === 1) return [{ geom: box(0.4, 0.16, 0.3), mat: STONE, t: [0, 0.08, 0] }, { geom: sphere(0.17, 12), mat: STONE, t: [0, 0.33, 0] }, { geom: box(0.2, 0.03, 0.05), mat: IRON, t: [0.2, 0.18, 0.15], r: [0, 0.6, 0.3] }];
  return [{ geom: box(0.3, 0.16, 0.22), mat: STONE, t: [-0.08, 0.08, -0.05] }, { geom: box(0.22, 0.14, 0.2), mat: STONE, t: [0.14, 0.07, 0.12] }, { geom: box(0.2, 0.14, 0.18), mat: STONE, t: [-0.05, 0.23, -0.03] }, pick([0.1, 0.16, 0.0], IRON)];
}

/** Domestication (a yoke over sheaves), Plow (an ard), Irrigation (a channel and a shaduf bucket). */
function farm(v: number): NodeSpec[] {
  if (v === 0) {
    return [
      ...[-0.12, 0.12].map((z): NodeSpec => ({ geom: cyl(0.07, 0.09, 0.34, 8), mat: WHEAT, t: [0, 0.17, z] })),
      ...[-0.12, 0.12].map((z): NodeSpec => ({ geom: cyl(0.075, 0.075, 0.03, 8), mat: CLOTH, t: [0, 0.16, z] })),
      { geom: new THREE.TorusGeometry(0.22, 0.03, 5, 12, Math.PI), mat: WOOD, t: [0.05, 0.3, 0], r: [0, Math.PI / 2, 0] },
    ];
  }
  if (v === 1) {
    return [{ t: [0, 0, 0], r: [0, 0.3, 0], children: [
      { geom: box(0.6, 0.04, 0.04), mat: WOOD, t: [-0.05, 0.22, 0], r: [0, 0, 0.35] },
      { geom: box(0.04, 0.3, 0.04), mat: WOOD, t: [0.2, 0.14, 0], r: [0, 0, -0.3] },
      { geom: cone(0.05, 0.18, 5), mat: IRON, t: [0.28, 0.03, 0], r: [0, 0, -1.2] },
      { geom: box(0.04, 0.2, 0.04), mat: WOOD, t: [-0.33, 0.4, 0], r: [0, 0, 0.3] },
    ] }, { geom: box(0.6, 0.02, 0.1), mat: { tex: 'plain', color: 0x6a4a2a, rough: 1 }, t: [0.05, 0.01, 0.15], r: [0, 0.3, 0] }];
  }
  return [
    { geom: box(0.7, 0.08, 0.14), mat: CLAY, t: [0, 0.04, 0.1] },
    { geom: box(0.7, 0.02, 0.1), mat: WATER, t: [0, 0.08, 0.1] },
    { geom: box(0.05, 0.4, 0.05), mat: WOOD, t: [-0.2, 0.2, -0.15] },
    { geom: box(0.6, 0.03, 0.03), mat: WOOD, t: [-0.05, 0.4, -0.15], r: [0, 0, -0.35] },
    { geom: box(0.005, 0.2, 0.005), mat: CLOTH, t: [0.22, 0.4, -0.15] },
    { geom: cyl(0.05, 0.04, 0.08, 8), mat: CLAY, t: [0.22, 0.28, -0.15] },
    { geom: sphere(0.06, 6), mat: STONE, t: [-0.33, 0.47, -0.15] },
  ];
}

/** The Wheel: a spoked wheel standing toward the viewer. */
function wheel(): NodeSpec[] {
  const spokes: NodeSpec[] = [];
  for (let i = 0; i < 6; i++) spokes.push({ geom: box(0.02, 0.5, 0.02), mat: WOOD, r: [0, 0, (i * Math.PI) / 6] });
  return [facing([{ geom: new THREE.TorusGeometry(0.27, 0.035, 6, 24), mat: DARKWOOD }, { geom: new THREE.TorusGeometry(0.29, 0.012, 4, 24), mat: IRON }, ...spokes, disc(0.06, 0.08, WOOD)], [0, 0.32, 0], 0.15)];
}

// ── Temple ───────────────────────────────────────────────────────────────────────────────────────────────
function flame(t: Vec3, s = 1): NodeSpec {
  return { t, s, children: [{ geom: cone(0.08, 0.26, 8), mat: FLAME, t: [0, 0.13, 0] }, { geom: cone(0.04, 0.16, 8), mat: FLAME_CORE, t: [0, 0.09, 0] }] };
}

/** Astrology, Mysticism, Polytheism, Afterlife, Monotheism, Fanaticism, Jihad, Medicine, Martyrdom. */
function faith(v: number): NodeSpec[] {
  switch (v) {
    case 0: // an astrolabe: rings round a gilded star
      return [{ geom: cyl(0.08, 0.1, 0.1, 8), mat: MARBLE, t: [0, 0.05, 0] }, { geom: new THREE.TorusGeometry(0.22, 0.012, 4, 24), mat: BRONZE, t: [0, 0.35, 0], r: [0.4, 0.5, 0] }, { geom: new THREE.TorusGeometry(0.22, 0.012, 4, 24), mat: BRONZE, t: [0, 0.35, 0], r: [1.3, 0, 0.4] }, { geom: new THREE.OctahedronGeometry(0.09), mat: GOLD, t: [0, 0.35, 0] }];
    case 1: // a scrying bowl with a glowing orb
      return [{ geom: cyl(0.2, 0.1, 0.1, 14), mat: BRONZE, t: [0, 0.1, 0] }, { geom: cyl(0.04, 0.08, 0.06, 8), mat: BRONZE, t: [0, 0.03, 0] }, { geom: sphere(0.13, 14), mat: GLASS, t: [0, 0.26, 0] }];
    case 2: // three gods on a plinth
      return [{ geom: box(0.6, 0.08, 0.24), mat: MARBLE, t: [0, 0.04, 0] }, ...[-0.2, 0, 0.2].map((x, i): NodeSpec => ({ t: [x, 0.08, 0], s: i === 1 ? 1.25 : 1, children: [{ geom: cyl(0.04, 0.07, 0.24, 8), mat: MARBLE, t: [0, 0.12, 0] }, { geom: sphere(0.04, 8), mat: MARBLE, t: [0, 0.28, 0] }] }))];
    case 3: // an ankh
      return [facing([{ geom: box(0.07, 0.4, 0.05), mat: GOLD, t: [0, 0.2, 0] }, { geom: box(0.34, 0.07, 0.05), mat: GOLD, t: [0, 0.38, 0] }, { geom: new THREE.TorusGeometry(0.09, 0.03, 6, 14), mat: GOLD, t: [0, 0.5, 0], s: [0.8, 1.1, 1] }], [0, 0, 0], 0.15)];
    case 4: // one tall pure flame on an altar
      return [{ geom: box(0.3, 0.2, 0.3), mat: MARBLE, t: [0, 0.1, 0] }, { geom: cyl(0.14, 0.1, 0.06, 10), mat: GOLD, t: [0, 0.23, 0] }, flame([0, 0.26, 0], 1.6)];
    case 5: // a raised torch
      return [{ t: [0, 0, 0], r: [0.15, 0, -0.2], children: [{ geom: cyl(0.025, 0.035, 0.5, 6), mat: WOOD, t: [0, 0.25, 0] }, { geom: cyl(0.05, 0.04, 0.08, 8), mat: CLOTH, t: [0, 0.5, 0] }, flame([0, 0.53, 0], 1.2)] }];
    case 6: // crossed swords over a flame
      return [flame([0, 0.02, 0], 1.1), ...[-0.55, 0.55].map((roll): NodeSpec => facing([{ r: [0, 0, roll], children: [{ geom: box(0.04, 0.5, 0.015), mat: STEEL, t: [0, 0.3, 0] }, { geom: box(0.13, 0.03, 0.03), mat: GOLD, t: [0, 0.06, 0] }] }], [0, 0.03, 0], 0.1))];
    case 7: // a bowl of herbs and a physician's staff
      return [{ geom: cyl(0.16, 0.1, 0.1, 12), mat: CLAY, t: [-0.05, 0.05, 0] }, ...[0, 1, 2, 3].map((i): NodeSpec => ({ geom: sphere(0.05, 6), mat: LEAF, t: [-0.05 + Math.cos(i * 1.6) * 0.07, 0.12, Math.sin(i * 1.6) * 0.07] })), { geom: cyl(0.02, 0.02, 0.6, 6), mat: WOOD, t: [0.18, 0.3, -0.05], r: [0, 0, -0.15] }, { geom: new THREE.TorusGeometry(0.035, 0.012, 4, 10), mat: GOLD, t: [0.2, 0.45, -0.05], r: [Math.PI / 2, 0, 0] }, { geom: new THREE.TorusGeometry(0.035, 0.012, 4, 10), mat: GOLD, t: [0.19, 0.35, -0.05], r: [Math.PI / 2, 0, 0] }];
    default: // a laurel wreath on a cushion
      return [{ geom: box(0.4, 0.06, 0.4), mat: RED, t: [0, 0.03, 0] }, { geom: new THREE.TorusGeometry(0.15, 0.04, 6, 16), mat: LEAF, t: [0, 0.1, 0], r: [Math.PI / 2, 0, 0] }, { geom: box(0.06, 0.02, 0.14), mat: RED, t: [0.14, 0.08, 0.1] }];
  }
}

// ── Government Center ────────────────────────────────────────────────────────────────────────────────────
/** Nobility, Writing, Architecture, Logistics, Aristocracy, Ballistics, Alchemy, Engineering. */
function gov(v: number): NodeSpec[] {
  switch (v) {
    case 0: // a diadem on a cushion
      return [{ geom: box(0.4, 0.08, 0.4), mat: RED, t: [0, 0.04, 0] }, { geom: cyl(0.14, 0.15, 0.08, 16), mat: GOLD, t: [0, 0.13, 0] }, ...[0, 1, 2, 3, 4, 5].map((i): NodeSpec => ({ geom: cone(0.025, 0.08, 4), mat: GOLD, t: [Math.cos(i * 1.05) * 0.14, 0.2, Math.sin(i * 1.05) * 0.14] })), { geom: sphere(0.03, 6), mat: RED, t: [0.1, 0.14, 0.1] }];
    case 1: // an open scroll and a stylus
      return [facing([{ geom: box(0.44, 0.3, 0.01), mat: PARCHMENT, t: [0, 0.15, 0] }, { geom: cyl(0.03, 0.03, 0.34, 8), mat: PARCHMENT, t: [-0.23, 0.15, 0.01] }, { geom: cyl(0.03, 0.03, 0.34, 8), mat: PARCHMENT, t: [0.23, 0.15, 0.01] }, ...[0, 1, 2, 3, 4].map((i): NodeSpec => ({ geom: box(0.3 - (i % 2) * 0.08, 0.012, 0.005), mat: INK, t: [-0.02, 0.26 - i * 0.05, 0.008] }))], [0, 0.02, 0], 1.0), { geom: cyl(0.01, 0.006, 0.3, 5), mat: BRONZE, t: [0.1, 0.05, 0.18], r: [Math.PI / 2 - 0.2, 0.6, 0] }];
    case 2: // a column and a set square
      return [{ geom: box(0.2, 0.05, 0.2), mat: MARBLE, t: [-0.08, 0.025, 0] }, { geom: cyl(0.06, 0.07, 0.42, 12), mat: MARBLE, t: [-0.08, 0.26, 0] }, { geom: box(0.18, 0.05, 0.18), mat: MARBLE, t: [-0.08, 0.49, 0] }, facing([{ geom: box(0.3, 0.035, 0.01), mat: BRONZE, t: [0.1, 0, 0] }, { geom: box(0.035, 0.3, 0.01), mat: BRONZE, t: [-0.035, 0.13, 0] }], [0.16, 0.05, 0.15], 0.2)];
    case 3: // a laden cart
      return [{ t: [0, 0, 0], r: [0, 0.2, 0], children: [{ geom: box(0.46, 0.06, 0.28), mat: WOOD, t: [0, 0.16, 0] }, ...[-0.15, 0.15].map((z): NodeSpec => ({ geom: cyl(0.12, 0.12, 0.03, 12), mat: DARKWOOD, t: [0, 0.12, z], r: [Math.PI / 2, 0, 0] })), { geom: sphere(0.1, 8), mat: CLOTH, t: [-0.08, 0.27, 0], s: [1, 0.9, 1.2] }, { geom: sphere(0.09, 8), mat: CLOTH, t: [0.1, 0.26, 0.02], s: [1, 0.9, 1.1] }, { geom: box(0.3, 0.025, 0.025), mat: WOOD, t: [0.36, 0.16, 0] }] }];
    case 4: // a gold laurel on a column drum
      return [{ geom: cyl(0.16, 0.16, 0.16, 14), mat: MARBLE, t: [0, 0.08, 0] }, { geom: new THREE.TorusGeometry(0.14, 0.035, 6, 16), mat: GOLD, t: [0, 0.2, 0], r: [Math.PI / 2, 0, 0] }, ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): NodeSpec => ({ geom: sphere(0.03, 5), mat: GOLD, t: [Math.cos(i * 0.785) * 0.16, 0.22, Math.sin(i * 0.785) * 0.16], s: [1.6, 0.6, 0.8] }))];
    case 5: // an arrow in a target's bull
      return [facing([disc(0.26, 0.05, { tex: 'thatch', color: 0xd8b870, rough: 1, repeat: 3 }), disc(0.16, 0.052, RED), disc(0.07, 0.054, { tex: 'thatch', color: 0xd8b870, rough: 1, repeat: 3 })], [0, 0.3, 0], 0.2), { geom: cyl(0.008, 0.008, 0.42, 5), mat: WOOD, t: [0.14, 0.34, 0.14], r: [0.5, 0.78, 1.2] }];
    case 6: // a flask over a flame
      return [{ geom: cyl(0.16, 0.18, 0.05, 10), mat: STONE, t: [0, 0.025, 0] }, flame([0, 0.04, 0], 0.7), { geom: sphere(0.13, 12), mat: GLASS, t: [0, 0.3, 0] }, { geom: cyl(0.03, 0.04, 0.16, 8), mat: GLASS, t: [0, 0.48, 0] }, { geom: sphere(0.09, 10), mat: { tex: 'plain', color: 0x58c048, rough: 0.3 }, t: [0, 0.27, 0], s: [1, 0.7, 1] }];
    default: // a pulley block on a crane arm, rope and load
      return [{ geom: box(0.06, 0.5, 0.06), mat: WOOD, t: [-0.15, 0.25, 0] }, { geom: box(0.5, 0.05, 0.05), mat: WOOD, t: [0.05, 0.5, 0], r: [0, 0, 0.1] }, { geom: cyl(0.07, 0.07, 0.04, 12), mat: BRONZE, t: [0.27, 0.5, 0], r: [Math.PI / 2, 0, 0] }, { geom: box(0.006, 0.28, 0.006), mat: CLOTH, t: [0.33, 0.35, 0] }, { geom: box(0.14, 0.12, 0.12), mat: STONE, t: [0.33, 0.16, 0] }];
  }
}

const I = (id: string, variants: number, fn: (v: number) => NodeSpec[]): ModelDef => ({ id, kind: 'icon', footprint: 1, facings: 1, variants, build: icon(fn) });

export const ICON_MODELS: ModelDef[] = [
  I('iconForge', 3, forge),
  I('iconArmor', 9, armor),
  I('iconShield', 3, shield),
  I('iconAxe', 3, axe),
  I('iconGold', 2, gold),
  I('iconStone', 2, stone),
  I('iconFarm', 3, farm),
  I('iconWheel', 1, wheel),
  I('iconFaith', 9, faith),
  I('iconGov', 8, gov),
];
