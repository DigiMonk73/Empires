import * as THREE from 'three';
import { box, cone, cyl, gable, sphere, type MatSpec, type NodeSpec, type Vec3 } from '../../dsl/model.ts';
import { banner, pediment, post } from '../buildings.ts';
import { up, type Age, type HallSpec, type Kit, type Mat } from './kit.ts';

/**
 * Roman architecture — Romans, Carthaginians, Macedonians, Palmyrans. Stone Age: oval wattle-and-daub huts under
 * steep hipped thatch with crossed ridge poles (the huts of the Palatine). Tool: stuccoed walls on stone footings
 * under wide terracotta gables (Etruscan). Bronze: red brick with arched windows, pedimented gable ends and
 * arcades. Iron: marble facing with pilasters, concrete domes on the great halls, gilded acroteria. Its landmark
 * is a boundary stone, then an honorary column, then a gilded eagle; the temple stands on a high podium with a
 * frontal portico, and the Wonder is an amphitheatre.
 */
const THATCH: MatSpec = { tex: 'thatch', color: 0xb49a5c, rough: 1, repeat: 3 };
const DAUB: MatSpec = { tex: 'plaster', color: 0xb89a70, rough: 0.95, repeat: 1.3 };
const STUCCO: MatSpec = { tex: 'plaster', color: 0xe4c894, rough: 0.9, repeat: 1.2 };
const BRICK: MatSpec = { tex: 'mudbrick', color: 0xc0704a, rough: 0.9, repeat: 3 };
const MARBLE: MatSpec = { tex: 'plaster', color: 0xf2eee4, rough: 0.6, repeat: 2 };
const TRAVERTINE: MatSpec = { tex: 'stoneBlocks', color: 0xe8dcc0, rough: 0.85, repeat: 2 };
const TUFA: MatSpec = { tex: 'stoneBlocks', color: 0xb8a684, rough: 0.9, repeat: 1.6 };
const TERRACOTTA: MatSpec = { tex: 'mudbrick', color: 0xb2583a, rough: 0.8, repeat: 2.6 };
const SEATS: MatSpec = { tex: 'stoneBlocks', color: 0xd8cfbc, rough: 0.9, repeat: 5 };
const BRONZE_TILE: MatSpec = { tex: 'metal', color: 0x98a88c, rough: 0.55, metal: 0.2, repeat: 3 }; // weathered bronze tiles
const GOLD: MatSpec = { tex: 'metal', color: 0xe0b848, rough: 0.4, metal: 0.7, repeat: 2 };
const TIMBER: MatSpec = { tex: 'planks', color: 0x6a4a30, rough: 0.8, repeat: 2 };
const SAND: MatSpec = { tex: 'plain', color: 0xd8c49a, rough: 1 };
const CYPRESS: MatSpec = { tex: 'foliage', color: 0x2e5a2a, rough: 1, repeat: 2 };
const DARK: MatSpec = { tex: 'plain', color: 0x2e2218, rough: 1 };

const wallMat = (a: Age): Mat => (a === 0 ? DAUB : a === 1 ? STUCCO : a === 2 ? BRICK : MARBLE);
const lift = (a: Age): number => (a >= 2 ? 0.08 : 0);

/** A round arch standing in the XY plane (turn it for Z), span `s`, as a half torus. */
function arch(s: number, tube: number, mat: Mat, t: Vec3, alongZ = false): NodeSpec {
  return { geom: new THREE.TorusGeometry(s / 2, tube, 6, 12, Math.PI), mat, t, r: [0, alongZ ? Math.PI / 2 : 0, 0] };
}

/** An arched window or door: a dark opening with a round head on the +X (alongZ) or +Z face. */
function opening(at: number, c: number, y: number, wdt: number, hgt: number, alongZ: boolean, trim: Mat | null): NodeSpec[] {
  const out: NodeSpec[] = [
    { geom: alongZ ? box(0.03, hgt, wdt) : box(wdt, hgt, 0.03), mat: DARK, t: alongZ ? [at, y + hgt / 2, c] : [c, y + hgt / 2, at] },
    { geom: cyl(wdt / 2, wdt / 2, 0.03, 10), mat: DARK, t: alongZ ? [at, y + hgt, c] : [c, y + hgt, at], r: alongZ ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] },
  ];
  if (trim) out.push(arch(wdt + 0.02, 0.012, trim, alongZ ? [at + 0.012, y + hgt, c] : [c, y + hgt, at + 0.012], alongZ));
  return out;
}

