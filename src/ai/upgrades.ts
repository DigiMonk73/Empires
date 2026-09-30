import type { AiLevel } from '../data/setup.ts';
import { TECH_BY_ID } from '../data/index.ts';
import type { Command } from '../sim/commands/types.ts';
import type { Snapshot } from './ai.ts';

/**
 * Economy and armour upgrades (M13.2). AI v1 researched only unit lines and ages, so every computer floated
 * thousands of resources by the Bronze Age (the M13.1 traces: ~3000 at 30 min) and the levels differed little.
 * Now each level follows the programme up to its tier — the easier computers research little, the harder ones
 * nearly everything (the original's harder AIs out-teched the easier ones) — from spare resources only: never
 * the food saved for the next age.
 */
interface Step {
  tech: string;
  tier: number;
  /** Worth it now (e.g. armour for a unit class we actually field). */
  when?: (c: Counts) => boolean;
}
interface Counts {
  infantry: number;
  archers: number;
  riders: number;
  farms: number;
  goldMiners: number;
  woodcutters: number;
}

const PROGRAMME: Step[] = [
  // Tool Age.
  { tech: 'woodworking', tier: 1, when: (c) => c.woodcutters >= 4 },
  { tech: 'domestication', tier: 1, when: (c) => c.farms >= 3 },
  { tech: 'toolworking', tier: 2, when: (c) => c.infantry + c.riders >= 3 },
  { tech: 'goldMining', tier: 2, when: (c) => c.goldMiners >= 3 },
  { tech: 'leatherArmorSoldiers', tier: 3, when: (c) => c.infantry >= 4 },
  { tech: 'leatherArmorArchers', tier: 3, when: (c) => c.archers >= 4 },
  { tech: 'leatherArmorCavalry', tier: 3, when: (c) => c.riders >= 4 },
  // Bronze Age.
  { tech: 'wheel', tier: 2 },
  { tech: 'plow', tier: 3, when: (c) => c.farms >= 5 },
  { tech: 'artisanship', tier: 3, when: (c) => c.woodcutters >= 5 },
  { tech: 'metalworking', tier: 3, when: (c) => c.infantry + c.riders >= 5 },
  { tech: 'bronzeShield', tier: 4, when: (c) => c.infantry >= 5 },
  { tech: 'scaleArmorSoldiers', tier: 4, when: (c) => c.infantry >= 5 },
  { tech: 'scaleArmorArchers', tier: 4, when: (c) => c.archers >= 5 },
  { tech: 'scaleArmorCavalry', tier: 4, when: (c) => c.riders >= 5 },
  { tech: 'nobility', tier: 4, when: (c) => c.riders >= 5 },
  // Iron Age.
  { tech: 'metallurgy', tier: 4, when: (c) => c.infantry + c.riders >= 6 },
  { tech: 'chainMailSoldiers', tier: 4, when: (c) => c.infantry >= 6 },
  { tech: 'chainMailArchers', tier: 4, when: (c) => c.archers >= 6 },
  { tech: 'chainMailCavalry', tier: 4, when: (c) => c.riders >= 6 },
  { tech: 'irrigation', tier: 4, when: (c) => c.farms >= 6 },
  { tech: 'craftsmanship', tier: 4, when: (c) => c.woodcutters >= 6 },
  { tech: 'coinage', tier: 4, when: (c) => c.goldMiners >= 4 },
  { tech: 'alchemy', tier: 4, when: (c) => c.archers >= 6 },
];

/** How far down the programme each level goes. */
export const UPGRADE_TIER: Record<AiLevel, number> = { easiest: 0, easy: 1, moderate: 2, hard: 3, hardest: 4 };

const INFANTRY = new Set(['infantry', 'hoplite', 'slinger']);
const ARCHERS = new Set(['footArcher', 'mountedArcher']);
const RIDERS = new Set(['scout', 'cavalry', 'camel', 'chariot', 'elephant']);

/**
 * At most one research per think: the first affordable step of the programme whose building is idle. `reserveFood`
 * is what must be left over (the next age's price while saving for it).
 */
export function upgrades(s: Snapshot, level: AiLevel, reserveFood: number, cmds: Command[]): void {
  const tier = UPGRADE_TIER[level];
  if (tier === 0) return;
  const c: Counts = { infantry: 0, archers: 0, riders: 0, farms: 0, goldMiners: s.working[2], woodcutters: s.working[1] };
  for (const u of s.units) {
    if (INFANTRY.has(u.cls)) c.infantry++;
    else if (ARCHERS.has(u.cls)) c.archers++;
    else if (RIDERS.has(u.cls)) c.riders++;
  }
  c.farms = s.buildings.filter((b) => b.kind === 'farm' && b.done).length;
  const res = s.me.res;
  for (const step of PROGRAMME) {
    if (step.tier > tier || s.me.techs.includes(step.tech) || s.v.researching(step.tech)) continue;
    const def = TECH_BY_ID.get(step.tech);
    if (!def || def.age > s.me.age) continue;
    if (step.when && !step.when(c)) continue;
    const b = s.buildings.find((x) => x.type === def.at && x.done && x.queue === 0);
    if (!b || s.v.researchBlocker(b.h, step.tech)) continue;
    const cost = def.cost as Partial<Record<string, number>>;
    if (res[0]! - (cost.food ?? 0) < reserveFood + 100) continue;
    if (res[1]! - (cost.wood ?? 0) < 75 || res[2]! - (cost.gold ?? 0) < 0 || res[3]! - (cost.stone ?? 0) < 0) continue;
    cmds.push({ t: 'research', bld: b.h, tech: step.tech });
    return;
  }
}
