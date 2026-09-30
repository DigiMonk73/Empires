import type * as THREE from 'three';
import { applyPose, diePose, idlePose, walkPose } from '../dsl/rig.ts';
import type { ClipDef, ModelDef } from './types.ts';
import { buildVillager, VILLAGER_CLIPS } from './villager.ts';

function clip(frames: number, fps: number, loop: boolean, pose: (t: number) => Parameters<typeof applyPose>[1], markers?: Record<string, number>): ClipDef {
  return { frames, fps, loop, pose: (root: THREE.Object3D, t: number) => applyPose(root, pose(t)), ...(markers ? { markers } : {}) };
}

/** Standard humanoid clips for soldiers (M5): idle (6), walk (10, one stride cycle), die (10, last frame = corpse). */
export const HUMAN_CLIPS: Record<string, ClipDef> = {
  idle: clip(6, 4, true, idlePose),
  walk: clip(10, 12, true, (t) => walkPose(t)),
  die: clip(10, 10, false, diePose),
};

export const UNIT_MODELS: ModelDef[] = [
  { id: 'villager', kind: 'unit', facings: 8, build: buildVillager, clips: VILLAGER_CLIPS },
];
