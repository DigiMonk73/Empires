/**
 * Tight frame sheet for reviewing baked animation: rows = clip × facing, columns = frames, on grass, upscaled.
 *   node tools/frames.ts <model> <out.png> [clips=all] [facings=1,5] [k=2] [maxFrames=10]
 * e.g. node tools/frames.ts villager artifacts/bake/v-work.png chop,mine,farm 1,3 2
 * Team pixels are tinted blue like in game. Anchors are marked with a red dot.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { AtlasMeta } from '../src/art/bake/baker.ts';

const [model, out, clipArg, facingArg, kArg, maxArg] = process.argv.slice(2);
if (!model || !out) {
  console.error('usage: node tools/frames.ts <model> <out.png> [clips] [facings] [k] [maxFrames]');
  process.exit(2);
}
const meta = JSON.parse(readFileSync(`public/baked/${model}.json`, 'utf8')) as AtlasMeta;
const pages = meta.pages.map((p) => PNG.sync.read(readFileSync(`public/baked/${p}`)));
const clips = clipArg && clipArg !== 'all' ? clipArg.split(',') : Object.keys(meta.clips);
const facings = (facingArg ?? '1,5').split(',').map(Number);
const k = Number(kArg ?? 2);
const maxFrames = Number(maxArg ?? 10);

const rows: string[][] = [];
for (const c of clips) {
  const clip = meta.clips[c];
  if (!clip) throw new Error(`no clip ${c}; have ${Object.keys(meta.clips).join(', ')}`);
  const step = Math.max(1, Math.ceil(clip.frames / maxFrames));
  for (const d of facings) {
    const row: string[] = [];
    for (let f = 0; f < clip.frames; f += step) if (meta.frames[`${c}/${d}/${f}`]) row.push(`${c}/${d}/${f}`);
    rows.push(row);
  }
}
const all = rows.flat().map((key) => meta.frames[key]!);
const left = Math.max(...all.map((f) => f.ax));
const right = Math.max(...all.map((f) => f.w - f.ax));
const up = Math.max(...all.map((f) => f.ay));
const down = Math.max(...all.map((f) => f.h - f.ay));
const cw = left + right + 8;
const ch = up + down + 8;
const cols = Math.max(...rows.map((r) => r.length));
const W = cols * cw;
const H = rows.length * ch;
const img = new PNG({ width: W * k, height: H * k });
// Grass background.
for (let i = 0; i < img.data.length; i += 4) {
  img.data[i] = 0x4f;
  img.data[i + 1] = 0x7a;
  img.data[i + 2] = 0x2e;
  img.data[i + 3] = 255;
}
function blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < k; i++) {
      const o = ((y * k + j) * W * k + x * k + i) * 4;
      // Premultiplied source over opaque destination.
      img.data[o] = Math.round(r + img.data[o]! * (1 - a));
      img.data[o + 1] = Math.round(g + img.data[o + 1]! * (1 - a));
      img.data[o + 2] = Math.round(b + img.data[o + 2]! * (1 - a));
    }
  }
}
rows.forEach((row, ry) => {
  row.forEach((key, rx) => {
    const ox = rx * cw + 4 + left;
    const oy = ry * ch + 4 + up;
    for (const [fk, team] of [[key, false], [`${key}#t`, true]] as const) {
      const f = meta.frames[fk];
      if (!f) continue;
      const pg = pages[f.p]!;
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) {
          const si = ((f.y + y) * pg.width + f.x + x) * 4;
          const a = pg.data[si + 3]! / 255;
          if (!a) continue;
          let [r, g, b] = [pg.data[si]!, pg.data[si + 1]!, pg.data[si + 2]!];
          // Atlases are straight alpha on disk; premultiply for the blend.
          if (team) [r, g, b] = [r * 0.25 * a, g * 0.37 * a, b * 0.62 * a];
          else [r, g, b] = [r * a, g * a, b * a];
          blend(ox - f.ax + x, oy - f.ay + y, r, g, b, a);
        }
      }
    }
    blend(ox, oy, 255, 40, 60, 1);
  });
});
writeFileSync(out, PNG.sync.write(img));
console.log(`${out}: ${rows.length} rows × ${cols} frames, ${W * k}×${H * k}px`);
