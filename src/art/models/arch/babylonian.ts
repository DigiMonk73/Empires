import * as THREE from 'three';
import { box, cone, cyl, sphere, type MatSpec, type NodeSpec, type Vec3 } from '../../dsl/model.ts';
import { banner, post } from '../buildings.ts';
import { frustum, up, type Age, type HallSpec, type Kit, type Mat } from './kit.ts';

/**
 * Babylonian (Mesopotamian) architecture — Babylonians, Hittites, Persians. Stone Age: barrel-vaulted reed houses
 * (mudhif). Tool: buttressed mudbrick blocks under stepped crenellations. Bronze: baked brick with a blue glazed
 * frieze of rosettes, arched doors, Persian bull-capital columns. Iron: dark fired brick, stone pilasters, blue glazed
 * friezes with ochre lions striding along them and gilded merlons. Its landmark is a stela, then a lion on a plinth; the temple is a
 * small ziggurat and the Wonder a great one with hanging gardens.
 */
const REED: MatSpec = { tex: 'thatch', color: 0xc4b078, rough: 1, repeat: 4 };
const REED_DARK: MatSpec = { tex: 'thatch', color: 0x8a7a4a, rough: 1, repeat: 4 };
const MUDBRICK: MatSpec = { tex: 'mudbrick', color: 0xbe9466, rough: 0.95, repeat: 2 };
const BRICK: MatSpec = { tex: 'mudbrick', color: 0xb67a4e, rough: 0.9, repeat: 2.4 };
const GLAZE: MatSpec = { tex: 'mudbrick', color: 0x2c5cb0, rough: 0.45, repeat: 2.4 };
const GLAZE_DEEP: MatSpec = { tex: 'mudbrick', color: 0x22488c, rough: 0.45, repeat: 2.4 };
/** Iron walls: dark fired brick. Whole walls of blue glaze read as the Blue player's colour on any owner (M15.6) —
 * the glaze stays in friezes, bands and merlons, as on the Ishtar Gate's brick. */
const IRON_BRICK: MatSpec = { tex: 'mudbrick', color: 0xa0603c, rough: 0.85, repeat: 2.4 };
const STONE: MatSpec = { tex: 'plaster', color: 0xdcd4c4, rough: 0.7, repeat: 2 };
const STEPS: MatSpec = { tex: 'stoneBlocks', color: 0xd8c8a8, rough: 0.9, repeat: 6 };
const BRICK_TOP: MatSpec = { tex: 'mudbrick', color: 0xc89468, rough: 0.95, repeat: 3 };
const BASALT: MatSpec = { tex: 'rock', color: 0x44444c, rough: 0.6, repeat: 2 };
const CEDAR: MatSpec = { tex: 'planks', color: 0x8a5a38, rough: 0.8, repeat: 2 };
const YELLOW: MatSpec = { tex: 'plain', color: 0xe8c048, rough: 0.6 };
const WHITE: MatSpec = { tex: 'plain', color: 0xf2eedc, rough: 0.6 };
const GOLD: MatSpec = { tex: 'metal', color: 0xe0b848, rough: 0.4, metal: 0.7, repeat: 2 };
const LEAVES: MatSpec = { tex: 'foliage', color: 0x4e8a34, rough: 1, repeat: 2 };
const PALM: MatSpec = { tex: 'bark', color: 0x7a5c3a, rough: 1, repeat: 3 };
const DARK: MatSpec = { tex: 'plain', color: 0x2e2218, rough: 1 };

const wallMat = (a: Age): Mat => (a <= 1 ? MUDBRICK : a === 2 ? BRICK : IRON_BRICK);
const lift = (a: Age): number => (a >= 2 ? 0.1 : 0);

/** A half-cylinder barrel along X (the reed house's vault), radius r, length len, scaled to height h. */
function barrel(r: number, len: number, h: number, mat: Mat, t: Vec3): NodeSpec {
  return { geom: new THREE.CylinderGeometry(r, r, len, 16, 1, false, 0, Math.PI), mat, t, r: [0, 0, Math.PI / 2], s: [h / r, 1, 1] };
}

