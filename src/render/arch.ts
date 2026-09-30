import { CIV_BY_ID } from '../data/index.ts';

/**
 * Architecture sets (M9.2, D43): a building is drawn in its owner's set — model `<type>_<set>` (e.g.
 * `townCenter_egyptian`) — when that model is baked, else in the shared Greek-style model `<type>`.
 */
export function archOf(civ: string | undefined): string {
  return (civ && CIV_BY_ID.get(civ)?.arch) || 'greek';
}

export function archModelId(typeId: string, arch: string, has: (id: string) => boolean): string {
  if (arch === 'greek') return typeId;
  const id = `${typeId}_${arch}`;
  return has(id) ? id : typeId;
}
