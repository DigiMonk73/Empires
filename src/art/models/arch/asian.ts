import * as THREE from 'three';
import { box, cone, cyl, gable, pyramid, sphere, type MatSpec, type NodeSpec, type Vec3 } from '../../dsl/model.ts';
import { banner, post } from '../buildings.ts';
import { up, type Age, type HallSpec, type Kit, type Mat } from './kit.ts';

/**
 * East Asian architecture — Choson, Shang, Yamato. Stone Age: pit dwellings whose thatch reaches the ground.
 * Tool: timber halls on raised floors under steep thatched gables with crossed finials and ridge logs, granaries
 * on stilts. Bronze: red-lacquered columns on stone bases, white walls, grey-tiled roofs curving up at the
 * eaves. Iron: double eaves, painted brackets, gilded ridge ornaments. Its landmark is a bird pole, then a stone
 * lantern, then a bronze ritual cauldron; the temple is a hall with a double roof and a gateway, the Wonder a
 * five-storey pagoda.
 */
const THATCH: MatSpec = { tex: 'thatch', color: 0xa89060, rough: 1, repeat: 3 };
const THATCH_DARK: MatSpec = { tex: 'thatch', color: 0x7a6a44, rough: 1, repeat: 3 };
const TIMBER: MatSpec = { tex: 'planks', color: 0x5a4030, rough: 0.8, repeat: 2 };
const PLASTER: MatSpec = { tex: 'plaster', color: 0xf0ece0, rough: 0.9, repeat: 1.2 };
const WATTLE: MatSpec = { tex: 'plaster', color: 0xc8b494, rough: 0.95, repeat: 1.2 };
const LACQUER: MatSpec = { tex: 'plain', color: 0xa8302a, rough: 0.5 };
const TILE: MatSpec = { tex: 'mudbrick', color: 0x5c6470, rough: 0.7, repeat: 3.5 };
const TILE_DARK: MatSpec = { tex: 'plain', color: 0x3e444e, rough: 0.7 };
const STONE: MatSpec = { tex: 'stoneBlocks', color: 0xb8b4aa, rough: 0.9, repeat: 1.6 };
const GREEN: MatSpec = { tex: 'plain', color: 0x3a8a6a, rough: 0.6 };
const BLUE: MatSpec = { tex: 'plain', color: 0x3a6aa0, rough: 0.6 };
const GOLD: MatSpec = { tex: 'metal', color: 0xe0b848, rough: 0.4, metal: 0.7, repeat: 2 };
const BRONZE: MatSpec = { tex: 'metal', color: 0x5a7a5a, rough: 0.5, metal: 0.6, repeat: 2 }; // patinated
const PINE: MatSpec = { tex: 'foliage', color: 0x2e5e2a, rough: 1, repeat: 2 };
const DARK: MatSpec = { tex: 'plain', color: 0x2a2018, rough: 1 };

const lift = (a: Age): number => (a >= 2 ? 0.08 : a === 1 ? 0.06 : 0);

/**
 * A curved hip roof over w×d: concave slopes (steep at the ridge, flattening to the eaves) and corners that
 * sweep up. `ridge` is the height, `sweep` the corner lift; the roof overhangs its walls by `over`.
 */
function curvedRoof(w: number, d: number, ridge: number, sweep: number, mat: Mat, over = 0.14): NodeSpec[] {
  const W = w + 2 * over;
  const D = d + 2 * over;
  const g = new THREE.PlaneGeometry(W, D, 28, 28);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position!;
  const hw = W / 2;
  const hd = D / 2;
  const half = Math.min(hw, hd);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const t = Math.min(1, Math.max((Math.abs(x) - (hw - half)) / half, (Math.abs(z) - (hd - half)) / half, 0));
    const corner = Math.pow((Math.abs(x) / hw) * (Math.abs(z) / hd), 2.5);
    p.setY(i, ridge * Math.pow(1 - t, 2.0) + sweep * 1.6 * corner);
  }
  g.computeVertexNormals();
  const ridgeLen = Math.max(0.05, W - D);
  const out: NodeSpec[] = [
    { geom: g, mat },
    // Ridge beam with raised end ornaments, and a dark eave line.
    { geom: box(ridgeLen + 0.06, 0.05, 0.06), mat: TILE_DARK, t: [0, ridge + 0.02, 0] },
    { geom: box(0.06, 0.1, 0.06), mat: TILE_DARK, t: [ridgeLen / 2 + 0.02, ridge + 0.06, 0], r: [0, 0, -0.3] },
    { geom: box(0.06, 0.1, 0.06), mat: TILE_DARK, t: [-ridgeLen / 2 - 0.02, ridge + 0.06, 0], r: [0, 0, 0.3] },
  ];
  return out;
}