/** Stepped merlons along the edges of a w×d roof at height y. */
function merlons(w: number, d: number, y: number, mat: Mat, size = 0.07): NodeSpec[] {
  const out: NodeSpec[] = [];
  const step = size * 1.7;
  const edge = (len: number, place: (c: number) => [number, number]) => {
    const n = Math.max(2, Math.floor(len / step));
    for (let i = 0; i < n; i++) {
      const [x, z] = place(-len / 2 + ((i + 0.5) * len) / n);
      out.push({ geom: box(size, size * 0.6, size), mat, t: [x, y + size * 0.3, z] }, { geom: box(size * 0.55, size * 0.5, size * 0.55), mat, t: [x, y + size * 0.85, z] });
    }
  };
  edge(w, (c) => [c, d / 2 - size / 2]);
  edge(w, (c) => [c, -d / 2 + size / 2]);
  edge(d - 2 * size, (c) => [w / 2 - size / 2, c]);
  edge(d - 2 * size, (c) => [-w / 2 + size / 2, c]);
  return out;
}

/** Shallow buttresses (pilasters) along the +X and +Z faces. */
function pilasters(w: number, d: number, h: number, mat: Mat): NodeSpec[] {
  const out: NodeSpec[] = [];
  const nx = Math.max(2, Math.round(w / 0.28));
  const nz = Math.max(2, Math.round(d / 0.28));
  for (let i = 0; i <= nx; i++) out.push({ geom: box(0.06, h, 0.03), mat, t: [-w / 2 + (i * w) / nx, h / 2, d / 2 + 0.012] });
  for (let i = 0; i <= nz; i++) out.push({ geom: box(0.03, h, 0.06), mat, t: [w / 2 + 0.012, h / 2, -d / 2 + (i * d) / nz] });
  return out;
}

/** A frieze band on the +X and +Z faces: glazed blue with rosettes (Bronze) or striding lions (Iron). */
function frieze(w: number, d: number, y: number, a: Age): NodeSpec[] {
  const out: NodeSpec[] = [
    { geom: box(w + 0.02, 0.1, 0.02), mat: GLAZE_DEEP, t: [0, y, d / 2 + 0.03] },
    { geom: box(0.02, 0.1, d + 0.02), mat: GLAZE_DEEP, t: [w / 2 + 0.03, y, 0] },
  ];
  const motif = (x: number, z: number, alongZ: boolean): NodeSpec =>
    a === 3
      ? { t: [x, y, z], r: [0, alongZ ? -Math.PI / 2 : 0, 0], children: [{ geom: box(0.09, 0.035, 0.01), mat: YELLOW, t: [0, 0, 0] }, { geom: box(0.03, 0.035, 0.01), mat: YELLOW, t: [0.055, 0.02, 0] }, { geom: box(0.012, 0.03, 0.01), mat: YELLOW, t: [-0.035, -0.03, 0] }, { geom: box(0.012, 0.03, 0.01), mat: YELLOW, t: [0.035, -0.03, 0] }] }
      : { geom: cyl(0.025, 0.025, 0.01, 8), mat: WHITE, t: [x, y, z], r: alongZ ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] };
  const nx = Math.max(2, Math.round(w / (a === 3 ? 0.2 : 0.14)));
  const nz = Math.max(2, Math.round(d / (a === 3 ? 0.2 : 0.14)));
  for (let i = 0; i < nx; i++) out.push(motif(-w / 2 + ((i + 0.5) * w) / nx, d / 2 + 0.042, false));
  for (let i = 0; i < nz; i++) out.push(motif(w / 2 + 0.042, -d / 2 + ((i + 0.5) * d) / nz, true));
  return out;
}

/** An arched doorway on the +X (alongZ) or +Z face. */
function archDoor(at: number, dh: number, alongZ: boolean, trim: Mat): NodeSpec[] {
  const t = (c: number, y: number): Vec3 => (alongZ ? [at, y, c] : [c, y, at]);
  const rot: Vec3 = alongZ ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
  return [
    { geom: alongZ ? box(0.04, dh, 0.2) : box(0.2, dh, 0.04), mat: DARK, t: t(0, dh / 2) },
    { geom: cyl(0.1, 0.1, 0.04, 12), mat: DARK, t: t(0, dh), r: rot },
    { geom: cyl(0.13, 0.13, 0.03, 12), mat: trim, t: alongZ ? [at - 0.008, dh, 0] : [0, dh, at - 0.008], r: rot },
  ];
}

