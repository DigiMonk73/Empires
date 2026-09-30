import * as THREE from 'three';
import { box, build, cyl, lumpy, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import { ease } from '../dsl/rig.ts';
import type { ClipDef, ModelDef } from './types.ts';

/**
 * Civilian ships (M8.6a): fishing boat / ship, trade boat / merchant ship, light / heavy transport. Hulls are an
 * extruded side profile pinched to a point fore and aft, sitting on the water line (y = 0) with a pale ring of
 * foam so they read as afloat on any water; sails carry a team stripe. They bob when idle, heel and bow-wave
 * when under way, the fishers haul a net (`fish`), and all of them list and settle when sunk. Models face +X.
 */
/** Ships are drawn larger than their collision circle (like the original's): a trade boat about a Dock long. */
const SHOW = 1.5;
const HULL: MatSpec = { tex: 'planks', color: 0x8a6440, rough: 0.85, repeat: 2 };
const HULL_DARK: MatSpec = { tex: 'planks', color: 0x5a4028, rough: 0.9, repeat: 2 };
const DECK: MatSpec = { tex: 'planks', color: 0xa88a5e, rough: 0.9, repeat: 3 };
const SAIL: MatSpec = { tex: 'cloth', color: 0xece2c8, rough: 0.95, repeat: 3 };
const ROPE: MatSpec = { tex: 'cloth', color: 0xb89a6a, rough: 1, repeat: 6 };
const NET: MatSpec = { tex: 'cloth', color: 0x8a7a5a, rough: 1, repeat: 10 };
const FOAM: MatSpec = { tex: 'plain', color: 0xbfd8e2, rough: 1 };
const AMPHORA: MatSpec = { tex: 'plain', color: 0xb0643a, rough: 0.9 };
const CRATE: MatSpec = { tex: 'planks', color: 0x9a7a4a, rough: 0.9, repeat: 1 };
const FISH: MatSpec = { tex: 'plain', color: 0x8aa0a8, rough: 0.5, metal: 0.2 };

/**
 * A hull `len` long and `beam` wide, `depth` deep below its sheer line (which rises by `rise` at bow and stern):
 * the side profile extruded across the beam, then each vertex pulled in toward the keel line as it nears the
 * ends — pointed bow and stern, full amidships. Sits with its bottom a little below y = 0.
 */
export function hull(len: number, beam: number, depth: number, rise: number, bowSpike = 0): THREE.BufferGeometry {
  const h = len / 2;
  const profile: [number, number][] = [
    [-h, depth + rise], // stern post
    [-h * 0.75, depth + rise * 0.3],
    [0, depth],
    [h * 0.75, depth + rise * 0.3],
    [h + bowSpike, depth + rise * 1.2], // stem
    [h * 0.8, 0.02],
    [h * 0.4, -0.03],
    [-h * 0.5, -0.03],
    [-h * 0.85, 0.02],
  ];
  const s = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: beam, bevelEnabled: false, curveSegments: 4, steps: 1 });
  g.translate(0, 0, -beam / 2);
  // Subdivide nothing — just taper: z → z × (1 − (|x|/h)^2.2)^0.6, and a slightly narrower bottom.
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = Math.min(1, Math.abs(x) / (h + bowSpike * 0.5));
    const k = Math.pow(Math.max(0, 1 - Math.pow(u, 2.2)), 0.6) * (y < depth * 0.5 ? 0.78 : 1);
    pos.setZ(i, pos.getZ(i) * Math.max(0.04, k));
  }
  g.computeVertexNormals();
  return g;
}

/** A flat foam ring on the water line (the hull's "afloat" cue). */
function foam(len: number, beam: number): NodeSpec {
  const g = new THREE.RingGeometry(0.5, 0.535, 32);
  g.rotateX(-Math.PI / 2);
  g.scale(len, 1, beam * 1.7);
  return { name: 'foam', geom: g, mat: FOAM, t: [0, 0.004, 0] };
}

/**
 * Mast and a square sail (team stripe) set on a yard braced ~26° off square, so the sail shows from every
 * facing (square across the hull it is a thin line side-on); the yard is a bone that braces round under way.
 */
function mast(x: number, height: number, sailW: number, sailH: number): NodeSpec[] {
  return [
    { geom: cyl(0.018, 0.024, height, 8), mat: HULL_DARK, t: [x, height / 2, 0] },
    {
      bone: `sail${x.toFixed(2)}`,
      t: [x + 0.03, height - 0.04, 0],
      r: [0, 0.45, 0],
      children: [
        { geom: cyl(0.012, 0.012, sailW + 0.08, 6), mat: HULL_DARK, r: [Math.PI / 2, 0, 0] },
        { geom: box(0.012, sailH, sailW), mat: SAIL, t: [0.01, -sailH / 2, 0] },
        { geom: box(0.014, sailH * 0.22, sailW * 1.001), mat: 'team', t: [0.01, -sailH * 0.4, 0] },
      ],
    },
    { geom: box(0.006, height * 0.8, 0.006), mat: ROPE, t: [x - 0.2, height * 0.45, 0], r: [0, 0, -0.5] }, // stay
  ];
}

