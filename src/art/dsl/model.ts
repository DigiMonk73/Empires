import * as THREE from 'three';
import { makeTexture, type TexKind } from './textures.ts';

/**
 * The model DSL: models are trees of nodes built from primitives with named procedural materials. Units are
 * in world tiles (1 = one tile edge; a person is ≈0.9 tall). Y is up; X/Z are world tile x/y on the ground.
 * Nodes may be named bones (animated by clips) or sockets (projected into sprite metadata).
 */
export interface MatSpec {
  tex: TexKind;
  color: number;
  rough?: number;
  metal?: number;
  /** Texture repeats per world unit. */
  repeat?: number;
  /** Team-colored: shows the player color in game (via the tinted overlay sprite). */
  player?: boolean;
  /** Self-lit (flames, embers): shows its colour regardless of the light. */
  glow?: boolean;
}

export const MATERIALS = {
  stone: { tex: 'stoneBlocks', color: 0xb8ad98, rough: 0.9, repeat: 1.5 },
  darkStone: { tex: 'stoneBlocks', color: 0x8a8274, rough: 0.9, repeat: 1.5 },
  mudbrick: { tex: 'mudbrick', color: 0xc49a6a, rough: 0.95, repeat: 1.2 },
  plaster: { tex: 'plaster', color: 0xe6dcc4, rough: 0.9, repeat: 1 },
  planks: { tex: 'planks', color: 0x8a6440, rough: 0.8, repeat: 1.5 },
  wood: { tex: 'planks', color: 0x6e4e30, rough: 0.8, repeat: 3 },
  thatch: { tex: 'thatch', color: 0xc8a860, rough: 1, repeat: 3 },
  rooftile: { tex: 'mudbrick', color: 0xa04a2a, rough: 0.8, repeat: 2.5 },
  cloth: { tex: 'cloth', color: 0xc8b48a, rough: 0.95, repeat: 4 },
  clothDark: { tex: 'cloth', color: 0x6a5238, rough: 0.95, repeat: 4 },
  team: { tex: 'cloth', color: 0xe8e8e8, rough: 0.9, repeat: 4, player: true },
  leather: { tex: 'leather', color: 0x7a5232, rough: 0.8, repeat: 4 },
  skin: { tex: 'skin', color: 0xc98e64, rough: 0.7, repeat: 1 },
  hair: { tex: 'hair', color: 0x3a2618, rough: 0.9, repeat: 4 },
  bronze: { tex: 'metal', color: 0xb8863a, rough: 0.4, metal: 0.8, repeat: 2 },
  iron: { tex: 'metal', color: 0x8a8c90, rough: 0.45, metal: 0.8, repeat: 2 },
  foliage: { tex: 'foliage', color: 0x4f8a34, rough: 1, repeat: 1.5 },
  foliageDark: { tex: 'foliage', color: 0x3a6e28, rough: 1, repeat: 1.5 },
  bark: { tex: 'bark', color: 0x5a3e24, rough: 1, repeat: 2 },
  rock: { tex: 'rock', color: 0xb4b0a6, rough: 0.95, repeat: 1.2 },
  goldOre: { tex: 'goldOre', color: 0xd8b040, rough: 0.45, metal: 0.55, repeat: 1.2 },
  berries: { tex: 'plain', color: 0xb8243a, rough: 0.5, repeat: 1 },
  dirt: { tex: 'plain', color: 0x7a5a3a, rough: 1, repeat: 1 },
} satisfies Record<string, MatSpec>;
export type MatName = keyof typeof MATERIALS;

export type Vec3 = readonly [number, number, number];

export interface NodeSpec {
  name?: string;
  geom?: THREE.BufferGeometry;
  mat?: MatName | MatSpec;
  /** Position, Euler rotation (radians, XYZ), scale. */
  t?: Vec3;
  r?: Vec3;
  s?: number | Vec3;
  children?: NodeSpec[];
  /** Animatable bone name (the node's rotation is driven by clips). */
  bone?: string;
  /** Socket name (its projected screen position is exported with each frame). */
  socket?: string;
  castShadow?: boolean;
}