function hall(o: HallSpec): NodeSpec {
  const { w, d, h, a } = o;
  const kids: NodeSpec[] = [];
  if (a === 0) {
    // Mudhif: a reed barrel vault with reed-bundle arches and a latticed end toward +X.
    const r = d / 2;
    const vh = h * 1.35;
    kids.push(barrel(r, w, vh, REED, [0, 0, 0]));
    const ribs = Math.max(3, Math.round(w / 0.22));
    for (let i = 0; i <= ribs; i++) kids.push(barrel(r + 0.015, 0.035, vh + 0.015, REED_DARK, [-w / 2 + (i * w) / ribs, 0, 0]));
    if (o.band !== false) kids.push(barrel(r + 0.02, 0.06, vh + 0.02, 'team', [w * 0.25, 0, 0]));
    kids.push({ geom: box(0.04, Math.min(0.3, vh * 0.7), 0.18), mat: DARK, t: [w / 2 + 0.005, Math.min(0.15, vh * 0.35), 0] });
    for (const z of [-0.14, 0.14]) kids.push({ geom: cyl(0.03, 0.035, vh * 0.8, 6), mat: REED_DARK, t: [w / 2 + 0.02, vh * 0.4, z] });
    return { t: o.t ?? [0, 0, 0], children: kids };
  }
  const wall = wallMat(a);
  kids.push({ geom: box(w, h, d), mat: wall, t: [0, h / 2, 0] });
  kids.push(...pilasters(w, d, h, a === 3 ? STONE : wall));
  kids.push({ geom: box(w + 0.03, 0.04, d + 0.03), mat: a === 1 ? MUDBRICK : a === 2 ? BRICK : GLAZE_DEEP, t: [0, h + 0.02, 0] });
  if (o.band !== false) kids.push({ geom: box(w + 0.05, 0.045, d + 0.05), mat: 'team', t: [0, h - 0.07, 0] });
  if (a >= 2) kids.push(...frieze(w, d, h * 0.62, a));
  kids.push(...merlons(w + 0.03, d + 0.03, h + 0.04, a === 3 ? GOLD : a === 2 ? BRICK : MUDBRICK, o.low ? 0.055 : 0.07));
  kids.push({ geom: box(w - 0.05, 0.02, d - 0.05), mat: a === 3 ? BRICK : MUDBRICK, t: [0, h + 0.045, 0] });
  // Roof: cedar beams showing at the top of the Tool-age walls; a roof kiosk on big halls.
  if (a === 1) {
    const n = Math.max(2, Math.round(w / 0.22));
    for (let i = 0; i < n; i++) kids.push({ geom: cyl(0.018, 0.018, 0.06, 5), mat: CEDAR, t: [-w / 2 + ((i + 0.5) * w) / n, h - 0.16, d / 2 + 0.03], r: [Math.PI / 2, 0, 0] });
  }
  if (!o.low && w * d >= 1.5) {
    const kw = w * 0.36;
    const kd = d * 0.4;
    kids.push(
      { geom: box(kw, 0.2, kd), mat: wall, t: [-w * 0.15, h + 0.1, -d * 0.12] },
      ...merlons(kw, kd, h + 0.2, a === 3 ? GOLD : a === 2 ? BRICK : MUDBRICK, 0.05).map((n) => ({ ...n, t: [n.t![0] - w * 0.15, n.t![1], n.t![2] - d * 0.12] as Vec3 })),
      { geom: box(0.07, 0.1, 0.01), mat: DARK, t: [-w * 0.15, h + 0.1, -d * 0.12 + kd / 2 + 0.005] },
    );
  }
  const dh = Math.min(0.26, h * 0.5);
  const trim = a === 3 ? YELLOW : a === 2 ? GLAZE : MUDBRICK;
  for (const f of o.doors ?? ['x']) kids.push(...(f === 'x' ? archDoor(w / 2 + 0.006, dh, true, trim) : archDoor(d / 2 + 0.006, dh, false, trim)));
  for (let i = 0; i < (o.windows ?? 0); i++) {
    const x = -w / 2 + ((i + 0.5) * w) / o.windows!;
    kids.push({ geom: box(0.05, 0.1, 0.03), mat: DARK, t: [x, h * 0.82, d / 2 + 0.006] });
  }
  return { t: o.t ?? [0, 0, 0], children: kids };
}

