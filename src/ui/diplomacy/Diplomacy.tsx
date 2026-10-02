import './diplomacy.css';
import { useState } from 'preact/hooks';
import { Emblem } from '../emblems.tsx';
import { tributeTotal, type DiploView } from '../diplomacy.ts';

const STANCES = ['Ally', 'Neutral', 'Enemy'] as const;
const RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;

/**
 * Diplomacy (M12.3, research §5): per player Ally / Neutral / Enemy and how they see us, the Allied Victory
 * checkbox, and tribute (needs a Market; the fee is paid on top until Coinage). The game keeps running.
 */
export function Diplomacy({
  view,
  onStance,
  onAlliedVictory,
  onTribute,
  onClose,
}: {
  view: DiploView;
  onStance: (to: number, stance: number) => void;
  onAlliedVictory: (on: boolean) => void;
  onTribute: (to: number, res: number, amount: number) => void;
  onClose: () => void;
}) {
  const alive = view.rows.filter((r) => !r.defeated);
  const [to, setTo] = useState(alive[0]?.id ?? 0);
  const [res, setRes] = useState(0);
  const [amount, setAmount] = useState(100);
  const cost = tributeTotal(amount, view.fee);
  const why = !view.market ? 'Tribute needs a Market.' : !alive.length ? 'Nobody left to send to.' : cost > view.res[res]! ? `Not enough ${RES[res]!.toLowerCase()}.` : '';
  return (
    <div class="gameover" data-testid="diplomacy" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="gameover-panel diplo-panel">
        <div class="gameover-title small">Diplomacy</div>
        <table class="diplo-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Civilization</th>
              <th>Your stance</th>
              <th>Theirs</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr class={r.defeated ? 'defeated' : ''} data-testid={`diplo-row-${r.id}`}>
                <td>
                  <span class="diplo-swatch" style={{ background: r.color }} />
                  {r.name}
                </td>
                <td>
                  <Emblem civ={r.civId} size={20} /> {r.civ}
                </td>
                <td class="diplo-stances">
                  {r.defeated
                    ? 'Defeated'
                    : STANCES.map((label, i) => (
                        <button class={`speed${r.mine === i ? ' on' : ''} st-${label.toLowerCase()}`} data-testid={`diplo-${r.id}-${label.toLowerCase()}`} onClick={() => onStance(r.id, i)}>
                          {label}
                        </button>
                      ))}
                </td>
                <td class={`diplo-theirs st-${STANCES[r.theirs]!.toLowerCase()}`} data-testid={`diplo-theirs-${r.id}`}>
                  {r.defeated ? '' : STANCES[r.theirs]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label class="diplo-av">
          <input type="checkbox" checked={view.alliedVictory} data-testid="diplo-allied-victory" onChange={(e) => onAlliedVictory((e.currentTarget as HTMLInputElement).checked)} />
          Allied Victory — win together with your allies
        </label>
        <div class="diplo-tribute">
          <h3>Tribute</h3>
          <div class="diplo-tribute-row">
            <select value={to} data-testid="tribute-to" onChange={(e) => setTo(Number((e.currentTarget as HTMLSelectElement).value))}>
              {alive.map((r) => (
                <option value={r.id}>{r.name}</option>
              ))}
            </select>
            <select value={res} data-testid="tribute-res" onChange={(e) => setRes(Number((e.currentTarget as HTMLSelectElement).value))}>
              {RES.map((name, i) => (
                <option value={i}>
                  {name} ({view.res[i]})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              step="50"
              value={amount}
              data-testid="tribute-amount"
              onInput={(e) => setAmount(Math.max(1, Math.floor(Number((e.currentTarget as HTMLInputElement).value) || 0)))}
            />
            <button class="speed" data-testid="tribute-send" disabled={!!why} onClick={() => onTribute(to, res, amount)}>
              Send
            </button>
          </div>
          <div class="diplo-note" data-testid="tribute-note">
            {why || (view.fee > 0 ? `Costs ${cost} ${RES[res]!.toLowerCase()} (a ${Math.round(view.fee * 100)}% fee until Coinage).` : `Costs ${cost} ${RES[res]!.toLowerCase()} (no fee).`)}
          </div>
        </div>
        <div class="gameover-buttons">
          <button data-testid="diplomacy-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
