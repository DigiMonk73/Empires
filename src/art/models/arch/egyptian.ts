import { box, cone, cyl, sphere, type MatSpec, type NodeSpec, type Vec3 } from '../../dsl/model.ts';
import { banner, post } from '../buildings.ts';
import { frustum, up, type Age, type HallSpec, type Kit, type Mat } from './kit.ts';

/**
 * Egyptian architecture (Egyptians, Assyrians, Sumerians). Stone Age: oval reed-and-mud huts under domed reed
 * mats. Tool: whitewashed mudbrick blocks with flat roofs, parapets and palm-log beam ends. Bronze: limestone
 * with battered walls, a cavetto cornice, papyrus columns, pylons and obelisks. Iron: sandstone painted with
 * blue, red and ochre friezes, gilded cornices and red-granite obelisks. The Wonder is a pyramid.
 */
const REED: MatSpec = { tex: 'thatch', color: 0xb4a468, rough: 1, repeat: 4 };
const MUD: MatSpec = { tex: 'plaster', color: 0xb89468, rough: 0.95, repeat: 1.5 };
const MUDBRICK: MatSpec = { tex: 'mudbrick', color: 0xc0986a, rough: 0.95, repeat: 1.4 };
const WHITEWASH: MatSpec = { tex: 'plaster', color: 0xede4cc, rough: 0.9, repeat: 1.2 };
const LIMESTONE: MatSpec = { tex: 'stoneBlocks', color: 0xf2dcae, rough: 0.85, repeat: 1.8 };
const SANDSTONE: MatSpec = { tex: 'stoneBlocks', color: 0xdcbc88, rough: 0.85, repeat: 1.8 };
const CASING: MatSpec = { tex: 'stoneBlocks', color: 0xf4e4c0, rough: 0.75, repeat: 3.5 };
const GRANITE: MatSpec = { tex: 'rock', color: 0xa85848, rough: 0.6, repeat: 2 };
const PALM: MatSpec = { tex: 'bark', color: 0x7a5c3a, rough: 1, repeat: 3 };
const FROND: MatSpec = { tex: 'foliage', color: 0x5e8a34, rough: 1, repeat: 2 };
const BLUE: MatSpec = { tex: 'plain', color: 0x2c5c9c, rough: 0.7 };
const RED: MatSpec = { tex: 'plain', color: 0xa8402c, rough: 0.8 };
const OCHRE: MatSpec = { tex: 'plain', color: 0xd8a040, rough: 0.8 };
const GREEN: MatSpec = { tex: 'plain', color: 0x3a8a6a, rough: 0.7 };
const GOLD: MatSpec = { tex: 'metal', color: 0xe0b848, rough: 0.4, metal: 0.7, repeat: 2 };
const DARK: MatSpec = { tex: 'plain', color: 0x3a2a1c, rough: 1 };

const wallMat = (a: Age): Mat => (a === 0 ? MUD : a === 1 ? MUDBRICK : a === 2 ? LIMESTONE : SANDSTONE);
const lift = (a: Age): number => (a >= 2 ? 0.08 : 0);

/** A frieze of painted panels along a face: +X face (alongZ) or +Z face. */
function frieze(len: number, y: number, at: number, alongZ: boolean, n: number): NodeSpec[] {
  const cols = [BLUE, RED, OCHRE, GREEN];
  const out: NodeSpec[] = [];
  for (let i = 0; i < n; i++) {
    const c = -len / 2 + ((i + 0.5) * len) / n;
    const w = (len / n) * 0.7;
    out.push({ geom: alongZ ? box(0.012, 0.09, w) : box(w, 0.09, 0.012), mat: cols[i % 4]!, t: alongZ ? [at, y, c] : [c, y, at] });
  }
  return out;
}

/** Palm fronds fanning from a trunk top. */
function palm(x: number, z: number, h: number): NodeSpec {
  const fronds: NodeSpec[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    fronds.push({ geom: box(0.34, 0.015, 0.08), mat: FROND, t: [Math.cos(a) * 0.15, h - 0.02, Math.sin(a) * 0.15], r: [0, -a, -0.45] });
  }
  return { t: [x, 0, z], children: [{ geom: cyl(0.025, 0.04, h, 6), mat: PALM, t: [0.03, h / 2, 0], r: [0, 0, -0.06] }, ...fronds] };
}

const JAR: MatSpec = { tex: 'plain', color: 0xa86a44, rough: 0.9 };

