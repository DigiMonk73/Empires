import { POPULATION } from '../data/setup.ts';
import { tradeGood } from '../sim/systems/trade.ts';
import { EKind } from '../sim/core/entities.ts';
import { TYPES } from '../sim/rules/registry.ts';
import type { World } from '../sim/world.ts';
import { playerColor } from '../render/worldRenderer.ts';
import { hud, type SelInfo } from './store.ts';
import { queueOf } from './commands.ts';
import { AGE_NAMES } from '../sim/systems/production.ts';

function fmtClock(tick: number): string {
  const s = Math.floor(tick / 20);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = `${m}`.padStart(2, '0');
  return h ? `${h}:${mm}:${`${ss}`.padStart(2, '0')}` : `${mm}:${`${ss}`.padStart(2, '0')}`;
}

function classStr(v: Record<string, number | undefined>, keys: string[]): string {
  return keys.map((k) => v[k] ?? 0).join('/');
}

/** Copy what the HUD shows out of the world. Called ~10×/s. */
export function syncHud(world: World, player: number, selected: readonly number[]): void {
  const p = world.players[player];
  if (p) {
    hud.res.value = [p.res[0]!, p.res[1]!, p.res[2]!, p.res[3]!];
    hud.age.value = AGE_NAMES[p.stats.age] ?? 'Stone Age';
  }
  const e = world.ents;
  // The sim's own count: it knows Logistics (half-pop barracks units), the game's population limit and the units
  // aboard transports — recounting here missed all three.
  hud.pop.value = p?.pop ?? 0;
  hud.idleVillagers.value = idleVillagers(world, player).length;
  hud.popCap.value = p?.popCap ?? 0;
  hud.clock.value = fmtClock(world.tick);
  hud.playerColor.value = `#${playerColor(player).toString(16).padStart(6, '0')}`;
  const sel: SelInfo[] = [];
  for (const h of selected) {
    const s = e.slotOf(h);
    if (s < 0) continue;
    const t = TYPES[e.type[s]!]!;
    const u = t.unit;
    sel.push({
      h,
      name: t.name,
      owner: e.owner[s]!,
      hp: e.hp[s]!,
      maxHp: t.hp,
      atk: u ? String(u.atk.melee ?? u.atk.pierce ?? 0) : '',
      arm: u ? classStr(u.arm, ['melee', 'pierce']) : '',
      range: u?.range ?? 0,
      isBuilding: e.kind[s] === EKind.building,
      model: t.id,
      ...(e.kind[s] === EKind.building ? { building: e.build[s]! } : {}),
      ...(u?.cls === 'priest' ? { faith: Math.floor(e.faith[s]!) } : {}),
    });
  }
  hud.selection.value = sel;
  // Single-selection extras: a villager's load, a farm's food left, a building's queue.
  const one = selected.length === 1 ? e.slotOf(selected[0]!) : -1;
  const field = one >= 0 && e.kind[one] === EKind.building && TYPES[e.type[one]!]!.building?.kind === 'farm' && e.build[one]! >= 1;
  const transport = one >= 0 && e.kind[one] === EKind.unit && TYPES[e.type[one]!]!.unit?.cls === 'transport';
  const trader = one >= 0 && e.kind[one] === EKind.unit && TYPES[e.type[one]!]!.unit?.cls === 'tradeShip';
  const trip = trader ? world.orders[one]?.[0] : undefined;
  const good = trader ? (['Food', 'Wood', 'Gold', 'Stone'][tradeGood(world, one)] ?? 'Wood') : '';
  hud.carry.value = field
    ? `Food ${Math.ceil(e.stock[one]!)}`
    : transport
      ? `Aboard ${world.cargo[one]?.length ?? 0} / ${world.stats(e.owner[one]!, e.type[one]!).capacity}`
    : trader
      ? trip?.k === 'trade' && trip.load > 0
        ? `Carrying ${trip.load} ${good}`
        : trip?.k === 'trade' && trip.gold > 0 && trip.phase === 2
          ? `Carrying ${Math.floor(trip.gold)} Gold`
          : `Trades ${good}`
    : one >= 0 && e.carryAmt[one]! > 0
      ? `Carrying ${Math.floor(e.carryAmt[one]!)} ${CARRY_NAMES[e.carryJob[one]! - 1] ?? ''}`
      : '';
  hud.queue.value = one >= 0 && e.kind[one] === EKind.building && e.owner[one] === player ? queueOf(world, selected[0]!) : [];
}

/** Own villagers with nothing to do (the QoL idle-villager button, RoR's "." key). */
export function idleVillagers(world: World, player: number): number[] {
  const e = world.ents;
  const out: number[] = [];
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.kind[s] !== EKind.unit || e.owner[s] !== player || world.orders[s]) continue;
    if (TYPES[e.type[s]!]!.unit?.cls === 'villager') out.push(e.handleOf(s));
  }
  return out;
}

const CARRY_NAMES = ['Food', 'Food', 'Meat', 'Fish', 'Wood', 'Gold', 'Stone'];
