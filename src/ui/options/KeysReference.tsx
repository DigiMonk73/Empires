import './options.css';
import { BUILDING_BY_ID, UNIT_BY_ID } from '../../data/index.ts';
import { BUILD_KEYS, TRAIN_KEYS } from '../commands.ts';
import { GRID_KEYS, gameSettings } from '../settings.ts';

/** The keyboard reference (F1, M12.2): the general keys, then the command letters of the chosen layout. */
const GENERAL: [string, string][] = [
  ['Click · drag', 'Select · box-select (Shift adds)'],
  ['Double-click', 'Every unit of that type on screen'],
  ['Right-click', 'Move, gather, build, attack — by what is under the cursor'],
  ['Ctrl + 1–9', 'Make a group; 1–9 selects it, twice goes there'],
  ['Space', 'Go to the selection'],
  ['H', 'Town Center (again: the next one)'],
  ['.', 'Next idle villager'],
  ['Home', 'Where the last message happened (again: the one before)'],
  ['Tab', 'Next unit in the status box (selection grid off)'],
  ['Delete', 'Delete the selection'],
  ['Esc', 'Close the window on top · cancel · back · deselect'],
  ['Arrows · edge', 'Scroll'],
  ['+ / −', 'Game speed (single player)'],
  ['F3 · Pause', 'Pause / resume'],
  ['F4 · S button', 'Score list (the S beside the minimap)'],
  ['F11', 'Time, speed and population'],
  ['F10', 'Menu (pauses a single-player game)'],
  ['F1', 'This list'],
];

/** The keys for the chosen layout (the F1 overlay and the main menu's Help). */
export function KeysContent() {
  const s = gameSettings.value;
  const extra: [string, string][] = [];
  if (s.qol.shiftQueue) extra.push(['Shift + right-click', 'Add the order to the queue']);
  if (s.qol.attackMove) extra.push(['A, then click', 'Attack-move (Classic letters)']);
  if (s.qol.zoom) extra.push(['Wheel', 'Zoom']);
  if (s.qol.rally) extra.push(['Right-click (building)', 'Rally point']);
  return (
    <div class="keys-cols">
      <table class="keys-table">
        {[...GENERAL, ...extra].map(([k, what]) => (
          <tr>
            <th>{k}</th>
            <td>{what}</td>
          </tr>
        ))}
      </table>
      {s.hotkeys === 'grid' ? (
        <div class="keys-grid" data-testid="keys-grid">
          <p>Command buttons take the key of their place in the grid:</p>
          <div class="keys-grid-cells">
            {GRID_KEYS.map((k) => (
              <span>{k}</span>
            ))}
          </div>
          <p>Villagers: the first button opens the build menu. Esc goes back.</p>
        </div>
      ) : (
        <div class="keys-classic" data-testid="keys-classic">
          <table class="keys-table">
            <tr>
              <th colSpan={2}>Villager: B, then</th>
            </tr>
            {Object.entries(BUILD_KEYS).map(([id, k]) => (
              <tr>
                <th>{k}</th>
                <td>{BUILDING_BY_ID.get(id)?.name ?? id}</td>
              </tr>
            ))}
            <tr>
              <th>R · S</th>
              <td>Repair · Stop</td>
            </tr>
          </table>
          <table class="keys-table">
            <tr>
              <th colSpan={2}>Train (building selected)</th>
            </tr>
            {Object.entries(TRAIN_KEYS).map(([id, k]) => (
              <tr>
                <th>{k}</th>
                <td>{UNIT_BY_ID.get(id)?.name ?? id}</td>
              </tr>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}

export function KeysReference({ onClose }: { onClose: () => void }) {
  return (
    <div class="gameover" data-testid="keys" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="gameover-panel keys-panel">
        <div class="gameover-title small">Keys</div>
        <KeysContent />
        <div class="gameover-buttons">
          <button data-testid="keys-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
