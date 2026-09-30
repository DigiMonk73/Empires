import type { SaveMeta, SavedGame } from '../game/saveGame.ts';
import { decodeSave, encodeSave } from '../game/saveCodec.ts';

/**
 * Saved games on the server that serves the game (M12.5) — the StartOS package keeps them in its data volume, so
 * they follow the player from device to device and go into the box's backups. Off when the server has no data
 * directory (plain `npm run preview`, the Mac app): `available()` says so and the UI hides the choice.
 */
const BASE = './api/saves';

async function fail(r: Response): Promise<never> {
  const msg = await r.json().then((b: { error?: string }) => b.error, () => null);
  throw new Error(msg ?? `the server answered ${r.status}`);
}

export const serverSaves = {
  async available(): Promise<boolean> {
    try {
      const r = await fetch(BASE, { cache: 'no-store' });
      return r.ok && (r.headers.get('content-type') ?? '').includes('json');
    } catch {
      return false;
    }
  },

  async list(): Promise<SaveMeta[]> {
    const r = await fetch(BASE, { cache: 'no-store' });
    if (!r.ok) await fail(r);
    return (await r.json()) as SaveMeta[];
  },

  async get(id: string): Promise<SavedGame | null> {
    const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) await fail(r);
    return decodeSave(new Uint8Array(await r.arrayBuffer()));
  },

  async put(save: SavedGame): Promise<void> {
    const r = await fetch(`${BASE}/${encodeURIComponent(save.id)}`, { method: 'PUT', body: encodeSave(save) as BodyInit, headers: { 'Content-Type': 'application/octet-stream' } });
    if (!r.ok) await fail(r);
  },

  async remove(id: string): Promise<void> {
    const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) await fail(r);
  },
};

export type SaveWhere = 'local' | 'server';
