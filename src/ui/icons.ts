import type { BakedArt } from '../render/bakedArt.ts';
import { archModelId } from '../render/arch.ts';

/** CSS for drawing a baked sprite frame as a HUD icon (sprites double as icons until M9's portraits). */
let art: BakedArt | null = null;

export function setIconArt(a: BakedArt | null): void {
  art = a;
}

/** The local player's architecture set: building icons (build menu, tech tree) show it. */
let homeArch = 'greek';
export function setIconArch(a: string): void {
  homeArch = a;
}

/**
 * `model` is a model id; a building type is drawn in `arch` (default: the local player's set) when that set has
 * it, and an id already naming a set (`house_egyptian`) falls back to the shared model when the set lacks it.
 */
export function iconStyle(model: string | null, box: number, arch = homeArch): Record<string, string> | null {
  if (!model || !art) return null;
  // `model#v` picks a variant (tech icons, a Town Center of a given age).
  let variant = -1;
  const hash = model.indexOf('#');
  if (hash > 0) {
    variant = Number(model.slice(hash + 1));
    model = model.slice(0, hash);
  }
  const sep = model.lastIndexOf('_');
  if (sep > 0) {
    if (!art.meta(model)) model = model.slice(0, sep);
  } else if (art.meta(model)?.kind === 'building') model = archModelId(model, arch, (id) => !!art!.meta(id));
  // Composite art (walls: post + arms) has a dedicated icon model.
  if (!art.meta(model) && art.meta(`${model}Icon`)) model = `${model}Icon`;
  const meta = art.meta(model);
  if (!meta) return null;
  const key = variant >= 0 ? `v${Math.min(variant, meta.variants - 1)}` : meta.clips.idle ? 'idle/1/0' : 'v0';
  const f = meta.frames[key];
  if (!f) return null;
  const scale = Math.min(box / f.w, box / f.h) * 0.92;
  const page = meta.pages[f.p]!;
  const img = art.pageSize(model, f.p);
  return {
    backgroundImage: `url(./baked/${page})`,
    backgroundPosition: `${-f.x * scale + (box - f.w * scale) / 2}px ${-f.y * scale + (box - f.h * scale) / 2}px`,
    backgroundSize: `${img.w * scale}px ${img.h * scale}px`,
    backgroundRepeat: 'no-repeat',
  };
}
