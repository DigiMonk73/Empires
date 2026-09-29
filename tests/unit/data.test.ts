import { describe, expect, it } from 'vitest';
import {
  ANIMALS, BUILDING_BY_ID, BUILDINGS, CIV_BY_ID, CIVS, RESOURCE_OBJECTS, TECH_BY_ID, TECHS, UNIT_BY_ID, UNITS,
  type Effect, type Selector, type Sourced,
} from '../../src/data/index.ts';
import { CIV_ORDER, TECH_TREE_MATRIX } from '../../src/data/civs.ts';
import { ARMOR_CLASS } from '../../src/data/types.ts';

const ALL_SOURCED: Sourced[] = [...UNITS, ...BUILDINGS, ...TECHS, ...CIVS, ...RESOURCE_OBJECTS, ...ANIMALS];
const CLASSES = new Set(UNITS.map((u) => u.cls));
const TAGS = new Set(UNITS.flatMap((u) => u.tags));
const KINDS = new Set(BUILDINGS.map((b) => b.kind));

function checkSelector(sel: Selector, where: string): string[] {
  const errs: string[] = [];
  for (const c of sel.classes ?? []) if (!CLASSES.has(c)) errs.push(`${where}: unknown class ${c}`);
  for (const t of sel.tags ?? []) if (!TAGS.has(t)) errs.push(`${where}: unknown tag ${t}`);
  for (const u of sel.units ?? []) if (!UNIT_BY_ID.has(u)) errs.push(`${where}: unknown unit ${u}`);
  for (const b of sel.buildings ?? []) if (!BUILDING_BY_ID.has(b)) errs.push(`${where}: unknown building ${b}`);
  for (const k of sel.buildingKinds ?? []) if (!KINDS.has(k)) errs.push(`${where}: unknown building kind ${k}`);
  if (!sel.classes?.length && !sel.tags?.length && !sel.units?.length && !sel.buildings?.length && !sel.buildingKinds?.length) {
    errs.push(`${where}: empty selector`);
  }
  return errs;
}

function checkEffect(e: Effect, where: string): string[] {
  switch (e.op) {
    case 'attr': {
      const errs = checkSelector(e.sel, where);
      const [head, tail] = e.attr.split('.');
      if ((head === 'atk' || head === 'arm') && !(tail! in ARMOR_CLASS)) errs.push(`${where}: unknown armor class in ${e.attr}`);
      return errs;
    }
    case 'upgrade': {
      const reg = e.kind === 'unit' ? UNIT_BY_ID : BUILDING_BY_ID;
      return [e.from, e.to].filter((id) => !reg.has(id)).map((id) => `${where}: unknown ${e.kind} ${id}`);
    }
    case 'enable':
      return (e.kind === 'unit' ? UNIT_BY_ID : BUILDING_BY_ID).has(e.id) ? [] : [`${where}: unknown ${e.kind} ${e.id}`];
    default:
      return [];
  }
}