function tower(w: number, h: number, a: Age, t: Vec3): NodeSpec {
  if (a === 0) return { t, children: [post(-0.15, -0.15, h), post(0.15, -0.15, h), post(-0.15, 0.15, h), post(0.15, 0.15, h), { geom: box(0.42, 0.05, 0.42), mat: 'planks', t: [0, h, 0] }, barrel(0.22, 0.44, 0.2, REED, [0, h + 0.02, 0])] };
  return { t, children: [hall({ w, d: w, h, a, doors: [], band: true, low: true }), { geom: box(0.05, 0.12, 0.012), mat: DARK, t: [0, h * 0.75, w / 2 + 0.02] }, { geom: box(0.012, 0.12, 0.05), mat: DARK, t: [w / 2 + 0.02, h * 0.75, 0] }] };
}

/** A Persian column: bell base, slender fluted shaft, a capital of two addorsed bulls. */
function column(x: number, z: number, h: number, a: Age): NodeSpec[] {
  if (a <= 1) return [{ geom: cyl(0.035, 0.045, h, 7), mat: PALM, t: [x, h / 2, z] }, { geom: box(0.12, 0.04, 0.12), mat: CEDAR, t: [x, h, z] }];
  const cap = a === 3 ? GOLD : STONE;
  return [
    { geom: cyl(0.045, 0.075, 0.07, 10), mat: STONE, t: [x, 0.035, z] },
    { geom: cyl(0.032, 0.036, h - 0.14, 12), mat: STONE, t: [x, 0.07 + (h - 0.14) / 2, z] },
    { geom: box(0.2, 0.05, 0.06), mat: cap, t: [x, h - 0.05, z] },
    { geom: sphere(0.03, 6), mat: cap, t: [x - 0.1, h - 0.03, z] },
    { geom: sphere(0.03, 6), mat: cap, t: [x + 0.1, h - 0.03, z] },
    { geom: box(0.12, 0.03, 0.1), mat: STONE, t: [x, h - 0.01, z] },
  ];
}

function columns(x0: number, x1: number, z: number, h: number, n: number, a: Age): NodeSpec[] {
  const out: NodeSpec[] = [];
  for (let i = 0; i < n; i++) out.push(...column(x0 + ((x1 - x0) * i) / Math.max(1, n - 1), z, h, a));
  out.push({ geom: box(x1 - x0 + 0.2, 0.07, 0.16), mat: a <= 1 ? CEDAR : a === 3 ? GLAZE_DEEP : CEDAR, t: [(x0 + x1) / 2, h + 0.035, z] });
  if (a >= 2) out.push(...Array.from({ length: Math.max(2, Math.round((x1 - x0) / 0.14)) }, (_, i): NodeSpec => ({ geom: box(0.045, 0.045, 0.05), mat: a === 3 ? GOLD : BRICK, t: [x0 - 0.08 + i * 0.14, h + 0.09, z] })));
  return out;
}