/** A steep thatched gable along X with crossed finials (chigi) at the ends and logs across the ridge. */
function thatchGable(w: number, d: number, h: number, finials: boolean): NodeSpec[] {
  const out: NodeSpec[] = [{ geom: gable(w + 0.2, d + 0.24, h), mat: THATCH }, { geom: box(w + 0.24, 0.05, 0.07), mat: TIMBER, t: [0, h + 0.01, 0] }];
  if (finials) {
    for (const x of [-(w / 2 + 0.1), w / 2 + 0.1]) for (const s of [-1, 1]) out.push({ geom: box(0.025, 0.24, 0.04), mat: TIMBER, t: [x, h + 0.06, s * 0.035], r: [s * 0.55, 0, 0] });
    const n = Math.max(2, Math.round(w / 0.3));
    for (let i = 0; i < n; i++) out.push({ geom: cyl(0.025, 0.025, 0.14, 6), mat: TIMBER, t: [-w / 2 + ((i + 0.5) * w) / n, h + 0.05, 0], r: [Math.PI / 2, 0, 0] });
  }
  return out;
}

/** Red columns at the corners and along the visible faces, on round stone bases. */
function frame(w: number, d: number, h: number, a: Age): NodeSpec[] {
  const out: NodeSpec[] = [];
  const colMat = a >= 2 ? LACQUER : TIMBER;
  const put = (x: number, z: number) => {
    out.push({ geom: cyl(0.03, 0.034, h, 8), mat: colMat, t: [x, h / 2, z] });
    if (a >= 2) out.push({ geom: cyl(0.05, 0.055, 0.04, 8), mat: STONE, t: [x, 0.02, z] });
  };
  const nx = Math.max(2, Math.round(w / 0.32) + 1);
  const nz = Math.max(2, Math.round(d / 0.32) + 1);
  for (let i = 0; i < nx; i++) put(-w / 2 + (i * w) / (nx - 1), d / 2 + 0.01);
  for (let j = 0; j < nz - 1; j++) put(w / 2 + 0.01, -d / 2 + (j * d) / (nz - 1));
  put(-w / 2, -d / 2);
  // Tie beam under the eaves; painted brackets from Iron.
  out.push({ geom: box(w + 0.04, 0.05, d + 0.04), mat: a === 3 ? GREEN : colMat, t: [0, h - 0.025, 0] });
  if (a === 3) out.push({ geom: box(w + 0.06, 0.02, d + 0.06), mat: BLUE, t: [0, h - 0.06, 0] });
  return out;
}

