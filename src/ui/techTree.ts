import { BUILDINGS, TECH_BY_ID, TECHS, UNIT_BY_ID, UNITS, civRules } from '../data/index.ts';
import { EKind } from '../sim/core/entities.ts';
import { TYPES } from '../sim/rules/registry.ts';
import type { World } from '../sim/world.ts';

/**
 * The tech tree (M7.9): for each building (columns) and age (rows), what it offers — the building itself, its
 * units and their upgrades, its technologies — and each item's state for a civilization, or for a live player:
 * `done` (researched / built / trainable now), `now` (this age, not yet), `later` (a later age), `missing` (not in
 * this civilization's tree, econ:6.2).
 */
export type ItemState = 'done' | 'now' | 'later' | 'missing';
export interface TreeItem {
  id: string;
  name: string;
  kind: 'building' | 'unit' | 'tech';
  age: number;
  state: ItemState;
}
export interface TreeColumn {
  building: string;
  name: string;
  /** Items by age (index 1–4). */
  ages: TreeItem[][];
}

/** Land-game columns in the original's order (the Dock's ships join in M8). */
export const TREE_BUILDINGS = ['townCenter', 'barracks', 'archeryRange', 'stable', 'academy', 'siegeWorkshop', 'temple', 'market', 'governmentCenter', 'storagePit', 'granary', 'dock'] as const;

/** Units a building fields, including the upgrades its line becomes (Clubman → Axeman …). */
function unitsOf(building: string): string[] {
  const base = BUILDINGS.find((b) => b.id === building)?.trains ?? [];
  const out: string[] = [];
  const add = (id: string) => {
    if (out.includes(id)) return;
    out.push(id);
    for (const u of UNITS) if (u.upgradeOf === id) add(u.id);
  };
  for (const u of base) add(u);
  return out;
}

/** The techs that upgrade a line to each unit (Legion ← "legion"). */
/** Buildings a technology turns another into (Sentry Tower → Guard Tower), by the technology. */
const BUILT_BY = new Map<string, string[]>();
for (const t of TECHS) for (const e of t.effects) if (e.op === 'upgrade' && e.kind === 'building') BUILT_BY.set(e.to, [...(BUILT_BY.get(e.to) ?? []), t.id]);
const UPGRADED_BY = new Map<string, string[]>();
for (const t of TECHS) for (const e of t.effects) if (e.op === 'upgrade' && e.kind === 'unit') UPGRADED_BY.set(e.to, [...(UPGRADED_BY.get(e.to) ?? []), t.id]);

/** First unit of a line (Legion → Short Swordsman). */
function lineRoot(id: string): string {
  let r = id;
  while (UNIT_BY_ID.get(r)?.upgradeOf) r = UNIT_BY_ID.get(r)!.upgradeOf!;
  return r;
}

/** Walls and towers are researched and built from the Granary in the original's tree. */
const GRANARY_BUILDS = ['smallWall', 'mediumWall', 'fortification', 'watchTower', 'sentryTower', 'guardTower', 'ballistaTower'];

export function techTree(civId: string, w?: World, player?: number, fullTechTree = w?.fullTechTree ?? false): TreeColumn[] {
  const civ = civRules(civId, fullTechTree);
  const p = w && player !== undefined ? w.players[player] : undefined;
  const age = p?.stats.age ?? 0;
  const owned = new Set<string>();
  if (w && player !== undefined) {
    const e = w.ents;
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.owner[s] !== player || e.kind[s] !== EKind.building || e.build[s]! < 1) continue;
      owned.add(TYPES[e.type[s]!]!.id);
    }
  }
  /** Out of reach: the civilization lacks it, or a tech it needs (Babylonian Armored Elephant, Persian Irrigation). */
  const techMissing = (t: string): boolean => civ.disabled.techs.includes(t) || (TECH_BY_ID.get(t)?.requires ?? []).some(techMissing);
  /** A unit is out of reach if it, anything earlier in its line, the tech that upgrades to it, or a tech it needs is missing. */
  const unitMissing = (id: string): boolean => {
    if (civ.disabled.units.includes(id)) return true;
    const u = UNIT_BY_ID.get(id);
    // …or the building that trains it (Macedonian Priest — no Temple; Persian Hoplite — no Academy, M15.10 P46).
    if (u?.trainedAt && civ.disabled.buildings.includes(u.trainedAt)) return true;
    if (u?.requires?.some(techMissing)) return true;
    if (u?.upgradeOf) {
      if (UPGRADED_BY.get(id)?.some(techMissing)) return true;
      return unitMissing(u.upgradeOf);
    }
    return false;
  };
  /** A building the civilization lacks, or one only a technology it lacks makes (Roman Guard Tower, M15.10 P43). */
  const buildingMissing = (id: string): boolean => civ.disabled.buildings.includes(id) || (BUILT_BY.get(id)?.some(techMissing) ?? false);
  /** A tech that only upgrades units the civilization lacks (Yamato's Armored Elephant: no War Elephants, M15.10 P22). */
  const upgradesNothing = (t: string): boolean => {
    const fx = TECH_BY_ID.get(t)?.effects ?? [];
    return fx.length > 0 && fx.every((e) => e.op === 'upgrade' && e.kind === 'unit' && unitMissing(e.to));
  };
  const state = (kind: TreeItem['kind'], id: string, itemAge: number): ItemState => {
    if (kind === 'unit' ? unitMissing(id) : kind === 'building' ? buildingMissing(id) : techMissing(id) || upgradesNothing(id)) return 'missing';
    if (!p) return 'now';
    if (kind === 'tech' && p.techs.includes(id)) return 'done';
    if (kind === 'building' && owned.has(id)) return 'done';
    if (kind === 'unit') {
      // Trainable now: its line has reached it, the age allows it and any enabling tech is in.
      const cur = p.stats.upgrades.get(lineRoot(id)) ?? lineRoot(id);
      const req = UNIT_BY_ID.get(id)?.requires ?? [];
      if (cur === id && itemAge <= age && req.every((r) => p.techs.includes(r))) return 'done';
    }
    return itemAge <= age ? 'now' : 'later';
  };
  return TREE_BUILDINGS.map((bid) => {
    const def = BUILDINGS.find((b) => b.id === bid)!;
    const ages: TreeItem[][] = [[], [], [], [], []];
    const push = (kind: TreeItem['kind'], id: string, name: string, a: number) => ages[Math.max(1, Math.min(4, a))]!.push({ id, name, kind, age: a, state: state(kind, id, a) });
    push('building', bid, def.name, def.age);
    if (bid === 'granary') for (const g of GRANARY_BUILDS) {
      const b = BUILDINGS.find((x) => x.id === g)!;
      push('building', g, b.name, b.age);
    }
    for (const u of unitsOf(bid)) {
      const d = UNITS.find((x) => x.id === u)!;
      push('unit', u, d.name, d.age);
    }
    for (const t of TECHS) if (t.at === bid && !t.effects.some((e) => e.op === 'upgrade' && e.kind === 'building')) push('tech', t.id, t.name, t.age);
    return { building: bid, name: def.name, ages };
  });
}