/** Open pavilion: reed-matted poles (Stone), palm posts under cedar (Tool), a hall of bull columns (Bronze on). */
function shed(w: number, d: number, h: number, a: Age, t: Vec3): NodeSpec {
  const kids: NodeSpec[] = [];
  const nx = Math.max(2, Math.round(w / 0.45) + 1);
  const nz = Math.max(2, Math.round(d / 0.45) + 1);
  const at = (i: number, n: number, len: number) => -len / 2 + 0.06 + (i * (len - 0.12)) / (n - 1);
  const col = (x: number, z: number) => (a === 0 ? [post(x, z, h)] : column(x, z, h, a));
  for (let i = 0; i < nx; i++) for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) kids.push(...col(at(i, nx, w), z));
  for (let j = 1; j < nz - 1; j++) for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) kids.push(...col(x, at(j, nz, d)));
  if (a === 0) {
    kids.push(barrel(d / 2 + 0.04, w + 0.08, 0.22, REED, [0, h, 0]));
  } else {
    kids.push({ geom: box(w + 0.08, 0.06, d + 0.08), mat: CEDAR, t: [0, h + 0.03, 0] });
    kids.push({ geom: box(w + 0.1, 0.05, d + 0.1), mat: a >= 2 ? BRICK_TOP : MUDBRICK, t: [0, h + 0.085, 0] });
    if (a === 3) kids.push({ geom: box(w + 0.11, 0.025, d + 0.11), mat: GLAZE_DEEP, t: [0, h + 0.08, 0] });
    kids.push({ geom: box(w + 0.12, 0.035, d + 0.12), mat: 'team', t: [0, h + 0.03, 0] });
    kids.push(...merlons(w + 0.1, d + 0.1, h + 0.11, a === 3 ? GOLD : a === 2 ? BRICK : MUDBRICK, 0.05));
  }
  kids.push({ geom: box(w, 0.02, d), mat: a >= 2 ? BRICK : MUDBRICK, t: [0, 0.01, 0] });
  return { t, children: kids };
}

function fence(x: number, z: number, len: number, alongX: boolean, a: Age, h = 0.16): NodeSpec {
  const g = (hh: number, th: number) => (alongX ? box(len, hh, th) : box(th, hh, len));
  if (a === 0) return { geom: g(h * 1.1, 0.05), mat: REED, t: [x, h * 0.55, z] };
  const kids: NodeSpec[] = [{ geom: g(h, 0.09), mat: wallMat(a), t: [0, h / 2, 0] }];
  const n = Math.max(2, Math.floor(len / 0.12));
  for (let i = 0; i < n; i++) {
    const c = -len / 2 + ((i + 0.5) * len) / n;
    kids.push({ geom: box(0.06, 0.05, 0.06), mat: a === 3 ? GLAZE_DEEP : wallMat(a), t: alongX ? [c, h + 0.025, 0] : [0, h + 0.025, c] });
  }
  if (a >= 2) kids.push({ geom: g(0.03, 0.095), mat: a === 3 ? YELLOW : GLAZE, t: [0, h * 0.6, 0] });
  return { t: [x, 0, z], children: kids };
}

function podium(w: number, d: number, a: Age, t: Vec3 = [0, 0, 0]): NodeSpec | null {
  if (a < 2) return null;
  return { t, children: [{ geom: box(w, 0.1, d), mat: BRICK, t: [0, 0.05, 0] }, { geom: box(w + 0.01, 0.03, d + 0.01), mat: a === 3 ? GLAZE : GLAZE_DEEP, t: [0, 0.05, 0] }] };
}

/** A clay stela (Tool), a black basalt law-stela (Bronze), a lion on a glazed plinth (Iron). */
function landmark(t: Vec3, a: Age, s = 1): NodeSpec {
  if (a <= 2) {
    const m = a === 2 ? BASALT : MUDBRICK;
    return { t, s, children: [{ geom: box(0.22, 0.06, 0.16), mat: a === 2 ? BRICK : MUDBRICK, t: [0, 0.03, 0] }, { geom: box(0.16, 0.42, 0.08), mat: m, t: [0, 0.27, 0] }, { geom: cyl(0.08, 0.08, 0.08, 12), mat: m, t: [0, 0.48, 0], r: [Math.PI / 2, 0, 0] }, { geom: box(0.12, 0.1, 0.085), mat: a === 2 ? YELLOW : WHITE, t: [0, 0.42, 0] }] };
  }
  return {
    t,
    s,
    children: [
      { geom: box(0.4, 0.28, 0.22), mat: GLAZE, t: [0, 0.14, 0] },
      { geom: box(0.42, 0.03, 0.24), mat: YELLOW, t: [0, 0.29, 0] },
      // A striding lion (+X): body, legs, maned head, tail.
      { geom: box(0.28, 0.1, 0.1), mat: BASALT, t: [0, 0.44, 0] },
      ...[-0.1, 0.1].flatMap((x) => [-0.035, 0.035].map((z): NodeSpec => ({ geom: box(0.035, 0.12, 0.035), mat: BASALT, t: [x, 0.36, z] }))),
      { geom: sphere(0.08, 8), mat: BASALT, t: [0.15, 0.5, 0], s: [0.9, 1, 1] },
      { geom: box(0.07, 0.05, 0.05), mat: BASALT, t: [0.22, 0.49, 0] },
      { geom: cyl(0.012, 0.01, 0.16, 5), mat: BASALT, t: [-0.17, 0.46, 0], r: [0, 0, 1.0] },
    ],
  };
}