function hall(o: HallSpec): NodeSpec {
  const { w, d, h, a } = o;
  const kids: NodeSpec[] = [];
  if (a === 0) {
    // Pit dwelling: a low earth rim and a thatched hip roof reaching almost to the ground, a smoke gable on top.
    kids.push({ geom: box(w * 0.9, 0.08, d * 0.9), mat: WATTLE, t: [0, 0.04, 0] });
    kids.push({ geom: pyramid(w + 0.1, d + 0.1, h * 1.6), mat: THATCH, t: [0, 0.03, 0] });
    kids.push({ geom: gable(Math.max(0.12, (w - d) * 0.8 + 0.12), 0.18, 0.1), mat: THATCH_DARK, t: [0, 0.03 + h * 1.6 * 0.82, 0] });
    // The entrance porch, capped with a team-coloured mat.
    kids.push({ geom: box(0.14, 0.16, 0.18), mat: THATCH_DARK, t: [w * 0.42, 0.08, 0] }, { geom: box(0.02, 0.12, 0.12), mat: DARK, t: [w * 0.42 + 0.075, 0.07, 0] });
    if (o.band !== false) kids.push({ geom: box(0.16, 0.03, 0.22), mat: 'team', t: [w * 0.42, 0.175, 0], r: [0, 0, -0.15] });
    return { t: o.t ?? [0, 0, 0], children: kids };
  }
  const y0 = lift(a);
  // Raised floor on stilts (Tool) or a stone base (Bronze on).
  if (a === 1) {
    kids.push({ geom: box(w + 0.06, 0.03, d + 0.06), mat: TIMBER, t: [0, y0, 0] });
    for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as const) kids.push(post(x, z, y0));
  } else kids.push({ geom: box(w + 0.1, y0, d + 0.1), mat: STONE, t: [0, y0 / 2, 0] });
  const inner = { t: [0, y0, 0] as Vec3, children: [] as NodeSpec[] };
  const c = inner.children;
  c.push({ geom: box(w, h, d), mat: a === 1 ? WATTLE : PLASTER, t: [0, h / 2, 0] });
  c.push(...frame(w, d, h, a));
  if (o.band !== false) c.push({ geom: box(w + 0.05, 0.04, d + 0.05), mat: 'team', t: [0, h * 0.72, 0] });
  if (a === 1) c.push(...thatchGable(w, d, Math.min(w, d) * 0.62, !o.low).map((n) => up(n, h)));
  else {
    const ridge = Math.min(w, d) * (o.low ? 0.32 : 0.4);
    if (a === 3 && !o.low) {
      // Double eaves: a lower skirt roof, a short upper wall, the main roof above.
      c.push(...curvedRoof(w, d, ridge * 0.35, 0.05, TILE, 0.16).map((n) => up(n, h)));
      c.push({ geom: box(w * 0.66, 0.2, d * 0.66), mat: PLASTER, t: [0, h + 0.1 + ridge * 0.2, 0] });
      c.push({ geom: box(w * 0.66 + 0.03, 0.04, d * 0.66 + 0.03), mat: GREEN, t: [0, h + 0.2 + ridge * 0.2, 0] });
      c.push(...curvedRoof(w * 0.66, d * 0.66, ridge * 0.8, 0.07, TILE, 0.14).map((n) => up(n, h + 0.22 + ridge * 0.2)));
      c.push({ geom: sphere(0.04, 8), mat: GOLD, t: [0, h + 0.26 + ridge, 0] });
    } else c.push(...curvedRoof(w, d, ridge, a === 3 ? 0.07 : 0.05, TILE).map((n) => up(n, h)));
  }
  const dh = Math.min(0.3, h * 0.62);
  for (const f of o.doors ?? ['x']) {
    if (f === 'x') c.push({ geom: box(0.03, dh, 0.22), mat: a >= 2 ? LACQUER : DARK, t: [w / 2 + 0.005, dh / 2, 0] }, { geom: box(0.035, dh - 0.04, 0.02), mat: DARK, t: [w / 2 + 0.012, dh / 2, 0] });
    else c.push({ geom: box(0.22, dh, 0.03), mat: a >= 2 ? LACQUER : DARK, t: [0, dh / 2, d / 2 + 0.005] }, { geom: box(0.02, dh - 0.04, 0.035), mat: DARK, t: [0, dh / 2, d / 2 + 0.012] });
  }
  // Lattice windows.
  for (let i = 0; i < (o.windows ?? 0); i++) {
    const x = -w / 2 + ((i + 0.5) * w) / o.windows!;
    c.push({ geom: box(0.12, 0.1, 0.02), mat: DARK, t: [x, h * 0.5, d / 2 + 0.006] }, { geom: box(0.13, 0.012, 0.025), mat: a >= 2 ? LACQUER : TIMBER, t: [x, h * 0.5, d / 2 + 0.01] }, { geom: box(0.012, 0.11, 0.025), mat: a >= 2 ? LACQUER : TIMBER, t: [x, h * 0.5, d / 2 + 0.01] });
  }
  kids.push(inner);
  return { t: o.t ?? [0, 0, 0], children: kids };
}