// ── Primitives (centered at the origin unless noted) ─────────────────────────────────────────────────────────
export const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
export const cyl = (rTop: number, rBot: number, h: number, seg = 12): THREE.BufferGeometry => new THREE.CylinderGeometry(rTop, rBot, h, seg);
export const cone = (r: number, h: number, seg = 12): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, seg);
export const sphere = (r: number, seg = 12): THREE.BufferGeometry => new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.75));
export const capsule = (r: number, len: number, seg = 8): THREE.BufferGeometry => new THREE.CapsuleGeometry(r, len, 4, seg);
/** Lathe around Y from a profile of [radius, y] points. */
export const lathe = (profile: readonly (readonly [number, number])[], seg = 16): THREE.BufferGeometry =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
/** Extrude a 2D polygon (x, y) by `depth` along +Z, centered on Z. */
export function extrude(shape: readonly (readonly [number, number])[], depth: number, bevel = 0): THREE.BufferGeometry {
  const s = new THREE.Shape(shape.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** A lumpy blob: an icosphere with seeded radial displacement (foliage clumps, rocks). */
export function lumpy(r: number, rough: number, seed: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.attributes.position!;
  const rand = seeded(seed);
  const cache = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`; // keep shared vertices welded
    let k = cache.get(key);
    if (k === undefined) cache.set(key, (k = 1 + (rand() - 0.5) * 2 * rough));
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Four-sided pyramid roof over a w×d rectangle, base at y = 0. */
export function pyramid(w: number, d: number, h: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  g.scale(w, h, d);
  return g;
}
/** Gable roof (ridge along X) over w×d, base at y = 0. */
export function gable(w: number, d: number, h: number): THREE.BufferGeometry {
  const g = extrude([[-d / 2, 0], [d / 2, 0], [0, h]], w);
  g.rotateY(Math.PI / 2);
  return g;
}

// ── Materials ─────────────────────────────────────────────────────────────────────────────────────────────────
const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function material(m: MatName | MatSpec): THREE.MeshStandardMaterial {
  const spec: MatSpec = typeof m === 'string' ? MATERIALS[m] : m;
  const key = JSON.stringify(spec);
  let mat = matCache.get(key);
  if (!mat) {
    const map = makeTexture(spec.tex, spec.color, key.length);
    map.repeat.set(spec.repeat ?? 1, spec.repeat ?? 1);
    mat = new THREE.MeshStandardMaterial({ map, roughness: spec.rough ?? 0.85, metalness: spec.metal ?? 0 });
    if (spec.glow) {
      mat.emissive.setHex(spec.color);
      mat.emissiveMap = map;
      mat.emissiveIntensity = 0.85;
    }
    mat.userData.player = !!spec.player;
    matCache.set(key, mat);
  }
  return mat;
}

/** Build a Three.js object tree from a node spec. Bones and sockets are findable by name. */
export function build(spec: NodeSpec): THREE.Object3D {
  const obj: THREE.Object3D = spec.geom ? new THREE.Mesh(spec.geom, material(spec.mat ?? 'plaster')) : new THREE.Group();
  if (spec.geom) {
    obj.castShadow = spec.castShadow ?? true;
    obj.receiveShadow = true;
  }
  obj.name = spec.bone ?? spec.socket ?? spec.name ?? '';
  obj.userData.bone = spec.bone;
  obj.userData.socket = spec.socket;
  if (spec.t) obj.position.set(...spec.t);
  if (spec.r) obj.rotation.set(...spec.r);
  if (spec.s !== undefined) typeof spec.s === 'number' ? obj.scale.setScalar(spec.s) : obj.scale.set(...spec.s);
  for (const c of spec.children ?? []) obj.add(build(c));
  return obj;
}

/** Deterministic small PRNG for model variation (seeded per variant). */
export function seeded(seed: number): () => number {
  // Mix the seed first: xorshift's first outputs are tiny for small seeds.
  let s = Math.imul((seed ^ 0x9e3779b9) >>> 0, 0x85ebca6b) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35) >>> 0;
  s = (s ^ (s >>> 16)) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
