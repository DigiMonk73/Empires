import { ANIMALS, BUILDINGS, RESOURCE_OBJECTS, UNITS } from '../../data/index.ts';
import type { AnimalDef, BuildingDef, ResourceDef, UnitDef } from '../../data/types.ts';
import { MOVE_LAND, MOVE_WATER } from '../../data/terrain.ts';
import { EKind } from '../core/entities.ts';
import { perTick } from '../time.ts';

/**
 * The compiled entity-type registry: units, then animals (Gaia units), then buildings, in data order. Entity
 * `type` fields index into TYPES. Per-player stat tables with tech/civ effects are layered on top in
 * rules/playerStats (M4); these are the base values.
 */
export interface EntityType {
  index: number;
  id: string;
  name: string;
  kind: number;
  unit?: UnitDef;
  animal?: AnimalDef;
  building?: BuildingDef;
  /** Collision radius in tiles (units). */
  radius: number;
  /** Footprint in tiles (buildings). */
  size: number;
  moveClass: number;
  /** Tiles per tick. */
  speed: number;
  hp: number;
  los: number;
}

function unitType(u: UnitDef, index: number): EntityType {
  return {
    index, id: u.id, name: u.name, kind: EKind.unit, unit: u, radius: u.radius, size: 0,
    moveClass: u.tags.includes('ship') ? MOVE_WATER : MOVE_LAND, speed: perTick(u.speed), hp: u.hp, los: u.los,
  };
}

function animalType(a: AnimalDef, index: number): EntityType {
  return {
    index, id: a.id, name: a.name, kind: EKind.unit, animal: a, radius: a.id === 'elephant' ? 0.55 : 0.25, size: 0,
    moveClass: MOVE_LAND, speed: perTick(a.speed), hp: a.hp, los: 4,
  };
}

function buildingType(b: BuildingDef, index: number): EntityType {
  return { index, id: b.id, name: b.name, kind: EKind.building, building: b, radius: b.size / 2, size: b.size, moveClass: 0, speed: 0, hp: b.hp, los: b.los };
}

export const TYPES: readonly EntityType[] = (() => {
  const out: EntityType[] = [];
  for (const u of UNITS) out.push(unitType(u, out.length));
  for (const a of ANIMALS) out.push(animalType(a, out.length));
  for (const b of BUILDINGS) out.push(buildingType(b, out.length));
  return out;
})();

const TYPE_INDEX: ReadonlyMap<string, number> = new Map(TYPES.map((t) => [`${t.kind === EKind.building ? 'b' : 'u'}:${t.id}`, t.index]));

export function unitTypeIndex(id: string): number {
  const i = TYPE_INDEX.get(`u:${id}`);
  if (i === undefined) throw new Error(`unknown unit/animal type ${id}`);
  return i;
}

export function buildingTypeIndex(id: string): number {
  const i = TYPE_INDEX.get(`b:${id}`);
  if (i === undefined) throw new Error(`unknown building type ${id}`);
  return i;
}

/**
 * Resource-node kinds: data RESOURCE_OBJECTS in order, then one carcass kind per animal (the food left when it is
 * killed, decaying at the animal's rate — econ:1.1).
 */
export const RESOURCE_KINDS: readonly ResourceDef[] = [
  ...RESOURCE_OBJECTS,
  ...ANIMALS.map(
    (a): ResourceDef => ({ id: `carcass:${a.id}`, name: a.name, res: 'food', amount: a.food, job: 'hunt', decay: a.decay, size: 1, src: a.src }),
  ),
];
const RES_INDEX: ReadonlyMap<string, number> = new Map(RESOURCE_KINDS.map((r, i) => [r.id, i]));

export function resourceKindIndex(id: string): number {
  const i = RES_INDEX.get(id);
  if (i === undefined) throw new Error(`unknown resource kind ${id}`);
  return i;
}