// ── Fishing boat / ship ───────────────────────────────────────────────────────────────────────────────────
function fisher(big: boolean): () => THREE.Object3D {
  return () => {
    const L = big ? 1.15 : 0.9;
    const B = big ? 0.42 : 0.34;
    return build({
      s: SHOW,
      children: [
        foam(L, B),
        { geom: hull(L, B, 0.16, 0.08), mat: HULL },
        { geom: box(L * 0.7, 0.012, B * 0.62), mat: DECK, t: [-0.02, 0.165, 0] },
        { geom: box(L * 0.98, 0.03, 0.012), mat: 'team', t: [0, 0.14, B * 0.43] }, // team strake
        { geom: box(L * 0.98, 0.03, 0.012), mat: 'team', t: [0, 0.14, -B * 0.43] },
        ...mast(0.06, big ? 0.72 : 0.58, big ? 0.4 : 0.32, big ? 0.36 : 0.28),
        // A catch in a basket, and the net boom over the side.
        { geom: cyl(0.06, 0.05, 0.07, 10), mat: CRATE, t: [-0.26, 0.2, 0.02] },
        ...[0, 1, 2].map((i): NodeSpec => ({ geom: box(0.07, 0.02, 0.025), mat: FISH, t: [-0.26 + (i - 1) * 0.02, 0.24, 0.02], r: [0, i * 0.9, 0] })),
        {
          bone: 'boom',
          t: [-0.12, 0.3, 0.05],
          r: [0.9, 0, 0],
          children: [
            { geom: cyl(0.01, 0.01, 0.5, 6), mat: HULL_DARK, t: [0, 0.25, 0] },
            { name: 'net', geom: lumpy(0.09, 0.3, big ? 5 : 3), mat: NET, t: [0, 0.5, 0], s: [1, 0.7, 1] },
          ],
        },
        ...(big ? [{ geom: box(0.12, 0.1, 0.2), mat: HULL_DARK, t: [-0.42, 0.22, 0] } as NodeSpec] : []), // deckhouse
      ],
    });
  };
}

// ── Trade boat / merchant ship ────────────────────────────────────────────────────────────────────────────
function amphorae(x0: number, n: number, rows: number): NodeSpec[] {
  const out: NodeSpec[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < rows; j++) {
      out.push({ geom: sphere(0.035, 8), mat: AMPHORA, t: [x0 + i * 0.075, 0.21, (j - (rows - 1) / 2) * 0.08], s: [0.8, 1.4, 0.8] });
    }
  }
  return out;
}

function trader(big: boolean): () => THREE.Object3D {
  return () => {
    const L = big ? 1.5 : 1.25;
    const B = big ? 0.56 : 0.48;
    return build({
      s: SHOW,
      children: [
        foam(L, B),
        // A round-bellied merchantman: deep hull, high curled stern, a cargo well of amphorae and bales.
        { geom: hull(L, B, 0.22, 0.14), mat: HULL },
        { geom: box(L * 0.74, 0.012, B * 0.66), mat: DECK, t: [0, 0.225, 0] },
        { geom: box(L * 0.98, 0.035, 0.012), mat: 'team', t: [0, 0.19, B * 0.42] },
        { geom: box(L * 0.98, 0.035, 0.012), mat: 'team', t: [0, 0.19, -B * 0.42] },
        { geom: box(0.18, 0.1, B * 0.5), mat: HULL_DARK, t: [-L * 0.36, 0.28, 0] }, // stern cabin
        { geom: cyl(0.05, 0.03, 0.14, 8), mat: HULL_DARK, t: [-L / 2 - 0.02, 0.4, 0], r: [0, 0, 0.8] }, // stern curl
        ...amphorae(big ? -0.3 : -0.2, big ? 6 : 4, 3),
        { geom: box(0.14, 0.09, 0.16), mat: CRATE, t: [big ? 0.28 : 0.2, 0.26, 0.05] },
        { geom: box(0.12, 0.08, 0.12), mat: CRATE, t: [big ? 0.34 : 0.26, 0.26, -0.1] },
        ...mast(0.02, big ? 1.0 : 0.85, big ? 0.62 : 0.52, big ? 0.52 : 0.44),
        ...(big ? mast(0.46, 0.6, 0.3, 0.26) : []),
      ],
    });
  };
}

