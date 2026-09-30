import { describe, expect, it } from 'vitest';
import { CIVS, TECHS } from '../../src/data/index.ts';
import type { Effect } from '../../src/data/types.ts';
import { Sim } from '../../src/sim/index.ts';
import { compilePlayerStats, matches } from '../../src/sim/rules/playerStats.ts';
import { buildingTypeIndex, TYPES } from '../../src/sim/rules/registry.ts';
import { buildingAvailable } from '../../src/sim/systems/build.ts';
import { completeResearch, researchBlocker, trainBlocker } from '../../src/sim/systems/production.ts';

/**
 * M7.8: the sixteen civilizations (econ:6.1, econ:6.2). Every bonus changes what it names against a player with
 * no civilization bonuses, and every unit, building and technology missing from a civ's tree is refused.
 */
const NEUTRAL = compilePlayerStats('gaia');

/** Did `effect` change anything in `civ`'s compiled stats, compared with the neutral player? */
function effectShows(civ: string, e: Effect): boolean {
  const ps = compilePlayerStats(civ);
  if (e.op === 'attr') {
    const [head, tail] = String(e.attr).split('.');
    if (head === 'work' || head === 'carry') {
      if (!TYPES.some((t) => t.unit?.cls === 'villager' && matches(e.sel, t))) return false;
      const jobs = tail ? [tail] : Object.keys(ps.work);
      return jobs.some((j) => (head === 'work' ? ps.work : ps.carry)[j as keyof typeof ps.work] !== (head === 'work' ? NEUTRAL.work : NEUTRAL.carry)[j as keyof typeof ps.work]);
    }
    return TYPES.some((t) => matches(e.sel, t) && JSON.stringify(ps.types[t.index]) !== JSON.stringify(NEUTRAL.types[t.index]));
  }
  if (e.op === 'player') {
    if (String(e.attr).startsWith('start.')) return true; // checked on a live world below
    return (ps as unknown as Record<string, number>)[e.attr] !== (NEUTRAL as unknown as Record<string, number>)[e.attr];
  }
  if (e.op === 'flag') return ps.flags.has((e as { flag: string }).flag as never);
  return true;
}

describe('civilizations (M7.8)', () => {
  it('there are sixteen, each with bonuses described for the player', () => {
    expect(CIVS.length).toBe(16);
    for (const c of CIVS) {
      expect(c.bonuses.length, c.id).toBeGreaterThan(0);
      expect(c.bonusText.length, c.id).toBeGreaterThan(0);
    }
  });

  it.each(CIVS.map((c) => [c.id] as const))('%s: every bonus takes effect', (id) => {
    const civ = CIVS.find((c) => c.id === id)!;
    for (const e of civ.bonuses) expect(effectShows(id, e), `${id}: ${JSON.stringify(e)}`).toBe(true);
  });

  it('start.* bonuses change the starting stockpile (Shang)', () => {
    const shang = CIVS.find((c) => c.bonuses.some((e) => e.op === 'player' && String(e.attr).startsWith('start.')));
    expect(shang).toBeDefined();
    const start = (civ: string) => Sim.create({ seed: 1, map: { w: 16, h: 16 }, players: [{ civ }], scenario: { units: [], buildings: [] } }).world.players[1]!.res[0]!;
    expect(start(shang!.id)).not.toBe(start('greek'));
  });

  it.each(CIVS.map((c) => [c.id] as const))('%s: everything missing from its tree is refused', (id) => {
    const civ = CIVS.find((c) => c.id === id)!;
    const blds = ['townCenter', 'barracks', 'archeryRange', 'stable', 'academy', 'temple', 'siegeWorkshop', 'market', 'governmentCenter', 'granary', 'storagePit', 'dock'];
    const sim = Sim.create({
      seed: 1,
      map: { w: 80, h: 80, ascii: Array.from({ length: 80 }, (_, y) => (y < 70 ? '.'.repeat(80) : '~'.repeat(80))) },
      players: [{ civ: id }],
      startingResources: 'deathmatch',
      victory: 'none',
      scenario: { units: [], buildings: blds.map((b, i) => ({ type: b, owner: 1, tx: 2 + (i % 7) * 10, ty: b === 'dock' ? 68 : 2 + Math.floor(i / 7) * 10 })) },
    });
    const w = sim.world;
    for (const a of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(w, 1, a);
    const slotOf = (type: string) => {
      for (let s = 0; s < w.ents.top; s++) if (w.ents.alive[s] && w.ents.type[s] === buildingTypeIndex(type)) return s;
      return -1;
    };
    for (const u of civ.disabled.units) {
      const at = TYPES.find((t) => t.unit?.id === u)?.unit?.trainedAt;
      if (!at || slotOf(at) < 0) continue;
      expect(trainBlocker(w, 1, slotOf(at), u), `${id} ${u}`).toBe('not available to this civilization');
    }
    for (const b of civ.disabled.buildings) {
      const r = buildingAvailable(w, 1, buildingTypeIndex(b));
      expect(r.ok ? 'available' : r.reason, `${id} ${b}`).toBe('not available to this civilization');
    }
    for (const t of civ.disabled.techs) {
      const at = TECHS.find((x) => x.id === t)!.at;
      if (slotOf(at) < 0) continue;
      expect(researchBlocker(w, 1, slotOf(at), t), `${id} ${t}`).toBe('not available to this civilization');
    }
  });
});
