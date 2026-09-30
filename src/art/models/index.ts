import { RESOURCE_MODELS, TEST_MODELS } from './resources.ts';
import { UNIT_MODELS } from './units.ts';
import { BUILDING_MODELS } from './buildings.ts';
import { ANIMAL_MODELS } from './animals.ts';
import { SOLDIER_MODELS } from './soldiers.ts';
import { CAVALRY_MODELS } from './cavalry.ts';
import type { ModelDef } from './types.ts';

export const MODELS: ModelDef[] = [...TEST_MODELS, ...RESOURCE_MODELS, ...UNIT_MODELS, ...SOLDIER_MODELS, ...CAVALRY_MODELS, ...ANIMAL_MODELS, ...BUILDING_MODELS];
export const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m]));
export type { ModelDef, ClipDef } from './types.ts';
