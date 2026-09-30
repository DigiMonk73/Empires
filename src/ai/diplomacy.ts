import type { Command } from '../sim/commands/types.ts';
import { ALLY, ENEMY, NEUTRAL } from '../sim/rules/diplomacy.ts';
import type { Snapshot } from './ai.ts';

/**
 * The computers' diplomacy toward a human (M13.8, research §7 "Diplomacy toward you"). In a free-for-all with a
 * human in it, the computers start allied with each other; of N computers the table's count start hostile to the
 * human (the first ones by seat), the rest neutral. A neutral computer turns hostile once the human's units hit
 * it (the original: "if you attack them twice") or after 12 minutes (10–15) unless the human has paid it about
 * 1000 in tribute. Games of computers only (the AI suite) and games with teams set up are left as the setup made
 * them.
 */
export const HOSTILE_OF = (computers: number): number => (computers <= 2 ? computers : computers === 3 ? 2 : computers <= 5 ? 3 : 4);
export const NEUTRAL_PATIENCE = 12 * 60 * 20;
export const TRIBUTE_PEACE = 1000;

export interface DiplomacyState {
  set: boolean;
}

export class AiDiplomacy {
  private set = false;

  save(): DiplomacyState {
    return { set: this.set };
  }

  restore(st: DiplomacyState | undefined): void {
    this.set = st?.set ?? false;
  }

  update(s: Snapshot, player: number, cmds: Command[]): void {
    const v = s.v;
    const ids = v.playerIds();
    // A free-for-all: nobody shares a team (teams set up in the lobby decide everything themselves).
    if (new Set(ids.map((p) => v.teamOf(p))).size !== ids.length) return;
    const humans = ids.filter((p) => p !== player && !v.isComputer(p));
    if (!humans.length) return;
    if (!this.set) {
      this.set = true;
      const computers = ids.filter((p) => v.isComputer(p));
      for (const c of computers) if (c !== player && v.stanceTo(c) !== ALLY) cmds.push({ t: 'diplomacy', to: c, stance: ALLY });
      const hostile = computers.indexOf(player) < HOSTILE_OF(computers.length);
      for (const h of humans) {
        const want = hostile ? ENEMY : NEUTRAL;
        if (v.stanceTo(h) !== want) cmds.push({ t: 'diplomacy', to: h, stance: want });
      }
      return;
    }
    for (const h of humans) {
      if (v.stanceTo(h) !== NEUTRAL || v.isDefeated(h)) continue;
      const attacked = v.hitsBy(h) >= 2;
      const unpaid = v.tick >= NEUTRAL_PATIENCE && v.tributeFrom(h) < TRIBUTE_PEACE;
      if (attacked || unpaid) cmds.push({ t: 'diplomacy', to: h, stance: ENEMY });
    }
  }
}
