import { BUILDINGS } from './buildings.ts';
import { CIVS } from './civs.ts';
import { ANIMALS, RESOURCE_OBJECTS } from './resources.ts';
import { TECHS } from './techs.ts';
import type { AnimalDef, BuildingDef, CivDef, ResourceDef, TechDef, UnitDef } from './types.ts';
import { UNITS } from './units.ts';

function index<T extends { id: string }>(defs: readonly T[], what: string): ReadonlyMap<string, T> {
  const m = new Map<string, T>();
  for (const d of defs) {
    if (m.has(d.id)) throw new Error(`duplicate ${what} id: ${d.id}`);
    m.set(d.id, d);
  }
  return m;
}

export const UNIT_BY_ID: ReadonlyMap<string, UnitDef> = index(UNITS, 'unit');
export const BUILDING_BY_ID: ReadonlyMap<string, BuildingDef> = index(BUILDINGS, 'building');
export const TECH_BY_ID: ReadonlyMap<string, TechDef> = index(TECHS, 'tech');
export const CIV_BY_ID: ReadonlyMap<string, CivDef> = index(CIVS, 'civ');
export const RESOURCE_BY_ID: ReadonlyMap<string, ResourceDef> = index(RESOURCE_OBJECTS, 'resource');
export const ANIMAL_BY_ID: ReadonlyMap<string, AnimalDef> = index(ANIMALS, 'animal');

export { ANIMALS, BUILDINGS, CIVS, RESOURCE_OBJECTS, TECHS, UNITS };
export * from './types.ts';
