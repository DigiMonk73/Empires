/** Crop (and optionally upscale ×k, nearest) a PNG for review: node tools/crop.ts in.png out.png x y w h [k] */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [inp, out, xs, ys, ws, hs, ks] = process.argv.slice(2);
const src = PNG.sync.read(readFileSync(inp!));
const [x, y, w, h, k] = [Number(xs), Number(ys), Number(ws), Number(hs), Number(ks ?? 1)];
const dst = new PNG({ width: w * k, height: h * k });
for (let j = 0; j < h * k; j++) {
  for (let i = 0; i < w * k; i++) {
    const sx = Math.min(src.width - 1, x + Math.floor(i / k));
    const sy = Math.min(src.height - 1, y + Math.floor(j / k));
    const si = (sy * src.width + sx) * 4;
    const di = (j * w * k + i) * 4;
    for (let c = 0; c < 4; c++) dst.data[di + c] = src.data[si + c]!;
  }
}
writeFileSync(out!, PNG.sync.write(dst));
