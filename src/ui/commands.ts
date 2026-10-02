import { BUILDINGS, TECHS, TECH_BY_ID, UNIT_BY_ID } from '../data/index.ts';
import { tradeGood } from '../sim/systems/trade.ts';
import { EKind } from '../sim/core/entities.ts';
import { TYPES, buildingTypeIndex } from '../sim/rules/registry.ts';
import { buildingAvailable, shortfall } from '../sim/systems/build.ts';
import { isVillager } from '../sim/systems/gather.ts';
import { MAX_QUEUE, currentBuilding, producedType, researchBlocker, trainBlocker } from '../sim/systems/production.ts';
import type { World } from '../sim/world.ts';
import { techIcon } from './techIcons.ts';

/**
 * The command grid's view-model: which buttons the current selection offers, with hotkeys (the original's
 * letters — mil:5), costs, and why a button is disabled.
 */
export type Action =
  | { kind: 'buildMenu' }
  | { kind: 'back' }
  | { kind: 'place'; building: string }
  | { kind: 'train'; bld: number; unit: string }
  | { kind: 'research'; bld: number; tech: string }
  | { kind: 'stance'; stand: boolean }
  | { kind: 'attackMove' }
  | { kind: 'repair' }
  | { kind: 'unload' }
  | { kind: 'tradeGood'; good: number }
  | { kind: 'stop' };

export interface CommandButton {
  id: string;
  label: string;
  hotkey: string;
  /** Baked model to draw as the icon (if baked), else `glyph` or the label's initials. */
  icon: string | null;
  glyph?: string;
  cost: [number, number, number, number] | null;
  disabled: string | null;
  action: Action;
}

/** Villager build menu hotkeys (B then letter) — mil:5. */
export const BUILD_KEYS: Record<string, string> = {
  house: 'E',
  granary: 'G',
  storagePit: 'S',
  barracks: 'B',
  dock: 'D',
  townCenter: 'N',
  market: 'M',
  archeryRange: 'A',
  stable: 'L',
  farm: 'F',
  governmentCenter: 'C',
  temple: 'P',
  siegeWorkshop: 'K',
  academy: 'Y',
  wonder: 'O',
  smallWall: 'W',
  watchTower: 'T',
};

/** Unit training hotkeys per building (mil:5). */
export const TRAIN_KEYS: Record<string, string> = {
  villager: 'C',
  clubman: 'T', slinger: 'L', shortSwordsman: 'Z',
  bowman: 'T', improvedBowman: 'A', chariotArcher: 'R', horseArcher: 'C', elephantArcher: 'E',
  scout: 'T', chariot: 'R', cavalry: 'C', camel: 'L', warElephant: 'E',
  hoplite: 'T', priest: 'T', stoneThrower: 'C', ballista: 'B',
  // Dock: the research lists F / R / T / E / G without saying which is which — this mapping is ours (unverified).
  fishingBoat: 'F', tradeBoat: 'R', lightTransport: 'T', scoutShip: 'G', catapultTrireme: 'E',
};