describe('game data integrity', () => {
  it('every definition cites a research source', () => {
    const bad = ALL_SOURCED.filter((d) => !/^(econ|mil):[0-9]/.test(d.src)).map((d) => (d as { id?: string }).id);
    expect(bad).toEqual([]);
  });

  it('reports unresolved (verify) values — must stay ≤ 25% of rows at M0', () => {
    const flagged = ALL_SOURCED.filter((d) => d.verify).length;
    expect(flagged / ALL_SOURCED.length).toBeLessThan(0.25);
  });

  it('unit references resolve', () => {
    const errs: string[] = [];
    for (const u of UNITS) {
      if (u.trainedAt && !BUILDING_BY_ID.has(u.trainedAt)) errs.push(`${u.id}: trainedAt ${u.trainedAt}`);
      if (u.upgradeOf && !UNIT_BY_ID.has(u.upgradeOf)) errs.push(`${u.id}: upgradeOf ${u.upgradeOf}`);
      for (const t of u.requires ?? []) if (!TECH_BY_ID.has(t)) errs.push(`${u.id}: requires ${t}`);
      for (const k of [...Object.keys(u.atk), ...Object.keys(u.arm)]) if (!(k in ARMOR_CLASS)) errs.push(`${u.id}: class ${k}`);
      if (u.hp <= 0 || u.speed <= 0 || u.los <= 0) errs.push(`${u.id}: non-positive hp/speed/los`);
      if (u.range > 0 && u.reload <= 0 && u.cls !== 'priest') errs.push(`${u.id}: ranged unit without reload`);
    }
    expect(errs).toEqual([]);
  });

  it('building references resolve', () => {
    const errs: string[] = [];
    for (const b of BUILDINGS) {
      for (const u of b.trains ?? []) {
        const def = UNIT_BY_ID.get(u);
        if (!def) errs.push(`${b.id}: trains ${u}`);
        else if (def.trainedAt !== b.id) errs.push(`${b.id}: trains ${u} but ${u}.trainedAt = ${def.trainedAt}`);
      }
      for (const r of b.requiresBuilding ?? []) if (!BUILDING_BY_ID.has(r)) errs.push(`${b.id}: requiresBuilding ${r}`);
      for (const t of b.requires ?? []) if (!TECH_BY_ID.has(t)) errs.push(`${b.id}: requires ${t}`);
    }
    expect(errs).toEqual([]);
  });

  it('every trainable base unit appears in its building command list', () => {
    const missing = UNITS.filter((u) => u.trainedAt && !u.upgradeOf)
      .filter((u) => !BUILDING_BY_ID.get(u.trainedAt!)!.trains?.includes(u.id))
      .map((u) => `${u.id}@${u.trainedAt}`);
    expect(missing).toEqual([]);
  });

  it('tech references resolve and effects are well-formed', () => {
    const errs: string[] = [];
    for (const t of TECHS) {
      if (!BUILDING_BY_ID.has(t.at)) errs.push(`${t.id}: at ${t.at}`);
      for (const r of t.requires ?? []) if (!TECH_BY_ID.has(r)) errs.push(`${t.id}: requires ${r}`);
      for (const r of t.requiresAnyBuildings?.of ?? []) if (!BUILDING_BY_ID.has(r)) errs.push(`${t.id}: requiresAnyBuildings ${r}`);
      t.effects.forEach((e, i) => errs.push(...checkEffect(e, `${t.id}#${i}`)));
      if (!t.effects.length) errs.push(`${t.id}: no effects`);
    }
    for (const c of CIVS) c.bonuses.forEach((e, i) => errs.push(...checkEffect(e, `${c.id}#${i}`)));
    expect(errs).toEqual([]);
  });

  it('tech prerequisite graph is acyclic and respects ages', () => {
    const state = new Map<string, 'visiting' | 'done'>();
    const cycle: string[] = [];
    const visit = (id: string, path: string[]): void => {
      if (state.get(id) === 'done') return;
      if (state.get(id) === 'visiting') {
        cycle.push([...path, id].join(' → '));
        return;
      }
      state.set(id, 'visiting');
      for (const r of TECH_BY_ID.get(id)!.requires ?? []) visit(r, [...path, id]);
      state.set(id, 'done');
    };
    for (const t of TECHS) visit(t.id, []);
    expect(cycle).toEqual([]);
    const ageViolations = TECHS.flatMap((t) =>
      (t.requires ?? []).filter((r) => TECH_BY_ID.get(r)!.age > t.age).map((r) => `${t.id} (age ${t.age}) requires ${r}`),
    );
    expect(ageViolations).toEqual([]);
  });

  it('unit upgrade techs match unit upgrade chains', () => {
    const errs: string[] = [];
    for (const t of TECHS) {
      for (const e of t.effects) {
        if (e.op !== 'upgrade' || e.kind !== 'unit') continue;
        const to = UNIT_BY_ID.get(e.to)!;
        if (to.upgradeOf !== e.from) errs.push(`${t.id}: ${e.from} → ${e.to} but ${e.to}.upgradeOf = ${to.upgradeOf}`);
      }
    }
    // Every unit with upgradeOf has exactly one tech producing it.
    for (const u of UNITS.filter((x) => x.upgradeOf)) {
      const n = TECHS.filter((t) => t.effects.some((e) => e.op === 'upgrade' && e.kind === 'unit' && e.to === u.id)).length;
      if (n !== 1) errs.push(`${u.id}: ${n} techs upgrade to it`);
    }
    expect(errs).toEqual([]);
  });

  it('civilization tech-tree matrix is well-formed and resolves', () => {
    expect(CIVS.map((c) => c.id)).toEqual([...CIV_ORDER]);
    const errs: string[] = [];
    for (const [kind, ids, row] of TECH_TREE_MATRIX) {
      if (!/^[Y-]{16}$/.test(row)) errs.push(`bad row for ${String(ids)}: ${row}`);
      const reg = kind === 'units' ? UNIT_BY_ID : kind === 'buildings' ? BUILDING_BY_ID : TECH_BY_ID;
      for (const id of typeof ids === 'string' ? [ids] : ids) if (!reg.has(id)) errs.push(`matrix ${kind} ${id} unknown`);
    }
    expect(errs).toEqual([]);
  });

  it('spot-checks known facts from the research', () => {
    // mil:1a / econ:1.2
    expect(UNIT_BY_ID.get('villager')).toMatchObject({ hp: 25, speed: 1.1, trainTime: 20, cost: { food: 50 } });
    expect(UNIT_BY_ID.get('legion')).toMatchObject({ hp: 160, atk: { melee: 13 } });
    expect(UNIT_BY_ID.get('chariotArcher')?.convResist).toBe(8);
    // econ:3
    expect(TECH_BY_ID.get('ironAge')?.cost).toEqual({ food: 1000, gold: 800 });
    expect(TECH_BY_ID.get('toolAge')?.requiresAnyBuildings?.of).toContain('dock');
    // econ:4
    expect(BUILDING_BY_ID.get('townCenter')).toMatchObject({ hp: 600, size: 3, popProvided: 4, cost: { wood: 200 } });
    expect(BUILDING_BY_ID.get('wonder')?.buildTime).toBe(8000);
    // econ:6.2 — famous gaps
    expect(CIV_BY_ID.get('persian')?.disabled.buildings).toContain('academy');
    expect(CIV_BY_ID.get('greek')?.disabled.units).toContain('chariot');
    expect(CIV_BY_ID.get('macedonian')?.disabled.buildings).toContain('temple');
    expect(CIV_BY_ID.get('assyrian')?.disabled.units).toContain('slinger');
    expect(CIV_BY_ID.get('egyptian')?.disabled.units).toContain('cavalry');
    expect(CIV_BY_ID.get('roman')?.disabled.techs).toContain('compositeBow');
  });
});
