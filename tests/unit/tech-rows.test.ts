import { describe, expect, it } from 'vitest';
import { CIVS, TECHS } from '../../src/data/index.ts';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex } from '../../src/sim/rules/registry.ts';
import { compilePlayerStats } from '../../src/sim/rules/playerStats.ts';
import { completeResearch, researchBlocker } from '../../src/sim/systems/production.ts';

/**
 * M7 exit: every research row can be researched where the data says, once its age and prerequisites are met (for
 * a civilization that has it), and doing so changes what it declares: stats, a player value, a flag, an enabled
 * building/unit or an upgrade. Ages are covered by the research tests; ship techs belong to M8.
 */
const AGE_TECH = ['', '', 'toolAge', 'bronzeAge', 'ironAge'];
const DOCK = new Set(['dock']);

function prereqs(id: string, out = new Set<string>()): Set<string> {
  const t = TECHS.find((x) => x.id === id)!;
  for (const r of t.requires ?? []) {
    prereqs(r, out);
    out.add(r);
  }
  return out;
}

const rows = TECHS.filter((t) => !t.effects.some((e) => e.op === 'age') && !DOCK.has(t.at));

describe('every research row (M7)', () => {
  it.each(rows.map((t) => [t.id, t.at] as const))('%s: researchable at the %s, and it takes effect', (id, at) => {
    const tech = TECHS.find((x) => x.id === id)!;
    const need = prereqs(id);
    const civ = CIVS.find((c) => !c.disabled.techs.includes(id) && ![...need].some((r) => c.disabled.techs.includes(r)));
    expect(civ, 'some civilization has it').toBeDefined();
    const blds = [...new Set([at, ...[...need].map((r) => TECHS.find((x) => x.id === r)!.at), 'townCenter', 'market', 'governmentCenter', 'temple', 'siegeWorkshop', 'academy'])];
    const sim = Sim.create({ seed: 1, map: { w: 80, h: 80 }, players: [{ civ: civ!.id }], startingResources: 'deathmatch', victory: 'none', scenario: { buildings: blds.map((b, i) => ({ type: b, owner: 1, tx: 2 + (i % 7) * 10, ty: 2 + Math.floor(i / 7) * 10 })) } });
    const w = sim.world;
    for (let a = 2; a <= tech.age; a++) completeResearch(w, 1, AGE_TECH[a]!);
    for (const r of need) if (!w.players[1]!.techs.includes(r)) completeResearch(w, 1, r);
    let b = -1;
    for (let s = 0; s < w.ents.top; s++) if (w.ents.alive[s] && w.ents.type[s] === buildingTypeIndex(at)) b = s;
    expect(researchBlocker(w, 1, b, id)).toBeNull();
    const before = JSON.stringify(serialStats(w.players[1]!.stats));
    completeResearch(w, 1, id);
    expect(JSON.stringify(serialStats(w.players[1]!.stats))).not.toBe(before);
  });
});

/** Everything a tech can change, in a comparable form. */
function serialStats(p: ReturnType<typeof compilePlayerStats>) {
  return { types: p.types, work: p.work, carry: p.carry, farmFood: p.farmFood, faithRegen: p.faithRegen, healRate: p.healRate, conversionRate: p.conversionRate, tributeFee: p.tributeFee, goldYield: p.goldYield, flags: [...p.flags], enabled: [...p.enabled], upgrades: [...p.upgrades] };
}
