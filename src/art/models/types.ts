import type * as THREE from 'three';

/** An animation clip: `pose` sets bone rotations for normalized time t ∈ [0, 1). */
export interface ClipDef {
  frames: number;
  fps: number;
  loop: boolean;
  pose(root: THREE.Object3D, t: number): void;
  /** Normalized times of gameplay events, e.g. `hit` for the attack frame. */
  markers?: Record<string, number>;
}

export interface ModelDef {
  id: string;
  kind: 'unit' | 'building' | 'resource' | 'test';
  /** Buildings/resources: footprint in tiles (for the frame size and calibration). */
  footprint?: number;
  /** Number of visual variants (resources). */
  variants?: number;
  /** Facings to bake (8 for units, 1 for static objects). */
  facings: number;
  /** Frame cell size at 2× (px) before trimming. */
  cell: [number, number];
  build(variant: number): THREE.Object3D;
  clips?: Record<string, ClipDef>;
}
