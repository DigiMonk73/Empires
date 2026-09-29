/**
 * Entity handles: a slot index plus a generation counter, packed arithmetically (no 32-bit overflow).
 * A handle whose generation no longer matches its slot is stale — the entity it named is gone.
 */
export const SLOT_LIMIT = 1 << 20;
export const GEN_LIMIT = 1 << 16;
export const NO_ENTITY = -1;

export function makeHandle(slot: number, gen: number): number {
  return gen * SLOT_LIMIT + slot;
}

export function handleSlot(h: number): number {
  return h % SLOT_LIMIT;
}

export function handleGen(h: number): number {
  return Math.floor(h / SLOT_LIMIT);
}