function hall(o: HallSpec): NodeSpec {
  const { w, d, h, a } = o;
  const kids: NodeSpec[] = [];
  if (a === 0) {
    // Palatine hut: oval daub walls, a steep hipped thatch, crossed poles at the ridge ends, a porch post pair.
    kids.push({ geom: cyl(0.5, 0.52, h * 0.8, 16), mat: DAUB, t: [0, h * 0.4, 0], s: [w, 1, d] });
    kids.push({ geom: cone(0.5, h * 1.2, 16), mat: THATCH, t: [0, h * 0.8 + h * 0.6 - 0.02, 0], s: [w * 1.15, 1, d * 1.15] });
    for (const x of [-w * 0.18, w * 0.18]) for (const sgn of [-1, 1]) kids.push({ geom: box(0.02, 0.22, 0.02), mat: TIMBER, t: [x, h * 0.8 + h * 1.2 - 0.06, sgn * 0.03], r: [sgn * 0.5, 0, 0] });
    if (o.band !== false) kids.push({ geom: cyl(0.5, 0.5, 0.05, 16), mat: 'team', t: [0, h * 0.55, 0], s: [w * 1.03, 1, d * 1.03] });
    kids.push({ geom: box(0.04, h * 0.6, 0.18), mat: DARK, t: [w / 2 + 0.005, h * 0.3, 0] }, post(w / 2 + 0.12, -0.12, h * 0.8), post(w / 2 + 0.12, 0.12, h * 0.8));
    return { t: o.t ?? [0, 0, 0], children: kids };
  }
  const wall = wallMat(a);
  if (a >= 1) kids.push({ geom: box(w + 0.04, 0.1, d + 0.04), mat: a === 1 ? TUFA : TRAVERTINE, t: [0, 0.05, 0] });
  kids.push({ geom: box(w, h, d), mat: wall, t: [0, h / 2, 0] });
  if (a === 2) kids.push({ geom: box(w + 0.02, 0.06, d + 0.02), mat: STUCCO, t: [0, h - 0.03, 0] });
  if (a === 3) {
    const nx = Math.max(2, Math.round(w / 0.3));
    const nz = Math.max(2, Math.round(d / 0.3));
    for (let i = 0; i <= nx; i++) kids.push({ geom: box(0.05, h, 0.025), mat: TRAVERTINE, t: [-w / 2 + (i * w) / nx, h / 2, d / 2 + 0.01] });
    for (let i = 0; i <= nz; i++) kids.push({ geom: box(0.025, h, 0.05), mat: TRAVERTINE, t: [w / 2 + 0.01, h / 2, -d / 2 + (i * d) / nz] });
    kids.push({ geom: box(w + 0.05, 0.07, d + 0.05), mat: TRAVERTINE, t: [0, h - 0.035, 0] });
  }
  if (o.band !== false) kids.push({ geom: box(w + 0.03, 0.045, d + 0.03), mat: 'team', t: [0, h - 0.1, 0] });
  // Roof: a wide terracotta gable along the long side; a pediment on the +X end from Bronze; a dome on the great
  // halls of the Iron Age.
  const alongX = w >= d;
  const rw = alongX ? w : d;
  const rd = alongX ? d : w;
  const rh = rd * (a === 1 ? 0.36 : 0.3);
  const roof: NodeSpec = { t: [0, h, 0], r: [0, alongX ? 0 : Math.PI / 2, 0], children: [{ geom: gable(rw + 0.16, rd + 0.24, rh), mat: TERRACOTTA }, { geom: box(rw + 0.18, 0.04, 0.06), mat: TERRACOTTA, t: [0, rh, 0] }] };
  if (a >= 2) roof.children!.push({ t: [rw / 2 + 0.06, 0, 0], children: [pediment(rd + 0.1, rh, 0.05, a === 3 ? MARBLE : STUCCO)] }, { t: [-rw / 2 - 0.06, 0, 0], children: [pediment(rd + 0.1, rh, 0.05, a === 3 ? MARBLE : STUCCO)] });
  if (a === 3) roof.children!.push({ geom: cone(0.04, 0.1, 5), mat: GOLD, t: [rw / 2 + 0.06, rh + 0.05, 0] }, { geom: cone(0.04, 0.1, 5), mat: GOLD, t: [-rw / 2 - 0.06, rh + 0.05, 0] });
  if (a === 1) {
    const n = Math.max(2, Math.round(w / 0.24));
    for (let i = 0; i < n; i++) kids.push({ geom: box(0.03, 0.03, 0.08), mat: TIMBER, t: [-w / 2 + ((i + 0.5) * w) / n, h - 0.03, d / 2 + 0.03] });
  }
  if (a === 3 && !o.low && w * d >= 1.5) {
    // A concrete dome on a drum instead of the gable.
    const r = Math.min(w, d) * 0.36;
    kids.push({ geom: cyl(r + 0.03, r + 0.05, 0.14, 20), mat: TRAVERTINE, t: [0, h + 0.07, 0] }, { geom: box(w + 0.02, 0.04, d + 0.02), mat: TERRACOTTA, t: [0, h + 0.02, 0] });
    kids.push({ geom: new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat: BRONZE_TILE, t: [0, h + 0.14, 0], s: [1, 0.8, 1] });
    kids.push({ geom: cyl(0.05, 0.05, 0.04, 10), mat: GOLD, t: [0, h + 0.14 + r * 0.8, 0] });
  } else kids.push(roof);
  const dh = Math.min(0.3, h * 0.6);
  const trim = a >= 2 ? (a === 3 ? TRAVERTINE : STUCCO) : null;
  for (const f of o.doors ?? ['x']) kids.push(...(f === 'x' ? opening(w / 2 + 0.006, 0, 0.05, 0.18, dh - 0.09, true, trim) : opening(d / 2 + 0.006, 0, 0.05, 0.18, dh - 0.09, false, trim)));
  for (let i = 0; i < (o.windows ?? 0); i++) {
    const x = -w / 2 + ((i + 0.5) * w) / o.windows!;
    kids.push(...(a >= 2 ? opening(d / 2 + 0.006, x, h * 0.5, 0.08, 0.1, false, trim) : [{ geom: box(0.08, 0.08, 0.03), mat: DARK, t: [x, h * 0.62, d / 2 + 0.006] } as NodeSpec]));
  }
  return { t: o.t ?? [0, 0, 0], children: kids };
}

