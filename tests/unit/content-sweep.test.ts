import { describe, expect, it } from 'vitest';
import { BUILDINGS, CIVS, TECHS, TECH_BY_ID, UNIT_BY_ID } from '../../src/data/index.ts';
import { Sim } from '../../src/sim/index.ts';
import { EKind } from '../../src/sim/core/entities.ts';
import { buildingTypeIndex, TYPES, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { placementValid } from '../../src/sim/systems/build.ts';
import { completeResearch, producedType, researchBlocker } from '../../src/sim/systems/production.ts';

/**
 * Content sweeps (M15.7, Done 1 — "each with data and tests"): every technology, every building and every upgrade in
 * the data is exercised, not only the ones a hand-written test happens to name. Units are swept by army-lines.test
 * (every unit a land building trains; every land upgrade); ships are swept here.
 */
const AGES = ['toolAge', 'bronzeAge', 'ironAge'];
const W = 48;
const H = 40;
/** Water from x = 40 (the Dock's coast). */
const ROWS = Array.from({ length: H }, () => '.'.repeat(40) + '~'.repeat(W - 40));
const STANDING = ['barracks', 'archeryRange', 'stable', 'academy', 'siegeWorkshop', 'temple', 'townCenter', 'granary', 'storagePit', 'market', 'governmentCenter'];

/** A player with one of every producing building standing, a Dock on the coast, villagers and plenty to spend. */
function world(civ: string, extra: { type: string; tx: number; ty: number }[] = []) {
  const buildings = [
    ...STANDING.map((type, i) => ({ type, owner: 1, tx: 2 + (i % 6) * 6, ty: 2 + Math.floor(i / 6) * 6 })),
    { type: 'dock', owner: 1, tx: 39, ty: 4 },
    ...extra.map((b) => ({ ...b, owner: 1 })),
  ];
  const units = Array.from({ length: 8 }, (_, i) => ({ type: 'villager', owner: 1, x: 4.5 + i, y: 36.5 }));
  const sim = Sim.create({ seed: 5, map: { w: W, h: H, ascii: ROWS }, players: [{ civ }, { civ: 'egyptian' }], startingResources: 'deathmatch', victory: 'none', scenario: { buildings, units } });
  const w = sim.world;
  const own = (p: number, s: number) => w.ents.alive[s] && w.ents.owner[s] === p;
  const slot = (type: string) => {
    const ti = buildingTypeIndex(type);
    for (let s = 0; s < w.ents.top; s++) if (own(1, s) && w.ents.type[s] === ti) return s;
    return -1;
  };
  const villagers = () => {
    const out: number[] = [];
    for (let s = 0; s < w.ents.top; s++) if (own(1, s) && w.ents.kind[s] === EKind.unit && TYPES[w.ents.type[s]!]!.id === 'villager') out.push(w.ents.handleOf(s));
    return out;
  };
  const research = (id: string) => {
    if (!w.players[1]!.techs.includes(id)) completeResearch(w, 1, id);
  };
  return { sim, w, slot, villagers, research };
}

/** A technology's prerequisites, recursively, in research order (not the tech itself). */
function prereqs(id: string): string[] {
  const out: string[] = [];
  const visit = (t: string) => {
    for (const r of TECH_BY_ID.get(t)?.requires ?? []) if (!out.includes(r)) (visit(r), out.push(r));
  };
  visit(id);
  return out;
}

/** The ages below `age` (1 Stone … 4 Iron), as techs. */
const agesBelow = (age: number): string[] => AGES.slice(0, Math.max(0, age - 1));

/** A civilization whose tree has every one of these techs and units (no civ has the whole tree, econ:6.2). */
function civWith(techs: string[], units: string[] = [], buildings: string[] = []): string {
  const c = CIVS.find((c) => !techs.some((t) => c.disabled.techs.includes(t)) && !units.some((u) => c.disabled.units.includes(u)) && !buildings.some((b) => c.disabled.buildings.includes(b)));
  if (!c) throw new Error(`no civilization has ${[...techs, ...units, ...buildings].join(', ')}`);
  return c.id;
}

/** The compiled player stats as comparable text (Sets and Maps listed). */
const snapshot = (stats: unknown): string => JSON.stringify(stats, (_k, v) => (v instanceof Set ? [...v].sort() : v instanceof Map ? [...v].sort() : v));

describe('every technology (M15.7)', () => {
  it.each(TECHS.map((t) => [t.id, t.at] as const))('%s: researched at the %s once its age and prerequisites are in, and it changes the player', (id) => {
    const tech = TECH_BY_ID.get(id)!;
    const needs = [...agesBelow(tech.age).filter((a) => a !== id), ...prereqs(id)];
    const t = world(civWith([id, ...needs]));
    for (const r of needs) t.research(r);
    expect(researchBlocker(t.w, 1, t.slot(tech.at), id)).toBeNull();
    const before = snapshot(t.w.players[1]!.stats);
    completeResearch(t.w, 1, id);
    expect(t.w.players[1]!.techs).toContain(id);
    expect(snapshot(t.w.players[1]!.stats)).not.toBe(before);
  });
});

/** Building upgrades (towers, walls): reached by research, not built. Ruins and Artifacts are placed, not built. */
const BUILDING_UPGRADES = TECHS.flatMap((tech) => tech.effects.filter((e) => e.op === 'upgrade' && e.kind === 'building').map((e) => [tech.id, (e as { from: string }).from, (e as { to: string }).to] as const));
const UPGRADED = new Set(BUILDING_UPGRADES.map(([, , to]) => to));
const DIRECT = BUILDINGS.filter((b) => !UPGRADED.has(b.id) && b.id !== 'ruins' && b.id !== 'artifact').map((b) => b.id);

describe('every building (M15.7)', () => {
  it.each(DIRECT)('villagers build a %s once its age and requirements are in', (id) => {
    const def = BUILDINGS.find((b) => b.id === id)!;
    const needs = [...agesBelow(def.age), ...(def.requires ?? []).flatMap((r) => [...prereqs(r), r])];
    const t = world(civWith(needs, [], [id]));
    for (const r of needs) t.research(r);
    const ti = buildingTypeIndex(id);
    // The first free spot south of the town (on the coast for a Dock).
    let at: [number, number] | null = null;
    for (let ty = id === 'dock' ? 14 : 26; ty < H - 4 && !at; ty++) for (let tx = id === 'dock' ? 36 : 2; tx < W - 2 && !at; tx++) if (placementValid(t.w, ti, tx, ty)) at = [tx, ty];
    expect(at, 'a place to build it').not.toBeNull();
    // (The town already has one of most types: only a new one counts.)
    const before = new Set<number>();
    for (let s = 0; s < t.w.ents.top; s++) if (t.w.ents.alive[s] && t.w.ents.type[s] === ti) before.add(t.w.ents.handleOf(s));
    t.sim.step([{ player: 1, cmd: { t: 'build', ids: t.villagers(), type: id, tx: at![0], ty: at![1] } }]);
    const done = () => {
      for (let s = 0; s < t.w.ents.top; s++) if (t.w.ents.alive[s] && t.w.ents.type[s] === ti && t.w.ents.owner[s] === 1 && !before.has(t.w.ents.handleOf(s)) && t.w.ents.build[s]! >= 1) return true;
      return false;
    };
    for (let k = 0; k < 60_000 && !done(); k++) t.sim.step();
    expect(done()).toBe(true);
  });

  it.each(BUILDING_UPGRADES)('%s turns a standing %s into a %s', (techId, from, to) => {
    const t = world(civWith([techId, ...prereqs(techId)]), [{ type: from, tx: 20, ty: 30 }]);
    for (const r of [...AGES, ...prereqs(techId)]) t.research(r);
    const s = t.slot(from);
    expect(s).toBeGreaterThanOrEqual(0);
    completeResearch(t.w, 1, techId);
    expect(TYPES[t.w.ents.type[s]!]!.id).toBe(to);
  });
});

describe('every ship upgrade (M15.7; land lines in army-lines.test)', () => {
  const SHIP_UPGRADES = TECHS.flatMap((tech) => tech.effects.filter((e) => e.op === 'upgrade' && e.kind === 'unit').map((e) => [tech.id, (e as { from: string }).from, (e as { to: string }).to] as const)).filter(([, from]) => UNIT_BY_ID.get(from)!.tags.includes('ship'));
  it('covers the boat lines', () => expect(SHIP_UPGRADES.map(([, , to]) => to)).toEqual(expect.arrayContaining(['merchantShip', 'heavyTransport'])));
  it.each(SHIP_UPGRADES)('%s upgrades %s → %s at sea and at the Dock', (techId, from, to) => {
    const needs = [...AGES, ...prereqs(techId)];
    const t = world(civWith([techId, ...needs], [to]));
    // Bring the line up to `from` first (a Trireme needs the War Galley before it).
    const chain: string[] = [];
    for (let u = from; UNIT_BY_ID.get(u)!.upgradeOf; u = UNIT_BY_ID.get(u)!.upgradeOf!) chain.unshift(u);
    for (const u of chain) {
      const tech = TECHS.find((x) => x.effects.some((e) => e.op === 'upgrade' && (e as { to: string }).to === u))!;
      for (const r of [...prereqs(tech.id), tech.id]) t.research(r);
    }
    for (const r of needs) t.research(r);
    const h = t.w.spawnUnit(unitTypeIndex(from), 1, 44.5, 20.5);
    completeResearch(t.w, 1, techId);
    expect(TYPES[t.w.ents.type[t.w.ents.slotOf(h)]!]!.id).toBe(to);
    let base = from;
    while (UNIT_BY_ID.get(base)!.upgradeOf) base = UNIT_BY_ID.get(base)!.upgradeOf!;
    expect(TYPES[producedType(t.w, 1, base)]!.id).toBe(to);
  });
});
