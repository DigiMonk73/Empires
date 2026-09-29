import { BUILDINGS, UNIT_BY_ID } from '../data/index.ts';
import { EKind } from '../sim/core/entities.ts';
import { TYPES, buildingTypeIndex } from '../sim/rules/registry.ts';
import { buildingAvailable, canAfford } from '../sim/systems/build.ts';
import { isVillager } from '../sim/systems/gather.ts';
import { MAX_QUEUE, producedType, trainBlocker } from '../sim/systems/production.ts';
import type { World } from '../sim/world.ts';

/**
 * The command grid's view-model: which buttons the current selection offers, with hotkeys (the original's
 * letters — mil:5), costs, and why a button is disabled.
 */
export type Action =
  | { kind: 'buildMenu' }
  | { kind: 'back' }
  | { kind: 'place'; building: string }
  | { kind: 'train'; bld: number; unit: string }
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
const BUILD_KEYS: Record<string, string> = {
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
const TRAIN_KEYS: Record<string, string> = { villager: 'C', clubman: 'T', slinger: 'L', shortSwordsman: 'Z', bowman: 'T', scout: 'T' };

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
      if (!key || b.kind === 'wall' || b.kind === 'tower') continue;
      const ti = buildingTypeIndex(b.id);
      const avail = buildingAvailable(w, player, ti);
      if (!avail.ok && (avail.reason.startsWith('requires') ? p.stats.age + 1 < b.age : true)) continue; // hide far-future/disabled
      const cost = w.stats(player, ti).cost;
      out.push({
        id: `build:${b.id}`,
        label: b.name,
        hotkey: key,
        icon: b.id,
        cost: [...cost] as [number, number, number, number],
        disabled: !avail.ok ? avail.reason : !canAfford(w, player, cost) ? 'not enough resources' : null,
        action: { kind: 'place', building: b.id },
      });
    }
    out.push({ id: 'back', label: 'Back', hotkey: 'Escape', icon: null, glyph: '↩', cost: null, disabled: null, action: { kind: 'back' } });
    return out;
  }
  if (villagers.length) {
    out.push({ id: 'buildMenu', label: 'Build', hotkey: 'B', icon: 'house', cost: null, disabled: null, action: { kind: 'buildMenu' } });
  }
  if (units.length) out.push({ id: 'stop', label: 'Stop', hotkey: 'S', icon: null, glyph: '✋', cost: null, disabled: null, action: { kind: 'stop' } });
  // A single own completed building: its trainable units.
  if (!units.length && own.length === 1 && e.kind[own[0]!] === EKind.building) {
    const b = own[0]!;
    const def = TYPES[e.type[b]!]!.building!;
    for (const unit of def.trains ?? []) {
      const why = trainBlocker(w, player, b, unit);
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
        disabled: why ?? (q >= MAX_QUEUE ? 'queue is full' : !canAfford(w, player, cost) ? 'not enough resources' : null),
        action: { kind: 'train', bld: e.handleOf(b), unit },
      });
    }
  }
  return out;
}

/** Production queue of a selected building, for the selection panel. */
export function queueOf(w: World, bh: number): { type: string; progress: number }[] {
  const b = w.ents.slotOf(bh);
  const prod = b >= 0 ? w.prod[b] : undefined;
  if (!prod) return [];
  return prod.items.map((ti, i) => ({
    type: TYPES[ti]!.id,
    progress: i === 0 ? Math.min(1, prod.progress / w.stats(w.ents.owner[b]!, ti).trainTicks) : 0,
  }));
}
