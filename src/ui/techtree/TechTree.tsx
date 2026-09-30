import { CIV_BY_ID } from '../../data/index.ts';
import { Emblem } from '../emblems.tsx';
import { iconStyle } from '../icons.ts';
import { techIcon } from '../techIcons.ts';
import type { ItemState, TreeColumn } from '../techTree.ts';
import './techtree.css';

/**
 * The tech-tree overlay (M7.9): buildings across, ages down; each item an icon and a name, marked by state.
 * Used in the game (a live player's progress) and from skirmish setup (a civilization's tree).
 */
const AGES = ['', 'Stone Age', 'Tool Age', 'Bronze Age', 'Iron Age'];
const STATE_TITLE: Record<ItemState, string> = {
  done: 'Researched, built or trainable now',
  now: 'Available in this age',
  later: 'A later age',
  missing: 'Not in this civilization’s tree',
};

function Chip({ id, name, state, kind, arch }: { id: string; name: string; state: ItemState; kind: string; arch?: string | undefined }) {
  const st = iconStyle(kind === 'tech' ? techIcon(id) : id, 26, arch);
  return (
    <div class={`tt-item ${state} ${kind}`} title={`${name} — ${STATE_TITLE[state]}`} data-testid={kind === 'tech' ? `tt-tech-${id}` : `tt-${id}`} data-state={state}>
      {st ? <span class="tt-icon" style={{ ...st, width: '26px', height: '26px' }} /> : <span class="tt-icon tt-glyph">{kind === 'tech' ? '⚙' : name.slice(0, 2)}</span>}
      <span class="tt-name">{name}</span>
    </div>
  );
}

export function TechTree({ civ, columns, full = false, onClose }: { civ: string; columns: TreeColumn[]; full?: boolean; onClose: () => void }) {
  const c = CIV_BY_ID.get(civ);
  return (
    <div class="tt" data-testid="tech-tree" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div class="tt-panel">
        <div class="tt-head">
          <h2>
            <Emblem civ={civ} size={36} />
            Tech Tree — {c?.name ?? civ}
            {full ? ' (Full Tech Tree)' : ''}
          </h2>
          <button data-testid="tech-tree-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div class="tt-scroll">
          <table>
            <thead>
              <tr>
                <th />
                {columns.map((col) => (
                  <th>
                    <span class="tt-bicon" style={{ ...(iconStyle(col.building, 34, c?.arch) ?? {}), width: '34px', height: '34px' }} />
                    <div>{col.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((age) => (
                <tr>
                  <th class="tt-age">{AGES[age]}</th>
                  {columns.map((col) => (
                    <td>
                      {col.ages[age]!.map((it) => (
                        <Chip id={it.id} name={it.name} state={it.state} kind={it.kind} arch={c?.arch} />
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div class="tt-legend">
          {(['done', 'now', 'later', 'missing'] as const).map((s) => (
            <span class={`tt-item ${s}`}>
              <span class="tt-name">{STATE_TITLE[s]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
