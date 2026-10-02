import { useEffect, useRef, useState } from 'preact/hooks';
import type { SaveMeta } from '../../game/saveGame.ts';
import { saves } from '../../platform/saves.ts';
import { serverSaves, type SaveWhere } from '../../platform/serverSaves.ts';
import { formatClock } from '../results.ts';
import './saves.css';

const WHERE_KEY = 'empires.saveWhere';
function lastWhere(): SaveWhere {
  try {
    return localStorage.getItem(WHERE_KEY) === 'server' ? 'server' : 'local';
  } catch {
    return 'local';
  }
}

/**
 * The saved-games dialog, in "save" mode (in-game: name it, or pick one to overwrite) or "load" mode (in-game and
 * on the main menu: pick one to continue, ✕ to delete). When the server keeps saves (the StartOS package, M12.5)
 * a tab switches between this device's saves and the server's.
 */
export function SaveList(props: {
  mode: 'save' | 'load';
  defaultName?: string;
  onSave?: (name: string, overwrite: string | null, where: SaveWhere) => Promise<void>;
  onLoad?: (id: string, where: SaveWhere) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<SaveMeta[] | null>(null);
  const [name, setName] = useState(props.defaultName ?? '');
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [server, setServer] = useState(false);
  const [where, setWhereState] = useState<SaveWhere>('local');
  const store = where === 'server' ? serverSaves : saves;
  const setWhere = (w: SaveWhere) => {
    if (w === where) return; // the list is already this one
    setWhereState(w);
    setPicked(null);
    setList(null);
    setNote('');
    try {
      localStorage.setItem(WHERE_KEY, w);
    } catch {
      /* not remembered */
    }
  };
  // Only the answer for the tab now showing is used: when the server tab opens by itself, the device's list may
  // still be on its way and must not land on top of the server's (seen on the StartOS VM, M12 exit).
  const showing = useRef<SaveWhere>(where);
  showing.current = where;
  const refresh = () => {
    const w = where;
    return store.list().then(
      (l) => {
        if (showing.current === w) setList(l);
      },
      (e: Error) => {
        if (showing.current !== w) return;
        setNote(e.message);
        setList([]);
      },
    );
  };
  useEffect(() => {
    void serverSaves.available().then((ok) => {
      setServer(ok);
      if (ok && lastWhere() === 'server') {
        setList(null);
        setWhereState('server');
      }
    });
  }, []);
  useEffect(() => void refresh(), [where]);

  const save = async () => {
    if (!props.onSave || !name.trim()) return;
    setNote('Saving…');
    try {
      await props.onSave(name.trim(), picked, where);
      setNote('Game saved.');
      setPicked(null);
      await refresh();
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  const remove = async (id: string) => {
    await store.remove(id).catch((e: Error) => setNote(e.message));
    await refresh();
  };
  const when = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div class="saves" data-testid={`saves-${props.mode}`}>
      <div class="saves-panel">
        <h2>{props.mode === 'save' ? 'Save Game' : 'Load Game'}</h2>
        {server && (
          <div class="saves-where">
            <button class={`small${where === 'local' ? ' on' : ''}`} data-testid="saves-local" onClick={() => setWhere('local')}>
              This device
            </button>
            <button class={`small${where === 'server' ? ' on' : ''}`} data-testid="saves-server" onClick={() => setWhere('server')}>
              Server
            </button>
          </div>
        )}
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
                      if (props.mode === 'load') props.onLoad?.(g.id, where);
                      else {
                        setPicked(g.id);
                        setName(g.name);
                      }
                    }}
                  >
                    <td class="saves-name">
                      {g.id === 'autosave' && <span class="saves-auto">Autosave</span>}
                      {g.name}
                    </td>
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
                if (e.key === 'Escape') {
                  e.stopPropagation(); // (the game's Escape would close the Menu beneath too)
                  props.onClose(); // Escape leaves the dialog, typing or not (M15.10 P66)
                  return;
                }
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
