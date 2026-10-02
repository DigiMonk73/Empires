import type { LockstepPacket } from './lockstep.ts';

/**
 * A lockstep packet on the wire (M16.2, docs/MULTIPLAYER.md): one binary WebSocket frame,
 * `[u8 kind=1][u16 from][u32 tick][u8 hasCheck][u32 checkTick][u32 hash][command bytes…]`, little-endian.
 * The relay forwards the frame unchanged.
 */
const KIND_PACKET = 1;
const HEAD = 1 + 2 + 4 + 1 + 4 + 4;

export function encodePacket(p: LockstepPacket): Uint8Array {
  const out = new Uint8Array(HEAD + p.cmds.length);
  const v = new DataView(out.buffer);
  v.setUint8(0, KIND_PACKET);
  v.setUint16(1, p.from, true);
  v.setUint32(3, p.tick, true);
  v.setUint8(7, p.check ? 1 : 0);
  v.setUint32(8, p.check ? p.check[0] : 0, true);
  v.setUint32(12, p.check ? p.check[1] >>> 0 : 0, true);
  out.set(p.cmds, HEAD);
  return out;
}

export function decodePacket(bytes: Uint8Array): LockstepPacket {
  if (bytes.length < HEAD || bytes[0] !== KIND_PACKET) throw new Error('not a lockstep packet');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p: LockstepPacket = { from: v.getUint16(1, true), tick: v.getUint32(3, true), cmds: bytes.slice(HEAD) };
  if (v.getUint8(7)) p.check = [v.getUint32(8, true), v.getUint32(12, true)];
  return p;
}