function tower(w: number, h: number, a: Age, t: Vec3): NodeSpec {
  if (a <= 1) return { t, children: [post(-0.15, -0.15, h), post(0.15, -0.15, h), post(-0.15, 0.15, h), post(0.15, 0.15, h), { geom: box(0.42, 0.05, 0.42), mat: TIMBER, t: [0, h, 0] }, { geom: pyramid(0.56, 0.56, 0.28), mat: THATCH, t: [0, h + 0.2, 0] }, post(0, 0, h + 0.2)] };
  return { t, children: [{ geom: box(w, h * 0.55, w), mat: STONE, t: [0, h * 0.275, 0] }, hall({ w: w * 0.8, d: w * 0.8, h: h * 0.3, a, doors: [], band: true, low: true, t: [0, h * 0.55 - lift(a), 0] })] };
}

function columns(x0: number, x1: number, z: number, h: number, n: number, a: Age): NodeSpec[] {
  const out: NodeSpec[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
    out.push({ geom: cyl(0.03, 0.034, h, 8), mat: a >= 2 ? LACQUER : TIMBER, t: [x, h / 2, z] });
    if (a >= 2) out.push({ geom: cyl(0.05, 0.055, 0.04, 8), mat: STONE, t: [x, 0.02, z] });
  }
  out.push({ geom: box(x1 - x0 + 0.12, 0.06, 0.1), mat: a === 3 ? GREEN : a >= 2 ? LACQUER : TIMBER, t: [(x0 + x1) / 2, h - 0.03, z] });
  if (a >= 2) out.push(...curvedRoof(x1 - x0 + 0.1, 0.2, 0.08, 0.03, TILE, 0.08).map((nd) => up({ t: [(x0 + x1) / 2, 0, z], children: [nd] }, h)));
  return out;
}

/** Open pavilion: posts under thatch (Stone, Tool), red columns under a curved tiled roof (Bronze on). */
function shed(w: number, d: number, h: number, a: Age, t: Vec3): NodeSpec {
  const kids: NodeSpec[] = [];
  const nx = Math.max(2, Math.round(w / 0.45) + 1);
  const nz = Math.max(2, Math.round(d / 0.45) + 1);
  const at = (i: number, n: number, len: number) => -len / 2 + 0.05 + (i * (len - 0.1)) / (n - 1);
  const col = (x: number, z: number): NodeSpec[] => (a >= 2 ? [{ geom: cyl(0.03, 0.034, h, 8), mat: LACQUER, t: [x, h / 2, z] }, { geom: cyl(0.05, 0.055, 0.04, 8), mat: STONE, t: [x, 0.02, z] }] : [post(x, z, h)]);
  for (let i = 0; i < nx; i++) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) kids.push(...col(at(i, nx, w), z));
  for (let j = 1; j < nz - 1; j++) for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) kids.push(...col(x, at(j, nz, d)));
  kids.push({ geom: box(w + 0.02, 0.05, d + 0.02), mat: a === 3 ? GREEN : a >= 2 ? LACQUER : TIMBER, t: [0, h - 0.025, 0] });
  kids.push({ geom: box(w + 0.04, 0.035, d + 0.04), mat: 'team', t: [0, h - 0.07, 0] });
  if (a <= 1) kids.push(...thatchGable(w, d, Math.min(w, d) * 0.5, false).map((n) => up(n, h)));
  else kids.push(...curvedRoof(w, d, Math.min(w, d) * 0.3, 0.05, TILE).map((n) => up(n, h)));
  kids.push({ geom: box(w, 0.02, d), mat: a >= 2 ? STONE : WATTLE, t: [0, 0.01, 0] });
  return { t, children: kids };
}

