import { TECH_BY_ID } from '../data/index.ts';

/**
 * Tech icons (M9.7), as `model#variant` for iconStyle. The lines below use the baked still lifes in
 * art/models/icons.ts (variant = position in the line); an age advance shows the Town Center it builds; a tech that
 * brings or upgrades a unit or building shows that unit or building.
 */
const LINES: Record<string, readonly string[]> = {
  iconForge: ['toolworking', 'metalworking', 'metallurgy'],
  iconArmor: ['leatherArmorSoldiers', 'leatherArmorArchers', 'leatherArmorCavalry', 'scaleArmorSoldiers', 'scaleArmorArchers', 'scaleArmorCavalry', 'chainMailSoldiers', 'chainMailArchers', 'chainMailCavalry'],
  iconShield: ['bronzeShield', 'ironShield', 'towerShield'],
  iconAxe: ['woodworking', 'artisanship', 'craftsmanship'],
  iconGold: ['goldMining', 'coinage'],
  iconStone: ['stoneMining', 'siegecraft'],
  iconFarm: ['domestication', 'plow', 'irrigation'],
  iconWheel: ['wheel'],
  iconFaith: ['astrology', 'mysticism', 'polytheism', 'afterlife', 'monotheism', 'fanaticism', 'jihad', 'medicine', 'martyrdom'],
  iconGov: ['nobility', 'writing', 'architecture', 'logistics', 'aristocracy', 'ballistics', 'alchemy', 'engineering'],
};
const FIXED = new Map(Object.entries(LINES).flatMap(([model, techs]) => techs.map((t, i) => [t, `${model}#${i}`] as const)));

export function techIcon(id: string): string | null {
  const fixed = FIXED.get(id);
  if (fixed) return fixed;
  for (const e of TECH_BY_ID.get(id)?.effects ?? []) {
    if (e.op === 'age') return `townCenter#${e.age - 1}`;
    if (e.op === 'upgrade') return e.to;
    if (e.op === 'enable') return e.id;
  }
  return null;
}