function tower(w: number, h: number, a: Age, t: Vec3): NodeSpec {
  if (a === 0) return { t, children: [post(-0.15, -0.15, h), post(0.15, -0.15, h), post(-0.15, 0.15, h), post(0.15, 0.15, h), { geom: box(0.42, 0.05, 0.42), mat: TIMBER, t: [0, h, 0] }, { geom: cone(0.34, 0.3, 8), mat: THATCH, t: [0, h + 0.2, 0] }] };
  const kids: NodeSpec[] = [{ geom: box(w, h, w), mat: a === 1 ? TUFA : a === 2 ? BRICK : TRAVERTINE, t: [0, h / 2, 0] }, { geom: box(w + 0.04, 0.05, w + 0.04), mat: 'team', t: [0, h - 0.12, 0] }];
  kids.push({ t: [0, h, 0], children: [{ geom: gable(w + 0.1, w + 0.14, w * 0.32), mat: TERRACOTTA }] });
  kids.push(...opening(w / 2 + 0.006, 0, h * 0.62, 0.07, 0.1, true, a >= 2 ? STUCCO : null), ...opening(w / 2 + 0.006, 0, h * 0.62, 0.07, 0.1, false, a >= 2 ? STUCCO : null));
  return { t, children: kids };
}

/** Wooden posts (Tool), then an arcade: piers carrying round arches under an entablature. */
function columns(x0: number, x1: number, z: number, h: number, n: number, a: Age): NodeSpec[] {
  const out: NodeSpec[] = [];
  const xs = Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * i) / Math.max(1, n - 1));
  if (a <= 1) {
    for (const x of xs) out.push(post(x, z, h));
    out.push({ geom: box(x1 - x0 + 0.16, 0.06, 0.1), mat: TIMBER, t: [(x0 + x1) / 2, h, z] });
    return out;
  }
  const stone = a === 3 ? MARBLE : BRICK;
  const span = (x1 - x0) / Math.max(1, n - 1);
  const spring = h - span / 2 - 0.05;
  for (const x of xs) out.push({ geom: box(0.08, spring, 0.1), mat: stone, t: [x, spring / 2, z] }, { geom: box(0.1, 0.03, 0.12), mat: TRAVERTINE, t: [x, spring, z] });
  for (let i = 0; i < n - 1; i++) out.push(arch(span - 0.04, 0.035, stone, [xs[i]! + span / 2, spring, z]));
  out.push({ geom: box(x1 - x0 + 0.14, 0.08, 0.14), mat: a === 3 ? TRAVERTINE : STUCCO, t: [(x0 + x1) / 2, h - 0.01, z] });
  return out;
}

