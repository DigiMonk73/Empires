import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { TECHS } from '../../src/data/index.ts';
import { unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { researchBlocker, trainBlocker } from '../../src/sim/systems/production.ts';
import { DEFAULT_SETUP, setupFromQuery, setupToQuery, skirmishConfig } from '../../src/game/skirmish.ts';
import { techTree } from '../../src/ui/techTree.ts';

/** Assyrian (no slingers, no Phalanx), Shang (cheap villagers, −40 food), Carthaginian (Fire Galleys +6). */
function game(full: boolean, startingAge?: 'postIron') {
  return Sim.create({
    seed: 9,
    map: { w: 40, h: 40, ascii: Array.from({ length: 40 }, (_, y) => (y < 30 ? '.'.repeat(40) : '~'.repeat(40))) },
    players: [{ civ: 'assyrian' }, { civ: 'shang' }, { civ: 'carthaginian' }],
    ...(full ? { fullTechTree: true } : {}),
    ...(startingAge ? { startingAge } : {}),
    scenario: {
      buildings: [
        { type: 'barracks', owner: 1, tx: 4, ty: 4 },
        { type: 'academy', owner: 1, tx: 10, ty: 4 },
        { type: 'townCenter', owner: 2, tx: 20, ty: 4 },
        { type: 'dock', owner: 3, tx: 20, ty: 28 },
      ],
    },
  });
}
const slotAt = (sim: Sim, tx: number, ty: number) => sim.world.ents.slotOf(sim.world.map.bldAt[sim.world.map.idx(tx, ty)]! - 1);

describe('Full Tech Tree (M14.4, econ:6.4)', () => {
  it('every civilization gets what its tree lacks', () => {
    for (const full of [false, true]) {
      const sim = game(full);
      const why = trainBlocker(sim.world, 1, slotAt(sim, 4, 4), 'slinger');
      expect(why === 'not available to this civilization', `full ${full}`).toBe(!full);
      const t = researchBlocker(sim.world, 1, slotAt(sim, 10, 4), 'phalanx');
      expect(t === 'not available to this civilization', `full ${full}`).toBe(!full);
    }
    const tree = techTree('assyrian', game(true).world, 1);
    expect(tree.flatMap((c) => c.ages.flat()).filter((i) => i.state === 'missing').map((i) => i.id)).toEqual(['fireGalley']);
  });

  it('removes every civilization bonus, starting stockpiles included', () => {
    const [plain, full] = [game(false).world, game(true).world];
    const vil = unitTypeIndex('villager');
    expect(plain.players[2]!.stats.types[vil]!.cost[0]).toBe(40);
    expect(full.players[2]!.stats.types[vil]!.cost[0]).toBe(50);
    expect([plain.players[2]!.res[0], full.players[2]!.res[0]]).toEqual([160, 200]);
    const bow = unitTypeIndex('bowman');
    expect(full.players[1]!.stats.types[bow]!.reloadTicks).toBe(full.players[2]!.stats.types[bow]!.reloadTicks);
    expect(plain.players[1]!.stats.types[bow]!.reloadTicks).toBeLessThan(plain.players[2]!.stats.types[bow]!.reloadTicks);
  });

  it('nobody has the Fire Galley', () => {
    for (const full of [false, true]) {
      const sim = game(full, 'postIron');
      const why = trainBlocker(sim.world, 3, slotAt(sim, 20, 28), 'fireGalley');
      expect(why === 'not available to this civilization', `full ${full}`).toBe(full);
    }
  });

  it('Post-Iron with Full Tech Tree researches the whole tree; a save keeps the rules', () => {
    const sim = game(true, 'postIron');
    for (const p of [1, 2, 3]) expect(sim.world.players[p]!.techs.length, `player ${p}`).toBe(TECHS.length);
    const back = Sim.deserialize(sim.serialize());
    expect(back.world.fullTechTree).toBe(true);
    expect(back.world.players[2]!.stats.types[unitTypeIndex('villager')]!.cost[0]).toBe(50);
    expect(back.hash()).toBe(sim.hash());
  });

  it('the skirmish setup carries it', () => {
    const s = { ...DEFAULT_SETUP, fullTech: true };
    const back = setupFromQuery(new URLSearchParams(setupToQuery(s)));
    expect(back.fullTech).toBe(true);
    expect(skirmishConfig(back).fullTechTree).toBe(true);
    expect(skirmishConfig(DEFAULT_SETUP).fullTechTree).toBeUndefined();
  });
});