/**
 * What stands on a big flat roof: in the Tool Age a reed shade on palm posts, storage jars and the stair hatch;
 * from Bronze a raised clerestory (the hall's high middle, lit through stone grilles) under its own cornice.
 */
function roofTop(w: number, d: number, h: number, a: Age): NodeSpec[] {
  if (a === 1 || w * d < 1.5) {
    const y = h + (a === 1 ? 0.065 : 0.11);
    const x0 = -w / 2 + 0.25;
    const z0 = -d / 2 + 0.22;
    const items: NodeSpec[] = [
      post(x0 - 0.12, z0 - 0.1, 0.2), post(x0 + 0.14, z0 - 0.1, 0.2), post(x0 - 0.12, z0 + 0.12, 0.2), post(x0 + 0.14, z0 + 0.12, 0.2),
      { geom: box(0.36, 0.025, 0.32), mat: REED, t: [x0 + 0.01, 0.2, z0 + 0.01] },
      { geom: box(0.12, 0.012, 0.12), mat: DARK, t: [w / 2 - 0.2, 0.002, d / 2 - 0.18] },
      { geom: sphere(0.045, 8), mat: JAR, t: [w / 2 - 0.3, 0.04, -d / 2 + 0.15], s: [1, 1.2, 1] },
      { geom: sphere(0.04, 8), mat: JAR, t: [w / 2 - 0.2, 0.035, -d / 2 + 0.13], s: [1, 1.2, 1] },
    ];
    return items.map((n) => up(n, y));
  }
  const cw = w * 0.5;
  const cd = d * 0.46;
  const ch = 0.17;
  const y = h + 0.11;
  const stone = a === 3 ? SANDSTONE : LIMESTONE;
  const kids: NodeSpec[] = [
    { geom: frustum(cw, ch, cd, 0.015), mat: stone, t: [0, y + ch / 2, 0] },
    { geom: frustum(cw - 0.03, 0.06, cd - 0.03, -0.03), mat: stone, t: [0, y + ch + 0.03, 0] },
    { geom: box(cw + 0.03, 0.02, cd + 0.03), mat: a === 3 ? GOLD : BLUE, t: [0, y + ch + 0.065, 0] },
    { geom: box(cw - 0.04, 0.012, cd - 0.04), mat: WHITEWASH, t: [0, y + ch + 0.07, 0] },
  ];
  const n = Math.max(2, Math.round(cw / 0.18));
  for (let i = 0; i < n; i++) kids.push({ geom: box(0.08, 0.07, 0.012), mat: DARK, t: [-cw / 2 + ((i + 0.5) * cw) / n, y + ch * 0.55, cd / 2 - 0.004] });
  for (let i = 0; i < 2; i++) kids.push({ geom: box(0.012, 0.07, 0.08), mat: DARK, t: [cw / 2 - 0.004, y + ch * 0.55, -cd / 4 + (i * cd) / 2] });
  return kids;
}

