import { UNIT_BY_ID } from '../data/index.ts';
import type { Command } from '../sim/commands/types.ts';
import type { OwnUnit, SeenEntity } from '../sim/view/playerView.ts';
import { dist, type Snapshot } from './ai.ts';

/**
 * Tactics for the harder computers (M13.2). The M13.1 traces showed Hard and Moderate winning exactly half of
 * their mirror games: thinking faster and a bigger army cap changed nothing, because both fought the same way.
 * Hard and Hardest now (1) remember the enemy soldiers they have seen and push only with the stronger army,
 * (2) focus fire — several attackers on the weakest enemy in reach, so enemies die sooner and hit back less —
 * and (3) pull a beaten wave back home to regroup instead of feeding it in piecemeal.
 */

/** What a unit is worth in a fight: its price (food + wood + gold + stone), scaled by the health it has left. */
export function worth(type: string, hp: number): number {
  const d = UNIT_BY_ID.get(type);
  if (!d) return 0;
  const c = d.cost as Partial<Record<string, number>>;
  const price = (c.food ?? 0) + (c.wood ?? 0) + (c.gold ?? 0) + (c.stone ?? 0);
  return price * Math.max(0.1, Math.min(1, hp / Math.max(1, d.hp)));
}

export interface Danger {
  x: number;
  y: number;
  until: number;
}

export interface Sighting {
  h: number;
  type: string;
  hp: number;
  x: number;
  y: number;
  tick: number;
}

/** Enemy soldiers are remembered for three minutes after they were last seen. */
const MEMORY_TICKS = 20 * 180;
const CIVILIANS = new Set(['villager', 'fishingShip', 'tradeShip', 'transport', 'warship']);

export class Tactics {
  /** Enemy soldiers seen, by handle (a saved game carries them: the pushes it decides must replay the same). */
  seen = new Map<number, Sighting>();

  /** Refresh the memory from what is in sight now. */
  observe(s: Snapshot, enemies: SeenEntity[]): void {
    const tick = s.v.tick;
    for (const o of enemies) {
      if (o.building || CIVILIANS.has(o.cls)) continue;
      this.seen.set(o.h, { h: o.h, type: o.type, hp: o.hp, x: o.x, y: o.y, tick });
    }
    // Forget old sightings, and soldiers that should be in sight at their last spot but are not (dead or gone).
    const visible = new Set(enemies.map((o) => o.h));
    for (const [h, m] of [...this.seen]) {
      if (tick - m.tick > MEMORY_TICKS || (!visible.has(h) && s.v.visible(Math.floor(m.x), Math.floor(m.y)))) this.seen.delete(h);
    }
  }

  /** The enemy army's worth as far as we know. */
  enemyWorth(): number {
    let w = 0;
    for (const m of this.seen.values()) w += worth(m.type, m.hp);
    return w;
  }

  /** Push only with an army clearly stronger than the one we know of (or when there is nothing more to wait for). */
  readyToPush(army: OwnUnit[], popFull: boolean): boolean {
    if (popFull) return true;
    const ours = army.reduce((a, u) => a + worth(u.type, u.hp), 0);
    return ours >= 1.5 * this.enemyWorth();
  }

  /**
   * Focus fire: every soldier in a fight takes the weakest enemy soldier within its reach (+2 tiles), no more
   * than four melee on one; a soldier already on a target that is nearly as weak keeps it (no dithering).
   */
  focus(s: Snapshot, army: OwnUnit[], enemies: SeenEntity[], cmds: Command[]): void {
    const foes = enemies.filter((o) => !o.building && !CIVILIANS.has(o.cls) && o.hp > 0);
    if (!foes.length) return;
    const on = new Map<number, number>();
    for (const u of army) if (u.order === 'attack') on.set(u.target, (on.get(u.target) ?? 0) + 1);
    const byHandle = new Map(foes.map((o) => [o.h, o]));
    for (const u of army) {
      if (s.busy.has(u.h) || u.cls === 'siege' || u.cls === 'priest') continue;
      const d = UNIT_BY_ID.get(u.type);
      const reach = (d?.range ?? 0) + 2.5;
      const melee = !d?.range;
      let best: SeenEntity | null = null;
      for (const o of foes) {
        if (dist(o.x, o.y, u.x, u.y) > reach) continue;
        if (melee && o.h !== u.target && (on.get(o.h) ?? 0) >= 4) continue;
        if (!best || o.hp < best.hp || (o.hp === best.hp && o.h < best.h)) best = o;
      }
      if (!best || best.h === u.target) continue;
      const cur = u.order === 'attack' ? byHandle.get(u.target) : undefined;
      if (cur && dist(cur.x, cur.y, u.x, u.y) <= reach && cur.hp <= best.hp + 8) continue;
      if (cur) on.set(cur.h, (on.get(cur.h) ?? 1) - 1);
      on.set(best.h, (on.get(best.h) ?? 0) + 1);
      cmds.push({ t: 'act', ids: [u.h], h: best.h });
      s.busy.add(u.h);
    }
  }