/** Grain store: a reed-bundle rick (Stone), then a brick-ribbed domed silo. */
function store(x: number, z: number, r: number, h: number, a: Age): NodeSpec {
  if (a === 0) return { t: [x, 0, z], children: [{ geom: cyl(r * 0.95, r, h * 0.55, 12), mat: REED, t: [0, h * 0.275, 0] }, { geom: cone(r * 1.05, h * 0.6, 12), mat: REED_DARK, t: [0, h * 0.55 + h * 0.3, 0] }, { geom: box(0.05, 0.12, 0.1), mat: DARK, t: [r * 0.97, 0.1, 0] }] };
  const wall = wallMat(a);
  const kids: NodeSpec[] = [
    { geom: cyl(r, r * 1.04, h * 0.62, 14), mat: wall, t: [0, h * 0.31, 0] },
    { geom: sphere(r, 14), mat: a === 3 ? BRICK_TOP : wall, t: [0, h * 0.62, 0], s: [1, (h * 0.5) / r, 1] },
    { geom: cyl(r * 1.02, r * 1.02, 0.05, 14), mat: 'team', t: [0, h * 0.5, 0] },
    { geom: box(0.05, 0.12, 0.1), mat: DARK, t: [r * 0.98, 0.1, 0] },
  ];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    kids.push({ geom: box(0.04, h * 0.62, 0.04), mat: a === 3 ? GLAZE_DEEP : wall, t: [Math.cos(ang) * r, h * 0.31, Math.sin(ang) * r] });
  }
  if (a >= 2) kids.push({ geom: cyl(r * 1.03, r * 1.03, 0.04, 14), mat: a === 3 ? YELLOW : GLAZE, t: [0, h * 0.2, 0] });
  return { t: [x, 0, z], children: kids };
}

/** A stepped brick terrace with glazed trim and a stair up its +X face. */
function terrace(w: number, h: number, y: number, a: Age, t: [number, number]): NodeSpec[] {
  return [
    { geom: frustum(w, h, w, 0.04), mat: BRICK, t: [t[0], y + h / 2, t[1]] },
    ...pilasters(w - 0.06, w - 0.06, h, BRICK).map((n) => ({ ...n, t: [n.t![0] + t[0], n.t![1] + y, n.t![2] + t[1]] as Vec3 })),
    { geom: box(w - 0.07, 0.012, w - 0.07), mat: BRICK_TOP, t: [t[0], y + h + 0.001, t[1]] },
    { geom: box(w - 0.06, 0.05, w - 0.06), mat: a === 3 ? GLAZE : GLAZE_DEEP, t: [t[0], y + h - 0.045, t[1]] },
  ];
}

/** A solid flight of stairs from (x0, y0) up to (x1, y1) at z (x1 < x0: it climbs toward −X), `thick` deep. */
function stair(x0: number, y0: number, x1: number, y1: number, z: number, width: number, thick = 0.3): NodeSpec[] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = dy / len; // upward normal of the slope
  const ny = -dx / len;
  const cx = (x0 + x1) / 2 - (nx * thick) / 2;
  const cy = (y0 + y1) / 2 - (ny * thick) / 2;
  const ang = -Math.atan2(dy, -dx);
  return [
    { geom: box(len, thick, width), mat: BRICK, t: [cx, cy, z], r: [0, 0, ang] },
    { geom: box(len, 0.012, width - 0.06), mat: STEPS, t: [(x0 + x1) / 2, (y0 + y1) / 2 + 0.004, z], r: [0, 0, ang] },
  ];
}