function fence(x: number, z: number, len: number, alongX: boolean, a: Age, h = 0.16): NodeSpec {
  const g = (hh: number, th: number) => (alongX ? box(len, hh, th) : box(th, hh, len));
  if (a === 0) return { geom: g(h * 1.1, 0.05), mat: THATCH_DARK, t: [x, h * 0.55, z] };
  if (a === 1) {
    const kids: NodeSpec[] = [{ geom: g(h * 0.9, 0.03), mat: TIMBER, t: [0, h * 0.45, 0] }];
    const n = Math.max(2, Math.round(len / 0.3));
    for (let i = 0; i <= n; i++) {
      const c = -len / 2 + (i * len) / n;
      kids.push(alongX ? post(c, 0, h * 1.1) : post(0, c, h * 1.1));
    }
    return { t: [x, 0, z], children: kids };
  }
  // White plaster wall under a small tiled coping.
  return { t: [x, 0, z], children: [{ geom: g(0.04, 0.1), mat: STONE, t: [0, 0.02, 0] }, { geom: g(h, 0.07), mat: PLASTER, t: [0, h / 2 + 0.02, 0] }, { geom: g(0.04, 0.14), mat: TILE, t: [0, h + 0.04, 0] }, { geom: g(0.025, 0.05), mat: TILE_DARK, t: [0, h + 0.07, 0] }, ...(a === 3 ? [{ geom: g(0.02, 0.075), mat: LACQUER, t: [0, h * 0.7, 0] } as NodeSpec] : [])] };
}

function podium(w: number, d: number, a: Age, t: Vec3 = [0, 0, 0]): NodeSpec | null {
  if (a < 2) return null;
  return { t, children: [{ geom: box(w, 0.08, d), mat: STONE, t: [0, 0.04, 0] }, { geom: box(w - 0.08, 0.012, d - 0.08), mat: { tex: 'stoneBlocks', color: 0xccc6ba, rough: 0.9, repeat: 2.5 }, t: [0, 0.085, 0] }] };
}

/** A bird pole (Stone/Tool), a stone lantern (Bronze), a bronze ritual cauldron on a plinth (Iron). */
function landmark(t: Vec3, a: Age, s = 1): NodeSpec {
  if (a <= 1) return { t, s, children: [{ geom: cyl(0.02, 0.028, 0.9, 6), mat: TIMBER, t: [0, 0.45, 0] }, { geom: box(0.12, 0.03, 0.03), mat: TIMBER, t: [0, 0.88, 0] }, { geom: sphere(0.035, 6), mat: TIMBER, t: [0.02, 0.93, 0], s: [1.6, 0.8, 0.8] }, { geom: cone(0.015, 0.05, 4), mat: TIMBER, t: [0.08, 0.93, 0], r: [0, 0, -Math.PI / 2] }] };
  if (a === 2) {
    return { t, s, children: [
      { geom: cyl(0.1, 0.12, 0.06, 6), mat: STONE, t: [0, 0.03, 0] },
      { geom: cyl(0.035, 0.045, 0.3, 8), mat: STONE, t: [0, 0.21, 0] },
      { geom: cyl(0.1, 0.08, 0.04, 6), mat: STONE, t: [0, 0.38, 0] },
      { geom: box(0.12, 0.1, 0.12), mat: STONE, t: [0, 0.45, 0] },
      { geom: box(0.07, 0.06, 0.13), mat: { tex: 'plain', color: 0xffd070, rough: 1 }, t: [0, 0.45, 0] },
      { geom: cone(0.14, 0.12, 6), mat: STONE, t: [0, 0.56, 0] },
      { geom: sphere(0.025, 6), mat: STONE, t: [0, 0.63, 0] },
    ] };
  }
  return { t, s, children: [
    { geom: box(0.34, 0.12, 0.34), mat: STONE, t: [0, 0.06, 0] },
    ...[0, 1, 2].map((i): NodeSpec => ({ geom: cyl(0.018, 0.012, 0.14, 5), mat: BRONZE, t: [Math.cos((i * 2 * Math.PI) / 3) * 0.08, 0.19, Math.sin((i * 2 * Math.PI) / 3) * 0.08] })),
    { geom: cyl(0.13, 0.1, 0.16, 12), mat: BRONZE, t: [0, 0.32, 0] },
    { geom: cyl(0.14, 0.13, 0.025, 12), mat: GOLD, t: [0, 0.41, 0] },
    { geom: box(0.03, 0.08, 0.1), mat: BRONZE, t: [0.1, 0.46, 0] },
    { geom: box(0.03, 0.08, 0.1), mat: BRONZE, t: [-0.1, 0.46, 0] },
  ] };
}

