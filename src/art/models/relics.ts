import type * as THREE from 'three';
import { box, build, cyl, lumpy, seeded, sphere, type MatSpec, type NodeSpec } from '../dsl/model.ts';
import type { ModelDef } from './types.ts';
import { banner } from './buildings.ts';

/**
 * Ruins and Artifacts (M14.1, econ:7): gaia-owned relics that belong to whoever stands beside them. Both carry a
 * small owner-coloured banner (grey while nobody holds them) so a capture reads at a glance.
 */

const MARBLE: MatSpec = { tex: 'stoneBlocks', color: 0xe4dccb, rough: 0.85, repeat: 1 };
const WEATHERED: MatSpec = { tex: 'stoneBlocks', color: 0xc2b8a2, rough: 0.95, repeat: 1.5 };
const GOLD: MatSpec = { tex: 'metal', color: 0xf2c850, rough: 0.35, metal: 0.35, repeat: 1 }; // low metalness: the baker has no environment to reflect

function column(x: number, z: number, h: number, capital: boolean): NodeSpec {
  const kids: NodeSpec[] = [
    { geom: box(0.26, 0.05, 0.26), mat: WEATHERED, t: [0, 0.025, 0] },
    { geom: cyl(0.085, 0.095, h, 12), mat: MARBLE, t: [0, 0.05 + h / 2, 0] },
  ];
  if (capital) kids.push({ geom: box(0.24, 0.06, 0.24), mat: MARBLE, t: [0, 0.05 + h + 0.03, 0] });
  // A broken top: a jagged stub leaning off the shaft.
  else kids.push({ geom: lumpy(0.08, 0.35, 300 + Math.round(h * 100), 0), mat: MARBLE, t: [0.01, 0.05 + h, 0], s: [1, 0.5, 1] });
  return { t: [x, 0, z], children: kids };
}

/** Broken columns and fallen blocks on a cracked 2×2 pavement. */
function ruins(): THREE.Object3D {
  const rnd = seeded(7101);
  const kids: NodeSpec[] = [];
  // Pavement: slabs with gaps, a few missing.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if ((i === 0 && j === 3) || (i === 3 && j === 1)) continue;
      const x = -0.66 + i * 0.44 + (rnd() - 0.5) * 0.03;
      const z = -0.66 + j * 0.44 + (rnd() - 0.5) * 0.03;
      kids.push({ geom: box(0.41, 0.04 + rnd() * 0.02, 0.41), mat: WEATHERED, t: [x, 0.025, z], r: [0, (rnd() - 0.5) * 0.08, 0] });
    }
  }
  // A colonnade's remains along the back edges (away from the viewer), tallest in the far corner.
  kids.push(column(-0.62, -0.62, 0.95, true), column(0.05, -0.64, 0.55, false), column(-0.64, 0.08, 0.4, false), column(0.64, -0.6, 0.28, false));
  // A fallen drum and a toppled lintel in front.
  kids.push({ geom: cyl(0.09, 0.09, 0.34, 12), mat: MARBLE, t: [0.25, 0.1, 0.2], r: [0, 0.6, Math.PI / 2] });
  kids.push({ geom: box(0.5, 0.1, 0.16), mat: MARBLE, t: [-0.1, 0.1, 0.45], r: [0, -0.35, 0.1] });
  for (let i = 0; i < 6; i++) kids.push({ geom: lumpy(0.05, 0.4, 320 + i, 0), mat: WEATHERED, t: [(rnd() - 0.5) * 1.4, 0.04, 0.2 + rnd() * 0.5] });
  kids.push(banner(0.62, 0.62, 0.62));
  return build({ children: kids });
}

/** A golden idol on a stepped pedestal. */
function artifact(): THREE.Object3D {
  const kids: NodeSpec[] = [
    { geom: box(0.62, 0.08, 0.62), mat: WEATHERED, t: [0, 0.04, 0] },
    { geom: box(0.42, 0.18, 0.42), mat: MARBLE, t: [0, 0.17, 0] },
    { geom: box(0.46, 0.04, 0.46), mat: MARBLE, t: [0, 0.28, 0] },
    // The idol: a seated figure, knees forward, a crowned head.
    { geom: cyl(0.08, 0.11, 0.2, 12), mat: GOLD, t: [0, 0.4, 0] },
    { geom: box(0.18, 0.07, 0.12), mat: GOLD, t: [0.04, 0.33, 0.04], r: [0, Math.PI / 4, 0] },
    { geom: sphere(0.065, 12), mat: GOLD, t: [0, 0.56, 0] },
    { geom: cyl(0.05, 0.035, 0.05, 8), mat: GOLD, t: [0, 0.63, 0] },
    // Team cloth draped over the pedestal's front.
    { geom: box(0.43, 0.1, 0.012), mat: 'team', t: [0, 0.2, 0.215] },
    { geom: box(0.012, 0.1, 0.43), mat: 'team', t: [0.215, 0.2, 0] },
  ];
  return build({ children: kids });
}

export const RELIC_MODELS: ModelDef[] = [
  { id: 'ruins', kind: 'building', footprint: 2, facings: 1, build: ruins },
  { id: 'artifact', kind: 'building', footprint: 1, facings: 1, build: artifact },
];
