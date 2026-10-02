import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { techTree, TREE_BUILDINGS } from '../../src/ui/techTree.ts';
import { computeCommands } from '../../src/ui/commands.ts';

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

  it('marks an upgrade out of reach when the civilization lacks the unit it upgrades (M15.10 P22)', () => {
    const tech = (civ: string, id: string) => techTree(civ).flatMap((c) => c.ages.flat()).find((i) => i.id === id && i.kind === 'tech')!.state;
    expect(tech('yamato', 'armoredElephant')).toBe('missing'); // Yamato have no War Elephants
    expect(tech('persian', 'armoredElephant')).not.toBe('missing');
  });

  it('marks walls and towers out of reach when the civilization lacks the upgrade that makes them (M15.10 P43)', () => {
    // econ:6.2: Romans have no Guard or Ballista Tower, Carthaginians no Fortification, Persians no Ballista Tower.
    const b = (civ: string, id: string) => techTree(civ).flatMap((c) => c.ages.flat()).find((i) => i.id === id && i.kind === 'building')!.state;
    expect(b('roman', 'guardTower')).toBe('missing');
    expect(b('roman', 'ballistaTower')).toBe('missing');
    expect(b('carthaginian', 'fortification')).toBe('missing');
    expect(b('persian', 'ballistaTower')).toBe('missing');
    expect(b('greek', 'guardTower')).not.toBe('missing');
    expect(b('greek', 'fortification')).not.toBe('missing');
  });

  it('marks a unit out of reach when the civilization lacks the building that trains it (M15.10 P46)', () => {
    const u = (civ: string, id: string) => techTree(civ).flatMap((c) => c.ages.flat()).find((i) => i.id === id && i.kind === 'unit')!.state;
    expect(u('macedonian', 'priest')).toBe('missing'); // no Temple
    expect(u('persian', 'hoplite')).toBe('missing'); // no Academy
    expect(u('greek', 'hoplite')).not.toBe('missing');
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

describe('command grid reach (M15.10 P47)', () => {
  it('never offers a technology whose prerequisite the civilization lacks', () => {
    const offers = (civ: string, bld: string, tech: string) => {
      const sim = Sim.create({ seed: 1, map: { w: 32, h: 32 }, players: [{ civ }], startingResources: 'deathmatch', victory: 'none', scenario: { units: [], buildings: [{ type: bld, owner: 1, tx: 8, ty: 8 }] } });
      for (const t of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(sim.world, 1, t);
      const e = sim.world.ents;
      let h = -1;
      for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === 1) h = e.handleOf(s);
      return computeCommands(sim.world, 1, [h], 'main').some((c) => c.id === `research:${tech}`);
    };
    expect(offers('babylonian', 'stable', 'armoredElephant')).toBe(false); // no Iron Shield, ever
    expect(offers('persian', 'market', 'irrigation')).toBe(false); // no Plow, ever
    expect(offers('persian', 'stable', 'armoredElephant')).toBe(true);
    expect(offers('greek', 'market', 'irrigation')).toBe(true);
  });

  it('a research button says what the technology does (M15.10 P45)', () => {
    const sim = Sim.create({ seed: 1, map: { w: 32, h: 32 }, players: [{ civ: 'greek' }], startingResources: 'deathmatch', victory: 'none', scenario: { units: [], buildings: [{ type: 'governmentCenter', owner: 1, tx: 8, ty: 8 }] } });
    for (const t of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(sim.world, 1, t);
    const e = sim.world.ents;
    let h = -1;
    for (let s = 0; s < e.top; s++) if (e.alive[s]) h = e.handleOf(s);
    const alchemy = computeCommands(sim.world, 1, [h], 'main').find((c) => c.id === 'research:alchemy')!;
    expect(alchemy.desc).toMatch(/Missile units, towers and siege \+1 attack/);
  });
});