/** Granary: a thatched store (Stone), then a storehouse raised on stilts with rat-guard discs. */
function store(x: number, z: number, r: number, h: number, a: Age): NodeSpec {
  if (a === 0) return { t: [x, 0, z], children: [{ geom: cyl(r * 0.9, r, h * 0.35, 10), mat: WATTLE, t: [0, h * 0.175, 0] }, { geom: cone(r * 1.2, h * 0.75, 10), mat: THATCH, t: [0, h * 0.35 + h * 0.37, 0] }] };
  const s = r * 1.6;
  const legs = h * 0.35;
  const kids: NodeSpec[] = [];
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    kids.push(post(px * s * 0.4, pz * s * 0.4, legs), { geom: cyl(0.06, 0.06, 0.015, 10), mat: TIMBER, t: [px * s * 0.4, legs * 0.75, pz * s * 0.4] });
  }
  kids.push({ geom: box(s, h * 0.4, s * 0.8), mat: a === 1 ? TIMBER : PLASTER, t: [0, legs + h * 0.2, 0] });
  kids.push({ geom: box(s + 0.02, 0.04, s * 0.8 + 0.02), mat: 'team', t: [0, legs + h * 0.36, 0] });
  if (a === 1) kids.push(...thatchGable(s, s * 0.8, s * 0.5, true).map((n) => up(n, legs + h * 0.4)));
  else kids.push(...curvedRoof(s, s * 0.8, s * 0.3, 0.04, TILE, 0.1).map((n) => up(n, legs + h * 0.4)));
  kids.push({ geom: box(0.04, legs + 0.05, 0.1), mat: TIMBER, t: [s * 0.55, legs / 2, 0], r: [0, 0, -0.35] }); // ladder
  return { t: [x, 0, z], children: kids };
}

/** A pine: a trunk and tiers of dark needles. */
function pine(x: number, z: number, hgt: number): NodeSpec {
  return { t: [x, 0, z], children: [{ geom: cyl(0.025, 0.035, hgt * 0.6, 6), mat: 'bark', t: [0, hgt * 0.3, 0] }, { geom: sphere(0.2, 8), mat: PINE, t: [0.05, hgt * 0.62, 0], s: [1.2, 0.45, 1] }, { geom: sphere(0.15, 8), mat: PINE, t: [-0.04, hgt * 0.82, 0.03], s: [1.2, 0.45, 1] }, { geom: sphere(0.1, 8), mat: PINE, t: [0.02, hgt * 0.98, 0], s: [1.2, 0.45, 1] }] };
}

/** A gateway: two red posts, tie beams and a small tiled roof. */
function gateway(t: Vec3, span: number, h: number, a: Age): NodeSpec {
  return {
    t,
    children: [
      { geom: cyl(0.03, 0.035, h, 8), mat: a >= 2 ? LACQUER : TIMBER, t: [0, h / 2, -span / 2] },
      { geom: cyl(0.03, 0.035, h, 8), mat: a >= 2 ? LACQUER : TIMBER, t: [0, h / 2, span / 2] },
      { geom: box(0.05, 0.05, span + 0.2), mat: a >= 2 ? LACQUER : TIMBER, t: [0, h * 0.8, 0] },
      { geom: box(0.06, 0.06, span + 0.1), mat: a === 3 ? GREEN : a >= 2 ? LACQUER : TIMBER, t: [0, h, 0] },
      { t: [0, h + 0.03, 0], r: [0, Math.PI / 2, 0], children: curvedRoof(span + 0.1, 0.16, 0.08, 0.04, TILE, 0.08) },
    ],
  };
}

