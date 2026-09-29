import { EKind } from '../core/entities.ts';
import { TYPES } from '../rules/registry.ts';
import type { World } from '../world.ts';
import { quantize, type PlayerCommand } from './types.ts';

/** Slots of the command's ids that are live units owned by the issuing player (others are ignored). */
function ownedUnitSlots(w: World, player: number, ids: readonly number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const h of ids) {
    const slot = w.ents.slotOf(h);
    if (slot >= 0 && !seen.has(slot) && w.ents.owner[slot] === player && w.ents.kind[slot] === EKind.unit) {
      seen.add(slot);
      out.push(slot);
    }
  }
  return out;
}

function inMap(w: World, x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < w.map.w && y < w.map.h;
}

/** Units farther than this from the group's centroid converge on the click instead of keeping formation. */
const FORMATION_MAX_OFFSET = 8;

/**
 * Per-unit targets for a group move: each unit keeps its offset from the group centroid, compressed so the
 * formation spans about √n tiles ("units near each other move in formation" — mil:4).
 */
function groupTargets(w: World, slots: readonly number[], x: number, y: number): { tx: number[]; ty: number[]; leader: number } {
  const e = w.ents;
  let cx = 0;
  let cy = 0;
  for (const s of slots) {
    cx += e.x[s]!;
    cy += e.y[s]!;
  }
  cx /= slots.length;
  cy /= slots.length;
  let leader = slots[0]!;
  let best = Infinity;
  let maxR = 0;
  for (const s of slots) maxR = Math.max(maxR, TYPES[e.type[s]!]!.radius);
  const spread = Math.max(1, 0.55 * Math.sqrt(slots.length) * Math.max(1, maxR / 0.2));
  const tx: number[] = [];
  const ty: number[] = [];
  for (const s of slots) {
    let ox = e.x[s]! - cx;
    let oy = e.y[s]! - cy;
    const d = Math.sqrt(ox * ox + oy * oy);
    if (d < best) {
      best = d;
      leader = s;
    }
    if (d > FORMATION_MAX_OFFSET) {
      ox = 0;
      oy = 0;
    } else if (d > spread) {
      ox *= spread / d;
      oy *= spread / d;
    }
    tx.push(quantize(Math.min(w.map.w - 0.01, Math.max(0, x + ox))));
    ty.push(quantize(Math.min(w.map.h - 0.01, Math.max(0, y + oy))));
  }
  return { tx, ty, leader };
}

function clearMovement(w: World, slot: number): void {
  w.paths[slot] = undefined;
  w.pathing.cancel(slot);
  w.ents.stuck[slot] = 0;
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
        const slots = ownedUnitSlots(w, player, cmd.ids);
        if (!slots.length) break;
        const g = slots.length > 1 ? groupTargets(w, slots, cmd.x, cmd.y) : null;
        const leaderHandle = g ? w.ents.handleOf(g.leader) : undefined;
        slots.forEach((slot, i) => {
          const order = g
            ? { k: 'move' as const, x: g.tx[i]!, y: g.ty[i]!, leader: leaderHandle }
            : { k: 'move' as const, x: cmd.x, y: cmd.y };
          const q = w.orders[slot];
          if (cmd.queue && q && q.length) q.push(order);
          else {
            w.orders[slot] = [order];
            clearMovement(w, slot);
          }
        });
        break;
      }
      case 'stop':
        for (const slot of ownedUnitSlots(w, player, cmd.ids)) {
          w.orders[slot] = undefined;
          clearMovement(w, slot);
        }
        break;
    }
  }
}
