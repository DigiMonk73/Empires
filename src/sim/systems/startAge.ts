import { TECHS, civRules } from '../../data/index.ts';
import { STARTING_AGES, type StartingAge } from '../../data/setup.ts';
import { completeResearch } from './production.ts';
import type { World } from '../world.ts';

/**
 * Starting age (M14.3, econ:7): every player begins with the age advances researched — for Post-Iron also every
 * technology their civilization has (all of them in a Full Tech Tree game), in the order the tree allows. Units and buildings already on the map take
 * the upgrades. Happens before the first tick, so no messages or tallies record it.
 */
export function applyStartingAge(w: World, age: StartingAge | undefined): void {
  const def = STARTING_AGES.find((a) => a.id === (age ?? 'default'));
  if (!def || !def.techs.length) return;
  for (let p = 1; p < w.players.length; p++) {
    for (const t of def.techs) completeResearch(w, p, t);
    if (def.id === 'postIron') researchAll(w, p);
  }
  w.events.length = 0;
}

function researchAll(w: World, player: number): void {
  const pl = w.players[player]!;
  const disabled = civRules(pl.civ, w.fullTechTree).disabled.techs;
  for (let changed = true; changed; ) {
    changed = false;
    for (const t of TECHS) {
      if (pl.techs.includes(t.id) || disabled.includes(t.id) || t.age > pl.stats.age) continue;
      if ((t.requires ?? []).some((r) => !pl.techs.includes(r))) continue;
      completeResearch(w, player, t.id);
      changed = true;
    }
  }
}
