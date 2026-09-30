import type { AtlasMeta } from './baker.ts';

/**
 * Contact sheet for visual review: frames drawn at 1:1 (2×) on a grass swatch with the iso tile grid, anchors
 * on tile centers, team overlays tinted blue. Units: one row per clip × facing, up to 6 frames per clip.
 */
export function contactSheet(meta: AtlasMeta, pages: HTMLCanvasElement[]): HTMLCanvasElement {
  const keys = Object.keys(meta.frames).filter((k) => !k.endsWith('#t'));
  const rows: string[][] = [];
  const nClips = Object.keys(meta.clips).length;
  if (nClips) {
    // Many clips: show a subset of facings so the sheet stays reviewable (≤ ~40 rows).
    const facings = nClips * meta.facings <= 40 ? [...Array(meta.facings).keys()] : nClips * 4 <= 40 ? [0, 2, 4, 6] : [1, 5];
    for (const [clip, c] of Object.entries(meta.clips)) {
      for (const d of facings) {
        const step = Math.max(1, Math.floor(c.frames / 6));
        const row: string[] = [];
        for (let f = 0; f < c.frames; f += step) row.push(`${clip}/${d}/${f}`);
        rows.push(row.filter((k) => meta.frames[k]));
      }
    }
  } else rows.push(keys);
  const maxAx = Math.max(...keys.map((k) => meta.frames[k]!.ax));
  const maxRight = Math.max(...keys.map((k) => meta.frames[k]!.w - meta.frames[k]!.ax));
  const maxAy = Math.max(...keys.map((k) => meta.frames[k]!.ay));
  const maxBelow = Math.max(...keys.map((k) => meta.frames[k]!.h - meta.frames[k]!.ay));
  const cellW = maxAx + maxRight + 24;
  const cellH = maxAy + maxBelow + 24;
  const cols = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = Math.min(4096, cols * cellW);
  c.height = Math.min(4096, rows.length * cellH);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#4f7a2e';
  ctx.fillRect(0, 0, c.width, c.height);
  // Iso grid (2×: 128×64 tiles).
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  for (let k = -c.height; k < c.width + c.height; k += 128) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + c.height * 2, c.height);
    ctx.moveTo(k, 0);
    ctx.lineTo(k - c.height * 2, c.height);
    ctx.stroke();
  }
  const tint = document.createElement('canvas');
  rows.forEach((row, ry) => {
    row.forEach((key, rx) => {
      const f = meta.frames[key]!;
      const cx = rx * cellW + 12 + maxAx;
      const cy = ry * cellH + 12 + maxAy;
      ctx.drawImage(pages[f.p]!, f.x, f.y, f.w, f.h, cx - f.ax, cy - f.ay, f.w, f.h);
      const t = meta.frames[`${key}#t`];
      if (t) {
        tint.width = t.w;
        tint.height = t.h;
        const tc = tint.getContext('2d')!;
        tc.clearRect(0, 0, t.w, t.h);
        tc.drawImage(pages[t.p]!, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
        tc.globalCompositeOperation = 'multiply';
        tc.fillStyle = '#3f5f9f';
        tc.fillRect(0, 0, t.w, t.h);
        tc.globalCompositeOperation = 'destination-in';
        tc.drawImage(pages[t.p]!, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
        tc.globalCompositeOperation = 'source-over';
        ctx.drawImage(tint, cx - t.ax, cy - t.ay);
      }
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
    });
  });
  return c;
}
