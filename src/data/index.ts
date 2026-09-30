import { BUILDINGS } from './buildings.ts';
import { CIVS } from './civs.ts';
import { ANIMALS, RESOURCE_OBJECTS } from './resources.ts';
import { TECHS } from './techs.ts';
import type { AnimalDef, BuildingDef, CivDef, Disabled, Effect, ResourceDef, TechDef, UnitDef } from './types.ts';
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

/**
 * Full Tech Tree (M14.4, econ:6.4 "Full Tech Tree removes civ bonuses. In the original, Fire Galleys are not
 * available under Full Tech Tree"): every civilization gets everything but the Fire Galley, and no bonuses.
 */
export const FULL_TREE_DISABLED: Disabled = { units: ['fireGalley'], buildings: [], techs: [] };
export const FULL_TREE_SRC = { src: 'econ:6.4' } as const;
const NO_RULES: { bonuses: readonly Effect[]; disabled: Disabled } = { bonuses: [], disabled: { units: [], buildings: [], techs: [] } };

/** The rules a civilization plays by: its bonuses and what it lacks — or the Full Tech Tree's. */
export function civRules(civ: string, fullTechTree = false): { bonuses: readonly Effect[]; disabled: Disabled } {
  if (fullTechTree) return { bonuses: [], disabled: FULL_TREE_DISABLED };
  return CIV_BY_ID.get(civ) ?? NO_RULES;
}

export { ANIMALS, BUILDINGS, CIVS, RESOURCE_OBJECTS, TECHS, UNITS };
export * from './types.ts';