/** Temple: a three-step ziggurat with a glazed shrine on top and a stair toward +X. */
function shrine(a: Age): NodeSpec[] {
  const out: NodeSpec[] = [{ geom: box(2.8, 0.06, 2.8), mat: BRICK, t: [0, 0.03, 0] }];
  out.push(...terrace(2.2, 0.32, 0.06, a, [-0.15, -0.15]), ...terrace(1.55, 0.3, 0.38, a, [-0.2, -0.2]));
  out.push(hall({ w: 0.9, d: 0.9, h: 0.42, a: 3, doors: ['x'], windows: 0, t: [-0.25, 0.68, -0.25], low: true }));
  // Stair up the +X faces to the shrine door.
  out.push(...stair(1.45, 0.06, 0.55, 0.68, -0.22, 0.34));
  out.push(landmark([1.05, 0, 0.9], a, 0.8), banner(1.3, -1.2, 0.9), banner(-1.2, 1.3, 0.9));
  if (a === 3) out.push({ geom: cone(0.08, 0.2, 6), mat: GOLD, t: [-0.25, 1.28, -0.25] });
  return out;
}

/** A palm tree. */
function palm(x: number, z: number, hgt: number): NodeSpec {
  const fronds: NodeSpec[] = [];
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2;
    fronds.push({ geom: box(0.34, 0.015, 0.08), mat: LEAVES, t: [Math.cos(ang) * 0.15, hgt - 0.02, Math.sin(ang) * 0.15], r: [0, -ang, -0.45] });
  }
  return { t: [x, 0, z], children: [{ geom: cyl(0.025, 0.04, hgt, 6), mat: PALM, t: [0.03, hgt / 2, 0], r: [0, 0, -0.06] }, ...fronds] };
}

/** The Wonder: a great ziggurat of four terraces hung with gardens, a gilded shrine on top, a triple stair. */
function wonder(): NodeSpec[] {
  const out: NodeSpec[] = [{ geom: box(4.9, 0.08, 4.9), mat: BRICK, t: [0, 0.04, 0] }];
  const tiers = [4.2, 3.3, 2.4, 1.6];
  let y = 0.08;
  tiers.forEach((w, i) => {
    const h = 0.42;
    out.push(...terrace(w, h, y, 3, [-0.2, -0.2]));
    // Hanging gardens: a hedge of green along each terrace edge, trailing down its face.
    if (i < 3) {
      const e = w / 2 - 0.1;
      out.push(
        { geom: box(w - 0.3, 0.08, 0.1), mat: LEAVES, t: [-0.2, y + h + 0.04, -0.2 + e] },
        { geom: box(0.1, 0.08, w - 0.3), mat: LEAVES, t: [-0.2 + e, y + h + 0.04, -0.2] },
        { geom: box(w - 0.4, 0.14, 0.03), mat: LEAVES, t: [-0.2, y + h - 0.06, -0.2 + w / 2 - 0.02] },
      );
    }
    y += h;
  });
  out.push(hall({ w: 1.0, d: 1.0, h: 0.5, a: 3, doors: ['x', 'z'], windows: 0, t: [-0.2, y, -0.2], low: true }));
  out.push({ geom: cone(0.1, 0.26, 6), mat: GOLD, t: [-0.2, y + 0.72, -0.2] });
  // Triple stair up the +X face.
  // Triple stair: two side flights to the first terrace, the central flight to the shrine.
  out.push(...stair(2.45, 0.08, 1.9, 0.5, -0.95, 0.24), ...stair(2.45, 0.08, 1.9, 0.5, 0.55, 0.24), ...stair(2.45, 0.08, 0.6, 1.76, -0.2, 0.42, 0.4));
  out.push(palm(2.1, 2.1, 0.8), palm(-2.2, 2.1, 0.7), palm(2.1, -2.2, 0.7), landmark([2.0, 0.08, 1.2], 3, 1.1), landmark([1.2, 0.08, 2.0], 3, 1.1), banner(2.35, 2.35, 1.2));
  return out;
}

export const BABYLONIAN: Kit = {
  set: 'babylonian',
  hall,
  tower,
  columns,
  shed,
  fence,
  podium,
  lift,
  landmark,
  store,
  shrine,
  wonder,
  awnings: [
    { tex: 'cloth', color: 0x2c5cb0, rough: 1, repeat: 6 },
    { tex: 'cloth', color: 0xd8a040, rough: 1, repeat: 6 },
  ],
};

void up;
