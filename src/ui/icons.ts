import type { BakedArt } from '../render/bakedArt.ts';

/** CSS for drawing a baked sprite frame as a HUD icon (sprites double as icons until M9's portraits). */
let art: BakedArt | null = null;

export function setIconArt(a: BakedArt | null): void {
  art = a;
}

export function iconStyle(model: string | null, box: number): Record<string, string> | null {
  if (!model || !art) return null;
  // Composite art (walls: post + arms) has a dedicated icon model.
  if (!art.meta(model) && art.meta(`${model}Icon`)) model = `${model}Icon`;
  const meta = art.meta(model);
  if (!meta) return null;
  const key = meta.clips.idle ? 'idle/1/0' : 'v0';
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
