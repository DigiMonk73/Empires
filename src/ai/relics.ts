import { ALLY } from '../sim/rules/diplomacy.ts';
import type { Command } from '../sim/commands/types.ts';
import type { SeenEntity } from '../sim/view/playerView.ts';
import { dist, type AiPlayer, type Snapshot } from './ai.ts';

/**
 * Standard-victory play (M14.6, econ:7): claim the Ruins and Artifacts near home, race the countdowns — an enemy
 * Wonder gets the whole army, an enemy holding a whole set of relics gets a squad at one of them — and, for Hard
 * and Hardest rich in the Iron Age, a Wonder of our own. Nothing here runs outside Standard games, so the AI
 * suite (conquest) and its ladder are untouched.
 */
export interface RelicState {
  claimer: number;
  target: number;
  since: number;
  /** Relics a claimer failed to reach (not tried again). */
  skip?: number[];
}

/** Soldiers sent to take back a relic from a holder whose clock is running. */
const SQUAD = 6;
/** A claimer that hasn't got there in two minutes gives up on that one (walled off, guarded, lost). */
const CLAIM_TICKS = 20 * 120;

export class RelicBrain {
  private claimer = -1;
  private target = -1;
  private since = 0;
  private skip = new Set<number>();

  save(): RelicState {
    return { claimer: this.claimer, target: this.target, since: this.since, skip: [...this.skip] };
  }

  restore(st: RelicState | undefined): void {
    this.claimer = st?.claimer ?? -1;
    this.target = st?.target ?? -1;
    this.since = st?.since ?? 0;
    this.skip = new Set(st?.skip ?? []);
  }

  update(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    if (s.v.victory() !== 'standard' || !s.tc) return;
    this.claim(s, cmds);
    if (!ai.peaceful) this.race(s, cmds);
    this.wonder(ai, s, cmds);
  }

  private mine(owner: number, s: Snapshot): boolean {
    return owner === s.v.player || (owner > 0 && s.v.stanceTo(owner) === ALLY);
  }

  /** One unit at a time walks to the nearest relic near home that isn't ours and isn't watched by enemy soldiers. */
  private claim(s: Snapshot, cmds: Command[]): void {
    const tc = s.tc!;
    const seen = s.v.others();
    const relics = seen.filter((o) => o.cls === 'relic');
    const current = relics.find((o) => o.h === this.target);
    const unit = s.units.find((u) => u.h === this.claimer);
    // Done (it's ours now), gone, or taking too long: free the claimer (the economy re-tasks a villager).
    if (this.target >= 0 && (!current || this.mine(current.owner, s) || !unit || s.v.tick - this.since > CLAIM_TICKS)) {
      if (current && !this.mine(current.owner, s) && s.v.tick - this.since > CLAIM_TICKS) this.skip.add(this.target);
      this.target = -1;
      this.claimer = -1;
    }
    if (this.target >= 0 && unit) {
      s.busy.add(unit.h);
      if (unit.idle) cmds.push({ t: 'move', ids: [unit.h], x: Math.round(current!.x * 4) / 4, y: Math.round((current!.y + 1.5) * 4) / 4 });
      return;
    }
    const soldiers = seen.filter((o) => o.owner > 0 && !o.building && !this.mine(o.owner, s) && o.cls !== 'villager');
    const home = (o: SeenEntity) => s.v.reachable(tc.x + tc.size / 2 + 0.5, tc.y, o.x - 1, o.y - 1, o.x + 1, o.y + 1);
    const want = relics
      .filter((o) => !this.mine(o.owner, s) && !this.skip.has(o.h) && !soldiers.some((e) => dist(e.x, e.y, o.x, o.y) < 8) && home(o))
      .sort((a, b) => dist(a.x, a.y, tc.x, tc.y) - dist(b.x, b.y, tc.x, tc.y) || a.h - b.h)[0];
    if (!want) return;
    // A rider if we have one idle, else a soldier, else the villager nearest to it.
    const free = s.units.filter((u) => !s.busy.has(u.h) && u.cls !== 'priest' && !['fishingShip', 'tradeShip', 'transport', 'warship', 'siege'].includes(u.cls));
    const byDist = (a: { x: number; y: number; h: number }, b: { x: number; y: number; h: number }) => dist(a.x, a.y, want.x, want.y) - dist(b.x, b.y, want.x, want.y) || a.h - b.h;
    const pick =
      free.filter((u) => u.cls === 'scout' && u.idle).sort(byDist)[0] ??
      free.filter((u) => u.cls !== 'villager' && u.idle).sort(byDist)[0] ??
      free.filter((u) => u.cls === 'villager' && u.order !== 'build').sort(byDist)[0];
    if (!pick) return;
    this.claimer = pick.h;
    this.target = want.h;
    this.since = s.v.tick;
    s.busy.add(pick.h);
    cmds.push({ t: 'move', ids: [pick.h], x: Math.round(want.x * 4) / 4, y: Math.round((want.y + 1.5) * 4) / 4 });
  }

