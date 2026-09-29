import type * as THREE from 'three';
import { build, cyl, box } from '../dsl/model.ts';
import { applyPose, diePose, humanoid, idlePose, walkPose } from '../dsl/rig.ts';
import type { ClipDef, ModelDef } from './types.ts';

function clip(frames: number, fps: number, loop: boolean, pose: (t: number) => Parameters<typeof applyPose>[1], markers?: Record<string, number>): ClipDef {
  return { frames, fps, loop, pose: (root: THREE.Object3D, t: number) => applyPose(root, pose(t)), ...(markers ? { markers } : {}) };
}

/** Standard humanoid clips: idle (6), walk (10, one stride cycle), die (10, last frame = corpse). */
const HUMAN_CLIPS = {
  idle: clip(6, 4, true, idlePose),
  walk: clip(10, 12, true, (t) => walkPose(t)),
  die: clip(10, 10, false, diePose),
};

export const UNIT_MODELS: ModelDef[] = [
  {
    id: 'villager',
    kind: 'unit',
    facings: 8,
   
    build: () =>
      build(
        humanoid({
          top: 'team',
          skirt: 'cloth',
          // A short-handled tool so the silhouette reads as a worker.
          rightHand: [{ geom: cyl(0.012, 0.012, 0.22, 5), mat: 'wood', t: [0, -0.06, 0], r: [0, 0, 1.3] }, { geom: box(0.05, 0.035, 0.012), mat: 'iron', t: [0.1, -0.03, 0] }],
        }),
      ),
    clips: HUMAN_CLIPS,
  },
];
