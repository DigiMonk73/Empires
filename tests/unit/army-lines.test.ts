import { describe, expect, it } from 'vitest';
import { BUILDINGS, CIVS, TECHS, UNIT_BY_ID } from '../../src/data/index.ts';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { completeResearch, producedType, researchBlocker, trainBlocker } from '../../src/sim/systems/production.ts';

const AGES = ['toolAge', 'bronzeAge', 'ironAge'];
const LAND = ['barracks', 'archeryRange', 'stable', 'academy', 'siegeWorkshop', 'temple', 'townCenter'];

/** A Greek (full land tree except where noted) player with every land building standing. */
function world(civ = 'greek') {
  const buildings = LAND.map((type, i) => ({ type, owner: 1, tx: 2 + (i % 4) * 5, ty: 2 + Math.floor(i / 4) * 5 }));
  buildings.push({ type: 'market', owner: 1, tx: 22, ty: 12 }, { type: 'governmentCenter', owner: 1, tx: 12, ty: 22 });
  const sim = Sim.create({ seed: 3, map: { w: 40, h: 40 }, players: [{ civ }], startingResources: 'deathmatch', victory: 'none', scenario: { buildings } });
  const w = sim.world;
  const slot = (type: string) => {
    const ti = buildingTypeIndex(type);
    for (let s = 0; s < w.ents.top; s++) if (w.ents.alive[s] && w.ents.type[s] === ti) return s;
    return -1;
  };
  return { sim, w, slot };
}

/** A civilization that has the unit and every tech it needs (econ:6.2 — no civ has the whole tree). */
function civFor(unitId: string, techs: string[] = []): string {
  const c = CIVS.find((c) => !c.disabled.units.includes(unitId) && !techs.some((t) => c.disabled.techs.includes(t)));
  if (!c) throw new Error(`no civilization has ${unitId}`);
  return c.id;
}

/** Techs a unit needs, recursively (its own `requires` and those of the techs it names). */
function techsFor(unitId: string): string[] {
  const out = new Set<string>();
  const add = (id: string) => {
    if (out.has(id)) return;
    const t = TECHS.find((x) => x.id === id);
    if (!t) return;
    for (const r of t.requires ?? []) add(r);
    out.add(id);
  };
  for (const r of UNIT_BY_ID.get(unitId)!.requires ?? []) add(r);
  return [...out];
}

describe('army lines (M7.4)', () => {
  it('the Iron Age needs two of Temple / Government Center / Siege Workshop / Academy', () => {
    const t = world();
    for (const a of ['toolAge', 'bronzeAge']) completeResearch(t.w, 1, a);
    expect(researchBlocker(t.w, 1, t.slot('townCenter'), 'ironAge')).toBeNull();
    // Without them:
    const bare = Sim.create({ seed: 3, map: { w: 24, h: 24 }, players: [{ civ: 'greek' }], startingResources: 'deathmatch', victory: 'none', scenario: { buildings: [{ type: 'townCenter', owner: 1, tx: 5, ty: 5 }, { type: 'temple', owner: 1, tx: 12, ty: 5 }] } });
    for (const a of ['toolAge', 'bronzeAge']) completeResearch(bare.world, 1, a);
    let tc = -1;
    for (let s = 0; s < bare.world.ents.top; s++) if (bare.world.ents.type[s] === buildingTypeIndex('townCenter')) tc = s;
    expect(researchBlocker(bare.world, 1, tc, 'ironAge')).toMatch(/requires/);
  });

  // Every unit a land building lists becomes trainable once its age and techs are in (Greek: full land tree).
  const listed = BUILDINGS.filter((b) => LAND.includes(b.id)).flatMap((b) => (b.trains ?? []).map((u) => [b.id, u] as const));
  it.each(listed)('%s trains %s once its age and techs are researched', (bld, unit) => {
    const t = world(civFor(unit, techsFor(unit)));
    for (const a of AGES) completeResearch(t.w, 1, a);
    for (const tech of techsFor(unit)) if (!t.w.players[1]!.techs.includes(tech)) completeResearch(t.w, 1, tech);
    expect(trainBlocker(t.w, 1, t.slot(bld), unit)).toBeNull();
  });

  // Every unit-upgrade tech: research converts the field and later training produces the new type.
  const upgrades = TECHS.flatMap((tech) => tech.effects.filter((e) => e.op === 'upgrade' && e.kind === 'unit').map((e) => [tech.id, (e as { from: string }).from, (e as { to: string }).to] as const)).filter(([, from]) => !UNIT_BY_ID.get(from)!.tags.includes('ship'));
  it.each(upgrades)('%s upgrades %s → %s in the field and in production', (techId, from, to) => {
    const t = world(civFor(to, [techId]));
    for (const a of AGES) completeResearch(t.w, 1, a);
    const base = (() => {
      let b = from;
      while (UNIT_BY_ID.get(b)!.upgradeOf) b = UNIT_BY_ID.get(b)!.upgradeOf!;
      return b;
    })();
    for (const tech of [...techsFor(base), ...techsFor(to)]) if (!t.w.players[1]!.techs.includes(tech)) completeResearch(t.w, 1, tech);
    // Bring the line up to `from`, then field one of it.
    const chain: string[] = [];
    for (let u = from; UNIT_BY_ID.get(u)!.upgradeOf; u = UNIT_BY_ID.get(u)!.upgradeOf!) chain.unshift(u);
    for (const u of chain) {
      const tech = TECHS.find((x) => x.effects.some((e) => e.op === 'upgrade' && (e as { to: string }).to === u))!;
      for (const r of tech.requires ?? []) if (!t.w.players[1]!.techs.includes(r)) completeResearch(t.w, 1, r);
      if (!t.w.players[1]!.techs.includes(tech.id)) completeResearch(t.w, 1, tech.id);
    }
    const h = t.w.spawnUnit(unitTypeIndex(from), 1, 30.5, 30.5);
    for (const r of TECHS.find((x) => x.id === techId)!.requires ?? []) if (!t.w.players[1]!.techs.includes(r)) completeResearch(t.w, 1, r);
    completeResearch(t.w, 1, techId);
    expect(TYPES_ID(t.w.ents.type[t.w.ents.slotOf(h)]!)).toBe(to);
    expect(TYPES_ID(producedType(t.w, 1, base))).toBe(to);
  });
});

import { TYPES } from '../../src/sim/rules/registry.ts';
const TYPES_ID = (i: number) => TYPES[i]!.id;