  /**
   * A wave away from home that meets a stronger force (in sight around it) falls back to (hx, hy). Returns the
   * units sent back.
   */
  retreat(s: Snapshot, army: OwnUnit[], enemies: SeenEntity[], hx: number, hy: number, cmds: Command[]): number {
    const away = army.filter((u) => dist(u.x, u.y, hx, hy) > 16 && !s.busy.has(u.h) && u.cls !== 'siege');
    if (away.length < 2) return 0;
    const cx = away.reduce((a, u) => a + u.x, 0) / away.length;
    const cy = away.reduce((a, u) => a + u.y, 0) / away.length;
    const ours = away.filter((u) => dist(u.x, u.y, cx, cy) < 10).reduce((a, u) => a + worth(u.type, u.hp), 0);
    const theirs = enemies.filter((o) => !o.building && !CIVILIANS.has(o.cls) && dist(o.x, o.y, cx, cy) < 10).reduce((a, o) => a + worth(o.type, o.hp), 0);
    if (theirs === 0 || ours >= 0.6 * theirs) return 0;
    const ids = away.filter((u) => dist(u.x, u.y, cx, cy) < 12).map((u) => u.h);
    for (const h of ids) s.busy.add(h);
    cmds.push({ t: 'move', ids, x: Math.round(hx * 4) / 4, y: Math.round(hy * 4) / 4 });
    return ids.length;
  }

  /**
   * Home defence: raiders among our villagers. When soldiers alone would lose but soldiers and the villagers
   * working near the raiders clearly outweigh them, those villagers fight too (villagers hit for 3 — a crowd of
   * them beats an early wave; against a real army they would only be fed to it, so not then). Returns true if
   * villagers were sent.
   */
  militia(s: Snapshot, army: OwnUnit[], threats: SeenEntity[], cmds: Command[]): boolean {
    const raiders = threats.filter((o) => !o.building && !CIVILIANS.has(o.cls) && o.cls !== 'siege');
    if (!raiders.length) return false;
    const cx = raiders.reduce((a, o) => a + o.x, 0) / raiders.length;
    const cy = raiders.reduce((a, o) => a + o.y, 0) / raiders.length;
    const theirs = raiders.reduce((a, o) => a + worth(o.type, o.hp), 0);
    const soldiers = army.filter((u) => dist(u.x, u.y, cx, cy) < 14).reduce((a, u) => a + worth(u.type, u.hp), 0);
    if (soldiers >= 1.3 * theirs) return false;
    const vils = s.villagers
      .filter((u) => !s.busy.has(u.h) && u.hp > 10 && u.order !== 'build' && dist(u.x, u.y, cx, cy) < 9)
      .sort((a, b) => dist(a.x, a.y, cx, cy) - dist(b.x, b.y, cx, cy) || a.h - b.h);
    const vilWorth = vils.reduce((a, u) => a + worth(u.type, u.hp), 0);
    if (soldiers + vilWorth < 1.3 * theirs || vils.length < 3) return false;
    const weakest = raiders.reduce((b, o) => (o.hp < b.hp || (o.hp === b.hp && o.h < b.h) ? o : b));
    const ids = vils.filter((u) => u.order !== 'attack').map((u) => u.h);
    if (!ids.length) return false;
    for (const h of ids) s.busy.add(h);
    cmds.push({ t: 'act', ids, h: weakest.h });
    return true;
  }

  /** Spots raiders were seen among our villagers, and until when to keep clear of them (saved with the game). */
  dangers: Danger[] = [];

  /**
   * Villagers raiders would beat (no militia): the ones within 5 tiles of a raider run to the Town Center, and the
   * spot is marked dangerous for 40 s so the economy doesn't send them straight back.
   */
  flee(s: Snapshot, threats: SeenEntity[], cmds: Command[]): void {
    const tc = s.tc;
    if (!tc) return;
    const raiders = threats.filter((o) => !o.building && !CIVILIANS.has(o.cls));
    if (!raiders.length) return;
    const ids = s.villagers
      .filter((u) => !s.busy.has(u.h) && u.order !== 'build' && dist(u.x, u.y, tc.x, tc.y) > 5 && raiders.some((o) => dist(o.x, o.y, u.x, u.y) < 5))
      .map((u) => u.h);
    for (const o of raiders) this.dangers.push({ x: o.x, y: o.y, until: s.v.tick + 800 });
    if (this.dangers.length > 24) this.dangers.splice(0, this.dangers.length - 24);
    if (!ids.length) return;
    for (const h of ids) s.busy.add(h);
    cmds.push({ t: 'move', ids, x: Math.round(tc.x * 4) / 4, y: Math.round((tc.y + 2) * 4) / 4 });
  }

  /** Is (x, y) near a spot raiders were seen lately? */
  danger(tick: number, x: number, y: number): boolean {
    return this.dangers.some((d) => d.until > tick && dist(d.x, d.y, x, y) < 7);
  }

  save(): { seen: Sighting[]; dangers: Danger[] } {
    return { seen: [...this.seen.values()], dangers: this.dangers.map((d) => ({ ...d })) };
  }

  restore(seen: Sighting[] | undefined, dangers: Danger[] | undefined): void {
    this.seen = new Map((seen ?? []).map((m) => [m.h, { ...m }]));
    this.dangers = (dangers ?? []).map((d) => ({ ...d }));
  }
}