function hall(o: HallSpec): NodeSpec {
  const { w, d, h, a } = o;
  const kids: NodeSpec[] = [];
  let face = 0; // inset of the face at door height (battered walls)
  if (a === 0) {
    // Oval reed-and-mud hut, a low reed-mat dome held by palm poles.
    kids.push({ geom: cyl(0.5, 0.52, h, 18), mat: MUD, t: [0, h / 2, 0], s: [w, 1, d] });
    kids.push({ geom: sphere(0.5, 14), mat: REED, t: [0, h, 0], s: [w * 1.1, o.low ? 0.32 : 0.46, d * 1.1] });
    if (o.band !== false) kids.push({ geom: cyl(0.5, 0.5, 0.06, 18), mat: 'team', t: [0, h * 0.5, 0], s: [w * 1.04, 1, d * 1.04] });
    kids.push(post(w * 0.52, d * 0.3, h + 0.12), post(-w * 0.3, d * 0.52, h + 0.1));
  } else if (a === 1) {
    // Whitewashed mudbrick block: flat roof, parapet, beam ends, a whitewashed top course.
    kids.push({ geom: box(w, h, d), mat: MUDBRICK, t: [0, h / 2, 0] });
    kids.push({ geom: box(w + 0.02, 0.12, d + 0.02), mat: WHITEWASH, t: [0, h - 0.02, 0] });
    kids.push({ geom: box(w, 0.03, d), mat: MUD, t: [0, h + 0.05, 0] });
    for (const [pw, pd, px, pz] of [[w + 0.02, 0.05, 0, d / 2], [w + 0.02, 0.05, 0, -d / 2], [0.05, d, w / 2, 0], [0.05, d, -w / 2, 0]] as const) kids.push({ geom: box(pw, 0.07, pd), mat: WHITEWASH, t: [px, h + 0.075, pz] });
    if (o.band !== false) kids.push({ geom: box(w + 0.03, 0.05, d + 0.03), mat: 'team', t: [0, h - 0.14, 0] });
    const n = Math.max(2, Math.round(w / 0.25));
    for (let i = 0; i < n; i++) kids.push({ geom: cyl(0.02, 0.02, 0.07, 5), mat: PALM, t: [-w / 2 + ((i + 0.5) * w) / n, h - 0.2, d / 2 + 0.03], r: [Math.PI / 2, 0, 0] });
  } else {
    // Limestone (Bronze) or painted sandstone (Iron): battered walls under a flaring cavetto cornice.
    const ins = o.low ? 0.03 : 0.05;
    face = ins * 0.4;
    kids.push({ geom: frustum(w, h, d, ins), mat: wallMat(a), t: [0, h / 2, 0] });
    if (o.band !== false) kids.push({ geom: box(w - 2 * ins + 0.03, 0.05, d - 2 * ins + 0.03), mat: 'team', t: [0, h - 0.04, 0] });
    kids.push({ geom: frustum(w - 2 * ins, 0.1, d - 2 * ins, -0.05), mat: a === 3 ? SANDSTONE : LIMESTONE, t: [0, h + 0.05, 0] });
    kids.push({ geom: box(w - 2 * ins + 0.11, 0.025, d - 2 * ins + 0.11), mat: a === 3 ? GOLD : BLUE, t: [0, h + 0.1, 0] });
    kids.push({ geom: box(w - 2 * ins - 0.02, 0.02, d - 2 * ins - 0.02), mat: WHITEWASH, t: [0, h + 0.11, 0] });
    if (a === 3) kids.push(...frieze(w - 0.2, h * 0.72, d / 2 - ins * 0.3 + 0.004, false, Math.max(3, Math.round(w / 0.3))), ...frieze(d - 0.2, h * 0.72, w / 2 - ins * 0.3 + 0.004, true, Math.max(2, Math.round(d / 0.3))));
  }
  if (a >= 1 && !o.low && w * d >= 0.9) kids.push(...roofTop(w, d, h, a));
  const dh = Math.min(0.34, h * 0.66);
  for (const f of o.doors ?? ['x']) {
    const lintel = a >= 2 ? LIMESTONE : PALM;
    if (f === 'x') {
      const x = a === 0 ? w / 2 : w / 2 - face;
      kids.push({ geom: box(0.04, dh, 0.2), mat: DARK, t: [x + 0.005, dh / 2, 0] }, { geom: box(0.05, 0.05, 0.28), mat: lintel, t: [x + 0.01, dh + 0.02, 0] });
    } else {
      const z = a === 0 ? d / 2 : d / 2 - face;
      kids.push({ geom: box(0.2, dh, 0.04), mat: DARK, t: [0, dh / 2, z + 0.005] }, { geom: box(0.28, 0.05, 0.05), mat: lintel, t: [0, dh + 0.02, z + 0.01] });
    }
  }
  // Small high windows (Egyptian walls are nearly blind).
  if (a >= 1) for (let i = 0; i < (o.windows ?? 0); i++) {
    const x = -w / 2 + ((i + 0.5) * w) / o.windows!;
    kids.push({ geom: box(0.07, 0.06, 0.03), mat: DARK, t: [x, h * 0.78, d / 2 - face + 0.005] });
  }
  return { t: o.t ?? [0, 0, 0], children: kids };
}

function tower(w: number, h: number, a: Age, t: Vec3): NodeSpec {
  if (a === 0) return { t, children: [post(-0.15, -0.15, h), post(0.15, -0.15, h), post(-0.15, 0.15, h), post(0.15, 0.15, h), { geom: box(0.42, 0.05, 0.42), mat: 'planks', t: [0, h, 0] }, { geom: sphere(0.28, 10), mat: REED, t: [0, h + 0.12, 0], s: [1, 0.5, 1] }] };
  // A pylon-like tower: battered, cornice, flagstaff with a team pennant.
  const kids: NodeSpec[] = [hall({ w, d: w, h, a, doors: [], band: true, low: a === 1 })];
  kids.push({ geom: cyl(0.015, 0.015, 0.5, 5), mat: PALM, t: [w / 2 - 0.02, h + 0.25, w / 2 - 0.02] }, { geom: box(0.012, 0.1, 0.18), mat: 'team', t: [w / 2 - 0.02, h + 0.42, w / 2 + 0.07] });
  if (a === 1) kids.push({ geom: box(0.1, 0.06, 0.12), mat: DARK, t: [w / 2 + 0.005, h * 0.7, 0] });
  return { t, children: kids };
}

