import { EKind } from '../core/entities.ts';
import type { World } from '../world.ts';
import type { PlayerCommand } from './types.ts';

/** Slots of the command's ids that are live units owned by the issuing player (others are ignored). */
function ownedUnitSlots(w: World, player: number, ids: readonly number[]): number[] {
  const out: number[] = [];
  for (const h of ids) {
    const slot = w.ents.slotOf(h);
    if (slot >= 0 && w.ents.owner[slot] === player && w.ents.kind[slot] === EKind.unit) out.push(slot);
  }
  return out;
}

function inMap(w: World, x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < w.map.w && y < w.map.h;
}

/** Validate and apply one tick's commands in arrival order. Invalid commands are dropped with an event. */
export function applyCommands(w: World, cmds: readonly PlayerCommand[]): void {
  for (const { player, cmd } of cmds) {
    if (player < 1 || player >= w.players.length) {
      w.events.push({ t: 'rejected', player, reason: 'bad player' });
      continue;
    }
    switch (cmd.t) {
      case 'move': {
        if (!inMap(w, cmd.x, cmd.y)) {
          w.events.push({ t: 'rejected', player, reason: 'move target off map' });
          break;
        }
        for (const slot of ownedUnitSlots(w, player, cmd.ids)) {
          const order = { k: 'move' as const, x: cmd.x, y: cmd.y };
          const q = w.orders[slot];
          if (cmd.queue && q && q.length) q.push(order);
          else {
            w.orders[slot] = [order];
            w.paths[slot] = undefined;
            w.pathing.cancel(slot);
          }
        }
        break;
      }
      case 'stop':
        for (const slot of ownedUnitSlots(w, player, cmd.ids)) {
          w.orders[slot] = undefined;
          w.paths[slot] = undefined;
          w.pathing.cancel(slot);
        }
        break;
    }
  }
}