// ── Light / heavy transport ───────────────────────────────────────────────────────────────────────────────
function transport(big: boolean): () => THREE.Object3D {
  return () => {
    const L = big ? 1.55 : 1.3;
    const B = big ? 0.66 : 0.56;
    return build({
      s: SHOW,
      children: [
        foam(L, B),
        // Broad and low: an open deck of benches for the troops, a boarding plank lashed at the side.
        { geom: hull(L, B, 0.17, 0.1), mat: HULL },
        { geom: box(L * 0.78, 0.012, B * 0.74), mat: DECK, t: [0, 0.172, 0] },
        { geom: box(L * 0.98, 0.035, 0.012), mat: 'team', t: [0, 0.15, B * 0.44] },
        { geom: box(L * 0.98, 0.035, 0.012), mat: 'team', t: [0, 0.15, -B * 0.44] },
        ...Array.from({ length: big ? 5 : 4 }, (_, i): NodeSpec => ({ geom: box(0.04, 0.03, B * 0.62), mat: HULL_DARK, t: [-L * 0.3 + i * (L * 0.6) / (big ? 4 : 3), 0.19, 0] })),
        { geom: box(0.5, 0.012, 0.09), mat: DECK, t: [0.05, 0.2, B * 0.3], r: [0.15, 0, 0] }, // plank
        { geom: box(0.1, 0.12, B * 0.4), mat: HULL_DARK, t: [-L * 0.42, 0.24, 0] }, // helm
        ...mast(0.1, big ? 0.95 : 0.8, big ? 0.56 : 0.46, big ? 0.46 : 0.38),
      ],
    });
  };
}

// ── Clips ─────────────────────────────────────────────────────────────────────────────────────────────────
const TAU = Math.PI * 2;

function pose(root: THREE.Object3D, roll: number, pitch: number, dy: number, belly: number, sink = 0): void {
  root.rotation.x = roll;
  root.rotation.z = pitch;
  root.position.y = dy - sink;
  root.traverse((o) => {
    if (o.name.startsWith('sail')) o.rotation.y = 0.45 + 0.12 * belly; // braced round under way
  });
  const f = root.getObjectByName('foam');
  if (f) f.visible = sink < 0.05;
}

function shipClips(fishing: boolean): Record<string, ClipDef> {
  const clips: Record<string, ClipDef> = {
    // A slow swell.
    idle: { frames: 4, fps: 4, loop: true, pose: (r, t) => pose(r, 0.035 * Math.sin(t * TAU), 0.02 * Math.cos(t * TAU), 0.008 * Math.sin(t * TAU), 0) },
    // Under way: heeled a little, pitching over the waves, sail full.
    walk: { frames: 6, fps: 6, loop: true, pose: (r, t) => pose(r, 0.06 + 0.025 * Math.sin(t * TAU), 0.04 * Math.sin(t * TAU * 2), 0.01 * Math.sin(t * TAU * 2), 1) },
    // Sinking: lists hard over and settles into the water.
    die: { frames: 8, fps: 7, loop: false, pose: (r, t) => pose(r, 0.6 * ease(t, 0, 0.7), -0.15 * ease(t, 0.2, 1), 0, 0, 0.22 * ease(t, 0.1, 1)) },
  };
  if (fishing) {
    // Hauling the net: the boom swings out and down, dips, and lifts the catch back aboard.
    clips.fish = {
      frames: 8,
      fps: 5,
      loop: true,
      pose: (r, t) => {
        pose(r, 0.05 + 0.03 * Math.sin(t * TAU), 0, 0.006 * Math.sin(t * TAU), 0);
        const b = r.getObjectByName('boom')!;
        b.rotation.x = 0.9 + 0.55 * Math.sin(t * TAU);
        b.rotation.y = 0.2 * Math.sin(t * TAU + 1);
      },
    };
  }
  return clips;
}

export const SHIP_MODELS: ModelDef[] = [
  { id: 'fishingBoat', kind: 'unit', facings: 8, build: fisher(false), clips: shipClips(true) },
  { id: 'fishingShip', kind: 'unit', facings: 8, build: fisher(true), clips: shipClips(true) },
  { id: 'tradeBoat', kind: 'unit', facings: 8, build: trader(false), clips: shipClips(false) },
  { id: 'merchantShip', kind: 'unit', facings: 8, build: trader(true), clips: shipClips(false) },
  { id: 'lightTransport', kind: 'unit', facings: 8, build: transport(false), clips: shipClips(false) },
  { id: 'heavyTransport', kind: 'unit', facings: 8, build: transport(true), clips: shipClips(false) },
];