/** Open pavilion: timber posts under thatch or tiles (Stone, Tool); an arcaded loggia under tiles (Bronze on). */
function shed(w: number, d: number, h: number, a: Age, t: Vec3): NodeSpec {
  const kids: NodeSpec[] = [];
  const alongX = w >= d;
  if (a <= 1) {
    const nx = Math.max(2, Math.round(w / 0.45) + 1);
    const nz = Math.max(2, Math.round(d / 0.45) + 1);
    const at = (i: number, n: number, len: number) => -len / 2 + 0.05 + (i * (len - 0.1)) / (n - 1);
    for (let i = 0; i < nx; i++) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) kids.push(post(at(i, nx, w), z, h));
    for (let j = 1; j < nz - 1; j++) for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) kids.push(post(x, at(j, nz, d), h));
  } else {
    // Arcades on the two visible faces, piers at the hidden corners.
    kids.push(...columns(-w / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.05, h, Math.max(2, Math.round(w / 0.42) + 1), a));
    kids.push(...columns(-d / 2 + 0.05, d / 2 - 0.05, 0, h, Math.max(2, Math.round(d / 0.42) + 1), a).map((n): NodeSpec => ({ t: [w / 2 - 0.05, 0, 0], r: [0, -Math.PI / 2, 0], children: [n] })));
    kids.push({ geom: box(0.08, h, 0.1), mat: a === 3 ? MARBLE : BRICK, t: [-w / 2 + 0.05, h / 2, -d / 2 + 0.05] });
  }
  kids.push({ geom: box(w + 0.04, 0.04, d + 0.04), mat: 'team', t: [0, h + 0.02, 0] });
  const rw = alongX ? w : d;
  const rd = alongX ? d : w;
  kids.push({ t: [0, h + 0.04, 0], r: [0, alongX ? 0 : Math.PI / 2, 0], children: [{ geom: gable(rw + 0.14, rd + 0.2, rd * 0.3), mat: a === 0 ? THATCH : TERRACOTTA }] });
  kids.push({ geom: box(w, 0.02, d), mat: a >= 2 ? TRAVERTINE : TUFA, t: [0, 0.01, 0] });
  return { t, children: kids };
}

function fence(x: number, z: number, len: number, alongX: boolean, a: Age, h = 0.16): NodeSpec {
  const g = (hh: number, th: number) => (alongX ? box(len, hh, th) : box(th, hh, len));
  if (a === 0) return { geom: g(h * 1.1, 0.05), mat: THATCH, t: [x, h * 0.55, z] };
  if (a === 1) return { t: [x, 0, z], children: [{ geom: g(h, 0.09), mat: TUFA, t: [0, h / 2, 0] }] };
  return { t: [x, 0, z], children: [{ geom: g(h, 0.08), mat: a === 3 ? TRAVERTINE : BRICK, t: [0, h / 2, 0] }, { geom: g(0.03, 0.11), mat: a === 3 ? MARBLE : TERRACOTTA, t: [0, h + 0.015, 0] }] };
}

function podium(w: number, d: number, a: Age, t: Vec3 = [0, 0, 0]): NodeSpec | null {
  if (a < 2) return null;
  return { t, children: [{ geom: box(w, 0.08, d), mat: TRAVERTINE, t: [0, 0.04, 0] }, { geom: box(w - 0.1, 0.01, d - 0.1), mat: a === 3 ? MARBLE : { tex: 'stoneBlocks', color: 0xd8ccb0, rough: 0.9, repeat: 3 }, t: [0, 0.085, 0] }] };
}

