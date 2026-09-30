import { useEffect, useState } from 'preact/hooks';
import type { SaveMeta } from '../../game/saveGame.ts';
import { saves } from '../../platform/saves.ts';
import { formatClock } from '../results.ts';
import './saves.css';

/**
 * The saved-games dialog, in "save" mode (in-game: name it, or pick one to overwrite) or "load" mode (in-game and
 * on the main menu: pick one to continue, ✕ to delete).
 */
export function SaveList(props: {
  mode: 'save' | 'load';
  defaultName?: string;
  onSave?: (name: string, overwrite: string | null) => Promise<void>;
  onLoad?: (id: string) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<SaveMeta[] | null>(null);
  const [name, setName] = useState(props.defaultName ?? '');
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const refresh = () =>
    saves.list().then(setList, (e: Error) => {
      setNote(e.message);
      setList([]);
    });
  useEffect(() => void refresh(), []);

  const save = async () => {
    if (!props.onSave || !name.trim()) return;
    setNote('Saving…');
    try {
      await props.onSave(name.trim(), picked);
      setNote('Game saved.');
      setPicked(null);
      await refresh();
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  const remove = async (id: string) => {
    await saves.remove(id).catch((e: Error) => setNote(e.message));
    await refresh();
  };
  const when = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div class="saves" data-testid={`saves-${props.mode}`}>
      <div class="saves-panel">
        <h2>{props.mode === 'save' ? 'Save Game' : 'Load Game'}</h2>
        <div class="saves-list">
          {list === null ? (
            <div class="saves-empty">…</div>
          ) : list.length === 0 ? (
            <div class="saves-empty">No saved games yet.</div>
          ) : (
            <table>
              <tbody>
                {list.map((g) => (
                  <tr
                    key={g.id}
                    class={picked === g.id ? 'picked' : ''}
                    data-testid="save-row"
                    onClick={() => {
                      if (props.mode === 'load') props.onLoad?.(g.id);
                      else {
                        setPicked(g.id);
                        setName(g.name);
                      }
                    }}
                  >
                    <td class="saves-name">{g.name}</td>
                    <td>{g.kind}</td>
                    <td>{g.age}</td>
                    <td>{formatClock(g.tick)}</td>
                    <td class="saves-when">{when(g.savedAt)}</td>
                    <td>
                      {props.mode === 'load' && (
                        <button
                          class="small"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            void remove(g.id);
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {props.mode === 'save' && (
          <div class="saves-name-row">
            <input
              data-testid="save-name"
              value={name}
              maxLength={40}
              placeholder="Name this game"
              onInput={(e) => {
                setName((e.target as HTMLInputElement).value);
                setPicked(null);
              }}
              onKeyDown={(e) => {
                e.stopPropagation(); // typing must not trigger game hotkeys
                if (e.key === 'Enter') void save();
              }}
            />
          </div>
        )}
        <div class="saves-note" data-testid="save-note">{note}</div>
        <div class="saves-buttons">
          {props.mode === 'save' && (
            <button class="primary" data-testid="save-confirm" disabled={!name.trim()} onClick={() => void save()}>
              {picked ? 'Overwrite' : 'Save'}
            </button>
          )}
          <button data-testid="saves-close" onClick={props.onClose}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
