import type { Command } from '../sim/commands/types.ts';
import type { AiPlayer, Snapshot } from './ai.ts';
import { dist } from './ai.ts';

/**
 * AI at sea, economy (M8.8a). A Dock goes up once fish are known near home — at once on an island start, where
 * land food is short — and fishing boats work the nearest fish their sea reaches, two boats a school at most;
 * with no fish known they sail out to explore. Island starts keep a bigger fleet (the water template's land has
 * little hunting and the berries run out).
 */
export interface NavalState {
  island: boolean | null;
  sweep: number;
}

/** Fishing boats wanted by age, on a coast and on an island. */
const FLEET = { coast: [0, 4, 6, 7, 8], island: [0, 7, 10, 12, 14] } as const;
/** A start whose land is under this share of the map is an island. */
const ISLAND_SHARE = 0.3;

export class NavalBrain {
  private island: boolean | null = null;
  private sweep = 0;

  save(): NavalState {
    return { island: this.island, sweep: this.sweep };
  }

  restore(st: NavalState | undefined): void {
    this.island = st?.island ?? null;
    this.sweep = st?.sweep ?? 0;
  }

  update(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const tc = s.tc;
    if (!tc) return;
    if (this.island === null) {
      const home = s.v.region(1, Math.floor(tc.x + tc.size / 2 + 0.5), Math.floor(tc.y));
      this.island = home > 0 && s.v.landSize(home) < s.v.mapW * s.v.mapH * ISLAND_SHARE;
    }
    this.dock(ai, s, cmds);
    this.fishers(ai, s, cmds);
  }

  /** On an island (for the rest of the naval AI: warships, transports). */
  get onIsland(): boolean {
    return !!this.island;
  }

  private dock(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const tc = s.tc!;
    if (ai.has(s, 'dock').length || ai.isPending(s, 'dock')) return;
    if (s.villagers.length < (this.island ? 5 : 8)) return;
    if (!this.island && !s.v.fish().some((f) => dist(f.x, f.y, tc.x, tc.y) < 18)) return;
    ai.build(s, cmds, 'dock', tc.x, tc.y, 3, 22, 1);
  }

  private fishers(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    const dock = ai.has(s, 'dock', true)[0];
    if (!dock) return;
    const boats = s.units.filter((u) => u.cls === 'fishingShip');
    const want = FLEET[this.island ? 'island' : 'coast'][s.me.age] ?? 8;
    if (boats.length + dock.queue < want && dock.queue < 2 && s.me.pop + dock.queue < s.me.popCap) {
      const unit = ['fishingShip', 'fishingBoat'].find((u) => !s.v.trainBlocker(dock.h, u));
      if (unit && s.v.canAfford(s.v.cost(unit))) cmds.push({ t: 'train', bld: dock.h, unit });
    }
    // Idle boats: the nearest fish (to the Dock) their sea reaches, at most two boats a school.
    const fish = s.v.fish();
    const load = new Map<number, number>();
    for (const b of boats) if (b.order === 'gather') load.set(b.target, (load.get(b.target) ?? 0) + 1);
    for (const b of boats) {
      if (!b.idle || s.busy.has(b.h)) continue;
      const sea = s.v.region(2, Math.floor(b.x), Math.floor(b.y));
      let best: (typeof fish)[number] | null = null;
      let bd = Infinity;
      for (const f of fish) {
        if ((load.get(f.i) ?? 0) >= 2) continue;
        const d = dist(f.x, f.y, dock.x, dock.y);
        if (d > bd || (d === bd && best && f.i > best.i)) continue;
        if (!s.v.seaReachable(sea, f.x - 1, f.y - 1, f.x + 1, f.y + 1)) continue;
        best = f;
        bd = d;
      }
      s.busy.add(b.h);
      if (best) {
        cmds.push({ t: 'gather', ids: [b.h], res: best.i });
        load.set(best.i, (load.get(best.i) ?? 0) + 1);
      } else this.explore(s, cmds, b.h, sea);
    }
  }

  /** Send a boat to the next unexplored stretch of its sea (an 8 × 8 sweep of the map). */
  private explore(s: Snapshot, cmds: Command[], h: number, sea: number): void {
    const W = s.v.mapW;
    const H = s.v.mapH;
    for (let k = 0; k < 64; k++) {
      const i = (this.sweep + k) % 64;
      const x = Math.floor(((i % 8) + 0.5) * (W / 8));
      const y = Math.floor((Math.floor(i / 8) + 0.5) * (H / 8));
      if (s.v.explored(x, y) || s.v.region(2, x, y) !== sea) continue;
      this.sweep = (i + 1) % 64;
      cmds.push({ t: 'move', ids: [h], x: x + 0.5, y: y + 0.5 });
      return;
    }
  }
}
