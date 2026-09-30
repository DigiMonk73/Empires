import { CIV_BY_ID } from '../data/index.ts';
import { EKind } from '../sim/core/entities.ts';
import { stanceOf } from '../sim/rules/diplomacy.ts';
import { TYPES } from '../sim/rules/registry.ts';
import { tributeCost } from '../sim/systems/tribute.ts';
import type { World } from '../sim/world.ts';
import { playerColor } from '../render/worldRenderer.ts';

/** The Diplomacy dialog's view-model (M12.3): every other player, both stances, and what tribute costs. */
export interface DiploRow {
  id: number;
  name: string;
  civ: string;
  civId: string;
  color: string;
  /** Our stance toward them, and theirs toward us (0 Ally, 1 Neutral, 2 Enemy). */
  mine: number;
  theirs: number;
  defeated: boolean;
}

export interface DiploView {
  rows: DiploRow[];
  alliedVictory: boolean;
  /** Tribute: a finished Market is needed; the fee (0.25, or 0 after Coinage / for Palmyrans); what we hold. */
  market: boolean;
  fee: number;
  res: number[];
}

export function diplomacyView(w: World, me: number): DiploView {
  const p = w.players[me]!;
  const e = w.ents;
  let market = false;
  for (let s = 0; s < e.top && !market; s++) {
    market = e.alive[s] === 1 && e.kind[s] === EKind.building && e.owner[s] === me && e.build[s]! >= 1 && TYPES[e.type[s]!]!.id === 'market';
  }
  return {
    rows: w.players
      .filter((q) => q.id > 0 && q.id !== me)
      .map((q) => ({
        id: q.id,
        name: `Player ${q.id}`,
        civ: CIV_BY_ID.get(q.civ)?.name ?? q.civ,
        civId: q.civ,
        color: `#${playerColor(q.id).toString(16).padStart(6, '0')}`,
        mine: stanceOf(w, me, q.id),
        theirs: stanceOf(w, q.id, me),
        defeated: q.defeated !== null,
      })),
    alliedVictory: p.alliedVictory,
    market,
    fee: tributeCost(w, me, 1) - 1,
    res: [...p.res].map((v) => Math.floor(v)),
  };
}