function column(x: number, z: number, h: number, a: Age): NodeSpec[] {
  if (a <= 1) return [{ geom: cyl(0.035, 0.045, h, 7), mat: PALM, t: [x, h / 2, z] }, { geom: cone(0.09, 0.06, 7), mat: FROND, t: [x, h + 0.01, z], r: [Math.PI, 0, 0] }];
  // Papyrus-bundle column: a swelling shaft, painted bands, a bell capital and an abacus.
  const stone = a === 3 ? SANDSTONE : LIMESTONE;
  return [
    { geom: cyl(0.045, 0.058, h - 0.12, 10), mat: stone, t: [x, (h - 0.12) / 2, z] },
    { geom: cyl(0.05, 0.05, 0.03, 10), mat: a === 3 ? RED : BLUE, t: [x, h - 0.16, z] },
    { geom: cyl(0.085, 0.045, 0.1, 10), mat: a === 3 ? GREEN : stone, t: [x, h - 0.07, z] },
    { geom: box(0.1, 0.03, 0.1), mat: stone, t: [x, h - 0.01, z] },
  ];
}

function columns(x0: number, x1: number, z: number, h: number, n: number, a: Age): NodeSpec[] {
  const out: NodeSpec[] = [];
  for (let i = 0; i < n; i++) out.push(...column(x0 + ((x1 - x0) * i) / Math.max(1, n - 1), z, h, a));
  out.push({ geom: box(x1 - x0 + 0.16, 0.07, 0.14), mat: a <= 1 ? PALM : a === 3 ? SANDSTONE : LIMESTONE, t: [(x0 + x1) / 2, h + 0.035, z] });
  if (a >= 2) out.push({ geom: box(x1 - x0 + 0.18, 0.02, 0.15), mat: a === 3 ? GOLD : BLUE, t: [(x0 + x1) / 2, h + 0.08, z] });
  return out;
}

function fence(x: number, z: number, len: number, alongX: boolean, a: Age, h = 0.16): NodeSpec {
  const g = (hh: number, th: number) => (alongX ? box(len, hh, th) : box(th, hh, len));
  if (a === 0) return { geom: g(h * 1.1, 0.05), mat: REED, t: [x, h * 0.55, z] };
  if (a === 1) return { t: [x, 0, z], children: [{ geom: g(h, 0.08), mat: MUDBRICK, t: [0, h / 2, 0] }, { geom: g(0.03, 0.1), mat: WHITEWASH, t: [0, h, 0] }] };
  return { t: [x, 0, z], children: [{ geom: g(h, 0.09), mat: wallMat(a), t: [0, h / 2, 0] }, { geom: g(0.035, 0.12), mat: a === 3 ? SANDSTONE : LIMESTONE, t: [0, h + 0.015, 0] }, { geom: g(0.012, 0.125), mat: a === 3 ? GOLD : BLUE, t: [0, h + 0.035, 0] }] };
}

function podium(w: number, d: number, a: Age, t: Vec3 = [0, 0, 0]): NodeSpec | null {
  if (a < 2) return null;
  return { t, children: [{ geom: box(w, 0.08, d), mat: a === 3 ? SANDSTONE : LIMESTONE, t: [0, 0.04, 0] }, { geom: box(w + 0.01, 0.015, d + 0.01), mat: a === 3 ? RED : BLUE, t: [0, 0.045, 0] }] };
}