export function computeCommands(w: World, player: number, selected: readonly number[], page: 'main' | 'build'): CommandButton[] {
  const e = w.ents;
  const own = selected.map((h) => e.slotOf(h)).filter((s) => s >= 0 && e.owner[s] === player);
  const villagers = own.filter((s) => e.kind[s] === EKind.unit && isVillager(w, s));
  const units = own.filter((s) => e.kind[s] === EKind.unit);
  const p = w.players[player]!;
  const out: CommandButton[] = [];
  if (villagers.length && page === 'build') {
    for (const b of BUILDINGS) {
      const key = BUILD_KEYS[b.id];
      if (!key) continue;
      // Walls and towers: one button per line, showing the level research has reached (Wall → Fortification).
      const cur = currentBuilding(w, player, b.id);
      const ti = buildingTypeIndex(cur);
      const avail = buildingAvailable(w, player, ti);
      if (!avail.ok && (avail.reason.startsWith('requires') ? p.stats.age + 1 < b.age : true)) continue; // hide far-future/disabled
      const cost = w.stats(player, ti).cost;
      out.push({
        id: `build:${b.id}`,
        label: TYPES[ti]!.building!.name,
        hotkey: key,
        icon: cur,
        cost: [...cost] as [number, number, number, number],
        disabled: !avail.ok ? avail.reason : shortfall(w, player, cost),
        action: { kind: 'place', building: b.id },
      });
    }
    out.push({ id: 'back', label: 'Back', hotkey: 'Escape', icon: null, glyph: '↩', cost: null, disabled: null, action: { kind: 'back' } });
    return out;
  }
  if (villagers.length) {
    out.push({ id: 'buildMenu', label: 'Build', hotkey: 'B', icon: 'house', cost: null, disabled: null, action: { kind: 'buildMenu' } });
    // Repair (the original's R): then left-click an own damaged building, ship or siege weapon.
    out.push({ id: 'repair', label: 'Repair', hotkey: 'R', icon: null, glyph: '⚒', cost: null, disabled: null, action: { kind: 'repair' } });
  }
  if (units.length) out.push({ id: 'stop', label: 'Stop', hotkey: 'S', icon: null, glyph: '✋', cost: null, disabled: null, action: { kind: 'stop' } });
  // Trade boats: which good they sell (then right-click another player's Dock). The letters are ours.
  const traders = units.filter((s) => TYPES[e.type[s]!]!.unit?.cls === 'tradeShip');
  if (traders.length) {
    const cur = tradeGood(w, traders[0]!);
    for (const [good, label, key, glyph] of [[0, 'Trade Food', 'F', 'Fd'], [1, 'Trade Wood', 'W', 'Wd'], [3, 'Trade Stone', 'T', 'St']] as const) {
      out.push({ id: `trade:${good}`, label: cur === good ? `${label} (on)` : label, hotkey: key, icon: null, glyph, cost: null, disabled: null, action: { kind: 'tradeGood', good } });
    }
  }
  // Unload (the original's L): loaded transports set everyone down on the nearest shore.
  if (units.some((s) => TYPES[e.type[s]!]!.unit?.cls === 'transport' && w.cargo[s]?.length)) {
    out.push({ id: 'unload', label: 'Unload', hotkey: 'L', icon: null, glyph: '⚓', cost: null, disabled: null, action: { kind: 'unload' } });
  }
  // Stand Ground (the original's only stance) for fighting units; the button shows whether it is on.
  const fighters = units.filter((s) => !isVillager(w, s) && w.stats(player, e.type[s]!).atk.some((v) => v !== undefined && v > 0));
  if (fighters.length) {
    // Attack-move (modern QoL; the original has none): A, then left-click the ground.
    out.push({ id: 'attackMove', label: 'Attack Move', hotkey: 'A', icon: null, glyph: '»', cost: null, disabled: null, action: { kind: 'attackMove' } });
    const standing = fighters.every((s) => e.stance[s] === 1);
    out.push({
      id: 'stance',
      label: standing ? 'Stand Ground (on)' : 'Stand Ground',
      hotkey: '',
      icon: null,
      glyph: standing ? '▣' : '□',
      cost: null,
      disabled: null,
      action: { kind: 'stance', stand: !standing },
    });
  }
  // A single own completed building: its trainable units.
  if (!units.length && own.length === 1 && e.kind[own[0]!] === EKind.building) {
    const b = own[0]!;
    const def = TYPES[e.type[b]!]!.building!;
    for (const unit of def.trains ?? []) {
      const why = trainBlocker(w, player, b, unit);
      if (why === 'not available to this civilization') continue; // missing from this civ's tree (econ:6.2)
      if (why && why !== 'building not ready' && UNIT_BY_ID.get(unit)!.age > p.stats.age + 1) continue;
      const ti = producedType(w, player, unit);
      const cost = w.stats(player, ti).cost;
      const q = w.prod[b]?.items.length ?? 0;
      out.push({
        id: `train:${unit}`,
        label: TYPES[ti]!.name,
        hotkey: TRAIN_KEYS[unit] ?? '',
        icon: TYPES[ti]!.id,
        cost: [...cost] as [number, number, number, number],
        disabled: why ?? (q >= MAX_QUEUE ? 'queue is full' : shortfall(w, player, cost)),
        action: { kind: 'train', bld: e.handleOf(b), unit },
      });
    }
    // Research: what this building offers now, plus next-age items greyed out; finished techs disappear.
    const q = w.prod[b]?.items.length ?? 0;
    for (const tech of TECHS) {
      if (tech.at !== def.id || p.techs.includes(tech.id) || tech.age > p.stats.age + 1) continue;
      const why = researchBlocker(w, player, b, tech.id);
      if (why === 'not available to this civilization' || why === 'already researched') continue;
      const c = tech.cost as Partial<Record<string, number>>;
      const cost: [number, number, number, number] = [c.food ?? 0, c.wood ?? 0, c.gold ?? 0, c.stone ?? 0];
      out.push({
        id: `research:${tech.id}`,
        label: tech.name,
        hotkey: '',
        icon: techIcon(tech.id),
        glyph: techGlyph(tech.id),
        cost,
        disabled: why ?? (q >= MAX_QUEUE ? 'queue is full' : shortfall(w, player, cost)),
        action: { kind: 'research', bld: e.handleOf(b), tech: tech.id },
      });
    }
  }
  return out;
}

const NUMERALS = ['', 'I', 'II', 'III', 'IV'];

/** Fallback when a tech's icon isn't baked: age advances show an arrow and the age they lead to (⬆II = Tool Age). */
export function techGlyph(techId: string): string | undefined {
  const age = TECH_BY_ID.get(techId)?.effects.find((ef) => ef.op === 'age');
  return age && age.op === 'age' ? `⬆${NUMERALS[age.age]}` : undefined;
}

/** Production queue of a selected building (units and research), for the selection panel. */
export function queueOf(w: World, bh: number): { type: string; label: string; glyph?: string; progress: number }[] {
  const b = w.ents.slotOf(bh);
  const prod = b >= 0 ? w.prod[b] : undefined;
  if (!prod) return [];
  return prod.items.map((item, i) => {
    if (typeof item === 'string') {
      const tech = TECH_BY_ID.get(item)!;
      const glyph = techGlyph(item);
      return { type: techIcon(item) ?? item, label: tech.name, ...(glyph ? { glyph } : {}), progress: i === 0 ? Math.min(1, prod.progress / (tech.researchTime * 20)) : 0 };
    }
    return {
      type: TYPES[item]!.id,
      label: TYPES[item]!.name,
      progress: i === 0 ? Math.min(1, prod.progress / w.stats(w.ents.owner[b]!, item).trainTicks) : 0,
    };
  });
}
