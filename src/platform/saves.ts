import type { SaveMeta, SavedGame } from '../game/saveGame.ts';

/**
 * Saved games in the browser's IndexedDB (the Tauri webview has one too). Loading reloads the page with
 * `?load=<id>`, so a save must outlive the page: when IndexedDB is unavailable (blocked site data, some private
 * windows) saving fails with a message instead of pretending.
 */
const DB = 'empires';
const STORE = 'saves';

export const STORAGE_BLOCKED = 'Saving needs browser storage, which is blocked here.';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(STORAGE_BLOCKED));
      req.onblocked = () => reject(new Error(STORAGE_BLOCKED));
    } catch {
      reject(new Error(STORAGE_BLOCKED));
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('saved-game storage failed'));
    };
  });
}

export const saves = {
  async put(save: SavedGame): Promise<void> {
    await run('readwrite', (s) => s.put(save));
  },

  async get(id: string): Promise<SavedGame | null> {
    return (await run<SavedGame | undefined>('readonly', (s) => s.get(id))) ?? null;
  },

  /** Every save's details (not its bytes), newest first. */
  async list(): Promise<SaveMeta[]> {
    const all = await run<SavedGame[]>('readonly', (s) => s.getAll());
    return all
      .map((g): SaveMeta => {
        const { world, ais, ...meta } = g;
        void world;
        void ais;
        return meta;
      })
      .sort((a, b) => b.savedAt - a.savedAt);
  },

  async remove(id: string): Promise<void> {
    await run('readwrite', (s) => s.delete(id));
  },
};