  /** An enemy clock running: its Wonder gets the army; a held set of relics, a squad at the nearest of them. */
  private race(s: Snapshot, cmds: Command[]): void {
    const tc = s.tc!;
    const clocks = s.v.countdowns().filter((c) => !this.mine(c.player, s));
    if (!clocks.length) return;
    const seen = s.v.others();
    const army = s.units.filter((u) => !s.busy.has(u.h) && !['villager', 'priest', 'fishingShip', 'tradeShip', 'transport', 'warship'].includes(u.cls));
    if (!army.length) return;
    const wonder = clocks.find((c) => c.kind === 'wonder');
    const target = wonder
      ? seen.find((o) => o.h === wonder.h)
      : seen
          .filter((o) => o.cls === 'relic' && o.owner === clocks[0]!.player && (clocks[0]!.kind === 'artifacts' ? o.type === 'artifact' : o.type === 'ruins'))
          .sort((a, b) => dist(a.x, a.y, tc.x, tc.y) - dist(b.x, b.y, tc.x, tc.y) || a.h - b.h)[0];
    if (!target) return;
    if (wonder) {
      const go = army.filter((u) => !(u.order === 'attack' && u.target === target.h));
      if (!go.length) return;
      for (const u of go) s.busy.add(u.h);
      cmds.push({ t: 'act', ids: go.map((u) => u.h), h: target.h });
      return;
    }
    const near = army.filter((u) => dist(u.x, u.y, target.x, target.y) < 3).length;
    if (near >= SQUAD) return;
    const go = army
      .filter((u) => u.idle && dist(u.x, u.y, target.x, target.y) >= 3)
      .sort((a, b) => dist(a.x, a.y, target.x, target.y) - dist(b.x, b.y, target.x, target.y) || a.h - b.h)
      .slice(0, SQUAD - near);
    if (!go.length) return;
    for (const u of go) s.busy.add(u.h);
    cmds.push({ t: 'move', ids: go.map((u) => u.h), x: Math.round(target.x * 4) / 4, y: Math.round((target.y + 1.5) * 4) / 4, am: true });
  }

  /** Hard and Hardest, rich in the Iron Age: a Wonder (1000 wood, stone and gold) beside the Town Center. */
  private wonder(ai: AiPlayer, s: Snapshot, cmds: Command[]): void {
    if ((ai.level !== 'hard' && ai.level !== 'hardest') || s.me.age < 4 || ai.has(s, 'wonder').length || ai.isPending(s, 'wonder')) return;
    const [, wood, gold, stone] = s.me.res;
    if (wood! < 1300 || gold! < 1300 || stone! < 1100) return;
    const tc = s.tc!;
    ai.build(s, cmds, 'wonder', tc.x, tc.y, 7, 22, 6);
  }
}