/** Temple: a hall with double eaves on a high stone terrace, a gateway and lanterns before it. */
function shrine(a: Age): NodeSpec[] {
  return [
    { geom: box(2.6, 0.08, 2.6), mat: STONE, t: [0, 0.04, 0] },
    { geom: box(1.8, 0.14, 1.5), mat: STONE, t: [-0.3, 0.15, -0.35] },
    { geom: box(0.3, 0.1, 0.5), mat: STONE, t: [0.72, 0.1, -0.35] },
    hall({ w: 1.4, d: 1.1, h: 0.55, a: 3, doors: ['x'], windows: 2, t: [-0.3, 0.14, -0.35] }),
    gateway([1.1, 0.08, 0.45], 0.55, 0.55, a),
    landmark([0.9, 0.08, 1.1], 2, 0.9),
    landmark([0.2, 0.08, 1.1], 2, 0.9),
    ...(a === 3 ? [landmark([-0.9, 0.08, 0.9], 3, 1)] : [pine(-0.9, 0.9, 0.7)]),
    pine(1.2, -1.15, 0.8),
    banner(-1.2, -1.2, 0.9),
  ];
}

/** The Wonder: a five-storey pagoda with a gilded spire, a hall and a gateway inside a walled court. */
function wonder(): NodeSpec[] {
  const out: NodeSpec[] = [{ geom: box(4.9, 0.1, 4.9), mat: STONE, t: [0, 0.05, 0] }, { geom: box(2.0, 0.2, 2.0), mat: STONE, t: [-0.5, 0.2, -0.5] }];
  let y = 0.3;
  let w = 1.5;
  for (let i = 0; i < 5; i++) {
    const hStorey = i === 0 ? 0.42 : 0.3;
    out.push({ t: [-0.5, y, -0.5], children: [{ geom: box(w, hStorey, w), mat: PLASTER, t: [0, hStorey / 2, 0] }, ...frame(w, w, hStorey, 3), { geom: box(w + 0.04, 0.035, w + 0.04), mat: 'team', t: [0, hStorey * 0.6, 0] }, ...curvedRoof(w, w, 0.16, 0.09, TILE, 0.22).map((n) => up(n, hStorey))] });
    y += hStorey + 0.12;
    w *= 0.82;
  }
  // Spire: a pole of gilded rings and a jewel.
  out.push({ geom: cyl(0.025, 0.03, 0.7, 6), mat: GOLD, t: [-0.5, y + 0.35, -0.5] });
  for (let i = 0; i < 7; i++) out.push({ geom: cyl(0.07 - i * 0.005, 0.07 - i * 0.005, 0.02, 10), mat: GOLD, t: [-0.5, y + 0.1 + i * 0.07, -0.5] });
  out.push({ geom: sphere(0.05, 8), mat: GOLD, t: [-0.5, y + 0.75, -0.5] });
  out.push(
    hall({ w: 1.3, d: 0.9, h: 0.5, a: 3, doors: ['x'], windows: 2, t: [-1.3, 0.1, 1.5] }),
    gateway([2.2, 0.1, 0.9], 0.6, 0.6, 3),
    fence(-0.3, -2.3, 4.2, true, 3, 0.22),
    fence(-2.3, -0.3, 4.2, false, 3, 0.22),
    landmark([1.4, 0.1, -1.4], 3, 1.2),
    landmark([1.6, 0.1, 1.9], 2, 1.1),
    landmark([0.4, 0.1, 1.9], 2, 1.1),
    pine(2.1, -2.1, 0.9),
    pine(-2.1, 0.6, 0.8),
    banner(2.35, 2.35, 1.2),
  );
  return out;
}

export const ASIAN: Kit = {
  set: 'asian',
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
    { tex: 'cloth', color: 0x3a6a8a, rough: 1, repeat: 6 },
  ],
};
