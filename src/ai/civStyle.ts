/**
 * Civilization strategies (M13.6): what each computer leans on, read from its bonuses (econ:6.1, `data/civs.ts`) —
 * archer civs build a second Archery Range, cavalry and elephant civs a second Stable, academy civs raise
 * hoplites early, and so on. Units a civ lacks are skipped where they are trained (the tree decides, econ:6.2).
 *   main: the arm it builds a second production building for and trains first.
 *   stable / range: preferred order of the units there (the first the civ has is trained).
 *   priests / siege: extra priests or siege engines on top of the level's.
 *   rush: multiplies the level's rush odds (the economy civs boom more).
 */
export type Arm = 'infantry' | 'archers' | 'riders' | 'hoplites';

export interface CivStyle {
  main: Arm;
  stable?: readonly string[];
  range?: readonly string[];
  priests?: number;
  siege?: number;
  rush?: number;
}

const HORSE = ['cavalry', 'scout'];
export const CIV_STYLE: Readonly<Record<string, CivStyle>> = {
  assyrian: { main: 'archers', range: ['chariotArcher', 'horseArcher', 'improvedBowman', 'bowman'] }, // archers fire faster
  babylonian: { main: 'infantry', priests: 1 }, // priests recharge faster
  carthaginian: { main: 'hoplites', stable: ['warElephant', 'cavalry', 'camel', 'scout'] }, // academy units and elephants +25% HP
  choson: { main: 'infantry', priests: 1 }, // long swordsmen +80 HP, cheap priests
  egyptian: { main: 'riders', stable: ['chariot', 'camel', 'scout'], range: ['chariotArcher', 'improvedBowman', 'bowman'], priests: 1 }, // chariots +33% HP, priest range
  greek: { main: 'hoplites' }, // academy units faster
  hittite: { main: 'archers', range: ['horseArcher', 'chariotArcher', 'improvedBowman', 'bowman'], siege: 1 }, // archers +1 attack, siege ×2 HP
  macedonian: { main: 'hoplites', siege: 1 }, // academy +2 pierce armour, siege half price
  minoan: { main: 'archers', range: ['improvedBowman', 'bowman'] }, // composite bowmen +2 range
  palmyran: { main: 'riders', stable: ['camel', ...HORSE], rush: 0.7 }, // camels faster, strong villagers
  persian: { main: 'riders', stable: ['warElephant', ...HORSE, 'camel'], range: ['elephantArcher', 'horseArcher', 'improvedBowman', 'bowman'] }, // elephants faster
  phoenician: { main: 'riders', stable: ['warElephant', ...HORSE, 'camel'] }, // elephants cheaper
  roman: { main: 'infantry' }, // swordsmen attack faster
  shang: { main: 'infantry', rush: 0.5 }, // cheap villagers: boom
  sumerian: { main: 'infantry', siege: 1, rush: 0.5 }, // stone throwers faster, rich farms: boom
  yamato: { main: 'riders', stable: [...HORSE, 'camel'], range: ['horseArcher', 'improvedBowman', 'bowman'] }, // mounted units cheaper
};

export const DEFAULT_STYLE: CivStyle = { main: 'infantry' };

export function styleOf(civ: string): CivStyle {
  return CIV_STYLE[civ] ?? DEFAULT_STYLE;
}