/** Obelisk (Bronze limestone; Iron red granite with a gilded pyramidion); a painted stela before that. */
function landmark(t: Vec3, a: Age, s = 1): NodeSpec {
  if (a <= 1) return { t, s, children: [{ geom: box(0.18, 0.05, 0.1), mat: MUDBRICK, t: [0, 0.025, 0] }, { geom: box(0.14, 0.3, 0.05), mat: WHITEWASH, t: [0, 0.2, 0] }, { geom: cyl(0.07, 0.07, 0.05, 10), mat: WHITEWASH, t: [0, 0.35, 0], r: [Math.PI / 2, 0, 0] }, { geom: box(0.1, 0.05, 0.052), mat: BLUE, t: [0, 0.28, 0] }] };
  const stone = a === 3 ? GRANITE : LIMESTONE;
  return {
    t,
    s,
    children: [
      { geom: box(0.26, 0.08, 0.26), mat: a === 3 ? SANDSTONE : LIMESTONE, t: [0, 0.04, 0] },
      { geom: frustum(0.14, 1.0, 0.14, 0.025), mat: stone, t: [0, 0.58, 0] },
      { geom: cone(0.064, 0.1, 4), mat: a === 3 ? GOLD : stone, t: [0, 1.13, 0], r: [0, Math.PI / 4, 0] },
      { geom: box(0.015, 0.5, 0.03), mat: a === 3 ? GOLD : BLUE, t: [0.061, 0.6, 0] }, // hieroglyph column
    ],
  };
}

/** Beehive grain silo of mud (whitewashed from Tool, on a stone base from Bronze), with a top hatch. */
function store(x: number, z: number, r: number, h: number, a: Age): NodeSpec {
  const wall = a === 0 ? MUD : WHITEWASH;
  const kids: NodeSpec[] = [
    { geom: cyl(r * 0.92, r, h * 0.6, 14), mat: wall, t: [0, h * 0.3, 0] },
    { geom: sphere(r * 0.93, 14), mat: wall, t: [0, h * 0.6, 0], s: [1, (h * 0.55) / r, 1] },
    { geom: cyl(r * 0.2, r * 0.22, 0.05, 8), mat: a === 0 ? REED : MUDBRICK, t: [0, h * 0.6 + h * 0.5, 0] },
    { geom: box(0.05, 0.12, 0.1), mat: DARK, t: [r * 0.95, 0.1, 0] },
  ];
  if (a >= 1) kids.push({ geom: cyl(r * 0.95, r * 0.95, 0.05, 14), mat: 'team', t: [0, h * 0.45, 0] });
  if (a >= 2) kids.push({ geom: cyl(r * 1.08, r * 1.1, 0.08, 14), mat: a === 3 ? SANDSTONE : LIMESTONE, t: [0, 0.04, 0] });
  return { t: [x, 0, z], children: kids };
}

/** A pylon tower half (thin along X, wide along Z). */
function pylon(x: number, z: number, a: Age): NodeSpec {
  const h = a === 3 ? 1.2 : 1.05;
  return {
    t: [x, 0.08, z],
    children: [
      { geom: frustum(0.42, h, 0.8, 0.07), mat: wallMat(a), t: [0, h / 2, 0] },
      { geom: box(0.3, 0.05, 0.68), mat: 'team', t: [0, h - 0.04, 0] },
      { geom: frustum(0.28, 0.1, 0.66, -0.05), mat: wallMat(a), t: [0, h + 0.05, 0] },
      { geom: box(0.39, 0.025, 0.77), mat: a === 3 ? GOLD : BLUE, t: [0, h + 0.1, 0] },
      ...(a === 3 ? frieze(0.6, h * 0.55, 0.19, true, 3) : [{ geom: box(0.012, 0.3, 0.3), mat: BLUE, t: [0.19, h * 0.55, 0] } as NodeSpec]),
      { geom: cyl(0.014, 0.014, 0.6, 5), mat: PALM, t: [0.23, h * 0.7, 0.25] },
      { geom: box(0.01, 0.09, 0.16), mat: 'team', t: [0.23, h + 0.14, 0.34] },
    ],
  };
}

