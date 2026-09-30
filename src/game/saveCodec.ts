import type { SaveMeta, SavedGame } from './saveGame.ts';

/**
 * A saved game as one file (M12.5) — for the server's /api/saves (and any export): "EMPS", a version byte, the
 * header length (u32, little-endian), the header as UTF-8 JSON (everything but the world), then the world's own
 * save bytes. The server reads only the header to list saves, so it never has to understand the world.
 */
const MAGIC = [0x45, 0x4d, 0x50, 0x53]; // EMPS
const VERSION = 1;
export const SAVE_ID = /^[a-z0-9_-]{1,64}$/i;

export function encodeSave(save: SavedGame): Uint8Array {
  const { world, ...rest } = save;
  const head = new TextEncoder().encode(JSON.stringify(rest));
  const out = new Uint8Array(9 + head.length + world.length);
  out.set(MAGIC, 0);
  out[4] = VERSION;
  new DataView(out.buffer).setUint32(5, head.length, true);
  out.set(head, 9);
  out.set(world, 9 + head.length);
  return out;
}

/** The header of an encoded save (its details, without decoding the world). Throws on anything else. */
export function decodeSaveMeta(bytes: Uint8Array): SaveMeta & Pick<SavedGame, 'ais' | 'timeline'> {
  if (bytes.length < 9 || MAGIC.some((b, i) => bytes[i] !== b) || bytes[4] !== VERSION) throw new Error('not an Empires save');
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(5, true);
  if (9 + n > bytes.length) throw new Error('save is truncated');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(9, 9 + n))) as SaveMeta & Pick<SavedGame, 'ais' | 'timeline'>;
}

export function decodeSave(bytes: Uint8Array): SavedGame {
  const head = decodeSaveMeta(bytes);
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(5, true);
  return { ...head, world: bytes.slice(9 + n) } as SavedGame;
}
