import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { techTree, TREE_BUILDINGS } from '../../src/ui/techTree.ts';

const find = (cols: ReturnType<typeof techTree>, id: string) => cols.flatMap((c) => c.ages.flat()).find((i) => i.id === id)!;

describe('tech tree (M7.9)', () => {
  it('lays every land building out by age with its units and technologies', () => {
    const cols = techTree('greek');
    expect(cols.map((c) => c.building)).toEqual([...TREE_BUILDINGS]);
    expect(find(cols, 'battleAxe').age).toBe(2);
    expect(find(cols, 'legion').age).toBe(4);
    expect(cols.find((c) => c.building === 'barracks')!.ages[4]!.some((i) => i.id === 'longSwordsman')).toBe(true);
  });

  it('marks what a civilization lacks (Greeks have no chariots)', () => {
    const cols = techTree('greek');
    expect(find(cols, 'chariot').state).toBe('missing');
    expect(find(cols, 'hoplite').state).not.toBe('missing');
    expect(find(techTree('egyptian'), 'chariot').state).not.toBe('missing');
  });

  it('marks out of reach what needs a technology the civilization lacks (M15.10 P13)', () => {
    // The original's quirks, kept (econ:6.2): Babylonians list the Armored Elephant but lack its Iron Shield,
    // Persians list Irrigation but lack its Plow — never researchable, so never shown as obtainable.
    expect(find(techTree('babylonian'), 'ironShield').state).toBe('missing');
    expect(find(techTree('babylonian'), 'armoredElephant').state).toBe('missing');
    expect(find(techTree('persian'), 'irrigation').state).toBe('missing');
    expect(find(techTree('persian'), 'armoredElephant').state).not.toBe('missing');
    expect(find(techTree('greek'), 'irrigation').state).not.toBe('missing');
  });

  it('follows a live player: researched, built, trainable now, later', () => {
    const sim = Sim.create({ seed: 1, map: { w: 32, h: 32 }, players: [{ civ: 'greek' }], startingResources: 'deathmatch', victory: 'none', scenario: { units: [], buildings: [{ type: 'townCenter', owner: 1, tx: 4, ty: 4 }, { type: 'barracks', owner: 1, tx: 12, ty: 4 }] } });
    const w = sim.world;
    completeResearch(w, 1, 'toolAge');
    completeResearch(w, 1, 'battleAxe');
    const cols = techTree('greek', w, 1);
    expect(find(cols, 'battleAxe').state).toBe('done');
    expect(find(cols, 'barracks').state).toBe('done');
    expect(find(cols, 'axeman').state).toBe('done'); // what the barracks trains now
    expect(find(cols, 'clubman').state).toBe('now'); // the line has moved past it
    expect(find(cols, 'bronzeAge').state).toBe('now');
    expect(find(cols, 'centurion').state).toBe('later');
  });
});

describe('tech tree: what a missing technology puts out of reach', () => {
  it('units a civilization can never get show as missing (the tech, the line or an enabling tech is absent)', () => {
    const cols = techTree('greek');
    for (const t of ['broadSword', 'longSword', 'legion', 'improvedBow']) expect(find(cols, t).state).toBe('missing');
    for (const u of ['broadSwordsman', 'longSwordsman', 'legion', 'improvedBowman', 'compositeBowman', 'scytheChariot']) expect(find(cols, u).state, u).toBe('missing');
    expect(find(cols, 'shortSwordsman').state).not.toBe('missing');
  });
});