/** A boundary stone (Stone/Tool), an honorary column with a statue (Bronze), a column with a gilded eagle (Iron). */
function landmark(t: Vec3, a: Age, s = 1): NodeSpec {
  if (a <= 1) return { t, s, children: [{ geom: box(0.12, 0.3, 0.12), mat: TUFA, t: [0, 0.15, 0] }, { geom: sphere(0.06, 8), mat: TUFA, t: [0, 0.32, 0] }] };
  const kids: NodeSpec[] = [
    { geom: box(0.24, 0.2, 0.24), mat: TRAVERTINE, t: [0, 0.1, 0] },
    { geom: cyl(0.06, 0.07, 0.8, 12), mat: MARBLE, t: [0, 0.6, 0] },
    { geom: box(0.16, 0.05, 0.16), mat: MARBLE, t: [0, 1.02, 0] },
  ];
  if (a === 2) kids.push({ geom: cyl(0.03, 0.035, 0.14, 6), mat: 'bronze', t: [0, 1.12, 0] }, { geom: sphere(0.03, 6), mat: 'bronze', t: [0, 1.22, 0] }, { geom: box(0.12, 0.02, 0.02), mat: 'bronze', t: [0.04, 1.14, 0], r: [0, 0, 0.5] });
  else kids.push({ geom: sphere(0.05, 8), mat: GOLD, t: [0, 1.1, 0], s: [1.2, 0.9, 0.8] }, { geom: box(0.04, 0.12, 0.2), mat: GOLD, t: [-0.02, 1.16, 0], r: [0.25, 0, 0] }, { geom: sphere(0.025, 6), mat: GOLD, t: [0.05, 1.16, 0] });
  return { t, s, children: kids };
}

/** Grain store: a wattle bin under thatch (Stone), a tufa silo under tiles (Tool, Bronze), a domed one (Iron). */
function store(x: number, z: number, r: number, h: number, a: Age): NodeSpec {
  const wall = a === 0 ? DAUB : a === 1 ? TUFA : a === 2 ? BRICK : TRAVERTINE;
  const kids: NodeSpec[] = [{ geom: cyl(r, r * 1.04, h * 0.65, 14), mat: wall, t: [0, h * 0.325, 0] }, { geom: box(0.05, 0.12, 0.1), mat: DARK, t: [r * 0.98, 0.1, 0] }];
  if (a >= 1) kids.push({ geom: cyl(r * 1.02, r * 1.02, 0.05, 14), mat: 'team', t: [0, h * 0.5, 0] });
  if (a === 3) kids.push({ geom: new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat: BRONZE_TILE, t: [0, h * 0.65, 0], s: [1, 0.8, 1] });
  else kids.push({ geom: cone(r * 1.2, h * 0.45, 14), mat: a === 0 ? THATCH : TERRACOTTA, t: [0, h * 0.65 + h * 0.225, 0] });
  return { t: [x, 0, z], children: kids };
}

/** A cypress: a tall dark flame of a tree. */
function cypress(x: number, z: number, hgt: number): NodeSpec {
  return { t: [x, 0, z], children: [{ geom: cyl(0.02, 0.03, 0.12, 5), mat: 'bark', t: [0, 0.06, 0] }, { geom: sphere(0.1, 8), mat: CYPRESS, t: [0, hgt * 0.5, 0], s: [1, (hgt * 0.45) / 0.1, 1] }] };
}

/** Temple: a cella on a high podium, stairs and a deep portico of columns toward +X under a pediment. */
function shrine(a: Age): NodeSpec[] {
  const base = 0.34;
  const H = 0.7;
  const stone = a === 3 ? MARBLE : TRAVERTINE;
  const cols: NodeSpec[] = [];
  for (const z of [-0.5, -0.17, 0.17, 0.5]) for (const x of [0.35, 0.7]) cols.push({ geom: cyl(0.045, 0.052, H, 10), mat: stone, t: [x, base + H / 2, z] }, { geom: box(0.11, 0.04, 0.11), mat: stone, t: [x, base + H + 0.02, z] });
  return [
    { geom: box(2.7, 0.06, 2.7), mat: TRAVERTINE, t: [0, 0.03, 0] },
    { geom: box(2.1, base, 1.3), mat: a === 3 ? MARBLE : TUFA, t: [-0.15, base / 2, -0.1] },
    ...[0, 1, 2, 3].map((i): NodeSpec => ({ geom: box(0.1, base - i * 0.085, 1.1), mat: stone, t: [0.95 + (3 - i) * 0.1, (base - i * 0.085) / 2, -0.1] })),
    { geom: box(1.15, H, 1.15), mat: a === 3 ? MARBLE : STUCCO, t: [-0.55, base + H / 2, -0.1] },
    { geom: box(1.2, 0.05, 1.2), mat: 'team', t: [-0.55, base + H - 0.1, -0.1] },
    ...cols.map((n) => ({ ...n, t: [n.t![0], n.t![1], n.t![2] - 0.1] as Vec3 })),
    { geom: box(0.25, 0.4, 0.3), mat: DARK, t: [0.03, base + 0.2, -0.1] },
    { geom: box(1.95, 0.1, 1.25), mat: stone, t: [-0.2, base + H + 0.09, -0.1] },
    { t: [-0.2, base + H + 0.14, -0.1], children: [{ geom: gable(2.0, 1.35, 0.34), mat: a === 3 ? BRONZE_TILE : TERRACOTTA }, { t: [1.0, 0, 0], children: [pediment(1.3, 0.34, 0.05, stone)] }, ...(a === 3 ? [{ geom: cone(0.05, 0.14, 5), mat: GOLD, t: [1.02, 0.4, 0] } as NodeSpec] : [])] },
    { geom: box(0.3, 0.25, 0.3), mat: stone, t: [1.2, 0.18, 0.95] }, // altar
    cypress(-1.2, 1.1, 0.9),
    cypress(-0.8, 1.2, 0.8),
    banner(1.3, -1.25, 0.9),
  ];
}

