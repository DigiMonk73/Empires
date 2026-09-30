import type { Sourced } from './types.ts';

/** Movement classes: which terrain a unit can stand on. */
export const MOVE_LAND = 1;
export const MOVE_WATER = 2;

export interface TerrainDef extends Sourced {
  id: string;
  name: string;
  /** Bitmask of MOVE_* classes allowed on this terrain (before objects/buildings block it). */
  pass: number;
  /** Buildings may be placed here (docks additionally need adjacent water). */
  buildable: boolean;
  /** Blending priority: higher terrains overlap lower ones at borders (render). */
  priority: number;
  /** Placeholder flat color until baked textures exist (render only). */
  color: number;
}

/**
 * Terrain types (mil:4 — grass, water, beach, shallows, desert, forest, dirt, deep water; palm/pine/jungle forests
 * are forest variants). Forest tiles carry forest-tree resources, which are what block movement.
 */
export const TERRAINS: readonly TerrainDef[] = [
  { id: 'grass', name: 'Grass', pass: MOVE_LAND, buildable: true, priority: 3, color: 0x4f7a2e, src: 'mil:4' },
  { id: 'dirt', name: 'Dirt', pass: MOVE_LAND, buildable: true, priority: 4, color: 0x8a7148, src: 'mil:4' },
  { id: 'desert', name: 'Desert', pass: MOVE_LAND, buildable: true, priority: 5, color: 0xc49a5e, src: 'mil:4' },
  { id: 'forest', name: 'Forest Floor', pass: MOVE_LAND, buildable: true, priority: 6, color: 0x3b5a24, src: 'mil:4' },
  { id: 'beach', name: 'Beach', pass: MOVE_LAND, buildable: true, priority: 2, color: 0xe0d2a2, src: 'mil:4' },
  { id: 'shallows', name: 'Shallows', pass: MOVE_LAND | MOVE_WATER, buildable: false, priority: 1, color: 0x5d9fae, src: 'mil:1b,mil:4', note: 'crossable by land units and ships' },
  { id: 'water', name: 'Water', pass: MOVE_WATER, buildable: false, priority: 0, color: 0x2f6f96, src: 'mil:4' },
  { id: 'deepWater', name: 'Deep Water', pass: MOVE_WATER, buildable: false, priority: 0, color: 0x1f4f78, src: 'mil:4' },
];

export const TERRAIN_INDEX: ReadonlyMap<string, number> = new Map(TERRAINS.map((t, i) => [t.id, i]));

export function terrainIndex(id: string): number {
  const i = TERRAIN_INDEX.get(id);
  if (i === undefined) throw new Error(`unknown terrain ${id}`);
  return i;
}
