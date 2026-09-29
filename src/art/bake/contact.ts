import type { AtlasMeta } from './baker.ts';

/**
 * Contact sheet for visual review: frames drawn at 1:1 (2×) on a grass swatch with the iso tile grid, anchors
 * on tile centers, team overlays tinted blue. Units: one row per clip × facing, up to 6 frames per clip.
 */
export function contactSheet(meta: AtlasMeta, pages: HTMLCanvasElement[]): HTMLCanvasElement {
  const keys = Object.keys(meta.frames).filter((k) => !k.endsWith('#t'));
  const rows: string[][] = [];
  if (Object.keys(meta.clips).length) {
    for (const [clip, c] of Object.entries(meta.clips)) {
      for (let d = 0; d < meta.facings; d++) {
        const step = Math.max(1, Math.floor(c.frames / 6));
        const row: string[] = [];
        for (let f = 0; f < c.frames; f += step) row.push(`${clip}/${d}/${f}`);
        rows.push(row.filter((k) => meta.frames[k]));
      }
    }
  } else rows.push(keys);
  const cellW = Math.max(...keys.map((k) => meta.frames[k]!.w)) + 24;
  const cellH = Math.max(...keys.map((k) => meta.frames[k]!.h)) + 24;
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
      const cx = rx * cellW + cellW / 2;
      const cy = ry * cellH + cellH - 16;
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