/** The Wonder: an amphitheatre — an oval of arcades in three tiers round a sanded arena and raked seats. */
function wonder(): NodeSpec[] {
  const R = 2.05; // along X
  const k = 0.8; // Z / X
  const H = 1.25;
  const out: NodeSpec[] = [{ geom: box(4.9, 0.08, 4.9), mat: TRAVERTINE, t: [0, 0.04, 0] }];
  // The wall as three lathed faces (outer, top, inner — each faces out of the solid), the seating rake (facing up
  // and in), the arena floor.
  const face = (a: [number, number], b: [number, number]) => new THREE.LatheGeometry([new THREE.Vector2(a[0], a[1]), new THREE.Vector2(b[0], b[1])], 48);
  out.push(
    { geom: face([R, 0], [R, H]), mat: TRAVERTINE, t: [0, 0.08, 0], s: [1, 1, k] },
    { geom: face([R, H], [R * 0.97, H]), mat: TRAVERTINE, t: [0, 0.08, 0], s: [1, 1, k] },
    { geom: face([R * 0.97, H], [R * 0.97, H * 0.92]), mat: TRAVERTINE, t: [0, 0.08, 0], s: [1, 1, k] },
  );
  const rake = new THREE.LatheGeometry([new THREE.Vector2(R * 0.97, H * 0.92), new THREE.Vector2(R * 0.45, 0.12)], 48);
  out.push({ geom: rake, mat: SEATS, t: [0, 0.08, 0], s: [1, 1, k] }); // stone courses run round the bowl as seat rows
  out.push({ geom: cyl(R * 0.46, R * 0.46, 0.04, 36), mat: SAND, t: [0, 0.1, 0], s: [1, 1, k] });
  out.push({ geom: new THREE.CylinderGeometry(R * 1.006, R * 1.006, 0.06, 48, 1, true), mat: 'team', t: [0, 0.08 + H - 0.08, 0], s: [1, 1, k] });
  // Three tiers of arches round the outside, each a dark opening under a pale arch ring, pilasters between.
  const n = 28;
  for (let tier = 0; tier < 3; tier++) {
    const y = 0.14 + tier * (H * 0.3);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const cx = Math.cos(ang) * R * 1.01;
      const cz = Math.sin(ang) * R * k * 1.01;
      const face = Math.atan2(Math.cos(ang) * k, Math.sin(ang)); // outward normal of the ellipse, as a Y turn
      out.push({ t: [cx, y, cz], r: [0, face, 0], children: [{ geom: box(0.2, 0.2, 0.02), mat: DARK, t: [0, 0.1, 0] }, { geom: cyl(0.1, 0.1, 0.02, 8), mat: DARK, t: [0, 0.2, 0], r: [Math.PI / 2, 0, 0] }, { geom: new THREE.TorusGeometry(0.11, 0.015, 4, 8, Math.PI), mat: TRAVERTINE, t: [0, 0.2, 0.01] }] });
    }
  }
  out.push(cypress(2.2, 2.2, 1.0), cypress(-2.3, 2.1, 0.9), cypress(2.1, -2.3, 0.9), landmark([2.25, 0.08, 1.2], 3, 1.1), banner(2.35, 2.35, 1.3));
  return out;
}

export const ROMAN: Kit = {
  set: 'roman',
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
    { tex: 'cloth', color: 0xa8302a, rough: 1, repeat: 6 },
    { tex: 'cloth', color: 0xe8d8a8, rough: 1, repeat: 6 },
  ],
};

void up;
