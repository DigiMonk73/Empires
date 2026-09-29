import { describe, expect, it } from 'vitest';
import { EKind, EntityStore } from '../../src/sim/core/entities.ts';
import { NO_ENTITY } from '../../src/sim/core/handles.ts';
import { ResourceStore } from '../../src/sim/core/resources.ts';
import { TileMap, Occ } from '../../src/sim/map/tilemap.ts';
import { buildingTypeIndex, resourceKindIndex, TYPES, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { MOVE_LAND, MOVE_WATER, terrainIndex } from '../../src/data/terrain.ts';

describe('EntityStore', () => {
  it('creates, destroys, recycles slots LIFO, and invalidates stale handles', () => {
    const s = new EntityStore(2);
    const a = s.create(EKind.unit, 0, 1, 1, 1);
    const b = s.create(EKind.unit, 0, 1, 2, 2);
    const c = s.create(EKind.unit, 0, 2, 3, 3); // forces growth past cap 2
    expect(s.cap).toBeGreaterThanOrEqual(3);
    expect(s.count).toBe(3);
    expect(s.x[s.slotOf(c)]).toBe(3);
    s.destroy(b);
    expect(s.valid(b)).toBe(false);
    s.destroy(a);
    const d = s.create(EKind.unit, 0, 1, 9, 9); // reuses a's slot (LIFO)
    expect(s.slotOf(d)).toBe(0);
    expect(s.valid(a)).toBe(false);
    expect(s.valid(d)).toBe(true);
    expect(d).not.toBe(a);
    expect(s.slotOf(NO_ENTITY)).toBe(-1);
    expect(s.count).toBe(2);
  });

  it('keeps data across growth', () => {
    const s = new EntityStore(4);
    const hs = Array.from({ length: 100 }, (_, i) => s.create(EKind.unit, 0, 1, i, -i));
    hs.forEach((h, i) => expect(s.y[s.slotOf(h)]).toBe(-i));
  });
});

describe('ResourceStore', () => {
  it('indexes nodes by chunk', () => {
    const r = new ResourceStore(40, 40, 2);
    const t = resourceKindIndex('tree');
    r.add(t, 1, 1, 75);
    r.add(t, 17, 1, 75);
    r.add(t, 17, 33, 75);
    expect(r.count).toBe(3);
    expect(r.chunks[r.chunkIndex(1, 1)]).toEqual([0]);
    expect(r.chunks[r.chunkIndex(17, 1)]).toEqual([1]);
    expect(r.chunks[r.chunkIndex(17, 33)]).toEqual([2]);
  });
});

describe('TileMap', () => {
  it('derives passability from terrain and occupancy', () => {
    const m = new TileMap(8, 8, terrainIndex('grass'));
    expect(m.passable(1, 1, MOVE_LAND)).toBe(true);
    expect(m.passable(1, 1, MOVE_WATER)).toBe(false);
    m.setTerrain(2, 2, terrainIndex('shallows'));
    expect(m.passable(2, 2, MOVE_LAND)).toBe(true);
    expect(m.passable(2, 2, MOVE_WATER)).toBe(true);
    const v = m.passVersion;
    m.setOcc(1, 1, Occ.resource, true);
    expect(m.passable(1, 1, MOVE_LAND)).toBe(false);
    expect(m.passVersion).toBeGreaterThan(v);
    m.setOcc(1, 1, Occ.resource, false);
    expect(m.passable(1, 1, MOVE_LAND)).toBe(true);
    expect(m.passable(-1, 0, MOVE_LAND)).toBe(false);
  });
});

describe('type registry', () => {
  it('compiles per-tick values and indexes all kinds', () => {
    const v = TYPES[unitTypeIndex('villager')]!;
    expect(v.speed).toBeCloseTo(1.1 / 20, 12);
    expect(v.moveClass).toBe(MOVE_LAND);
    expect(TYPES[unitTypeIndex('trireme')]!.moveClass).toBe(MOVE_WATER);
    expect(TYPES[unitTypeIndex('gazelle')]!.hp).toBe(8);
    expect(TYPES[buildingTypeIndex('townCenter')]!.size).toBe(3);
    expect(() => unitTypeIndex('nope')).toThrow();
  });
});