/** Temple: a pylon gateway facing +X before a hypostyle sanctuary, obelisks flanking the gate. */
function shrine(a: Age): NodeSpec[] {
  const out: NodeSpec[] = [
    { geom: box(2.7, 0.08, 2.6), mat: a === 3 ? SANDSTONE : LIMESTONE, t: [0, 0.04, 0] },
    hall({ w: 1.5, d: 1.5, h: 0.75, a, doors: [], windows: 0, t: [-0.45, 0.08, -0.1] }),
    ...columns(-1.05, 0.1, 0.9, 0.62, 4, a).map((n) => up(n, 0.08)),
    pylon(0.6, -0.62, a),
    pylon(0.6, 0.62, a),
    // The gate between the towers: a lintel with a winged-sun disc.
    { geom: box(0.3, 0.72, 0.44), mat: wallMat(a), t: [0.6, 0.08 + 0.36, 0] },
    { geom: box(0.02, 0.5, 0.2), mat: DARK, t: [0.755, 0.33, 0] },
    { geom: cyl(0.05, 0.05, 0.02, 12), mat: a === 3 ? GOLD : RED, t: [0.765, 0.7, 0], r: [0, 0, Math.PI / 2] },
    { geom: box(0.015, 0.03, 0.34), mat: a === 3 ? GOLD : BLUE, t: [0.765, 0.7, 0] },
    landmark([1.15, 0, -0.45], a, 0.85),
    landmark([1.15, 0, 0.45], a, 0.85),
  ];
  if (a === 3) out.push(palm(-1.15, 1.1, 0.7), palm(1.2, 1.2, 0.6));
  return out;
}

/** The Wonder: a great pyramid with a gilded capstone, its valley temple and obelisks toward the viewer. */
function wonder(): NodeSpec[] {
  const R = 2.35; // base half-diagonal → base side 3.3
  const H = 2.4;
  return [
    { geom: box(4.9, 0.1, 4.9), mat: SANDSTONE, t: [0, 0.05, 0] },
    { geom: box(4.0, 0.08, 4.0), mat: LIMESTONE, t: [-0.3, 0.14, -0.3] },
    { geom: cone(R, H, 4), mat: CASING, t: [-0.3, 0.18 + H / 2, -0.3], r: [0, Math.PI / 4, 0] },
    { geom: cone(R * 0.14, H * 0.14, 4), mat: GOLD, t: [-0.3, 0.18 + H * 0.93 + 0.01, -0.3], r: [0, Math.PI / 4, 0] },
    { geom: box(2.9, 0.06, 0.06), mat: 'team', t: [-0.3, 0.3, 1.3], r: [0, 0, 0] },
    { geom: box(0.06, 0.06, 2.9), mat: 'team', t: [1.3, 0.3, -0.3] },
    // Valley temple on the front corner, flanked by obelisks, with a causeway to the pyramid.
    hall({ w: 0.9, d: 0.9, h: 0.5, a: 3, doors: ['x', 'z'], windows: 0, t: [1.75, 0.1, 1.75] }),
    { geom: box(0.3, 0.04, 1.2), mat: LIMESTONE, t: [1.75, 0.12, 0.8] },
    landmark([2.3, 0.1, 1.0], 3, 1.1),
    landmark([1.0, 0.1, 2.3], 3, 1.1),
    sphinx([0.1, 0.1, 2.05]),
    palm(-2.1, 2.1, 0.8),
    palm(2.1, -2.1, 0.8),
    banner(2.3, 2.3, 1.2),
  ];
}

/** A couchant sphinx facing +Z: lion body, forepaws, a pharaoh's head in a striped headcloth. */
function sphinx(t: Vec3): NodeSpec {
  return {
    t,
    children: [
      { geom: box(0.34, 0.1, 0.62), mat: LIMESTONE, t: [0, 0.05, 0] },
      { geom: box(0.26, 0.18, 0.46), mat: SANDSTONE, t: [0, 0.18, -0.06] },
      { geom: box(0.07, 0.06, 0.2), mat: SANDSTONE, t: [-0.08, 0.13, 0.23] },
      { geom: box(0.07, 0.06, 0.2), mat: SANDSTONE, t: [0.08, 0.13, 0.23] },
      { geom: frustum(0.2, 0.16, 0.14, 0.03), mat: BLUE, t: [0, 0.34, 0.12] }, // headcloth
      { geom: box(0.21, 0.02, 0.15), mat: OCHRE, t: [0, 0.3, 0.12] },
      { geom: box(0.12, 0.13, 0.08), mat: SANDSTONE, t: [0, 0.34, 0.17] }, // face
      { geom: cyl(0.05, 0.02, 0.2, 6), mat: SANDSTONE, t: [0, 0.14, -0.33], r: [1.2, 0, 0] }, // tail
    ],
  };
}

export const EGYPTIAN: Kit = {
  set: 'egyptian',
  hall,
  tower,
  columns,
  fence,
  podium,
  lift,
  landmark,
  store,
  shrine,
  wonder,
  awnings: [
    { tex: 'cloth', color: 0x3c6aa8, rough: 1, repeat: 6 },
    { tex: 'cloth', color: 0xe0c070, rough: 1, repeat: 6 },
  ],
};
